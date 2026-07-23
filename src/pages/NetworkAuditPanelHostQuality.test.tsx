import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "./NetworkAuditPanel";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import type { NetworkAuditSourceFacts } from "@/lib/networkAuditViewModel";

const rvtoolsRows: RvtoolsHostQualityRow[] = [{
  host: "esx02.lab.local",
  cluster: "Prod",
  version: "8.0",
  connectionState: "Connected",
  techInfoPresent: false,
  techInfoServerType: null,
  techInfoDepartment: null,
  ipamPresent: false,
  ipamAddresses: [],
  ipamNetworks: [],
  finding: "Tech-Info fehlt · IPAM fehlt",
}];

const techInfoRows: TechInfoHostQualityRow[] = [{
  techInfoName: "esx03.lab.local",
  serverType: "ESXi",
  department: "Platform",
  maintenanceWindow: null,
  rvtoolsPresent: false,
  rvtoolsHost: null,
  rvtoolsCluster: null,
  ipamPresent: true,
  ipamAddresses: ["10.10.20.3"],
  ipamNetworks: ["10.10.20.0/24"],
  finding: "RVTools-Host fehlt",
}];

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
    rows: [{
      switchInterfaceKey: "sw01::eth1/1",
      switchHostname: "sw01",
      interface: "Eth1/1",
      description: null,
      status: "aktiv",
      matchStatus: "confirmed-cdp",
      matchedHost: "esx01",
      matchedSource: "cdp",
      labelConflict: false,
      labelConflictHost: null,
      statusConflict: false,
      bandwidthBps: null,
      finding: null,
    }] as PortAuditRow[],
    hostQuality: { rvtoolsRows, techInfoRows },
    cdpMacRows: [],
    l2DiscoveryRows: [],
    sources: {
      rvtools: { count: 1, importedAt: null },
      cdp: { count: 1, importedAt: null },
      eramonIface: { count: 1, importedAt: null },
      eramonL2: { count: 0, importedAt: null },
      ipam: { count: 1, importedAt: null },
      techInfo: { count: 1, importedAt: null },
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
    columns: Array<{ meta?: { info?: { term: string } } }>;
    data: Array<Record<string, unknown>>;
    exportFileName: string;
    onFilteredRowCountChange?: (count: number) => void;
  }) {
    useEffect(() => {
      onFilteredRowCountChange?.(data.length);
    }, [data.length, onFilteredRowCountChange]);

    return (
      <div data-testid={`table-${exportFileName}`}>
        <span data-testid={`${exportFileName}-columns`}>
          {columns.map((column) => column.meta?.info?.term ?? "").join("|")}
        </span>
        {" "}
        {data.flatMap((row) => Object.values(row).flatMap((value) => (
          Array.isArray(value) ? value : typeof value === "string" ? [value] : []
        ))).join(" | ")}
      </div>
    );
  },
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderHosts() {
  return render(
    <MemoryRouter
      initialEntries={["/network-security?tab=audit&check=hosts&scope=all"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <NetworkAuditPanel />
    </MemoryRouter>,
  );
}

describe("NetworkAuditPanel host data quality", () => {
  it("zeigt im Host-Detail jeweils genau eine Datenperspektive", () => {
    renderHosts();

    expect(screen.getByRole("heading", { name: "Host-Datenqualität" })).toBeInTheDocument();
    expect(screen.getByTestId("table-host-data-quality-rvtools")).toHaveTextContent("esx02.lab.local");
    expect(screen.queryByTestId("table-host-data-quality-techinfo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Aus Tech-Info" }));

    expect(screen.queryByTestId("table-host-data-quality-rvtools")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-host-data-quality-techinfo")).toHaveTextContent("esx03.lab.local");
    expect(screen.getByTestId("table-host-data-quality-techinfo")).toHaveTextContent("10.10.20.0/24");
  });

  it("bewahrt die Spaltensätze beider Host-Perspektiven", () => {
    renderHosts();

    expect(screen.getByTestId("host-data-quality-rvtools-columns")).toHaveTextContent(
      "ESXi-Host aus RVTools|Cluster|ESXi-Version|Tech-Info vorhanden|Servertyp|Abteilung|IPAM vorhanden|IP-Adressen|IPAM-Netze|Datenlücke",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Aus Tech-Info" }));

    expect(screen.getByTestId("host-data-quality-techinfo-columns")).toHaveTextContent(
      "Objekt aus Tech-Info|RVTools vorhanden|ESXi-Host aus RVTools|Cluster|IPAM vorhanden|IP-Adressen|Datenlücke",
    );
  });
});
