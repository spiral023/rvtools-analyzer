import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Gauge } from "lucide-react";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

const perfColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cpuReady", header: "CPU Ready %", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    return <span className={v > 10 ? "text-destructive font-semibold" : v > 5 ? "text-warning" : ""}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "cpuCount", header: "vCPU" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
];

export default function PerformancePage() {
  const { filters } = useFilterState();
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filtered = filters.vcenterIds.length ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId)) : snapshots;
    for (const s of filtered) { const e = latestMap.get(s.vcenterId); if (!e || s.exportTs > e.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs }); }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters]);

  const { data: vms = [] } = useQuery({ queryKey: ["vms", activeSnapshotIds], queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds), enabled: activeSnapshotIds.length > 0 });

  const cpuReadyVms = useMemo(() => vms.filter((v) => v.cpuReady !== null && v.cpuReady > 0).sort((a, b) => (b.cpuReady || 0) - (a.cpuReady || 0)), [vms]);
  const hotspots = cpuReadyVms.filter((v) => (v.cpuReady || 0) > 5).length;
  const topChart = useMemo(() => cpuReadyVms.slice(0, 15).map((v) => ({ name: v.vmName, cpuReady: v.cpuReady })), [cpuReadyVms]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Performance</h1><EmptyState icon={<Gauge className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Performance</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard title="CPU Ready Hotspots" value={formatNum(hotspots)} severity={hotspots > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} />
        <KpiCard title="VMs mit CPU Ready" value={formatNum(cpuReadyVms.length)} />
      </div>
      {topChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Top CPU Ready VMs</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topChart} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} />
              <Bar dataKey="cpuReady" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">CPU Ready Details</h3>
        <VirtualTable data={cpuReadyVms} columns={perfColumns} globalFilter={filters.search} />
      </div>
    </div>
  );
}
