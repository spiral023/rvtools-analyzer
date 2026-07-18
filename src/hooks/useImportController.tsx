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
  importRvtoolsXlsx,
  type ImportProgress,
} from "@/domain/services/importService";
import type { ImportFileKind, ImportResult } from "@/domain/models/types";

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
    file.type === "text/csv" ||
    file.type === "text/plain"
  );
}

export function fileKindLabel(kind?: ImportFileKind): string {
  if (kind === "tech-info") return "Tech-Info Server";
  if (kind === "tech-info-client") return "Tech-Info Client";
  if (kind === "cdp") return "CDP-Netzwerkdaten";
  if (kind === "ipam") return "IPAM-Netzwerkdaten";
  if (kind === "switch") return "Cisco-Switch-Daten";
  return "RVTools";
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<ImportQueueItem[]>([]);
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([]);

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

      const batchId = Date.now();
      const queued: ImportQueueItem[] = validFiles.map((file, index) => ({
        id: `${batchId}-${index}-${file.name}`,
        fileName: file.name,
        progress: null as ImportProgress | null,
        result: null as ImportResult | null,
        status: "queued",
      }));

      setItems(queued);
      runningRef.current = true;
      setImporting(true);

      try {
        for (let index = 0; index < validFiles.length; index += 1) {
          const file = validFiles[index];
          const item = queued[index];
          patchItem(item.id, {
            status: "running",
            progress: { step: "Vorbereitung", percent: 0, detail: file.name },
          });

          try {
            const result = await importRvtoolsXlsx(file, (progress) => {
              patchItem(item.id, { progress });
            });
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

        await queryClient.invalidateQueries();
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
    () => ({ importing, items, rejectedFileNames, importFiles, clearImportState }),
    [clearImportState, importFiles, importing, items, rejectedFileNames],
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
