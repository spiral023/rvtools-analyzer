import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { preloadImportedData, type PreloadProgress } from "@/lib/preloadImportedData";

export type ImportedDataPreloadRunner = typeof preloadImportedData;

type PreloadStatus = "idle" | "running" | "error";

const INITIAL_PROGRESS: PreloadProgress = {
  phase: "preparing",
  currentLabel: "Importierte Dateien werden ermittelt",
  completedSteps: 0,
  totalSteps: 0,
  processedRecords: 0,
  percent: 0,
};

export function useImportedDataPreload(preload: ImportedDataPreloadRunner = preloadImportedData) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const [status, setStatus] = useState<PreloadStatus>("idle");
  const [progress, setProgress] = useState<PreloadProgress>(INITIAL_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  // Spiegelt, ob der aktuelle Query-Cache-Stand vom letzten erfolgreichen Vorladen stammt –
  // steuert die grün/rot-Färbung des Vorlade-Icons. Wird bei jedem neuen Lauf (auch dem
  // automatisch nach einem Upload ausgelösten) zunächst zurückgesetzt.
  const [isPreloaded, setIsPreloaded] = useState(false);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("running");
    setError(null);
    setIsPreloaded(false);
    setProgress(INITIAL_PROGRESS);

    try {
      const result = await preload(queryClient, { onProgress: setProgress });
      toast.success(
        `${result.processedRecords.toLocaleString("de-DE")} Datensätze sind für bis zu eine Stunde vorgeladen.`,
      );
      setStatus("idle");
      setIsPreloaded(true);
    } catch (preloadError) {
      const message = preloadError instanceof Error ? preloadError.message : String(preloadError);
      setError(message);
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, [preload, queryClient]);

  const dismissError = useCallback(() => {
    if (runningRef.current) return;
    setError(null);
    setStatus("idle");
  }, []);

  return {
    status,
    progress,
    error,
    start,
    dismissError,
    isRunning: status === "running",
    isPreloaded,
  };
}
