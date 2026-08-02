import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useVmsWithTechInfo: () => ({ vmsWithTechInfo: [] as NormalizedVm[], isLoading: false }),
  useRawSheet: (sheet: string) => ({
    data: sheet === "vTools"
      ? [{ snapshotId: "snap-1", sheetName: "vTools", rowIndex: 0, data: { VM: "vm-01", Cluster: "Production", Upgradeable: "yes" } }]
      : [] as SheetRow[],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useGlobalVmFilter", () => ({
  useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows }),
}));

vi.mock("@/hooks/useVmDetailDialog", () => ({
  useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as React.ReactNode }),
}));

vi.mock("@/components/vm/VmInventoryTable", () => ({
  VmInventoryTable: () => <div>Virtuelle Maschinen</div>,
}));
vi.mock("@/components/vm/VmOperationsPanel", () => ({
  VmOperationsPanel: () => <div>VM Snapshots</div>,
}));
vi.mock("@/components/vm/VmPerformancePanel", () => ({
  VmPerformancePanel: () => <div>CPU Ready Details</div>,
}));
vi.mock("@/components/vm/VmComplianceLifecyclePanel", () => ({
  VmComplianceLifecyclePanel: () => <div>VM Compliance</div>,
}));
vi.mock("@/components/vm/VmWorkloadProfilePanel", () => ({
  VmWorkloadProfilePanel: () => <div>VM-Profile Panel</div>,
}));
vi.mock("@/components/vm/VmRightsizingPanel", () => ({
  VmRightsizingPanel: () => <div>Rightsizing Panel</div>,
}));
vi.mock("@/components/vm/VmRamRightsizingPanel", () => ({
  VmRamRightsizingPanel: () => <div>RAM-Rightsizing Panel</div>,
}));
vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: () => <div>VMTools Wellen-Tabelle</div>,
}));

const { default: Vms } = await import("./Vms");

describe("VMs", () => {
  it("bündelt die VM-Übersicht in ihre Sitzungstabs", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TooltipProvider>
            <Vms />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "VMs" })).toBeInTheDocument();
    expect(screen.getByText("VMs gesamt")).toBeInTheDocument();
    expect(screen.getByText("Konfigurationsprobleme")).toBeInTheDocument();
    expect(screen.getByText("Virtuelle Maschinen")).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "Betrieb" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Performance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Compliance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "VM-Profile" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "CPU Rightsizing" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "RAM-Rightsizing" })).toBeInTheDocument();
  });

  it("öffnet einen VM-Untertab aus der URL", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/vms?tab=performance"]}>
          <TooltipProvider>
            <Vms />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("tab", { name: "Performance" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("CPU Ready Details")).toBeInTheDocument();
  });
});
