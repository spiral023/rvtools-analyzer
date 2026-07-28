import type {
  SnapshotMeta,
  VropsClusterDemandComparison,
  VropsDataQualityFinding,
  VropsDataQualityReport,
  VropsRelationshipIssue,
  VropsTimeSeriesChunk,
  VropsTimeSeriesConfidenceLevel,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesMetricCoverage,
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { readVropsTimeSeriesMetric } from "@/domain/services/vropsTimeSeriesSeriesReader";

const HOUR_MS = 60 * 60 * 1000;
const REQUIRED_HOST_CAPACITY_METRICS: readonly VropsTimeSeriesMetricKey[] = [
  "hostCpuCapacityAvailableLastMHz",
  "hostMemoryCapacityAvailableLastMiB",
];
const OPTIONAL_HOST_DIAGNOSTIC_METRICS: readonly VropsTimeSeriesMetricKey[] = [
  "hostCpuDemandAvgMHz",
  "hostCpuDemandMaxMHz",
  "hostCpuUsageAvgMHz",
  "hostCpuUsageMaxMHz",
  "hostMemoryUtilizationAvgMiB",
  "hostMemoryUtilizationMaxMiB",
  "hostCpuContentionAvgPct",
  "hostCpuContentionMaxPct",
];

export const VROPS_DATA_QUALITY_DEFAULTS = {
  minimumVmCoverageForClusterComparison: 0.95,
  maximumClusterDemandRelativeDifference: 0.25,
  rvtoolsTimeDistanceWarningMs: 48 * HOUR_MS,
  rvtoolsTimeDistanceBlockingMs: 7 * 24 * HOUR_MS,
} as const;

export interface EvaluateVropsDataQualityInput {
  import: VropsTimeSeriesImport;
  objects: readonly VropsTimeSeriesImportedObject[];
  summaries: readonly VropsTimeSeriesSummary[];
  chunks: readonly VropsTimeSeriesChunk[];
  snapshots: readonly Pick<SnapshotMeta, "snapshotId" | "exportTs">[];
  relationshipIssues?: readonly VropsRelationshipIssue[];
  options?: Partial<typeof VROPS_DATA_QUALITY_DEFAULTS>;
}

/**
 * Bewertet einen bereits gespeicherten Import ohne React- oder IndexedDB-Zugriff.
 * Die Ergebnisse enthalten bewusst keine Kapazitätsentscheidung: Phase 4/5 nutzt
 * sie später als Vertrauens- und Sperrsignal.
 */
export function evaluateVropsDataQuality(input: EvaluateVropsDataQualityInput): VropsDataQualityReport {
  const options = { ...VROPS_DATA_QUALITY_DEFAULTS, ...input.options };
  const findings: VropsDataQualityFinding[] = [];
  const metricCoverage = buildMetricCoverage(input.summaries);
  const coverageByObjectAndMetric = new Map(metricCoverage.map((coverage) => [`${coverage.objectKey}\u0000${coverage.metric}`, coverage]));
  const relationshipIssues = input.relationshipIssues ?? input.import.relationshipIssues ?? [];

  for (const issue of relationshipIssues) {
    findings.push({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      affectedObjectKeys: issue.objectKey ? [issue.objectKey] : [],
      details: issue.details,
    });
  }
  for (const object of input.objects) {
    if (object.matchStatus !== "matched" && !relationshipIssues.some((issue) => issue.objectKey === object.objectKey)) {
      findings.push({
        code: "unmatched-object",
        severity: "blocking",
        message: `„${object.vropsName}“ ist nicht eindeutig mit RVTools verknüpft.`,
        affectedObjectKeys: [object.objectKey],
      });
    }
    if (object.objectType === "vm" && object.matchStatus === "matched") {
      if (!object.clusterKey || !object.hostKey) {
        findings.push({
          code: "missing-vm-relationship",
          severity: "blocking",
          message: `VM „${object.vropsName}“ hat keine vollständige Cluster-/Host-Beziehung.`,
          affectedObjectKeys: [object.objectKey],
        });
      }
      if (object.workloadClass === "unknown") {
        findings.push({
          code: "unknown-resource-pool",
          severity: "blocking",
          message: `VM „${object.vropsName}“ ist keinem HIGH- oder STD-Resource-Pool zugeordnet.`,
          affectedObjectKeys: [object.objectKey],
        });
      }
    }
    if (object.objectType === "host" && object.matchStatus === "matched") {
      if (!object.siteId && !relationshipIssues.some((issue) => issue.objectKey === object.objectKey && issue.code === "unknown-site")) {
        findings.push({
          code: "unknown-site",
          severity: "blocking",
          message: `Für Host „${object.vropsName}“ fehlt die Site-Zuordnung.`,
          affectedObjectKeys: [object.objectKey],
        });
      }
      for (const metric of REQUIRED_HOST_CAPACITY_METRICS) {
        const coverage = coverageByObjectAndMetric.get(`${object.objectKey}\u0000${metric}`);
        if (!coverage || coverage.presentSlots < coverage.expectedSlots) {
          findings.push({
            code: "missing-required-capacity",
            severity: "blocking",
            message: `Host „${object.vropsName}“ hat keine vollständige Pflichtkapazität für „${metric}“.`,
            affectedObjectKeys: [object.objectKey],
            metric,
            details: coverage ? { presentSlots: coverage.presentSlots, expectedSlots: coverage.expectedSlots } : undefined,
          });
        }
      }
    }
  }
  addOptionalHostDiagnosticFindings(input.objects, coverageByObjectAndMetric, findings);
  const clusterDemandComparisons = compareClusterDemand(input, options, findings);
  const rvtoolsTimeDistanceMs = findRvtoolsTimeDistance(input.import, input.snapshots);
  addRvtoolsTimeDistanceFinding(rvtoolsTimeDistanceMs, options, findings);

  return {
    importId: input.import.id,
    confidence: determineConfidence(findings),
    findings,
    metricCoverage,
    clusterDemandComparisons,
    rvtoolsTimeDistanceMs,
  };
}

function buildMetricCoverage(summaries: readonly VropsTimeSeriesSummary[]): VropsTimeSeriesMetricCoverage[] {
  return summaries.flatMap((summary) => Object.entries(summary.metricStats).map(([metric, stats]) => ({
    objectKey: summary.objectKey,
    objectType: summary.objectType,
    metric: metric as VropsTimeSeriesMetricKey,
    expectedSlots: stats.expectedSlots,
    presentSlots: stats.presentSlots,
    missingSlots: stats.missingSlots,
    coverageRatio: stats.expectedSlots === 0 ? 0 : stats.presentSlots / stats.expectedSlots,
  })));
}

function addOptionalHostDiagnosticFindings(
  objects: readonly VropsTimeSeriesImportedObject[],
  coverage: ReadonlyMap<string, VropsTimeSeriesMetricCoverage>,
  findings: VropsDataQualityFinding[],
): void {
  const hosts = objects.filter((object) => object.objectType === "host" && object.matchStatus === "matched");
  for (const metric of OPTIONAL_HOST_DIAGNOSTIC_METRICS) {
    const affectedObjectKeys = hosts
      .filter((host) => (coverage.get(`${host.objectKey}\u0000${metric}`)?.presentSlots ?? 0) === 0)
      .map((host) => host.objectKey);
    if (affectedObjectKeys.length > 0) {
      findings.push({
        code: "missing-optional-host-diagnostic",
        severity: "warning",
        message: `Die optionale Hostdiagnose „${metric}“ fehlt für ${affectedObjectKeys.length} Host(s).`,
        affectedObjectKeys,
        metric,
      });
    }
  }
}

function compareClusterDemand(
  input: EvaluateVropsDataQualityInput,
  options: typeof VROPS_DATA_QUALITY_DEFAULTS,
  findings: VropsDataQualityFinding[],
): VropsClusterDemandComparison[] {
  const clusters = input.objects.filter((object) => object.objectType === "cluster" && object.matchStatus === "matched");
  const vmObjects = input.objects.filter((object) => object.objectType === "vm" && object.matchStatus === "matched");
  return clusters.map((cluster) => {
    const vms = vmObjects.filter((vm) => vm.clusterKey === cluster.clusterKey);
    const vmSeries = vms.map((vm) => readVropsTimeSeriesMetric(input.chunks, vm.objectKey, "vmCpuDemandAvgMHz"));
    const directSeries = readVropsTimeSeriesMetric(input.chunks, cluster.objectKey, "clusterCpuDemandAvgMHz");
    const expectedSlots = input.import.expectedSlots;
    const fullyPresentVmSlots = Array.from({ length: expectedSlots }, (_, index) => input.import.rangeStartUtc + index * HOUR_MS)
      .filter((timestamp) => vms.length > 0 && vmSeries.every((series) => Number.isFinite(series.get(timestamp))));
    const vmCoverageRatio = expectedSlots === 0 ? 0 : fullyPresentVmSlots.length / expectedSlots;
    const clusterPresentSlots = Array.from(directSeries.values()).filter(Number.isFinite).length;
    const clusterCoverageRatio = expectedSlots === 0 ? 0 : clusterPresentSlots / expectedSlots;
    if (vmCoverageRatio < options.minimumVmCoverageForClusterComparison) {
      findings.push({
        code: "incomplete-vm-coverage",
        severity: "warning",
        message: `Die VM-Demand-Abdeckung für Cluster „${cluster.vropsName}“ reicht nicht für einen belastbaren Vergleich.`,
        affectedObjectKeys: [cluster.objectKey, ...vms.map((vm) => vm.objectKey)],
        metric: "vmCpuDemandAvgMHz",
        details: { coverageRatio: vmCoverageRatio, requiredCoverageRatio: options.minimumVmCoverageForClusterComparison },
      });
      return unavailableComparison(cluster, "insufficient-vm-coverage", expectedSlots, vmCoverageRatio, clusterCoverageRatio);
    }
    if (clusterCoverageRatio === 0) {
      findings.push({
        code: "cluster-demand-comparison-unavailable",
        severity: "warning",
        message: `Die direkte Cluster-Demand-Serie für „${cluster.vropsName}“ fehlt.`,
        affectedObjectKeys: [cluster.objectKey],
        metric: "clusterCpuDemandAvgMHz",
      });
      return unavailableComparison(cluster, "missing-direct-cluster-series", expectedSlots, vmCoverageRatio, clusterCoverageRatio);
    }
    const differences: number[] = [];
    for (const timestamp of fullyPresentVmSlots) {
      const directDemand = directSeries.get(timestamp);
      if (!Number.isFinite(directDemand)) continue;
      const vmDemand = vmSeries.reduce((sum, series) => sum + (series.get(timestamp) ?? 0), 0);
      differences.push(Math.abs(vmDemand - directDemand!) / Math.max(Math.abs(directDemand!), 1));
    }
    const meanAbsoluteRelativeDifference = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
    const maximumAbsoluteRelativeDifference = differences.length ? Math.max(...differences) : null;
    if (maximumAbsoluteRelativeDifference !== null && maximumAbsoluteRelativeDifference > options.maximumClusterDemandRelativeDifference) {
      findings.push({
        code: "cluster-demand-mismatch",
        severity: "warning",
        message: `VM-Summe und direkte Cluster-Demand-Serie weichen für „${cluster.vropsName}“ deutlich voneinander ab.`,
        affectedObjectKeys: [cluster.objectKey, ...vms.map((vm) => vm.objectKey)],
        metric: "clusterCpuDemandAvgMHz",
        details: { maximumAbsoluteRelativeDifference, allowedRelativeDifference: options.maximumClusterDemandRelativeDifference },
      });
    }
    return {
      clusterObjectKey: cluster.objectKey,
      clusterKey: cluster.clusterKey,
      status: "compared",
      expectedSlots,
      comparedSlots: differences.length,
      vmCoverageRatio,
      clusterCoverageRatio,
      meanAbsoluteRelativeDifference,
      maximumAbsoluteRelativeDifference,
    };
  });
}

function unavailableComparison(
  cluster: VropsTimeSeriesImportedObject,
  status: "insufficient-vm-coverage" | "missing-direct-cluster-series",
  expectedSlots: number,
  vmCoverageRatio: number,
  clusterCoverageRatio: number,
): VropsClusterDemandComparison {
  return {
    clusterObjectKey: cluster.objectKey,
    clusterKey: cluster.clusterKey,
    status,
    expectedSlots,
    comparedSlots: 0,
    vmCoverageRatio,
    clusterCoverageRatio,
    meanAbsoluteRelativeDifference: null,
    maximumAbsoluteRelativeDifference: null,
  };
}

function findRvtoolsTimeDistance(
  importMeta: VropsTimeSeriesImport,
  snapshots: readonly Pick<SnapshotMeta, "snapshotId" | "exportTs">[],
): number | null {
  const distances = snapshots
    .filter((snapshot) => importMeta.rvtoolsSnapshotIds.includes(snapshot.snapshotId))
    .map((snapshot) => Date.parse(snapshot.exportTs))
    .filter(Number.isFinite)
    .map((snapshotUtc) => snapshotUtc < importMeta.rangeStartUtc
      ? importMeta.rangeStartUtc - snapshotUtc
      : snapshotUtc > importMeta.rangeEndUtc
        ? snapshotUtc - importMeta.rangeEndUtc
        : 0);
  return distances.length ? Math.min(...distances) : null;
}

function addRvtoolsTimeDistanceFinding(
  distance: number | null,
  options: typeof VROPS_DATA_QUALITY_DEFAULTS,
  findings: VropsDataQualityFinding[],
): void {
  if (distance === null || distance <= options.rvtoolsTimeDistanceWarningMs) return;
  const severity = distance > options.rvtoolsTimeDistanceBlockingMs ? "blocking" : "warning";
  findings.push({
    code: "rvtools-time-distance",
    severity,
    message: `Der RVTools-Snapshot liegt ${Math.round(distance / HOUR_MS)} Stunden außerhalb des vROps-Zeitraums.`,
    affectedObjectKeys: [],
    details: { distanceMs: distance },
  });
}

function determineConfidence(findings: readonly VropsDataQualityFinding[]): VropsTimeSeriesConfidenceLevel {
  if (findings.some((finding) => finding.severity === "blocking")) return "not-computable";
  if (findings.some((finding) => finding.code === "incomplete-vm-coverage" || finding.code === "rvtools-time-distance")) return "low";
  return findings.some((finding) => finding.severity === "warning") ? "medium" : "high";
}
