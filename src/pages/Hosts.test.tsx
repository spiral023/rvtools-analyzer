import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useHosts: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/components/hosts/HostInventoryPanel", () => ({
  HostInventoryPanel: () => <div>Host Inventar</div>,
}));

vi.mock("@/pages/VmwareVersions", () => ({
  EsxiVersionsTable: () => <div>Neueste ESXi Versionen</div>,
}));

const { default: Hosts } = await import("./Hosts");

describe("Hosts", () => {
  it("zeigt Host-Inventar und die neuesten ESXi-Versionen", () => {
    render(<MemoryRouter><TooltipProvider><Hosts /></TooltipProvider></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Hosts" })).toBeInTheDocument();
    expect(screen.getByText("ESXi Hosts")).toBeInTheDocument();
    expect(screen.getByText("Wartungsmodus")).toBeInTheDocument();
    expect(screen.getByText("Host Inventar")).toBeInTheDocument();
    expect(screen.getByText("Neueste ESXi Versionen")).toBeInTheDocument();
  });
});
