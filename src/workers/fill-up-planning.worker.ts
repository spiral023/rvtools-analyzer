import type { BuildFillUpPlanningResultsInput } from "@/domain/services/fillUpPlanningService";
import { buildFillUpPlanningResults } from "@/domain/services/fillUpPlanningService";

interface BuildFillUpPlanningMessage {
  type: "BUILD_FILL_UP_PLANNING";
  payload: BuildFillUpPlanningResultsInput;
}

self.onmessage = (event: MessageEvent<BuildFillUpPlanningMessage>) => {
  if (event.data.type !== "BUILD_FILL_UP_PLANNING") return;
  try {
    self.postMessage({
      type: "FILL_UP_PLANNING_COMPLETE",
      payload: buildFillUpPlanningResults(event.data.payload),
    });
  } catch (error) {
    self.postMessage({
      type: "FILL_UP_PLANNING_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};
