import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Cpu, MemoryStick, Server } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHART_AXIS_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { CAPACITY_CLUSTER_COLUMNS, CAPACITY_HEALTH_COLUMNS, CAPACITY_RISK_KPI, CAPACITY_SECTIONS } from "@/lib/glossaries/capacity";
import { CLUSTER_DENSITY_COLUMNS, LICENSING_SECTIONS } from "@/lib/glossaries/licensing";
import type { ClusterCapacityRow, ClusterDensityRow, ClusterOvercommitRow, HostDensityPoint } from "@/lib/clusterCapacityWorkspace";
import { calculateCapacityRiskKpis } from "@/lib/clusterCapacityKpis";
import { SITE_FAILOVER_THRESHOLDS } from "@/domain/services/clusterCapacityEngine";
import { getHotHostSeverity } from "@/lib/hotHostSeverity";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { coloredNum, coloredPct, coloredRatio, hostFailureTooltipText, maxHostFailuresClassName, RiskTooltipContent, riskSeverity, severityBadge, siteFailoverBadge, siteFailoverLabel, vropsMissingBadge } from "@/lib/metricColor";

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
] as const;

function siteFailoverTooltipText(risk: "ok" | "warn" | "crit" | null, ramAssignedHighPct: number | null): string {
  if (risk === null || ramAssignedHighPct === null) {
    return "Kein vROps-Import für diesen Cluster — Site-Failover-Risiko konnte nicht bewertet werden.";
  }
  const t = SITE_FAILOVER_THRESHOLDS.ramAssignedHigh;
  return `HIGH-RP RAM % liegt bei ${ramAssignedHighPct.toFixed(1)} % der Cluster-Kapazität. Fällt ein Standort aus (≈50 % der Hosts), müssen die HIGH-RP-VMs auf der halbierten Kapazität weiterlaufen: ab ${t.warn} % wird es knapp, ab ${t.danger} % reicht der Platz nicht mehr — aktuell „${siteFailoverLabel(risk)}".`;
}

const capacityColumns: ColumnDef<ClusterCapacityRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_HEALTH_COLUMNS.cluster } },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_HEALTH_COLUMNS.risk }, cell: ({ row }) => (
    <span className="inline-flex items-center gap-1.5">
      <UiTooltip delayDuration={250}>
        <UiTooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">
            {severityBadge(`${row.original.risk} (${row.original.riskScore})`, riskSeverity(row.original.risk))}
          </span>
        </UiTooltipTrigger>
        <UiTooltipContent side="top">
          <RiskTooltipContent riskScore={row.original.riskScore} risk={row.original.risk} riskFactors={row.original.riskFactors} siteFailoverOverride={row.original.siteFailoverOverride} />
        </UiTooltipContent>
      </UiTooltip>
      {vropsMissingBadge(row.original.vropsMissing)}
    </span>
  ) },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hosts } },
  { accessorKey: "maxHostFailures", header: "Ausfallskapazität", meta: { info: CAPACITY_HEALTH_COLUMNS.maxHostFailures }, cell: ({ row }) => {
    const { maxHostFailures, hosts, hostFailureBreaches } = row.original;
    const className = maxHostFailuresClassName(maxHostFailures);
    return (
      <UiTooltip delayDuration={250}>
        <UiTooltipTrigger asChild>
          <span className={`${className} cursor-help underline decoration-dotted underline-offset-4`}>{maxHostFailures} von {hosts}</span>
        </UiTooltipTrigger>
        <UiTooltipContent side="top" className="max-w-[20rem] whitespace-normal text-xs">
          {hostFailureTooltipText(hosts, maxHostFailures, hostFailureBreaches)}
        </UiTooltipContent>
      </UiTooltip>
    );
  } },
  { accessorKey: "totalCores", header: "Cores", meta: { info: CAPACITY_HEALTH_COLUMNS.totalCores } },
  { accessorKey: "totalVms", header: "VMs", meta: { info: CAPACITY_HEALTH_COLUMNS.totalVms } },
  { accessorKey: "cpuUsagePct", header: "CPU %", meta: { info: CAPACITY_HEALTH_COLUMNS.cpuUsagePct }, cell: ({ getValue }) => coloredPct(getValue() as number, 40, 50) },
  { accessorKey: "memoryUsagePct", header: "RAM %", meta: { info: CAPACITY_HEALTH_COLUMNS.memoryUsagePct }, cell: ({ getValue }) => coloredPct(getValue() as number, 50, 70) },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CAPACITY_HEALTH_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => coloredNum(getValue() as number, 4, 5) },
  { accessorKey: "ramCommitPct", header: "RAM Commit %", meta: { info: CAPACITY_HEALTH_COLUMNS.ramCommitPct }, cell: ({ getValue }) => coloredPct(getValue() as number, 50, 70) },
  { accessorKey: "hotHosts", header: "Hot Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hotHosts }, cell: ({ row }) => {
    const severity = getHotHostSeverity(row.original.hotHosts, row.original.hosts);
    const className = severity === "crit" ? "text-destructive font-semibold" : severity === "warn" ? "text-warning font-semibold" : "text-success font-semibold";
    return <span className={className}>{row.original.hotHosts}/{row.original.hosts}</span>;
  } },
  { accessorKey: "vropsRamAssignedHighPct", header: "HIGH-RP RAM %", meta: { info: CAPACITY_HEALTH_COLUMNS.vropsRamAssignedHighPct }, cell: ({ getValue }) => coloredPct(getValue() as number | null, 45, 50, 0) },
  { accessorKey: "siteFailoverRisk", header: "Site-Failover", meta: { info: CAPACITY_HEALTH_COLUMNS.siteFailoverRisk }, cell: ({ row }) => (
    <UiTooltip delayDuration={250}>
      <UiTooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4">
          {siteFailoverBadge(row.original.siteFailoverRisk)}
        </span>
      </UiTooltipTrigger>
      <UiTooltipContent side="top" className="max-w-[20rem] whitespace-normal text-xs">
        {siteFailoverTooltipText(row.original.siteFailoverRisk, row.original.vropsRamAssignedHighPct)}
      </UiTooltipContent>
    </UiTooltip>
  ) },
  { accessorKey: "vropsCpuUsageHighPct", header: "HIGH-RP CPU %", meta: { info: CAPACITY_HEALTH_COLUMNS.vropsCpuUsageHighPct }, cell: ({ getValue }) => coloredPct(getValue() as number | null, 35, 45, 0) },
  { accessorKey: "vropsRamUsageHighPct", header: "HIGH-RP RAM-Nutzung %", meta: { info: CAPACITY_HEALTH_COLUMNS.vropsRamUsageHighPct }, cell: ({ getValue }) => coloredPct(getValue() as number | null, 45, 50, 0) },
];

const overcommitColumns: ColumnDef<ClusterOvercommitRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_CLUSTER_COLUMNS.name } },
  { accessorKey: "cpuRatio", header: "vCPU/Core", meta: { info: CAPACITY_CLUSTER_COLUMNS.cpuRatio }, cell: ({ getValue }) => coloredRatio(getValue() as number, 4, 5) },
  { accessorKey: "ramRatio", header: "RAM Overcommit", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramRatio }, cell: ({ getValue }) => coloredRatio(getValue() as number, 0.6, 0.7) },
  { accessorKey: "vCpuSum", header: "vCPUs", meta: { info: CAPACITY_CLUSTER_COLUMNS.vCpuSum }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "cores", header: "Cores", meta: { info: CAPACITY_CLUSTER_COLUMNS.cores }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramAllocGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramTotalGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "vropsCpuOvercommitRatio", header: "CPU Overcommit (vROps Ist)", meta: { info: CAPACITY_CLUSTER_COLUMNS.vropsCpuOvercommitRatio }, cell: ({ getValue }) => coloredRatio(getValue() as number | null, 4, 5) },
];

const densityColumns: ColumnDef<ClusterDensityRow, unknown>[] = [
  ...vcenterColumns,
  { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_DENSITY_COLUMNS.cluster } },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CLUSTER_DENSITY_COLUMNS.hosts } },
  { accessorKey: "vmsPerHost", header: "VMs/Host", meta: { info: CLUSTER_DENSITY_COLUMNS.vmsPerHost }, cell: ({ getValue }) => (getValue() as number).toFixed(1) },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CLUSTER_DENSITY_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => coloredNum(getValue() as number, 4, 5) },
  { accessorKey: "ramUtilPct", header: "RAM Util %", meta: { info: CLUSTER_DENSITY_COLUMNS.ramUtilPct }, cell: ({ getValue }) => coloredPct(getValue() as number, 50, 70, 0) },
  { accessorKey: "vropsAvgVmsPerHost", header: "VMs/Host (vROps Ist)", meta: { info: CLUSTER_DENSITY_COLUMNS.vropsAvgVmsPerHost }, cell: ({ getValue }) => { const v = getValue() as number | null; return v === null ? "—" : v.toFixed(1); } },
];

function hostDensityColor(vcpuPerCore: number): string {
  if (vcpuPerCore > 5) return CHART_COLORS.danger;
  if (vcpuPerCore > 4) return CHART_COLORS.warning;
  return CHART_COLORS.success;
}

export function HostDensityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: HostDensityPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono-data font-semibold text-popover-foreground">{point.name}</p>
      <p className="mt-0.5 text-muted-foreground">{point.vcenterDisplayName} · {point.cluster}</p>
      <div className="mt-2 grid grid-cols-3 gap-x-3 text-muted-foreground">
        <span>VMs: <strong className="text-popover-foreground">{point.vms}</strong></span>
        <span>vCPU/Core: <strong className="text-popover-foreground">{point.vcpuPerCore.toFixed(2)}</strong></span>
        <span>RAM: <strong className="text-popover-foreground">{point.ramGiB} GiB</strong></span>
      </div>
    </div>
  );
}

export function ClusterCapacityPanel({ capacityRows, overcommitRows, hostDensity, clusterDensity, search, onOpenCluster }: ClusterCapacityPanelProps) {
  const [onlyNotableHosts, setOnlyNotableHosts] = useState(false);
  const visibleHostDensity = useMemo(
    () => hostDensity.filter((row) => !onlyNotableHosts || row.vcpuPerCore > 4),
    [hostDensity, onlyNotableHosts],
  );
  const riskChart = useMemo(
    () => capacityRows.slice(0, 12).map((row) => ({ ...row, name: row.cluster })),
    [capacityRows],
  );
  const kpis = useMemo(() => calculateCapacityRiskKpis(capacityRows), [capacityRows]);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Capacity Risiken hoch" value={formatNum(kpis.criticalCapacity)} severity={kpis.criticalCapacity > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={CAPACITY_RISK_KPI.criticalCapacity} />
        <KpiCard title="Capacity Risiken mittel" value={formatNum(kpis.mediumCapacity)} severity={kpis.mediumCapacity > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={CAPACITY_RISK_KPI.mediumCapacity} />
        <KpiCard title="Hot Hosts" value={formatNum(kpis.hotHosts)} severity={kpis.hotHosts > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={CAPACITY_RISK_KPI.hotHosts} />
        <KpiCard title="Max Swap+Balloon" value={formatPct(kpis.maxSwapBalloon, 2)} severity={kpis.maxSwapBalloon !== null && kpis.maxSwapBalloon > 5 ? "crit" : kpis.maxSwapBalloon !== null && kpis.maxSwapBalloon > 2 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} info={CAPACITY_RISK_KPI.maxSwapBalloon} />
        <KpiCard title="Ø vCPU/Core" value={kpis.avgVcpuPerCore !== null ? `${kpis.avgVcpuPerCore.toFixed(2)}:1` : "—"} severity={kpis.avgVcpuPerCore !== null && kpis.avgVcpuPerCore > 6 ? "crit" : kpis.avgVcpuPerCore !== null && kpis.avgVcpuPerCore > 4 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} info={CAPACITY_RISK_KPI.avgVcpuPerCore} />
      </KpiGrid>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border/50 bg-card/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <InfoTooltip entry={CAPACITY_SECTIONS.hostDensity} side="bottom"><h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3></InfoTooltip>
            <div className="flex items-center gap-2">
              <Checkbox id="only-notable-hosts" checked={onlyNotableHosts} onCheckedChange={(checked) => setOnlyNotableHosts(checked === true)} />
              <Label htmlFor="only-notable-hosts" className="text-xs text-muted-foreground">Nur auffällige Hosts (vCPU/Core &gt; 4)</Label>
            </div>
          </div>
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
                content={(props) => <HostDensityTooltip active={props.active} payload={props.payload as Array<{ payload?: HostDensityPoint }> | undefined} />}
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
