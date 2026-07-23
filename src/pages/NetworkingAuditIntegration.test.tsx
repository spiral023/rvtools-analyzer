import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/hooks/useFilterState";
import { useNetworkAudit } from "@/hooks/useActiveSnapshots";
import Networking from "@/pages/Networking";

const { useNetworkAuditMock } = vi.hoisted(() => ({
  useNetworkAuditMock: vi.fn(),
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({
    snapshots: [{ snapshotId: "snap-1" }],
    snapshotsLoading: false,
  }),
  useNetworkAudit: useNetworkAuditMock,
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

const importedAt = "2026-07-23T08:00:00.000Z";
const refetch = vi.fn(async () => undefined);
const auditFixture: ReturnType<typeof useNetworkAudit> = {
  rows: [],
  hostQuality: {
    rvtoolsRows: [],
    techInfoRows: [],
  },
  cdpMacRows: [],
  l2DiscoveryRows: [],
  sources: {
    rvtools: { count: 1, importedAt },
    cdp: { count: 1, importedAt },
    eramonIface: { count: 1, importedAt },
    eramonL2: { count: 1, importedAt },
    ipam: { count: 1, importedAt },
    techInfo: { count: 1, importedAt },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch,
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Browser zurück
    </button>
  );
}

function renderIntegration(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>
        <FilterProvider>
          <TooltipProvider>
            <Networking />
            <LocationProbe />
            <HistoryControls />
          </TooltipProvider>
        </FilterProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
}

function expectLocation(expected: string) {
  expect(screen.getByTestId("location").textContent).toBe(expected);
}

beforeEach(() => {
  vi.clearAllMocks();
  useNetworkAuditMock.mockReturnValue(auditFixture);
});

describe("Networking audit integration", () => {
  it("rendert beide benannten Tablisten und den echten Kontrolle-Tooltip-Trigger im Overview-Deep-Link", async () => {
    renderIntegration(
      "/network-security?tab=audit&check=overview&scope=attention&foo=bar",
    );

    expect(
      screen.getByRole("tablist", { name: "Netzwerkbereich" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "Bereich der Netzwerk-Kontrolle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("data-state", "active");

    const controlTab = screen.getByRole("tab", { name: "Kontrolle" });
    expect(controlTab).toHaveAttribute("data-state", "active");
    fireEvent.focus(controlTab);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Kontrolle");
    expect(controlTab).toHaveAttribute("data-state", "active");
  });

  it("bewahrt echte innere Audit-Navigation und Scope über äußeren Tabwechsel und Browser-History", async () => {
    renderIntegration(
      "/network-security?tab=audit&check=overview&scope=attention&foo=bar",
    );

    selectTab("MAC-Abgleich");
    expect(screen.getByRole("heading", { name: "ESXi-MAC-Abgleich" })).toBeInTheDocument();
    expectLocation(
      "/network-security?tab=audit&check=mac&scope=attention&foo=bar",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Alle" }));
    expect(screen.getByRole("radio", { name: "Alle" })).toBeChecked();
    expectLocation(
      "/network-security?tab=audit&check=mac&scope=all&foo=bar",
    );

    selectTab("Host-Netzwerk");
    expect(screen.getByTestId("panel-host")).toBeInTheDocument();
    expectLocation(
      "/network-security?tab=host&check=mac&scope=all&foo=bar",
    );

    fireEvent.click(screen.getByRole("button", { name: "Browser zurück" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ESXi-MAC-Abgleich" })).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Kontrolle" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "MAC-Abgleich" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("radio", { name: "Alle" })).toBeChecked();
    expectLocation(
      "/network-security?tab=audit&check=mac&scope=all&foo=bar",
    );
  });
});
