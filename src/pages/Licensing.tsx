import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Key, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";

interface LicenseRow { name: string; key: string; costUnit: string; total: number; used: number; usedPct: number; expiration: string; features: string }

const licColumns: ColumnDef<LicenseRow, unknown>[] = [
  { accessorKey: "name", header: "Lizenz" },
  { accessorKey: "key", header: "Key" },
  { accessorKey: "costUnit", header: "Einheit" },
  { accessorKey: "total", header: "Total", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "used", header: "Verwendet", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "usedPct", header: "Auslastung", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 95 ? "text-destructive font-semibold" : v > 85 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "expiration", header: "Ablauf" },
  { accessorKey: "features", header: "Features", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className="text-xs text-muted-foreground">{v.length > 80 ? v.slice(0, 77) + "…" : v}</span>;
  }},
];

export default function Licensing() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { data: rawLicense = [] } = useRawSheet("vLicense");

  const licenses = useMemo<LicenseRow[]>(() =>
    rawLicense.map((r) => {
      const total = Number(r.data["Total"] || 0);
      const used = Number(r.data["Used"] || 0);
      return {
        name: String(r.data["Name"] || ""),
        key: String(r.data["Key"] || ""),
        costUnit: String(r.data["Cost Unit"] || ""),
        total,
        used,
        usedPct: total > 0 ? (used / total) * 100 : 0,
        expiration: String(r.data["Expiration Date"] || ""),
        features: String(r.data["Features"] || ""),
      };
    }),
  [rawLicense]);

  const totalLicenses = licenses.length;
  const highUtil = licenses.filter((l) => l.usedPct > 85).length;
  const critUtil = licenses.filter((l) => l.usedPct > 95).length;
  const expiring = licenses.filter((l) => l.expiration !== "Never" && l.expiration !== "").length;

  const utilizationChart = useMemo(() =>
    licenses.map((l) => ({
      name: l.name.length > 25 ? l.name.slice(0, 22) + "…" : l.name,
      usedPct: Math.round(l.usedPct * 10) / 10,
    })),
  [licenses]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Licensing</h1><EmptyState icon={<Key className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  if (licenses.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Licensing</h1>
        <FilterBar />
        <EmptyState icon={<Key className="h-6 w-6" />} title="Keine Lizenzdaten" description="Das vLicense-Sheet enthält keine Daten in diesem Export." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Licensing</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="Lizenzen" value={formatNum(totalLicenses)} icon={<Key className="h-4 w-4" />} />
        <KpiCard title="Hoch (>85%)" value={formatNum(highUtil)} severity={highUtil > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Kritisch (>95%)" value={formatNum(critUtil)} severity={critUtil > 0 ? "crit" : "ok"} />
        <KpiCard title="Mit Ablaufdatum" value={formatNum(expiring)} severity={expiring > 0 ? "warn" : "ok"} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {utilizationChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Lizenzauslastung</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={utilizationChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="usedPct" radius={[0, 4, 4, 0]}>
                {utilizationChart.map((e, i) => <Cell key={i} fill={e.usedPct > 95 ? CHART_COLORS.danger : e.usedPct > 85 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Lizenz Details</h3>
        <VirtualTable data={licenses} columns={licColumns} globalFilter={filters.search} />
      </div>
    </div>
  );
}
