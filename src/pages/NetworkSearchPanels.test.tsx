import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HostDataAuditDetail,
  MacAuditDetail,
  NetworkDiscoveryDetail,
  PortAuditDetail,
} from "@/components/network/NetworkAuditDetails";
import { IpamPanel } from "./IpamPanel";
import type { IpamLatest } from "@/domain/models/types";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow, PortMatchStatus } from "@/lib/networkAudit";
import type {
  NetworkAuditCheckId,
  NetworkAuditCheckSummary,
  NetworkAuditScope,
  NetworkAuditSourceFacts,
} from "@/lib/networkAuditViewModel";
import { NetworkAuditPanel } from "./NetworkAuditPanel";

const search = "core-01";

const { refetchMock, useNetworkAuditMock } = vi.hoisted(() => ({
  refetchMock: vi.fn(),
  useNetworkAuditMock: vi.fn(),
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search } }),
  useNetworkAudit: useNetworkAuditMock,
  useAllIpamLatest: () => ({
    data: [{
      ipAddress: "10.0.0.10", name: "core-01", status: "Used", type: null, usage: null,
      firstDiscovered: null, lastDiscovered: null, comment: null, site: null, macAddress: null,
      os: null, netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null,
    }] as IpamLatest[],
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: function VirtualTableMock({
    data,
    exportFileName,
    globalFilter,
    emptyTitle = "Keine Einträge",
    emptyDescription,
    onFilteredRowCountChange,
  }: {
    data: Array<Record<string, unknown>>;
    exportFileName: string;
    globalFilter?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    onFilteredRowCountChange?: (count: number) => void;
  }) {
    const filteredData = globalFilter
      ? data.filter((row) => JSON.stringify(row).toLowerCase().includes(globalFilter.toLowerCase()))
      : data;

    useEffect(() => {
      onFilteredRowCountChange?.(filteredData.length);
    }, [filteredData.length, onFilteredRowCountChange]);

    return (
      <div
        data-testid={`table-${exportFileName}`}
        data-global-filter={globalFilter ?? ""}
        data-row-count={data.length}
      >
        {filteredData.length > 0
          ? filteredData.map((row) => Object.values(row).filter((value) => typeof value === "string").join(" ")).join(" | ")
          : (
            <>
              <p>{emptyTitle}</p>
              {emptyDescription && <p>{emptyDescription}</p>}
            </>
          )}
      </div>
    );
  },
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function readySummary(
  id: NetworkAuditCheckId,
  counts: NetworkAuditCheckSummary["counts"] = { critical: 0, review: 0, passed: 0 },
): NetworkAuditCheckSummary {
  return {
    id,
    readiness: "ready",
    status: counts.critical > 0 ? "critical" : counts.review > 0 ? "review" : "passed",
    counts,
    missingRequired: [],
    missingOptional: [],
  };
}

function unavailableSummary(id: NetworkAuditCheckId): NetworkAuditCheckSummary {
  const missingRequired: Record<NetworkAuditCheckId, NetworkAuditCheckSummary["missingRequired"]> = {
    ports: ["eramonIface"],
    hosts: ["rvtools"],
    mac: ["cdp", "eramonL2"],
    discovery: ["eramonL2"],
  };
  return {
    ...readySummary(id),
    readiness: "unavailable",
    status: "unavailable",
    missingRequired: missingRequired[id],
  };
}

const sharedCallbacks = {
  onBack: vi.fn(),
  onScopeChange: vi.fn(),
};

function portRow(
  switchHostname: string,
  matchStatus: PortMatchStatus,
  overrides: Partial<PortAuditRow> = {},
): PortAuditRow {
  return {
    switchInterfaceKey: `${switchHostname}::eth1/1`,
    switchHostname,
    interface: "Eth1/1",
    description: `${switchHostname}_Port1`,
    status: "aktiv",
    matchStatus,
    matchedHost: null,
    matchedSource: null,
    labelConflict: false,
    labelConflictHost: null,
    statusConflict: false,
    bandwidthBps: null,
    finding: null,
    ...overrides,
  };
}

const portRows: PortAuditRow[] = [
  portRow("label-conflict", "confirmed-cdp", { labelConflict: true, finding: "Beschriftung weicht ab" }),
  portRow("status-conflict", "confirmed-cdp", { statusConflict: true, finding: "Status weicht ab" }),
  portRow("unknown-port", "unknown", { finding: "Kein bekannter Host gefunden" }),
  portRow("documented-port", "documented-only", { finding: "Nur dokumentiert" }),
  portRow("text-match-port", "text-match"),
  portRow("clean-cdp-port", "confirmed-cdp"),
  portRow("no-target-port", "no-target"),
];

const rvtoolsRows: RvtoolsHostQualityRow[] = [
  {
    host: "rv-gap.lab.local",
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
  },
  {
    host: "rv-clean.lab.local",
    cluster: "Prod",
    version: "8.0",
    connectionState: "Connected",
    techInfoPresent: true,
    techInfoServerType: "ESXi",
    techInfoDepartment: "Platform",
    ipamPresent: true,
    ipamAddresses: ["10.0.0.11"],
    ipamNetworks: ["10.0.0.0/24"],
    finding: null,
  },
];

const techInfoRows: TechInfoHostQualityRow[] = [
  {
    techInfoName: "tech-gap-01.lab.local",
    serverType: "ESXi",
    department: "Platform",
    maintenanceWindow: null,
    rvtoolsPresent: false,
    rvtoolsHost: null,
    rvtoolsCluster: null,
    ipamPresent: true,
    ipamAddresses: ["10.0.0.21"],
    ipamNetworks: ["10.0.0.0/24"],
    finding: "RVTools-Host fehlt",
  },
  {
    techInfoName: "tech-gap-02.lab.local",
    serverType: "ESXi",
    department: "Platform",
    maintenanceWindow: null,
    rvtoolsPresent: true,
    rvtoolsHost: "tech-gap-02.lab.local",
    rvtoolsCluster: "Prod",
    ipamPresent: false,
    ipamAddresses: [],
    ipamNetworks: [],
    finding: "IPAM fehlt",
  },
  {
    techInfoName: "tech-clean.lab.local",
    serverType: "ESXi",
    department: "Platform",
    maintenanceWindow: null,
    rvtoolsPresent: true,
    rvtoolsHost: "tech-clean.lab.local",
    rvtoolsCluster: "Prod",
    ipamPresent: true,
    ipamAddresses: ["10.0.0.23"],
    ipamNetworks: ["10.0.0.0/24"],
    finding: null,
  },
];

const cdpMacRows: CdpMacRow[] = [
  {
    host: "mac-missing",
    adapter: "vmnic0",
    mac: "00:50:56:ab:cd:ef",
    macCanonical: "005056abcdef",
    inL2: false,
    l2Switch: null,
    l2Interface: null,
    vlan: null,
    learnedIp: null,
    dnsName: null,
    topologyMismatch: false,
    finding: "MAC nicht in L2-Tabelle",
  },
  {
    host: "mac-topology",
    adapter: "vmnic1",
    mac: "00:50:56:ab:cd:f0",
    macCanonical: "005056abcdf0",
    inL2: true,
    l2Switch: "core-02",
    l2Interface: "Eth1/2",
    vlan: "100",
    learnedIp: "10.0.0.31",
    dnsName: "mac-topology.lab.local",
    topologyMismatch: true,
    finding: "Topologie weicht ab",
  },
  {
    host: "mac-clean",
    adapter: "vmnic0",
    mac: "00:50:56:ab:cd:f1",
    macCanonical: "005056abcdf1",
    inL2: true,
    l2Switch: "core-01",
    l2Interface: "Eth1/3",
    vlan: "100",
    learnedIp: "10.0.0.32",
    dnsName: "mac-clean.lab.local",
    topologyMismatch: false,
    finding: null,
  },
];

const l2DiscoveryRows: L2DiscoveryRow[] = [
  {
    l2EntryKey: "core-01::eth1/4::aabbccddeeff::100",
    switchName: "core-01",
    interface: "Eth1/4",
    vlan: "100",
    mac: "aabb.ccdd.eeff",
    learnedIp: "10.0.0.41",
    dnsName: null,
    classification: "unknown",
    esxiHost: null,
  },
  {
    l2EntryKey: "core-01::eth1/5::aabbccddee00::100",
    switchName: "core-01",
    interface: "Eth1/5",
    vlan: "100",
    mac: "aabb.ccdd.ee00",
    learnedIp: "10.0.0.42",
    dnsName: "known-device.lab.local",
    classification: "ipam",
    esxiHost: null,
  },
];

type AuditHookResult = {
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
};

let auditHookResult: AuditHookResult;

beforeEach(() => {
  vi.clearAllMocks();
  refetchMock.mockResolvedValue(undefined);
  auditHookResult = {
    rows: portRows,
    hostQuality: { rvtoolsRows, techInfoRows },
    cdpMacRows,
    l2DiscoveryRows,
    sources: {
      rvtools: { count: rvtoolsRows.length, importedAt: "2026-07-20T08:00:00.000Z" },
      cdp: { count: cdpMacRows.length, importedAt: "2026-07-20T08:00:00.000Z" },
      eramonIface: { count: portRows.length, importedAt: "2026-07-20T08:00:00.000Z" },
      eramonL2: { count: l2DiscoveryRows.length, importedAt: "2026-07-20T08:00:00.000Z" },
      ipam: { count: 2, importedAt: "2026-07-20T08:00:00.000Z" },
      techInfo: { count: techInfoRows.length, importedAt: "2026-07-20T08:00:00.000Z" },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
  };
  useNetworkAuditMock.mockImplementation(() => auditHookResult);
});

function renderWithRouter(node: ReactNode) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {node}
    </MemoryRouter>,
  );
}

function LocationObserver() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAudit(route: string) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <NetworkAuditPanel />
      <LocationObserver />
    </MemoryRouter>,
  );
}

function PortScopeHarness() {
  const [scope, setScope] = useState<NetworkAuditScope>("attention");
  return (
    <PortAuditDetail
      rows={portRows}
      summary={readySummary("ports", { critical: 2, review: 3, passed: 2 })}
      scope={scope}
      search=""
      onBack={vi.fn()}
      onScopeChange={setScope}
    />
  );
}

function HostScopeHarness() {
  const [scope, setScope] = useState<NetworkAuditScope>("attention");
  return (
    <HostDataAuditDetail
      rvtoolsRows={rvtoolsRows}
      techInfoRows={techInfoRows}
      summary={readySummary("hosts", { critical: 0, review: 3, passed: 2 })}
      scope={scope}
      search=""
      onBack={vi.fn()}
      onScopeChange={setScope}
    />
  );
}

describe("Network search", () => {
  it("übergibt die globale Suche an die IPAM-Tabelle", () => {
    render(<IpamPanel />);

    expect(screen.getByTestId("table-ipam")).toHaveAttribute("data-global-filter", search);
  });

  it("zeigt im MAC-Detail nur den ESXi-MAC-Abgleich", () => {
    renderWithRouter(
      <MacAuditDetail
        rows={cdpMacRows}
        summary={readySummary("mac", { critical: 1, review: 1, passed: 1 })}
        scope="attention"
        search={search}
        {...sharedCallbacks}
      />,
    );

    expect(screen.getByTestId("table-mac-audit-cdp")).toHaveAttribute("data-global-filter", search);
    expect(screen.queryByTestId("table-mac-discovery")).not.toBeInTheDocument();
  });

  it("zeigt im Discovery-Detail nur die Netz-Discovery", () => {
    renderWithRouter(
      <NetworkDiscoveryDetail
        rows={l2DiscoveryRows}
        summary={readySummary("discovery", { critical: 0, review: 1, passed: 1 })}
        scope="attention"
        search={search}
        {...sharedCallbacks}
      />,
    );

    expect(screen.getByTestId("table-mac-discovery")).toHaveAttribute("data-global-filter", search);
    expect(screen.queryByTestId("table-mac-audit-cdp")).not.toBeInTheDocument();
  });
});

describe("Network audit orchestrator", () => {
  it("zeigt in der Standard-URL die Übersicht mit Datenbasis", () => {
    renderAudit("/network-security?tab=audit");

    expect(screen.getByRole("heading", { name: "Netzwerk-Kontrolle" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("data-state", "active");
  });

  it("öffnet den MAC-Abgleich direkt aus der URL und rendert nur dessen Tabelle", () => {
    renderAudit("/network-security?tab=audit&check=mac&scope=all");

    expect(screen.getByRole("heading", { name: "ESXi-MAC-Abgleich" })).toBeInTheDocument();
    expect(screen.getByTestId("table-mac-audit-cdp")).toBeInTheDocument();
    expect(screen.queryByTestId("table-network-audit")).not.toBeInTheDocument();
  });

  it("zeigt bei einem Ladezustand keine verfrühte Übersicht", () => {
    auditHookResult = { ...auditHookResult, isLoading: true };

    renderAudit("/network-security?tab=audit");

    expect(screen.getByRole("status", { name: "Daten werden geladen" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Datenbasis" })).not.toBeInTheDocument();
  });

  it("zeigt Fehler mit Retry statt als leeren Datenbestand", () => {
    auditHookResult = {
      ...auditHookResult,
      isError: true,
      error: new Error("IndexedDB nicht erreichbar"),
    };

    renderAudit("/network-security?tab=audit");

    expect(screen.getByText("Netzwerkdaten konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.getByText("Versuchen Sie es erneut. Ihre importierten Daten bleiben erhalten.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Datenbasis" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("fällt bei ungültiger Prüfung und ungültigem Scope sicher auf Übersicht und Handlungsbedarf zurück", () => {
    renderAudit("/network-security?tab=audit&check=ungueltig&scope=ungueltig");

    expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("data-state", "active");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Switch-Ports" }), { button: 0 });
    expect(screen.getByRole("radio", { name: "Handlungsbedarf" })).toBeChecked();
  });

  it("synchronisiert Sektion, Scope und Rückweg mit der URL und bewahrt fremde Parameter", () => {
    renderAudit("/network-security?tab=audit&check=mac&scope=all&quelle=bookmark");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Host-Daten" }), { button: 0 });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=audit&check=hosts&scope=attention&quelle=bookmark",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Bestanden" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=audit&check=hosts&scope=passed&quelle=bookmark",
    );

    fireEvent.click(screen.getByRole("button", { name: "Zur Übersicht" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=audit&check=overview&scope=attention&quelle=bookmark",
    );
  });
});

describe("Network audit details", () => {
  it("ordnet alle Port-Befundarten dem Handlungsbedarf und saubere Ports Bestanden zu", () => {
    renderWithRouter(<PortScopeHarness />);

    const table = screen.getByTestId("table-network-audit");
    expect(table).toHaveAttribute("data-row-count", "5");
    expect(table).toHaveTextContent("label-conflict");
    expect(table).toHaveTextContent("status-conflict");
    expect(table).toHaveTextContent("unknown-port");
    expect(table).toHaveTextContent("documented-port");
    expect(table).toHaveTextContent("text-match-port");
    expect(table).not.toHaveTextContent("clean-cdp-port");
    expect(table).not.toHaveTextContent("no-target-port");
    expect(screen.getByText("5 von 7 Einträgen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Bestanden" }));

    expect(table).toHaveAttribute("data-row-count", "2");
    expect(table).toHaveTextContent("clean-cdp-port");
    expect(table).toHaveTextContent("no-target-port");
    expect(table).not.toHaveTextContent("text-match-port");
    expect(screen.getByText("2 von 7 Einträgen")).toBeInTheDocument();
  });

  it("wechselt die Host-Perspektive ohne leere Auswahl und zählt nur deren gefilterte Zeilen", () => {
    renderWithRouter(
      <HostDataAuditDetail
        rvtoolsRows={rvtoolsRows}
        techInfoRows={techInfoRows}
        summary={readySummary("hosts", { critical: 0, review: 3, passed: 2 })}
        scope="attention"
        search=""
        {...sharedCallbacks}
      />,
    );

    const rvtoolsChoice = screen.getByRole("radio", { name: "Aus RVTools" });
    const techInfoChoice = screen.getByRole("radio", { name: "Aus Tech-Info" });
    expect(rvtoolsChoice).toBeChecked();
    expect(screen.getByText("Startpunkt: vCenter-Inventar")).toBeInTheDocument();
    expect(screen.getByTestId("table-host-data-quality-rvtools")).toHaveTextContent("rv-gap.lab.local");
    expect(screen.getByTestId("table-host-data-quality-rvtools")).not.toHaveTextContent("rv-clean.lab.local");
    expect(screen.getByText("1 von 2 Einträgen")).toBeInTheDocument();

    rvtoolsChoice.focus();
    fireEvent.keyDown(rvtoolsChoice, { key: "ArrowRight" });

    expect(techInfoChoice).toBeChecked();
    expect(techInfoChoice).toHaveFocus();
    expect(rvtoolsChoice).not.toBeChecked();
    expect(screen.getByText("Startpunkt: technische Dokumentation")).toBeInTheDocument();
    expect(screen.queryByTestId("table-host-data-quality-rvtools")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-host-data-quality-techinfo")).toHaveTextContent("tech-gap-01.lab.local");
    expect(screen.getByTestId("table-host-data-quality-techinfo")).toHaveTextContent("tech-gap-02.lab.local");
    expect(screen.getByTestId("table-host-data-quality-techinfo")).not.toHaveTextContent("tech-clean.lab.local");
    expect(screen.getByText("2 von 3 Einträgen")).toBeInTheDocument();

    fireEvent.click(techInfoChoice);
    expect(techInfoChoice).toBeChecked();
  });

  it("filtert die aktive Host-Perspektive nach Handlungsbedarf, Bestanden und Alle", () => {
    renderWithRouter(<HostScopeHarness />);

    const table = screen.getByTestId("table-host-data-quality-rvtools");
    expect(table).toHaveTextContent("rv-gap.lab.local");
    expect(table).not.toHaveTextContent("rv-clean.lab.local");

    fireEvent.click(screen.getByRole("radio", { name: "Bestanden" }));
    expect(table).toHaveTextContent("rv-clean.lab.local");
    expect(table).not.toHaveTextContent("rv-gap.lab.local");
    expect(screen.getByText("1 von 2 Einträgen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Alle" }));
    expect(table).toHaveTextContent("rv-gap.lab.local");
    expect(table).toHaveTextContent("rv-clean.lab.local");
    expect(screen.getByText("2 von 2 Einträgen")).toBeInTheDocument();
  });

  it("filtert MAC-Abweichungen und bestandene Adapter getrennt", () => {
    const view = renderWithRouter(
      <MacAuditDetail
        rows={cdpMacRows}
        summary={readySummary("mac", { critical: 1, review: 1, passed: 1 })}
        scope="attention"
        search=""
        {...sharedCallbacks}
      />,
    );
    expect(screen.getByTestId("table-mac-audit-cdp")).toHaveTextContent("mac-missing");
    expect(screen.getByTestId("table-mac-audit-cdp")).toHaveTextContent("mac-topology");
    expect(screen.getByTestId("table-mac-audit-cdp")).not.toHaveTextContent("mac-clean");

    view.rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MacAuditDetail
          rows={cdpMacRows}
          summary={readySummary("mac", { critical: 1, review: 1, passed: 1 })}
          scope="passed"
          search=""
          {...sharedCallbacks}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("table-mac-audit-cdp")).toHaveTextContent("mac-clean");
    expect(screen.getByTestId("table-mac-audit-cdp")).not.toHaveTextContent("mac-missing");
  });

  it("filtert unbekannte und klassifizierte L2-Geräte getrennt", () => {
    const view = renderWithRouter(
      <NetworkDiscoveryDetail
        rows={l2DiscoveryRows}
        summary={readySummary("discovery", { critical: 0, review: 1, passed: 1 })}
        scope="attention"
        search=""
        {...sharedCallbacks}
      />,
    );
    expect(screen.getByTestId("table-mac-discovery")).toHaveTextContent("aabb.ccdd.eeff");
    expect(screen.getByTestId("table-mac-discovery")).not.toHaveTextContent("aabb.ccdd.ee00");

    view.rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NetworkDiscoveryDetail
          rows={l2DiscoveryRows}
          summary={readySummary("discovery", { critical: 0, review: 1, passed: 1 })}
          scope="passed"
          search=""
          {...sharedCallbacks}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("table-mac-discovery")).toHaveTextContent("aabb.ccdd.ee00");
    expect(screen.getByTestId("table-mac-discovery")).not.toHaveTextContent("aabb.ccdd.eeff");
  });

  it.each([
    {
      name: "Ports nach globaler Suche",
      tableId: "table-network-audit",
      title: "Keine passenden Einträge",
      description: "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter.",
      node: () => (
        <PortAuditDetail
          rows={portRows}
          summary={readySummary("ports", { critical: 2, review: 3, passed: 2 })}
          scope="all"
          search="nicht-vorhanden"
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Host-Handlungsbedarf",
      tableId: "table-host-data-quality-rvtools",
      title: "Keine offenen Datenlücken",
      description: "In dieser Perspektive wurden keine Datenlücken erkannt.",
      node: () => (
        <HostDataAuditDetail
          rvtoolsRows={[rvtoolsRows[1]]}
          techInfoRows={[]}
          summary={readySummary("hosts", { critical: 0, review: 0, passed: 1 })}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "MAC-Handlungsbedarf",
      tableId: "table-mac-audit-cdp",
      title: "Keine offenen MAC-Befunde",
      description: "Alle auswertbaren ESXi-Adapter wurden ohne Abweichung gefunden.",
      node: () => (
        <MacAuditDetail
          rows={[cdpMacRows[2]]}
          summary={readySummary("mac", { critical: 0, review: 0, passed: 1 })}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Discovery-Handlungsbedarf",
      tableId: "table-mac-discovery",
      title: "Keine unbekannten Geräte",
      description: "Alle auswertbaren L2-MACs konnten klassifiziert werden.",
      node: () => (
        <NetworkDiscoveryDetail
          rows={[l2DiscoveryRows[1]]}
          summary={readySummary("discovery", { critical: 0, review: 0, passed: 1 })}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
  ])("zeigt die fachliche Leermeldung in der $name-Tabelle", ({ tableId, title, description, node }) => {
    renderWithRouter(node());

    expect(screen.getByTestId(tableId)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it.each([
    {
      name: "Ports",
      totalCount: 7,
      successText: "Keine Einträge in diesem Ergebnisfilter",
      node: () => (
        <PortAuditDetail
          rows={portRows}
          summary={readySummary("ports", { critical: 2, review: 3, passed: 2 })}
          scope="attention"
          search="nicht-vorhanden"
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Hosts",
      totalCount: 2,
      successText: "Keine offenen Datenlücken",
      node: () => (
        <HostDataAuditDetail
          rvtoolsRows={rvtoolsRows}
          techInfoRows={techInfoRows}
          summary={readySummary("hosts", { critical: 0, review: 3, passed: 2 })}
          scope="attention"
          search="nicht-vorhanden"
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "MAC",
      totalCount: 3,
      successText: "Keine offenen MAC-Befunde",
      node: () => (
        <MacAuditDetail
          rows={cdpMacRows}
          summary={readySummary("mac", { critical: 1, review: 1, passed: 1 })}
          scope="attention"
          search="nicht-vorhanden"
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Discovery",
      totalCount: 2,
      successText: "Keine unbekannten Geräte",
      node: () => (
        <NetworkDiscoveryDetail
          rows={l2DiscoveryRows}
          summary={readySummary("discovery", { critical: 0, review: 1, passed: 1 })}
          scope="attention"
          search="nicht-vorhanden"
          {...sharedCallbacks}
        />
      ),
    },
  ])("priorisiert im $name-Detail die Suchursache und meldet null sichtbare Treffer", async ({
    totalCount,
    successText,
    node,
  }) => {
    renderWithRouter(node());

    await waitFor(() => {
      expect(screen.getByText(`0 von ${totalCount} Einträgen`)).toBeInTheDocument();
    });
    expect(screen.getByText("Keine passenden Einträge")).toBeInTheDocument();
    expect(
      screen.getByText("Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."),
    ).toBeInTheDocument();
    expect(screen.queryByText(successText)).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "Ports",
      title: "Switch-Port-Prüfung noch nicht möglich",
      description: "Importieren Sie Eramon-Interface-Daten.",
      node: () => (
        <PortAuditDetail
          rows={[]}
          summary={unavailableSummary("ports")}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Hosts",
      title: "Host-Datenabgleich noch nicht möglich",
      description: "Importieren Sie einen RVTools-Snapshot.",
      node: () => (
        <HostDataAuditDetail
          rvtoolsRows={[]}
          techInfoRows={[]}
          summary={unavailableSummary("hosts")}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "MAC",
      title: "MAC-Abgleich noch nicht möglich",
      description: "Importieren Sie CDP- und Eramon-L2-Daten.",
      node: () => (
        <MacAuditDetail
          rows={[]}
          summary={unavailableSummary("mac")}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
    {
      name: "Discovery",
      title: "Netz-Discovery noch nicht möglich",
      description: "Importieren Sie Eramon-L2-Daten.",
      node: () => (
        <NetworkDiscoveryDetail
          rows={[]}
          summary={unavailableSummary("discovery")}
          scope="attention"
          search=""
          {...sharedCallbacks}
        />
      ),
    },
  ])("führt im nicht verfügbaren $name-Detail zum Import", ({ title, description, node }) => {
    render(
      <MemoryRouter
        initialEntries={["/network"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/network" element={node()} />
          <Route path="/upload" element={<div>Upload-Ziel</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fehlende Daten importieren" }));
    expect(screen.getByText("Upload-Ziel")).toBeInTheDocument();
  });
});
