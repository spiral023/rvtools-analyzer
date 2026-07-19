import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "./NetworkAuditPanel";
import { IpamPanel } from "./IpamPanel";
import { SwitchPanel } from "./SwitchPanel";

const search = "core-01";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search } }),
  useAllSwitchLatest: () => ({
    data: [{
      switchInterfaceKey: "core-01::eth1/1", hostnameNorm: "core-01", hostname: "core-01", interface: "Eth1/1",
      importedAt: "2026-07-15T00:00:00.000Z", switchImportId: "switch-1", rowIndex: 0,
      description: "Uplink", status: "connected", mode: "trunk", duplex: "full", speed: "10G", transceiver: null,
    }],
    isLoading: false,
  }),
  useAllIpamLatest: () => ({
    data: [{
      ipAddress: "10.0.0.10", name: "core-01", status: "Used", type: null, usage: null,
      firstDiscovered: null, lastDiscovered: null, comment: null, site: null, macAddress: null,
      os: null, netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null,
    }],
    isLoading: false,
  }),
  useNetworkAudit: () => ({
    rows: [{
      switchInterfaceKey: "core-01::eth1/1", switchHostname: "core-01", interface: "Eth1/1", description: "Uplink",
      status: "connected", matchStatus: "confirmed-cdp", matchedHost: "esx01", matchedSource: "cdp",
      labelConflict: false, labelConflictHost: null, statusConflict: false, finding: null,
    }],
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ exportFileName, globalFilter }: { exportFileName: string; globalFilter?: string }) => (
    <div data-testid={`table-${exportFileName}`} data-global-filter={globalFilter ?? ""} />
  ),
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Network search", () => {
  it.each([
    ["Cisco Switch", SwitchPanel, "cisco-switch-ports"],
    ["IPAM", IpamPanel, "ipam"],
    ["Kontrolle", NetworkAuditPanel, "network-audit"],
  ])("übergibt die globale Suche an die %s-Tabelle", (_name, Panel, exportFileName) => {
    render(<Panel />);

    expect(screen.getByTestId(`table-${exportFileName}`)).toHaveAttribute("data-global-filter", search);
  });
});
