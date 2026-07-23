import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "./NetworkAuditPanel";
import type { PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useNetworkAudit: () => ({
    rows: [{ switchInterfaceKey: "sw01::eth1/1", switchHostname: "sw01", interface: "Eth1/1", description: null, status: "aktiv", matchStatus: "confirmed-cdp", matchedHost: "esx01", matchedSource: "cdp", labelConflict: false, labelConflictHost: null, statusConflict: false, bandwidthBps: null, finding: null }] as PortAuditRow[],
    hostQuality: {
      rvtoolsRows: [{ host: "esx02.lab.local", cluster: "Prod", version: "8.0", connectionState: "Connected", techInfoPresent: false, techInfoServerType: null, techInfoDepartment: null, ipamPresent: false, ipamAddresses: [], ipamNetworks: [], finding: "Tech-Info fehlt · IPAM fehlt" }] as RvtoolsHostQualityRow[],
      techInfoRows: [{ techInfoName: "esx03.lab.local", serverType: "ESXi", department: "Platform", maintenanceWindow: null, rvtoolsPresent: false, rvtoolsHost: null, rvtoolsCluster: null, ipamPresent: true, ipamAddresses: ["10.10.20.3"], ipamNetworks: ["10.10.20.0/24"], finding: "RVTools-Host fehlt" }] as TechInfoHostQualityRow[],
    },
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns, data }: { columns: Array<{ meta?: { info?: { term: string } } }>; data: Array<Record<string, unknown>> }) => (
    <div data-testid="host-quality-table-columns">{columns.map((column) => column.meta?.info?.term ?? "").join("|")} {data.flatMap((row) => Object.values(row).flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : []) as string[]).join(" | ")}</div>
  ),
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("NetworkAuditPanel host data quality", () => {
  it("zeigt getrennte Datenqualitäts-Tabellen für RVTools- und Tech-Info-Objekte", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByRole("heading", { name: "Host-Datenabgleich" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ESXi aus RVTools/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Objekte aus Tech-Info/ })).toBeInTheDocument();
    expect(screen.getByText(/esx02\.lab\.local/)).toBeInTheDocument();
    expect(screen.getByText(/10\.10\.20\.0\/24/)).toBeInTheDocument();
  });

  it("erklärt alle Spalten des Host-Datenabgleichs", () => {
    render(<NetworkAuditPanel />);

    const tables = screen.getAllByTestId("host-quality-table-columns");
    expect(tables[1]).toHaveTextContent("ESXi-Host aus RVTools|Cluster|ESXi-Version|Tech-Info vorhanden|Servertyp|Abteilung|IPAM vorhanden|IP-Adressen|IPAM-Netze|Datenlücke");
    expect(tables[2]).toHaveTextContent("Objekt aus Tech-Info|RVTools vorhanden|ESXi-Host aus RVTools|Cluster|IPAM vorhanden|IP-Adressen|Datenlücke");
  });
});
