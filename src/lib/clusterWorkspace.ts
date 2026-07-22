import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
  SnapshotMeta,
} from "@/domain/models/types";
import {
  aggregateCluster,
  groupVHostRowsByCluster,
  metricsFromAggregate,
} from "@/domain/services/clusterCapacityEngine";
import { clusterScopeKey, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";

export interface ClusterWorkspaceInput {
  clusters: NormalizedCluster[];
  hosts: NormalizedHost[];
  vms: NormalizedVm[];
  rawVHostRows: SheetRow[];
  snapshots: SnapshotMeta[];
}

export interface ClusterOverviewRow {
  clusterKey: string;
  vcenterId: string;
  vcenterDisplayName: string;
  datacenter: string;
  cluster: string;
  haEnabled: boolean | null;
  drsEnabled: boolean | null;
  hosts: number;
  runningVms: number;
  avgVmsPerHost: number | null;
  maxVmsPerHost: number | null;
  maxVmsHost: string | null;
  vcpuPerCore: number;
  ramCommitPct: number;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
}

export interface ClusterOverviewKpis {
  clusters: number;
  hosts: number;
  runningVms: number;
  highRiskClusters: number;
  maxVmsPerHost: number | null;
  maxVmsCluster: string | null;
  maxVmsHost: string | null;
  maxVmsVcenterDisplayName: string | null;
  haDrsIssues: number;
}

interface ClusterChartPoint {
  clusterKey: string;
  name: string;
  vcenterDisplayName: string;
  datacenter: string;
  cluster: string;
}

/** Reduces a ranked chart to its most relevant rows while preserving the remainder as one summary row. */
export function buildTopChartRows<T extends { name: string }>(
  rows: T[],
  limit: number,
  aggregate: (remaining: T[]) => T,
): T[] {
  if (rows.length <= limit) return rows;
  return [...rows.slice(0, limit), aggregate(rows.slice(limit))];
}

export interface ClusterDensityPoint extends ClusterChartPoint {
  avgVmsPerHost: number;
  vcpuPerCore: number;
  runningVms: number;
  risk: ClusterOverviewRow["risk"];
}

export interface ClusterRiskPoint extends ClusterChartPoint {
  riskScore: number;
  risk: ClusterOverviewRow["risk"];
}

export interface VmDistributionPoint extends ClusterChartPoint {
  avgVmsPerHost: number | null;
  maxVmsPerHost: number | null;
  maxVmsHost: string | null;
}

function canonicalKey(vcenterId: string, datacenter: string | null | undefined, cluster: string | null | undefined): string {
  return clusterScopeKey(vcenterId, datacenter, cluster);
}

function clusterLabel(row: ClusterOverviewRow): string {
  return `${row.vcenterDisplayName} · ${row.datacenter} · ${row.cluster}`;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function maxHostLoad(rows: SheetRow[]): { maxVmsPerHost: number | null; maxVmsHost: string | null } {
  let maxVmsPerHost: number | null = null;
  let maxVmsHost: string | null = null;

  for (const row of rows) {
    const host = String(row.data["Host"] ?? "").trim();
    const vmCount = nullableNumber(row.data["# VMs"]);
    if (!host || vmCount === null) continue;
    if (maxVmsPerHost === null || vmCount > maxVmsPerHost) {
      maxVmsPerHost = vmCount;
      maxVmsHost = host;
    }
  }

  return { maxVmsPerHost, maxVmsHost };
}

function chartBase(row: ClusterOverviewRow): ClusterChartPoint {
  return {
    clusterKey: row.clusterKey,
    name: clusterLabel(row),
    vcenterDisplayName: row.vcenterDisplayName,
    datacenter: row.datacenter,
    cluster: row.cluster,
  };
}

/** Builds vCenter-safe overview rows from the currently scoped snapshot data. */
export function buildClusterOverviewRows(input: ClusterWorkspaceInput): ClusterOverviewRow[] {
  const vcenterBySnapshot = new Map(input.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.vcenterId]));
  const displayByVcenter = new Map<string, string>();
  for (const snapshot of input.snapshots) {
    if (!displayByVcenter.has(snapshot.vcenterId) && snapshot.vcenterDisplayName.trim()) {
      displayByVcenter.set(snapshot.vcenterId, snapshot.vcenterDisplayName);
    }
  }

  const associationIdentities: ClusterIdentity[] = [
    ...input.hosts.map((host) => ({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster })),
    ...input.vms.map((vm) => ({ vcenterId: vm.vcenterId, datacenter: vm.datacenter, clusterName: vm.cluster })),
    ...input.rawVHostRows.flatMap((row) => {
      const vcenterId = vcenterBySnapshot.get(row.snapshotId);
      return vcenterId ? [{
        vcenterId,
        datacenter: String(row.data["Datacenter"] ?? ""),
        clusterName: String(row.data["Cluster"] ?? ""),
      }] : [];
    }),
  ];
  const resolveIdentity = (identity: ClusterIdentity) => resolveClusterIdentity(identity, associationIdentities);

  const hostsByCluster = new Map<string, number>();
  for (const host of input.hosts) {
    if (!host.cluster) continue;
    const resolved = resolveIdentity({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster });
    const key = canonicalKey(resolved.vcenterId, resolved.datacenter, resolved.clusterName);
    hostsByCluster.set(key, (hostsByCluster.get(key) ?? 0) + 1);
  }

  const runningVmsByCluster = new Map<string, number>();
  for (const vm of input.vms) {
    if (vm.powerState !== "poweredOn" || !vm.cluster) continue;
    const resolved = resolveIdentity({ vcenterId: vm.vcenterId, datacenter: vm.datacenter, clusterName: vm.cluster });
    const key = canonicalKey(resolved.vcenterId, resolved.datacenter, resolved.clusterName);
    runningVmsByCluster.set(key, (runningVmsByCluster.get(key) ?? 0) + 1);
  }

  const rawRowsByCluster = groupVHostRowsByCluster(input.rawVHostRows, vcenterBySnapshot);
  const clustersByKey = new Map<string, NormalizedCluster>();
  for (const cluster of input.clusters) {
    const resolved = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    const key = canonicalKey(resolved.vcenterId, resolved.datacenter, resolved.clusterName);
    if (!clustersByKey.has(key)) clustersByKey.set(key, cluster);
  }

  return [...clustersByKey.entries()].map(([clusterKey, cluster]) => {
    const identity = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    const rawRows = rawRowsByCluster.get(clusterKey) ?? [];
    const aggregate = aggregateCluster({
      ...identity,
    }, rawRows, vcenterBySnapshot);
    const metrics = metricsFromAggregate(aggregate, {
      clusterName: cluster.name,
      clusterRef: cluster,
      projected: false,
    });
    const hosts = hostsByCluster.get(clusterKey) ?? 0;
    const runningVms = runningVmsByCluster.get(clusterKey) ?? 0;
    const maxLoad = maxHostLoad(rawRows);

    return {
      clusterKey,
      vcenterId: cluster.vcenterId,
      vcenterDisplayName: displayByVcenter.get(cluster.vcenterId) ?? cluster.vcenterId,
      datacenter: identity.datacenter?.trim() || "—",
      cluster: cluster.name,
      haEnabled: cluster.haEnabled,
      drsEnabled: cluster.drsEnabled,
      hosts,
      runningVms,
      avgVmsPerHost: hosts > 0 ? runningVms / hosts : null,
      ...maxLoad,
      vcpuPerCore: metrics.vcpuPerCore,
      ramCommitPct: metrics.ramCommitPct,
      riskScore: metrics.riskScore,
      risk: metrics.risk,
    } satisfies ClusterOverviewRow;
  }).sort((left, right) => (
    left.vcenterDisplayName.localeCompare(right.vcenterDisplayName)
    || left.datacenter.localeCompare(right.datacenter)
    || left.cluster.localeCompare(right.cluster)
  ));
}

export function buildClusterOverviewKpis(rows: ClusterOverviewRow[]): ClusterOverviewKpis {
  let maxRow: ClusterOverviewRow | null = null;
  for (const row of rows) {
    if (row.maxVmsPerHost === null) continue;
    if (maxRow === null || row.maxVmsPerHost > (maxRow.maxVmsPerHost ?? Number.NEGATIVE_INFINITY)) {
      maxRow = row;
    }
  }

  return {
    clusters: rows.length,
    hosts: rows.reduce((total, row) => total + row.hosts, 0),
    runningVms: rows.reduce((total, row) => total + row.runningVms, 0),
    highRiskClusters: rows.filter((row) => row.risk === "hoch").length,
    maxVmsPerHost: maxRow?.maxVmsPerHost ?? null,
    maxVmsCluster: maxRow?.cluster ?? null,
    maxVmsHost: maxRow?.maxVmsHost ?? null,
    maxVmsVcenterDisplayName: maxRow?.vcenterDisplayName ?? null,
    haDrsIssues: rows.filter((row) => row.haEnabled !== true || row.drsEnabled !== true).length,
  };
}

export function buildClusterDensityChart(rows: ClusterOverviewRow[]): ClusterDensityPoint[] {
  return rows
    .filter((row): row is ClusterOverviewRow & { avgVmsPerHost: number } => row.avgVmsPerHost !== null)
    .map((row) => ({
      ...chartBase(row),
      avgVmsPerHost: row.avgVmsPerHost,
      vcpuPerCore: row.vcpuPerCore,
      runningVms: row.runningVms,
      risk: row.risk,
    }))
    .sort((left, right) => right.avgVmsPerHost - left.avgVmsPerHost || left.name.localeCompare(right.name));
}

export function buildRiskChart(rows: ClusterOverviewRow[]): ClusterRiskPoint[] {
  return rows
    .map((row) => ({ ...chartBase(row), riskScore: row.riskScore, risk: row.risk }))
    .sort((left, right) => right.riskScore - left.riskScore || left.name.localeCompare(right.name));
}

export function buildVmDistributionChart(rows: ClusterOverviewRow[]): VmDistributionPoint[] {
  return rows
    .map((row) => ({
      ...chartBase(row),
      avgVmsPerHost: row.avgVmsPerHost,
      maxVmsPerHost: row.maxVmsPerHost,
      maxVmsHost: row.maxVmsHost,
    }))
    .sort((left, right) => (right.avgVmsPerHost ?? Number.NEGATIVE_INFINITY) - (left.avgVmsPerHost ?? Number.NEGATIVE_INFINITY) || left.name.localeCompare(right.name));
}
