import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CdpLatest,
  EramonIfaceLatest,
  EramonL2Latest,
  IpamLatest,
  NormalizedHost,
  SnapshotMeta,
  TechInfoLatest,
} from "@/domain/models/types";
import {
  buildCdpMacRows,
  buildL2DiscoveryRows,
  buildPortAuditRows,
} from "@/lib/networkAudit";
import { buildHostDataQualityRows } from "@/lib/hostDataQualityAudit";

const dbMocks = vi.hoisted(() => ({
  getSnapshots: vi.fn(),
  getBySnapshotIds: vi.fn(),
  getAllCdpLatest: vi.fn(),
  getAllEramonIfaceLatest: vi.fn(),
  getAllEramonL2Latest: vi.fn(),
  getAllIpamLatest: vi.fn(),
  getAllTechInfoLatest: vi.fn(),
}));

vi.mock("@/data/db", () => ({
  ...dbMocks,
  getAllTechInfoClientLatest: vi.fn(),
  getRawSheetRows: vi.fn(),
}));

vi.mock("@/hooks/useFilterState", () => ({
  useFilterState: () => ({
    filters: {
      vcenterIds: [] as string[],
    },
  }),
}));

const { useNetworkAudit } = await import("@/hooks/useActiveSnapshots");

function snapshot(
  snapshotId: string,
  vcenterId: string,
  exportTs: string,
  importedAt = exportTs,
): SnapshotMeta {
  return {
    snapshotId,
    vcenterId,
    vcenterDisplayName: vcenterId,
    exportTs,
    importedAt,
    fileName: `${snapshotId}.xlsx`,
    fileChecksum: snapshotId,
    sheetStats: {},
  };
}

function host(snapshotId: string, name: string): NormalizedHost {
  return {
    snapshotId,
    vcenterId: "vc-1",
    hostKey: `${snapshotId}::${name}`,
    host: name,
    cluster: "cluster-1",
    datacenter: null,
    cpuModel: null,
    cpuTotalMHz: null,
    cpuCores: null,
    cpuThreads: null,
    memoryTotalMiB: null,
    version: "8.0",
    build: null,
    vendor: null,
    model: null,
    connectionState: "connected",
    powerState: "poweredOn",
    maintenanceMode: null,
    vmCount: 1,
  };
}

const eramonIfaceRows: EramonIfaceLatest[] = [{
  switchPortKey: "core-01::eth1/1",
  switchNorm: "core-01",
  deviceName: "core-01",
  portName: "Eth1/1",
  importedAt: "2026-04-02T08:00:00.000Z",
  ifaceImportId: "iface-1",
  rowIndex: 1,
  portDesc: "esx-active",
  bandbreiteBps: 1_000_000_000,
  portStatus: "connected",
  statusLabel: "aktiv",
}, {
  switchPortKey: "core-02::eth1/2",
  switchNorm: "core-02",
  deviceName: "core-02",
  portName: "Eth1/2",
  importedAt: "2026-04-05T08:00:00.000Z",
  ifaceImportId: "iface-2",
  rowIndex: 2,
  portDesc: null,
  bandbreiteBps: null,
  portStatus: null,
  statusLabel: null,
}];

const cdpRows: CdpLatest[] = [{
  hostAdapterKey: "esx-active::vmnic0",
  hostNorm: "esx-active",
  host: "esx-active",
  adapter: "vmnic0",
  importedAt: "2026-04-03T08:00:00.000Z",
  cdpImportId: "cdp-1",
  rowIndex: 1,
  vcenter: "vc-1",
  cluster: "cluster-1",
  hostConnectionState: "connected",
  linkStatus: "up",
  mac: "00:50:56:ab:cd:ef",
  cdpDeviceId: "core-01",
  cdpPortId: "Eth1/1",
  cdpMgmtIp: null,
  cdpSwitchAddress: null,
  cdpPlatform: null,
  cdpSoftware: null,
  nativeVlan: "100",
  mtu: null,
  cdpAvailable: true,
  queryStatus: null,
}];

const l2Rows: EramonL2Latest[] = [{
  l2EntryKey: "core-01::eth1/1::005056abcdef::100",
  switchNorm: "core-01",
  switchName: "core-01",
  interface: "Eth1/1",
  mac: "00:50:56:ab:cd:ef",
  vlan: "100",
  importedAt: "2026-04-04T08:00:00.000Z",
  l2ImportId: "l2-1",
  rowIndex: 1,
  ip: "10.0.0.10",
  dnsName: "esx-active",
  type: null,
  interfaceDescription: null,
}];

const techInfoRows: TechInfoLatest[] = [{
  vmNameNorm: "esx-active",
  vmName: "esx-active",
  importedAt: "2026-04-06T08:00:00.000Z",
  techInfoImportId: "tech-1",
  rowIndex: 1,
  serverType: "ESXi",
  maintenanceWindow: null,
  operatingSystem: null,
  comment: null,
  sysv: null,
  sysvDepartment: "IT",
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  bz: null,
  clusterFromTechInfo: null,
  cvBackup: null,
  az: null,
}];

const ipamRows: IpamLatest[] = [{
  ipAddress: "10.0.0.10",
  importedAt: "2026-04-07T08:00:00.000Z",
  ipamImportId: "ipam-1",
  rowIndex: 1,
  name: "esx-active",
  status: "Used",
  type: null,
  usage: null,
  firstDiscovered: null,
  lastDiscovered: null,
  comment: null,
  site: null,
  macAddress: "00:50:56:ab:cd:ef",
  os: null,
  netBiosName: null,
  deviceTypes: null,
  openPorts: null,
  fingerprint: null,
}];

const activeSnapshots = [
  snapshot("snap-old", "vc-1", "2026-01-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z"),
  snapshot("snap-active", "vc-1", "2026-02-01T00:00:00.000Z", "2026-04-01T08:00:00.000Z"),
];
const importedHosts = [
  host("snap-old", "esx-inactive"),
  host("snap-active", "esx-active"),
];

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setSuccessfulQueries({
  snapshots = activeSnapshots,
  hosts = importedHosts,
  eramonIface = eramonIfaceRows,
  l2 = l2Rows,
  cdp = cdpRows,
  techInfo = techInfoRows,
  ipam = ipamRows,
}: {
  snapshots?: SnapshotMeta[];
  hosts?: NormalizedHost[];
  eramonIface?: EramonIfaceLatest[];
  l2?: EramonL2Latest[];
  cdp?: CdpLatest[];
  techInfo?: TechInfoLatest[];
  ipam?: IpamLatest[];
} = {}) {
  dbMocks.getSnapshots.mockResolvedValue(snapshots);
  dbMocks.getBySnapshotIds.mockResolvedValue(hosts);
  dbMocks.getAllEramonIfaceLatest.mockResolvedValue(eramonIface);
  dbMocks.getAllEramonL2Latest.mockResolvedValue(l2);
  dbMocks.getAllCdpLatest.mockResolvedValue(cdp);
  dbMocks.getAllTechInfoLatest.mockResolvedValue(techInfo);
  dbMocks.getAllIpamLatest.mockResolvedValue(ipam);
}

beforeEach(() => {
  vi.clearAllMocks();
  setSuccessfulQueries();
});

describe("useNetworkAudit", () => {
  it("liefert Quellenfakten nur für aktive RVTools-Snapshots und behält die Builderausgaben bei", async () => {
    const { result } = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sources).toEqual({
      rvtools: { count: 1, importedAt: "2026-04-01T08:00:00.000Z" },
      cdp: { count: 1, importedAt: "2026-04-03T08:00:00.000Z" },
      eramonIface: { count: 2, importedAt: "2026-04-05T08:00:00.000Z" },
      eramonL2: { count: 1, importedAt: "2026-04-04T08:00:00.000Z" },
      ipam: { count: 1, importedAt: "2026-04-07T08:00:00.000Z" },
      techInfo: { count: 1, importedAt: "2026-04-06T08:00:00.000Z" },
    });

    const activeHosts = [importedHosts[1]];
    expect(result.current.rows).toEqual(buildPortAuditRows({
      eramonIfaceRows,
      cdpRows,
      hosts: activeHosts,
      techInfo: techInfoRows,
      ipam: ipamRows,
    }));
    expect(result.current.hostQuality).toEqual(buildHostDataQualityRows({
      hosts: activeHosts,
      techInfo: techInfoRows,
      ipam: ipamRows,
    }));
    expect(result.current.cdpMacRows).toEqual(buildCdpMacRows({ cdpRows, l2Rows }));
    expect(result.current.l2DiscoveryRows).toEqual(buildL2DiscoveryRows({
      l2Rows,
      cdpRows,
      ipam: ipamRows,
    }));
  });

  it("liefert für leere Quellen count 0 und importedAt null", async () => {
    setSuccessfulQueries({
      snapshots: [],
      hosts: [],
      eramonIface: [],
      l2: [],
      cdp: [],
      techInfo: [],
      ipam: [],
    });

    const { result } = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sources).toEqual({
      rvtools: { count: 0, importedAt: null },
      cdp: { count: 0, importedAt: null },
      eramonIface: { count: 0, importedAt: null },
      eramonL2: { count: 0, importedAt: null },
      ipam: { count: 0, importedAt: null },
      techInfo: { count: 0, importedAt: null },
    });
  });

  it("bleibt während der Snapshot-Abfrage im Ladezustand", async () => {
    dbMocks.getSnapshots.mockReturnValue(new Promise<SnapshotMeta[]>(() => undefined));

    const { result } = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.sources.cdp.count).toBe(1);
      expect(result.current.sources.eramonIface.count).toBe(2);
      expect(result.current.sources.eramonL2.count).toBe(1);
      expect(result.current.sources.ipam.count).toBe(1);
      expect(result.current.sources.techInfo.count).toBe(1);
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("meldet Snapshot-Fehler und priorisiert Datenfehler in der dokumentierten Reihenfolge", async () => {
    const snapshotError = new Error("snapshots failed");
    const ifaceError = new Error("iface failed");
    dbMocks.getSnapshots.mockRejectedValue(snapshotError);
    dbMocks.getAllEramonIfaceLatest.mockRejectedValue(ifaceError);

    const first = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    expect(first.result.current.error).toBe(ifaceError);
    first.unmount();

    setSuccessfulQueries();
    dbMocks.getSnapshots.mockRejectedValue(snapshotError);
    const second = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.error).toBe(snapshotError);
  });

  it("refetcht Snapshot-Metadaten und alle sechs Audit-Datenquellen", async () => {
    const { result } = renderHook(() => useNetworkAudit(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    Object.values(dbMocks).forEach((mock) => mock.mockClear());

    await act(async () => {
      await result.current.refetch();
    });

    expect(dbMocks.getSnapshots).toHaveBeenCalledTimes(1);
    expect(dbMocks.getAllEramonIfaceLatest).toHaveBeenCalledTimes(1);
    expect(dbMocks.getAllEramonL2Latest).toHaveBeenCalledTimes(1);
    expect(dbMocks.getAllCdpLatest).toHaveBeenCalledTimes(1);
    expect(dbMocks.getBySnapshotIds).toHaveBeenCalledTimes(1);
    expect(dbMocks.getAllTechInfoLatest).toHaveBeenCalledTimes(1);
    expect(dbMocks.getAllIpamLatest).toHaveBeenCalledTimes(1);
  });
});
