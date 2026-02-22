import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Server, Cpu, HardDrive, AlertTriangle, Monitor, Database as DbIcon } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, NormalizedDatastore, NormalizedHealth } from "@/domain/models/types";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";

const CHART_COLORS = ["hsl(190, 85%, 48%)", "hsl(215, 12%, 45%)", "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)"];

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
  const { filters } = useFilterState();
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filtered = filters.vcenterIds.length ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId)) : snapshots;
    for (const s of filtered) {
      const existing = latestMap.get(s.vcenterId);
      if (!existing || s.exportTs > existing.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters.snapshotIds, filters.vcenterIds]);

  const { data: vms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
  const { data: hosts = [] } = useQuery({
    queryKey: ["hosts", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHost>("entities_host", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
  const { data: datastores = [] } = useQuery({
    queryKey: ["datastores", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
  const { data: healthEvents = [] } = useQuery({
    queryKey: ["health", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHealth>("entities_health", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });

  const filteredVms = useMemo(() => {
    let result = vms;
    if (filters.clusters.length) result = result.filter((v) => v.cluster && filters.clusters.includes(v.cluster));
    if (filters.hosts.length) result = result.filter((v) => v.host && filters.hosts.includes(v.host));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) => v.vmName.toLowerCase().includes(q) || v.host?.toLowerCase().includes(q) || v.cluster?.toLowerCase().includes(q));
    }
    return result;
  }, [vms, filters]);

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
        <KpiCard title="Config Issues" value={formatNum(configIssues)} severity={configIssues > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Power State</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={powerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={0}>
                {powerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Hosts je Cluster</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={clusterData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215, 12%, 55%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 15%, 11%)", border: "1px solid hsl(222, 12%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 93%)" }} />
              <Bar dataKey="hosts" fill="hsl(190, 85%, 48%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Virtuelle Maschinen</h3>
        <VirtualTable data={filteredVms} columns={vmColumns} globalFilter={filters.search} height={400} />
      </div>
    </div>
  );
}
