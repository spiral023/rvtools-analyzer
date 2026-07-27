import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHealth,
  NormalizedHost,
  NormalizedSnapshot,
  NormalizedVm,
  SheetRow,
  SnapshotMeta,
} from "@/domain/models/types";
import { V_CENTER_RELEASES } from "@/lib/vcenterReleaseCatalog";

export interface VCenterSummary {
  vcenterId: string;
  snapshotId: string;
  displayName: string;
  version: string | null;
  vmCount: number;
  poweredOn: number;
  hostCount: number;
  clusterCount: number;
  totalCpuThreads: number;
  totalRamGiB: number;
  datastoreCount: number;
  avgDsFree: number;
  healthIssues: number;
  cpuOvercommit: number;
  healthBreakdown: Array<{ type: string; count: number }>;
  criticalDatastores: number;
  snapshotCount: number;
  securityDrift: number;
  riskScore: number;
}

export interface VCenterWorkspaceInput {
  snapshots: SnapshotMeta[];
  vms: NormalizedVm[];
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  health: NormalizedHealth[];
  vmSnapshots: NormalizedSnapshot[];
  rawDvPort: SheetRow[];
  versionBySnapshot?: ReadonlyMap<string, string>;
}

const vcenterVersionByBuild = new Map(V_CENTER_RELEASES.map((release) => [release.build, release.shortVersion]));

export function latestSnapshotsByVcenter(snapshots: SnapshotMeta[]): SnapshotMeta[] {
  const latestByVcenter = new Map<string, SnapshotMeta>();
  for (const snapshot of snapshots) {
    const current = latestByVcenter.get(snapshot.vcenterId);
    if (!current || snapshot.exportTs > current.exportTs) latestByVcenter.set(snapshot.vcenterId, snapshot);
  }
  return [...latestByVcenter.values()];
}

export function buildVCenterVersionBySnapshot(rawVSource: SheetRow[]): Map<string, string> {
  const versions = new Map<string, string>();
  for (const row of rawVSource) {
    if (versions.has(row.snapshotId)) continue;
    const build = [row.data["Build"], row.data["Fullname"], row.data["Version"]]
      .map((value) => value === null || value === undefined ? undefined : String(value).match(/\d{7,}/g)?.at(-1))
      .find(Boolean);
    const version = build ? vcenterVersionByBuild.get(build) : undefined;
    if (version) versions.set(row.snapshotId, version);
  }
  return versions;
}

export function buildVCenterSummaries(input: VCenterWorkspaceInput): VCenterSummary[] {
  return input.snapshots.map((snapshot) => {
    const vms = input.vms.filter((vm) => vm.snapshotId === snapshot.snapshotId);
    const hosts = input.hosts.filter((host) => host.snapshotId === snapshot.snapshotId);
    const clusters = input.clusters.filter((cluster) => cluster.snapshotId === snapshot.snapshotId);
    const datastores = input.datastores.filter((datastore) => datastore.snapshotId === snapshot.snapshotId);
    const health = input.health.filter((event) => event.snapshotId === snapshot.snapshotId);
    const healthBreakdown = [...health.reduce((counts, event) => {
      const type = event.messageType || "Ohne Typ";
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type, "de-DE"));
    const vmSnapshots = input.vmSnapshots.filter((vmSnapshot) => vmSnapshot.snapshotId === snapshot.snapshotId);
    const dvPorts = input.rawDvPort.filter((row) => row.snapshotId === snapshot.snapshotId);
    const poweredOn = vms.filter((vm) => vm.powerState === "poweredOn");
    const totalVcpu = poweredOn.reduce((sum, vm) => sum + (vm.cpuCount || 0), 0);
    const totalCpuThreads = clusters.reduce((sum, cluster) => sum + (cluster.numCpuThreads || 0), 0);
    const totalRamMiB = clusters.reduce((sum, cluster) => sum + (cluster.totalMemoryMiB || 0), 0);
    const datastoresWithPct = datastores.filter((datastore) => datastore.freePct !== null);
    const avgDsFree = datastoresWithPct.length
      ? datastoresWithPct.reduce((sum, datastore) => sum + datastore.freePct!, 0) / datastoresWithPct.length
      : 100;
    const securityDrift = dvPorts.filter((row) =>
      String(row.data["Allow Promiscuous"] || "").toLowerCase() === "true"
      || String(row.data["Mac Changes"] || "").toLowerCase() === "true",
    ).length;
    const criticalDatastores = datastores.filter((datastore) => datastore.freePct !== null && datastore.freePct < 10).length;
    const cpuOvercommit = totalCpuThreads ? totalVcpu / totalCpuThreads : 0;
    let riskScore = health.length * 2 + criticalDatastores * 10 + vmSnapshots.length * 3 + securityDrift * 5;
    if (cpuOvercommit > 5) riskScore += 15;
    else if (cpuOvercommit > 3) riskScore += 5;

    return {
      vcenterId: snapshot.vcenterId,
      snapshotId: snapshot.snapshotId,
      displayName: snapshot.vcenterDisplayName,
      version: input.versionBySnapshot?.get(snapshot.snapshotId) ?? null,
      vmCount: vms.length,
      poweredOn: poweredOn.length,
      hostCount: hosts.length,
      clusterCount: clusters.length,
      totalCpuThreads,
      totalRamGiB: totalRamMiB / 1024,
      datastoreCount: datastores.length,
      avgDsFree: Math.round(avgDsFree * 10) / 10,
      healthIssues: health.length,
      cpuOvercommit: Math.round(cpuOvercommit * 100) / 100,
      healthBreakdown,
      criticalDatastores,
      snapshotCount: vmSnapshots.length,
      securityDrift,
      riskScore: Math.min(riskScore, 100),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "de-DE", { numeric: true, sensitivity: "base" }));
}
