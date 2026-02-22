import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { HardDrive } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
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

export default function Capacity() {
  const { filters } = useFilterState();

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: () => db.snapshots.toArray(),
  });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filtered = filters.vcenterIds.length ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId)) : snapshots;
    for (const s of filtered) {
      const existing = latestMap.get(s.vcenterId);
      if (!existing || s.exportTs > existing.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters]);

  const { data: datastores = [] } = useQuery({
    queryKey: ["datastores", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_datastore.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_cluster.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const { data: vms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => activeSnapshotIds.length ? db.entities_vm.where("snapshotId").anyOf(activeSnapshotIds).toArray() : Promise.resolve([]),
    enabled: activeSnapshotIds.length > 0,
  });

  const avgFreePct = useMemo(() => {
    const withPct = datastores.filter((d) => d.freePct !== null);
    if (!withPct.length) return null;
    return withPct.reduce((s, d) => s + d.freePct!, 0) / withPct.length;
  }, [datastores]);

  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;
  const warnDs = datastores.filter((d) => d.freePct !== null && d.freePct >= 10 && d.freePct < 20).length;

  // CPU overcommit per cluster
  const clusterOvercommit = useMemo(() => {
    return clusters.map((c) => {
      const clusterVms = vms.filter((v) => v.cluster === c.name && v.powerState === "poweredOn");
      const vCpuSum = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const ratio = c.numCpuThreads ? vCpuSum / c.numCpuThreads : 0;
      return { name: c.name, ratio: Math.round(ratio * 100) / 100, vCpuSum, threads: c.numCpuThreads || 0 };
    }).sort((a, b) => b.ratio - a.ratio);
  }, [clusters, vms]);

  // DS headroom chart
  const dsChart = useMemo(() => {
    return datastores
      .filter((d) => d.freePct !== null)
      .map((d) => ({ name: d.name, freePct: Math.round(d.freePct! * 10) / 10 }))
      .sort((a, b) => a.freePct - b.freePct)
      .slice(0, 15);
  }, [datastores]);

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Capacity</h1>
        <EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Capacity</h1>
      <FilterBar />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="Datastores" value={formatNum(datastores.length)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dsChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {dsChart.map((entry, i) => (
                  <Cell key={i} fill={entry.freePct < 10 ? "hsl(0, 72%, 51%)" : entry.freePct < 20 ? "hsl(38, 92%, 50%)" : "hsl(152, 69%, 40%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">CPU Overcommit je Cluster</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={clusterOvercommit}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} formatter={(v: number) => [`${v}:1`, "vCPU/Thread"]} />
              <Bar dataKey="ratio" fill="hsl(190, 85%, 48%)" radius={[4, 4, 0, 0]}>
                {clusterOvercommit.map((entry, i) => (
                  <Cell key={i} fill={entry.ratio > 5 ? "hsl(0, 72%, 51%)" : entry.ratio > 3 ? "hsl(38, 92%, 50%)" : "hsl(190, 85%, 48%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Details</h3>
        <VirtualTable data={datastores} columns={dsColumns} globalFilter={filters.search} />
      </div>
    </div>
  );
}
