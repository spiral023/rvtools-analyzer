import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NormalizedHost } from "@/domain/models/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useHosts: () => ({ data: [] as NormalizedHost[], isLoading: false }),
  useRawSheet: () => ({ data: [] as unknown[], isLoading: false }),
}));

vi.mock("@/components/hosts/HostInventoryPanel", () => ({
  HostInventoryPanel: () => <div>Host Inventar</div>,
}));

vi.mock("@/components/hosts/HostHygienePanel", () => ({
  HostHygienePanel: () => <div>Host-Hygiene</div>,
}));

vi.mock("@/components/vmware-versions/VmwareReleaseTables", () => ({
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
