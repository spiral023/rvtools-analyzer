import type { SysvBatchReport } from "@/domain/models/types";
import type { SysvBatchExportRequest, SysvBatchProgress } from "@/domain/services/sysvBatchExportService";

/** Führt das Lesen, Filtern, Serialisieren und Komprimieren großer Batch-Exports außerhalb des React-Threads aus. */
export function buildSysvDataPackageBatchInWorker(
  request: SysvBatchExportRequest,
  onProgress?: (progress: SysvBatchProgress) => void,
  signal?: AbortSignal,
): Promise<{ zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/sysv-batch-export.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(new DOMException("Batch-Export wurde abgebrochen.", "AbortError")));

    worker.onmessage = (event: MessageEvent<{
      type: "SYSV_BATCH_PROGRESS" | "SYSV_BATCH_COMPLETE" | "SYSV_BATCH_ERROR";
      payload: SysvBatchProgress | { zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport } | string;
    }>) => {
      if (event.data.type === "SYSV_BATCH_PROGRESS") {
        onProgress?.(event.data.payload as SysvBatchProgress);
      } else if (event.data.type === "SYSV_BATCH_COMPLETE") {
        finish(() => resolve(event.data.payload as { zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport }));
      } else {
        const detail = typeof event.data.payload === "string" && event.data.payload.trim()
          ? event.data.payload
          : "Der Hintergrund-Worker lieferte keinen Fehlertext.";
        finish(() => reject(new Error(detail)));
      }
    };
    worker.onerror = (event) => {
      const detail = event.message?.trim() || (event.error instanceof Error && event.error.message.trim()) || "Keine Browserdetails verfügbar.";
      finish(() => reject(new Error(`Batch-Worker konnte nicht gestartet oder ausgeführt werden: ${detail}`)));
    };
    worker.onmessageerror = () => finish(() => reject(new Error("Batch-Worker konnte das Ergebnis nicht an die Oberfläche übertragen.")));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ type: "BUILD_SYSV_BATCH", payload: request });
  });
}
