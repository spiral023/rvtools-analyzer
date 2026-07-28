import type { BuildFillUpPlanningResultsInput, FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";

/** Führt die aufwendige Zeitreihen- und Szenarioauswertung außerhalb des React-Threads aus. */
export function buildFillUpPlanningResultsInWorker(
  input: BuildFillUpPlanningResultsInput,
  signal?: AbortSignal,
): Promise<FillUpPlanningClusterResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/fill-up-planning.worker.ts", import.meta.url), { type: "module" });
    const abort = () => {
      worker.terminate();
      reject(new DOMException("Fill-Up-Auswertung abgebrochen.", "AbortError"));
    };
    worker.onmessage = (event) => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      if (event.data.type === "FILL_UP_PLANNING_ERROR") reject(new Error(event.data.payload));
      else resolve(event.data.payload as FillUpPlanningClusterResult[]);
    };
    worker.onerror = (event) => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      reject(event.error ?? new Error(event.message));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ type: "BUILD_FILL_UP_PLANNING", payload: input });
  });
}
