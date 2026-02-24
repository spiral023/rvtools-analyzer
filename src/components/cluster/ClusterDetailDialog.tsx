import { useMemo } from "react";
import { Activity, Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toBoolLoose, toNumLoose } from "@/lib/conversion";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
} from "@/domain/models/types";

interface ClusterDetailDialogProps {
  clusterName: string | null;
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
  vmCount: number;
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

export function ClusterDetailDialog({
  clusterName,
  open,
  onClose,
  clusters,
  hosts,
  vms,
  datastores,
  rawVHostRows,
}: ClusterDetailDialogProps) {
  const normalizedClusterName = (clusterName || "").trim();

  const scopedClusters = useMemo(
    () => clusters.filter((cluster) => cluster.name === normalizedClusterName),
    [clusters, normalizedClusterName],
  );

  const scopedHosts = useMemo(
    () => hosts.filter((host) => host.cluster === normalizedClusterName),
    [hosts, normalizedClusterName],
  );

  const scopedVms = useMemo(
    () => vms.filter((vm) => vm.cluster === normalizedClusterName),
    [vms, normalizedClusterName],
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

  const scopedDatastores = useMemo(
    () => datastores.filter((ds) => ds.clusterName === normalizedClusterName),
    [datastores, normalizedClusterName],
  );

  const hostLoadRows = useMemo<HostLoadRow[]>(() => {
    return rawVHostRows
      .filter((row) => String(row.data["Cluster"] || "").trim() === normalizedClusterName)
      .map((row) => ({
        host: String(row.data["Host"] || "").trim(),
        cpuUsagePct: toNumLoose(row.data["CPU usage %"]),
        memoryUsagePct: toNumLoose(row.data["Memory usage %"]),
        vmCount: toNumLoose(row.data["# VMs"]),
        vcpuCount: toNumLoose(row.data["# vCPUs"]),
        vmUsedMiB: toNumLoose(row.data["VM Used memory"]),
        memoryTotalMiB: toNumLoose(row.data["# Memory"]),
        htAvailable: toOptionalBool(row.data["HT Available"]),
        htActive: toOptionalBool(row.data["HT Active"]),
      }))
      .filter((row) => row.host)
      .sort((a, b) => Math.max(b.cpuUsagePct, b.memoryUsagePct) - Math.max(a.cpuUsagePct, a.memoryUsagePct));
  }, [rawVHostRows, normalizedClusterName]);

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
  const totalSwapBalloonMiB = useMemo(
    () =>
      rawVHostRows
        .filter((row) => String(row.data["Cluster"] || "").trim() === normalizedClusterName)
        .reduce(
          (sum, row) =>
            sum + toNumLoose(row.data["VM Memory Swapped"]) + toNumLoose(row.data["VM Memory Ballooned"]),
          0,
        ),
    [rawVHostRows, normalizedClusterName],
  );
  const swapBalloonPct = totalMemoryMiB > 0 ? (totalSwapBalloonMiB / totalMemoryMiB) * 100 : null;

  const datacenters = useMemo(
    () =>
      [
        ...new Set(
          [
            ...scopedClusters.map((cluster) => cluster.datacenter),
            ...scopedHosts.map((host) => host.datacenter),
          ]
            .filter((value): value is string => Boolean(value && value.trim()))
            .map((value) => value.trim()),
        ),
      ].sort((a, b) => a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" })),
    [scopedClusters, scopedHosts],
  );

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
  const uniqueVcenters = new Set(scopedClusters.map((cluster) => cluster.vcenterId)).size;

  if (!normalizedClusterName) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
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
                {datacenters.length > 0 ? datacenters.join(" · ") : "Datacenter unbekannt"}
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
                  vCenter: {formatNum(uniqueVcenters)}
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
