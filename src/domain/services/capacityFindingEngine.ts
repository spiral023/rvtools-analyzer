import type {
  CapacityFinding,
  CapacityMetricObservation,
  CapacityPolicy,
  VropsTimeSeriesConfidenceLevel,
} from "@/domain/models/types";
import { getCapacityStatus } from "@/domain/services/capacityPolicyService";

/**
 * Übersetzt fachlich bereits ermittelte Messwerte in einheitliche Policy-Findings.
 * Die Engine kennt weder IndexedDB noch React und kann deshalb von Fill-Up,
 * Cluster-Review und späteren Szenarien identisch verwendet werden.
 */
export function evaluateCapacityFindings(
  policy: CapacityPolicy,
  observations: readonly CapacityMetricObservation[],
  confidence: VropsTimeSeriesConfidenceLevel,
): CapacityFinding[] {
  return observations.map((observation) => ({
    id: `${policy.id}:v${policy.version}:${observation.scenario}:${observation.key}`,
    status: getCapacityStatus(observation.value, observation.threshold),
    title: observation.label,
    metricKey: observation.key,
    actualValue: observation.value,
    threshold: observation.threshold,
    scenario: observation.scenario,
    dataSource: observation.dataSource,
    affectedObjectKeys: [...new Set(observation.affectedObjectKeys)],
    confidence,
    policyId: policy.id,
    policyVersion: policy.version,
  }));
}

export function hasBlockingCapacityFinding(findings: readonly CapacityFinding[]): boolean {
  return findings.some((finding) => finding.status === "red" || finding.status === "unknown" || finding.confidence === "not-computable");
}
