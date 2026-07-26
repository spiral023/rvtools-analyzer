import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useVmsWithTechInfo: () => ({ vmsWithTechInfo: [], isLoading: false }),
}));

vi.mock("@/pages/Overview", () => ({
  VmInventoryTable: () => <div>Virtuelle Maschinen</div>,
}));
vi.mock("@/pages/PerformancePage", () => ({
  VmPerformanceDetails: () => <div>CPU Ready Details</div>,
}));
vi.mock("@/pages/DailyOps", () => ({
  VmDailyOpsDetails: () => <div>VM Snapshots</div>,
}));
vi.mock("@/pages/ComplianceLifecycle", () => ({
  VmComplianceDetails: () => <div>VM Compliance</div>,
}));

const { default: Vms } = await import("./Vms");

describe("VMs", () => {
  it("bündelt die VM-Übersicht und VM-spezifische Detailbereiche", () => {
    render(<MemoryRouter><TooltipProvider><Vms /></TooltipProvider></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "VMs" })).toBeInTheDocument();
    expect(screen.getByText("VMs gesamt")).toBeInTheDocument();
    expect(screen.getByText("Konfigurationsprobleme")).toBeInTheDocument();
    expect(screen.getByText("Virtuelle Maschinen")).toBeInTheDocument();
    expect(screen.getByText("CPU Ready Details")).toBeInTheDocument();
    expect(screen.getByText("VM Snapshots")).toBeInTheDocument();
    expect(screen.getByText("VM Compliance")).toBeInTheDocument();
  });
});
