import { useMemo, useState, type ReactNode } from "react";
import { useActiveSnapshotIds, useVms, useClusters, useDatastores, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { ClusterDetailDialog } from "@/components/cluster/ClusterDetailDialog";
import { HardDrive, Cpu, MemoryStick, Server, Layers, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, CartesianGrid } from "@/components/charts/recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS, CHART_GRID_STYLE, CHART_AXIS_LABEL_STYLE } from "@/lib/chartStyles";
import { toBoolLoose, toNumLoose } from "@/lib/conversion";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedDatastore } from "@/domain/models/types";

const dsColumns: ColumnDef<NormalizedDatastore, unknown>[] = [
  { accessorKey: "name", header: "Datastore" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    return <span className={v !== null && v < 10 ? "text-destructive font-semibold" : v !== null && v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "clusterName", header: "Cluster" },
];

interface ClusterMetric {
  name: string; cpuRatio: number; ramRatio: number; vCpuSum: number;
  cores: number; ramAllocGiB: number; ramTotalGiB: number;
}

interface RpRow { name: string; path: string; status: string; vms: number; cpuLimit: string; cpuReservation: number; cpuExpandable: boolean; memLimit: string; memReservation: number; memExpandable: boolean; risk: string }
interface ThinRiskRow { datastore: string; freePct: number; thinDisks: number; totalThinMiB: number; risk: string }
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
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
      <KpiCard title="Datastores" value={formatNum(datastoresCount)} icon={<HardDrive className="h-4 w-4" />} />
      <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} />
      <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} />
      <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} />
      <KpiCard title="Max CPU OC" value={`${maxCpuOC.toFixed(1)}:1`} severity={maxCpuOC > 5 ? "crit" : maxCpuOC > 3 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
      <KpiCard title="Max RAM OC" value={`${maxRamOC.toFixed(1)}:1`} severity={maxRamOC > 1.5 ? "crit" : maxRamOC > 1.0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
      <KpiCard title="RP Risiken" value={formatNum(rpRisks)} severity={rpRisks > 0 ? "warn" : "ok"} icon={<Layers className="h-4 w-4" />} />
      <KpiCard title="Speicherwirkgrad" value={`${storageEfficiency.ratio}%`} subtitle={`${storageEfficiency.inUseGiB.toFixed(0)} / ${storageEfficiency.provGiB.toFixed(0)} GiB`} icon={<Server className="h-4 w-4" />} />
    </div>
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
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <KpiCard title="Capacity Risiken hoch" value={formatNum(criticalCapacityClusters)} severity={criticalCapacityClusters > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      <KpiCard title="Capacity Risiken mittel" value={formatNum(mediumCapacityClusters)} severity={mediumCapacityClusters > 0 ? "warn" : "ok"} />
      <KpiCard title="Hot Hosts" value={formatNum(hotHostsTotal)} severity={hotHostsTotal > 0 ? "warn" : "ok"} />
      <KpiCard title="Max Swap+Balloon" value={`${maxSwapBalloonPct.toFixed(2)}%`} severity={maxSwapBalloonPct > 5 ? "crit" : maxSwapBalloonPct > 2 ? "warn" : "ok"} />
      <KpiCard title="Ø vCPU/Core" value={avgVcpuPerCore.toFixed(2)} severity={avgVcpuPerCore > 6 ? "crit" : avgVcpuPerCore > 4 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
    </div>
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
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
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
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis dataKey="vms" name="VMs" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "VMs/Host", position: "insideBottom", offset: -5, style: CHART_AXIS_LABEL_STYLE }} />
              <YAxis dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", style: CHART_AXIS_LABEL_STYLE }} />
              <ZAxis dataKey="ramGiB" range={[40, 400]} name="RAM GiB" />
              <Tooltip content={renderHostDensityTooltip} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={hostDensity} fill={CHART_COLORS.primary} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {clusterRiskChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cluster Capacity Risk Score (vHost + vCluster)</h3>
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
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cluster Capacity Health (vHost + vCluster) · Klick öffnet Detailansicht</h3>
          <VirtualTable
            data={clusterCapacity}
            columns={clusterCapacityColumns}
            globalFilter={globalFilter}
            height={340}
            onRowClick={(row) => onOpenClusterDetail(row.cluster)}
          />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cluster Overcommit · Klick öffnet Detailansicht</h3>
        <VirtualTable
          data={clusterMetrics}
          columns={clusterColumns}
          globalFilter={globalFilter}
          height={300}
          onRowClick={(row) => onOpenClusterDetail(row.name)}
        />
      </div>
      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Details</h3><VirtualTable data={datastores} columns={dsColumns} globalFilter={globalFilter} /></div>

      {rpData.length > 0 && (
        <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Resource Pool Pressure ({rpData.length})</h3><VirtualTable data={rpData} columns={rpColumns} globalFilter={globalFilter} height={300} /></div>
      )}

      {thinRiskData.length > 0 && (
        <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Thin-Provisioning Risiko</h3><VirtualTable data={thinRiskData} columns={thinRiskColumns} globalFilter={globalFilter} height={250} /></div>
      )}
    </>
  );
}

const clusterColumns: ColumnDef<ClusterMetric, unknown>[] = [
  { accessorKey: "name", header: "Cluster" },
  { accessorKey: "cpuRatio", header: "vCPU/Core", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 5 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v.toFixed(2)}</span>; }},
  { accessorKey: "ramRatio", header: "RAM Overcommit", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 1.5 ? "text-destructive font-semibold" : v > 1.0 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>; }},
  { accessorKey: "vCpuSum", header: "vCPUs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "cores", header: "Cores", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
];

const rpColumns: ColumnDef<RpRow, unknown>[] = [
  { accessorKey: "name", header: "Resource Pool" },
  { accessorKey: "path", header: "Pfad" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v}</span>; }},
  { accessorKey: "vms", header: "VMs" },
  { accessorKey: "cpuLimit", header: "CPU Limit" },
  { accessorKey: "cpuReservation", header: "CPU Res. MHz" },
  { accessorKey: "cpuExpandable", header: "CPU Expand.", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "memLimit", header: "Mem Limit" },
  { accessorKey: "memReservation", header: "Mem Res. MiB" },
  { accessorKey: "memExpandable", header: "Mem Expand.", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const thinRiskColumns: ColumnDef<ThinRiskRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore" },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
  { accessorKey: "thinDisks", header: "Thin Disks" },
  { accessorKey: "totalThinMiB", header: "Thin Kapaz.", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const clusterCapacityColumns: ColumnDef<ClusterCapacityRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "datacenter", header: "Datacenter" },
  { accessorKey: "risk", header: "Risiko", cell: ({ row }) => {
    const risk = row.original.risk;
    const score = row.original.riskScore;
    return <span className={risk === "hoch" ? "text-destructive font-semibold" : risk === "mittel" ? "text-warning font-semibold" : "text-success"}>{risk} ({score})</span>;
  }},
  { accessorKey: "hosts", header: "Hosts" },
  { accessorKey: "totalCores", header: "Cores" },
  { accessorKey: "totalVms", header: "VMs" },
  { accessorKey: "cpuUsagePct", header: "CPU %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 85 ? "text-destructive font-semibold" : v > 75 ? "text-warning" : "text-success"}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "memoryUsagePct", header: "RAM %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 90 ? "text-destructive font-semibold" : v > 80 ? "text-warning" : "text-success"}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 6 ? "text-destructive font-semibold" : v > 4 ? "text-warning" : ""}>{v.toFixed(2)}</span>;
  }},
  { accessorKey: "ramCommitPct", header: "RAM Commit %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 180 ? "text-destructive font-semibold" : v > 140 ? "text-warning" : ""}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "ramActivePct", header: "RAM Active %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 90 ? "text-destructive font-semibold" : v > 80 ? "text-warning" : ""}>{v.toFixed(1)}%</span>;
  }},
  { accessorKey: "swapBalloonPct", header: "Swap+Balloon %", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v > 5 ? "text-destructive font-semibold" : v > 2 ? "text-warning" : "text-success"}>{v.toFixed(2)}%</span>;
  }},
  { accessorKey: "hotHosts", header: "Hot Hosts", cell: ({ row }) => {
    const hotHosts = row.original.hotHosts;
    const hosts = row.original.hosts || 1;
    return `${hotHosts}/${hosts}`;
  }},
  { accessorKey: "drsEnabled", header: "DRS", cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    if (v === null) return "—";
    return <span className={v ? "text-success" : "text-warning"}>{v ? "An" : "Aus"}</span>;
  }},
  { accessorKey: "haEnabled", header: "HA", cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    if (v === null) return "—";
    return <span className={v ? "text-success" : "text-muted-foreground"}>{v ? "An" : "Aus"}</span>;
  }},
  { accessorKey: "clusterHostDelta", header: "Δ Hosts", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    return <span className={v !== 0 ? "text-warning font-semibold" : "text-success"}>{v > 0 ? `+${v}` : v}</span>;
  }},
  { accessorKey: "clusterMemoryDeltaPct", header: "Δ RAM %", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    const abs = Math.abs(v);
    return <span className={abs > 5 ? "text-warning font-semibold" : "text-success"}>{v > 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`}</span>;
  }},
];

function useCapacityPageData() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: datastores = [] } = useDatastores();
  const { data: hosts = [] } = useHosts();
  const { data: rawVHost = [] } = useRawSheet("vHost");
  const { data: rawRP = [] } = useRawSheet("vRP");
  const { data: rawDisks = [] } = useRawSheet("vDisk");
  const [selectedClusterName, setSelectedClusterName] = useState<string | null>(null);

  const openClusterDetail = (clusterName: string | null | undefined) => {
    const normalized = (clusterName || "").trim();
    if (normalized) setSelectedClusterName(normalized);
  };

  const avgFreePct = useMemo(() => {
    const withPct = datastores.filter((d) => d.freePct !== null);
    if (!withPct.length) return null;
    return withPct.reduce((s, d) => s + d.freePct!, 0) / withPct.length;
  }, [datastores]);

  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;
  const warnDs = datastores.filter((d) => d.freePct !== null && d.freePct >= 10 && d.freePct < 20).length;

  const clusterMetrics = useMemo<ClusterMetric[]>(() => {
    return clusters.map((c) => {
      const clusterVms = vms.filter((v) => v.cluster === c.name && v.powerState === "poweredOn");
      const totalCoresFromHosts = hosts
        .filter((h) => h.cluster === c.name)
        .reduce((sum, h) => sum + (h.cpuCores || 0), 0);
      const totalCores = totalCoresFromHosts > 0 ? totalCoresFromHosts : (c.numCpuCores || 0);
      const vCpuSum = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const ramAllocMiB = clusterVms.reduce((s, v) => s + (v.memoryMiB || 0), 0);
      const cpuRatio = totalCores > 0 ? vCpuSum / totalCores : 0;
      const ramRatio = c.totalMemoryMiB ? ramAllocMiB / c.totalMemoryMiB : 0;
      return { name: c.name, cpuRatio: Math.round(cpuRatio * 100) / 100, ramRatio: Math.round(ramRatio * 100) / 100, vCpuSum, cores: totalCores, ramAllocGiB: ramAllocMiB / 1024, ramTotalGiB: (c.totalMemoryMiB || 0) / 1024 };
    }).sort((a, b) => b.cpuRatio - a.cpuRatio);
  }, [clusters, hosts, vms]);

  const hostDensity = useMemo<HostDensityPoint[]>(() => {
    return hosts.map((h) => {
      const hostVms = vms.filter((v) => v.host === h.host && v.powerState === "poweredOn");
      const vCpuSum = hostVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      return { name: h.host, vms: hostVms.length, vcpuPerCore: h.cpuCores ? Math.round((vCpuSum / h.cpuCores) * 100) / 100 : 0, ramGiB: Math.round((h.memoryTotalMiB || 0) / 1024) };
    }).filter((h) => h.vms > 0);
  }, [hosts, vms]);

  const renderHostDensityTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: HostDensityPoint }>;
  }) => {
    if (!active || !payload?.length || !payload[0]?.payload) return null;
    const point = payload[0].payload;
    return (
      <div style={CHART_TOOLTIP_STYLE}>
        <p style={CHART_TOOLTIP_LABEL_STYLE}>Host: {point.name}</p>
        <p style={CHART_TOOLTIP_ITEM_STYLE}>VMs: {formatNum(point.vms)}</p>
        <p style={CHART_TOOLTIP_ITEM_STYLE}>vCPU/Core: {point.vcpuPerCore.toFixed(2)}</p>
        <p style={CHART_TOOLTIP_ITEM_STYLE}>RAM: {formatNum(point.ramGiB)} GiB</p>
      </div>
    );
  };

  const clusterCapacity = useMemo<ClusterCapacityRow[]>(() => {
    const grouped = new Map<string, {
      snapshotId: string;
      cluster: string;
      datacenter: string;
      hosts: number;
      totalCores: number;
      totalMemoryMiB: number;
      totalVms: number;
      totalVcpus: number;
      totalVRamMiB: number;
      totalVmUsedMiB: number;
      totalSwapBalloonMiB: number;
      weightedCpuUsage: number;
      weightedMemUsage: number;
      cpuWeight: number;
      memWeight: number;
      hotHosts: number;
      htInactiveHosts: number;
      cpuMin: number;
      cpuMax: number;
      memMin: number;
      memMax: number;
    }>();

    for (const r of rawVHost) {
      const d = r.data;
      const clusterName = String(d["Cluster"] || "").trim();
      const hostName = String(d["Host"] || "").trim();
      if (!clusterName || !hostName) continue;
      const key = `${r.snapshotId}::${clusterName}`;
      const cpuCores = toNumLoose(d["# Cores"]);
      const memMiB = toNumLoose(d["# Memory"]);
      const cpuUsagePct = toNumLoose(d["CPU usage %"]);
      const memUsagePct = toNumLoose(d["Memory usage %"]);
      const vms = toNumLoose(d["# VMs"]);
      const vcpus = toNumLoose(d["# vCPUs"]);
      const vRamMiB = toNumLoose(d["vRAM"]);
      const vmUsedMiB = toNumLoose(d["VM Used memory"]);
      const vmSwappedMiB = toNumLoose(d["VM Memory Swapped"]);
      const vmBalloonedMiB = toNumLoose(d["VM Memory Ballooned"]);
      const htAvailable = toBoolLoose(d["HT Available"]);
      const htActive = toBoolLoose(d["HT Active"]);

      if (!grouped.has(key)) {
        grouped.set(key, {
          snapshotId: r.snapshotId,
          cluster: clusterName,
          datacenter: String(d["Datacenter"] || "").trim(),
          hosts: 0,
          totalCores: 0,
          totalMemoryMiB: 0,
          totalVms: 0,
          totalVcpus: 0,
          totalVRamMiB: 0,
          totalVmUsedMiB: 0,
          totalSwapBalloonMiB: 0,
          weightedCpuUsage: 0,
          weightedMemUsage: 0,
          cpuWeight: 0,
          memWeight: 0,
          hotHosts: 0,
          htInactiveHosts: 0,
          cpuMin: Number.POSITIVE_INFINITY,
          cpuMax: Number.NEGATIVE_INFINITY,
          memMin: Number.POSITIVE_INFINITY,
          memMax: Number.NEGATIVE_INFINITY,
        });
      }

      const e = grouped.get(key)!;
      e.hosts += 1;
      e.totalCores += cpuCores;
      e.totalMemoryMiB += memMiB;
      e.totalVms += vms;
      e.totalVcpus += vcpus;
      e.totalVRamMiB += vRamMiB;
      e.totalVmUsedMiB += vmUsedMiB;
      e.totalSwapBalloonMiB += vmSwappedMiB + vmBalloonedMiB;

      const cpuWeight = cpuCores > 0 ? cpuCores : 1;
      const memWeight = memMiB > 0 ? memMiB : 1;
      e.weightedCpuUsage += cpuUsagePct * cpuWeight;
      e.weightedMemUsage += memUsagePct * memWeight;
      e.cpuWeight += cpuWeight;
      e.memWeight += memWeight;

      if (cpuUsagePct > 60 || memUsagePct > 75) e.hotHosts += 1;
      if (htAvailable && !htActive) e.htInactiveHosts += 1;
      e.cpuMin = Math.min(e.cpuMin, cpuUsagePct);
      e.cpuMax = Math.max(e.cpuMax, cpuUsagePct);
      e.memMin = Math.min(e.memMin, memUsagePct);
      e.memMax = Math.max(e.memMax, memUsagePct);
    }

    const clusterMap = new Map(clusters.map((c) => [`${c.snapshotId}::${c.name}`, c]));
    return [...grouped.values()].map((g) => {
      const clusterRef = clusterMap.get(`${g.snapshotId}::${g.cluster}`);
      const cpuUsagePct = g.cpuWeight > 0 ? g.weightedCpuUsage / g.cpuWeight : 0;
      const memoryUsagePct = g.memWeight > 0 ? g.weightedMemUsage / g.memWeight : 0;
      const vcpuPerCore = g.totalCores > 0 ? g.totalVcpus / g.totalCores : 0;
      const ramCommitPct = g.totalMemoryMiB > 0 ? (g.totalVRamMiB / g.totalMemoryMiB) * 100 : 0;
      const ramActivePct = g.totalMemoryMiB > 0 ? (g.totalVmUsedMiB / g.totalMemoryMiB) * 100 : 0;
      const swapBalloonPct = g.totalMemoryMiB > 0 ? (g.totalSwapBalloonMiB / g.totalMemoryMiB) * 100 : 0;
      const cpuSpread = Number.isFinite(g.cpuMin) && Number.isFinite(g.cpuMax) ? g.cpuMax - g.cpuMin : 0;
      const memorySpread = Number.isFinite(g.memMin) && Number.isFinite(g.memMax) ? g.memMax - g.memMin : 0;
      const clusterHostDelta = clusterRef?.numHosts !== null && clusterRef?.numHosts !== undefined ? g.hosts - clusterRef.numHosts : null;
      const clusterMemoryDeltaPct = clusterRef?.totalMemoryMiB ? ((g.totalMemoryMiB - clusterRef.totalMemoryMiB) / clusterRef.totalMemoryMiB) * 100 : null;

      let riskScore = 0;
      if (cpuUsagePct > 85) riskScore += 25;
      else if (cpuUsagePct > 75) riskScore += 12;
      if (memoryUsagePct > 90) riskScore += 25;
      else if (memoryUsagePct > 80) riskScore += 12;
      if (vcpuPerCore > 6) riskScore += 20;
      else if (vcpuPerCore > 4) riskScore += 10;
      if (ramCommitPct > 180) riskScore += 15;
      else if (ramCommitPct > 140) riskScore += 8;
      if (swapBalloonPct > 5) riskScore += 20;
      else if (swapBalloonPct > 2) riskScore += 10;
      const hotRatio = g.hosts > 0 ? g.hotHosts / g.hosts : 0;
      if (hotRatio > 0.5) riskScore += 10;
      else if (hotRatio > 0.3) riskScore += 5;
      if (clusterRef?.drsEnabled === false && (cpuSpread > 30 || memorySpread > 30)) riskScore += 8;
      if (g.htInactiveHosts > 0) riskScore += 5;
      if (clusterHostDelta !== null && clusterHostDelta !== 0) riskScore += 3;
      if (clusterMemoryDeltaPct !== null && Math.abs(clusterMemoryDeltaPct) > 5) riskScore += 3;

      const risk: ClusterCapacityRow["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";
      return {
        cluster: g.cluster,
        datacenter: g.datacenter || "—",
        hosts: g.hosts,
        totalCores: g.totalCores,
        totalMemoryMiB: g.totalMemoryMiB,
        totalVms: g.totalVms,
        totalVcpus: g.totalVcpus,
        cpuUsagePct: Math.round(cpuUsagePct * 10) / 10,
        memoryUsagePct: Math.round(memoryUsagePct * 10) / 10,
        vcpuPerCore: Math.round(vcpuPerCore * 100) / 100,
        ramCommitPct: Math.round(ramCommitPct * 10) / 10,
        ramActivePct: Math.round(ramActivePct * 10) / 10,
        swapBalloonPct: Math.round(swapBalloonPct * 100) / 100,
        hotHosts: g.hotHosts,
        cpuSpread: Math.round(cpuSpread * 10) / 10,
        memorySpread: Math.round(memorySpread * 10) / 10,
        drsEnabled: clusterRef?.drsEnabled ?? null,
        haEnabled: clusterRef?.haEnabled ?? null,
        clusterHostDelta,
        clusterMemoryDeltaPct: clusterMemoryDeltaPct === null ? null : Math.round(clusterMemoryDeltaPct * 10) / 10,
        riskScore,
        risk,
      };
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

  // Thin-Provisioning Risk per Datastore
  const thinRiskData = useMemo<ThinRiskRow[]>(() => {
    const dsMap = new Map<string, { freePct: number; thinDisks: number; totalThinMiB: number }>();
    for (const ds of datastores) {
      if (ds.freePct !== null) dsMap.set(ds.name, { freePct: ds.freePct, thinDisks: 0, totalThinMiB: 0 });
    }
    // We don't have DS name on vDisk directly, but we can count thin disks globally
    for (const r of rawDisks) {
      const thin = String(r.data["Thin"] || "").toLowerCase() === "true";
      if (thin) {
        // Count globally for now
        const cap = Number(r.data["Capacity MiB"] || 0);
        // Associate with first matching DS or create bucket
        const key = "__global__";
        if (!dsMap.has(key)) dsMap.set(key, { freePct: 0, thinDisks: 0, totalThinMiB: 0 });
        const e = dsMap.get(key)!;
        e.thinDisks++;
        e.totalThinMiB += cap;
      }
    }
    return [...dsMap.entries()]
      .filter(([, v]) => v.thinDisks > 0 || v.freePct < 20)
      .map(([name, v]) => {
        let risk = "niedrig";
        if (v.freePct < 20 && v.thinDisks > 0) risk = "mittel";
        if (v.freePct < 10 && v.thinDisks > 5) risk = "hoch";
        return { datastore: name, ...v, risk };
      })
      .filter((r) => r.risk !== "niedrig" || r.thinDisks > 0)
      .sort((a, b) => a.freePct - b.freePct);
  }, [datastores, rawDisks]);

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

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Capacity</h1><EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Capacity</h1>
      <FilterBar />
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
