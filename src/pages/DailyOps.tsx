import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useHealthEvents, useVmSnapshots, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Activity, AlertTriangle, Camera, Wrench, Unplug, Disc, Monitor } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedSnapshot } from "@/domain/models/types";

const issueColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "configStatus", header: "Config Status", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v || "—"}</span>;
  }},
  { accessorKey: "connectionState", header: "Verbindung" },
  { accessorKey: "powerState", header: "Power" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
  { accessorKey: "osConfig", header: "OS" },
];

const snapshotColumns: ColumnDef<NormalizedSnapshot, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "snapshotName", header: "Snapshot" },
  { accessorKey: "description", header: "Beschreibung" },
  { accessorKey: "dateTaken", header: "Erstellt" },
  { accessorKey: "sizeMiB", header: "Größe (MiB)", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    return <span className={v > 51200 ? "text-destructive font-semibold" : v > 20480 ? "text-warning" : ""}>{v.toLocaleString("de-DE")}</span>;
  }},
  { accessorKey: "quiesced", header: "Quiesced", cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
];

export default function DailyOps() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: healthEvents = [] } = useHealthEvents();
  const { data: vmSnapshots = [] } = useVmSnapshots();
  const { data: rawVTools = [] } = useRawSheet("vTools");
  const { data: rawVCD = [] } = useRawSheet("vCD");
  const { data: rawVUSB = [] } = useRawSheet("vUSB");

  const configIssues = useMemo(() => vms.filter((v) => v.configStatus && v.configStatus !== "green"), [vms]);
  const consolidationNeeded = useMemo(() => vms.filter((v) => v.consolidationNeeded === true), [vms]);
  const disconnectedVms = useMemo(() => vms.filter((v) => v.connectionState && v.connectionState !== "connected"), [vms]);

  // Tools hygiene
  const toolsIssues = useMemo(() => {
    return rawVTools.filter((r) => {
      const tools = String(r.data["Tools"] || "");
      return tools !== "" && tools !== "toolsOk";
    }).length;
  }, [rawVTools]);

  // CD/USB connected
  const connectedCD = useMemo(() => rawVCD.filter((r) => String(r.data["Connected"]).toLowerCase() === "true").length, [rawVCD]);
  const connectedUSB = useMemo(() => rawVUSB.filter((r) => String(r.data["Connected"]).toLowerCase() === "true").length, [rawVUSB]);

  // Health by type
  const healthByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of healthEvents) { const t = h.messageType || "Unknown"; map.set(t, (map.get(t) || 0) + 1); }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [healthEvents]);

  // Power state distribution
  const powerData = useMemo(() => {
    const on = vms.filter((v) => v.powerState === "poweredOn").length;
    const off = vms.filter((v) => v.powerState === "poweredOff").length;
    const sus = vms.filter((v) => v.powerState === "suspended").length;
    return [
      { name: "Powered On", value: on },
      { name: "Powered Off", value: off },
      { name: "Suspended", value: sus },
    ].filter((d) => d.value > 0);
  }, [vms]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Daily Ops</h1><EmptyState icon={<Activity className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Daily Ops</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Config Issues" value={formatNum(configIssues.length)} severity={configIssues.length > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="Consolidation" value={formatNum(consolidationNeeded.length)} severity={consolidationNeeded.length > 0 ? "warn" : "ok"} />
        <KpiCard title="Disconnected" value={formatNum(disconnectedVms.length)} severity={disconnectedVms.length > 0 ? "crit" : "ok"} icon={<Unplug className="h-4 w-4" />} />
        <KpiCard title="VM Snapshots" value={formatNum(vmSnapshots.length)} severity={vmSnapshots.length > 20 ? "warn" : "ok"} icon={<Camera className="h-4 w-4" />} />
        <KpiCard title="Tools Issues" value={formatNum(toolsIssues)} severity={toolsIssues > 0 ? "warn" : "ok"} />
        <KpiCard title="CD/USB verb." value={formatNum(connectedCD + connectedUSB)} severity={connectedCD + connectedUSB > 0 ? "warn" : "ok"} icon={<Disc className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Health Events nach Typ</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={healthByType} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Power State</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={powerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={0}>
                {powerData.map((_, i) => <Cell key={i} fill={SEVERITY_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMs mit Konfigurationsproblemen ({configIssues.length})</h3>
        <VirtualTable data={configIssues} columns={issueColumns} globalFilter={filters.search} />
      </div>

      {vmSnapshots.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Snapshots ({vmSnapshots.length})</h3>
          <VirtualTable data={vmSnapshots} columns={snapshotColumns} globalFilter={filters.search} />
        </div>
      )}
    </div>
  );
}
