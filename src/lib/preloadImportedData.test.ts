import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { IMPORT_DATA_STORE_NAMES } from "@/data/db";
import {
  preloadImportedData,
  type PreloadDependencies,
  type PreloadProgress,
} from "@/lib/preloadImportedData";

function dependencies(overrides: Partial<PreloadDependencies> = {}): PreloadDependencies {
  const empty = vi.fn(async () => []);
  return {
    getSnapshots: vi.fn(async () => [
      { snapshotId: "s1", vcenterId: "vc-1", exportTs: "2026-01-01" },
      { snapshotId: "s2", vcenterId: "vc-2", exportTs: "2026-01-02" },
    ]),
    getStoredRawSheetNames: vi.fn(async () => ["vCPU"]),
    getBySnapshotIds: vi.fn(async (storeName: string) => storeName === "entities_vm"
      ? [
          { snapshotId: "s1", vmName: "VM-01" },
          { snapshotId: "s2", vmName: "VM-02" },
        ]
      : [{ snapshotId: "s1" }]),
    getRawSheetRows: vi.fn(async () => [
      { snapshotId: "s1", sheetName: "vCPU", rowIndex: 0, data: { VM: "VM-01", CPUs: 2 } },
    ]),
    getRawSheetFieldNamesBySnapshot: vi.fn(async () => ({ s1: ["VM", "CPUs"], s2: ["VM"] })),
    getImportedStoreRecords: vi.fn(async () => [{ importedAt: "2026-01-01" }]),
    getAllTechInfoLatest: vi.fn(async () => [{ vmNameNorm: "vm-01", vmName: "VM-01" }]),
    getAllTechInfoClientLatest: vi.fn(async () => [{ clientNameNorm: "vm-01", clientName: "VM-01" }]),
    getAllCdpLatest: empty,
    getAllIpamLatest: empty,
    getAllEramonIfaceLatest: empty,
    getAllEramonL2Latest: empty,
    ...overrides,
  } as PreloadDependencies;
}

describe("preloadImportedData", () => {
  it("lädt alle Snapshots, Raw-Sheets und Import-Stores und meldet monotonen Fortschritt", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const deps = dependencies();
    const updates: PreloadProgress[] = [];

    const result = await preloadImportedData(queryClient, {
      dependencies: deps,
      onProgress: (progress) => updates.push(progress),
    });

    expect(deps.getRawSheetRows).toHaveBeenCalledWith(["s1", "s2"], "vCPU");
    expect(deps.getImportedStoreRecords).toHaveBeenCalledTimes(IMPORT_DATA_STORE_NAMES.length);
    expect(queryClient.getQueryData(["vms", ["s1", "s2"]])).toHaveLength(2);
    expect(queryClient.getQueryData(["rawSheet", "vCPU", ["s1", "s2"]])).toHaveLength(1);
    expect(queryClient.getQueryData(["globalVmFilterRawSheet", "vCPU", ["s1", "s2"]])).toHaveLength(1);
    expect(queryClient.getQueryData(["rawSheetFieldsBySnapshot", "vCPU", ["s1", "s2"]])).toEqual({
      s1: ["VM", "CPUs"],
      s2: ["VM"],
    });
    expect(queryClient.getQueryData(["techInfoLatestByVmNames", ["VM-01", "VM-02"]])).toHaveLength(1);
    expect(queryClient.getQueryData(["importedDataStore", "techinfo_rows"])).toHaveLength(1);
    expect(queryClient.getQueryData(["storedUploads"])).toHaveLength(8);

    expect(updates.at(-1)).toMatchObject({
      phase: "loading",
      completedSteps: updates.at(-1)?.totalSteps,
      percent: 100,
    });
    expect(result.processedRecords).toBeGreaterThan(0);
    expect(updates.every((update, index) => index === 0 || update.percent >= updates[index - 1].percent)).toBe(true);
  });

  it("führt große Ladeschritte strikt nacheinander aus", async () => {
    let activeLoads = 0;
    let maximumParallelLoads = 0;
    const track = async (): Promise<unknown[]> => {
      activeLoads += 1;
      maximumParallelLoads = Math.max(maximumParallelLoads, activeLoads);
      await Promise.resolve();
      activeLoads -= 1;
      return [];
    };
    const deps = dependencies({
      getBySnapshotIds: vi.fn(track) as PreloadDependencies["getBySnapshotIds"],
      getRawSheetRows: vi.fn(track) as PreloadDependencies["getRawSheetRows"],
      getImportedStoreRecords: vi.fn(track) as PreloadDependencies["getImportedStoreRecords"],
    });

    await preloadImportedData(new QueryClient(), { dependencies: deps });

    expect(maximumParallelLoads).toBe(1);
  });

  it("nennt den fehlgeschlagenen Datenbereich in der Fehlermeldung", async () => {
    const deps = dependencies({
      getRawSheetRows: vi.fn(async () => {
        throw new Error("Blob beschädigt");
      }),
    });

    await expect(preloadImportedData(new QueryClient({ defaultOptions: { queries: { retry: false } } }), {
      dependencies: deps,
    })).rejects.toThrow("RVTools-Rohdaten: vCPU");
  });
});
