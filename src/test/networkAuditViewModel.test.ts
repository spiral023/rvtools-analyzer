import { describe, expect, it } from "vitest";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import {
  buildNetworkAuditViewModel,
  type NetworkAuditSourceFacts,
} from "@/lib/networkAuditViewModel";

const sources: NetworkAuditSourceFacts = {
  rvtools: { count: 2, importedAt: "2026-07-23T09:00:00.000Z" },
  cdp: { count: 2, importedAt: "2026-07-23T09:01:00.000Z" },
  eramonIface: { count: 2, importedAt: "2026-07-23T09:02:00.000Z" },
  eramonL2: { count: 2, importedAt: "2026-07-23T09:03:00.000Z" },
  ipam: { count: 2, importedAt: "2026-07-23T09:04:00.000Z" },
  techInfo: { count: 2, importedAt: "2026-07-23T09:05:00.000Z" },
};

const port = (overrides: Partial<PortAuditRow> = {}): PortAuditRow => ({
  switchInterfaceKey: "sw-01::eth1/1",
  switchHostname: "sw-01",
  interface: "Ethernet1/1",
  description: "esx-01",
  status: "aktiv",
  matchStatus: "confirmed-cdp",
  matchedHost: "esx-01",
  matchedSource: "cdp",
  labelConflict: false,
  labelConflictHost: null,
  statusConflict: false,
  bandwidthBps: 1_000_000_000,
  finding: null,
  ...overrides,
});

const mac = (overrides: Partial<CdpMacRow> = {}): CdpMacRow => ({
  host: "esx-01",
  adapter: "vmnic0",
  mac: "00:50:56:aa:bb:cc",
  macCanonical: "005056aabbcc",
  inL2: true,
  l2Switch: "sw-01",
  l2Interface: "Ethernet1/1",
  vlan: "10",
  learnedIp: "10.0.0.1",
  dnsName: "esx-01.example.test",
  topologyMismatch: false,
  finding: null,
  ...overrides,
});

const discovery = (overrides: Partial<L2DiscoveryRow> = {}): L2DiscoveryRow => ({
  l2EntryKey: "l2-01",
  switchName: "sw-01",
  interface: "Ethernet1/1",
  vlan: "10",
  mac: "00:50:56:aa:bb:cc",
  learnedIp: "10.0.0.1",
  dnsName: "esx-01.example.test",
  classification: "esxi-cdp",
  esxiHost: "esx-01",
  ...overrides,
});

const rvtoolsHost = (overrides: Partial<RvtoolsHostQualityRow> = {}): RvtoolsHostQualityRow => ({
  host: "esx-01",
  cluster: "cluster-01",
  version: "8.0",
  connectionState: "connected",
  techInfoPresent: true,
  techInfoServerType: "ESXi",
  techInfoDepartment: "IT",
  ipamPresent: true,
  ipamAddresses: ["10.0.0.1"],
  ipamNetworks: ["10.0.0.0/24"],
  finding: null,
  ...overrides,
});

const techInfoHost = (overrides: Partial<TechInfoHostQualityRow> = {}): TechInfoHostQualityRow => ({
  techInfoName: "esx-01",
  serverType: "ESXi",
  department: "IT",
  maintenanceWindow: "Sunday",
  rvtoolsPresent: true,
  rvtoolsHost: "esx-01",
  rvtoolsCluster: "cluster-01",
  ipamPresent: true,
  ipamAddresses: ["10.0.0.1"],
  ipamNetworks: ["10.0.0.0/24"],
  finding: null,
  ...overrides,
});

const build = (overrides: Partial<Parameters<typeof buildNetworkAuditViewModel>[0]> = {}) =>
  buildNetworkAuditViewModel({
    sources,
    portRows: [],
    rvtoolsHostRows: [],
    techInfoHostRows: [],
    macRows: [],
    discoveryRows: [],
    ...overrides,
  });

describe("buildNetworkAuditViewModel", () => {
  it("preserves source facts for every audit input", () => {
    expect(build().sources).toEqual(sources);
  });

  it("marks ports limited without IPAM while MAC checks remain ready", () => {
    const result = build({ sources: { ...sources, ipam: { count: 0, importedAt: null } } });

    expect(result.checks.ports.readiness).toBe("limited");
    expect(result.checks.ports.missingOptional).toContain("ipam");
    expect(result.checks.mac.readiness).toBe("ready");
  });

  it("prioritizes critical port conflicts over MAC review findings", () => {
    const result = build({
      portRows: [port({ labelConflict: true, labelConflictHost: "esx-02" })],
      macRows: [mac({ inL2: false, l2Switch: null, l2Interface: null, vlan: null, learnedIp: null, dnsName: null, finding: "MAC nicht in L2-Tabelle" })],
    });

    expect(result.totals).toEqual({ critical: 1, review: 1, passed: 0 });
    expect(result.nextCheck).toBe("ports");
    expect(result.checks.ports.status).toBe("critical");
  });

  it("surfaces unknown L2 discovery as the next review", () => {
    const result = build({ discoveryRows: [discovery({ classification: "unknown", esxiHost: null })] });

    expect(result.checks.discovery.counts.review).toBe(1);
    expect(result.nextCheck).toBe("discovery");
  });

  it("reports clean confirmed CDP ports as passed executable checks", () => {
    const result = build({ portRows: [port()] });

    expect(result.totals).toEqual({ critical: 0, review: 0, passed: 1 });
    expect(result.nextCheck).toBeNull();
    expect(result.hasExecutableChecks).toBe(true);
  });

  it("has no executable checks when all required sources are missing", () => {
    const result = build({
      sources: {
        ...sources,
        rvtools: { count: 0, importedAt: null },
        cdp: { count: 0, importedAt: null },
        eramonIface: { count: 0, importedAt: null },
        eramonL2: { count: 0, importedAt: null },
      },
      rvtoolsHostRows: [rvtoolsHost()],
      techInfoHostRows: [techInfoHost()],
    });

    expect(result.hasExecutableChecks).toBe(false);
    expect(result.nextCheck).toBeNull();
  });
});
