import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
import type { PortAuditRow } from "@/lib/networkAudit";
import { NET_MAC_DISCOVERY_COLUMNS } from "@/lib/glossaries/networking";

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
  bandwidthBps: null,
  finding: null,
};

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useNetworkAudit: () => ({ rows: [textMatchRow], isLoading: false }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns, data }: { columns: Array<{ accessorKey?: string; id?: string; meta?: { info?: { term: string } }; cell: (context: { getValue: () => unknown; row: { original: PortAuditRow } }) => React.ReactNode }>; data: PortAuditRow[] }) => (
    <>
      <div data-testid="network-audit-table-columns">{columns.map((column) => column.meta?.info?.term ?? "").join("|")}</div>
      <table>
        <tbody>
          {data.map((row) => (
            <tr key={row.switchInterfaceKey}>
              {columns.map((column) => <td key={column.id ?? column.accessorKey}>{column.cell({ getValue: () => row[column.accessorKey as keyof PortAuditRow], row: { original: row } })}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  ),
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div data-testid={`tooltip-${entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}>{children}</div>
  ),
}));

describe("NetworkAuditPanel", () => {
  it("kennzeichnet einen RVTools-Beschreibungstreffer im Match-Status eindeutig", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByText("RVTools-Treffer")).toBeInTheDocument();
  });

  it("erklärt die Eramon-basierenden Kennzahlen der Netzwerkkontrolle per Tooltip", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByTestId("tooltip-ports-gesamt")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-cdp-best-tigt")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-nur-dokumentiert")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-unbekannt")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-status-konflikte")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-beschriftungs-konflikte")).toBeInTheDocument();
  });

  it("erklärt alle Spalten der Kontroll-Tabelle", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getAllByTestId("network-audit-table-columns")[0]).toHaveTextContent("Switch|Interface|Port-Beschreibung|Port-Status|Bandbreite|Match-Status|Vermuteter ESXi-Host|Auffälligkeit");
    expect(screen.getAllByTestId("network-audit-table-columns")[0]).not.toHaveTextContent("Quelle");
  });

  it("zeigt bei Objekten aus Tech-Info nur die für den Abgleich relevanten Spalten", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getAllByTestId("network-audit-table-columns")[2]).toHaveTextContent(
      "Objekt aus Tech-Info|RVTools vorhanden|ESXi-Host aus RVTools|Cluster|IPAM vorhanden|IP-Adressen|Datenlücke",
    );
  });

  it("erklärt die L2-Discovery-Klassifikation und VLAN-Zuordnung verständlich", () => {
    expect(NET_MAC_DISCOVERY_COLUMNS.classification.description).toContain("IPAM-bekannt");
    expect(NET_MAC_DISCOVERY_COLUMNS.classification.description).toContain("kein CDP-Treffer");
    expect(NET_MAC_DISCOVERY_COLUMNS.vlan.description).toContain("Layer-2-Segment");
  });
});
