import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedVm, TechInfoLatest, VmMemoryWorkloadStats, VmRamRightsizingCandidate, VmWorkloadProfile } from "@/domain/models/types";
import { rightsizingCandidateFixture } from "@/test/fixtures/vmWorkload";
import { EMPTY_WORKLOAD_TREND } from "@/domain/services/vmWorkloadTrendService";

const mockWorkloadState = vi.hoisted(() => ({
  current: {
    imports: [{ id: "import-1" }],
    profiles: [] as VmWorkloadProfile[],
    selectedImport: { expectedSlots: 744 },
    hasMemoryWorkloadAvg: false,
    hasMemoryWorkloadMax: false,
    isLoading: false,
  },
}));

vi.mock("@/hooks/useVmWorkloadProfiles", () => ({
  useVmWorkloadProfiles: () => mockWorkloadState.current,
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useVms: () => ({ vms: [] as NormalizedVm[], allVms: [] as NormalizedVm[], isLoading: false }),
  useTechInfoLatestByVmNames: () => ({ data: [] as TechInfoLatest[] }),
}));

vi.mock("@/hooks/useVmDetailDialog", () => ({
  useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as ReactNode }),
}));

const { RecommendedMemoryCell, VmRamRightsizingPanel } = await import("./VmRamRightsizingPanel");
const { RecommendedVcpuCell } = await import("./VmRightsizingPanel");

const memoryStats: VmMemoryWorkloadStats = {
  expectedHours: 168,
  presentHours: 168,
  missingHours: 0,
  coverageRatio: 1,
  average: 30,
  p50: 30,
  p95: 40,
  p99: 50,
  p995: 60,
  maximum: 70,
};

function ramCandidate(overrides: Partial<VmRamRightsizingCandidate> = {}): VmRamRightsizingCandidate {
  return {
    objectKey: "vm-01",
    rvtoolsObjectKey: "vm-01",
    policyLevel: "balanced",
    normalStatistic: "p95",
    peakStatistic: "p995",
    vmName: "vm-01",
    clusterKey: "cluster-01",
    clusterName: "Cluster 01",
    configuredMemoryMiB: 6_144,
    expectedHours: 168,
    presentHours: 168,
    coverageRatio: 1,
    workloadAvg: memoryStats,
    workloadMax: memoryStats,
    normalDemandRequirementMiB: 2_458,
    peakRequirementMiB: 3_686,
    requiredMemoryMiB: 3_686,
    targetMemoryBeforeRoundingMiB: 4_096,
    recommendedMemoryMiB: 4_096,
    deltaMiB: -2_048,
    direction: "shrink",
    confidence: "high",
    trend: EMPTY_WORKLOAD_TREND,
    recommendationReason: null,
    peakSignalUsed: true,
    ...overrides,
  };
}

describe("VmRamRightsizingPanel", () => {
  it("zeigt einen verständlichen Empty State ohne Memory Workload Avg", () => {
    render(
      <MemoryRouter>
        <VmRamRightsizingPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Keine Memory-Workload-Metrik" })).toBeInTheDocument();
    expect(screen.getByText(/noch keine verwertbare Memory\|Workload\|Avg-Spalte/i)).toBeInTheDocument();
  });

  it("unterscheidet einen komplett fehlenden vROps-Import", () => {
    mockWorkloadState.current = {
      ...mockWorkloadState.current,
      imports: [],
      selectedImport: null,
    };

    render(
      <MemoryRouter>
        <VmRamRightsizingPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Kein vROps-Zeitreihenimport" })).toBeInTheDocument();
  });
});

describe("RecommendedVcpuCell", () => {
  it("zeigt die vCPU-Differenz direkt in der Empfehlung", () => {
    render(
      <RecommendedVcpuCell candidate={rightsizingCandidateFixture({
        objectKey: "vm-01",
        recommendedVcpu: 4,
        reclaimableVcpu: 2,
      })} />,
    );

    expect(screen.getByText("4 vCPU")).toBeInTheDocument();
    expect(screen.getByText("−2 vCPU rückgewinnbar")).toBeInTheDocument();
  });
});

describe("RecommendedMemoryCell", () => {
  it("zeigt die RAM-Differenz direkt in der Empfehlung", () => {
    render(
      <RecommendedMemoryCell candidate={ramCandidate()} />,
    );

    expect(screen.getByText("4.0 GiB")).toBeInTheDocument();
    expect(screen.getByText("−2.0 GiB rückgewinnbar")).toBeInTheDocument();
  });
});
