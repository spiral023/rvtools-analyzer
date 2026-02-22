import { useMemo } from "react";
import { useActiveSnapshotIds, useDatastores, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Database, HardDrive, AlertTriangle, Shield } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";

interface PartitionRow { vm: string; disk: string; capacityMiB: number; consumedMiB: number; freeMiB: number; freePct: number }
interface MultipathRow { host: string; datastore: string; disk: string; policy: string; state: string; paths: number; activePaths: number }
interface DiskRow { vm: string; disk: string; capacityMiB: number; thin: boolean; mode: string; raw: boolean }

const partColumns: ColumnDef<PartitionRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "disk", header: "Partition" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
];

const mpColumns: ColumnDef<MultipathRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "datastore", header: "Datastore" },
  { accessorKey: "policy", header: "Policy" },
  { accessorKey: "state", header: "Status", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "ok" ? "text-success" : "text-destructive font-semibold"}>{v}</span>;
  }},
  { accessorKey: "paths", header: "Pfade" },
  { accessorKey: "activePaths", header: "Aktiv" },
];

const diskColumns: ColumnDef<DiskRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "disk", header: "Disk" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "thin", header: "Thin", cell: ({ getValue }) => getValue() ? "Ja" : "Nein" },
  { accessorKey: "mode", header: "Mode" },
  { accessorKey: "raw", header: "RDM", cell: ({ getValue }) => getValue() ? "Ja" : "—" },
];

export default function StorageBackup() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { data: datastores = [] } = useDatastores();
  const { data: rawPartitions = [] } = useRawSheet("vPartition");
  const { data: rawMultiPath = [] } = useRawSheet("vMultiPath");
  const { data: rawDisks = [] } = useRawSheet("vDisk");

  const partitions = useMemo<PartitionRow[]>(() =>
    rawPartitions.map((r) => {
      const cap = Number(r.data["Capacity MiB"] || 0);
      const free = Number(r.data["Free MiB"] || 0);
      return {
        vm: String(r.data["VM"] || ""),
        disk: String(r.data["Disk"] || ""),
        capacityMiB: cap,
        consumedMiB: Number(r.data["Consumed MiB"] || 0),
        freeMiB: free,
        freePct: cap > 0 ? (free / cap) * 100 : 100,
      };
    }).sort((a, b) => a.freePct - b.freePct),
  [rawPartitions]);

  const critParts = partitions.filter((p) => p.freePct < 10).length;
  const warnParts = partitions.filter((p) => p.freePct >= 10 && p.freePct < 20).length;

  const multipaths = useMemo<MultipathRow[]>(() =>
    rawMultiPath.map((r) => {
      let active = 0; let total = 0;
      for (let i = 1; i <= 8; i++) {
        const path = r.data[`Path ${i}`];
        const state = String(r.data[`Path ${i} state`] || "");
        if (path) { total++; if (state === "active") active++; }
      }
      return {
        host: String(r.data["Host"] || ""),
        datastore: String(r.data["Datastore"] || ""),
        disk: String(r.data["Disk"] || ""),
        policy: String(r.data["Policy"] || ""),
        state: String(r.data["Oper. State"] || ""),
        paths: total, activePaths: active,
      };
    }),
  [rawMultiPath]);

  const mpIssues = multipaths.filter((m) => m.state !== "ok").length;

  const disks = useMemo<DiskRow[]>(() =>
    rawDisks.map((r) => ({
      vm: String(r.data["VM"] || ""),
      disk: String(r.data["Disk"] || ""),
      capacityMiB: Number(r.data["Capacity MiB"] || 0),
      thin: String(r.data["Thin"] || "").toLowerCase() === "true",
      mode: String(r.data["Disk Mode"] || ""),
      raw: String(r.data["Raw"] || "").toLowerCase() === "true",
    })),
  [rawDisks]);

  const thinDisks = disks.filter((d) => d.thin).length;
  const rdmDisks = disks.filter((d) => d.raw).length;

  const partChart = useMemo(() =>
    partitions.filter((p) => p.freePct < 30).slice(0, 15)
      .map((p) => ({ name: `${p.vm}:${p.disk}`.slice(0, 25), freePct: Math.round(p.freePct * 10) / 10 })),
  [partitions]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Storage / Backup</h1><EmptyState icon={<Database className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Storage / Backup</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Partitionen" value={formatNum(partitions.length)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critParts)} severity={critParts > 0 ? "crit" : "ok"} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnParts)} severity={warnParts > 0 ? "warn" : "ok"} />
        <KpiCard title="Multipath Issues" value={formatNum(mpIssues)} severity={mpIssues > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Thin Disks" value={formatNum(thinDisks)} icon={<Database className="h-4 w-4" />} />
        <KpiCard title="RDM Disks" value={formatNum(rdmDisks)} icon={<Shield className="h-4 w-4" />} />
      </div>

      {partChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Gast-Partitionen mit wenig Platz</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={partChart} layout="vertical">
              <XAxis type="number" domain={[0, 30]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {partChart.map((e, i) => <Cell key={i} fill={e.freePct < 10 ? CHART_COLORS.danger : e.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Gast-Partitionen</h3>
        <VirtualTable data={partitions} columns={partColumns} globalFilter={filters.search} />
      </div>

      {multipaths.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Multipath Status ({multipaths.length})</h3>
          <VirtualTable data={multipaths} columns={mpColumns} globalFilter={filters.search} height={350} />
        </div>
      )}

      {disks.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Virtuelle Disks ({disks.length})</h3>
          <VirtualTable data={disks} columns={diskColumns} globalFilter={filters.search} height={350} />
        </div>
      )}
    </div>
  );
}
