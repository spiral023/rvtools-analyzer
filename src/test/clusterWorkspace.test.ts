import { describe, expect, it } from "vitest";
import {
  buildClusterDensityChart,
  buildClusterOverviewKpis,
  buildClusterOverviewRows,
  buildRiskChart,
  buildVmDistributionChart,
} from "@/lib/clusterWorkspace";
import * as clusterWorkspace from "@/lib/clusterWorkspace";
import { buildClusterCapacityWorkspace } from "@/lib/clusterCapacityWorkspace";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
  SnapshotMeta,
} from "@/domain/models/types";

const snapshots: SnapshotMeta[] = [
  {
    snapshotId: "snap-a", vcenterId: "vc-a", vcenterDisplayName: "vcsa-a",
    exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z",
    fileName: "a.xlsx", fileChecksum: "a", sheetStats: {},
  },
  {
    snapshotId: "snap-b", vcenterId: "vc-b", vcenterDisplayName: "vcsa-b",
    exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z",
    fileName: "b.xlsx", fileChecksum: "b", sheetStats: {},
  },
];

function cluster(overrides: Partial<NormalizedCluster> = {}): NormalizedCluster {
  const vcenterId = overrides.vcenterId ?? "vc-a";
  const datacenter = overrides.datacenter ?? "DC1";
  const name = overrides.name ?? "Production";
  return {
    snapshotId: vcenterId === "vc-a" ? "snap-a" : "snap-b",
    vcenterId,
    clusterKey: clusterScopeKey(vcenterId, datacenter, name),
    name,
    datacenter,
    haEnabled: true,
    drsEnabled: true,
    numHosts: 2,
    numCpuCores: 20,
    numCpuThreads: 40,
    totalMemoryMiB: 200_000,
    totalCpuMHz: null,
    numEffectiveHosts: 2,
    ...overrides,
  };
}

function host(overrides: Partial<NormalizedHost> = {}): NormalizedHost {
  return {
    snapshotId: "snap-a", vcenterId: "vc-a", hostKey: "host-1", host: "esx-01",
    cluster: "Production", datacenter: "DC1", cpuModel: null, cpuTotalMHz: null,
    cpuCores: 10, cpuThreads: 20, memoryTotalMiB: 100_000, version: null, build: null,
    vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null,
    vmCount: null,
    ...overrides,
  };
}

function vm(overrides: Partial<NormalizedVm> = {}): NormalizedVm {
  return {
    snapshotId: "snap-a", vcenterId: "vc-a", vmKey: "vm-1", vmUuid: null, vmName: "VM-1",
    cluster: "Production", host: "esx-01", powerState: "poweredOn", cpuCount: 6,
    memoryMiB: 16_000, provisionedMiB: null, inUseMiB: null, configStatus: null,
    connectionState: null, consolidationNeeded: null, osConfig: null, osTools: null,
    hwVersion: null, toolsStatus: null, toolsVersion: null, datacenter: "DC1", folder: null,
    resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null,
    cbt: null,
    ...overrides,
  };
}

function rawHost(overrides: Record<string, string | number | boolean | null> = {}): SheetRow {
  const { snapshotId = "snap-a", ...dataOverrides } = overrides;
  return {
    snapshotId: String(snapshotId), sheetName: "vHost", rowIndex: 0,
    data: {
      Cluster: "Production", Datacenter: "DC1", Host: "esx-01", "# Cores": 10,
      "# Memory": 100_000, "CPU usage %": 50, "Memory usage %": 60, "# VMs": 3,
      "# vCPUs": 30, vRAM: 75_000, "VM Used memory": 50_000,
      "VM Memory Swapped": 0, "VM Memory Ballooned": 0, "HT Available": true,
      "HT Active": true,
      ...dataOverrides,
    },
  };
}

describe("clusterWorkspace", () => {
  it("reduziert Ranglisten auf die Top-Cluster und fasst den Rest zusammen", () => {
    const buildTopChartRows = (clusterWorkspace as typeof clusterWorkspace & {
      buildTopChartRows?: <T extends { name: string }>(rows: T[], limit: number, aggregate: (rows: T[]) => T) => T[];
    }).buildTopChartRows;

    expect(buildTopChartRows).toBeTypeOf("function");
    expect(buildTopChartRows?.([
      { name: "Cluster 1", value: 100 },
      { name: "Cluster 2", value: 90 },
      { name: "Cluster 3", value: 80 },
      { name: "Cluster 4", value: 70 },
    ], 2, (remaining) => ({
      name: `Weitere ${remaining.length} Cluster`,
      value: remaining.reduce((total, row) => total + row.value, 0) / remaining.length,
    }))).toEqual([
      { name: "Cluster 1", value: 100 },
      { name: "Cluster 2", value: 90 },
      { name: "Weitere 2 Cluster", value: 75 },
    ]);
  });

  it("builds a row with density, risk and maximum host load", () => {
    const rows = buildClusterOverviewRows({
      clusters: [cluster()],
      hosts: [host(), host({ hostKey: "host-2", host: "esx-02" })],
      vms: Array.from({ length: 10 }, (_, index) => vm({ vmKey: `vm-${index}` })),
      rawVHostRows: [rawHost(), rawHost({ Host: "esx-02", "# VMs": 7 })],
      snapshots,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clusterKey: clusterScopeKey("vc-a", "DC1", "Production"),
      vcenterDisplayName: "vcsa-a",
      datacenter: "DC1",
      cluster: "Production",
      hosts: 2,
      runningVms: 10,
      avgVmsPerHost: 5,
      maxVmsPerHost: 7,
      maxVmsHost: "esx-02",
      haEnabled: true,
      drsEnabled: true,
      vcpuPerCore: 3,
      ramCommitPct: 75,
      risk: "niedrig",
    });
  });

  it("verknüpft Cluster ohne Datacenter-Angabe mit einem eindeutigen Datacenter der Host- und VM-Daten", () => {
    const missingDatacenterCluster = {
      ...cluster(),
      datacenter: null,
      clusterKey: clusterScopeKey("vc-a", null, "Production"),
    };

    const [row] = buildClusterOverviewRows({
      clusters: [missingDatacenterCluster],
      hosts: [host()],
      vms: [vm()],
      rawVHostRows: [rawHost()],
      snapshots,
    });

    expect(row).toMatchObject({
      datacenter: "DC1",
      hosts: 1,
      runningVms: 1,
      maxVmsHost: "esx-01",
    });
  });

  it("baut auch Kapazitäts- und Hostdichte-Metriken für einen Cluster mit nachträglich aufgelöstem Datacenter", () => {
    const missingDatacenterCluster = {
      ...cluster(),
      datacenter: null,
      clusterKey: clusterScopeKey("vc-a", null, "Production"),
    };

    const workspace = buildClusterCapacityWorkspace({
      clusters: [missingDatacenterCluster],
      hosts: [host()],
      vms: [vm()],
      rawVHostRows: [rawHost()],
      snapshots,
    });

    expect(workspace.capacityRows[0]).toMatchObject({ datacenter: "DC1", hosts: 1, totalVms: 3 });
    expect(workspace.hostDensity).toHaveLength(1);
  });

  it("keeps same-named clusters from separate vCenters separate", () => {
    const rows = buildClusterOverviewRows({
      clusters: [cluster(), cluster({ snapshotId: "snap-b", vcenterId: "vc-b" })],
      hosts: [host(), host({ snapshotId: "snap-b", vcenterId: "vc-b", hostKey: "host-b", host: "esx-b" })],
      vms: [vm(), vm({ snapshotId: "snap-b", vcenterId: "vc-b", vmKey: "vm-b", host: "esx-b" })],
      rawVHostRows: [rawHost(), rawHost({ snapshotId: "snap-b", Host: "esx-b", "# VMs": 1, Datacenter: "DC1" })],
      snapshots,
    });

    expect(rows.map((row) => [row.vcenterId, row.clusterKey, row.runningVms])).toEqual([
      ["vc-a", clusterScopeKey("vc-a", "DC1", "Production"), 1],
      ["vc-b", clusterScopeKey("vc-b", "DC1", "Production"), 1],
    ]);
  });

  it("keeps missing raw host counts null and ignores them for the maximum", () => {
    const [row] = buildClusterOverviewRows({
      clusters: [cluster()],
      hosts: [host(), host({ hostKey: "host-2", host: "esx-02" })],
      vms: [],
      rawVHostRows: [rawHost({ Host: "esx-01", "# VMs": null }), rawHost({ Host: "esx-02", "# VMs": 4 })],
      snapshots,
    });
    const [withoutRawCounts] = buildClusterOverviewRows({
      clusters: [cluster()], hosts: [host()], vms: [],
      rawVHostRows: [rawHost({ "# VMs": null })], snapshots,
    });

    expect(row).toMatchObject({ maxVmsPerHost: 4, maxVmsHost: "esx-02" });
    expect(withoutRawCounts).toMatchObject({ maxVmsPerHost: null, maxVmsHost: null });
  });

  it("builds KPI and chart data without inventing density for clusters without hosts", () => {
    const rows = buildClusterOverviewRows({
      clusters: [
        cluster({ haEnabled: false }),
        cluster({ name: "No hosts", clusterKey: clusterScopeKey("vc-a", "DC1", "No hosts"), drsEnabled: null }),
      ],
      hosts: [host()],
      vms: [vm()],
      rawVHostRows: [rawHost()],
      snapshots,
    });

    expect(buildClusterOverviewKpis(rows)).toMatchObject({
      clusters: 2,
      hosts: 1,
      runningVms: 1,
      highRiskClusters: 0,
      maxVmsPerHost: 3,
      maxVmsCluster: "Production",
      maxVmsHost: "esx-01",
      haDrsIssues: 2,
    });
    expect(buildClusterDensityChart(rows)).toEqual([
      expect.objectContaining({ name: "vcsa-a · DC1 · Production", avgVmsPerHost: 1, vcpuPerCore: 3, runningVms: 1 }),
    ]);
    expect(buildRiskChart(rows).map((point) => point.name)).toEqual([
      "vcsa-a · DC1 · No hosts",
      "vcsa-a · DC1 · Production",
    ]);
    expect(buildVmDistributionChart(rows)).toEqual([
      expect.objectContaining({ name: "vcsa-a · DC1 · Production", avgVmsPerHost: 1, maxVmsPerHost: 3 }),
      expect.objectContaining({ name: "vcsa-a · DC1 · No hosts", avgVmsPerHost: null, maxVmsPerHost: null }),
    ]);
  });
});
