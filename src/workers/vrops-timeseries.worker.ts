import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";
import type { VropsTimeSeriesWorkerResult } from "@/domain/models/types";

interface ParseTimeSeriesFilesMessage {
  type: "PARSE_VROPS_TIMESERIES_FILES";
  payload: { buffers: ArrayBuffer[] };
}

self.onmessage = (event: MessageEvent<ParseTimeSeriesFilesMessage>) => {
  try {
    if (event.data.type !== "PARSE_VROPS_TIMESERIES_FILES") return;
    const decoder = new TextDecoder("utf-8");
    const payload: VropsTimeSeriesWorkerResult = {
      parsedFiles: event.data.payload.buffers.map((buffer) => parseVropsTimeSeriesCsv(decoder.decode(buffer))),
    };
    self.postMessage({ type: "VROPS_TIMESERIES_PARSE_COMPLETE", payload });
  } catch (error) {
    self.postMessage({
      type: "VROPS_TIMESERIES_PARSE_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};
