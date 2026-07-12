import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVmsWithTechInfo, useHosts, useDatastores, useHealthEvents, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { Server, Cpu, AlertTriangle, Monitor, Database as DbIcon } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "@/components/charts/recharts";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";
import { buildClusterOsDistributionRows, type ClusterOsDistributionRow, type VmOsSource } from "@/lib/vmOsDistribution";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OVERVIEW_KPI, OVERVIEW_VM_COLUMNS, OVERVIEW_OS_COLUMNS, OVERVIEW_SECTIONS } from "@/lib/glossary";

interface OverviewVmRow extends NormalizedVm {
  sysv: string | null;
}

const vmColumns: ColumnDef<OverviewVmRow, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: OVERVIEW_VM_COLUMNS.vmName } },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—", meta: { info: OVERVIEW_VM_COLUMNS.sysv } },
  { accessorKey: "powerState", header: "Power", meta: { info: OVERVIEW_VM_COLUMNS.powerState }, cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "poweredOn" ? "text-success" : v === "poweredOff" ? "text-muted-foreground" : "text-warning"}>{v || "—"}</span>;
  }},
  { accessorKey: "cluster", header: "Cluster", meta: { info: OVERVIEW_VM_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: OVERVIEW_VM_COLUMNS.host } },
  { accessorKey: "cpuCount", header: "vCPU", cell: ({ getValue }) => getValue() ?? "—", meta: { info: OVERVIEW_VM_COLUMNS.cpuCount } },
  { accessorKey: "memoryMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number | null), meta: { info: OVERVIEW_VM_COLUMNS.memoryMiB } },
  { accessorKey: "configStatus", header: "Config", meta: { info: OVERVIEW_VM_COLUMNS.configStatus }, cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : v === "red" ? "text-destructive" : ""}>{v || "—"}</span>;
  }},
  { accessorKey: "osConfig", header: "OS", meta: { info: OVERVIEW_VM_COLUMNS.osConfig } },
];

const osDistributionColumns: ColumnDef<ClusterOsDistributionRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: OVERVIEW_OS_COLUMNS.cluster } },
  { accessorKey: "operatingSystem", header: "Betriebssystem", cell: ({ getValue }) => getValue() || "—", meta: { info: OVERVIEW_OS_COLUMNS.operatingSystem } },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: OVERVIEW_OS_COLUMNS.vmCount } },
  {
    accessorKey: "clusterSharePct",
    header: "Anteil im Cluster",
    meta: { info: OVERVIEW_OS_COLUMNS.clusterSharePct },
    cell: ({ getValue }) => `${(getValue() as number).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`,
  },
];

export default function Overview() {
  const { snapshots, activeSnapshotIds, filters } = useActiveSnapshotIds();
  const { vmsWithTechInfo: filteredVms } = useVmsWithTechInfo();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: hosts = [] } = useHosts();
  const { data: datastores = [] } = useDatastores();
  const { data: healthEvents = [] } = useHealthEvents();
  const { data: rawCpuRows = [] } = useRawSheet("vCPU");
  const { data: rawMemoryRows = [] } = useRawSheet("vMemory");
  const { data: rawDiskRows = [] } = useRawSheet("vDisk");
  const { data: rawPartitionRows = [] } = useRawSheet("vPartition");
  const { data: rawNetworkRows = [] } = useRawSheet("vNetwork");
  const { data: rawSnapshotRows = [] } = useRawSheet("vSnapshot");
  const { data: rawToolsRows = [] } = useRawSheet("vTools");

  const [selectedVm, setSelectedVm] = useState<OverviewVmRow | null>(null);
  const [osSource, setOsSource] = useState<VmOsSource>("tools");
  const filteredRawCpuRows = useMemo(() => filterVmRows(rawCpuRows), [filterVmRows, rawCpuRows]);
  const filteredRawMemoryRows = useMemo(() => filterVmRows(rawMemoryRows), [filterVmRows, rawMemoryRows]);
  const filteredRawDiskRows = useMemo(() => filterVmRows(rawDiskRows), [filterVmRows, rawDiskRows]);
  const filteredRawPartitionRows = useMemo(() => filterVmRows(rawPartitionRows), [filterVmRows, rawPartitionRows]);
  const filteredRawNetworkRows = useMemo(() => filterVmRows(rawNetworkRows), [filterVmRows, rawNetworkRows]);
  const filteredRawSnapshotRows = useMemo(() => filterVmRows(rawSnapshotRows), [filterVmRows, rawSnapshotRows]);
  const filteredRawToolsRows = useMemo(() => filterVmRows(rawToolsRows), [filterVmRows, rawToolsRows]);

  const poweredOn = filteredVms.filter((v) => v.powerState === "poweredOn").length;
  const poweredOff = filteredVms.filter((v) => v.powerState === "poweredOff").length;
  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;

  const powerData = useMemo(() => [
    { name: "Powered On", value: poweredOn },
    { name: "Powered Off", value: poweredOff },
    { name: "Suspended", value: filteredVms.filter((v) => v.powerState === "suspended").length },
  ].filter((d) => d.value > 0), [filteredVms, poweredOn, poweredOff]);

  const clusterData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hosts) { if (h.cluster) map.set(h.cluster, (map.get(h.cluster) || 0) + 1); }
    return [...map.entries()]
      .map(([name, count]) => ({ name, hosts: count }))
      .sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name, "de-DE", { numeric: true, sensitivity: "base" }));
  }, [hosts]);

  const vmsForTable = useMemo<OverviewVmRow[]>(
    () =>
      [...filteredVms].sort((a, b) =>
        a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }),
      ).map((vm) => ({
        ...vm,
        sysv: vm.techInfo?.sysv ?? null,
      })),
    [filteredVms],
  );

  const osDistributionRows = useMemo(
    () => buildClusterOsDistributionRows(filteredVms, osSource),
    [filteredVms, osSource],
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
        <span className="text-xs text-muted-foreground" title="Ohne vCenter-Filter werden alle importierten Stände analysiert. Je vCenter existiert ein aktueller Stand.">
          Analysiert: {activeSnapshotIds.length} von {snapshots.length} Snapshot{snapshots.length !== 1 && "s"}
        </span>
      </div>
      <FilterBar />
      <GlobalFilterScopeHint text="VM-bezogene Bereiche und Health-Events mit eindeutigem VM-Entity folgen dem globalen Filter; Hosts und Datastores bleiben unverändert." />
      <KpiGrid>
        <KpiCard title="VMs Total" value={formatNum(filteredVms.length)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.vmsTotal} />
        <KpiCard title="Powered On" value={formatNum(poweredOn)} severity="ok" icon={<Cpu className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOn} />
        <KpiCard title="Powered Off" value={formatNum(poweredOff)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOff} />
        <KpiCard title="Hosts" value={formatNum(hosts.length)} icon={<Server className="h-4 w-4" />} info={OVERVIEW_KPI.hosts} />
        <KpiCard title="Datastores" value={formatNum(datastores.length)} severity={critDs > 0 ? "crit" : undefined} subtitle={critDs > 0 ? `${critDs} kritisch` : undefined} icon={<DbIcon className="h-4 w-4" />} info={OVERVIEW_KPI.datastores} />
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={OVERVIEW_KPI.healthEvents} />
      </KpiGrid>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={OVERVIEW_SECTIONS.powerState} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Power State</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={powerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={0}>
                {powerData.map((entry, index) => <Cell key={entry.name} fill={SEVERITY_COLORS[index]} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={OVERVIEW_SECTIONS.hostsPerCluster} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Hosts je Cluster</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={Math.max(240, clusterData.length * 32)}>
            <BarChart data={clusterData} layout="vertical" margin={{ left: 12 }}>
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={145} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="hosts" fill={SEVERITY_COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <InfoTooltip entry={OVERVIEW_SECTIONS.osPerCluster} side="bottom">
              <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Betriebssysteme je Cluster ({osDistributionRows.length})</h3>
            </InfoTooltip>
            <p className="mt-1 text-xs text-muted-foreground">
              Gruppierte VM-Anzahl nach Cluster und Betriebssystem
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={osSource}
            onValueChange={(value) => {
              if (value === "tools" || value === "config") setOsSource(value);
            }}
            size="sm"
            variant="outline"
            className="justify-start"
          >
            <ToggleGroupItem value="tools" aria-label="OS according to the VMware Tools">
              VMware Tools
            </ToggleGroupItem>
            <ToggleGroupItem value="config" aria-label="OS according to the configuration file">
              Configuration file
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <VirtualTable
          data={osDistributionRows}
          columns={osDistributionColumns}
          globalFilter={filters.search}
          height={360}
          initialSorting={[{ id: "cluster", desc: false }]}
          exportFileName={`rvtools-os-je-cluster-${osSource}`}
        />
      </div>
      <div>
        <InfoTooltip entry={OVERVIEW_SECTIONS.vmTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Virtuelle Maschinen ({filteredVms.length})</h3>
        </InfoTooltip>
        <VirtualTable
          data={vmsForTable}
          columns={vmColumns}
          globalFilter={filters.search}
          height={400}
          onRowClick={setSelectedVm}
        />
      </div>
      <VmDetailDialog
        vm={selectedVm}
        open={!!selectedVm}
        onClose={() => setSelectedVm(null)}
        rawCpuRows={filteredRawCpuRows}
        rawMemoryRows={filteredRawMemoryRows}
        rawDiskRows={filteredRawDiskRows}
        rawPartitionRows={filteredRawPartitionRows}
        rawNetworkRows={filteredRawNetworkRows}
        rawSnapshotRows={filteredRawSnapshotRows}
        rawToolsRows={filteredRawToolsRows}
      />
    </div>
  );
}
