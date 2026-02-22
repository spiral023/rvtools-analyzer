import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useRawSheet, useHosts } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Gauge, MemoryStick, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

interface MemoryIssueVm { vmName: string; cluster: string | null; host: string | null; sizeMiB: number; swapped: number; ballooned: number; active: number }

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
  { accessorKey: "powerState", header: "Power" },
];

const memColumns: ColumnDef<MemoryIssueVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "sizeMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "swapped", header: "Swapped MiB", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 0 ? "text-destructive font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>;
  }},
  { accessorKey: "ballooned", header: "Ballooned MiB", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 0 ? "text-warning font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>;
  }},
  { accessorKey: "active", header: "Active MiB", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
];

export default function PerformancePage() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: rawVMemory = [] } = useRawSheet("vMemory");
  const { data: rawMultiPath = [] } = useRawSheet("vMultiPath");

  const cpuReadyVms = useMemo(() =>
    vms.filter((v) => v.cpuReady !== null && v.cpuReady > 0)
      .sort((a, b) => (b.cpuReady || 0) - (a.cpuReady || 0)),
  [vms]);

  const hotspots = cpuReadyVms.filter((v) => (v.cpuReady || 0) > 5).length;
  const topChart = useMemo(() =>
    cpuReadyVms.slice(0, 15).map((v) => ({ name: v.vmName.length > 18 ? v.vmName.slice(0, 16) + "…" : v.vmName, cpuReady: v.cpuReady })),
  [cpuReadyVms]);

  // Memory pressure from raw vMemory
  const memoryIssues = useMemo<MemoryIssueVm[]>(() => {
    return rawVMemory
      .filter((r) => {
        const swapped = Number(r.data["Swapped"] || 0);
        const ballooned = Number(r.data["Ballooned"] || 0);
        return swapped > 0 || ballooned > 0;
      })
      .map((r) => ({
        vmName: String(r.data["VM"] || "unknown"),
        cluster: r.data["Cluster"] as string | null,
        host: r.data["Host"] as string | null,
        sizeMiB: Number(r.data["Size MiB"] || 0),
        swapped: Number(r.data["Swapped"] || 0),
        ballooned: Number(r.data["Ballooned"] || 0),
        active: Number(r.data["Active"] || 0),
      }))
      .sort((a, b) => (b.swapped + b.ballooned) - (a.swapped + a.ballooned));
  }, [rawVMemory]);

  // Multipath issues
  const multipathIssues = useMemo(() => {
    return rawMultiPath.filter((r) => {
      const state = String(r.data["Oper. State"] || "").toLowerCase();
      return state !== "" && state !== "ok";
    }).length;
  }, [rawMultiPath]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Performance</h1><EmptyState icon={<Gauge className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Performance</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="CPU Ready Hotspots" value={formatNum(hotspots)} severity={hotspots > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} subtitle="> 5% Ready" />
        <KpiCard title="VMs mit CPU Ready" value={formatNum(cpuReadyVms.length)} />
        <KpiCard title="Memory Pressure" value={formatNum(memoryIssues.length)} severity={memoryIssues.length > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} subtitle="Swapped/Ballooned" />
        <KpiCard title="Multipath Issues" value={formatNum(multipathIssues)} severity={multipathIssues > 0 ? "crit" : "ok"} icon={<Activity className="h-4 w-4" />} />
      </div>

      {topChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Top CPU Ready VMs</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topChart} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="cpuReady" radius={[0, 4, 4, 0]}>
                {topChart.map((entry, i) => <Cell key={i} fill={(entry.cpuReady || 0) > 10 ? CHART_COLORS.danger : (entry.cpuReady || 0) > 5 ? CHART_COLORS.warning : CHART_COLORS.primary} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">CPU Ready Details</h3>
        <VirtualTable data={cpuReadyVms} columns={perfColumns} globalFilter={filters.search} />
      </div>

      {memoryIssues.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Memory Pressure — Swapped / Ballooned ({memoryIssues.length})</h3>
          <VirtualTable data={memoryIssues} columns={memColumns} globalFilter={filters.search} />
        </div>
      )}
    </div>
  );
}
