import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { Scenario } from "@/domain/models/types";

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
      { id: "grp-1", label: null, targetClusterKey: "cl-new-04", vmKeys: ["vm-1", "vm-2"] },
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
});