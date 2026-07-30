import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFleetQuerySnapshotIds } from "@/lib/fleetQuery";
import type { ReactNode } from "react";

const prodSnapshot = {
  snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z",
  fileName: "prod.xlsx", fileChecksum: "checksum", sheetStats: {},
};
const oldProdSnapshot = {
  snapshotId: "snap-old", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-01T00:00:00.000Z", importedAt: "2026-07-01T00:00:00.000Z",
  fileName: "prod-old.xlsx", fileChecksum: "checksum-old", sheetStats: {},
};
const testSnapshot = {
  snapshotId: "snap-2", vcenterId: "vc-2", vcenterDisplayName: "vcenter-test",
  exportTs: "2026-07-23T00:00:00.000Z", importedAt: "2026-07-23T00:00:00.000Z",
  fileName: "test.xlsx", fileChecksum: "checksum-test", sheetStats: {},
};
const snapshots = [prodSnapshot, oldProdSnapshot];
let querySnapshots = snapshots;
let mockFilters = { vcenterIds: [] as string[], search: "" };

vi.mock("@/hooks/useFilterState", () => ({
  useFilterState: () => ({
    filters: mockFilters,
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "snapshots"
      ? querySnapshots
      : queryKey[0] === "vms"
        ? [
            { snapshotId: "snap-1", powerState: "poweredOn", cpuCount: 2 },
            { snapshotId: "snap-1", powerState: "poweredOff", cpuCount: 1 },
            { snapshotId: "snap-2", powerState: "poweredOn", cpuCount: 4 },
          ]
        : queryKey[0] === "hosts"
          ? [
              { snapshotId: "snap-1" },
              { snapshotId: "snap-2" },
              { snapshotId: "snap-2" },
            ]
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

vi.mock("@/components/charts/recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: Array<{ name: string }>; children: ReactNode }) => (
    <div data-testid="compare-chart" data-names={data.map((entry) => entry.name).join(",")}>{children}</div>
  ),
  XAxis: (): null => null,
  YAxis: (): null => null,
  Tooltip: (): null => null,
  Legend: (): null => null,
  Bar: (): null => null,
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

vi.mock("@/components/vmware-versions/VmwareReleaseTables", () => ({
  VCenterVersionsTable: () => <div>Neueste vCenter Versionen</div>,
}));

vi.mock("@/components/licensing/LicenseDetailsTable", () => ({
  LicenseDetailsTable: () => <div>Lizenz Details</div>,
}));

vi.mock("@/lib/licenseDetails", () => ({
  getLicenseRows: (): [] => [],
}));

const { default: FleetCompare } = await import("./FleetCompare");

describe("FleetCompare", () => {
  beforeEach(() => {
    querySnapshots = snapshots;
    mockFilters = { vcenterIds: [], search: "" };
  });

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

  it("wendet die vCenter-Auswahl auf Übersicht, KPIs und Diagrammdaten an", () => {
    querySnapshots = [...snapshots, testSnapshot];
    mockFilters = { vcenterIds: ["vc-2"], search: "" };

    render(
      <MemoryRouter>
        <TooltipProvider><FleetCompare /></TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("vcenter-test")).toBeInTheDocument();
    expect(screen.queryByText("vcenter-prod")).not.toBeInTheDocument();
    expect(screen.getByText("VMs Gesamt").closest(".rounded-lg.border")).toHaveTextContent("1");
    expect(screen.getByText("Hosts Gesamt").closest(".rounded-lg.border")).toHaveTextContent("2");
    expect(screen.getByTestId("compare-chart")).toHaveAttribute("data-names", "vcenter-test");
  });

  it("filtert die gesamte vCenter-Auswertung per Suche nach Anzeigename", () => {
    querySnapshots = [...snapshots, testSnapshot];
    mockFilters = { vcenterIds: [], search: "PROD" };

    render(
      <MemoryRouter>
        <TooltipProvider><FleetCompare /></TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("vcenter-prod")).toBeInTheDocument();
    expect(screen.queryByText("vcenter-test")).not.toBeInTheDocument();
    expect(screen.getByText("VMs Gesamt").closest(".rounded-lg.border")).toHaveTextContent("2");
    expect(screen.getByText("Hosts Gesamt").closest(".rounded-lg.border")).toHaveTextContent("1");
    expect(screen.getByTestId("compare-chart")).toHaveAttribute("data-names", "vcenter-prod");
  });
});
