import type { BuildFillUpPlanningResultsInput } from "@/domain/services/fillUpPlanningService";
import { buildFillUpPlanningResults, type FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";

interface BuildFillUpPlanningMessage {
  type: "BUILD_FILL_UP_PLANNING";
  payload: BuildFillUpPlanningResultsInput;
}

self.onmessage = (event: MessageEvent<BuildFillUpPlanningMessage>) => {
  if (event.data.type !== "BUILD_FILL_UP_PLANNING") return;
  try {
    self.postMessage({
      type: "FILL_UP_PLANNING_COMPLETE",
      payload: buildFillUpPlanningResults(event.data.payload).map(compactResultForUi),
    });
  } catch (error) {
    self.postMessage({
      type: "FILL_UP_PLANNING_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Die UI benötigt Status, Empfehlungen und Chartwerte – keine tausendfachen Objektlisten pro Szenario. */
function compactResultForUi(result: FillUpPlanningClusterResult): FillUpPlanningClusterResult {
  const compactScenario = (scenario: FillUpPlanningClusterResult["capacity"]["normal"] | null) => scenario && ({
    ...scenario,
    findings: scenario.findings.map((finding) => ({ ...finding, affectedObjectKeys: [] as string[] })),
    placement: { ...scenario.placement, unplacedVmKeys: [] as string[], oversizedVmKeys: [] as string[] },
  });
  return {
    ...result,
    capacity: {
      ...result.capacity,
      normal: compactScenario(result.capacity.normal)!,
      n1: compactScenario(result.capacity.n1),
      n2: compactScenario(result.capacity.n2),
      siteFailover: result.capacity.siteFailover.map((scenario) => compactScenario(scenario)!),
    },
    quality: {
      ...result.quality,
      findings: result.quality.findings.map((finding) => ({ ...finding, affectedObjectKeys: [] as string[] })),
      metricCoverage: [],
    },
  };
}
