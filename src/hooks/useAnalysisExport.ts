import { useCallback, useState } from "react";
import { zip, strToU8 } from "fflate";
import {
  getAllTechInfoLatest,
  getBySnapshotIds,
  getUiState,
  getVropsTimeSeriesChunks,
  getVropsTimeSeriesImports,
  getVropsTimeSeriesObjects,
  putUiState,
} from "@/data/db";
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
} from "@/domain/models/types";
import { buildVmWorkloadProfiles } from "@/domain/services/vmWorkloadProfileService";
import { buildVmRightsizingCandidates } from "@/domain/services/vmRightsizingService";
import { buildAnalysisExportFiles, type AnalysisExportFile } from "@/lib/export/analysisExport";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";

const UI_STATE_ID = "analysis-export";

export interface AnalysisExportOptions {
  includeSeries: boolean;
  pseudonymize: boolean;
}

export interface AnalysisExportResult {
  fileName: string;
  sizeBytes: number;
  fileCount: number;
  vmCount: number;
  seriesFileCount: number;
}

/**
 * Liest den einmal erzeugten Salt oder legt ihn an.
 *
 * Er muss über alle Exporte hinweg konstant bleiben: Nur dann liefert dieselbe
 * VM in zwei aufeinanderfolgenden Exporten dasselbe Kürzel, was Voraussetzung
 * für jeden Vorher/Nachher-Vergleich ist.
 */
async function getOrCreatePseudonymSalt(): Promise<string> {
  const existing = await getUiState(UI_STATE_ID);
  if (existing?.analysisExportPseudonymSalt) return existing.analysisExportPseudonymSalt;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const salt = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await putUiState({
    ...(existing ?? { id: UI_STATE_ID, theme: "dark" as const }),
    id: UI_STATE_ID,
    analysisExportPseudonymSalt: salt,
  });
  return salt;
}

function zipFiles(files: readonly AnalysisExportFile[]): Promise<Uint8Array> {
  const payload = Object.fromEntries(files.map((file) => [file.path, strToU8(file.content)]));
  return new Promise((resolve, reject) => {
    // Asynchron statt `zipSync`: Der Deflate-Lauf über mehrere zehn MB Zeitreihen
    // würde den Haupt-Thread sonst sichtbar blockieren.
    zip(payload, { level: 9 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function downloadZip(data: Uint8Array, fileName: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Erzeugt den speicheroptimierten Analyse-Export als ZIP.
 *
 * Bewusst nicht an den Sitzungsfilter gebunden: Der Zeitreihenimport bringt
 * seine eigenen, eingefrorenen Snapshot-IDs mit — analog zu den VM-Profilen.
 */
export function useAnalysisExport() {
  const { level: rightsizingLevel } = useCpuRightsizingLevel();
  const [isExporting, setIsExporting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const exportData = useCallback(async (options: AnalysisExportOptions): Promise<AnalysisExportResult> => {
    setIsExporting(true);
    try {
      setProgressLabel("Lade Zeitreihenimport…");
      const imports = await getVropsTimeSeriesImports();
      const timeSeriesImport = imports[0] ?? null;
      if (!timeSeriesImport) {
        throw new Error("Es ist kein vROps-Zeitreihenimport vorhanden.");
      }

      setProgressLabel("Lade Inventar und Messwerte…");
      const [objects, chunks, vms, hosts, clusters, techInfo, salt] = await Promise.all([
        getVropsTimeSeriesObjects(timeSeriesImport.id),
        getVropsTimeSeriesChunks(timeSeriesImport.id),
        getBySnapshotIds<NormalizedVm>("entities_vm", timeSeriesImport.rvtoolsSnapshotIds),
        getBySnapshotIds<NormalizedHost>("entities_host", timeSeriesImport.rvtoolsSnapshotIds),
        getBySnapshotIds<NormalizedCluster>("entities_cluster", timeSeriesImport.rvtoolsSnapshotIds),
        getAllTechInfoLatest(),
        getOrCreatePseudonymSalt(),
      ]);

      setProgressLabel("Berechne Profile und Rightsizing…");
      const profiles = buildVmWorkloadProfiles({ import: timeSeriesImport, objects, chunks, vms, hosts });
      const candidates = buildVmRightsizingCandidates({ profiles, hosts, level: rightsizingLevel });

      setProgressLabel("Schreibe Exportdateien…");
      const files = buildAnalysisExportFiles({
        vms,
        hosts,
        clusters,
        techInfo,
        timeSeriesImport,
        objects,
        chunks,
        profiles,
        candidates,
        rightsizingLevel,
        includeSeries: options.includeSeries,
        pseudonymize: options.pseudonymize,
        pseudonymSalt: salt,
        generatedAt: new Date().toISOString(),
        appVersion: `${__APP_VERSION__} (${__BUILD_TIME__})`,
      });

      setProgressLabel("Komprimiere…");
      const archive = await zipFiles(files);
      const fileName = `rvtools-analyse_${new Date().toISOString().slice(0, 10)}.zip`;
      downloadZip(archive, fileName);

      return {
        fileName,
        sizeBytes: archive.byteLength,
        fileCount: files.length,
        vmCount: vms.length,
        seriesFileCount: files.filter((file) => file.path.startsWith("series/")).length,
      };
    } finally {
      setIsExporting(false);
      setProgressLabel(null);
    }
  }, [rightsizingLevel]);

  return { exportData, isExporting, progressLabel };
}
