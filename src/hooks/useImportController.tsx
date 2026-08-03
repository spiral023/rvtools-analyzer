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
import { unzipSync } from "fflate";
import { toast } from "sonner";
import {
  importMaintenanceWindowsTxt,
  importRvtoolsXlsx,
  type ImportProgress,
} from "@/domain/services/importService";
import { importUserDataBackupFile } from "@/domain/services/backupService";
import { hasImportedData, mergeAnalysisDataWithSysvPackages } from "@/data/db";
import {
  detectVropsTimeSeriesCsvFile,
  inferVropsTimeSeriesObjectTypeFromFileName,
} from "@/domain/services/vropsTimeSeriesParser";
import {
  importVropsTimeSeriesFileSet,
  type VropsTimeSeriesFileSet,
} from "@/domain/services/vropsTimeSeriesImportService";
import { parseRvtoolsExportFileName } from "@/lib/xlsx/parseHelpers";
import { discoverSysvPackages, type DiscoveredSysvPackage } from "@/lib/export/sysvDataPackageContainer";
import { validateAndMergeSysvPackages } from "@/domain/services/sysvPackageMergeService";
import { SysvPackageSelectionDialog } from "@/components/import/SysvPackageSelectionDialog";
import type { ImportFileKind, ImportResult, VropsTimeSeriesObjectType } from "@/domain/models/types";
import { isModeFileName, parseModeFile } from "@/lib/appMode";
import { useOptionalAppMode } from "@/hooks/useAppMode";
import { useFilterState } from "@/hooks/useFilterState";
import { isSysvScopeGlobalFilter } from "@/lib/sysvScope";

const VROPS_SLOT_LABEL: Record<VropsTimeSeriesObjectType, string> = { vm: "VM", cluster: "Cluster", host: "Host" };
export const SYSV_DATA_PACKAGE_IMPORTED_EVENT = "rvtools-analyzer:sysv-data-package-imported";

/** Zip-Einträge, die nie als eigenständige Importdatei behandelt werden sollen (Ordner, macOS-Metadaten, versteckte Dateien). */
function isIgnorableZipEntry(path: string): boolean {
  if (path.endsWith("/")) return true; // Verzeichniseintrag
  if (path.startsWith("__MACOSX/")) return true;
  const name = path.split("/").pop() ?? path;
  return name.length === 0 || name.startsWith(".");
}

/** Entpackt eine ZIP-Datei im Browser (fflate) in ihre enthaltenen Dateien; Ordnerstruktur wird verworfen. */
async function extractZipFile(file: File): Promise<File[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buffer);
  return Object.entries(entries)
    .filter(([path]) => !isIgnorableZipEntry(path))
    .map(([path, data]) => new File([data as BlobPart], path.split("/").pop() ?? path));
}

/**
 * Löst alle hochgeladenen ZIP-Archive in ihre enthaltenen Dateien auf (eine Ebene, keine
 * verschachtelten ZIPs) und reicht alle übrigen Dateien unverändert durch. Fehlgeschlagene oder
 * leere ZIPs werden separat gemeldet statt den restlichen Import stillschweigend zu blockieren.
 */
async function expandZipFiles(files: File[]): Promise<{ files: File[]; zipErrors: string[] }> {
  const expanded: File[] = [];
  const zipErrors: string[] = [];
  for (const file of files) {
    if (!file.name.toLocaleLowerCase("en-US").endsWith(".zip")) {
      expanded.push(file);
      continue;
    }
    try {
      const extracted = await extractZipFile(file);
      if (extracted.length === 0) zipErrors.push(`${file.name} (keine Dateien enthalten)`);
      else expanded.push(...extracted);
    } catch (error) {
      zipErrors.push(`${file.name} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return { files: expanded, zipErrors };
}

/**
 * Sortiert die regulär zu importierenden Dateien so, dass erkennbare RVTools-Exporte
 * (Dateiname-Muster `RVTools_export_all_...`) zuerst verarbeitet werden. Alle übrigen Dateien
 * behalten ihre relative Reihenfolge bei. vROps-Zeitreihen laufen unabhängig davon immer zuletzt
 * (siehe Aufrufer), da sie auf bereits importierte Cluster/Host-Namen angewiesen sind.
 */
function sortRvtoolsFirst(files: File[]): File[] {
  return files
    .map((file, index) => ({ file, index, isRvtools: parseRvtoolsExportFileName(file.name) !== null }))
    .sort((a, b) => (a.isRvtools === b.isRvtools ? a.index - b.index : a.isRvtools ? -1 : 1))
    .map((entry) => entry.file);
}

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
    name.endsWith(".json") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "text/csv" ||
    file.type === "application/json"
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
  if (kind === "sysv-data-package") return "SysV-Datenpaket";
  if (kind === "maintenance-windows") return "Wartungsfenster";
  if (kind === "user-data-backup") return "Userdaten-Backup";
  if (kind === "mode") return "Modusdatei";
  return "RVTools";
}

/** Prüft ausschließlich Ergebnisse des aktuellen Upload-Batches für eine SysV-Aktivierung. */
export function getSysvModeActivationError(
  batchResults: readonly ImportResult[],
  options?: { allowStandaloneModeFile?: boolean },
): string | null {
  if (options?.allowStandaloneModeFile && batchResults.length === 0) return null;

  const hasRvtools = batchResults.some((result) => result.fileKind === "rvtools" && result.success);
  const hasTechInfo = batchResults.some((result) => result.fileKind === "tech-info" && result.success);
  if (hasRvtools && hasTechInfo) return null;

  const hasRvtoolsAttempt = batchResults.some((result) => result.fileKind === "rvtools");
  const hasTechInfoAttempt = batchResults.some((result) => result.fileKind === "tech-info");
  const causes = [
    hasRvtools ? null : hasRvtoolsAttempt ? "RVTools-Import ist fehlgeschlagen" : "RVTools-Import fehlt",
    hasTechInfo ? null : hasTechInfoAttempt ? "Tech-Info Server-Import ist fehlgeschlagen" : "Tech-Info Server-Import fehlt",
  ].filter((cause): cause is string => Boolean(cause));
  return `SysV-Modus wurde nicht aktiviert: ${causes.join("; ")}.`;
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const appMode = useOptionalAppMode();
  const { filters, setFilters } = useFilterState();
  const runningRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<ImportQueueItem[]>([]);
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([]);
  const [importSuccessSignal, setImportSuccessSignal] = useState(0);
  const [packageSelection, setPackageSelection] = useState<DiscoveredSysvPackage[] | null>(null);
  const packageSelectionResolverRef = useRef<((packages: DiscoveredSysvPackage[]) => void) | null>(null);

  const resolvePackageSelection = useCallback((packages: DiscoveredSysvPackage[]) => {
    packageSelectionResolverRef.current?.(packages);
    packageSelectionResolverRef.current = null;
    setPackageSelection(null);
  }, []);

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

      const inputFiles = Array.from(input);
      let discoveredPackages: DiscoveredSysvPackage[] = [];
      try {
        discoveredPackages = await discoverSysvPackages(inputFiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`SysV-Container konnte nicht geprüft werden: ${message}`);
        setRejectedFileNames(inputFiles.map((file) => file.name));
        return;
      }

      if (discoveredPackages.length > 0) {
        const packageRootNames = new Set(discoveredPackages.map((item) => item.path.split("/")[0]));
        const hasMixedUpload = inputFiles.some((file) => {
          const isZip = file.name.toLocaleLowerCase("en-US").endsWith(".zip");
          return !isZip || !packageRootNames.has(file.name);
        });
        if (hasMixedUpload) {
          toast.error("SysV-Datenpakete dürfen nicht zusammen mit XLSX-, CSV-, TXT- oder anderen Importdateien hochgeladen werden.");
          setRejectedFileNames(inputFiles.map((file) => file.name));
          return;
        }

        runningRef.current = true;
        setImporting(true);
        let selectedPackages = discoveredPackages;
        if (discoveredPackages.length >= 2) {
          selectedPackages = await new Promise<DiscoveredSysvPackage[]>((resolve) => {
            packageSelectionResolverRef.current = resolve;
            setPackageSelection(discoveredPackages);
          });
        }
        if (selectedPackages.length === 0) {
          runningRef.current = false;
          setImporting(false);
          toast.info("SysV-Paketimport wurde abgebrochen.");
          return;
        }

        const packageItems = selectedPackages.map<ImportQueueItem>((item, index) => ({
          id: `${Date.now()}-sysv-package-${index}-${item.manifest.packageId}`,
          fileName: item.path,
          fileKind: "sysv-data-package",
          progress: null,
          result: null,
          status: "queued",
        }));
        setItems(packageItems);
        setRejectedFileNames([]);
        try {
          if (!appMode) throw new Error("Der App-Modus ist in diesem Kontext nicht verfügbar.");
          packageItems.forEach((item) => patchItem(item.id, {
            status: "running",
            progress: { step: "SysV-Datenpakete prüfen", percent: 5, detail: item.fileName },
          }));
          const merged = await validateAndMergeSysvPackages(selectedPackages);
          packageItems.forEach((item) => patchItem(item.id, {
            progress: { step: "Paketvereinigung validiert", percent: 55, detail: `${merged.payload.vms.length.toLocaleString("de-DE")} eindeutige VMs` },
          }));
          if (await hasImportedData()) {
            const confirmationMessage = "Die ausgewählten SysV-Datenpakete ersetzen die vorhandenen Analysedaten. Wartungsfenster, Szenarien, vCenter-Gruppen und lokale Einstellungen bleiben erhalten; Kapazitätsrichtlinien-Zuordnungen werden zurückgesetzt.";
            let confirmed = true;
            if (typeof window !== "undefined" && typeof window.confirm === "function") {
              try {
                confirmed = window.confirm(confirmationMessage);
              } catch {
                confirmed = false;
              }
            }
            if (!confirmed) {
              const result: ImportResult = {
                success: false,
                fileKind: "sysv-data-package",
                warnings: ["Import vom Benutzer abgebrochen; vorhandene Analysedaten wurden nicht verändert."],
                errors: [],
              };
              packageItems.forEach((item) => patchItem(item.id, {
                status: "warning",
                progress: { step: "Abgebrochen", percent: 100, detail: "Keine Daten verändert" },
                result,
              }));
              toast.info("SysV-Paketvereinigung wurde nicht importiert.");
              return;
            }
          }
          await mergeAnalysisDataWithSysvPackages(merged);
          setFilters({
            vcenterIds: [],
            clusters: [],
            hosts: [],
            datastores: [],
            search: "",
            globalFilter: null,
            vmNameList: "",
          });
          await appMode.saveLastSysvScope({ kind: "all" });
          await appMode.activateMode("sysv", { openSysvScopeDialog: false });
          await queryClient.invalidateQueries();
          const warnings = [
            ...selectedPackages.flatMap((item) => item.manifest.warnings.map((warning) => warning.message)),
            ...merged.warnings,
          ];
          const result: ImportResult = {
            success: true,
            fileKind: "sysv-data-package",
            warnings,
            errors: [],
          };
          packageItems.forEach((item) => patchItem(item.id, {
            status: warnings.length > 0 ? "warning" : "success",
            progress: { step: "Abgeschlossen", percent: 100, detail: `SysV-Modus · ${merged.payload.vms.length.toLocaleString("de-DE")} eindeutige VMs` },
            result,
          }));
          setImportSuccessSignal((n) => n + 1);
          toast.success(`${selectedPackages.length.toLocaleString("de-DE")} SysV-Paket${selectedPackages.length === 1 ? "" : "e"} erfolgreich als Vereinigung importiert.`);
          globalThis.dispatchEvent?.(new Event(SYSV_DATA_PACKAGE_IMPORTED_EVENT));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          packageItems.forEach((item) => patchItem(item.id, {
            status: "error",
            progress: { step: "Fehlgeschlagen", percent: 100, detail: message },
            result: { success: false, fileKind: "sysv-data-package", warnings: [], errors: [message] },
          }));
          toast.error(`SysV-Paketimport konnte nicht abgeschlossen werden: ${message}`);
        } finally {
          runningRef.current = false;
          setImporting(false);
        }
        return;
      }

      const { files: allFiles, zipErrors } = await expandZipFiles(inputFiles);
      if (zipErrors.length > 0) {
        toast.error(`ZIP-Datei konnte nicht entpackt werden: ${zipErrors.join(", ")}`);
      }

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

      // Modusdateien werden vor der generischen JSON-Backup-Erkennung ausgekoppelt.
      // Die Erkennung arbeitet absichtlich nur mit dem Basisdateinamen, damit ZIP-Unterordner egal sind.
      const modeFiles = validFiles.filter((file) => isModeFileName(file.name));
      const nonModeFiles = validFiles.filter((file) => !isModeFileName(file.name));
      const { fileSet: vropsFileSet, otherFiles: unorderedOtherFiles } = await classifyVropsTimeSeriesFiles(nonModeFiles);
      const otherFiles = sortRvtoolsFirst(unorderedOtherFiles);
      const isStandaloneModeUpload = modeFiles.length === 1 && otherFiles.length === 0 && !vropsFileSet;
      if (modeFiles.length === 0 && otherFiles.length === 0 && !vropsFileSet) return;

      const batchId = Date.now();
      const modeItems: ImportQueueItem[] = modeFiles.map((file, index) => ({
        id: `${batchId}-mode-${index}-${file.name}`,
        fileName: file.name,
        fileKind: "mode",
        progress: null as ImportProgress | null,
        result: null as ImportResult | null,
        status: "queued",
      }));
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

      setItems([...modeItems, ...queued, ...(vropsItem ? [vropsItem] : [])]);
      runningRef.current = true;
      setImporting(true);

      let anySuccess = false;
      const batchResults: ImportResult[] = [];
      let requestedMode: "sysv" | "vm-admin" | null = null;
      let requestedModeItem: ImportQueueItem | null = null;
      try {
        if (modeFiles.length > 1) {
          const message = "Mehrere modus.json-Dateien im selben Upload-Batch sind mehrdeutig.";
          for (const item of modeItems) {
            patchItem(item.id, {
              status: "error",
              result: { success: false, fileKind: "mode", warnings: [], errors: [message] },
            });
          }
          toast.error(message);
        } else if (modeFiles.length === 1 && modeItems[0]) {
          const modeFile = modeFiles[0];
          const item = modeItems[0];
          patchItem(item.id, {
            status: "running",
            progress: { step: "Modusdatei prüfen", percent: 20, detail: modeFile.name },
          });
          try {
            const definition = parseModeFile(await modeFile.text());
            requestedMode = definition.mode;
            requestedModeItem = item;
            patchItem(item.id, {
              progress: { step: "Warte auf Batch-Ergebnis", percent: 60, detail: definition.mode },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patchItem(item.id, {
              status: "error",
              result: { success: false, fileKind: "mode", warnings: [], errors: [message] },
            });
            toast.error(`Modusdatei „${modeFile.name}“ ist ungültig: ${message}`);
          }
        }

        for (let index = 0; index < otherFiles.length; index += 1) {
          const file = otherFiles[index];
          const item = queued[index];
          patchItem(item.id, {
            status: "running",
            progress: { step: "Vorbereitung", percent: 0, detail: file.name },
          });

          try {
            const lowerCaseFileName = file.name.toLocaleLowerCase("de-DE");
            const result = lowerCaseFileName.endsWith(".txt")
              ? await importMaintenanceWindowsTxt(file, (progress) => {
                patchItem(item.id, { progress });
              })
              : lowerCaseFileName.endsWith(".json")
                ? await importUserDataBackupFile(file).then<ImportResult>(() => ({ success: true, fileKind: "user-data-backup", warnings: [], errors: [] }))
                : await importRvtoolsXlsx(file, (progress) => {
                  patchItem(item.id, { progress });
                });
            batchResults.push(result);
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
        // Der Dialog soll nicht kurz einen älteren Tech-Info-Cache zeigen. Die
        // Abfrage wird daher vor seiner Öffnung einmal gezielt erneuert.
        if (requestedMode === "sysv") {
          await queryClient.refetchQueries({ queryKey: ["techInfoLatestAll"] });
        }

        if (requestedMode && requestedModeItem) {
          try {
            if (!appMode) {
              const message = "Der App-Modus ist in diesem Kontext nicht verfügbar.";
              patchItem(requestedModeItem.id, {
                status: "error",
                result: { success: false, fileKind: "mode", warnings: [], errors: [message] },
              });
              toast.error(message);
            } else if (requestedMode === "vm-admin") {
              await appMode.activateMode("vm-admin");
              if (isSysvScopeGlobalFilter(filters.globalFilter)) {
                setFilters({ globalFilter: null });
              }
              patchItem(requestedModeItem.id, {
                status: "success",
                progress: { step: "Abgeschlossen", percent: 100, detail: "VM-Admin-Modus" },
                result: { success: true, fileKind: "mode", warnings: [], errors: [] },
              });
              anySuccess = true;
              toast.success("VM-Admin-Modus wurde aktiviert.");
            } else {
              const activationError = getSysvModeActivationError(batchResults, {
                allowStandaloneModeFile: isStandaloneModeUpload,
              });

              if (!activationError) {
                await appMode.activateMode("sysv", { openSysvScopeDialog: true });
                patchItem(requestedModeItem.id, {
                  status: "success",
                  progress: { step: "Abgeschlossen", percent: 100, detail: "SysV-Modus" },
                  result: { success: true, fileKind: "mode", warnings: [], errors: [] },
                });
                anySuccess = true;
                toast.success(isStandaloneModeUpload
                  ? "SysV-Modus wurde aktiviert. Bitte wähle deinen persönlichen Systemkontext."
                  : "SysV-Modus wurde aktiviert. Bitte wähle optional deinen persönlichen Systemkontext.");
              } else {
                const message = activationError;
                patchItem(requestedModeItem.id, {
                  status: "error",
                  result: { success: false, fileKind: "mode", warnings: [], errors: [message] },
                });
                toast.error(message);
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patchItem(requestedModeItem.id, {
              status: "error",
              result: { success: false, fileKind: "mode", warnings: [], errors: [message] },
            });
            toast.error(`App-Modus konnte nicht aktiviert werden: ${message}`);
          }
        }

        if (anySuccess) setImportSuccessSignal((n) => n + 1);
      } finally {
        runningRef.current = false;
        setImporting(false);
      }
    },
    [appMode, filters.globalFilter, patchItem, queryClient, setFilters],
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

  return (
    <ImportContext.Provider value={value}>
      {children}
      <SysvPackageSelectionDialog
        open={packageSelection !== null}
        packages={packageSelection ?? []}
        onCancel={() => resolvePackageSelection([])}
        onConfirm={resolvePackageSelection}
      />
    </ImportContext.Provider>
  );
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
