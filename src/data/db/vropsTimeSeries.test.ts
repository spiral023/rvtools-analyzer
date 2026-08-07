import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createInitialCapacityPolicies } from "@/domain/services/capacityPolicyService";
import type { FillUpAnalysisRun, VropsTimeSeriesImport } from "@/domain/models/types";

beforeEach(() => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

describe("vROps time-series persistence", () => {
  it("speichert und löscht Dateisatz, Objektverzeichnis, Chunk und Summary atomar", async () => {
    const db = await import("./index");
    const meta: VropsTimeSeriesImport = {
      id: "ts-1", importedAt: "2026-07-28T10:00:00.000Z", timezone: "Europe/Vienna" as const,
      intervalMinutes: 60 as const, rangeStartUtc: 1, rangeEndUtc: 1, expectedSlots: 1,
      rvtoolsSnapshotIds: ["snap-1"], fileSetChecksum: "set-1", schemaVersion: 1,
      validationStatus: "relationships-partial" as const,
      qualitySummary: { objectCountByType: { vm: 1, cluster: 0, host: 0 }, expectedSlots: 1, errorCount: 0, warningCount: 0, missingValueCount: 0 },
      files: [{ objectType: "vm" as const, fileName: "vm.csv", fileSizeBytes: 10, fileChecksum: "vm", rowCount: 1, columnCount: 4, detectedColumns: ["Name"], status: "accepted" as const }],
    };
    await db.persistVropsTimeSeriesImport(meta, [{
      importId: "ts-1", objectKey: "vm:vm-01", objectType: "vm", vropsName: "vm-01",
      vcenterId: "vc-1", rvtoolsSnapshotId: "snap-1", rvtoolsObjectKey: "vm-key", clusterKey: null, hostKey: null,
      workloadClass: "high", powerState: "poweredOn", siteId: null,
      matchStatus: "matched", matchMethod: "name",
    }], [{
      importId: "ts-1", objectType: "vm", chunkKey: "all", clusterKey: null, startUtc: 1, slotCount: 1,
      objectKeys: ["vm:vm-01"], metricValues: { vmCpuDemandAvgMHz: new Float32Array([42]).buffer },
    }], [{
      importId: "ts-1", objectKey: "vm:vm-01", objectType: "vm",
      metricStats: { vmCpuDemandAvgMHz: { expectedSlots: 1, presentSlots: 1, missingSlots: 0, minimum: 42, maximum: 42, average: 42 } },
    }]);

    await expect(db.getVropsTimeSeriesImportByFileSetChecksum("set-1")).resolves.toMatchObject({ id: "ts-1" });
    await expect(db.getVropsTimeSeriesObjects("ts-1")).resolves.toHaveLength(1);
    const [chunk] = await db.getVropsTimeSeriesChunks("ts-1");
    expect(Array.from(new Float32Array(chunk.metricValues.vmCpuDemandAvgMHz!))).toEqual([42]);
    await expect(db.getVropsTimeSeriesSummaries("ts-1")).resolves.toHaveLength(1);

    await db.persistVropsTimeSeriesImport({ ...meta, id: "ts-2", fileSetChecksum: "set-2" }, [], [], []);
    await expect(db.getVropsTimeSeriesImports()).resolves.toEqual([expect.objectContaining({ id: "ts-2" })]);
    await expect(db.getVropsTimeSeriesObjects("ts-1")).resolves.toEqual([]);
    await expect(db.getVropsTimeSeriesChunks("ts-1")).resolves.toEqual([]);
    await expect(db.getVropsTimeSeriesSummaries("ts-1")).resolves.toEqual([]);

    await db.deleteVropsTimeSeriesImport("ts-2");

    await expect(db.getVropsTimeSeriesImports()).resolves.toEqual([]);
    await expect(db.getVropsTimeSeriesObjects("ts-1")).resolves.toEqual([]);
    await expect(db.getVropsTimeSeriesChunks("ts-1")).resolves.toEqual([]);
    await expect(db.getVropsTimeSeriesSummaries("ts-1")).resolves.toEqual([]);
  });

  it("hängt rvtoolsSnapshotIds und rvtoolsSnapshotId auf eine neue snapshotId um, ohne fremde vCenter-IDs zu berühren", async () => {
    const db = await import("./index");
    const meta: VropsTimeSeriesImport = {
      id: "ts-1", importedAt: "2026-07-28T10:00:00.000Z", timezone: "Europe/Vienna" as const,
      intervalMinutes: 60 as const, rangeStartUtc: 1, rangeEndUtc: 1, expectedSlots: 1,
      rvtoolsSnapshotIds: ["snap-old", "snap-other-vcenter"], fileSetChecksum: "set-1", schemaVersion: 1,
      validationStatus: "relationships-partial" as const,
      qualitySummary: { objectCountByType: { vm: 1, cluster: 0, host: 0 }, expectedSlots: 1, errorCount: 0, warningCount: 0, missingValueCount: 0 },
      files: [{ objectType: "vm" as const, fileName: "vm.csv", fileSizeBytes: 10, fileChecksum: "vm", rowCount: 1, columnCount: 4, detectedColumns: ["Name"], status: "accepted" as const }],
    };
    await db.persistVropsTimeSeriesImport(meta, [{
      importId: "ts-1", objectKey: "vm:vm-01", objectType: "vm", vropsName: "vm-01",
      vcenterId: "vc-1", rvtoolsSnapshotId: "snap-old", rvtoolsObjectKey: "vm-key", clusterKey: null, hostKey: null,
      workloadClass: "high", powerState: "poweredOn", siteId: null,
      matchStatus: "matched", matchMethod: "name",
    }], [], []);

    const relinkedCount = await db.relinkVropsTimeSeriesSnapshotIds(["snap-old"], "snap-new");

    expect(relinkedCount).toBe(1);
    const [updatedImport] = await db.getVropsTimeSeriesImports();
    expect(updatedImport.rvtoolsSnapshotIds).toEqual(["snap-new", "snap-other-vcenter"]);
    const [updatedObject] = await db.getVropsTimeSeriesObjects("ts-1");
    expect(updatedObject.rvtoolsSnapshotId).toBe("snap-new");
  });

  it("lässt Importe unberührt, deren rvtoolsSnapshotIds keine der ersetzten IDs enthalten", async () => {
    const db = await import("./index");
    const meta: VropsTimeSeriesImport = {
      id: "ts-2", importedAt: "2026-07-28T10:00:00.000Z", timezone: "Europe/Vienna" as const,
      intervalMinutes: 60 as const, rangeStartUtc: 1, rangeEndUtc: 1, expectedSlots: 1,
      rvtoolsSnapshotIds: ["snap-unrelated"], fileSetChecksum: "set-2", schemaVersion: 1,
      validationStatus: "relationships-partial" as const,
      qualitySummary: { objectCountByType: { vm: 0, cluster: 0, host: 0 }, expectedSlots: 1, errorCount: 0, warningCount: 0, missingValueCount: 0 },
      files: [],
    };
    await db.persistVropsTimeSeriesImport(meta, [], [], []);

    const relinkedCount = await db.relinkVropsTimeSeriesSnapshotIds(["snap-old"], "snap-new");

    expect(relinkedCount).toBe(0);
    const [untouchedImport] = await db.getVropsTimeSeriesImports();
    expect(untouchedImport.rvtoolsSnapshotIds).toEqual(["snap-unrelated"]);
  });

  it("persistiert Policy-Versionen und explizite Clusterzuweisungen getrennt", async () => {
    const db = await import("./index");
    const policy = createInitialCapacityPolicies("2026-07-28T10:00:00.000Z")[0];
    await db.putCapacityPolicy(policy);
    await db.putCapacityPolicyAssignment({
      vcenterId: "vc-1", clusterKey: "cluster-1", clusterName: "Cluster 1", policyId: policy.id,
      overrides: { cpuSafetyBufferPct: 12 }, updatedAt: "2026-07-28T10:01:00.000Z",
    });

    await expect(db.getCapacityPolicies()).resolves.toEqual([policy]);
    await expect(db.getCapacityPolicyAssignment("vc-1", "cluster-1")).resolves.toMatchObject({ policyId: policy.id, overrides: { cpuSafetyBufferPct: 12 } });
  });

  it("löscht alle Versionen einer Policy, lässt andere Policies aber unberührt", async () => {
    const db = await import("./index");
    const [policyA, policyB] = createInitialCapacityPolicies("2026-07-28T10:00:00.000Z");
    await db.putCapacityPolicy(policyA);
    await db.putCapacityPolicy({ ...policyA, version: 2, updatedAt: "2026-07-28T11:00:00.000Z" });
    await db.putCapacityPolicy(policyB);

    await db.deleteCapacityPolicy(policyA.id);

    const remaining = await db.getCapacityPolicies();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(policyB.id);
  });

  it("persistiert Analyzer-Runs unabhängig von ihren später löschbaren Zeitreihen", async () => {
    const db = await import("./index");
    const run: FillUpAnalysisRun = {
      id: "run-1", name: "N-1 Vergleich", createdAt: "2026-07-28T12:00:00.000Z", updatedAt: "2026-07-28T12:00:00.000Z",
      calculationVersion: 1 as const, importId: "ts-1", importFileSetChecksum: "set-1", rvtoolsSnapshotIds: ["snap-1"], includeN2: false,
      workloadProfiles: [], workloadMix: null, results: [],
    };
    await db.putFillUpAnalysisRun(run);
    await db.deleteVropsTimeSeriesImport("ts-1");

    await expect(db.getFillUpAnalysisRuns()).resolves.toEqual([run]);
    await db.deleteFillUpAnalysisRun("run-1");
    await expect(db.getFillUpAnalysisRuns()).resolves.toEqual([]);
  });
});
