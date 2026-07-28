import { describe, expect, it } from "vitest";
import type { CapacityPolicy, FillUpWorkloadProfile, NormalizedCluster, NormalizedHost, NormalizedVm, SnapshotMeta, VropsTimeSeriesChunk, VropsTimeSeriesImport, VropsTimeSeriesImportedObject, VropsTimeSeriesSummary } from "@/domain/models/types";
import { createInitialCapacityPolicies } from "./capacityPolicyService";
import { buildFillUpPlanningResults } from "./fillUpPlanningService";

const profile: FillUpWorkloadProfile = { id: "std", name: "STD", workloadClass: "std", vcpu: 2, memoryMiB: 100, cpuDemandP95MHz: 50 };
const policy: CapacityPolicy = { ...createInitialCapacityPolicies("2026-07-28T00:00:00.000Z")[1], cpuSafetyBufferPct: 0, ramSafetyBufferPct: 0, ramSystemReserveMiBPerHost: 0, requireHighSiteFailover: false };
const importMeta: VropsTimeSeriesImport = {
  id: "import-1", importedAt: "2026-07-28T00:00:00.000Z", timezone: "Europe/Vienna", intervalMinutes: 60, rangeStartUtc: 0, rangeEndUtc: 0, expectedSlots: 1, rvtoolsSnapshotIds: ["snap-1"], fileSetChecksum: "checksum", schemaVersion: 1, validationStatus: "relationships-valid",
  files: [], qualitySummary: { objectCountByType: { vm: 1, host: 2, cluster: 1 }, expectedSlots: 1, errorCount: 0, warningCount: 0, missingValueCount: 0 },
};

const objects: VropsTimeSeriesImportedObject[] = [
  { importId: "import-1", objectKey: "cluster:c1", objectType: "cluster", vropsName: "C1", vcenterId: "vc1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "c1", clusterKey: "c1", hostKey: null, workloadClass: null, powerState: null, siteId: null, matchStatus: "matched", matchMethod: "name" },
  { importId: "import-1", objectKey: "host:h1", objectType: "host", vropsName: "H1", vcenterId: "vc1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "h1", clusterKey: "c1", hostKey: "h1", workloadClass: null, powerState: null, siteId: "site-1", matchStatus: "matched", matchMethod: "name" },
  { importId: "import-1", objectKey: "host:h2", objectType: "host", vropsName: "H2", vcenterId: "vc1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "h2", clusterKey: "c1", hostKey: "h2", workloadClass: null, powerState: null, siteId: "site-2", matchStatus: "matched", matchMethod: "name" },
  { importId: "import-1", objectKey: "vm:one", objectType: "vm", vropsName: "VM1", vcenterId: "vc1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "vm1", clusterKey: "c1", hostKey: "h1", workloadClass: "std", powerState: "poweredOn", siteId: null, matchStatus: "matched", matchMethod: "name" },
];

function chunk(objectType: VropsTimeSeriesChunk["objectType"], objectKeys: string[], values: Record<string, number[]>): VropsTimeSeriesChunk {
  return { importId: "import-1", objectType, chunkKey: objectType, clusterKey: null, startUtc: 0, slotCount: 1, objectKeys, metricValues: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new Float32Array(value).buffer])) };
}

const chunks = [
  chunk("host", ["host:h1", "host:h2"], { hostCpuCapacityAvailableLastMHz: [1_000, 1_000], hostMemoryCapacityAvailableLastMiB: [1_000, 1_000] }),
  chunk("vm", ["vm:one"], { vmCpuDemandAvgMHz: [100], vmCpuReadyMaxPct: [0] }),
  chunk("cluster", ["cluster:c1"], { clusterCpuDemandAvgMHz: [100], clusterMemoryUtilizationAvgMiB: [100], clusterCpuContentionAvgPct: [0] }),
];

const summaries: VropsTimeSeriesSummary[] = ["host:h1", "host:h2"].map((objectKey) => ({ importId: "import-1", objectKey, objectType: "host", metricStats: {
  hostCpuCapacityAvailableLastMHz: { expectedSlots: 1, presentSlots: 1, missingSlots: 0, minimum: 1_000, maximum: 1_000, average: 1_000 },
  hostMemoryCapacityAvailableLastMiB: { expectedSlots: 1, presentSlots: 1, missingSlots: 0, minimum: 1_000, maximum: 1_000, average: 1_000 },
} }));

describe("buildFillUpPlanningResults", () => {
  it("liest die eingefrorenen Objekt-Keys aus den Chunks und delegiert an die Fill-Up-Engines", () => {
    const snapshot: SnapshotMeta = { snapshotId: "snap-1", vcenterId: "vc1", vcenterDisplayName: "VC1", exportTs: "2026-07-28T00:00:00.000Z", importedAt: "2026-07-28T00:00:00.000Z", fileName: "rvtools.xlsx", fileChecksum: "rv" , sheetStats: {} };
    const hosts: NormalizedHost[] = [
      { snapshotId: "snap-1", vcenterId: "vc1", hostKey: "h1", host: "H1", cluster: "C1", datacenter: null, cpuModel: null, cpuTotalMHz: 1_000, cpuCores: 10, cpuThreads: null, memoryTotalMiB: 1_000, version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null },
      { snapshotId: "snap-1", vcenterId: "vc1", hostKey: "h2", host: "H2", cluster: "C1", datacenter: null, cpuModel: null, cpuTotalMHz: 1_000, cpuCores: 10, cpuThreads: null, memoryTotalMiB: 1_000, version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null },
    ];
    const vms: NormalizedVm[] = [{ snapshotId: "snap-1", vcenterId: "vc1", vmKey: "vm1", vmUuid: null, vmName: "VM1", cluster: "C1", host: "H1", powerState: "poweredOn", cpuCount: 2, memoryMiB: 100, provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null, consolidationNeeded: null, osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null, datacenter: null, folder: null, resourcePool: "STD", annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null }];
    const clusters: NormalizedCluster[] = [{ snapshotId: "snap-1", vcenterId: "vc1", clusterKey: "c1", name: "C1", datacenter: null, haEnabled: true, drsEnabled: true, numHosts: 2, numCpuCores: 20, numCpuThreads: null, totalMemoryMiB: 2_000, totalCpuMHz: 2_000, numEffectiveHosts: 2 }];

    const [result] = buildFillUpPlanningResults({ import: importMeta, objects, chunks, summaries, snapshots: [snapshot], hosts, vms, clusters, policies: [policy], assignments: [], profiles: [profile], workloadMix: undefined, includeN2: false });

    expect(result.cluster.name).toBe("C1");
    expect(result.capacity.normal).toMatchObject({ cpuCapacityMHz: 2_000, memoryCapacityMiB: 2_000, cpuDemandMHz: 100 });
    expect(result.recommendation.profileRecommendations[0]).toMatchObject({ profile: { id: "std" }, maxAdditionalVms: 8 });
    expect(result.chartHours).toEqual([{ timestampUtc: 0, clusterCpuDemandMHz: 100, clusterMemoryUtilizationMiB: 100 }]);
    expect(result.observedVmProfiles).toContainEqual(expect.objectContaining({ scope: "cluster", vmCount: 1, averageVcpu: 2, averageConfiguredMemoryMiB: 100, averageCpuDemandMHz: 100, cpuDemandP95MHz: 100, cpuReadyP95Pct: 0 }));
    expect(result.observedVmProfiles).toContainEqual(expect.objectContaining({ scope: "resource-pool", resourcePool: "STD", suggestedWorkloadClass: "std" }));
    expect(result).not.toHaveProperty("hours");
  });
});
