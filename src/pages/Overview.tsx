import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useHosts, useDatastores, useHealthEvents } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Server, Cpu, HardDrive, AlertTriangle, Monitor, Database as DbIcon } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";

const vmColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "powerState", header: "Power", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "poweredOn" ? "text-success" : v === "poweredOff" ? "text-muted-foreground" : "text-warning"}>{v || "—"}</span>;
  }},
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cpuCount", header: "vCPU", cell: ({ getValue }) => getValue() ?? "—" },
  { accessorKey: "memoryMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "configStatus", header: "Config", cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : v === "red" ? "text-destructive" : ""}>{v || "—"}</span>;
  }},
  { accessorKey: "osConfig", header: "OS" },
];

export default function Overview() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms: filteredVms } = useVms();
  const { data: hosts = [] } = useHosts();
  const { data: datastores = [] } = useDatastores();
  const { data: healthEvents = [] } = useHealthEvents();

  const poweredOn = filteredVms.filter((v) => v.powerState === "poweredOn").length;
  const poweredOff = filteredVms.filter((v) => v.powerState === "poweredOff").length;
  const configIssues = filteredVms.filter((v) => v.configStatus && v.configStatus !== "green").length;
  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;

  const powerData = useMemo(() => [
    { name: "Powered On", value: poweredOn },
    { name: "Powered Off", value: poweredOff },
    { name: "Suspended", value: filteredVms.filter((v) => v.powerState === "suspended").length },
  ].filter((d) => d.value > 0), [filteredVms, poweredOn, poweredOff]);

  const clusterData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hosts) { if (h.cluster) map.set(h.cluster, (map.get(h.cluster) || 0) + 1); }
    return [...map.entries()].map(([name, count]) => ({ name, hosts: count })).slice(0, 10);
  }, [hosts]);

  const vmsForTable = useMemo(
    () =>
      [...filteredVms].sort((a, b) =>
        a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }),
      ),
    [filteredVms],
  );

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Overview</h1>
        <EmptyState icon={<Monitor className="h-6 w-6" />} title="Keine Daten vorhanden" description="Laden Sie einen RVTools XLSX-Export hoch, um Ihre VMware-Infrastruktur zu analysieren." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <span className="text-xs text-muted-foreground">{snapshots.length} Snapshot{snapshots.length !== 1 && "s"} geladen</span>
      </div>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="VMs Total" value={formatNum(filteredVms.length)} icon={<Monitor className="h-4 w-4" />} />
        <KpiCard title="Powered On" value={formatNum(poweredOn)} severity="ok" icon={<Cpu className="h-4 w-4" />} />
        <KpiCard title="Powered Off" value={formatNum(poweredOff)} icon={<Monitor className="h-4 w-4" />} />
        <KpiCard title="Hosts" value={formatNum(hosts.length)} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Datastores" value={formatNum(datastores.length)} severity={critDs > 0 ? "crit" : undefined} subtitle={critDs > 0 ? `${critDs} kritisch` : undefined} icon={<DbIcon className="h-4 w-4" />} />
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Power State</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={powerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={0}>
                {powerData.map((_, i) => <Cell key={i} fill={SEVERITY_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Hosts je Cluster</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={clusterData}>
              <XAxis dataKey="name" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="hosts" fill={SEVERITY_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Virtuelle Maschinen ({filteredVms.length})</h3>
        <VirtualTable data={vmsForTable} columns={vmColumns} globalFilter={filters.search} height={400} />
      </div>
    </div>
  );
}
