import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds } from "@/data/db";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GitCompare, Server, Cpu, MemoryStick, HardDrive, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { formatNum, formatPct, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, NormalizedCluster, NormalizedDatastore, NormalizedHealth, SnapshotMeta } from "@/domain/models/types";

interface VCenterSummary {
  vcenterId: string;
  displayName: string;
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
}

const fleetColumns: ColumnDef<VCenterSummary, unknown>[] = [
  { accessorKey: "displayName", header: "vCenter" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "poweredOn", header: "Powered On", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "hostCount", header: "Hosts", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "clusterCount", header: "Cluster", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "totalRamGiB", header: "RAM Total", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "avgDsFree", header: "Ø DS Frei %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v < 15 ? "text-destructive" : v < 25 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "cpuOvercommit", header: "CPU OC", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 5 ? "text-destructive" : v > 3 ? "text-warning" : ""}>{v.toFixed(1)}:1</span>;
  }},
  { accessorKey: "healthIssues", header: "Health", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 0 ? "text-warning" : "text-success"}>{formatNum(v)}</span>;
  }},
];

export default function FleetCompare() {
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });

  // Get latest snapshot per vcenter
  const latestSnapshots = useMemo(() => {
    const map = new Map<string, SnapshotMeta>();
    for (const s of snapshots) {
      const existing = map.get(s.vcenterId);
      if (!existing || s.exportTs > existing.exportTs) map.set(s.vcenterId, s);
    }
    return [...map.values()];
  }, [snapshots]);

  const allSnapshotIds = latestSnapshots.map((s) => s.snapshotId);

  const { data: allVms = [] } = useQuery({ queryKey: ["fleet-vms", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allHosts = [] } = useQuery({ queryKey: ["fleet-hosts", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedHost>("entities_host", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allClusters = [] } = useQuery({ queryKey: ["fleet-clusters", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedCluster>("entities_cluster", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allDatastores = [] } = useQuery({ queryKey: ["fleet-ds", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allHealth = [] } = useQuery({ queryKey: ["fleet-health", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedHealth>("entities_health", allSnapshotIds), enabled: allSnapshotIds.length > 0 });

  const summaries = useMemo<VCenterSummary[]>(() =>
    latestSnapshots.map((snap) => {
      const vms = allVms.filter((v) => v.snapshotId === snap.snapshotId);
      const hosts = allHosts.filter((h) => h.snapshotId === snap.snapshotId);
      const clusters = allClusters.filter((c) => c.snapshotId === snap.snapshotId);
      const ds = allDatastores.filter((d) => d.snapshotId === snap.snapshotId);
      const health = allHealth.filter((h) => h.snapshotId === snap.snapshotId);

      const poweredOn = vms.filter((v) => v.powerState === "poweredOn");
      const totalVcpu = poweredOn.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const totalThreads = clusters.reduce((s, c) => s + (c.numCpuThreads || 0), 0);
      const totalRamMiB = clusters.reduce((s, c) => s + (c.totalMemoryMiB || 0), 0);
      const dsWithPct = ds.filter((d) => d.freePct !== null);
      const avgDsFree = dsWithPct.length ? dsWithPct.reduce((s, d) => s + d.freePct!, 0) / dsWithPct.length : 100;

      return {
        vcenterId: snap.vcenterId,
        displayName: snap.vcenterDisplayName,
        vmCount: vms.length,
        poweredOn: poweredOn.length,
        hostCount: hosts.length,
        clusterCount: clusters.length,
        totalCpuThreads: totalThreads,
        totalRamGiB: totalRamMiB / 1024,
        datastoreCount: ds.length,
        avgDsFree: Math.round(avgDsFree * 10) / 10,
        healthIssues: health.length,
        cpuOvercommit: totalThreads ? Math.round((totalVcpu / totalThreads) * 100) / 100 : 0,
      };
    }),
  [latestSnapshots, allVms, allHosts, allClusters, allDatastores, allHealth]);

  // Chart data for comparison
  const compareChart = useMemo(() =>
    summaries.map((s) => ({
      name: s.displayName.length > 15 ? s.displayName.slice(0, 12) + "…" : s.displayName,
      VMs: s.vmCount,
      Hosts: s.hostCount,
      Datastores: s.datastoreCount,
    })),
  [summaries]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Fleet Compare</h1><EmptyState icon={<GitCompare className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  if (latestSnapshots.length < 2) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Fleet Compare</h1>
        <FilterBar />
        <EmptyState icon={<GitCompare className="h-6 w-6" />} title="Nur 1 vCenter vorhanden" description="Laden Sie Exporte von mindestens 2 verschiedenen vCentern hoch, um eine Fleet-Analyse durchzuführen." />
        {summaries.length === 1 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Aktueller vCenter</h3>
            <VirtualTable data={summaries} columns={fleetColumns} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Fleet Compare</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="vCenter" value={formatNum(summaries.length)} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="VMs Gesamt" value={formatNum(summaries.reduce((s, v) => s + v.vmCount, 0))} icon={<Cpu className="h-4 w-4" />} />
        <KpiCard title="Hosts Gesamt" value={formatNum(summaries.reduce((s, v) => s + v.hostCount, 0))} />
        <KpiCard title="Health Issues" value={formatNum(summaries.reduce((s, v) => s + v.healthIssues, 0))} severity={summaries.some((s) => s.healthIssues > 0) ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">vCenter Vergleich</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={compareChart}>
            <XAxis dataKey="name" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="VMs" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Hosts" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Datastores" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Fleet Übersicht</h3>
        <VirtualTable data={summaries} columns={fleetColumns} />
      </div>
    </div>
  );
}
