import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAllData, putSnapshot } from "@/data/db";
import { FilterProvider } from "@/hooks/useFilterState";
import Networking from "@/pages/Networking";
import type { SnapshotMeta } from "@/domain/models/types";
import type { NetworkTab } from "@/lib/networkAuditNavigation";

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
vi.mock("@/pages/NetworkAuditPanel", () => ({
  NetworkAuditPanel: () => <div data-testid="panel-audit" />,
}));
vi.mock("@/components/dashboard/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div
      data-testid={`tooltip-${entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
      data-tooltip-term={entry.term}
    >
      {children}
    </div>
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

function Providers({
  children,
  initialEntries = ["/network-security"],
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>
        <FilterProvider>{children}</FilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function RouterHarness() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>Zurück</button>
      <button type="button" onClick={() => navigate(1)}>Vorwärts</button>
    </>
  );
}

function renderNetworking(
  initialEntries = ["/network-security"],
  initialTab: NetworkTab = "security",
) {
  return render(
    <Providers initialEntries={initialEntries}>
      <Networking initialTab={initialTab} />
      <RouterHarness />
    </Providers>,
  );
}

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
}

beforeEach(async () => {
  await deleteAllData();
});

describe("Networking", () => {
  it("zeigt während des Ladens keinen verfrühten RVTools-Leerzustand", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    renderNetworking();

    expect(screen.queryByText("Keine RVTools-Daten")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Security & Policies" })).toBeInTheDocument();
    });
  });

  it("öffnet einen Audit-Deep-Link einschließlich Prüfung im äußeren Kontrolle-Tab", async () => {
    renderNetworking(["/network-security?tab=audit&check=mac&scope=all"]);

    await waitFor(() => {
      expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Kontrolle" })).toHaveAttribute("data-state", "active");
  });

  it("hält die Kontrolle auch ohne RVTools-Snapshot erreichbar", async () => {
    renderNetworking(["/network-security?tab=audit"]);

    await waitFor(() => {
      expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    });
    expect(screen.queryByText("Laden Sie RVTools-Daten hoch.")).not.toBeInTheDocument();
  });

  it("zeigt im Security-Tab ohne Snapshot den lokalen RVTools-Leerzustand und weiterhin alle Tabs", async () => {
    renderNetworking();

    await waitFor(() => {
      expect(screen.getByText("Keine RVTools-Daten")).toBeInTheDocument();
    });
    expect(screen.getByText("Laden Sie RVTools-Daten hoch.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security & Policies" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Kontrolle" })).toBeInTheDocument();
  });

  it("schreibt Haupttab und Audit-Standard in die URL und bewahrt fremde Audit-Parameter", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking(["/network-security?tab=security&foo=bar"]);

    await screen.findByTestId("panel-security");
    selectTab("Kontrolle");

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=audit&foo=bar&check=overview",
    );
    expect(screen.getByTestId("panel-audit")).toBeInTheDocument();

    selectTab("Host-Netzwerk");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=host&foo=bar&check=overview",
    );
    expect(screen.getByTestId("panel-host")).toBeInTheDocument();

    selectTab("Security & Policies");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/network-security?tab=security&foo=bar&check=overview",
    );
    expect(screen.getByTestId("panel-security")).toBeInTheDocument();
  });

  it("restauriert den sichtbaren Haupttab über Browser Zurück und Vorwärts", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    renderNetworking(["/network-security?tab=security&foo=bar"]);

    await screen.findByTestId("panel-security");
    selectTab("Kontrolle");
    expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    selectTab("Host-Netzwerk");
    expect(screen.getByTestId("panel-host")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await waitFor(() => {
      expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Kontrolle" })).toHaveAttribute("data-state", "active");

    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await waitFor(() => {
      expect(screen.getByTestId("panel-security")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Security & Policies" })).toHaveAttribute("data-state", "active");

    fireEvent.click(screen.getByRole("button", { name: "Vorwärts" }));
    await waitFor(() => {
      expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    });
  });

  it("fällt bei ungültigem Tab auf initialTab zurück und bleibt nach Remount URL-gesteuert", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    const firstView = renderNetworking(["/host-network?tab=ungueltig"], "host");

    await waitFor(() => {
      expect(screen.getByTestId("panel-host")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Host-Netzwerk" })).toHaveAttribute("data-state", "active");

    firstView.unmount();
    renderNetworking(["/network-security?tab=audit&check=mac&scope=all"]);

    await waitFor(() => {
      expect(screen.getByTestId("panel-audit")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Kontrolle" })).toHaveAttribute("data-state", "active");
  });

  it("erklärt alle Netzwerk-Tabs per Tooltip", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    renderNetworking();

    await waitFor(() => {
      expect(screen.getByTestId("tooltip-security-policies")).toHaveAttribute("data-tooltip-term", "Security & Policies");
      expect(screen.getByTestId("tooltip-host-netzwerk")).toHaveAttribute("data-tooltip-term", "Host-Netzwerk");
      expect(screen.getByTestId("tooltip-vlan-nutzung")).toHaveAttribute("data-tooltip-term", "VLAN-Nutzung");
      expect(screen.getByTestId("tooltip-cdp-switch-ports")).toHaveAttribute("data-tooltip-term", "CDP/Switch-Ports");
      expect(screen.getByTestId("tooltip-ipam")).toHaveAttribute("data-tooltip-term", "IPAM");
      expect(screen.getByTestId("tooltip-switch-ports-eramon")).toHaveAttribute("data-tooltip-term", "Switch-Ports (Eramon)");
      expect(screen.getByTestId("tooltip-mac-tabelle-eramon")).toHaveAttribute("data-tooltip-term", "MAC-Tabelle (Eramon)");
      expect(screen.getByTestId("tooltip-kontrolle")).toHaveAttribute("data-tooltip-term", "Kontrolle");
    });
  });
});
