import { describe, expect, it } from "vitest";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import {
  buildNetworkAuditViewModel,
  classifyDiscoveryAuditRow,
  classifyHostAuditRow,
  classifyMacAuditRow,
  classifyPortAuditRow,
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
    hostQuality: { rvtoolsRows: [], techInfoRows: [] },
    cdpMacRows: [],
    l2DiscoveryRows: [],
    ...overrides,
  });

describe("shared network audit row classification", () => {
  it("classifies port conflicts and match states through the shared API", () => {
    expect(classifyPortAuditRow(port({ statusConflict: true }))).toBe("critical");
    expect(classifyPortAuditRow(port({ matchStatus: "text-match" }))).toBe("review");
    expect(classifyPortAuditRow(port({ matchStatus: "no-target" }))).toBe("passed");
  });

  it("classifies host findings through the shared API", () => {
    expect(classifyHostAuditRow(rvtoolsHost({ finding: "" }))).toBe("review");
    expect(classifyHostAuditRow(techInfoHost({ finding: null }))).toBe("passed");
  });

  it("classifies MAC locations through the shared API", () => {
    expect(classifyMacAuditRow(mac({ topologyMismatch: true }))).toBe("critical");
    expect(classifyMacAuditRow(mac({ inL2: false }))).toBe("review");
    expect(classifyMacAuditRow(mac())).toBe("passed");
  });

  it("classifies discovery results through the shared API", () => {
    expect(classifyDiscoveryAuditRow(discovery({ classification: "unknown" }))).toBe("review");
    expect(classifyDiscoveryAuditRow(discovery({ classification: "ipam" }))).toBe("passed");
  });
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

  it("treats zero-count sources as missing even when they have an import timestamp", () => {
    const result = build({
      sources: { ...sources, cdp: { count: 0, importedAt: "2026-07-23T10:00:00.000Z" } },
    });

    expect(result.checks.mac.readiness).toBe("unavailable");
    expect(result.checks.mac.missingRequired).toContain("cdp");
  });

  it("prioritizes critical port conflicts over MAC review findings", () => {
    const result = build({
      portRows: [port({ labelConflict: true, labelConflictHost: "esx-02" })],
      cdpMacRows: [mac({ inL2: false, l2Switch: null, l2Interface: null, vlan: null, learnedIp: null, dnsName: null, finding: "MAC nicht in L2-Tabelle" })],
    });

    expect(result.totals).toEqual({ critical: 1, review: 1, passed: 0 });
    expect(result.nextCheck).toBe("ports");
    expect(result.checks.ports.status).toBe("critical");
  });

  it("surfaces unknown L2 discovery as the next review", () => {
    const result = build({ l2DiscoveryRows: [discovery({ classification: "unknown", esxiHost: null })] });

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
      hostQuality: { rvtoolsRows: [rvtoolsHost()], techInfoRows: [techInfoHost()] },
    });

    expect(result.hasExecutableChecks).toBe(false);
    expect(result.nextCheck).toBeNull();
  });

  it("counts an empty host finding as a review", () => {
    const result = build({
      hostQuality: { rvtoolsRows: [rvtoolsHost({ finding: "" })], techInfoRows: [] },
    });

    expect(result.checks.hosts.counts).toEqual({ critical: 0, review: 1, passed: 0 });
  });

  it("uses ports, hosts, MAC, then discovery to break review ties", () => {
    const reviews: Partial<Parameters<typeof buildNetworkAuditViewModel>[0]> = {
      portRows: [port({ matchStatus: "text-match" })],
      hostQuality: { rvtoolsRows: [rvtoolsHost({ finding: "Prüfen" })], techInfoRows: [] },
      cdpMacRows: [mac({ inL2: false })],
      l2DiscoveryRows: [discovery({ classification: "unknown", esxiHost: null })],
    };

    expect(build(reviews).nextCheck).toBe("ports");
    expect(build({ ...reviews, portRows: [] }).nextCheck).toBe("hosts");
    expect(build({ ...reviews, portRows: [], hostQuality: { rvtoolsRows: [], techInfoRows: [] } }).nextCheck).toBe("mac");
    expect(build({ ...reviews, portRows: [], hostQuality: { rvtoolsRows: [], techInfoRows: [] }, cdpMacRows: [] }).nextCheck).toBe("discovery");
  });

  it("prioritizes critical port findings over equally critical MAC findings", () => {
    const result = build({
      portRows: [port({ statusConflict: true })],
      cdpMacRows: [mac({ topologyMismatch: true })],
    });

    expect(result.nextCheck).toBe("ports");
  });

  it("excludes rows in unavailable checks from totals", () => {
    const result = build({
      sources: { ...sources, eramonIface: { count: 0, importedAt: null } },
      portRows: [port({ labelConflict: true })],
    });

    expect(result.checks.ports.status).toBe("unavailable");
    expect(result.totals).toEqual({ critical: 0, review: 0, passed: 0 });
  });

  it.each([
    ["confirmed-cdp", "passed"],
    ["no-target", "passed"],
    ["text-match", "review"],
    ["documented-only", "review"],
    ["unknown", "review"],
  ] as const)("classifies port status %s as %s", (matchStatus, category) => {
    const result = build({ portRows: [port({ matchStatus })] });

    expect(result.checks.ports.counts[category]).toBe(1);
  });

  it("classifies port conflicts as critical", () => {
    const result = build({ portRows: [port({ labelConflict: true })] });

    expect(result.checks.ports.counts.critical).toBe(1);
  });

  it("rejects unexpected port statuses instead of classifying them as passed", () => {
    expect(() => build({
      portRows: [port({ matchStatus: "future-status" as PortAuditRow["matchStatus"] })],
    })).toThrow("Unexpected port match status");
  });

  it.each([
    ["topology mismatch", mac({ topologyMismatch: true }), "critical"],
    ["missing L2 entry", mac({ inL2: false }), "review"],
    ["clean entry", mac(), "passed"],
  ] as const)("classifies MAC %s", (_name, row, category) => {
    const result = build({ cdpMacRows: [row] });

    expect(result.checks.mac.counts[category]).toBe(1);
  });

  it.each([
    ["unknown", "review"],
    ["esxi-cdp", "passed"],
    ["ipam", "passed"],
  ] as const)("classifies discovery status %s as %s", (classification, category) => {
    const result = build({ l2DiscoveryRows: [discovery({ classification })] });

    expect(result.checks.discovery.counts[category]).toBe(1);
  });

  it("rejects unexpected discovery statuses instead of classifying them as passed", () => {
    expect(() => build({
      l2DiscoveryRows: [discovery({ classification: "future-status" as L2DiscoveryRow["classification"] })],
    })).toThrow("Unexpected L2 classification");
  });

  it.each([
    [null, "passed"],
    ["Prüfen", "review"],
    ["", "review"],
  ] as const)("classifies host finding %o as %s", (finding, category) => {
    const result = build({
      hostQuality: { rvtoolsRows: [rvtoolsHost({ finding })], techInfoRows: [] },
    });

    expect(result.checks.hosts.counts[category]).toBe(1);
  });
});
