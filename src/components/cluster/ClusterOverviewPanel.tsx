import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Server, ShieldCheck, Users, Waypoints } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildClusterDensityChart, buildClusterOverviewKpis, buildRiskChart, buildTopChartRows, buildVmDistributionChart, type ClusterDensityPoint, type ClusterOverviewRow } from "@/lib/clusterWorkspace";
import { clusterOverviewColumns } from "@/components/cluster/clusterOverviewColumns";
import type { ClusterOsDistributionRow, VmOsSource } from "@/lib/vmOsDistribution";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
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

export const RISK_CHART_CLUSTER_LIMIT = 10;
const VM_DISTRIBUTION_CHART_CLUSTER_LIMIT = 20;

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
    { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_OVERVIEW_COLUMNS.cluster } },
    { accessorKey: "operatingSystem", header: "Betriebssystem", meta: { info: operatingSystemInfo }, cell: ({ getValue }) => getValue() || "—" },
    { accessorKey: "vmCount", header: "VMs", meta: { info: CLUSTER_OS_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
    { accessorKey: "clusterSharePct", header: "Anteil im Cluster", meta: { info: CLUSTER_OS_COLUMNS.clusterSharePct }, cell: ({ getValue }) => formatPct(getValue() as number) },
  ];
}

function ClusterDensityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ClusterDensityPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono-data font-semibold text-popover-foreground">{point.cluster}</p>
      <p className="mt-0.5 text-muted-foreground">{point.vcenterDisplayName} · {point.datacenter}</p>
      <div className="mt-2 grid grid-cols-3 gap-x-3 text-muted-foreground">
        <span>Ø VMs/Host: <strong className="text-popover-foreground">{formatNum(point.avgVmsPerHost)}</strong></span>
        <span>vCPU/Core: <strong className="text-popover-foreground">{point.vcpuPerCore.toFixed(2)}</strong></span>
        <span>VMs: <strong className="text-popover-foreground">{formatNum(point.vms)}</strong></span>
      </div>
    </div>
  );
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
  const kpis = buildClusterOverviewKpis(rows);
  const density = useMemo(() => buildClusterDensityChart(rows), [rows]);
  const risks = useMemo(() => buildTopChartRows(buildRiskChart(rows), RISK_CHART_CLUSTER_LIMIT, (remaining) => ({
    ...remaining[0],
    clusterKey: "chart-rest-risk",
    name: `Weitere ${remaining.length} Cluster`,
    riskScore: remaining.reduce((total, row) => total + row.riskScore, 0) / remaining.length,
    risk: remaining.some((row) => row.risk === "hoch") ? "hoch" as const : remaining.some((row) => row.risk === "mittel") ? "mittel" as const : "niedrig" as const,
  })), [rows]);
  const vmDistribution = useMemo(() => buildTopChartRows(buildVmDistributionChart(rows), VM_DISTRIBUTION_CHART_CLUSTER_LIMIT, (remaining) => ({
    ...remaining[0],
    clusterKey: "chart-rest-vm-density",
    name: `Weitere ${remaining.length} Cluster`,
    avgVmsPerHost: remaining.reduce((total, row) => total + (row.avgVmsPerHost ?? 0), 0) / remaining.length,
    maxVmsPerHost: Math.max(...remaining.map((row) => row.maxVmsPerHost ?? 0)),
    maxVmsHost: null as string | null,
  })), [rows]);
  const vcenterDisplayNames = new Map(rows.map((row) => [row.vcenterId, row.vcenterDisplayName]));

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Cluster" value={formatNum(kpis.clusters)} info={CLUSTER_KPI.clusters} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Hosts" value={formatNum(kpis.hosts)} info={CLUSTER_KPI.hosts} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="VMs" value={formatNum(kpis.vms)} info={CLUSTER_KPI.vms} icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Cluster mit hohem Risiko" value={formatNum(kpis.highRiskClusters)} info={CLUSTER_KPI.highRiskClusters} severity={kpis.highRiskClusters > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Max. VMs/Host" value={formatNum(kpis.maxVmsPerHost)} info={CLUSTER_KPI.maxVmsPerHost} subtitle={kpis.maxVmsCluster ? `${kpis.maxVmsVcenterDisplayName} · ${kpis.maxVmsCluster}${kpis.maxVmsHost ? ` · ${kpis.maxVmsHost}` : ""}` : undefined} icon={<Waypoints className="h-4 w-4" />} />
        <KpiCard title="HA-/DRS-Auffälligkeiten" value={formatNum(kpis.haDrsIssues)} info={CLUSTER_KPI.haDrsIssues} severity={kpis.haDrsIssues > 0 ? "warn" : "ok"} icon={<ShieldCheck className="h-4 w-4" />} />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.density}><span className="cursor-help">Cluster-Dichtekarte</span></InfoTooltip>}>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis type="number" dataKey="avgVmsPerHost" name="Ø VMs/Host" tick={CHART_AXIS_STYLE} label={{ value: "Ø VMs je Host", position: "insideBottom", offset: -8, ...CHART_AXIS_STYLE }} />
              <YAxis type="number" dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", ...CHART_AXIS_STYLE }} />
              <ZAxis type="number" dataKey="vms" range={[80, 420]} name="VMs" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={(props) => <ClusterDensityTooltip active={props.active} payload={props.payload as Array<{ payload?: ClusterDensityPoint }> | undefined} />}
              />
              <Scatter data={density} name="Cluster">
                {density.map((point) => <Cell key={point.clusterKey} fill={riskColor(point.risk)} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.risk}><span className="cursor-help">Risikoscore je Cluster{rows.length > RISK_CHART_CLUSTER_LIMIT ? ` · Top ${RISK_CHART_CLUSTER_LIMIT} + Rest` : ""}</span></InfoTooltip>}>
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

      <ChartCard title={<InfoTooltip entry={CLUSTER_CHARTS.vmDistribution}><span className="cursor-help">Ø und Maximum VMs je Host{rows.length > VM_DISTRIBUTION_CHART_CLUSTER_LIMIT ? ` · Top ${VM_DISTRIBUTION_CHART_CLUSTER_LIMIT} + Rest` : ""}</span></InfoTooltip>}>
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
        <VirtualTable data={rows} columns={clusterOverviewColumns} globalFilter={search} height={420} initialSorting={[{ id: "riskScore", desc: true }]} exportFileName="rvtools-cluster-uebersicht" onRowClick={(row) => onOpenCluster(row.clusterKey)} />
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
