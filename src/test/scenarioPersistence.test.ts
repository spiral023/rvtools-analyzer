import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { NormalizedCluster, Scenario } from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";

beforeEach(() => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

function makeScenario(): Scenario {
  return {
    id: "scn-1",
    name: "Migration Welle 1",
    type: "cluster-migration",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    vcenterScope: ["vc-1"],
    groups: [
      { id: "grp-1", label: null, targetClusterKey: clusterScopeKey("vc-1", "DC1", "cl-new-04"), vmKeys: ["vm-1", "vm-2"] },
    ],
    notes: null,
  };
}

describe("scenario persistence", () => {
  it("speichert, liest und löscht ein Szenario (Round-Trip)", async () => {
    const { putScenario, getScenarios, deleteScenario } = await import("@/data/db");
    const scenario = makeScenario();

    await putScenario(scenario);
    const afterPut = await getScenarios();
    expect(afterPut).toHaveLength(1);
    expect(afterPut[0]).toEqual(scenario);

    await deleteScenario("scn-1");
    const afterDelete = await getScenarios();
    expect(afterDelete).toHaveLength(0);
  });

  it("migriert einen eindeutig auflösbaren Legacy-Zielcluster beim Laden einmalig", async () => {
    const { getDb, getScenarios } = await import("@/data/db");
    const db = await getDb();
    const target: NormalizedCluster = {
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      clusterKey: clusterScopeKey("vc-1", "DC1", "cl-new-04"),
      name: "cl-new-04",
      datacenter: "DC1",
      haEnabled: null,
      drsEnabled: null,
      numHosts: null,
      numCpuCores: null,
      numCpuThreads: null,
      totalMemoryMiB: null,
      totalCpuMHz: null,
      numEffectiveHosts: null,
    };
    const legacyScenario: Scenario = {
      ...makeScenario(),
      groups: [{ id: "grp-1", label: null, targetClusterKey: "cl-new-04::vc-1", vmKeys: ["vm-1"] }],
    };
    await db.put("entities_cluster", target);
    await db.put("scenarios", legacyScenario);

    const [loaded] = await getScenarios();

    expect(loaded.groups[0].targetClusterKey).toBe(target.clusterKey);
    expect((await db.get("scenarios", legacyScenario.id))?.groups[0].targetClusterKey).toBe(target.clusterKey);
  });
});
