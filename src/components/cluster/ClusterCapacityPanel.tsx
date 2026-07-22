import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHART_AXIS_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { CAPACITY_CLUSTER_COLUMNS, CAPACITY_HEALTH_COLUMNS, CAPACITY_SECTIONS } from "@/lib/glossaries/capacity";
import { CLUSTER_DENSITY_COLUMNS, LICENSING_SECTIONS } from "@/lib/glossaries/licensing";
import type { ClusterCapacityRow, ClusterDensityRow, ClusterOvercommitRow, HostDensityPoint } from "@/lib/clusterCapacityWorkspace";
import { getHotHostSeverity } from "@/lib/hotHostSeverity";
import { formatNum } from "@/lib/xlsx/parseHelpers";

interface ClusterCapacityPanelProps {
  capacityRows: ClusterCapacityRow[];
  overcommitRows: ClusterOvercommitRow[];
  hostDensity: HostDensityPoint[];
  clusterDensity: ClusterDensityRow[];
  search: string;
  onOpenCluster: (clusterKey: string) => void;
}

const vcenterColumns = [
  { accessorKey: "vcenterDisplayName", header: "vCenter" },
  { accessorKey: "datacenter", header: "Datacenter" },
] as const;

const capacityColumns: ColumnDef<ClusterCapacityRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_HEALTH_COLUMNS.cluster } },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_HEALTH_COLUMNS.risk }, cell: ({ row }) => <span className={row.original.risk === "hoch" ? "text-destructive font-semibold" : row.original.risk === "mittel" ? "text-warning font-semibold" : "text-success"}>{row.original.risk} ({row.original.riskScore})</span> },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hosts } },
  { accessorKey: "totalCores", header: "Cores", meta: { info: CAPACITY_HEALTH_COLUMNS.totalCores } },
  { accessorKey: "totalVms", header: "VMs", meta: { info: CAPACITY_HEALTH_COLUMNS.totalVms } },
  { accessorKey: "cpuUsagePct", header: "CPU %", meta: { info: CAPACITY_HEALTH_COLUMNS.cpuUsagePct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
  { accessorKey: "memoryUsagePct", header: "RAM %", meta: { info: CAPACITY_HEALTH_COLUMNS.memoryUsagePct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CAPACITY_HEALTH_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => (getValue() as number).toFixed(2) },
  { accessorKey: "ramCommitPct", header: "RAM Commit %", meta: { info: CAPACITY_HEALTH_COLUMNS.ramCommitPct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
  { accessorKey: "ramActivePct", header: "RAM Active %", meta: { info: CAPACITY_HEALTH_COLUMNS.ramActivePct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
  { accessorKey: "swapBalloonPct", header: "Swap+Balloon %", meta: { info: CAPACITY_HEALTH_COLUMNS.swapBalloonPct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(2)}%` },
  { accessorKey: "hotHosts", header: "Hot Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hotHosts }, cell: ({ row }) => {
    const severity = getHotHostSeverity(row.original.hotHosts, row.original.hosts);
    const className = severity === "crit" ? "text-destructive font-semibold" : severity === "warn" ? "text-warning font-semibold" : "text-success font-semibold";
    return <span className={className}>{row.original.hotHosts}/{row.original.hosts}</span>;
  } },
  { accessorKey: "drsEnabled", header: "DRS", meta: { info: CAPACITY_HEALTH_COLUMNS.drsEnabled }, cell: ({ getValue }) => getValue() === null ? "—" : getValue() ? "An" : "Aus" },
  { accessorKey: "haEnabled", header: "HA", meta: { info: CAPACITY_HEALTH_COLUMNS.haEnabled }, cell: ({ getValue }) => getValue() === null ? "—" : getValue() ? "An" : "Aus" },
];

const overcommitColumns: ColumnDef<ClusterOvercommitRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_CLUSTER_COLUMNS.name } },
  { accessorKey: "cpuRatio", header: "vCPU/Core", meta: { info: CAPACITY_CLUSTER_COLUMNS.cpuRatio }, cell: ({ getValue }) => `${(getValue() as number).toFixed(2)}:1` },
  { accessorKey: "ramRatio", header: "RAM Overcommit", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramRatio }, cell: ({ getValue }) => `${(getValue() as number).toFixed(2)}:1` },
  { accessorKey: "vCpuSum", header: "vCPUs", meta: { info: CAPACITY_CLUSTER_COLUMNS.vCpuSum }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "cores", header: "Cores", meta: { info: CAPACITY_CLUSTER_COLUMNS.cores }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramAllocGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramTotalGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
];

const densityColumns: ColumnDef<ClusterDensityRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_DENSITY_COLUMNS.cluster } },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CLUSTER_DENSITY_COLUMNS.hosts } },
  { accessorKey: "vmsPerHost", header: "VMs/Host", meta: { info: CLUSTER_DENSITY_COLUMNS.vmsPerHost }, cell: ({ getValue }) => (getValue() as number).toFixed(1) },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CLUSTER_DENSITY_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => (getValue() as number).toFixed(2) },
  { accessorKey: "ramUtilPct", header: "RAM Util %", meta: { info: CLUSTER_DENSITY_COLUMNS.ramUtilPct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)}%` },
];

function hostDensityColor(vcpuPerCore: number): string {
  if (vcpuPerCore > 5) return CHART_COLORS.danger;
  if (vcpuPerCore > 4) return CHART_COLORS.warning;
  return CHART_COLORS.success;
}

export function ClusterCapacityPanel({ capacityRows, overcommitRows, hostDensity, clusterDensity, search, onOpenCluster }: ClusterCapacityPanelProps) {
  const [selectedVcenter, setSelectedVcenter] = useState("all");
  const [onlyNotableHosts, setOnlyNotableHosts] = useState(false);
  const vcenters = useMemo(
    () => [...new Set(capacityRows.map((row) => row.vcenterDisplayName))].sort((left, right) => left.localeCompare(right, "de-DE")),
    [capacityRows],
  );
  const visibleHostDensity = useMemo(
    () => hostDensity.filter((row) => (selectedVcenter === "all" || row.vcenterDisplayName === selectedVcenter) && (!onlyNotableHosts || row.vcpuPerCore > 4)),
    [hostDensity, onlyNotableHosts, selectedVcenter],
  );
  const riskChart = useMemo(
    () => capacityRows.filter((row) => selectedVcenter === "all" || row.vcenterDisplayName === selectedVcenter).slice(0, 12).map((row) => ({ ...row, name: `${row.vcenterDisplayName} · ${row.cluster}` })),
    [capacityRows, selectedVcenter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="capacity-chart-vcenter" className="text-xs text-muted-foreground">Diagramme nach vCenter</Label>
          <Select value={selectedVcenter} onValueChange={setSelectedVcenter}>
            <SelectTrigger id="capacity-chart-vcenter" aria-label="vCenter für Diagramme" className="h-8 w-[220px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle vCenter</SelectItem>
              {vcenters.map((vcenter) => <SelectItem key={vcenter} value={vcenter}>{vcenter}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="only-notable-hosts" checked={onlyNotableHosts} onCheckedChange={(checked) => setOnlyNotableHosts(checked === true)} />
          <Label htmlFor="only-notable-hosts" className="text-xs text-muted-foreground">Nur auffällige Hosts (vCPU/Core &gt; 4)</Label>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.hostDensity} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3></InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis dataKey="vms" name="VMs" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "VMs/Host", position: "insideBottom", offset: -5, style: CHART_AXIS_LABEL_STYLE }} />
              <YAxis dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", style: CHART_AXIS_LABEL_STYLE }} />
              <ZAxis dataKey="ramGiB" range={[40, 400]} name="RAM GiB" />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                labelFormatter={(_, payload) => {
                  const point = payload[0]?.payload as HostDensityPoint | undefined;
                  return point ? `Host: ${point.name} · ${point.cluster} · ${point.vcenterDisplayName}` : "";
                }}
              />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Scatter data={visibleHostDensity}>{visibleHostDensity.map((row) => <Cell key={row.hostKey} fill={hostDensityColor(row.vcpuPerCore)} />)}</Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </section>
        <section className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.clusterRisk} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Capacity Risk Score (vHost + vCluster)</h3></InfoTooltip>
          <ResponsiveContainer width="100%" height={Math.max(240, riskChart.length * 34)}>
            <BarChart data={riskChart} layout="vertical"><XAxis type="number" domain={[0, "dataMax + 5"]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={180} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="riskScore" radius={[0, 4, 4, 0]}>{riskChart.map((row) => <Cell key={row.clusterKey} fill={row.riskScore >= 60 ? CHART_COLORS.danger : row.riskScore >= 30 ? CHART_COLORS.warning : CHART_COLORS.success} />)}</Bar></BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section>
        <InfoTooltip entry={CAPACITY_SECTIONS.clusterCapacityHealth} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Capacity Health (vHost + vCluster) · Klick öffnet Detailansicht</h3></InfoTooltip>
        <VirtualTable data={capacityRows} columns={capacityColumns} globalFilter={search} height={340} initialSorting={[{ id: "riskScore", desc: true }]} onRowClick={(row) => onOpenCluster(row.clusterKey)} />
      </section>
      <section>
        <InfoTooltip entry={CAPACITY_SECTIONS.clusterOvercommit} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Overcommit · Klick öffnet Detailansicht</h3></InfoTooltip>
        <VirtualTable data={overcommitRows} columns={overcommitColumns} globalFilter={search} height={300} initialSorting={[{ id: "cpuRatio", desc: true }]} onRowClick={(row) => onOpenCluster(row.clusterKey)} />
      </section>
      <section>
        <InfoTooltip entry={LICENSING_SECTIONS.clusterDensity} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Dichte & Effizienz</h3></InfoTooltip>
        <VirtualTable data={clusterDensity} columns={densityColumns} globalFilter={search} height={300} initialSorting={[{ id: "vmsPerHost", desc: true }]} onRowClick={(row) => onOpenCluster(row.clusterKey)} />
      </section>
    </div>
  );
}
