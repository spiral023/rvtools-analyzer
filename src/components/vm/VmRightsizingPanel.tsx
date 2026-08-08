import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, HelpCircle, Recycle, Server, ShieldQuestion, SlidersHorizontal, TriangleAlert, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { SearchScopeNotice } from "@/components/dashboard/SearchScopeNotice";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DemandCell } from "@/components/vm/DemandCell";
import { CpuRightsizingLevelControl } from "@/components/vm/CpuRightsizingLevelControl";
import { VmRightsizingDensityDialog } from "@/components/vm/VmRightsizingDensityDialog";
import { VmRightsizingDensityGrid, type RightsizingDensitySelection } from "@/components/vm/VmRightsizingDensityGrid";
import { UtilizationPercentCell, WorkloadIntensityBadge, WorkloadShapeBadge } from "@/components/vm/WorkloadBadges";
import { VmWeekProfileSparkline } from "@/components/vm/VmWeekProfileSparkline";
import { WorkloadTrendBadge } from "@/components/vm/WorkloadTrendBadge";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";
import type { VmRightsizingCandidate, VmRightsizingGroupSummary, VmWorkloadShape } from "@/domain/models/types";
import {
  buildVmRightsizingCandidates,
  filterRightsizingCandidatesBySearch,
  filterRightsizingCandidatesByVmScope,
  isComputableRightsizingCandidate,
  isNotableRightsizingCandidate,
  summarizeReclaimableVcpuByShape,
  summarizeReclaimableVcpuByCluster,
} from "@/domain/services/vmRightsizingService";
import { VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL, VM_WORKLOAD_TREND_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { normalizeVmName } from "@/lib/globalFilter";
import { buildRightsizingDensityGrid } from "@/lib/rightsizingDensity";
import { buildTechInfoSearchIndex, normalizeVmSearchTerm } from "@/lib/vmSearch";
import { VM_WORKLOAD_SHAPE_CHART_COLOR } from "@/lib/workloadShapeColors";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_KPI, RIGHTSIZING_SECTIONS, VM_PROFILE_COLUMNS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

/** Aufsteigend nach Auslastung; die Tabelle sortiert damit nach der Skala statt nach dem Label. */
const INTENSITY_ORDER: VmRightsizingCandidate["intensity"][] = ["idle", "very-low", "low", "moderate", "elevated", "high", "unknown"];

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatFillUpValue(value, "vCPU");
}

function formatUsedVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} vCPUs`;
}

export function RecommendedVcpuCell({ candidate }: { candidate: VmRightsizingCandidate }) {
  const reclaimable = candidate.reclaimableVcpu ?? 0;
  const additional = candidate.additionalVcpu ?? 0;

  return (
    <div className="space-y-1">
      <span className="font-semibold">{formatVcpu(candidate.recommendedVcpu)}</span>
      {reclaimable > 0 && <span className="block text-xs font-medium text-warning">−{formatVcpu(reclaimable)} rückgewinnbar</span>}
      {additional > 0 && <span className="block text-xs font-medium text-destructive">+{formatVcpu(additional)} zusätzlich</span>}
      {additional > 0 && candidate.flags.singleCoreBound
        ? <span className="flex items-center gap-1 text-[10px] font-medium text-warning"><TriangleAlert className="h-3 w-3" /> Einzelkern-Warnung</span>
        : null}
    </div>
  );
}

function notComputableReason(candidate: VmRightsizingCandidate): string {
  const reasons: string[] = [];
  if (candidate.shape === "unclassified") reasons.push("Lastmuster nicht berechenbar");
  if (candidate.intensity === "unknown") reasons.push("Niveau unbekannt");
  return reasons.join(" · ") || "Lastmuster oder Niveau konnten nicht berechnet werden.";
}

const CONFIDENCE_LABEL: Record<VmRightsizingCandidate["confidence"], string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };

/**
 * Kurztexte der Auffälligkeitsspalte. Als Liste statt als Kette von Bedingungen, damit
 * Sortierschlüssel und Anzeige denselben Satz Flags verwenden und ein neues Flag nur an
 * einer Stelle nachgetragen wird.
 */
const RIGHTSIZING_FLAG_LABELS: ReadonlyArray<{ label: string; isSet: (candidate: VmRightsizingCandidate) => boolean }> = [
  { label: "Viele vCPU, geringer Bedarf", isSet: (candidate) => candidate.flags.manyVcpuLowDemand },
  { label: "Ready hoch", isSet: (candidate) => candidate.flags.highCpuReady },
  { label: "Co-Stop unter Last", isSet: (candidate) => candidate.flags.costopUnderLoad },
  { label: "Einzelkern-Engpass", isSet: (candidate) => candidate.flags.singleCoreBound },
  { label: "Last auf wenigen Kernen", isSet: (candidate) => candidate.flags.concentratedOnFewCores },
  { label: "Dauerhaft nahe Kapazität", isSet: (candidate) => candidate.flags.sustainedNearCapacity },
  { label: "CPU-Last steigt", isSet: (candidate) => candidate.flags.risingTrend },
];

/**
 * Die Auffälligkeiten als Text – der Sortierschlüssel der Spalte ist nur ihre Anzahl und
 * taugt im Export nicht: „3“ sagt nicht, worauf zu schauen ist.
 */
function rightsizingFlagText(candidate: VmRightsizingCandidate): string {
  return RIGHTSIZING_FLAG_LABELS.filter((entry) => entry.isSet(candidate)).map((entry) => entry.label).join(", ");
}

const summaryColumns: ColumnDef<VmRightsizingGroupSummary, unknown>[] = [
  { accessorKey: "label", header: "" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "candidateCount", header: "Kandidaten", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "totalVcpu", header: "vCPU gesamt", cell: ({ getValue }) => formatVcpu(getValue() as number) },
  { accessorKey: "reclaimableVcpu", header: "Rückgewinnbar", meta: { exportUnit: "vCPU" }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 0 ? "font-semibold text-warning" : "font-medium"}>{formatVcpu(value)}</span>; } },
  { accessorKey: "reclaimableVcpuPercent", header: "Rückgewinnbar %", cell: ({ getValue }) => { const value = getValue() as number | null; return <span className={value !== null && value > 0 ? "font-semibold text-warning" : "text-muted-foreground"}>{formatPercent(value)}</span>; } },
];

export function VmRightsizingPanel() {
  const { level: rightsizingLevel } = useCpuRightsizingLevel();
  const { imports, profiles, hosts, isLoading: workloadLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { vms: scopedVms, allVms, isLoading: vmsLoading } = useVms();
  const isLoading = workloadLoading || vmsLoading;
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const [densitySelection, setDensitySelection] = useState<RightsizingDensitySelection | null>(null);

  const allCandidates = useMemo(
    () => buildVmRightsizingCandidates({ profiles, hosts, level: rightsizingLevel }),
    [hosts, profiles, rightsizingLevel],
  );
  const profilesByObjectKey = useMemo(
    () => new Map(profiles.map((profile) => [profile.objectKey, profile])),
    [profiles],
  );
  const scopedCandidates = useMemo(
    () => filterRightsizingCandidatesByVmScope(allCandidates, scopedVms),
    [allCandidates, scopedVms],
  );
  // Bewusst über den vollständigen Bestand: die Zuordnung trägt die Suche nach
  // Systemverantwortlichen und Abteilungen und darf deshalb nicht selbst von ihr abhängen.
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(allCandidates.map((candidate) => candidate.vmName));
  const techInfoIndex = useMemo(() => buildTechInfoSearchIndex(techInfoLatest), [techInfoLatest]);
  const searchQuery = normalizeVmSearchTerm(filters.search.trim());
  const candidates = useMemo(
    () => filterRightsizingCandidatesBySearch(scopedCandidates, searchQuery, techInfoIndex),
    [scopedCandidates, searchQuery, techInfoIndex],
  );
  const computableCandidates = useMemo(() => candidates.filter(isComputableRightsizingCandidate), [candidates]);
  const uncomputableCandidates = useMemo(() => candidates.filter((candidate) => !isComputableRightsizingCandidate(candidate)), [candidates]);
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(computableCandidates.length);
  const notableCandidates = useMemo(() => computableCandidates.filter(isNotableRightsizingCandidate), [computableCandidates]);
  const totalConfiguredVcpu = useMemo(() => computableCandidates.reduce((sum, candidate) => sum + (candidate.vcpu ?? 0), 0), [computableCandidates]);
  const totalReclaimableVcpu = useMemo(() => computableCandidates.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0), [computableCandidates]);
  const totalAdditionalVcpu = useMemo(() => computableCandidates.reduce((sum, candidate) => sum + (candidate.additionalVcpu ?? 0), 0), [computableCandidates]);
  const manyVcpuLowDemandCount = useMemo(() => computableCandidates.filter((candidate) => candidate.flags.manyVcpuLowDemand).length, [computableCandidates]);
  const withheldRecommendationCount = useMemo(() => computableCandidates.filter((candidate) => candidate.recommendationWithheldReason !== null).length, [computableCandidates]);
  const recommendationMix = useMemo(() => {
    const shrinkCount = computableCandidates.filter((candidate) => (candidate.reclaimableVcpu ?? 0) > 0).length;
    const growCount = computableCandidates.filter((candidate) => (candidate.additionalVcpu ?? 0) > 0).length;
    return [
      { key: "shrink", label: "Verkleinern", value: shrinkCount, color: CHART_COLORS.success },
      { key: "grow", label: "Vergrößern", value: growCount, color: CHART_COLORS.danger },
      { key: "review", label: "Beibehalten / prüfen", value: computableCandidates.length - shrinkCount - growCount, color: CHART_COLORS.secondary },
    ].filter((entry) => entry.value > 0);
  }, [computableCandidates]);
  const clusterSummary = useMemo(() => summarizeReclaimableVcpuByCluster(computableCandidates), [computableCandidates]);
  const shapeSummary = useMemo(() => summarizeReclaimableVcpuByShape(computableCandidates), [computableCandidates]);
  const densityGrid = useMemo(() => buildRightsizingDensityGrid(computableCandidates), [computableCandidates]);
  const candidateColumns = useMemo<ColumnDef<VmRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu, exportUnit: "vCPU" }, cell: ({ getValue }) => formatVcpu(getValue() as number) },
    { id: "used-vcpu", header: "Genutzt (P95)", meta: { info: RIGHTSIZING_COLUMNS.usedVcpuEquivalent, exportUnit: "vCPU" }, accessorFn: (row) => row.usedVcpuEquivalentP95 ?? -1, cell: ({ row }) => formatUsedVcpu(row.original.usedVcpuEquivalentP95) },
    {
      id: "recommended-vcpu",
      header: "Empfohlen",
      meta: { info: RIGHTSIZING_COLUMNS.recommendedVcpu, exportUnit: "vCPU" },
      accessorFn: (row) => row.recommendedVcpu ?? -1,
      cell: ({ row }) => <RecommendedVcpuCell candidate={row.original} />,
    },
    {
      id: "shape",
      header: "Lastmuster",
      meta: { info: RIGHTSIZING_COLUMNS.shape },
      accessorFn: (row) => VM_WORKLOAD_SHAPE_LABEL[row.shape],
      cell: ({ row }) => <WorkloadShapeBadge shape={row.original.shape} />,
    },
    {
      id: "intensity",
      header: "Niveau",
      meta: { info: RIGHTSIZING_COLUMNS.intensity, exportValue: (row) => VM_WORKLOAD_INTENSITY_LABEL[row.intensity] },
      accessorFn: (row) => INTENSITY_ORDER.indexOf(row.intensity),
      cell: ({ row }) => <WorkloadIntensityBadge intensity={row.original.intensity} />,
    },
    { id: "trend", header: "Tendenz", meta: { info: RIGHTSIZING_COLUMNS.trend, exportValue: (row) => VM_WORKLOAD_TREND_LABEL[row.trend.direction] }, accessorFn: (row) => row.trend.direction, cell: ({ row }) => <WorkloadTrendBadge trend={row.original.trend} compact /> },
    {
      id: "sparkline",
      header: "7-Tage-Profil",
      enableSorting: false,
      meta: { info: VM_PROFILE_COLUMNS.sparkline, configurable: false, exportable: false },
      cell: ({ row }) => {
        const profile = profilesByObjectKey.get(row.original.objectKey);
        return profile ? <VmWeekProfileSparkline profile={profile} /> : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95, exportUnit: "MHz" }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    {
      id: "flags",
      header: "Auffällig",
      meta: { info: RIGHTSIZING_COLUMNS.flags, exportValue: rightsizingFlagText },
      accessorFn: (row) => RIGHTSIZING_FLAG_LABELS.filter((entry) => entry.isSet(row)).length,
      cell: ({ row }) => {
        const labels = RIGHTSIZING_FLAG_LABELS.filter((entry) => entry.isSet(row.original)).map((entry) => entry.label);
        return labels.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-xs text-warning">{labels.join(", ")}</span>;
      },
    },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RIGHTSIZING_COLUMNS.cluster, initiallyVisible: false }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: RIGHTSIZING_COLUMNS.sysv, initiallyVisible: false },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysv ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "sysv-department",
      header: "Abteilung",
      meta: { info: RIGHTSIZING_COLUMNS.sysvDepartment, initiallyVisible: false },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysvDepartment ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "demand-pct",
      header: "CPU Demand P95 %",
      meta: { info: RIGHTSIZING_COLUMNS.demandP95Pct, initiallyVisible: false },
      accessorFn: (row) => (row.usedVcpuEquivalentP95 !== null && row.vcpu ? (row.usedVcpuEquivalentP95 / row.vcpu) * 100 : -1),
      cell: ({ row }) => { const { usedVcpuEquivalentP95, vcpu } = row.original; return <UtilizationPercentCell value={usedVcpuEquivalentP95 !== null && vcpu ? (usedVcpuEquivalentP95 / vcpu) * 100 : null} />; },
    },
    {
      id: "ready-p95",
      header: "Ready P95",
      meta: { info: RIGHTSIZING_COLUMNS.readyP95, initiallyVisible: false, exportUnit: "%" },
      accessorFn: (row) => row.ready.p95 ?? -1,
      cell: ({ row }) => { const value = row.original.ready.p95; return <span className={row.original.flags.highCpuReady ? "text-warning font-semibold" : ""}>{formatPercent(value)}</span>; },
    },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence, initiallyVisible: false, exportValue: (row) => CONFIDENCE_LABEL[row.confidence] },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
  ], [profilesByObjectKey, techInfoIndex]);

  const uncomputableColumns = useMemo<ColumnDef<VmRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RIGHTSIZING_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: RIGHTSIZING_COLUMNS.sysv },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysv ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "sysv-department",
      header: "Abteilung",
      meta: { info: RIGHTSIZING_COLUMNS.sysvDepartment },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysvDepartment ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    { id: "host", header: "Host", meta: { info: RIGHTSIZING_COLUMNS.host }, accessorFn: (row) => row.hostName ?? "", cell: ({ getValue }) => (getValue() as string) || "—" },
    { accessorKey: "powerState", header: "Powerstate", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu, exportUnit: "vCPU" }, cell: ({ getValue }) => formatVcpu(getValue() as number | null) },
    {
      id: "shape",
      header: "Lastmuster",
      meta: { info: RIGHTSIZING_COLUMNS.shape },
      accessorFn: (row) => VM_WORKLOAD_SHAPE_LABEL[row.shape],
      cell: ({ row }) => <WorkloadShapeBadge shape={row.original.shape} />,
    },
    {
      id: "intensity",
      header: "Niveau",
      meta: { info: RIGHTSIZING_COLUMNS.intensity, exportValue: (row) => VM_WORKLOAD_INTENSITY_LABEL[row.intensity] },
      accessorFn: (row) => INTENSITY_ORDER.indexOf(row.intensity),
      cell: ({ row }) => <WorkloadIntensityBadge intensity={row.original.intensity} />,
    },
    // Der Accessor trägt das Verhältnis 0–1, die Zelle zeigt Prozent: der Export folgt der Anzeige.
    { id: "coverage", header: "Abdeckung", meta: { exportUnit: "%", exportValue: (row) => row.demand.coverageRatio * 100 }, accessorFn: (row) => row.demand.coverageRatio, cell: ({ row }) => formatPercent(row.original.demand.coverageRatio * 100) },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence, exportValue: (row) => CONFIDENCE_LABEL[row.confidence] },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    { id: "reason", header: "Grund", accessorFn: notComputableReason, cell: ({ row }) => <span className="block max-w-xl whitespace-normal text-xs leading-5 text-muted-foreground">{notComputableReason(row.original)}</span> },
  ], [techInfoIndex]);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<Recycle className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="Rightsizing-Kandidaten benötigen einen vollständig gespeicherten vROps-Zeitreihenimport. Importiere einen Dateisatz in der Fill-Up-Planung." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        <KpiGrid>
          <KpiCard title="Rightsizing-Kandidaten" value={formatNum(notableCandidates.length)} subtitle={`von ${formatNum(computableCandidates.length)} berechenbaren VMs`} severity={notableCandidates.length > 0 ? "warn" : "ok"} icon={<Recycle className="h-4 w-4" />} info={RIGHTSIZING_KPI.candidateCount} />
          <KpiCard title="Konfigurierte vCPU" value={formatVcpu(totalConfiguredVcpu)} icon={<SlidersHorizontal className="h-4 w-4" />} info={RIGHTSIZING_KPI.configuredVcpu} />
          <KpiCard title="Rückgewinnbare vCPU" value={formatVcpu(totalReclaimableVcpu)} icon={<Cpu className="h-4 w-4" />} info={RIGHTSIZING_KPI.reclaimableVcpu} />
          <KpiCard title="Zusätzlich nötige vCPU" value={formatVcpu(totalAdditionalVcpu)} severity={totalAdditionalVcpu > 0 ? "warn" : "ok"} icon={<TrendingUp className="h-4 w-4" />} info={RIGHTSIZING_KPI.additionalVcpu} />
          <KpiCard title="Viele vCPU, geringer Bedarf" value={formatNum(manyVcpuLowDemandCount)} severity={manyVcpuLowDemandCount > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={RIGHTSIZING_KPI.manyVcpuLowDemand} />
          <KpiCard title="Ohne Empfehlung" value={formatNum(withheldRecommendationCount)} icon={<ShieldQuestion className="h-4 w-4" />} info={RIGHTSIZING_KPI.withheldRecommendation} />
          <KpiCard title="Nicht berechenbare VMs" value={formatNum(uncomputableCandidates.length)} severity={uncomputableCandidates.length > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} />
        </KpiGrid>
        <CpuRightsizingLevelControl />
        <SearchScopeNotice search={filters.search} fields="VM, Cluster, Systemverantwortliche:r und Abteilung" matched={candidates.length} total={allCandidates.length} />

        {densityGrid.vmCount > 0 && <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.densityGrid} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Konfigurierte vCPU vs. CPU Demand P95 %</h3></InfoTooltip>
            <VmRightsizingDensityGrid grid={densityGrid} onCellClick={setDensitySelection} />
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.shapeSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Lastmuster</h3></InfoTooltip>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={shapeSummary} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                <CartesianGrid horizontal={false} {...CHART_GRID_STYLE} />
                <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={140} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [formatVcpu(value), "Rückgewinnbar"]} />
                <Bar dataKey="reclaimableVcpu" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {shapeSummary.map((entry) => <Cell key={entry.key} fill={VM_WORKLOAD_SHAPE_CHART_COLOR[entry.key as VmWorkloadShape]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.recommendationMix} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Empfehlungswege</h3></InfoTooltip>
            <div className="relative h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={recommendationMix} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
                    {recommendationMix.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [formatNum(value), "VMs"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono-data text-2xl font-semibold">{formatNum(computableCandidates.length)}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">VMs</span>
              </div>
            </div>
            <div className="mt-1 grid gap-1.5 text-xs">
              {recommendationMix.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />{entry.label}</span><span className="font-mono-data text-foreground">{formatNum(entry.value)}</span></div>)}
            </div>
          </div>
        </div>}

        <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.candidateTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCPU-Vergleich je berechenbarer VM ({visibleCandidateCount})</h3></InfoTooltip>
          {/* Ohne `globalFilter`: Scope und Suche sind bereits auf `candidates` angewandt, damit Kennzahlen und Tabelle denselben Ausschnitt zeigen. */}
          <VirtualTable tableId="vms/rightsizing-candidates" columnPicker data={computableCandidates} columns={candidateColumns} height={480} getRowId={(row: VmRightsizingCandidate) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-rightsizing" emptyTitle="Keine berechenbaren Kandidaten" emptyDescription={searchQuery === "" ? "Für den gewählten Import fehlen VMs mit berechenbarem Lastmuster und Niveau." : "Kein Treffer für die aktuelle Suche in VM-Name, Cluster und Systemverantwortliche:r."} onFilteredCountChange={setVisibleCandidateCount} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.clusterSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Cluster</h3></InfoTooltip>
            <VirtualTable tableId="vms/rightsizing-cluster-summary" columnPicker data={clusterSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.shapeSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Lastmuster</h3></InfoTooltip>
            <VirtualTable tableId="vms/rightsizing-shape-summary" columnPicker data={shapeSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
        </div>

        {uncomputableCandidates.length > 0 && <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.uncomputableTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Nicht berechenbare VMs · Lastmuster / Niveau ({formatNum(uncomputableCandidates.length)})</h3></InfoTooltip>
          <p className="mb-3 text-xs text-muted-foreground">Diese VMs bleiben außerhalb des vCPU-Vergleichs. Es fehlt entweder ein belastbares Lastmuster oder ein bekanntes Auslastungsniveau.</p>
          <VirtualTable tableId="vms/rightsizing-uncomputable" columnPicker data={uncomputableCandidates} columns={uncomputableColumns} height={300} getRowId={(row: VmRightsizingCandidate) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-rightsizing-nicht-berechenbar" emptyTitle="Keine nicht berechenbaren VMs" />
        </div>}
      </>}
      <VmRightsizingDensityDialog
        selection={densitySelection}
        candidates={computableCandidates}
        techInfoIndex={techInfoIndex}
        onOpenChange={(open) => {
          if (!open) setDensitySelection(null);
        }}
        onOpenVm={openVmDetail}
      />
      {vmDetailDialog}
    </div>
  );
}
