import type { BuildFillUpPlanningResultsInput, FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";

/** Führt die aufwendige Zeitreihen- und Szenarioauswertung außerhalb des React-Threads aus. */
export function buildFillUpPlanningResultsInWorker(
  input: BuildFillUpPlanningResultsInput,
  signal?: AbortSignal,
): Promise<FillUpPlanningClusterResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/fill-up-planning.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      finish(() => reject(new DOMException("Fill-Up-Auswertung abgebrochen.", "AbortError")));
    };
    worker.onmessage = (event) => {
      if (event.data.type === "FILL_UP_PLANNING_ERROR") {
        const detail = typeof event.data.payload === "string" && event.data.payload.trim() ? event.data.payload : "Der Worker lieferte keinen Fehlertext.";
        finish(() => reject(new Error(`Fill-Up-Worker konnte die Auswertung nicht abschließen: ${detail}`)));
      } else if (event.data.type === "FILL_UP_PLANNING_COMPLETE") {
        finish(() => resolve(event.data.payload as FillUpPlanningClusterResult[]));
      } else {
        finish(() => reject(new Error("Fill-Up-Worker lieferte eine unbekannte Antwort.")));
      }
    };
    worker.onerror = (event) => {
      const detail = event.message?.trim() || (event.error instanceof Error && event.error.message.trim()) || "Keine Browserdetails verfügbar.";
      finish(() => reject(new Error(`Fill-Up-Worker konnte nicht gestartet oder ausgeführt werden: ${detail}`)));
    };
    worker.onmessageerror = () => finish(() => reject(new Error("Fill-Up-Worker konnte die Ergebnisdaten nicht an die Oberfläche übertragen.")));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    try {
      worker.postMessage({ type: "BUILD_FILL_UP_PLANNING", payload: input }, collectChunkBuffers(input));
    } catch (error) {
      const detail = error instanceof Error && error.message.trim() ? error.message : "Die Importdaten konnten nicht für den Worker kopiert werden.";
      finish(() => reject(new Error(`Fill-Up-Worker konnte nicht vorbereitet werden: ${detail}`)));
    }
  });
}

/** IndexedDB liefert neue ArrayBuffer-Instanzen; sie können ohne Kopie an den Worker übergeben werden. */
function collectChunkBuffers(input: BuildFillUpPlanningResultsInput): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const chunk of input.chunks) {
    for (const buffer of Object.values(chunk.metricValues)) {
      if (buffer instanceof ArrayBuffer) buffers.add(buffer);
    }
    if (chunk.maintenanceCodes instanceof ArrayBuffer) buffers.add(chunk.maintenanceCodes);
    if (chunk.maintenanceDerived instanceof ArrayBuffer) buffers.add(chunk.maintenanceDerived);
  }
  return [...buffers];
}
