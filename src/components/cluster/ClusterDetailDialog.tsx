import { useMemo } from "react";
import { Activity, Copy, Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { toBoolLoose, toNumLoose } from "@/lib/conversion";
import { clusterScopeKey, isSameCluster, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";
import { buildClusterDetailMarkdown } from "@/lib/detailMarkdown";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
} from "@/domain/models/types";

interface ClusterDetailDialogProps {
  clusterKey: string | null;
  vcenterDisplayName?: string;
  open: boolean;
  onClose: () => void;
  clusters: NormalizedCluster[];
  hosts: NormalizedHost[];
  vms: NormalizedVm[];
  datastores: NormalizedDatastore[];
  rawVHostRows: SheetRow[];
}

interface HostLoadRow {
  host: string;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vmCount: number | null;
  vcpuCount: number;
  vmUsedMiB: number;
  memoryTotalMiB: number;
  htAvailable: boolean | null;
  htActive: boolean | null;
}

function isPoweredOn(powerState: string | null | undefined): boolean {
  const normalized = (powerState || "").replace(/\s+/g, "").toLowerCase();
  return normalized === "poweredon" || normalized === "on";
}

function toOptionalBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return toBoolLoose(value);
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = toNumLoose(value);
  return Number.isFinite(number) ? number : null;
}

function aggregateBoolean(values: Array<boolean | null | undefined>): { label: string; className: string } {
  const unique = [...new Set(values.filter((value) => value !== null && value !== undefined))] as boolean[];
  if (unique.length === 0) return { label: "—", className: "text-muted-foreground" };
  if (unique.length === 1) return unique[0] ? { label: "Aktiv", className: "text-success" } : { label: "Aus", className: "text-warning" };
  return { label: "Gemischt", className: "text-warning" };
}

function formatRatio(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function metricSeverity(value: number | null, warn: number, crit: number): string {
  if (value === null || !Number.isFinite(value)) return "text-muted-foreground";
  if (value >= crit) return "text-destructive font-semibold";
  if (value >= warn) return "text-warning";
  return "text-success";
}

function useClusterDetailDialogView({
  clusterKey,
  vcenterDisplayName,
  open,
  onClose,
  clusters,
  hosts,
  vms,
  datastores,
  rawVHostRows,
}: ClusterDetailDialogProps) {
  const associationIdentities = useMemo<ClusterIdentity[]>(() => [
    ...hosts.map((host) => ({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster })),
    ...vms.map((vm) => ({ vcenterId: vm.vcenterId, datacenter: vm.datacenter, clusterName: vm.cluster })),
  ], [hosts, vms]);
  const selectedCluster = useMemo(
    () => clusters.find((cluster) => {
      const identity = resolveClusterIdentity({
        vcenterId: cluster.vcenterId,
        datacenter: cluster.datacenter,
        clusterName: cluster.name,
      }, associationIdentities);
      return cluster.clusterKey === clusterKey
        || clusterScopeKey(identity.vcenterId, identity.datacenter, identity.clusterName) === clusterKey;
    }) ?? null,
    [associationIdentities, clusterKey, clusters],
  );
  const clusterIdentity = useMemo<ClusterIdentity | null>(() => (
    selectedCluster
      ? resolveClusterIdentity({
        vcenterId: selectedCluster.vcenterId,
        datacenter: selectedCluster.datacenter,
        clusterName: selectedCluster.name,
      }, associationIdentities)
      : null
  ), [associationIdentities, selectedCluster]);
  const normalizedClusterName = selectedCluster?.name ?? "";
  const resolvedVcenterDisplayName = vcenterDisplayName?.trim() || selectedCluster?.vcenterId || "vCenter unbekannt";
  const datacenterDisplayName = selectedCluster?.datacenter?.trim() || "Datacenter unbekannt";

  const scopedClusters = useMemo(
    () => clusterIdentity
      ? clusters.filter((cluster) => isSameCluster({
        vcenterId: cluster.vcenterId,
        datacenter: cluster.datacenter,
        clusterName: cluster.name,
      }, clusterIdentity))
      : [],
    [clusterIdentity, clusters],
  );

  const scopedHosts = useMemo(
    () => clusterIdentity
      ? hosts.filter((host) => isSameCluster({
        vcenterId: host.vcenterId,
        datacenter: host.datacenter,
        clusterName: host.cluster,
      }, clusterIdentity))
      : [],
    [clusterIdentity, hosts],
  );

  const scopedVms = useMemo(
    () => clusterIdentity
      ? vms.filter((vm) => isSameCluster({
        vcenterId: vm.vcenterId,
        datacenter: vm.datacenter,
        clusterName: vm.cluster,
      }, clusterIdentity))
      : [],
    [clusterIdentity, vms],
  );

  const runningVms = useMemo(
    () =>
      scopedVms
        .filter((vm) => isPoweredOn(vm.powerState))
        .sort(
          (a, b) =>
            (b.memoryMiB || 0) - (a.memoryMiB || 0) ||
            a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }),
        ),
    [scopedVms],
  );

  const scopedSnapshotIds = useMemo(
    () => new Set(scopedClusters.map((cluster) => cluster.snapshotId)),
    [scopedClusters],
  );

  const scopedDatastores = useMemo(
    () => clusterIdentity
      ? datastores.filter((ds) => (
        scopedSnapshotIds.has(ds.snapshotId)
        && ds.vcenterId === clusterIdentity.vcenterId
        && (ds.clusterName || "").trim() === (clusterIdentity.clusterName || "").trim()
      ))
      : [],
    [clusterIdentity, datastores, scopedSnapshotIds],
  );

  const scopedRawVHostRows = useMemo(() => {
    if (!clusterIdentity) return [];
    return rawVHostRows.filter((row) => (
      scopedSnapshotIds.has(row.snapshotId)
      && String(row.data["Cluster"] ?? "").trim() === (clusterIdentity.clusterName || "").trim()
      && String(row.data["Datacenter"] ?? "").trim() === (clusterIdentity.datacenter || "").trim()
    ));
  }, [clusterIdentity, rawVHostRows, scopedSnapshotIds]);

  const hostLoadRows = useMemo<HostLoadRow[]>(() => {
    const rows: HostLoadRow[] = [];
    for (const row of scopedRawVHostRows) {
      const host = String(row.data["Host"] || "").trim();
      if (!host) continue;
      rows.push({
        host,
        cpuUsagePct: toNumLoose(row.data["CPU usage %"]),
        memoryUsagePct: toNumLoose(row.data["Memory usage %"]),
        vmCount: toOptionalNumber(row.data["# VMs"]),
        vcpuCount: toNumLoose(row.data["# vCPUs"]),
        vmUsedMiB: toNumLoose(row.data["VM Used memory"]),
        memoryTotalMiB: toNumLoose(row.data["# Memory"]),
        htAvailable: toOptionalBool(row.data["HT Available"]),
        htActive: toOptionalBool(row.data["HT Active"]),
      });
    }
    return rows.sort((a, b) => Math.max(b.cpuUsagePct, b.memoryUsagePct) - Math.max(a.cpuUsagePct, a.memoryUsagePct));
  }, [scopedRawVHostRows]);

  const totalHostsByCluster = useMemo(
    () => scopedClusters.reduce((sum, cluster) => sum + (cluster.numHosts || 0), 0),
    [scopedClusters],
  );
  const totalCoresByCluster = useMemo(
    () => scopedClusters.reduce((sum, cluster) => sum + (cluster.numCpuCores || 0), 0),
    [scopedClusters],
  );
  const totalThreadsByCluster = useMemo(
    () => scopedClusters.reduce((sum, cluster) => sum + (cluster.numCpuThreads || 0), 0),
    [scopedClusters],
  );
  const totalMemoryByClusterMiB = useMemo(
    () => scopedClusters.reduce((sum, cluster) => sum + (cluster.totalMemoryMiB || 0), 0),
    [scopedClusters],
  );
  const totalCpuByClusterMHz = useMemo(
    () => scopedClusters.reduce((sum, cluster) => sum + (cluster.totalCpuMHz || 0), 0),
    [scopedClusters],
  );

  const totalCoresByHosts = useMemo(
    () => scopedHosts.reduce((sum, host) => sum + (host.cpuCores || 0), 0),
    [scopedHosts],
  );
  const totalThreadsByHosts = useMemo(
    () => scopedHosts.reduce((sum, host) => sum + (host.cpuThreads || 0), 0),
    [scopedHosts],
  );
  const totalMemoryByHostsMiB = useMemo(
    () => scopedHosts.reduce((sum, host) => sum + (host.memoryTotalMiB || 0), 0),
    [scopedHosts],
  );

  const hostCount = scopedHosts.length > 0 ? scopedHosts.length : totalHostsByCluster;
  const totalCores = totalCoresByHosts > 0 ? totalCoresByHosts : totalCoresByCluster;
  const totalThreads = totalThreadsByHosts > 0 ? totalThreadsByHosts : totalThreadsByCluster;
  const totalMemoryMiB = totalMemoryByHostsMiB > 0 ? totalMemoryByHostsMiB : totalMemoryByClusterMiB;

  const totalRunningVcpu = useMemo(
    () => runningVms.reduce((sum, vm) => sum + (vm.cpuCount || 0), 0),
    [runningVms],
  );
  const totalRunningVmRamMiB = useMemo(
    () => runningVms.reduce((sum, vm) => sum + (vm.memoryMiB || 0), 0),
    [runningVms],
  );

  const vcpuPerCore = totalCores > 0 ? totalRunningVcpu / totalCores : null;
  const ramCommitPct = totalMemoryMiB > 0 ? (totalRunningVmRamMiB / totalMemoryMiB) * 100 : null;
  const vmsPerHost = hostCount > 0 ? runningVms.length / hostCount : null;

  const avgCpuUsagePct = hostLoadRows.length > 0
    ? hostLoadRows.reduce((sum, row) => sum + row.cpuUsagePct, 0) / hostLoadRows.length
    : null;
  const avgMemoryUsagePct = hostLoadRows.length > 0
    ? hostLoadRows.reduce((sum, row) => sum + row.memoryUsagePct, 0) / hostLoadRows.length
    : null;
  const hotHosts = hostLoadRows.filter((row) => row.cpuUsagePct > 60 || row.memoryUsagePct > 75).length;
  const maxVmHostLoad = useMemo(() => {
    let maximum: HostLoadRow | null = null;
    for (const row of hostLoadRows) {
      if (row.vmCount === null || (maximum !== null && row.vmCount <= (maximum.vmCount ?? Number.NEGATIVE_INFINITY))) continue;
      maximum = row;
    }
    return maximum;
  }, [hostLoadRows]);
  const totalSwapBalloonMiB = useMemo(
    () =>
      scopedRawVHostRows
        .reduce(
          (sum, row) =>
            sum + toNumLoose(row.data["VM Memory Swapped"]) + toNumLoose(row.data["VM Memory Ballooned"]),
          0,
        ),
    [scopedRawVHostRows],
  );
  const swapBalloonPct = totalMemoryMiB > 0 ? (totalSwapBalloonMiB / totalMemoryMiB) * 100 : null;

  const avgDsFreePct = useMemo(() => {
    const withFreePct = scopedDatastores.filter((ds) => ds.freePct !== null);
    if (!withFreePct.length) return null;
    return withFreePct.reduce((sum, ds) => sum + (ds.freePct || 0), 0) / withFreePct.length;
  }, [scopedDatastores]);
  const criticalDsCount = scopedDatastores.filter((ds) => ds.freePct !== null && ds.freePct < 10).length;
  const warningDsCount = scopedDatastores.filter((ds) => ds.freePct !== null && ds.freePct >= 10 && ds.freePct < 20).length;

  const haState = aggregateBoolean(scopedClusters.map((cluster) => cluster.haEnabled));
  const drsState = aggregateBoolean(scopedClusters.map((cluster) => cluster.drsEnabled));
  const uniqueSnapshots = new Set(scopedClusters.map((cluster) => cluster.snapshotId)).size;

  if (!selectedCluster) return null;

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(
        buildClusterDetailMarkdown(normalizedClusterName, {
          clusters: scopedClusters,
          hosts: scopedHosts,
          runningVms,
          datastores: scopedDatastores,
        }, {
          vcenterDisplayName: resolvedVcenterDisplayName,
          maxVmsPerHost: maxVmHostLoad?.vmCount ?? null,
          maxVmsHost: maxVmHostLoad?.host ?? null,
        }),
      );
      toast.success("Cluster-Details als Markdown kopiert.");
    } catch {
      toast.error("Cluster-Details konnten nicht kopiert werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyMarkdown()}
          className="absolute right-10 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Cluster-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold font-mono-data truncate">
                {normalizedClusterName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                {resolvedVcenterDisplayName} · {datacenterDisplayName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${drsState.className}`}>
                  DRS: {drsState.label}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${haState.className}`}>
                  HA: {haState.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  Snapshots: {formatNum(uniqueSnapshots)}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  vCenter: {resolvedVcenterDisplayName}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Cluster-Metriken
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Hosts</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(hostCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Laufende VMs</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(runningVms.length)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">vCPU/Core</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(vcpuPerCore, 4, 6)}`}>{formatRatio(vcpuPerCore)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">RAM Commit</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(ramCommitPct, 140, 180)}`}>{formatPct(ramCommitPct)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Ø CPU Usage</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(avgCpuUsagePct, 75, 85)}`}>{formatPct(avgCpuUsagePct)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Ø RAM Usage</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(avgMemoryUsagePct, 80, 90)}`}>{formatPct(avgMemoryUsagePct)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Swap+Balloon</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(swapBalloonPct, 2, 5)}`}>{formatPct(swapBalloonPct, 2)}</p>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5" /> Ressourcen & Kapazität
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">CPU Cores</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(totalCores)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">CPU Threads</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(totalThreads)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total RAM</p>
                  <p className="text-sm font-bold font-mono-data">{formatBytes(totalMemoryMiB)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total CPU MHz</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(totalCpuByClusterMHz)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">vCPUs (laufend)</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(totalRunningVcpu)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">vRAM (laufend)</p>
                  <p className="text-sm font-bold font-mono-data">{formatBytes(totalRunningVmRamMiB)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">VMs/Host</p>
                  <p className="text-sm font-bold font-mono-data">{formatRatio(vmsPerHost)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Max. VMs/Host</p>
                  <p className="text-sm font-bold font-mono-data">
                    {maxVmHostLoad ? `${formatNum(maxVmHostLoad.vmCount)} (${maxVmHostLoad.host})` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Hot Hosts</p>
                  <p className={`text-sm font-bold font-mono-data ${hotHosts > 0 ? "text-warning" : "text-success"}`}>
                    {formatNum(hotHosts)}
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <MemoryStick className="h-3.5 w-3.5" /> Host-Auslastung ({hostLoadRows.length})
              </h4>
              {hostLoadRows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Host-Auslastungsdaten gefunden</p>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Ø CPU</p>
                      <p className={`text-sm font-bold font-mono-data ${metricSeverity(avgCpuUsagePct, 75, 85)}`}>{formatPct(avgCpuUsagePct)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Ø RAM</p>
                      <p className={`text-sm font-bold font-mono-data ${metricSeverity(avgMemoryUsagePct, 80, 90)}`}>{formatPct(avgMemoryUsagePct)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Hot Hosts</p>
                      <p className={`text-sm font-bold font-mono-data ${hotHosts > 0 ? "text-warning" : "text-success"}`}>{formatNum(hotHosts)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Swap+Balloon</p>
                      <p className={`text-sm font-bold font-mono-data ${metricSeverity(swapBalloonPct, 2, 5)}`}>{formatPct(swapBalloonPct, 2)}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-2 pr-3">Host</th>
                          <th className="py-2 pr-3">CPU %</th>
                          <th className="py-2 pr-3">RAM %</th>
                          <th className="py-2 pr-3">VMs</th>
                          <th className="py-2 pr-3">vCPUs</th>
                          <th className="py-2 pr-3">VM Used RAM</th>
                          <th className="py-2 pr-3">Host RAM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostLoadRows.slice(0, 25).map((row) => (
                          <tr key={row.host} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-2 pr-3 font-mono-data font-semibold">{row.host}</td>
                            <td className={`py-2 pr-3 font-mono-data ${metricSeverity(row.cpuUsagePct, 75, 85)}`}>{row.cpuUsagePct.toFixed(1)}%</td>
                            <td className={`py-2 pr-3 font-mono-data ${metricSeverity(row.memoryUsagePct, 80, 90)}`}>{row.memoryUsagePct.toFixed(1)}%</td>
                            <td className="py-2 pr-3 font-mono-data">{formatNum(row.vmCount)}</td>
                            <td className="py-2 pr-3 font-mono-data">{formatNum(row.vcpuCount)}</td>
                            <td className="py-2 pr-3 font-mono-data">{formatBytes(row.vmUsedMiB)}</td>
                            <td className="py-2 pr-3 font-mono-data">{formatBytes(row.memoryTotalMiB)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Datastores ({scopedDatastores.length})
              </h4>
              {scopedDatastores.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Datastores zu diesem Cluster gefunden</p>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Ø Frei %</p>
                      <p className={`text-sm font-bold font-mono-data ${metricSeverity(avgDsFreePct === null ? null : 100 - avgDsFreePct, 75, 90)}`}>{formatPct(avgDsFreePct)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Kritisch (&lt;10%)</p>
                      <p className={`text-sm font-bold font-mono-data ${criticalDsCount > 0 ? "text-destructive" : "text-success"}`}>{formatNum(criticalDsCount)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Warnung (&lt;20%)</p>
                      <p className={`text-sm font-bold font-mono-data ${warningDsCount > 0 ? "text-warning" : "text-success"}`}>{formatNum(warningDsCount)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Gesamt</p>
                      <p className="text-sm font-bold font-mono-data">{formatNum(scopedDatastores.length)}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-2 pr-3">Datastore</th>
                          <th className="py-2 pr-3">Typ</th>
                          <th className="py-2 pr-3">Kapazität</th>
                          <th className="py-2 pr-3">Belegt</th>
                          <th className="py-2 pr-3">Frei</th>
                          <th className="py-2 pr-3">Frei %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedDatastores
                          .slice()
                          .sort((a, b) => (a.freePct ?? Number.POSITIVE_INFINITY) - (b.freePct ?? Number.POSITIVE_INFINITY))
                          .map((ds) => (
                            <tr key={ds.dsKey} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                              <td className="py-2 pr-3 font-mono-data font-semibold">{ds.name}</td>
                              <td className="py-2 pr-3">{ds.type || "—"}</td>
                              <td className="py-2 pr-3 font-mono-data">{formatBytes(ds.capacityMiB)}</td>
                              <td className="py-2 pr-3 font-mono-data">{formatBytes(ds.inUseMiB)}</td>
                              <td className="py-2 pr-3 font-mono-data">{formatBytes(ds.freeMiB)}</td>
                              <td className={`py-2 pr-3 font-mono-data ${ds.freePct !== null && ds.freePct < 10 ? "text-destructive font-semibold" : ds.freePct !== null && ds.freePct < 20 ? "text-warning" : "text-success"}`}>
                                {formatPct(ds.freePct)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Server className="h-3.5 w-3.5" /> Laufende VMs ({runningVms.length})
              </h4>
              {runningVms.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine laufenden VMs in diesem Cluster gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">VM</th>
                        <th className="py-2 pr-3">Host</th>
                        <th className="py-2 pr-3">vCPU</th>
                        <th className="py-2 pr-3">RAM</th>
                        <th className="py-2 pr-3">Config</th>
                        <th className="py-2 pr-3">OS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runningVms.slice(0, 100).map((vm) => (
                        <tr key={`${vm.vmKey}::${vm.snapshotId}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{vm.vmName}</td>
                          <td className="py-2 pr-3 font-mono-data">{vm.host || "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatNum(vm.cpuCount)}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatBytes(vm.memoryMiB)}</td>
                          <td className="py-2 pr-3">{vm.configStatus || "—"}</td>
                          <td className="py-2 pr-3">{vm.osConfig || vm.osTools || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClusterDetailDialog(props: ClusterDetailDialogProps) {
  return useClusterDetailDialogView(props);
}
