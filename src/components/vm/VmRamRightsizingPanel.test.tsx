import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedVm, TechInfoLatest, VmWorkloadProfile } from "@/domain/models/types";

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

const { VmRamRightsizingPanel } = await import("./VmRamRightsizingPanel");

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
