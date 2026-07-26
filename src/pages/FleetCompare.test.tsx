import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { getFleetQuerySnapshotIds } from "@/lib/fleetQuery";

const snapshots = [{
  snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z",
  fileName: "prod.xlsx", fileChecksum: "checksum", sheetStats: {},
}, {
  snapshotId: "snap-old", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-01T00:00:00.000Z", importedAt: "2026-07-01T00:00:00.000Z",
  fileName: "prod-old.xlsx", fileChecksum: "checksum-old", sheetStats: {},
}];

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "snapshots"
      ? snapshots
      : queryKey[0] === "rawSheet" && queryKey[1] === "vSource"
        ? [{
            snapshotId: "snap-1",
            sheetName: "vSource",
            rowIndex: 0,
            data: { Build: "25413364" },
          }]
        : [],
    isPending: false,
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>;
    columns: Array<{ accessorKey?: string; header: string }>;
  }) => (
    <table>
      <thead>
        <tr>{columns.map((column) => <th key={column.accessorKey}>{column.header}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={String(row.vcenterId)}>
            {columns.map((column) => <td key={column.accessorKey}>{column.accessorKey ? String(row[column.accessorKey] ?? "—") : "—"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock("@/pages/VmwareVersions", () => ({
  VCenterVersionsTable: () => <div>Neueste vCenter Versionen</div>,
}));

vi.mock("@/components/licensing/LicenseDetailsTable", () => ({
  LicenseDetailsTable: () => <div>Lizenz Details</div>,
}));

vi.mock("@/lib/licenseDetails", () => ({
  getLicenseRows: () => [],
}));

const { default: FleetCompare } = await import("./FleetCompare");

describe("FleetCompare", () => {
  it("verwendet für Queries alle importierten Snapshot-IDs", () => {
    expect(getFleetQuerySnapshotIds(snapshots)).toEqual(["snap-1", "snap-old"]);
  });

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
    expect(screen.getByText("Neueste vCenter Versionen")).toBeInTheDocument();
    expect(screen.getByText("Lizenz Details")).toBeInTheDocument();
    expect(screen.queryByText("Fleet Compare")).not.toBeInTheDocument();
  });

  it("zeigt die erkannte Kurzversion direkt rechts neben dem vCenter", () => {
    render(
      <MemoryRouter>
        <TooltipProvider><FleetCompare /></TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("columnheader", { name: "Version" })).toBeInTheDocument();
    expect(screen.getByText("8.0 U3j")).toBeInTheDocument();
  });
});
