import { describe, expect, it } from "vitest";
import type {
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { evaluateVropsDataQuality } from "./vropsDataQualityService";

const startUtc = Date.parse("2026-07-21T00:00:00.000Z");

function summary(
  objectKey: string,
  objectType: VropsTimeSeriesSummary["objectType"],
  metric: VropsTimeSeriesMetricKey,
  presentSlots = 2,
): VropsTimeSeriesSummary {
  return {
    importId: "ts-1",
    objectKey,
    objectType,
    metricStats: {
      [metric]: {
        expectedSlots: 2,
        presentSlots,
        missingSlots: 2 - presentSlots,
        minimum: presentSlots ? 1 : null,
        maximum: presentSlots ? 2 : null,
        average: presentSlots ? 1.5 : null,
      },
    },
  };
}

function chunk(
  objectType: VropsTimeSeriesChunk["objectType"],
  objectKey: string,
  metric: VropsTimeSeriesMetricKey,
  values: number[],
): VropsTimeSeriesChunk {
  return {
    importId: "ts-1",
    objectType,
    chunkKey: objectType,
    clusterKey: "cluster-key",
    startUtc,
    slotCount: 2,
    objectKeys: [objectKey],
    metricValues: { [metric]: new Float32Array(values).buffer },
  };
}

const importMeta: VropsTimeSeriesImport = {
  id: "ts-1",
  importedAt: "2026-07-22T00:00:00.000Z",
  timezone: "Europe/Vienna",
  intervalMinutes: 60,
  rangeStartUtc: startUtc,
  rangeEndUtc: startUtc + 60 * 60 * 1000,
  expectedSlots: 2,
  rvtoolsSnapshotIds: ["snap-1"],
  files: [],
  fileSetChecksum: "set",
  schemaVersion: 1,
  validationStatus: "relationships-valid",
  qualitySummary: { objectCountByType: { vm: 1, cluster: 1, host: 1 }, expectedSlots: 2, errorCount: 0, warningCount: 0, missingValueCount: 0 },
  relationshipIssues: [],
};

function objects(overrides: Partial<VropsTimeSeriesImportedObject> = {}): VropsTimeSeriesImportedObject[] {
  const values: VropsTimeSeriesImportedObject[] = [
    {
      importId: "ts-1", objectKey: "vm:vm-01", objectType: "vm", vropsName: "vm-01",
      vcenterId: "vc-1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "vm-key", clusterKey: "cluster-key", hostKey: "host-key",
      workloadClass: "high", powerState: "poweredOn", siteId: null, matchStatus: "matched", matchMethod: "name",
    },
    {
      importId: "ts-1", objectKey: "cluster:cluster-01", objectType: "cluster", vropsName: "cluster-01",
      vcenterId: "vc-1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "cluster-key", clusterKey: "cluster-key", hostKey: null,
      workloadClass: null, powerState: null, siteId: null, matchStatus: "matched", matchMethod: "name",
    },
    {
      importId: "ts-1", objectKey: "host:esxsrv1-01", objectType: "host", vropsName: "esxsrv1-01",
      vcenterId: "vc-1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "host-key", clusterKey: "cluster-key", hostKey: "host-key",
      workloadClass: null, powerState: null, siteId: "site-1", matchStatus: "matched", matchMethod: "name",
    },
  ];
  return values.map((object) => ({ ...object, ...overrides }));
}

describe("evaluateVropsDataQuality", () => {
  it("berechnet Metrikabdeckung und vergleicht VM-Summen mit direktem Cluster-Demand", () => {
    const report = evaluateVropsDataQuality({
      import: importMeta,
      objects: objects(),
      summaries: [
        summary("vm:vm-01", "vm", "vmCpuDemandAvgMHz"),
        summary("cluster:cluster-01", "cluster", "clusterCpuDemandAvgMHz"),
        summary("host:esxsrv1-01", "host", "hostCpuCapacityAvailableLastMHz"),
        summary("host:esxsrv1-01", "host", "hostMemoryCapacityAvailableLastMiB"),
      ],
      chunks: [
        chunk("vm", "vm:vm-01", "vmCpuDemandAvgMHz", [50, 100]),
        chunk("cluster", "cluster:cluster-01", "clusterCpuDemandAvgMHz", [100, 100]),
      ],
      snapshots: [{ snapshotId: "snap-1", exportTs: "2026-07-21T00:30:00.000Z" }],
    });

    expect(report.metricCoverage).toContainEqual(expect.objectContaining({ objectKey: "vm:vm-01", coverageRatio: 1 }));
    expect(report.clusterDemandComparisons).toEqual([expect.objectContaining({ status: "compared", comparedSlots: 2, maximumAbsoluteRelativeDifference: 0.5 })]);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: "cluster-demand-mismatch", severity: "warning" }));
    expect(report.rvtoolsTimeDistanceMs).toBe(0);
  });

  it("blockiert fehlende Kapazität, unbekannte Beziehungen und einen zu weit entfernten RVTools-Stand", () => {
    const report = evaluateVropsDataQuality({
      import: importMeta,
      objects: objects({ workloadClass: "unknown", siteId: null }),
      summaries: [
        summary("vm:vm-01", "vm", "vmCpuDemandAvgMHz", 1),
        summary("cluster:cluster-01", "cluster", "clusterCpuDemandAvgMHz"),
        summary("host:esxsrv1-01", "host", "hostCpuCapacityAvailableLastMHz", 1),
      ],
      chunks: [
        chunk("vm", "vm:vm-01", "vmCpuDemandAvgMHz", [50, Number.NaN]),
        chunk("cluster", "cluster:cluster-01", "clusterCpuDemandAvgMHz", [100, 100]),
      ],
      snapshots: [{ snapshotId: "snap-1", exportTs: "2026-07-30T00:00:00.000Z" }],
    });

    expect(report.confidence).toBe("not-computable");
    expect(report.clusterDemandComparisons).toEqual([expect.objectContaining({ status: "insufficient-vm-coverage", vmCoverageRatio: 0.5 })]);
    expect(report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "unknown-resource-pool",
      "unknown-site",
      "missing-required-capacity",
      "incomplete-vm-coverage",
      "rvtools-time-distance",
    ]));
  });
});
