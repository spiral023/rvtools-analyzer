import { useMemo, useState, type ReactNode } from "react";
import { useActiveSnapshotIds, useVms, useClusters, useDatastores, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { ClusterDetailDialog } from "@/components/cluster/ClusterDetailDialog";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { HardDrive, Cpu, MemoryStick, Server, Layers, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, CartesianGrid, ReferenceLine } from "@/components/charts/recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_AXIS_LABEL_STYLE } from "@/lib/chartStyles";
import { aggregateCluster, groupVHostRowsByCluster, metricsFromAggregate } from "@/domain/services/clusterCapacityEngine";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { getHotHostSeverity } from "@/lib/hotHostSeverity";
import {
  CAPACITY_KPI,
  CAPACITY_RISK_KPI,
  CAPACITY_DS_COLUMNS,
  CAPACITY_CLUSTER_COLUMNS,
  CAPACITY_RP_COLUMNS,
  CAPACITY_THIN_COLUMNS,
  CAPACITY_HEALTH_COLUMNS,
  CAPACITY_SECTIONS,
} from "@/lib/glossaries/capacity";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedDatastore } from "@/domain/models/types";

const dsColumns: ColumnDef<NormalizedDatastore, unknown>[] = [
  { accessorKey: "name", header: "Datastore", meta: { info: CAPACITY_DS_COLUMNS.name } },
  { accessorKey: "type", header: "Typ", meta: { info: CAPACITY_DS_COLUMNS.type } },
  { accessorKey: "capacityMiB", header: "Kapazität", meta: { info: CAPACITY_DS_COLUMNS.capacityMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", meta: { info: CAPACITY_DS_COLUMNS.inUseMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", meta: { info: CAPACITY_DS_COLUMNS.freeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", meta: { info: CAPACITY_DS_COLUMNS.freePct }, cell: ({ getValue }) => {
    const v = getValue() as number | null;
    return <span className={v !== null && v < 10 ? "text-destructive font-semibold" : v !== null && v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "clusterName", header: "Cluster", meta: { info: CAPACITY_DS_COLUMNS.clusterName } },
];

interface ClusterMetric {
  name: string; cpuRatio: number; ramRatio: number; vCpuSum: number;
  cores: number; ramAllocGiB: number; ramTotalGiB: number;
}

interface RpRow { name: string; path: string; status: string; vms: number; cpuLimit: string; cpuReservation: number; cpuExpandable: boolean; memLimit: string; memReservation: number; memExpandable: boolean; risk: string }
interface ThinRiskRow { datastore: string; freePct: number | null; thinDisks: number; totalThinMiB: number; risk: string }
interface ClusterCapacityRow {
  cluster: string;
  datacenter: string;
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  totalVcpus: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vcpuPerCore: number;
  ramCommitPct: number;
  ramActivePct: number;
  swapBalloonPct: number;
  hotHosts: number;
  cpuSpread: number;
  memorySpread: number;
  drsEnabled: boolean | null;
  haEnabled: boolean | null;
  clusterHostDelta: number | null;
  clusterMemoryDeltaPct: number | null;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
}

interface HostDensityPoint {
  name: string;
  vms: number;
  vcpuPerCore: number;
  ramGiB: number;
  clusterName: string;
}

function hostDensityColor(vcpuPerCore: number): string {
  if (vcpuPerCore > 5) return CHART_COLORS.danger;
  if (vcpuPerCore > 4) return CHART_COLORS.warning;
  if (vcpuPerCore <= 1) return "#ffffff";
  return CHART_COLORS.success;
}

function renderHostDensityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: HostDensityPoint }>;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const point = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p style={CHART_TOOLTIP_LABEL_STYLE}>Host: {point.name}</p>
      <p style={CHART_TOOLTIP_ITEM_STYLE}>Cluster: {point.clusterName}</p>
      <p style={CHART_TOOLTIP_ITEM_STYLE}>VMs: {formatNum(point.vms)}</p>
      <p style={CHART_TOOLTIP_ITEM_STYLE}>vCPU/Core: {point.vcpuPerCore.toFixed(2)}</p>
      <p style={CHART_TOOLTIP_ITEM_STYLE}>RAM: {formatNum(point.ramGiB)} GiB</p>
    </div>
  );
}

function CapacityOverviewCards({
  datastoresCount,
  avgFreePct,
  critDs,
  warnDs,
  maxCpuOC,
  maxRamOC,
  rpRisks,
  storageEfficiency,
}: {
  datastoresCount: number;
  avgFreePct: number | null;
  critDs: number;
  warnDs: number;
  maxCpuOC: number;
  maxRamOC: number;
  rpRisks: number;
  storageEfficiency: { provGiB: number; inUseGiB: number; ratio: number };
}) {
  return (
    <KpiGrid>
      <KpiCard title="Datastores" value={formatNum(datastoresCount)} icon={<HardDrive className="h-4 w-4" />} info={CAPACITY_KPI.datastores} />
      <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} info={CAPACITY_KPI.avgFreePct} />
      <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} info={CAPACITY_KPI.critDs} />
      <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} info={CAPACITY_KPI.warnDs} />
      <KpiCard title="Max CPU OC" value={`${maxCpuOC.toFixed(1)}:1`} severity={maxCpuOC > 5 ? "crit" : maxCpuOC > 3 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} info={CAPACITY_KPI.maxCpuOC} />
      <KpiCard title="Max RAM OC" value={`${maxRamOC.toFixed(1)}:1`} severity={maxRamOC > 1.5 ? "crit" : maxRamOC > 1.0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} info={CAPACITY_KPI.maxRamOC} />
      <KpiCard title="RP Risiken" value={formatNum(rpRisks)} severity={rpRisks > 0 ? "warn" : "ok"} icon={<Layers className="h-4 w-4" />} info={CAPACITY_KPI.rpRisks} />
      <KpiCard title="Speicherwirkgrad" value={`${storageEfficiency.ratio}%`} subtitle={`${storageEfficiency.inUseGiB.toFixed(0)} / ${storageEfficiency.provGiB.toFixed(0)} GiB`} icon={<Server className="h-4 w-4" />} info={CAPACITY_KPI.storageEfficiency} />
    </KpiGrid>
  );
}

function CapacityRiskCards({
  criticalCapacityClusters,
  mediumCapacityClusters,
  hotHostsTotal,
  maxSwapBalloonPct,
  avgVcpuPerCore,
}: {
  criticalCapacityClusters: number;
  mediumCapacityClusters: number;
  hotHostsTotal: number;
  maxSwapBalloonPct: number;
  avgVcpuPerCore: number;
}) {
  return (
    <KpiGrid>
      <KpiCard title="Capacity Risiken hoch" value={formatNum(criticalCapacityClusters)} severity={criticalCapacityClusters > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={CAPACITY_RISK_KPI.criticalCapacity} />
      <KpiCard title="Capacity Risiken mittel" value={formatNum(mediumCapacityClusters)} severity={mediumCapacityClusters > 0 ? "warn" : "ok"} info={CAPACITY_RISK_KPI.mediumCapacity} />
      <KpiCard title="Hot Hosts" value={formatNum(hotHostsTotal)} severity={hotHostsTotal > 0 ? "warn" : "ok"} info={CAPACITY_RISK_KPI.hotHosts} />
      <KpiCard title="Max Swap+Balloon" value={`${maxSwapBalloonPct.toFixed(2)}%`} severity={maxSwapBalloonPct > 5 ? "crit" : maxSwapBalloonPct > 2 ? "warn" : "ok"} info={CAPACITY_RISK_KPI.maxSwapBalloon} />
      <KpiCard title="Ø vCPU/Core" value={avgVcpuPerCore.toFixed(2)} severity={avgVcpuPerCore > 6 ? "crit" : avgVcpuPerCore > 4 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} info={CAPACITY_RISK_KPI.avgVcpuPerCore} />
    </KpiGrid>
  );
}

function CapacityChartSection({
  dsChart,
  hostDensity,
  renderHostDensityTooltip,
  clusterRiskChart,
}: {
  dsChart: Array<{ name: string; freePct: number }>;
  hostDensity: HostDensityPoint[];
  renderHostDensityTooltip: (props: { active?: boolean; payload?: Array<{ payload?: HostDensityPoint }> }) => ReactNode;
  clusterRiskChart: Array<{ name: string; riskScore: number }>;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.dsHeadroom} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dsChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {dsChart.map((entry) => <Cell key={entry.name} fill={entry.freePct < 10 ? CHART_COLORS.danger : entry.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.hostDensity} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis dataKey="vms" name="VMs" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "VMs/Host", position: "insideBottom", offset: -5, style: CHART_AXIS_LABEL_STYLE }} />
              <YAxis dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", style: CHART_AXIS_LABEL_STYLE }} />
              <ZAxis dataKey="ramGiB" range={[40, 400]} name="RAM GiB" />
              <Tooltip content={renderHostDensityTooltip} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Scatter data={hostDensity}>
                {hostDensity.map((entry) => <Cell key={entry.name} fill={hostDensityColor(entry.vcpuPerCore)} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {clusterRiskChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.clusterRisk} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Capacity Risk Score (vHost + vCluster)</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={Math.max(240, clusterRiskChart.length * 34)}>
            <BarChart data={clusterRiskChart} layout="vertical">
              <XAxis type="number" domain={[0, "dataMax + 5"]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={240} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="riskScore" radius={[0, 4, 4, 0]}>
                {clusterRiskChart.map((entry) => (
                  <Cell key={entry.name} fill={entry.riskScore >= 60 ? CHART_COLORS.danger : entry.riskScore >= 30 ? CHART_COLORS.warning : CHART_COLORS.success} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

function CapacityTablesSection({
  clusterCapacity,
  clusterMetrics,
  datastores,
  globalFilter,
  rpData,
  thinRiskData,
  onOpenClusterDetail,
}: {
  clusterCapacity: ClusterCapacityRow[];
  clusterMetrics: ClusterMetric[];
  datastores: NormalizedDatastore[];
  globalFilter: string;
  rpData: RpRow[];
  thinRiskData: ThinRiskRow[];
  onOpenClusterDetail: (clusterName: string | null | undefined) => void;
}) {
  return (
    <>
      {clusterCapacity.length > 0 && (
        <div>
          <InfoTooltip entry={CAPACITY_SECTIONS.clusterCapacityHealth} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Capacity Health (vHost + vCluster) · Klick öffnet Detailansicht</h3>
          </InfoTooltip>
          <VirtualTable
            data={clusterCapacity}
            columns={clusterCapacityColumns}
            globalFilter={globalFilter}
            height={340}
            initialSorting={[{ id: "cluster", desc: false }]}
            onRowClick={(row) => onOpenClusterDetail(row.cluster)}
          />
        </div>
      )}

      <div>
        <InfoTooltip entry={CAPACITY_SECTIONS.clusterOvercommit} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Overcommit · Klick öffnet Detailansicht</h3>
        </InfoTooltip>
        <VirtualTable
          data={clusterMetrics}
          columns={clusterColumns}
          globalFilter={globalFilter}
          height={300}
          initialSorting={[{ id: "name", desc: false }]}
          onRowClick={(row) => onOpenClusterDetail(row.name)}
        />
      </div>
      <div><InfoTooltip entry={CAPACITY_SECTIONS.datastoreDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Details</h3></InfoTooltip><VirtualTable data={datastores} columns={dsColumns} globalFilter={globalFilter} initialSorting={[{ id: "freePct", desc: false }]} /></div>

      {rpData.length > 0 && (
        <div><InfoTooltip entry={CAPACITY_SECTIONS.resourcePool} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Resource Pool Pressure ({rpData.length})</h3></InfoTooltip><VirtualTable data={rpData} columns={rpColumns} globalFilter={globalFilter} height={300} /></div>
      )}

      {thinRiskData.length > 0 && (
        <div><InfoTooltip entry={CAPACITY_SECTIONS.thinRisk} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Thin-Provisioning Risiko</h3></InfoTooltip><VirtualTable data={thinRiskData} columns={thinRiskColumns} globalFilter={globalFilter} height={250} /></div>
      )}
    </>
  );
}

const clusterColumns: ColumnDef<ClusterMetric, unknown>[] = [
  { accessorKey: "name", header: "Cluster", meta: { info: CAPACITY_CLUSTER_COLUMNS.name } },
  { accessorKey: "cpuRatio", header: "vCPU/Core", meta: { info: CAPACITY_CLUSTER_COLUMNS.cpuRatio }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 5 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v.toFixed(2)}</span>; }},
  { accessorKey: "ramRatio", header: "RAM Overcommit", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramRatio }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 1.5 ? "text-destructive font-semibold" : v > 1.0 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>; }},
  { accessorKey: "vCpuSum", header: "vCPUs", meta: { info: CAPACITY_CLUSTER_COLUMNS.vCpuSum }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "cores", header: "Cores", meta: { info: CAPACITY_CLUSTER_COLUMNS.cores }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramAllocGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", meta: { info: CAPACITY_CLUSTER_COLUMNS.ramTotalGiB }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
];

const rpColumns: ColumnDef<RpRow, unknown>[] = [
  { accessorKey: "name", header: "Resource Pool", meta: { info: CAPACITY_RP_COLUMNS.name } },
  { accessorKey: "path", header: "Pfad", meta: { info: CAPACITY_RP_COLUMNS.path } },
  { accessorKey: "status", header: "Status", meta: { info: CAPACITY_RP_COLUMNS.status }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v}</span>; }},
  { accessorKey: "vms", header: "VMs", meta: { info: CAPACITY_RP_COLUMNS.vms } },
  { accessorKey: "cpuLimit", header: "CPU Limit", meta: { info: CAPACITY_RP_COLUMNS.cpuLimit } },
  { accessorKey: "cpuReservation", header: "CPU Res. MHz", meta: { info: CAPACITY_RP_COLUMNS.cpuReservation } },
  { accessorKey: "cpuExpandable", header: "CPU Expand.", meta: { info: CAPACITY_RP_COLUMNS.cpuExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "memLimit", header: "Mem Limit", meta: { info: CAPACITY_RP_COLUMNS.memLimit } },
  { accessorKey: "memReservation", header: "Mem Res. MiB", meta: { info: CAPACITY_RP_COLUMNS.memReservation } },
  { accessorKey: "memExpandable", header: "Mem Expand.", meta: { info: CAPACITY_RP_COLUMNS.memExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_RP_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const thinRiskColumns: ColumnDef<ThinRiskRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore", meta: { info: CAPACITY_THIN_COLUMNS.datastore } },
  { accessorKey: "freePct", header: "Frei % (knappster DS)", meta: { info: CAPACITY_THIN_COLUMNS.freePct }, cell: ({ getValue }) => { const v = getValue() as number | null; if (v === null) return "—"; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
  { accessorKey: "thinDisks", header: "Thin Disks", meta: { info: CAPACITY_THIN_COLUMNS.thinDisks } },
  { accessorKey: "totalThinMiB", header: "Thin Kapaz.", meta: { info: CAPACITY_THIN_COLUMNS.totalThinMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_THIN_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const clusterCapacityColumns: ColumnDef<ClusterCapacityRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_HEALTH_COLUMNS.cluster } },
  { accessorKey: "datacenter", header: "Datacenter", meta: { info: CAPACITY_HEALTH_COLUMNS.datacenter } },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_HEALTH_COLUMNS.risk }, cell: ({ row }) => {
    const risk = row.original.risk;
    const score = row.original.riskScore;
    return <span className={risk === "hoch" ? "text-destructive font-semibold" : risk === "mittel" ? "text-warning font-semibold" : "text-success"}>{risk} ({score})</span>;
  }},
  { accessorKey: "hosts", header: "Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hosts } },
  { accessorKey: "totalCores", header: "Cores", meta: { info: CAPACITY_HEALTH_COLUMNS.totalCores } },
  { accessorKey: "totalVms", header: "VMs", meta: { info: CAPACITY_HEALTH_COLUMNS.totalVms } },
  { accessorKey: "cpuUsagePct", header: "CPU %", meta: { info: CAPACITY_HEALTH_COLUMNS.cpuUsagePct }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 85 ? "text-destructive font-semibold" : v > 75 ? "text-warning" : "text-success"}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "memoryUsagePct", header: "RAM %", meta: { info: CAPACITY_HEALTH_COLUMNS.memoryUsagePct }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 90 ? "text-destructive font-semibold" : v > 80 ? "text-warning" : "text-success"}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CAPACITY_HEALTH_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 6 ? "text-destructive font-semibold" : v > 4 ? "text-warning" : ""}>{v.toFixed(2)}</span>;
  }},
  { accessorKey: "ramCommitPct", header: "RAM Commit %", meta: { info: CAPACITY_HEALTH_COLUMNS.ramCommitPct }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 180 ? "text-destructive font-semibold" : v > 140 ? "text-warning" : ""}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "ramActivePct", header: "RAM Active %", meta: { info: CAPACITY_HEALTH_COLUMNS.ramActivePct }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 90 ? "text-destructive font-semibold" : v > 80 ? "text-warning" : ""}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "swapBalloonPct", header: "Swap+Balloon %", meta: { info: CAPACITY_HEALTH_COLUMNS.swapBalloonPct }, cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 5 ? "text-destructive font-semibold" : v > 2 ? "text-warning" : "text-success"}>{v.toFixed(2)}%</span>;
  }},
  { accessorKey: "hotHosts", header: "Hot Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.hotHosts }, cell: ({ row }) => {
    const hotHosts = row.original.hotHosts;
    const hosts = row.original.hosts;
    const severity = getHotHostSeverity(hotHosts, hosts);
    const className = severity === "crit" ? "text-destructive font-semibold" : severity === "warn" ? "text-warning font-semibold" : "text-success font-semibold";
    const percentage = hosts > 0 ? (hotHosts / hosts) * 100 : 0;
    return <span className={className}>{hotHosts}/{hosts} <span className="text-xs font-normal">({percentage.toFixed(0)} %)</span></span>;
  }},
  { accessorKey: "drsEnabled", header: "DRS", meta: { info: CAPACITY_HEALTH_COLUMNS.drsEnabled }, cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    if (v === null) return "—";
    return <span className={v ? "text-success" : "text-warning"}>{v ? "An" : "Aus"}</span>;
  }},
  { accessorKey: "haEnabled", header: "HA", meta: { info: CAPACITY_HEALTH_COLUMNS.haEnabled }, cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    if (v === null) return "—";
    return <span className={v ? "text-success" : "text-muted-foreground"}>{v ? "An" : "Aus"}</span>;
  }},
  { accessorKey: "clusterHostDelta", header: "Δ Hosts", meta: { info: CAPACITY_HEALTH_COLUMNS.clusterHostDelta }, cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    return <span className={v !== 0 ? "text-warning font-semibold" : "text-success"}>{v > 0 ? `+${v}` : v}</span>;
  }},
  { accessorKey: "clusterMemoryDeltaPct", header: "Δ RAM %", meta: { info: CAPACITY_HEALTH_COLUMNS.clusterMemoryDeltaPct }, cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    const abs = Math.abs(v);
    return <span className={abs > 5 ? "text-warning font-semibold" : "text-success"}>{v > 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`}</span>;
  }},
];

function useCapacityPageData() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, isLoading: vmsLoading } = useVms();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: rawVHost = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const { data: rawRP = [], isLoading: rawRPLoading } = useRawSheet("vRP");
  const { data: rawDisks = [], isLoading: rawDisksLoading } = useRawSheet("vDisk");
  const dataLoading = snapshotsLoading || vmsLoading || clustersLoading || datastoresLoading
    || hostsLoading || rawVHostLoading || rawRPLoading || rawDisksLoading;
  const filteredRawDisks = useMemo(() => filterVmRows(rawDisks), [filterVmRows, rawDisks]);
  const [selectedClusterName, setSelectedClusterName] = useState<string | null>(null);

  const openClusterDetail = (clusterName: string | null | undefined) => {
    const normalized = (clusterName || "").trim();
    if (normalized) setSelectedClusterName(normalized);
  };

  const { avgFreePct, critDs, warnDs } = useMemo(() => {
    let sum = 0, withPctCount = 0, crit = 0, warn = 0;
    for (const d of datastores) {
      if (d.freePct === null) continue;
      withPctCount += 1;
      sum += d.freePct;
      if (d.freePct < 10) crit += 1;
      else if (d.freePct < 20) warn += 1;
    }
    return {
      avgFreePct: withPctCount ? sum / withPctCount : null,
      critDs: crit,
      warnDs: warn,
    };
  }, [datastores]);

  const clusterMetrics = useMemo<ClusterMetric[]>(() => {
    // VMs (poweredOn) und Host-Cores einmalig nach Cluster indizieren → O(n+m) statt O(n*m)
    const vmsByCluster = new Map<string, typeof vms>();
    for (const v of vms) {
      if (v.powerState !== "poweredOn" || !v.cluster) continue;
      const arr = vmsByCluster.get(v.cluster);
      if (arr) arr.push(v); else vmsByCluster.set(v.cluster, [v]);
    }
    const coresByCluster = new Map<string, number>();
    for (const h of hosts) {
      if (!h.cluster) continue;
      coresByCluster.set(h.cluster, (coresByCluster.get(h.cluster) || 0) + (h.cpuCores || 0));
    }
    return clusters.map((c) => {
      const clusterVms = vmsByCluster.get(c.name) ?? [];
      const totalCoresFromHosts = coresByCluster.get(c.name) ?? 0;
      const totalCores = totalCoresFromHosts > 0 ? totalCoresFromHosts : (c.numCpuCores || 0);
      const vCpuSum = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const ramAllocMiB = clusterVms.reduce((s, v) => s + (v.memoryMiB || 0), 0);
      const cpuRatio = totalCores > 0 ? vCpuSum / totalCores : 0;
      const ramRatio = c.totalMemoryMiB ? ramAllocMiB / c.totalMemoryMiB : 0;
      return { name: c.name, cpuRatio: Math.round(cpuRatio * 100) / 100, ramRatio: Math.round(ramRatio * 100) / 100, vCpuSum, cores: totalCores, ramAllocGiB: ramAllocMiB / 1024, ramTotalGiB: (c.totalMemoryMiB || 0) / 1024 };
    }).sort((a, b) => b.cpuRatio - a.cpuRatio);
  }, [clusters, hosts, vms]);

  const hostDensity = useMemo<HostDensityPoint[]>(() => {
    // poweredOn-VMs einmalig nach Host indizieren → O(n+m) statt O(n*m)
    const vmsByHost = new Map<string, { count: number; vCpuSum: number }>();
    for (const v of vms) {
      if (v.powerState !== "poweredOn" || !v.host) continue;
      const agg = vmsByHost.get(v.host);
      if (agg) { agg.count += 1; agg.vCpuSum += v.cpuCount || 0; }
      else vmsByHost.set(v.host, { count: 1, vCpuSum: v.cpuCount || 0 });
    }
    const result: HostDensityPoint[] = [];
    for (const h of hosts) {
      const agg = vmsByHost.get(h.host);
      if (!agg) continue;
      result.push({ name: h.host, vms: agg.count, vcpuPerCore: h.cpuCores ? Math.round((agg.vCpuSum / h.cpuCores) * 100) / 100 : 0, ramGiB: Math.round((h.memoryTotalMiB || 0) / 1024), clusterName: h.cluster || "—" });
    }
    return result;
  }, [hosts, vms]);

  const clusterCapacity = useMemo<ClusterCapacityRow[]>(() => {
    // Einmalig nach Cluster gruppieren, statt pro Cluster erneut alle Host-Zeilen
    // zu durchsuchen (O(Zeilen + Cluster) statt O(Cluster × Zeilen)).
    const rowsByCluster = groupVHostRowsByCluster(rawVHost);
    const clusterMap = new Map(clusters.map((c) => [c.name, c]));

    return [...rowsByCluster.entries()].map(([name, clusterRows]) => {
      const agg = aggregateCluster(name, clusterRows);
      const clusterRef = clusterMap.get(name) ?? null;
      const m = metricsFromAggregate(agg, { clusterName: name, clusterRef, projected: false });
      const datacenter = String(clusterRows[0]?.data["Datacenter"] ?? "").trim() || "—";
      const cpuSpread = Number.isFinite(agg.cpuMin) && Number.isFinite(agg.cpuMax) ? Math.round((agg.cpuMax - agg.cpuMin) * 10) / 10 : 0;
      const memorySpread = Number.isFinite(agg.memMin) && Number.isFinite(agg.memMax) ? Math.round((agg.memMax - agg.memMin) * 10) / 10 : 0;
      const clusterHostDelta = clusterRef?.numHosts != null ? agg.hosts - clusterRef.numHosts : null;
      const clusterMemoryDeltaPct = clusterRef?.totalMemoryMiB
        ? Math.round(((agg.totalMemoryMiB - clusterRef.totalMemoryMiB) / clusterRef.totalMemoryMiB) * 1000) / 10
        : null;

      return {
        cluster: name,
        datacenter,
        hosts: m.hosts,
        totalCores: m.totalCores,
        totalMemoryMiB: m.totalMemoryMiB,
        totalVms: m.totalVms,
        totalVcpus: m.totalVcpus,
        cpuUsagePct: m.cpuUsagePct,
        memoryUsagePct: m.memoryUsagePct,
        vcpuPerCore: m.vcpuPerCore,
        ramCommitPct: m.ramCommitPct,
        ramActivePct: m.ramActivePct,
        swapBalloonPct: m.swapBalloonPct,
        hotHosts: agg.hotHosts,
        cpuSpread,
        memorySpread,
        drsEnabled: clusterRef?.drsEnabled ?? null,
        haEnabled: clusterRef?.haEnabled ?? null,
        clusterHostDelta,
        clusterMemoryDeltaPct,
        riskScore: m.riskScore,
        risk: m.risk,
      } satisfies ClusterCapacityRow;
    }).sort((a, b) => b.riskScore - a.riskScore || b.vcpuPerCore - a.vcpuPerCore);
  }, [rawVHost, clusters]);

  const dsChart = useMemo(() => {
    return datastores.filter((d) => d.freePct !== null).map((d) => ({ name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name, freePct: Math.round(d.freePct! * 10) / 10 })).sort((a, b) => a.freePct - b.freePct).slice(0, 15);
  }, [datastores]);

  // Resource Pool Pressure
  const rpData = useMemo<RpRow[]>(() => {
    return rawRP.map((r) => {
      const d = r.data;
      const cpuLimit = Number(d["CPU limit"] ?? -1);
      const memLimit = Number(d["Mem limit"] ?? -1);
      const cpuExp = String(d["CPU expandableReservation"] || "").toLowerCase() === "true";
      const memExp = String(d["Mem expandableReservation"] || "").toLowerCase() === "true";
      const cpuRes = Number(d["CPU reservation"] || 0);
      const memRes = Number(d["Mem reservation"] || 0);
      let risk = "niedrig";
      if ((cpuLimit > 0 && cpuLimit !== -1) || (memLimit > 0 && memLimit !== -1)) risk = "mittel";
      if (!cpuExp || !memExp) risk = "mittel";
      if ((cpuLimit > 0 && cpuLimit !== -1 && !cpuExp) || (memLimit > 0 && memLimit !== -1 && !memExp)) risk = "hoch";
      return {
        name: String(d["Resource Pool name"] || ""),
        path: String(d["Resource Pool path"] || ""),
        status: String(d["Status"] || ""),
        vms: Number(d["# VMs"] || 0),
        cpuLimit: cpuLimit === -1 ? "Unlimited" : String(cpuLimit),
        cpuReservation: cpuRes,
        cpuExpandable: cpuExp,
        memLimit: memLimit === -1 ? "Unlimited" : String(memLimit),
        memReservation: memRes,
        memExpandable: memExp,
        risk,
      };
    }).sort((a, b) => (a.risk === "hoch" ? 0 : a.risk === "mittel" ? 1 : 2) - (b.risk === "hoch" ? 0 : b.risk === "mittel" ? 1 : 2));
  }, [rawRP]);

  const rpRisks = rpData.filter((r) => r.risk !== "niedrig").length;

  // Thin-Provisioning Risk: vDisk trägt keinen Datastore-Namen, daher wird
  // global gezählt und gegen den knappsten Datastore bewertet.
  const thinRiskData = useMemo<ThinRiskRow[]>(() => {
    let thinDisks = 0;
    let totalThinMiB = 0;
    for (const r of filteredRawDisks) {
      if (String(r.data["Thin"] || "").toLowerCase() === "true") {
        thinDisks++;
        totalThinMiB += Number(r.data["Capacity MiB"] || 0);
      }
    }
    if (thinDisks === 0) return [];
    const freePcts = datastores.map((d) => d.freePct).filter((v): v is number => v !== null);
    const minFreePct = freePcts.length ? Math.min(...freePcts) : null;
    let risk = "niedrig";
    if (minFreePct !== null && minFreePct < 20) risk = "mittel";
    if (minFreePct !== null && minFreePct < 10 && thinDisks > 5) risk = "hoch";
    return [{ datastore: "Alle Datastores (gesamt)", freePct: minFreePct, thinDisks, totalThinMiB, risk }];
  }, [datastores, filteredRawDisks]);

  // Unshared vs Provisioned
  const storageEfficiency = useMemo(() => {
    const totalProv = vms.reduce((s, v) => s + (v.provisionedMiB || 0), 0);
    const totalInUse = vms.reduce((s, v) => s + (v.inUseMiB || 0), 0);
    const ratio = totalProv > 0 ? (totalInUse / totalProv) * 100 : 0;
    return { provGiB: totalProv / 1024, inUseGiB: totalInUse / 1024, ratio: Math.round(ratio * 10) / 10 };
  }, [vms]);

  const maxCpuOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.cpuRatio)) : 0;
  const maxRamOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.ramRatio)) : 0;
  const criticalCapacityClusters = clusterCapacity.filter((c) => c.risk === "hoch").length;
  const mediumCapacityClusters = clusterCapacity.filter((c) => c.risk === "mittel").length;
  const hotHostsTotal = clusterCapacity.reduce((sum, c) => sum + c.hotHosts, 0);
  const maxSwapBalloonPct = clusterCapacity.length > 0 ? Math.max(...clusterCapacity.map((c) => c.swapBalloonPct)) : 0;
  const avgVcpuPerCore = clusterCapacity.length > 0
    ? clusterCapacity.reduce((sum, c) => sum + c.vcpuPerCore, 0) / clusterCapacity.length
    : 0;
  const clusterRiskChart = useMemo(
    () => clusterCapacity.slice(0, 12).map((c) => ({
      name: c.cluster.length > 24 ? `${c.cluster.slice(0, 22)}…` : c.cluster,
      riskScore: c.riskScore,
    })),
    [clusterCapacity],
  );

  return {
    snapshots,
    dataLoading,
    filters,
    clusters,
    datastores,
    hosts,
    rawVHost,
    vms,
    selectedClusterName,
    setSelectedClusterName,
    openClusterDetail,
    avgFreePct,
    critDs,
    warnDs,
    clusterMetrics,
    hostDensity,
    renderHostDensityTooltip,
    clusterCapacity,
    dsChart,
    rpData,
    rpRisks,
    thinRiskData,
    storageEfficiency,
    maxCpuOC,
    maxRamOC,
    criticalCapacityClusters,
    mediumCapacityClusters,
    hotHostsTotal,
    maxSwapBalloonPct,
    avgVcpuPerCore,
    clusterRiskChart,
  };
}

export default function Capacity() {
  const {
    snapshots,
    dataLoading,
    filters,
    clusters,
    datastores,
    hosts,
    rawVHost,
    vms,
    selectedClusterName,
    setSelectedClusterName,
    openClusterDetail,
    avgFreePct,
    critDs,
    warnDs,
    clusterMetrics,
    hostDensity,
    renderHostDensityTooltip,
    clusterCapacity,
    dsChart,
    rpData,
    rpRisks,
    thinRiskData,
    storageEfficiency,
    maxCpuOC,
    maxRamOC,
    criticalCapacityClusters,
    mediumCapacityClusters,
    hotHostsTotal,
    maxSwapBalloonPct,
    avgVcpuPerCore,
    clusterRiskChart,
  } = useCapacityPageData();

  if (dataLoading) return <PageLoadingState title="Capacity" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Capacity</h1><EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Capacity">
      </PageHeader>
      <GlobalFilterScopeHint text="Thin-Provisioning und VM-basierte Capacity-Kennzahlen folgen dem globalen Filter; Host-, Cluster- und Datastore-Inventar bleibt unverändert." />
      <CapacityOverviewCards
        datastoresCount={datastores.length}
        avgFreePct={avgFreePct}
        critDs={critDs}
        warnDs={warnDs}
        maxCpuOC={maxCpuOC}
        maxRamOC={maxRamOC}
        rpRisks={rpRisks}
        storageEfficiency={storageEfficiency}
      />

      {clusterCapacity.length > 0 && (
        <CapacityRiskCards
          criticalCapacityClusters={criticalCapacityClusters}
          mediumCapacityClusters={mediumCapacityClusters}
          hotHostsTotal={hotHostsTotal}
          maxSwapBalloonPct={maxSwapBalloonPct}
          avgVcpuPerCore={avgVcpuPerCore}
        />
      )}

      <CapacityChartSection
        dsChart={dsChart}
        hostDensity={hostDensity}
        renderHostDensityTooltip={renderHostDensityTooltip}
        clusterRiskChart={clusterRiskChart}
      />

      <CapacityTablesSection
        clusterCapacity={clusterCapacity}
        clusterMetrics={clusterMetrics}
        datastores={datastores}
        globalFilter={filters.search}
        rpData={rpData}
        thinRiskData={thinRiskData}
        onOpenClusterDetail={openClusterDetail}
      />

      <ClusterDetailDialog
        clusterName={selectedClusterName}
        open={!!selectedClusterName}
        onClose={() => setSelectedClusterName(null)}
        clusters={clusters}
        hosts={hosts}
        vms={vms}
        datastores={datastores}
        rawVHostRows={rawVHost}
      />
    </div>
  );
}
