import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import { NET_AUDIT_KPI, NET_MAC_DISCOVERY_COLUMNS } from "@/lib/glossaries/networking";
import type { NetworkAuditSourceFacts } from "@/lib/networkAuditViewModel";

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
  useNetworkAudit: (): {
    rows: PortAuditRow[];
    hostQuality: {
      rvtoolsRows: RvtoolsHostQualityRow[];
      techInfoRows: TechInfoHostQualityRow[];
    };
    cdpMacRows: CdpMacRow[];
    l2DiscoveryRows: L2DiscoveryRow[];
    sources: NetworkAuditSourceFacts;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
  } => ({
    rows: [textMatchRow],
    hostQuality: { rvtoolsRows: [], techInfoRows: [] },
    cdpMacRows: [],
    l2DiscoveryRows: [],
    sources: {
      rvtools: { count: 1, importedAt: null },
      cdp: { count: 0, importedAt: null },
      eramonIface: { count: 1, importedAt: null },
      eramonL2: { count: 0, importedAt: null },
      ipam: { count: 0, importedAt: null },
      techInfo: { count: 0, importedAt: null },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => Promise.resolve(),
  }),
}));

vi.mock("@/hooks/useFilterState", () => ({
  useFilterState: () => ({ filters: { search: "" } }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: function VirtualTableMock({
    columns,
    data,
    exportFileName,
    onFilteredRowCountChange,
  }: {
    columns: Array<{
      accessorKey?: string;
      id?: string;
      meta?: { info?: { term: string } };
      cell: (context: {
        getValue: () => unknown;
        row: { original: PortAuditRow };
      }) => ReactNode;
    }>;
    data: PortAuditRow[];
    exportFileName: string;
    onFilteredRowCountChange?: (count: number) => void;
  }) {
    useEffect(() => {
      onFilteredRowCountChange?.(data.length);
    }, [data.length, onFilteredRowCountChange]);

    return (
      <div data-testid={`table-${exportFileName}`}>
        <div data-testid="network-audit-table-columns">
          {columns.map((column) => column.meta?.info?.term ?? "").join("|")}
        </div>
        {data.map((row) => (
          <div key={row.switchInterfaceKey}>
            {columns.map((column) => (
              <span key={column.id ?? column.accessorKey}>
                {column.cell({
                  getValue: () => row[column.accessorKey as keyof PortAuditRow],
                  row: { original: row },
                })}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderPorts() {
  return render(
    <MemoryRouter
      initialEntries={["/network-security?tab=audit&check=ports&scope=all"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <NetworkAuditPanel />
    </MemoryRouter>,
  );
}

describe("NetworkAuditPanel port detail", () => {
  it("öffnet die URL-gesteuerte Port-Prüfung im neuen Orchestrator", () => {
    renderPorts();

    expect(screen.getByRole("heading", { name: "Netzwerk-Kontrolle" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Switch-Port-Zuordnungen" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Switch-Ports" })).toHaveAttribute("data-state", "active");
  });

  it("kennzeichnet einen RVTools-Beschreibungstreffer im Match-Status eindeutig", () => {
    renderPorts();

    expect(screen.getByText("RVTools-Treffer")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("bewahrt die fachlichen Spalten der Port-Kontrolle", () => {
    renderPorts();

    expect(screen.getByTestId("network-audit-table-columns")).toHaveTextContent(
      "Switch|Interface|Port-Beschreibung|Port-Status|Bandbreite|Match-Status|Vermuteter ESXi-Host|Auffälligkeit",
    );
    expect(screen.getByTestId("network-audit-table-columns")).not.toHaveTextContent("Quelle");
  });

  it("beschreibt die neuen Übersicht-KPIs fachlich", () => {
    expect(NET_AUDIT_KPI.critical.description).toContain("Widersprüche");
    expect(NET_AUDIT_KPI.review.description).toContain("Datenlücken");
    expect(NET_AUDIT_KPI.passed.description).toContain("bestätigter Zuordnung");
  });

  it("erklärt die L2-Discovery-Klassifikation und VLAN-Zuordnung verständlich", () => {
    expect(NET_MAC_DISCOVERY_COLUMNS.classification.description).toContain("IPAM-bekannt");
    expect(NET_MAC_DISCOVERY_COLUMNS.classification.description).toContain("kein CDP-Treffer");
    expect(NET_MAC_DISCOVERY_COLUMNS.vlan.description).toContain("Layer-2-Segment");
  });
});
