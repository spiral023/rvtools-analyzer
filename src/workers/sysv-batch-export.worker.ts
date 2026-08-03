import {
  buildSysvDataPackageBatch,
  type SysvBatchExportRequest,
  type SysvBatchProgress,
} from "@/domain/services/sysvBatchExportService";

interface BuildBatchMessage {
  type: "BUILD_SYSV_BATCH";
  payload: SysvBatchExportRequest;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BuildBatchMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event: MessageEvent<BuildBatchMessage>) => {
  if (event.data.type !== "BUILD_SYSV_BATCH") return;
  void buildBatch(event.data.payload);
};

async function buildBatch(request: SysvBatchExportRequest): Promise<void> {
  try {
    const result = await buildSysvDataPackageBatch(request, {
      onProgress: (progress: SysvBatchProgress) => workerScope.postMessage({ type: "SYSV_BATCH_PROGRESS", payload: progress }),
    });
    // Der fertige ZIP-Puffer ist groß. Der Transfer vermeidet eine zweite Kopie im UI-Thread.
    workerScope.postMessage({ type: "SYSV_BATCH_COMPLETE", payload: result }, [result.zipBytes.buffer as ArrayBuffer]);
  } catch (error) {
    workerScope.postMessage({
      type: "SYSV_BATCH_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}
