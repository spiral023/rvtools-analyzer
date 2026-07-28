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
    const parsedFiles = event.data.payload.buffers.map((buffer, fileIndex) => {
      const fileLabel = ["VM", "Cluster", "Host"][fileIndex] ?? "CSV";
      self.postMessage({ type: "VROPS_TIMESERIES_PARSE_PROGRESS", payload: { fileIndex, fileLabel, processedRows: 0, totalRows: 0 } });
      return parseVropsTimeSeriesCsv(decoder.decode(buffer), {
        onProgress: (processedRows, totalRows) => self.postMessage({ type: "VROPS_TIMESERIES_PARSE_PROGRESS", payload: { fileIndex, fileLabel, processedRows, totalRows } }),
      });
    });
    const payload: VropsTimeSeriesWorkerResult = { parsedFiles };
    self.postMessage({ type: "VROPS_TIMESERIES_PARSE_COMPLETE", payload });
  } catch (error) {
    self.postMessage({
      type: "VROPS_TIMESERIES_PARSE_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};
