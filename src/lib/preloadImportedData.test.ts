import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { IMPORT_DATA_STORE_NAMES } from "@/data/db";
import type { VropsTimeSeriesImport } from "@/domain/models/types";
import { mergeInitialAndStoredCapacityPolicies } from "@/domain/services/capacityPolicyService";
import {
  buildGlobalWorkloadClassAverages,
  DEFAULT_FILL_UP_WORKLOAD_MIX,
  DEFAULT_FILL_UP_WORKLOAD_PROFILES,
} from "@/domain/services/fillUpPlanningService";
import { DEFAULT_CPU_DEMAND_CONCURRENCY_PCT } from "@/domain/services/fillUpRecommendationEngine";
import { buildFillUpPlanningQueryKey } from "@/hooks/useFillUpPlanning";
import {
  preloadImportedData,
  type PreloadDependencies,
  type PreloadProgress,
} from "@/lib/preloadImportedData";

const VROPS_IMPORT_FIXTURE: VropsTimeSeriesImport = {
  id: "import-1",
  importedAt: "2026-01-02",
  timezone: "Europe/Vienna",
  intervalMinutes: 60,
  rangeStartUtc: 0,
  rangeEndUtc: 0,
  expectedSlots: 0,
  rvtoolsSnapshotIds: ["s1", "s2"],
};

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
    getAllVropsLatest: empty,
    getVropsTimeSeriesImports: vi.fn(async () => []),
    getVropsTimeSeriesObjects: vi.fn(async () => []),
    getVropsTimeSeriesChunks: vi.fn(async () => []),
    getVropsTimeSeriesSummaries: vi.fn(async () => []),
    getCapacityPolicies: vi.fn(async () => []),
    getCapacityPolicyAssignments: vi.fn(async () => []),
    buildFillUpPlanningResultsInWorker: vi.fn(async () => []),
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
    expect(queryClient.getQueryData(["storedUploads"])).toHaveLength(9);

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

  it("lässt die Fill-Up-Standardauswertung ohne vROps-Import unberührt", async () => {
    const deps = dependencies();

    await preloadImportedData(new QueryClient({ defaultOptions: { queries: { retry: false } } }), { dependencies: deps });

    expect(deps.buildFillUpPlanningResultsInWorker).not.toHaveBeenCalled();
  });

  it("berechnet die Fill-Up-Standardauswertung für den neuesten vROps-Import vorab und hinterlegt sie unter dem Query-Key von useFillUpPlanning", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fakeResults = [{ cluster: { clusterKey: "c1" } }] as unknown as unknown[];
    const buildWorker = vi.fn(async () => fakeResults);
    const deps = dependencies({
      getVropsTimeSeriesImports: vi.fn(async () => [VROPS_IMPORT_FIXTURE]),
      buildFillUpPlanningResultsInWorker: buildWorker as PreloadDependencies["buildFillUpPlanningResultsInWorker"],
    });

    await preloadImportedData(queryClient, { dependencies: deps });

    expect(buildWorker).toHaveBeenCalledTimes(1);
    expect(deps.getBySnapshotIds).toHaveBeenCalledWith("entities_host", VROPS_IMPORT_FIXTURE.rvtoolsSnapshotIds);
    expect(deps.getBySnapshotIds).toHaveBeenCalledWith("entities_vm", VROPS_IMPORT_FIXTURE.rvtoolsSnapshotIds);
    expect(deps.getBySnapshotIds).toHaveBeenCalledWith("entities_cluster", VROPS_IMPORT_FIXTURE.rvtoolsSnapshotIds);

    const expectedPolicies = mergeInitialAndStoredCapacityPolicies([]);
    const expectedGlobalProfiles = buildGlobalWorkloadClassAverages({ objects: [], vms: [], chunks: [] });
    const key = buildFillUpPlanningQueryKey(
      VROPS_IMPORT_FIXTURE.id,
      expectedPolicies,
      [],
      DEFAULT_FILL_UP_WORKLOAD_PROFILES,
      DEFAULT_FILL_UP_WORKLOAD_MIX,
      false,
      DEFAULT_CPU_DEMAND_CONCURRENCY_PCT,
    );
    expect(queryClient.getQueryData(key)).toEqual({ results: fakeResults, globalWorkloadClassProfiles: expectedGlobalProfiles });
  });

  it("nennt eine fehlgeschlagene Fill-Up-Standardauswertung in der Fehlermeldung", async () => {
    const deps = dependencies({
      getVropsTimeSeriesImports: vi.fn(async () => [VROPS_IMPORT_FIXTURE]),
      buildFillUpPlanningResultsInWorker: vi.fn(async () => {
        throw new Error("Worker abgestürzt");
      }) as PreloadDependencies["buildFillUpPlanningResultsInWorker"],
    });

    await expect(preloadImportedData(new QueryClient({ defaultOptions: { queries: { retry: false } } }), {
      dependencies: deps,
    })).rejects.toThrow("Fill-Up-Planung: Standardauswertung: Worker abgestürzt");
  });
});
