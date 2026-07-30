import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { VropsTimeSeriesChunk, VropsTimeSeriesImport, VropsTimeSeriesImportedObject } from "@/domain/models/types";
import { preloadImportedData, type PreloadDependencies } from "@/lib/preloadImportedData";
import { IMPORTED_DATA_QUERY_DEFAULTS } from "@/lib/queryCache";
import { FillUpPlanningPanel } from "./FillUpPlanningPanel";

const mocks = vi.hoisted(() => ({
  buildInWorker: vi.fn(async () => []),
  virtualTable: vi.fn<(props: unknown) => ReactNode>(() => <div data-testid="virtual-table" />),
}));

vi.mock("@/domain/services/fillUpPlanningWorkerService", () => ({
  buildFillUpPlanningResultsInWorker: mocks.buildInWorker,
}));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: mocks.virtualTable }));

const VROPS_IMPORT: VropsTimeSeriesImport = {
  id: "import-1",
  importedAt: "2026-01-02",
  timezone: "Europe/Vienna",
  intervalMinutes: 60,
  rangeStartUtc: 0,
  rangeEndUtc: 0,
  expectedSlots: 0,
  rvtoolsSnapshotIds: ["s1"],
  files: [],
  fileSetChecksum: "checksum",
  schemaVersion: 1,
  validationStatus: "relationships-valid",
  qualitySummary: { objectCountByType: { vm: 1, host: 0, cluster: 0 }, expectedSlots: 0, errorCount: 0, warningCount: 0, missingValueCount: 0 },
};

/** Eine gematchte, eingeschaltete HIGH-VM mit CPU-Demand ergibt verwertbare HIGH-Durchschnitte. */
function preloadDependencies(): PreloadDependencies {
  const empty = vi.fn(async () => []);
  const objects = [{
    importId: "import-1", objectKey: "obj-1", objectType: "vm", matchStatus: "matched",
    rvtoolsObjectKey: "vm-1", workloadClass: "high",
  }] as unknown as VropsTimeSeriesImportedObject[];
  const chunks: VropsTimeSeriesChunk[] = [{
    importId: "import-1", objectType: "vm", chunkKey: "chunk-1", clusterKey: null, startUtc: 0, slotCount: 2,
    objectKeys: ["obj-1"], metricValues: { vmCpuDemandAvgMHz: Float32Array.of(400, 600).buffer },
  }];
  return {
    getSnapshots: vi.fn(async () => [{ snapshotId: "s1", vcenterId: "vc-1", exportTs: "2026-01-01" }]),
    getStoredRawSheetNames: vi.fn(async () => []),
    getBySnapshotIds: vi.fn(async (storeName: string) => storeName === "entities_vm"
      ? [{ snapshotId: "s1", vmKey: "vm-1", vmName: "VM-01", powerState: "poweredOn", cpuCount: 4, memoryMiB: 16_384, folder: "Prod", resourcePool: "Prod" }]
      : []),
    getRawSheetRows: empty,
    getRawSheetFieldNamesBySnapshot: vi.fn(async () => ({})),
    getImportedStoreRecords: empty,
    getAllTechInfoLatest: empty,
    getAllTechInfoClientLatest: empty,
    getAllCdpLatest: empty,
    getAllIpamLatest: empty,
    getAllEramonIfaceLatest: empty,
    getAllEramonL2Latest: empty,
    getAllVropsLatest: empty,
    getVropsTimeSeriesImports: vi.fn(async () => [VROPS_IMPORT]),
    getVropsTimeSeriesObjects: vi.fn(async () => objects),
    getVropsTimeSeriesChunks: vi.fn(async () => chunks),
    getVropsTimeSeriesSummaries: empty,
    getCapacityPolicies: empty,
    getCapacityPolicyAssignments: empty,
    buildFillUpPlanningResultsInWorker: vi.fn(async () => []),
  } as unknown as PreloadDependencies;
}

describe("FillUpPlanningPanel", () => {
  it("übernimmt nach dem Vorladen die vorberechnete Auswertung ohne Neuberechnung", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { ...IMPORTED_DATA_QUERY_DEFAULTS, retry: false } },
    });
    await preloadImportedData(queryClient, { dependencies: preloadDependencies() });
    mocks.buildInWorker.mockClear();

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider><FillUpPlanningPanel /></TooltipProvider>
      </QueryClientProvider>,
    );

    // Startet mit dem vorberechneten HIGH-Durchschnitt (4 vCPU, 16 GiB) statt dem HIGH-Standardprofil …
    expect(screen.getByDisplayValue("HIGH · Ø alle VMs")).toBeInTheDocument();
    // … und trifft damit den vorberechneten Query-Key: keine Worker-Berechnung, kein Wartehinweis.
    expect(mocks.buildInWorker).not.toHaveBeenCalled();
    expect(screen.queryByText(/Daten werden berechnet/)).not.toBeInTheDocument();
  });
});
