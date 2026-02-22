import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Activity, AlertTriangle, Camera, Wrench } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

const issueColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "configStatus", header: "Config Status", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v || "—"}</span>;
  }},
  { accessorKey: "connectionState", header: "Connection" },
  { accessorKey: "powerState", header: "Power" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
];

export default function DailyOps() {
  const { filters } = useFilterState();

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: () => db.snapshots.toArray(),
  });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filtered = filters.vcenterIds.length
      ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId))
      : snapshots;
    for (const s of filtered) {
      const existing = latestMap.get(s.vcenterId);
      if (!existing || s.exportTs > existing.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters]);

  const { data: vms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_vm.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const { data: healthEvents = [] } = useQuery({
    queryKey: ["health", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_health.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const { data: vmSnapshots = [] } = useQuery({
    queryKey: ["vmSnapshots", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_snapshot.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const configIssues = useMemo(() => vms.filter((v) => v.configStatus && v.configStatus !== "green"), [vms]);
  const consolidationNeeded = useMemo(() => vms.filter((v) => v.consolidationNeeded === true), [vms]);
  const disconnected = useMemo(() => vms.filter((v) => v.connectionState && v.connectionState !== "connected"), [vms]);

  // Health by type chart
  const healthByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of healthEvents) {
      const t = h.messageType || "Unknown";
      map.set(t, (map.get(t) || 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [healthEvents]);

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Daily Ops</h1>
        <EmptyState icon={<Activity className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Daily Ops</h1>
      <FilterBar />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Config Issues" value={formatNum(configIssues.length)} severity={configIssues.length > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="Consolidation" value={formatNum(consolidationNeeded.length)} severity={consolidationNeeded.length > 0 ? "warn" : "ok"} />
        <KpiCard title="VM Snapshots" value={formatNum(vmSnapshots.length)} severity={vmSnapshots.length > 20 ? "warn" : "ok"} icon={<Camera className="h-4 w-4" />} />
      </div>

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Health Events nach Typ</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={healthByType} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} />
            <Bar dataKey="count" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMs mit Konfigurationsproblemen</h3>
        <VirtualTable data={configIssues} columns={issueColumns} globalFilter={filters.search} />
      </div>
    </div>
  );
}
