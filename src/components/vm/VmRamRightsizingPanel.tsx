import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, HelpCircle, MemoryStick } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { SearchScopeNotice } from "@/components/dashboard/SearchScopeNotice";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { RamRightsizingLevelControl } from "@/components/vm/RamRightsizingLevelControl";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useRamRightsizingLevel } from "@/hooks/useRamRightsizingLevel";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmMemoryWorkloadStats, VmRamRightsizingCandidate, VmRamRightsizingDirection } from "@/domain/models/types";
import {
  RAM_RIGHTSIZING_POLICIES,
  buildVmRamRightsizingCandidates,
  filterRamRightsizingCandidatesByVmScope,
  summarizeRamRightsizingByCluster,
  summarizeRamRightsizingByDirection,
} from "@/domain/services/vmRamRightsizingService";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { normalizeVmName } from "@/lib/globalFilter";
import { average } from "@/lib/statistics";
import { buildTechInfoSearchIndex } from "@/lib/vmSearch";
import { RAM_RIGHTSIZING_COLUMNS } from "@/lib/glossaries/workloadIntelligence";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";

function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString("de-DE", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} %`;
}

function formatMemory(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatBytes(value);
}

function formatSignedMemory(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0 MiB";
  return `${value > 0 ? "+" : "−"}${formatBytes(Math.abs(value))}`;
}

function formatStatistic(stats: VmMemoryWorkloadStats | null, statistic: "p95" | "p99" | "p995"): string {
  return formatPercent(stats?.[statistic]);
}

const HIGH_WORKLOAD_THRESHOLD_PCT = 90;

function WorkloadStatisticCell({ stats, statistic }: { stats: VmMemoryWorkloadStats | null; statistic: "p95" | "p99" | "p995" }) {
  const value = stats?.[statistic] ?? null;
  return (
    <span className={value !== null && value >= HIGH_WORKLOAD_THRESHOLD_PCT ? "font-semibold text-destructive" : ""}>
      {formatStatistic(stats, statistic)}
    </span>
  );
}

const CONFIDENCE_LABEL: Record<VmRamRightsizingCandidate["confidence"], string> = {
  high: "hoch",
  medium: "mittel",
  low: "niedrig",
  "not-computable": "nicht berechenbar",
};

const DIRECTION_LABEL: Record<VmRamRightsizingDirection, string> = {
  shrink: "Verkleinern",
  grow: "Vergrößern",
  unchanged: "Unverändert",
  "not-computable": "Nicht berechenbar",
};

function DirectionBadge({ direction }: { direction: VmRamRightsizingDirection }) {
  const icon = direction === "shrink"
    ? <ArrowDown className="size-3" />
    : direction === "grow"
      ? <ArrowUp className="size-3" />
      : direction === "unchanged"
        ? <Check className="size-3" />
        : <HelpCircle className="size-3" />;
  const color = direction === "shrink"
    ? "text-warning"
    : direction === "grow"
      ? "text-destructive"
      : direction === "unchanged"
        ? "text-success"
        : "text-muted-foreground";
  return <span className={`inline-flex items-center gap-1.5 font-medium ${color}`}>{icon}{DIRECTION_LABEL[direction]}</span>;
}

function statisticLabel(statistic: "p95" | "p99" | "p995"): string {
  return statistic === "p995" ? "P99,5" : statistic.toUpperCase();
}

const directionColumns: ColumnDef<ReturnType<typeof summarizeRamRightsizingByDirection>[number], unknown>[] = [
  { accessorKey: "label", header: "Richtung", meta: { info: RAM_RIGHTSIZING_COLUMNS.direction } },
  { accessorKey: "vmCount", header: "VMs", meta: { info: RAM_RIGHTSIZING_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "reclaimableMemoryMiB", header: "Freigebbar", meta: { info: RAM_RIGHTSIZING_COLUMNS.reclaimableMemory, exportUnit: "MiB" }, cell: ({ getValue }) => formatMemory(getValue() as number) },
  { accessorKey: "additionalMemoryMiB", header: "Zusätzlich", meta: { info: RAM_RIGHTSIZING_COLUMNS.additionalMemory, exportUnit: "MiB" }, cell: ({ getValue }) => formatMemory(getValue() as number) },
];

const clusterColumns: ColumnDef<ReturnType<typeof summarizeRamRightsizingByCluster>[number], unknown>[] = [
  { accessorKey: "label", header: "Cluster", meta: { info: RAM_RIGHTSIZING_COLUMNS.cluster } },
  { accessorKey: "vmCount", header: "VMs", meta: { info: RAM_RIGHTSIZING_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "shrinkCount", header: "Shrink", meta: { info: RAM_RIGHTSIZING_COLUMNS.shrinkCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "growCount", header: "Grow", meta: { info: RAM_RIGHTSIZING_COLUMNS.growCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "notComputableCount", header: "Nicht berechenbar", meta: { info: RAM_RIGHTSIZING_COLUMNS.notComputableCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "reclaimableMemoryMiB", header: "Freigebbar", meta: { info: RAM_RIGHTSIZING_COLUMNS.reclaimableMemory, exportUnit: "MiB" }, cell: ({ getValue }) => formatMemory(getValue() as number) },
  { accessorKey: "additionalMemoryMiB", header: "Zusätzlich", meta: { info: RAM_RIGHTSIZING_COLUMNS.additionalMemory, exportUnit: "MiB" }, cell: ({ getValue }) => formatMemory(getValue() as number) },
];

export function VmRamRightsizingPanel() {
  const { level: ramRightsizingLevel } = useRamRightsizingLevel();
  const ramPolicy = RAM_RIGHTSIZING_POLICIES[ramRightsizingLevel];
  const { imports, profiles, selectedImport, hasMemoryWorkloadAvg, hasMemoryWorkloadMax, isLoading: workloadLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { vms: scopedVms, allVms, isLoading: vmsLoading } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const isLoading = workloadLoading || vmsLoading;
  const allCandidates = useMemo(
    () => buildVmRamRightsizingCandidates({
      profiles,
      vms: allVms,
      expectedSlots: selectedImport?.expectedSlots,
      hasMemoryWorkloadMax: hasMemoryWorkloadMax,
      level: ramRightsizingLevel,
    }),
    [allVms, hasMemoryWorkloadMax, profiles, ramRightsizingLevel, selectedImport?.expectedSlots],
  );
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(allCandidates.map((candidate) => candidate.vmName));
  const techInfoIndex = useMemo(() => buildTechInfoSearchIndex(techInfoLatest), [techInfoLatest]);
  const candidates = useMemo(
    () => filterRamRightsizingCandidatesByVmScope(allCandidates, scopedVms),
    [allCandidates, scopedVms],
  );
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(candidates.length);

  const usableCount = useMemo(() => candidates.filter((candidate) => candidate.workloadAvg.presentHours > 0).length, [candidates]);
  const shrinkCandidates = useMemo(() => candidates.filter((candidate) => candidate.direction === "shrink"), [candidates]);
  const growCandidates = useMemo(() => candidates.filter((candidate) => candidate.direction === "grow"), [candidates]);
  const notComputableCount = useMemo(() => candidates.filter((candidate) => candidate.direction === "not-computable").length, [candidates]);
  const reclaimableMemoryMiB = useMemo(() => shrinkCandidates.reduce((sum, candidate) => sum + Math.abs(candidate.deltaMiB ?? 0), 0), [shrinkCandidates]);
  const additionalMemoryMiB = useMemo(() => growCandidates.reduce((sum, candidate) => sum + (candidate.deltaMiB ?? 0), 0), [growCandidates]);
  const directionSummary = useMemo(() => summarizeRamRightsizingByDirection(candidates), [candidates]);
  const clusterSummary = useMemo(() => summarizeRamRightsizingByCluster(candidates), [candidates]);
  const recommendationMix = useMemo(() => [
    { key: "shrink", label: "Verkleinern", value: shrinkCandidates.length, color: CHART_COLORS.warning },
    { key: "grow", label: "Vergrößern", value: growCandidates.length, color: CHART_COLORS.danger },
    { key: "unchanged", label: "Unverändert", value: candidates.filter((candidate) => candidate.direction === "unchanged").length, color: CHART_COLORS.success },
    { key: "not-computable", label: "Nicht berechenbar", value: notComputableCount, color: CHART_COLORS.secondary },
  ].filter((entry) => entry.value > 0), [candidates, growCandidates.length, notComputableCount, shrinkCandidates.length]);
  const workloadChart = useMemo(() => {
    const entries = [
      { key: "avg-p95", label: "Avg P95", values: candidates.map((candidate) => candidate.workloadAvg.p95), color: CHART_COLORS.primary },
      { key: "avg-p99", label: "Avg P99", values: candidates.map((candidate) => candidate.workloadAvg.p99), color: CHART_COLORS.info },
      { key: "peak", label: `Max ${statisticLabel(ramPolicy.peakStatistic)}`, values: candidates.map((candidate) => candidate.workloadMax?.[ramPolicy.peakStatistic] ?? null), color: CHART_COLORS.warning },
    ];
    return entries.flatMap((entry) => {
      const values = entry.values.filter((value): value is number => value !== null && Number.isFinite(value));
      const value = average(values);
      return value === null ? [] : [{ key: entry.key, label: entry.label, value, color: entry.color }];
    });
  }, [candidates, ramPolicy.peakStatistic]);
  const clusterChart = useMemo(
    () => clusterSummary
      .filter((summary) => summary.reclaimableMemoryMiB > 0 || summary.additionalMemoryMiB > 0)
      .slice(0, 12),
    [clusterSummary],
  );

  const candidateColumns = useMemo<ColumnDef<VmRamRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: RAM_RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RAM_RIGHTSIZING_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.sysv },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysv ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "sysv-department",
      header: "Abteilung",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.sysvDepartment },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysvDepartment ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    { id: "configured-memory", header: "RAM aktuell", meta: { info: RAM_RIGHTSIZING_COLUMNS.configuredMemory, exportUnit: "MiB" }, accessorFn: (row) => row.configuredMemoryMiB ?? -1, cell: ({ row }) => formatMemory(row.original.configuredMemoryMiB) },
    { id: "avg-p95", header: "Workload Avg P95", meta: { info: RAM_RIGHTSIZING_COLUMNS.workloadAvgP95, exportUnit: "%" }, accessorFn: (row) => row.workloadAvg.p95 ?? -1, cell: ({ row }) => <WorkloadStatisticCell stats={row.original.workloadAvg} statistic="p95" /> },
    { id: "avg-p99", header: "Workload Avg P99", meta: { info: RAM_RIGHTSIZING_COLUMNS.workloadAvgP99, exportUnit: "%" }, accessorFn: (row) => row.workloadAvg.p99 ?? -1, cell: ({ row }) => <WorkloadStatisticCell stats={row.original.workloadAvg} statistic="p99" /> },
    {
      id: "peak-workload",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.peakWorkload, exportUnit: "%" },
      header: `Peak-Workload Max ${statisticLabel(ramPolicy.peakStatistic)}`,
      accessorFn: (row) => row.workloadMax?.[ramPolicy.peakStatistic] ?? -1,
      cell: ({ row }) => <WorkloadStatisticCell stats={row.original.workloadMax} statistic={ramPolicy.peakStatistic} />,
    },
    { id: "normal-demand", header: "Bedarf normal", meta: { info: RAM_RIGHTSIZING_COLUMNS.normalDemand, exportUnit: "MiB" }, accessorFn: (row) => row.normalDemandRequirementMiB ?? -1, cell: ({ row }) => formatMemory(row.original.normalDemandRequirementMiB) },
    { id: "peak-demand", header: "Bedarf Spitze", meta: { info: RAM_RIGHTSIZING_COLUMNS.peakDemand, exportUnit: "MiB" }, accessorFn: (row) => row.peakRequirementMiB ?? -1, cell: ({ row }) => formatMemory(row.original.peakRequirementMiB) },
    { id: "required-memory", header: "Bedarfsgerecht", meta: { info: RAM_RIGHTSIZING_COLUMNS.requiredMemory, exportUnit: "MiB" }, accessorFn: (row) => row.requiredMemoryMiB ?? -1, cell: ({ row }) => formatMemory(row.original.requiredMemoryMiB) },
    { id: "target-memory", header: "Ziel vor Rundung", meta: { info: RAM_RIGHTSIZING_COLUMNS.targetMemory, exportUnit: "MiB" }, accessorFn: (row) => row.targetMemoryBeforeRoundingMiB ?? -1, cell: ({ row }) => formatMemory(row.original.targetMemoryBeforeRoundingMiB) },
    { id: "recommended-memory", header: "RAM empfohlen", meta: { info: RAM_RIGHTSIZING_COLUMNS.recommendedMemory, exportUnit: "MiB" }, accessorFn: (row) => row.recommendedMemoryMiB ?? -1, cell: ({ row }) => <span className="font-semibold">{formatMemory(row.original.recommendedMemoryMiB)}</span> },
    {
      id: "reclaimable-memory",
      header: "Rückgewinnbar",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.reclaimableMemoryVm, exportUnit: "MiB" },
      accessorFn: (row) => row.direction === "shrink" ? Math.abs(row.deltaMiB ?? 0) : 0,
      cell: ({ row }) => <span className={row.original.direction === "shrink" ? "font-semibold text-warning" : ""}>{row.original.direction === "shrink" ? formatMemory(Math.abs(row.original.deltaMiB ?? 0)) : "—"}</span>,
    },
    {
      id: "additional-memory",
      header: "Zusätzlich",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.additionalMemoryVm, exportUnit: "MiB" },
      accessorFn: (row) => row.direction === "grow" ? Math.max(0, row.deltaMiB ?? 0) : 0,
      cell: ({ row }) => <span className={row.original.direction === "grow" ? "font-semibold text-destructive" : ""}>{row.original.direction === "grow" ? formatMemory(Math.max(0, row.original.deltaMiB ?? 0)) : "—"}</span>,
    },
    {
      id: "delta-memory",
      header: "Delta",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.deltaMemory, exportUnit: "MiB" },
      accessorFn: (row) => row.deltaMiB ?? -1,
      cell: ({ row }) => <span className={row.original.direction === "shrink" ? "font-semibold text-warning" : row.original.direction === "grow" ? "font-semibold text-destructive" : ""}>{formatSignedMemory(row.original.deltaMiB)}</span>,
    },
    { id: "direction", header: "Richtung", meta: { info: RAM_RIGHTSIZING_COLUMNS.direction, exportValue: (row) => DIRECTION_LABEL[row.direction] }, accessorFn: (row) => row.direction, cell: ({ row }) => <DirectionBadge direction={row.original.direction} /> },
    // Der Accessor trägt das Verhältnis 0–1, die Zelle zeigt Prozent: der Export folgt der Anzeige.
    { id: "coverage", header: "Coverage", meta: { info: RAM_RIGHTSIZING_COLUMNS.coverage, exportUnit: "%", exportValue: (row) => row.coverageRatio * 100 }, accessorFn: (row) => row.coverageRatio, cell: ({ row }) => formatPercent(row.original.coverageRatio * 100, 0) },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.confidence, exportValue: (row) => CONFIDENCE_LABEL[row.confidence] },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    {
      id: "reason",
      header: "Begründung",
      meta: { info: RAM_RIGHTSIZING_COLUMNS.reason },
      accessorFn: (row) => row.recommendationReason ?? "",
      cell: ({ row }) => <span className="block max-w-[28rem] whitespace-normal text-xs leading-5 text-muted-foreground">{row.original.recommendationReason ?? "—"}</span>,
    },
  ], [ramPolicy.peakStatistic, techInfoIndex]);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<MemoryStick className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="RAM-Rightsizing benötigt einen vROps-VM-Export mit Memory Workload Avg sowie ein RVTools-Inventar. Importiere zuerst einen passenden Dateisatz." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  if (!hasMemoryWorkloadAvg && !isLoading) {
    return <EmptyState icon={<MemoryStick className="h-6 w-6" />} title="Keine Memory-Workload-Metrik" description="Der ausgewählte vROps-VM-Export enthält noch keine verwertbare Memory|Workload|Avg-Spalte. Ältere CPU-Importe bleiben gültig; nach einem erneuten Import mit der Avg-Reihe wird dieser Tab automatisch berechnet." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        <SearchScopeNotice search={filters.search} fields="VM, Cluster, Host, Betriebssystem, Systemverantwortliche:r und Abteilung" matched={candidates.length} total={allCandidates.length} />
        <KpiGrid>
          <KpiCard title="Verwertbare RAM-Zeitreihe" value={formatNum(usableCount)} subtitle={`von ${formatNum(candidates.length)} VMs`} severity={usableCount > 0 ? "ok" : "warn"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="VMs zur Verkleinerung" value={formatNum(shrinkCandidates.length)} severity={shrinkCandidates.length > 0 ? "warn" : "ok"} icon={<ArrowDown className="h-4 w-4" />} />
          <KpiCard title="Freigebbarer RAM" value={formatMemory(reclaimableMemoryMiB)} severity={reclaimableMemoryMiB > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="VMs zur Vergrößerung" value={formatNum(growCandidates.length)} severity={growCandidates.length > 0 ? "crit" : "ok"} icon={<ArrowUp className="h-4 w-4" />} />
          <KpiCard title="Zusätzlicher RAM" value={formatMemory(additionalMemoryMiB)} severity={additionalMemoryMiB > 0 ? "crit" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="Nicht berechenbare VMs" value={formatNum(notComputableCount)} severity={notComputableCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} />
        </KpiGrid>
        <RamRightsizingLevelControl />

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Memory-Workload-Perzentile</h3>
            <p className="mb-3 text-xs text-muted-foreground">Durchschnitt der VM-Perzentile im aktuellen Filterbereich.</p>
            {workloadChart.length > 0 ? <ResponsiveContainer width="100%" height={250}>
              <BarChart data={workloadChart} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
                <CartesianGrid horizontal={false} {...CHART_GRID_STYLE} />
                <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(value: number) => formatPercent(value, 0)} />
                <YAxis type="category" dataKey="label" width={92} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [formatPercent(value), "VM-Durchschnitt"]} />
                <Bar dataKey="value" name="Workload" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {workloadChart.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer> : <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Keine auswertbaren Workload-Perzentile.</p>}
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Empfehlungswege</h3>
            <p className="mb-3 text-xs text-muted-foreground">Verteilung der RAM-Bewertungen im aktuellen Filterbereich.</p>
            <div className="relative h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={recommendationMix} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
                    {recommendationMix.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [formatNum(value), "VMs"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono-data text-2xl font-semibold">{formatNum(candidates.length)}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">VMs</span>
              </div>
            </div>
            <div className="mt-1 grid gap-1.5 text-xs">
              {recommendationMix.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />{entry.label}</span><span className="font-mono-data text-foreground">{formatNum(entry.value)}</span></div>)}
            </div>
          </div>
        </div>

        {clusterChart.length > 0 ? <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-1 text-sm font-semibold text-muted-foreground">RAM-Differenz je Cluster</h3>
          <p className="mb-3 text-xs text-muted-foreground">Top-Cluster nach freigebbarem oder zusätzlich benötigtem RAM.</p>
          <ResponsiveContainer width="100%" height={Math.max(250, clusterChart.length * 28)}>
            <BarChart data={clusterChart} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
              <CartesianGrid horizontal={false} {...CHART_GRID_STYLE} />
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(value: number) => formatMemory(value)} />
              <YAxis type="category" dataKey="label" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number, name: string) => [formatMemory(value), name]} />
              <Bar dataKey="reclaimableMemoryMiB" name="Rückgewinnbar" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              <Bar dataKey="additionalMemoryMiB" name="Zusätzlich" fill={CHART_COLORS.danger} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">RAM-Empfehlungen nach Richtung</h3>
            <VirtualTable tableId="vms/ram-rightsizing-direction-summary" columnPicker data={directionSummary} columns={directionColumns} height={210} getRowId={(row) => row.key} emptyTitle="Keine Richtungssummen" />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">RAM-Empfehlungen nach Cluster</h3>
            <VirtualTable tableId="vms/ram-rightsizing-cluster-summary" columnPicker data={clusterSummary} columns={clusterColumns} height={210} getRowId={(row) => row.key} emptyTitle="Keine Clustersummen" />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">RAM-Rightsizing je VM ({visibleCandidateCount})</h3>
          <VirtualTable
            tableId="vms/ram-rightsizing-candidates"
            columnPicker
            data={candidates}
            columns={candidateColumns}
            height={520}
            getRowId={(row: VmRamRightsizingCandidate) => row.objectKey}
            onRowClick={openVmDetail}
            exportFileName="vm-ram-rightsizing"
            emptyTitle="Keine RAM-Rightsizing-Zeilen"
            emptyDescription={filters.search.trim() === "" ? "Für den gewählten Import fehlen VMs mit verwertbaren Memory-Workload-Werten." : "Kein Treffer für die aktuellen VM-Filter oder die Suche."}
            onFilteredCountChange={setVisibleCandidateCount}
          />
        </div>
      </>}
      {vmDetailDialog}
    </div>
  );
}
