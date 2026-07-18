import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
import type { PortAuditRow } from "@/lib/networkAudit";

const textMatchRow: PortAuditRow = {
  switchInterfaceKey: "sw01::eth1/1",
  switchHostname: "sw01",
  interface: "Eth1/1",
  description: "esx01_Port1",
  status: "connected",
  matchStatus: "text-match",
  matchedHost: "esx01",
  matchedSource: "rvtools",
  labelConflict: false,
  labelConflictHost: null,
  statusConflict: false,
  finding: null,
};

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useNetworkAudit: () => ({ rows: [textMatchRow], isLoading: false }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns, data }: { columns: Array<{ accessorKey?: string; id?: string; cell: (context: { getValue: () => unknown; row: { original: PortAuditRow } }) => React.ReactNode }>; data: PortAuditRow[] }) => (
    <table>
      <tbody>
        {data.map((row) => (
          <tr key={row.switchInterfaceKey}>
            {columns.map((column) => <td key={column.id ?? column.accessorKey}>{column.cell({ getValue: () => row[column.accessorKey as keyof PortAuditRow], row: { original: row } })}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe("NetworkAuditPanel", () => {
  it("kennzeichnet einen RVTools-Beschreibungstreffer im Match-Status eindeutig", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByText("RVTools-Treffer")).toBeInTheDocument();
  });
});
