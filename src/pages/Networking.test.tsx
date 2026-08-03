import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAllData, putSnapshot } from "@/data/db";
import { FilterProvider } from "@/hooks/useFilterState";
import Networking from "@/pages/Networking";
import type { SnapshotMeta } from "@/domain/models/types";
import type { NetworkTab } from "@/lib/networkAuditNavigation";

const { useOptionalAppModeMock } = vi.hoisted(() => ({ useOptionalAppModeMock: vi.fn() }));

vi.mock("@/hooks/useAppMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAppMode")>()),
  useOptionalAppMode: useOptionalAppModeMock,
}));

vi.mock("@/pages/NetworkSecurity", () => ({
  NetworkSecurityPanel: () => <div data-testid="panel-security" />,
}));
vi.mock("@/pages/HostNetwork", () => ({
  HostNetworkPanel: () => <div data-testid="panel-host" />,
}));
vi.mock("@/pages/VlanUsage", () => ({
  VlanUsagePanel: () => <div data-testid="panel-vlan" />,
}));
vi.mock("@/pages/CdpSwitchPorts", () => ({
  CdpPanel: () => <div data-testid="panel-cdp" />,
}));
vi.mock("@/pages/IpamPanel", () => ({
  IpamPanel: () => <div data-testid="panel-ipam" />,
}));
vi.mock("@/pages/EramonIfacePanel", () => ({
  EramonIfacePanel: () => <div data-testid="panel-eramon-iface" />,
}));
vi.mock("@/pages/EramonL2Panel", () => ({
  EramonL2Panel: () => <div data-testid="panel-eramon-l2" />,
}));
vi.mock("@/components/dashboard/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div data-tooltip-term={entry.term}>{children}</div>
  ),
}));

function snapshot(snapshotId: string, vcenterId: string, exportTs: string): SnapshotMeta {
  return {
    snapshotId,
    vcenterId,
    vcenterDisplayName: vcenterId,
    exportTs,
    importedAt: exportTs,
    fileName: `${snapshotId}.xlsx`,
    fileChecksum: snapshotId,
    sheetStats: {},
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderNetworking(initialEntries = ["/network-security"], initialTab: NetworkTab = "security") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <FilterProvider>
          <Networking initialTab={initialTab} />
          <LocationProbe />
        </FilterProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}

beforeEach(async () => {
  useOptionalAppModeMock.mockReset();
  useOptionalAppModeMock.mockReturnValue(null);
  await deleteAllData();
});

describe("Networking im SysV-Modus", () => {
  it("lässt nur die VLAN-Nutzung stehen", async () => {
    useOptionalAppModeMock.mockReturnValue({ mode: "sysv", isHydrated: true });
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking();

    expect(await screen.findByRole("tab", { name: "VLAN-Nutzung" })).toBeInTheDocument();
    for (const name of ["Security & Policies", "Host-Netzwerk", "CDP/Switch-Ports", "IPAM", "Switch-Ports (Eramon)", "MAC-Tabelle (Eramon)"]) {
      expect(screen.queryByRole("tab", { name })).not.toBeInTheDocument();
    }
  });

  it("fällt bei einem Deeplink auf einen verborgenen Tab auf die VLAN-Nutzung zurück", async () => {
    useOptionalAppModeMock.mockReturnValue({ mode: "sysv", isHydrated: true });
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking(["/network-security?tab=ipam"]);

    expect(await screen.findByTestId("panel-vlan")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-ipam")).not.toBeInTheDocument();
  });

  it("zeigt vor Abschluss der Modus-Hydrierung keine modusabhängigen Tabs", async () => {
    useOptionalAppModeMock.mockReturnValue({ mode: "vm-admin", isHydrated: false });
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking();

    expect(await screen.findByRole("tab", { name: "VLAN-Nutzung" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Security & Policies" })).not.toBeInTheDocument();
  });
});

describe("Networking", () => {
  it("benennt die äußere Netzwerk-Tablist eindeutig", async () => {
    renderNetworking();
    expect(await screen.findByRole("tablist", { name: "Netzwerkbereich" })).toBeInTheDocument();
  });

  it("zeigt ohne Snapshot den lokalen RVTools-Leerzustand und nur Netzwerk-Analyse-Tabs", async () => {
    renderNetworking();

    expect(await screen.findByText("Keine RVTools-Daten")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security & Policies" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Host-Netzwerk" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Kontrolle" })).not.toBeInTheDocument();
  });

  it("zeigt während des Ladens keinen verfrühten RVTools-Leerzustand", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking();
    expect(screen.queryByText("Keine RVTools-Daten")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("panel-security")).toBeInTheDocument());
  });

  it.each([
    ["Security & Policies", "panel-security"],
    ["Host-Netzwerk", "panel-host"],
    ["VLAN-Nutzung", "panel-vlan"],
    ["CDP/Switch-Ports", "panel-cdp"],
    ["IPAM", "panel-ipam"],
    ["Switch-Ports (Eramon)", "panel-eramon-iface"],
    ["MAC-Tabelle (Eramon)", "panel-eramon-l2"],
  ])("wechselt in den Netzwerk-Tab %s", async (label, panel) => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking();
    await screen.findByTestId("panel-security");
    selectTab(label);
    expect(await screen.findByTestId(panel)).toBeInTheDocument();
  });

  it("schreibt den Netzwerk-Tab in die URL und bewahrt fremde Parameter", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking(["/network-security?tab=security&foo=bar"]);
    await screen.findByTestId("panel-security");

    selectTab("Host-Netzwerk");
    expect(screen.getByTestId("location")).toHaveTextContent("/network-security?tab=host&foo=bar");
  });

  it("leitet alte Kontrolle-Deep-Links auf die eigenständige Seite um", async () => {
    renderNetworking(["/network-security?tab=audit&check=mac&scope=all&foo=bar"]);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/network-audit?check=mac&scope=all&foo=bar");
    });
  });

  it("fällt bei ungültigem Tab auf initialTab zurück", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking(["/host-network?tab=ungueltig"], "host");
    await waitFor(() => expect(screen.getByTestId("panel-host")).toBeInTheDocument());
  });
});
