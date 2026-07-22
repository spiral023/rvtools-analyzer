import type { NormalizedCluster, NormalizedHost, NormalizedVm, SheetRow, SnapshotMeta } from "@/domain/models/types";
import { aggregateCluster, groupVHostRowsByCluster, metricsFromAggregate } from "@/domain/services/clusterCapacityEngine";
import { clusterScopeKey, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";

export interface ClusterCapacityRow {
  clusterKey: string;
  vcenterDisplayName: string;
  datacenter: string;
  cluster: string;
  hosts: number;
  totalCores: number;
  totalVms: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vcpuPerCore: number;
  ramCommitPct: number;
  ramActivePct: number;
  swapBalloonPct: number;
  hotHosts: number;
  drsEnabled: boolean | null;
  haEnabled: boolean | null;
  clusterHostDelta: number | null;
  clusterMemoryDeltaPct: number | null;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
}

export interface ClusterOvercommitRow {
  clusterKey: string;
  vcenterDisplayName: string;
  datacenter: string;
  cluster: string;
  cpuRatio: number;
  ramRatio: number;
  vCpuSum: number;
  cores: number;
  ramAllocGiB: number;
  ramTotalGiB: number;
}

export interface HostDensityPoint {
  hostKey: string;
  clusterKey: string;
  name: string;
  vcenterDisplayName: string;
  cluster: string;
  vms: number;
  vcpuPerCore: number;
  ramGiB: number;
}

export interface ClusterDensityRow {
  clusterKey: string;
  vcenterDisplayName: string;
  datacenter: string;
  cluster: string;
  hosts: number;
  vmsPerHost: number;
  vcpuPerCore: number;
  ramUtilPct: number;
}

export interface ClusterCapacityWorkspaceInput {
  clusters: NormalizedCluster[];
  hosts: NormalizedHost[];
  vms: NormalizedVm[];
  rawVHostRows: SheetRow[];
  snapshots: SnapshotMeta[];
}

export interface ClusterCapacityWorkspaceData {
  capacityRows: ClusterCapacityRow[];
  overcommitRows: ClusterOvercommitRow[];
  hostDensity: HostDensityPoint[];
  clusterDensity: ClusterDensityRow[];
}

const round = (value: number, decimals = 2) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const clusterKeyFor = (vcenterId: string, datacenter: string | null | undefined, cluster: string | null | undefined) => clusterScopeKey(vcenterId, datacenter, cluster);
const hostKeyFor = (vcenterId: string, datacenter: string | null | undefined, host: string | null | undefined) => `${vcenterId}\u0000${(datacenter ?? "").trim()}\u0000${(host ?? "").trim()}`;

/** Builds precomputed, vCenter-safe data for the cluster capacity tab. */
export function buildClusterCapacityWorkspace(input: ClusterCapacityWorkspaceInput): ClusterCapacityWorkspaceData {
  const vcenterBySnapshot = new Map(input.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.vcenterId]));
  const displayByVcenter = new Map(input.snapshots.map((snapshot) => [snapshot.vcenterId, snapshot.vcenterDisplayName || snapshot.vcenterId]));
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
  const clustersByKey = new Map(input.clusters.map((cluster) => {
    const identity = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    return [clusterKeyFor(identity.vcenterId, identity.datacenter, identity.clusterName), cluster];
  }));
  const rawByCluster = groupVHostRowsByCluster(input.rawVHostRows, vcenterBySnapshot);
  const hostsByCluster = new Map<string, NormalizedHost[]>();
  const vmsByCluster = new Map<string, NormalizedVm[]>();
  const poweredOnByHost = new Map<string, { count: number; vcpus: number }>();

  for (const host of input.hosts) {
    if (!host.cluster) continue;
    const identity = resolveIdentity({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster });
    const key = clusterKeyFor(identity.vcenterId, identity.datacenter, identity.clusterName);
    const rows = hostsByCluster.get(key);
    if (rows) rows.push(host); else hostsByCluster.set(key, [host]);
  }
  for (const vm of input.vms) {
    if (vm.powerState !== "poweredOn") continue;
    if (vm.cluster) {
      const identity = resolveIdentity({ vcenterId: vm.vcenterId, datacenter: vm.datacenter, clusterName: vm.cluster });
      const key = clusterKeyFor(identity.vcenterId, identity.datacenter, identity.clusterName);
      const rows = vmsByCluster.get(key);
      if (rows) rows.push(vm); else vmsByCluster.set(key, [vm]);
    }
    if (vm.host) {
      const key = hostKeyFor(vm.vcenterId, vm.datacenter, vm.host);
      const existing = poweredOnByHost.get(key);
      if (existing) { existing.count += 1; existing.vcpus += vm.cpuCount ?? 0; }
      else poweredOnByHost.set(key, { count: 1, vcpus: vm.cpuCount ?? 0 });
    }
  }

  const capacityRows: ClusterCapacityRow[] = [];
  const overcommitRows: ClusterOvercommitRow[] = [];
  const clusterDensity: ClusterDensityRow[] = [];
  for (const [clusterKey, cluster] of clustersByKey) {
    const identity = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    const rawRows = rawByCluster.get(clusterKey) ?? [];
    const aggregate = aggregateCluster(identity, rawRows, vcenterBySnapshot);
    const metrics = metricsFromAggregate(aggregate, { clusterName: cluster.name, clusterRef: cluster, projected: false });
    const vcenterDisplayName = displayByVcenter.get(cluster.vcenterId) ?? cluster.vcenterId;
    const datacenter = identity.datacenter?.trim() || "—";
    const hostRows = hostsByCluster.get(clusterKey) ?? [];
    const vmRows = vmsByCluster.get(clusterKey) ?? [];
    const cores = hostRows.reduce((sum, host) => sum + (host.cpuCores ?? 0), 0) || cluster.numCpuCores || 0;
    const vCpuSum = vmRows.reduce((sum, vm) => sum + (vm.cpuCount ?? 0), 0);
    const ramAllocMiB = vmRows.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0);
    const ramTotalMiB = cluster.totalMemoryMiB ?? 0;
    const cpuRatio = cores > 0 ? vCpuSum / cores : 0;
    const ramRatio = ramTotalMiB > 0 ? ramAllocMiB / ramTotalMiB : 0;

    capacityRows.push({
      clusterKey, vcenterDisplayName, datacenter, cluster: cluster.name,
      hosts: metrics.hosts, totalCores: metrics.totalCores, totalVms: metrics.totalVms,
      cpuUsagePct: metrics.cpuUsagePct, memoryUsagePct: metrics.memoryUsagePct,
      vcpuPerCore: metrics.vcpuPerCore, ramCommitPct: metrics.ramCommitPct,
      ramActivePct: metrics.ramActivePct, swapBalloonPct: metrics.swapBalloonPct,
      hotHosts: aggregate.hotHosts, drsEnabled: cluster.drsEnabled, haEnabled: cluster.haEnabled,
      clusterHostDelta: cluster.numHosts != null ? aggregate.hosts - cluster.numHosts : null,
      clusterMemoryDeltaPct: cluster.totalMemoryMiB ? round(((aggregate.totalMemoryMiB - cluster.totalMemoryMiB) / cluster.totalMemoryMiB) * 100, 1) : null,
      riskScore: metrics.riskScore, risk: metrics.risk,
    });
    overcommitRows.push({
      clusterKey, vcenterDisplayName, datacenter, cluster: cluster.name,
      cpuRatio: round(cpuRatio), ramRatio: round(ramRatio), vCpuSum, cores,
      ramAllocGiB: ramAllocMiB / 1024, ramTotalGiB: ramTotalMiB / 1024,
    });
    clusterDensity.push({
      clusterKey, vcenterDisplayName, datacenter, cluster: cluster.name, hosts: hostRows.length,
      vmsPerHost: hostRows.length > 0 ? vmRows.length / hostRows.length : 0,
      vcpuPerCore: cluster.numCpuThreads ? vCpuSum / cluster.numCpuThreads : 0,
      ramUtilPct: ramTotalMiB > 0 ? (ramAllocMiB / ramTotalMiB) * 100 : 0,
    });
  }

  const hostDensity = input.hosts.flatMap((host) => {
    if (!host.cluster) return [];
    const identity = resolveIdentity({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster });
    const aggregate = poweredOnByHost.get(hostKeyFor(host.vcenterId, host.datacenter, host.host));
    if (!aggregate) return [];
    return [{
      hostKey: host.hostKey, clusterKey: clusterKeyFor(identity.vcenterId, identity.datacenter, identity.clusterName), name: host.host, vcenterDisplayName: displayByVcenter.get(host.vcenterId) ?? host.vcenterId,
      cluster: host.cluster, vms: aggregate.count, vcpuPerCore: host.cpuCores ? round(aggregate.vcpus / host.cpuCores) : 0,
      ramGiB: round((host.memoryTotalMiB ?? 0) / 1024, 0),
    }];
  });

  return {
    capacityRows: capacityRows.sort((a, b) => b.riskScore - a.riskScore || a.vcenterDisplayName.localeCompare(b.vcenterDisplayName) || a.cluster.localeCompare(b.cluster)),
    overcommitRows: overcommitRows.sort((a, b) => b.cpuRatio - a.cpuRatio),
    hostDensity,
    clusterDensity: clusterDensity.sort((a, b) => b.vmsPerHost - a.vmsPerHost),
  };
}
