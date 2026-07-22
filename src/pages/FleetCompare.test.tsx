import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

const snapshots = [{
  snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z",
  fileName: "prod.xlsx", fileChecksum: "checksum", sheetStats: {},
}];

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "snapshots" ? snapshots : [],
    isPending: false,
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: () => <div data-testid="virtual-table" />,
}));

const { default: FleetCompare } = await import("./FleetCompare");

describe("FleetCompare", () => {
  it("shows vCenter KPIs directly below the page heading for a single vCenter", () => {
    render(
      <MemoryRouter>
        <TooltipProvider><FleetCompare /></TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "vCenter" })).toBeInTheDocument();
    expect(screen.getByText("VMs Gesamt")).toBeInTheDocument();
    expect(screen.getByText("Hosts Gesamt")).toBeInTheDocument();
    expect(screen.getByText("Risiko Total")).toBeInTheDocument();
    expect(screen.queryByText("Fleet Compare")).not.toBeInTheDocument();
  });
});
