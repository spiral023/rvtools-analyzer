/**
 * Message-Schale des vROps-Zeitreihen-Workers.
 *
 * Der Worker bekommt die `File`-Objekte selbst — Blobs werden beim structured
 * clone als Referenz übergeben, der Inhalt also nie vollständig in den Heap
 * geladen. Zurück gehen ausschliesslich kompakte Strukturen; die Float32-Felder
 * werden per Transfer-Liste übergeben und damit nicht kopiert.
 *
 * Die Fachlogik liegt in `vropsTimeSeriesWorkerPayload`, damit sie ohne
 * Worker-Umgebung testbar bleibt.
 */
import {
  buildVropsTimeSeriesWorkerPayload,
  collectVropsTimeSeriesTransferables,
} from "@/domain/services/vropsTimeSeriesWorkerPayload";
import type { VropsTimeSeriesObjectType } from "@/domain/models/types";

export type {
  VropsTimeSeriesWorkerPayload,
} from "@/domain/services/vropsTimeSeriesWorkerPayload";

interface ParseTimeSeriesFilesMessage {
  type: "PARSE_VROPS_TIMESERIES_FILES";
  payload: { files: Record<VropsTimeSeriesObjectType, File> };
}

/**
 * `self` ist im Worker-Scope. Die DOM-Typen des Projekts kennen `postMessage`
 * nur in der Window-Signatur, daher dieser minimale Strukturtyp mit
 * Transfer-Liste.
 */
const workerScope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

self.onmessage = async (event: MessageEvent<ParseTimeSeriesFilesMessage>) => {
  try {
    if (event.data.type !== "PARSE_VROPS_TIMESERIES_FILES") return;

    const payload = await buildVropsTimeSeriesWorkerPayload(
      event.data.payload.files,
      (progress) => workerScope.postMessage({ type: "VROPS_TIMESERIES_PARSE_PROGRESS", payload: progress }),
    );

    // Erst nach dem Zusammenbau transferieren: die Summaries wurden aus
    // denselben Feldern berechnet und wären danach nicht mehr lesbar.
    workerScope.postMessage(
      { type: "VROPS_TIMESERIES_PARSE_COMPLETE", payload },
      collectVropsTimeSeriesTransferables(payload.chunks),
    );
  } catch (error) {
    workerScope.postMessage({
      type: "VROPS_TIMESERIES_PARSE_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};
