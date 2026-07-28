import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  importMaintenanceWindowsTxt,
  importRvtoolsXlsx,
  type ImportProgress,
} from "@/domain/services/importService";
import {
  detectVropsTimeSeriesCsvFile,
  inferVropsTimeSeriesObjectTypeFromFileName,
} from "@/domain/services/vropsTimeSeriesParser";
import {
  importVropsTimeSeriesFileSet,
  type VropsTimeSeriesFileSet,
} from "@/domain/services/vropsTimeSeriesImportService";
import type { ImportFileKind, ImportResult, VropsTimeSeriesObjectType } from "@/domain/models/types";

const VROPS_SLOT_LABEL: Record<VropsTimeSeriesObjectType, string> = { vm: "VM", cluster: "Cluster", host: "Host" };

/**
 * Sortiert CSV-Dateien anhand des Dateinamens (Fallback: CSV-Header) in den vROps-Zeitreihen-
 * Dateisatz ein. Ein vollständiger Satz besteht aus je genau einer VM-, Cluster- und Host-CSV;
 * alles andere bleibt für die reguläre Weiterverarbeitung übrig. Ein erkannter, aber unvollständiger
 * oder mehrdeutiger Satz wird nicht stillschweigend an den RVTools-Import weitergereicht, sondern
 * per Toast gemeldet.
 */
async function classifyVropsTimeSeriesFiles(files: File[]): Promise<{ fileSet: VropsTimeSeriesFileSet | null; otherFiles: File[] }> {
  const classified = await Promise.all(files.map(async (file) => ({
    file,
    slot: file.name.toLocaleLowerCase("en-US").endsWith(".csv")
      ? inferVropsTimeSeriesObjectTypeFromFileName(file.name) ?? await detectVropsTimeSeriesCsvFile(file)
      : null,
  })));
  const bySlot = new Map<VropsTimeSeriesObjectType, File[]>();
  const otherFiles: File[] = [];
  for (const entry of classified) {
    if (!entry.slot) {
      otherFiles.push(entry.file);
      continue;
    }
    bySlot.set(entry.slot, [...(bySlot.get(entry.slot) ?? []), entry.file]);
  }
  if (bySlot.size === 0) return { fileSet: null, otherFiles };

  const missing = (["vm", "cluster", "host"] as const).filter((slot) => !bySlot.has(slot));
  const duplicated = [...bySlot.entries()].filter(([, list]) => list.length > 1);
  if (missing.length > 0 || duplicated.length > 0) {
    const problems = [
      missing.length > 0 ? `fehlend: ${missing.map((slot) => VROPS_SLOT_LABEL[slot]).join(", ")}` : "",
      duplicated.length > 0 ? `mehrfach: ${duplicated.map(([slot, list]) => `${VROPS_SLOT_LABEL[slot]} (${list.map((file) => file.name).join(", ")})`).join(" · ")}` : "",
    ].filter(Boolean).join(" · ");
    toast.error(`vROps-Zeitreihen-Dateisatz unvollständig (${problems}). Es wird genau eine VM-, Cluster- und Host-CSV benötigt.`);
    return { fileSet: null, otherFiles };
  }

  return {
    fileSet: { vm: bySlot.get("vm")![0], cluster: bySlot.get("cluster")![0], host: bySlot.get("host")![0] },
    otherFiles,
  };
}

export type ImportItemStatus = "queued" | "running" | "success" | "warning" | "error";

export interface ImportQueueItem {
  id: string;
  fileName: string;
  fileKind?: ImportFileKind;
  progress: ImportProgress | null;
  result: ImportResult | null;
  status: ImportItemStatus;
}

interface ImportContextValue {
  importing: boolean;
  items: ImportQueueItem[];
  rejectedFileNames: string[];
  importFiles: (files: FileList | File[]) => Promise<void>;
  clearImportState: () => void;
  /** Zählt hoch, sobald ein Import-Batch mindestens eine erfolgreich importierte Datei enthielt. */
  importSuccessSignal: number;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function isSupportedImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    name.endsWith(".txt") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "text/csv"
  );
}

export function fileKindLabel(kind?: ImportFileKind): string {
  if (kind === "tech-info") return "Tech-Info Server";
  if (kind === "tech-info-client") return "Tech-Info Client";
  if (kind === "cdp") return "CDP-Netzwerkdaten";
  if (kind === "ipam") return "IPAM-Netzwerkdaten";
  if (kind === "eramon-iface") return "Eramon Switch-Ports";
  if (kind === "eramon-l2") return "Eramon MAC-Tabelle";
  if (kind === "vrops") return "vROps-Kapazitätsmetriken";
  if (kind === "vrops-timeseries") return "vROps-Zeitreihen";
  if (kind === "maintenance-windows") return "Wartungsfenster";
  return "RVTools";
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<ImportQueueItem[]>([]);
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([]);
  const [importSuccessSignal, setImportSuccessSignal] = useState(0);

  const patchItem = useCallback((id: string, patch: Partial<ImportQueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const importFiles = useCallback(
    async (input: FileList | File[]) => {
      if (runningRef.current) {
        toast.warning("Ein Import läuft bereits.");
        return;
      }

      const allFiles = Array.from(input);
      const validFiles: File[] = [];
      const rejected: string[] = [];
      for (const file of allFiles) {
        if (isSupportedImportFile(file)) validFiles.push(file);
        else rejected.push(file.name);
      }
      setRejectedFileNames(rejected);

      if (rejected.length > 0) {
        toast.error(`Nicht unterstützte Dateien: ${rejected.join(", ")}`);
      }
      if (validFiles.length === 0) return;

      const { fileSet: vropsFileSet, otherFiles } = await classifyVropsTimeSeriesFiles(validFiles);
      if (otherFiles.length === 0 && !vropsFileSet) return;

      const batchId = Date.now();
      const queued: ImportQueueItem[] = otherFiles.map((file, index) => ({
        id: `${batchId}-${index}-${file.name}`,
        fileName: file.name,
        progress: null as ImportProgress | null,
        result: null as ImportResult | null,
        status: "queued",
      }));
      const vropsItem: ImportQueueItem | null = vropsFileSet ? {
        id: `${batchId}-vrops-timeseries`,
        fileName: `${vropsFileSet.vm.name} · ${vropsFileSet.cluster.name} · ${vropsFileSet.host.name}`,
        fileKind: "vrops-timeseries",
        progress: null,
        result: null,
        status: "queued",
      } : null;

      setItems(vropsItem ? [...queued, vropsItem] : queued);
      runningRef.current = true;
      setImporting(true);

      let anySuccess = false;
      try {
        for (let index = 0; index < otherFiles.length; index += 1) {
          const file = otherFiles[index];
          const item = queued[index];
          patchItem(item.id, {
            status: "running",
            progress: { step: "Vorbereitung", percent: 0, detail: file.name },
          });

          try {
            const result = await (file.name.toLocaleLowerCase("de-DE").endsWith(".txt")
              ? importMaintenanceWindowsTxt(file, (progress) => {
                patchItem(item.id, { progress });
              })
              : importRvtoolsXlsx(file, (progress) => {
                patchItem(item.id, { progress });
              }));
            const status: ImportItemStatus = result.success
              ? result.warnings.length > 0
                ? "warning"
                : "success"
              : "error";
            patchItem(item.id, {
              result,
              fileKind: result.fileKind,
              status,
            });

            if (result.success) {
              anySuccess = true;
              toast.success(
                `„${file.name}“ (${fileKindLabel(result.fileKind)}) erfolgreich importiert.`,
              );
            } else {
              toast.error(
                `Import von „${file.name}“ fehlgeschlagen: ${result.errors.join(", ")}`,
              );
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patchItem(item.id, {
              status: "error",
              result: { success: false, warnings: [], errors: [message] },
            });
            toast.error(`Import von „${file.name}“ fehlgeschlagen: ${message}`);
          }
        }

        if (vropsFileSet && vropsItem) {
          patchItem(vropsItem.id, {
            status: "running",
            progress: { step: "Vorbereitung", percent: 0, detail: vropsItem.fileName },
          });
          try {
            const result = await importVropsTimeSeriesFileSet(vropsFileSet, (progress) => {
              patchItem(vropsItem.id, { progress });
            });
            const status: ImportItemStatus = result.success
              ? result.warnings.length > 0 ? "warning" : "success"
              : "error";
            patchItem(vropsItem.id, {
              result: { success: result.success, fileKind: "vrops-timeseries", warnings: result.warnings, errors: result.errors },
              fileKind: "vrops-timeseries",
              status,
            });

            if (result.success) {
              anySuccess = true;
              const summary = result.qualitySummary;
              const detail = summary
                ? ` (${summary.expectedSlots.toLocaleString("de-DE")} Stunden · ${summary.objectCountByType.vm.toLocaleString("de-DE")} VMs · ${summary.objectCountByType.cluster.toLocaleString("de-DE")} Cluster · ${summary.objectCountByType.host.toLocaleString("de-DE")} Hosts)`
                : "";
              toast.success(`vROps-Zeitreihen erfolgreich importiert${detail}.`);
            } else {
              toast.error(`vROps-Zeitreihen-Import fehlgeschlagen: ${result.errors.join(", ")}`);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patchItem(vropsItem.id, {
              status: "error",
              result: { success: false, fileKind: "vrops-timeseries", warnings: [], errors: [message] },
            });
            toast.error(`vROps-Zeitreihen-Import fehlgeschlagen: ${message}`);
          }
        }

        await queryClient.invalidateQueries();
        if (anySuccess) setImportSuccessSignal((n) => n + 1);
      } finally {
        runningRef.current = false;
        setImporting(false);
      }
    },
    [patchItem, queryClient],
  );

  const clearImportState = useCallback(() => {
    if (runningRef.current) return;
    setItems([]);
    setRejectedFileNames([]);
  }, []);

  const value = useMemo(
    () => ({ importing, items, rejectedFileNames, importFiles, clearImportState, importSuccessSignal }),
    [clearImportState, importFiles, importing, items, rejectedFileNames, importSuccessSignal],
  );

  return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
}

export function useImportController(): ImportContextValue {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error("useImportController must be used within an ImportProvider");
  }
  return context;
}

/** Wie useImportController, aber liefert null außerhalb eines ImportProvider statt zu werfen. */
export function useOptionalImportController(): ImportContextValue | null {
  return useContext(ImportContext);
}
