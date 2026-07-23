import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "./NetworkAuditPanel";
import { IpamPanel } from "./IpamPanel";
import { SwitchPanel } from "./SwitchPanel";
import type { SwitchLatest, IpamLatest } from "@/domain/models/types";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";

const search = "core-01";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search } }),
  useAllSwitchLatest: () => ({
    data: [{
      switchInterfaceKey: "core-01::eth1/1", hostnameNorm: "core-01", hostname: "core-01", interface: "Eth1/1",
      importedAt: "2026-07-15T00:00:00.000Z", switchImportId: "switch-1", rowIndex: 0,
      description: "Uplink", status: "connected", mode: "trunk", duplex: "full", speed: "10G", transceiver: null,
    }] as SwitchLatest[],
    isLoading: false,
  }),
  useAllIpamLatest: () => ({
    data: [{
      ipAddress: "10.0.0.10", name: "core-01", status: "Used", type: null, usage: null,
      firstDiscovered: null, lastDiscovered: null, comment: null, site: null, macAddress: null,
      os: null, netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null,
    }] as IpamLatest[],
    isLoading: false,
  }),
  useNetworkAudit: () => ({
    rows: [{
      switchInterfaceKey: "core-01::eth1/1", switchHostname: "core-01", interface: "Eth1/1", description: "Uplink",
      status: "connected", matchStatus: "confirmed-cdp", matchedHost: "esx01", matchedSource: "cdp",
      labelConflict: false, labelConflictHost: null, statusConflict: false,
      sources: ["cisco"], bandwidthBps: null, sourceConflict: false, finding: null,
    }] as PortAuditRow[],
    cdpMacRows: [{
      host: "esx01", adapter: "vmnic0", mac: "00:50:56:ab:cd:ef", macCanonical: "005056abcdef",
      inL2: false, l2Switch: null, l2Interface: null, vlan: null, learnedIp: null, dnsName: null,
      topologyMismatch: false, finding: "MAC nicht in L2-Tabelle",
    }] as CdpMacRow[],
    l2DiscoveryRows: [{
      l2EntryKey: "core-01::eth1/1::aabbccddeeff::100", switchName: "core-01", interface: "Eth1/1",
      vlan: "100", mac: "aabb.ccdd.eeff", learnedIp: "10.0.0.20", dnsName: null,
      classification: "unknown", esxiHost: null,
    }] as L2DiscoveryRow[],
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

  it("zeigt den Eramon-L2-MAC-Abgleich mit beiden Tabellen", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByRole("heading", { name: "MAC-Abgleich (Eramon L2)" })).toBeInTheDocument();
    expect(screen.getByTestId("table-mac-audit-cdp")).toBeInTheDocument();
    expect(screen.getByTestId("table-mac-discovery")).toBeInTheDocument();
  });
});
