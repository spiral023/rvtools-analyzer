import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Server, ShieldCheck, Users, Waypoints } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildClusterDensityChart, buildClusterOverviewKpis, buildRiskChart, buildTopChartRows, buildVmDistributionChart, type ClusterOverviewRow } from "@/lib/clusterWorkspace";
import type { ClusterOsDistributionRow, VmOsSource } from "@/lib/vmOsDistribution";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLUSTER_CHARTS, CLUSTER_KPI, CLUSTER_OS_COLUMNS, CLUSTER_OVERVIEW_COLUMNS } from "@/lib/glossaries/clusters";

interface ClusterOverviewPanelProps {
  rows: ClusterOverviewRow[];
  osRows: ClusterOsDistributionRow[];
  osSource: VmOsSource;
  onOsSourceChange: (source: VmOsSource) => void;
  onOpenCluster: (clusterKey: string) => void;
  onOpenOsDetail: (row: ClusterOsDistributionRow) => void;
  search: string;
}

const riskColor = (risk: ClusterOverviewRow["risk"]) => (
  risk === "hoch" ? CHART_COLORS.danger : risk === "mittel" ? CHART_COLORS.warning : CHART_COLORS.success
);

const CHART_CLUSTER_LIMIT = 20;

const clusterColumns: ColumnDef<ClusterOverviewRow, unknown>[] = [
  { accessorKey: "vcenterDisplayName", header: "vCenter", meta: { info: CLUSTER_OVERVIEW_COLUMNS.vcenterDisplayName } },
  { accessorKey: "datacenter", header: "Datacenter", meta: { info: CLUSTER_OVERVIEW_COLUMNS.datacenter } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_OVERVIEW_COLUMNS.cluster } },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CLUSTER_OVERVIEW_COLUMNS.hosts }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "runningVms", header: "Laufende VMs", meta: { info: CLUSTER_OVERVIEW_COLUMNS.runningVms }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "avgVmsPerHost", header: "Ø VMs/Host", meta: { info: CLUSTER_OVERVIEW_COLUMNS.avgVmsPerHost }, cell: ({ getValue }) => {
    const value = getValue() as number | null;
    return value === null ? "—" : value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } },
  {
    accessorKey: "maxVmsPerHost",
    header: "Max. VMs/Host",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.maxVmsPerHost },
    cell: ({ row, getValue }) => {
      const host = row.original.maxVmsHost;
      const count = formatNum(getValue() as number | null);
      return host ? `${count} (${host})` : count;
    },
  },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CLUSTER_OVERVIEW_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => (getValue() as number).toLocaleString("de-DE", { maximumFractionDigits: 2 }) },
  { accessorKey: "ramCommitPct", header: "RAM Commit", meta: { info: CLUSTER_OVERVIEW_COLUMNS.ramCommitPct }, cell: ({ getValue }) => formatPct(getValue() as number) },
  {
    accessorKey: "risk",
    header: "Risiko",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.risk },
    cell: ({ row }) => <Badge variant={row.original.risk === "hoch" ? "destructive" : row.original.risk === "mittel" ? "secondary" : "outline"}>{row.original.risk}</Badge>,
  },
  { accessorKey: "riskScore", header: "Score", meta: { info: CLUSTER_OVERVIEW_COLUMNS.riskScore }, cell: ({ getValue }) => formatNum(getValue() as number) },
  {
    id: "haDrs",
    header: "HA / DRS",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.haDrs },
    accessorFn: (row) => `${row.haEnabled === true ? "Aktiv" : "Aus/—"} / ${row.drsEnabled === true ? "Aktiv" : "Aus/—"}`,
  },
];

function osColumns(vcenterDisplayNames: Map<string, string>, source: VmOsSource): ColumnDef<ClusterOsDistributionRow, unknown>[] {
  const operatingSystemInfo = source === "tools"
    ? CLUSTER_OS_COLUMNS.operatingSystem
    : {
      ...CLUSTER_OS_COLUMNS.operatingSystem,
      description: "Gastbetriebssystem laut Konfigurationsdatei (.vmx). Kann von der durch VMware Tools gemeldeten Version abweichen.",
      source: "RVTools · vInfo · „OS according to the configuration file“",
    };
  return [
    { accessorKey: "vcenterId", header: "vCenter", meta: { info: CLUSTER_OVERVIEW_COLUMNS.vcenterDisplayName }, cell: ({ getValue }) => vcenterDisplayNames.get(getValue() as string) ?? getValue() as string },
    { accessorKey: "datacenter", header: "Datacenter", meta: { info: CLUSTER_OVERVIEW_COLUMNS.datacenter }, cell: ({ getValue }) => getValue() || "—" },
    { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_OVERVIEW_COLUMNS.cluster } },
    { accessorKey: "operatingSystem", header: "Betriebssystem", meta: { info: operatingSystemInfo }, cell: ({ getValue }) => getValue() || "—" },
    { accessorKey: "vmCount", header: "VMs", meta: { info: CLUSTER_OS_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
    { accessorKey: "clusterSharePct", header: "Anteil im Cluster", meta: { info: CLUSTER_OS_COLUMNS.clusterSharePct }, cell: ({ getValue }) => formatPct(getValue() as number) },
  ];
}

function ChartCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/50 bg-card/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ClusterOverviewPanel({ rows, osRows, osSource, onOsSourceChange, onOpenCluster, onOpenOsDetail, search }: ClusterOverviewPanelProps) {
  const [selectedVcenter, setSelectedVcenter] = useState("all");
  const kpis = buildClusterOverviewKpis(rows);
  const vcenters = useMemo(
    () => [...new Set(rows.map((row) => row.vcenterDisplayName))].sort((left, right) => left.localeCompare(right, "de-DE")),
    [rows],
  );
  const chartRows = useMemo(
    () => selectedVcenter === "all" ? rows : rows.filter((row) => row.vcenterDisplayName === selectedVcenter),
    [rows, selectedVcenter],
  );
  const density = useMemo(() => buildClusterDensityChart(chartRows), [chartRows]);
  const risks = useMemo(() => buildTopChartRows(buildRiskChart(chartRows), CHART_CLUSTER_LIMIT, (remaining) => ({
    ...remaining[0],
    clusterKey: "chart-rest-risk",
    name: `Weitere ${remaining.length} Cluster`,
    riskScore: remaining.reduce((total, row) => total + row.riskScore, 0) / remaining.length,
    risk: remaining.some((row) => row.risk === "hoch") ? "hoch" as const : remaining.some((row) => row.risk === "mittel") ? "mittel" as const : "niedrig" as const,
  })), [chartRows]);
  const vmDistribution = useMemo(() => buildTopChartRows(buildVmDistributionChart(chartRows), CHART_CLUSTER_LIMIT, (remaining) => ({
    ...remaining[0],
    clusterKey: "chart-rest-vm-density",
    name: `Weitere ${remaining.length} Cluster`,
    avgVmsPerHost: remaining.reduce((total, row) => total + (row.avgVmsPerHost ?? 0), 0) / remaining.length,
    maxVmsPerHost: Math.max(...remaining.map((row) => row.maxVmsPerHost ?? 0)),
    maxVmsHost: null as string | null,
  })), [chartRows]);
  const vcenterDisplayNames = new Map(rows.map((row) => [row.vcenterId, row.vcenterDisplayName]));

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Cluster" value={formatNum(kpis.clusters)} info={CLUSTER_KPI.clusters} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Hosts" value={formatNum(kpis.hosts)} info={CLUSTER_KPI.hosts} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Laufende VMs" value={formatNum(kpis.runningVms)} info={CLUSTER_KPI.runningVms} icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Cluster mit hohem Risiko" value={formatNum(kpis.highRiskClusters)} info={CLUSTER_KPI.highRiskClusters} severity={kpis.highRiskClusters > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Max. VMs/Host" value={formatNum(kpis.maxVmsPerHost)} info={CLUSTER_KPI.maxVmsPerHost} subtitle={kpis.maxVmsCluster ? `${kpis.maxVmsVcenterDisplayName} · ${kpis.maxVmsCluster}${kpis.maxVmsHost ? ` · ${kpis.maxVmsHost}` : ""}` : undefined} icon={<Waypoints className="h-4 w-4" />} />
        <KpiCard title="HA-/DRS-Auffälligkeiten" value={formatNum(kpis.haDrsIssues)} info={CLUSTER_KPI.haDrsIssues} severity={kpis.haDrsIssues > 0 ? "warn" : "ok"} icon={<ShieldCheck className="h-4 w-4" />} />
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="overview-chart-vcenter" className="text-xs text-muted-foreground">Diagramme nach vCenter</Label>
        <Select value={selectedVcenter} onValueChange={setSelectedVcenter}>
          <SelectTrigger id="overview-chart-vcenter" aria-label="vCenter für Diagramme" className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle vCenter</SelectItem>
            {vcenters.map((vcenter) => <SelectItem key={vcenter} value={vcenter}>{vcenter}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.density}><span className="cursor-help">Cluster-Dichtekarte</span></InfoTooltip>}>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis type="number" dataKey="avgVmsPerHost" name="Ø VMs/Host" tick={CHART_AXIS_STYLE} label={{ value: "Ø VMs je Host", position: "insideBottom", offset: -8, ...CHART_AXIS_STYLE }} />
              <YAxis type="number" dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", ...CHART_AXIS_STYLE }} />
              <ZAxis type="number" dataKey="runningVms" range={[80, 420]} name="Laufende VMs" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} cursor={{ strokeDasharray: "3 3" }} formatter={(value: number, name: string) => [formatNum(value), name]} labelFormatter={(_, payload) => {
                const point = payload[0]?.payload;
                return point ? `Cluster: ${point.cluster} · ${point.vcenterDisplayName} · ${point.datacenter}` : "";
              }} />
              <Scatter data={density} name="Cluster">
                {density.map((point) => <Cell key={point.clusterKey} fill={riskColor(point.risk)} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.risk}><span className="cursor-help">Risikoscore je Cluster{chartRows.length > CHART_CLUSTER_LIMIT ? ` · Top ${CHART_CLUSTER_LIMIT} + Rest` : ""}</span></InfoTooltip>}>
          <ResponsiveContainer width="100%" height={Math.max(280, risks.length * 28)}>
            <BarChart data={risks} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
              <CartesianGrid horizontal={false} {...CHART_GRID_STYLE} />
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={170} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [formatNum(value), "Risikoscore"]} />
              <Bar dataKey="riskScore" name="Risikoscore" radius={[0, 4, 4, 0]}>
                {risks.map((point) => <Cell key={point.clusterKey} fill={riskColor(point.risk)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.vmDistribution}><span className="cursor-help">Ø und Maximum VMs je Host{chartRows.length > CHART_CLUSTER_LIMIT ? ` · Top ${CHART_CLUSTER_LIMIT} + Rest` : ""}</span></InfoTooltip>}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={vmDistribution} margin={{ top: 12, right: 16, bottom: 46, left: -12 }}>
            <CartesianGrid vertical={false} {...CHART_GRID_STYLE} />
            <XAxis dataKey="name" tick={CHART_AXIS_STYLE} interval="preserveStartEnd" minTickGap={32} angle={-24} textAnchor="end" height={64} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number, name: string) => [formatNum(value), name]} />
            <Bar dataKey="avgVmsPerHost" name="Ø VMs/Host" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            <Bar dataKey="maxVmsPerHost" name="Max. VMs/Host" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Clusterübersicht</h3>
          <span className="text-xs text-muted-foreground">({formatNum(rows.length)})</span>
        </div>
        <VirtualTable data={rows} columns={clusterColumns} globalFilter={search} height={420} initialSorting={[{ id: "riskScore", desc: true }]} exportFileName="rvtools-cluster-uebersicht" onRowClick={(row) => onOpenCluster(row.clusterKey)} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Betriebssysteme je Cluster ({formatNum(osRows.length)})</h3>
          <ToggleGroup type="single" value={osSource} onValueChange={(value) => {
            if (value === "tools" || value === "config") onOsSourceChange(value);
          }} aria-label="Betriebssystemquelle" size="sm" variant="outline">
            <ToggleGroupItem value="tools" aria-label="According to VMware Tools">According to VMware Tools</ToggleGroupItem>
            <ToggleGroupItem value="config" aria-label="Configuration file">Configuration file</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <VirtualTable data={osRows} columns={osColumns(vcenterDisplayNames, osSource)} globalFilter={search} height={360} initialSorting={[{ id: "cluster", desc: false }]} exportFileName="rvtools-os-je-cluster" onRowClick={onOpenOsDetail} />
      </section>
    </div>
  );
}
