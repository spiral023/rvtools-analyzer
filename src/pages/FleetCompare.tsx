import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds, getRawSheetRows } from "@/data/db";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GitCompare, Server, Cpu, AlertTriangle, ShieldAlert } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "@/components/charts/recharts";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, NormalizedCluster, NormalizedDatastore, NormalizedHealth, NormalizedSnapshot as NormSnap, SnapshotMeta } from "@/domain/models/types";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FLEET_KPI, FLEET_COLUMNS, FLEET_SECTIONS } from "@/lib/glossaries/fleetCompare";
import { getFleetQuerySnapshotIds } from "@/lib/fleetQuery";

interface VCenterSummary {
  vcenterId: string; displayName: string; vmCount: number; poweredOn: number;
  hostCount: number; clusterCount: number; totalCpuThreads: number; totalRamGiB: number;
  datastoreCount: number; avgDsFree: number; healthIssues: number; cpuOvercommit: number;
  snapshotCount: number; securityDrift: number; riskScore: number;
}

const fleetColumns: ColumnDef<VCenterSummary, unknown>[] = [
  { accessorKey: "displayName", header: "vCenter", meta: { info: FLEET_COLUMNS.displayName } },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.vmCount } },
  { accessorKey: "poweredOn", header: "Powered On", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.poweredOn } },
  { accessorKey: "hostCount", header: "Hosts", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.hostCount } },
  { accessorKey: "clusterCount", header: "Cluster", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.clusterCount } },
  { accessorKey: "totalRamGiB", header: "RAM", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB`, meta: { info: FLEET_COLUMNS.totalRamGiB } },
  { accessorKey: "avgDsFree", header: "Ø DS Frei", meta: { info: FLEET_COLUMNS.avgDsFree }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 15 ? "text-destructive" : v < 25 ? "text-warning" : "text-success"}>{formatPct(v)}</span>; }},
  { accessorKey: "cpuOvercommit", header: "CPU OC", meta: { info: FLEET_COLUMNS.cpuOvercommit }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 5 ? "text-destructive" : v > 3 ? "text-warning" : ""}>{v.toFixed(1)}:1</span>; }},
  { accessorKey: "snapshotCount", header: "Snapshots", meta: { info: FLEET_COLUMNS.snapshotCount } },
  { accessorKey: "securityDrift", header: "Sec. Drift", meta: { info: FLEET_COLUMNS.securityDrift } },
  { accessorKey: "healthIssues", header: "Health", meta: { info: FLEET_COLUMNS.healthIssues }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-warning" : "text-success"}>{formatNum(v)}</span>; }},
  { accessorKey: "riskScore", header: "Risiko Score", meta: { info: FLEET_COLUMNS.riskScore }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 50 ? "text-destructive font-semibold" : v > 25 ? "text-warning" : "text-success"}>{v}</span>; }},
];

export default function FleetCompare() {
  const { data: snapshots = [], isPending: snapshotsLoading } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });

  const latestSnapshots = useMemo(() => {
    const map = new Map<string, SnapshotMeta>();
    for (const s of snapshots) { const e = map.get(s.vcenterId); if (!e || s.exportTs > e.exportTs) map.set(s.vcenterId, s); }
    return [...map.values()];
  }, [snapshots]);

  const allSnapshotIds = getFleetQuerySnapshotIds(snapshots);

  const { data: allVms = [], isLoading: vmsLoading } = useQuery({ queryKey: ["vms", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allHosts = [], isLoading: hostsLoading } = useQuery({ queryKey: ["hosts", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedHost>("entities_host", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allClusters = [], isLoading: clustersLoading } = useQuery({ queryKey: ["clusters", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedCluster>("entities_cluster", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allDatastores = [], isLoading: datastoresLoading } = useQuery({ queryKey: ["datastores", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allHealth = [], isLoading: healthLoading } = useQuery({ queryKey: ["health", allSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedHealth>("entities_health", allSnapshotIds), enabled: allSnapshotIds.length > 0 });
  const { data: allSnaps = [], isLoading: snapsLoading } = useQuery({ queryKey: ["vmSnapshots", allSnapshotIds], queryFn: () => getBySnapshotIds<NormSnap>("entities_snapshot", allSnapshotIds), enabled: allSnapshotIds.length > 0 });

  // Security drift per vcenter (check dvPort)
  const { data: rawDvPort = [], isLoading: rawDvPortLoading } = useQuery({ queryKey: ["rawSheet", "dvPort", allSnapshotIds], queryFn: () => getRawSheetRows(allSnapshotIds, "dvPort"), enabled: allSnapshotIds.length > 0 });

  const summaries = useMemo<VCenterSummary[]>(() =>
    latestSnapshots.map((snap) => {
      const vms = allVms.filter((v) => v.snapshotId === snap.snapshotId);
      const hosts = allHosts.filter((h) => h.snapshotId === snap.snapshotId);
      const clusters = allClusters.filter((c) => c.snapshotId === snap.snapshotId);
      const ds = allDatastores.filter((d) => d.snapshotId === snap.snapshotId);
      const health = allHealth.filter((h) => h.snapshotId === snap.snapshotId);
      const snaps = allSnaps.filter((s) => s.snapshotId === snap.snapshotId);
      const dvPorts = rawDvPort.filter((r) => r.snapshotId === snap.snapshotId);

      const poweredOn = vms.filter((v) => v.powerState === "poweredOn");
      const totalVcpu = poweredOn.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const totalThreads = clusters.reduce((s, c) => s + (c.numCpuThreads || 0), 0);
      const totalRamMiB = clusters.reduce((s, c) => s + (c.totalMemoryMiB || 0), 0);
      const dsWithPct = ds.filter((d) => d.freePct !== null);
      const avgDsFree = dsWithPct.length ? dsWithPct.reduce((s, d) => s + d.freePct!, 0) / dsWithPct.length : 100;
      const secDrift = dvPorts.filter((r) => String(r.data["Allow Promiscuous"] || "").toLowerCase() === "true" || String(r.data["Mac Changes"] || "").toLowerCase() === "true").length;

      // Risk score
      const critDs = ds.filter((d) => d.freePct !== null && d.freePct < 10).length;
      const cpuOc = totalThreads ? totalVcpu / totalThreads : 0;
      let riskScore = 0;
      riskScore += health.length * 2;
      riskScore += critDs * 10;
      riskScore += snaps.length * 3;
      riskScore += secDrift * 5;
      if (cpuOc > 5) riskScore += 15;
      else if (cpuOc > 3) riskScore += 5;

      return {
        vcenterId: snap.vcenterId, displayName: snap.vcenterDisplayName,
        vmCount: vms.length, poweredOn: poweredOn.length, hostCount: hosts.length,
        clusterCount: clusters.length, totalCpuThreads: totalThreads,
        totalRamGiB: totalRamMiB / 1024, datastoreCount: ds.length,
        avgDsFree: Math.round(avgDsFree * 10) / 10, healthIssues: health.length,
        cpuOvercommit: totalThreads ? Math.round((totalVcpu / totalThreads) * 100) / 100 : 0,
        snapshotCount: snaps.length, securityDrift: secDrift,
        riskScore: Math.min(riskScore, 100),
      };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, "de-DE", { numeric: true, sensitivity: "base" })), [latestSnapshots, allVms, allHosts, allClusters, allDatastores, allHealth, allSnaps, rawDvPort]);

  const compareChart = useMemo(() => summaries.map((s) => ({ name: s.displayName.length > 15 ? s.displayName.slice(0, 12) + "…" : s.displayName, VMs: s.vmCount, Hosts: s.hostCount, Datastores: s.datastoreCount })), [summaries]);

  const totalRisk = summaries.reduce((s, v) => s + v.riskScore, 0);
  const kpis = (
    <KpiGrid>
      <KpiCard title="vCenter" value={formatNum(summaries.length)} icon={<Server className="h-4 w-4" />} info={FLEET_KPI.vcenter} />
      <KpiCard title="VMs Gesamt" value={formatNum(summaries.reduce((s, v) => s + v.vmCount, 0))} icon={<Cpu className="h-4 w-4" />} info={FLEET_KPI.vmsTotal} />
      <KpiCard title="Hosts Gesamt" value={formatNum(summaries.reduce((s, v) => s + v.hostCount, 0))} info={FLEET_KPI.hostsTotal} />
      <KpiCard title="Health Issues" value={formatNum(summaries.reduce((s, v) => s + v.healthIssues, 0))} severity={summaries.some((s) => s.healthIssues > 0) ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={FLEET_KPI.healthIssues} />
      <KpiCard title="Security Drift" value={formatNum(summaries.reduce((s, v) => s + v.securityDrift, 0))} severity={summaries.some((s) => s.securityDrift > 0) ? "warn" : "ok"} icon={<ShieldAlert className="h-4 w-4" />} info={FLEET_KPI.securityDrift} />
      <KpiCard title="Risiko Total" value={totalRisk} severity={totalRisk > 100 ? "crit" : totalRisk > 50 ? "warn" : "ok"} info={FLEET_KPI.riskTotal} />
    </KpiGrid>
  );

  const dataLoading = snapshotsLoading || vmsLoading || hostsLoading || clustersLoading
    || datastoresLoading || healthLoading || snapsLoading || rawDvPortLoading;
  if (dataLoading) return <PageLoadingState title="vCenter" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><PageHeader title="vCenter" /><EmptyState icon={<GitCompare className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  if (latestSnapshots.length < 2) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="vCenter" />
        {kpis}
        <EmptyState icon={<GitCompare className="h-6 w-6" />} title="Nur 1 vCenter vorhanden" description="Laden Sie Exporte weiterer vCenter hoch, um Umgebungen direkt zu vergleichen." />
        {summaries.length === 1 && (<div><InfoTooltip entry={FLEET_SECTIONS.singleTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Aktueller vCenter</h3></InfoTooltip><VirtualTable data={summaries} columns={fleetColumns} /></div>)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="vCenter" />
      {kpis}

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <InfoTooltip entry={FLEET_SECTIONS.compareChart} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCenter Vergleich</h3>
        </InfoTooltip>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={compareChart}><XAxis dataKey="name" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Legend wrapperStyle={{ fontSize: "12px" }} /><Bar dataKey="VMs" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} /><Bar dataKey="Hosts" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} /><Bar dataKey="Datastores" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>

      <div><InfoTooltip entry={FLEET_SECTIONS.fleetTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCenter Übersicht</h3></InfoTooltip><VirtualTable data={summaries} columns={fleetColumns} /></div>
    </div>
  );
}
