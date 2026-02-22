import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useClusters, useDatastores, useHosts } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { HardDrive, Cpu, MemoryStick, Server } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, CartesianGrid } from "recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedDatastore } from "@/domain/models/types";

const dsColumns: ColumnDef<NormalizedDatastore, unknown>[] = [
  { accessorKey: "name", header: "Datastore" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    return <span className={v !== null && v < 10 ? "text-destructive font-semibold" : v !== null && v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "clusterName", header: "Cluster" },
];

interface ClusterMetric {
  name: string;
  cpuRatio: number;
  ramRatio: number;
  vCpuSum: number;
  threads: number;
  ramAllocGiB: number;
  ramTotalGiB: number;
}

const clusterColumns: ColumnDef<ClusterMetric, unknown>[] = [
  { accessorKey: "name", header: "Cluster" },
  { accessorKey: "cpuRatio", header: "CPU Overcommit", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 5 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>;
  }},
  { accessorKey: "ramRatio", header: "RAM Overcommit", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 1.5 ? "text-destructive font-semibold" : v > 1.0 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>;
  }},
  { accessorKey: "vCpuSum", header: "vCPUs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "threads", header: "Threads", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
];

export default function Capacity() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: datastores = [] } = useDatastores();
  const { data: hosts = [] } = useHosts();

  const avgFreePct = useMemo(() => {
    const withPct = datastores.filter((d) => d.freePct !== null);
    if (!withPct.length) return null;
    return withPct.reduce((s, d) => s + d.freePct!, 0) / withPct.length;
  }, [datastores]);

  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;
  const warnDs = datastores.filter((d) => d.freePct !== null && d.freePct >= 10 && d.freePct < 20).length;

  const clusterMetrics = useMemo<ClusterMetric[]>(() => {
    return clusters.map((c) => {
      const clusterVms = vms.filter((v) => v.cluster === c.name && v.powerState === "poweredOn");
      const vCpuSum = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const ramAllocMiB = clusterVms.reduce((s, v) => s + (v.memoryMiB || 0), 0);
      const cpuRatio = c.numCpuThreads ? vCpuSum / c.numCpuThreads : 0;
      const ramRatio = c.totalMemoryMiB ? ramAllocMiB / c.totalMemoryMiB : 0;
      return {
        name: c.name, cpuRatio: Math.round(cpuRatio * 100) / 100,
        ramRatio: Math.round(ramRatio * 100) / 100,
        vCpuSum, threads: c.numCpuThreads || 0,
        ramAllocGiB: ramAllocMiB / 1024, ramTotalGiB: (c.totalMemoryMiB || 0) / 1024,
      };
    }).sort((a, b) => b.cpuRatio - a.cpuRatio);
  }, [clusters, vms]);

  // Host density scatter data
  const hostDensity = useMemo(() => {
    return hosts.map((h) => {
      const hostVms = vms.filter((v) => v.host === h.host && v.powerState === "poweredOn");
      const vCpuSum = hostVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      return {
        name: h.host,
        vms: hostVms.length,
        vcpuPerCore: h.cpuCores ? Math.round((vCpuSum / h.cpuCores) * 100) / 100 : 0,
        ramGiB: (h.memoryTotalMiB || 0) / 1024,
      };
    }).filter((h) => h.vms > 0);
  }, [hosts, vms]);

  const dsChart = useMemo(() => {
    return datastores.filter((d) => d.freePct !== null)
      .map((d) => ({ name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name, freePct: Math.round(d.freePct! * 10) / 10 }))
      .sort((a, b) => a.freePct - b.freePct).slice(0, 15);
  }, [datastores]);

  const maxCpuOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.cpuRatio)) : 0;
  const maxRamOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.ramRatio)) : 0;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Capacity</h1><EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Capacity</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Datastores" value={formatNum(datastores.length)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} />
        <KpiCard title="Max CPU OC" value={`${maxCpuOC.toFixed(1)}:1`} severity={maxCpuOC > 5 ? "crit" : maxCpuOC > 3 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
        <KpiCard title="Max RAM OC" value={`${maxRamOC.toFixed(1)}:1`} severity={maxRamOC > 1.5 ? "crit" : maxRamOC > 1.0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dsChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {dsChart.map((entry, i) => <Cell key={i} fill={entry.freePct < 10 ? CHART_COLORS.danger : entry.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 12%, 18%)" />
              <XAxis dataKey="vms" name="VMs" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "VMs/Host", position: "insideBottom", offset: -5, style: { fill: "hsl(215, 12%, 55%)", fontSize: 11 } }} />
              <YAxis dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", style: { fill: "hsl(215, 12%, 55%)", fontSize: 11 } }} />
              <ZAxis dataKey="ramGiB" range={[40, 400]} name="RAM GiB" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={hostDensity} fill={CHART_COLORS.primary} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cluster Overcommit</h3>
        <VirtualTable data={clusterMetrics} columns={clusterColumns} globalFilter={filters.search} height={300} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Details</h3>
        <VirtualTable data={datastores} columns={dsColumns} globalFilter={filters.search} />
      </div>
    </div>
  );
}
