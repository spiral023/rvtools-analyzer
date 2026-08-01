import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, Recycle, Server, ShieldQuestion, SlidersHorizontal, TriangleAlert, TrendingUp } from "lucide-react";
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
import { UtilizationPercentCell, WorkloadIntensityBadge } from "@/components/vm/WorkloadBadges";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";
import type { VmRightsizingCandidate, VmRightsizingGroupSummary, VmRightsizingGrowthGroupSummary, VmWorkloadShape } from "@/domain/models/types";
import {
  buildVmRightsizingCandidates,
  filterRightsizingCandidatesBySearch,
  isNotableRightsizingCandidate,
  summarizeGrowthCandidatesByResourcePool,
  summarizeReclaimableVcpuByShape,
  summarizeReclaimableVcpuByCluster,
} from "@/domain/services/vmRightsizingService";
import { VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { normalizeVmName } from "@/lib/globalFilter";
import { buildRightsizingDensityGrid } from "@/lib/rightsizingDensity";
import { buildTechInfoSearchIndex, normalizeVmSearchTerm } from "@/lib/vmSearch";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_KPI, RIGHTSIZING_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

/** Dieselbe Reihenfolge wie im VM-Profile-Tab, damit die Farbzuordnung je Lastmuster app-weit konsistent bleibt. */
const SHAPE_ORDER: VmWorkloadShape[] = ["constant", "constant-with-peak", "business-hours", "night-batch", "weekend", "bursty", "variable", "irregular", "unclassified"];
/** Aufsteigend nach Auslastung; die Tabelle sortiert damit nach der Skala statt nach dem Label. */
const INTENSITY_ORDER: VmRightsizingCandidate["intensity"][] = ["idle", "very-low", "low", "moderate", "elevated", "high", "unknown"];
const shapeColor = (shape: VmWorkloadShape) => SEVERITY_COLORS[SHAPE_ORDER.indexOf(shape) % SEVERITY_COLORS.length];

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatFillUpValue(value, "vCPU");
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
];

const summaryColumns: ColumnDef<VmRightsizingGroupSummary, unknown>[] = [
  { accessorKey: "label", header: "" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "candidateCount", header: "Kandidaten", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "totalVcpu", header: "vCPU gesamt", cell: ({ getValue }) => formatVcpu(getValue() as number) },
  { accessorKey: "reclaimableVcpu", header: "Rückgewinnbar", cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 0 ? "font-semibold text-warning" : "font-medium"}>{formatVcpu(value)}</span>; } },
  { accessorKey: "reclaimableVcpuPercent", header: "Rückgewinnbar %", cell: ({ getValue }) => { const value = getValue() as number | null; return <span className={value !== null && value > 0 ? "font-semibold text-warning" : "text-muted-foreground"}>{formatPercent(value)}</span>; } },
];

const growthGroupColumns: ColumnDef<VmRightsizingGrowthGroupSummary, unknown>[] = [
  { accessorKey: "resourcePool", header: "Ressourcenpool" },
  { accessorKey: "vcpu", header: "Ist je VM", cell: ({ getValue }) => formatVcpu(getValue() as number) },
  { id: "shape", header: "Lastmuster", accessorFn: (row) => VM_WORKLOAD_SHAPE_LABEL[row.shape] },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  {
    id: "target-range",
    header: "Ziel je VM",
    accessorFn: (row) => row.recommendedVcpuMin,
    cell: ({ row }) => row.original.recommendedVcpuMin === row.original.recommendedVcpuMax
      ? formatVcpu(row.original.recommendedVcpuMin)
      : `${formatVcpu(row.original.recommendedVcpuMin)}–${formatVcpu(row.original.recommendedVcpuMax)}`,
  },
  { accessorKey: "totalAdditionalVcpu", header: "Zusätzlich", cell: ({ getValue }) => <span className="font-semibold text-destructive">{formatVcpu(getValue() as number)}</span> },
  { accessorKey: "costopUnderLoadCount", header: "mit Co-Stop", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "singleCoreBoundCount", header: "mit Einzelkern", cell: ({ getValue }) => formatNum(getValue() as number) },
];

export function VmRightsizingPanel() {
  const { level: rightsizingLevel } = useCpuRightsizingLevel();
  const { imports, profiles, hosts, isLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const [densitySelection, setDensitySelection] = useState<RightsizingDensitySelection | null>(null);

  const allCandidates = useMemo(
    () => buildVmRightsizingCandidates({ profiles, hosts, level: rightsizingLevel }),
    [hosts, profiles, rightsizingLevel],
  );
  // Bewusst über den vollständigen Bestand: die Zuordnung trägt die Suche nach
  // Systemverantwortlichen und Abteilungen und darf deshalb nicht selbst von ihr abhängen.
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(allCandidates.map((candidate) => candidate.vmName));
  const techInfoIndex = useMemo(() => buildTechInfoSearchIndex(techInfoLatest), [techInfoLatest]);
  const searchQuery = normalizeVmSearchTerm(filters.search.trim());
  const candidates = useMemo(
    () => filterRightsizingCandidatesBySearch(allCandidates, searchQuery, techInfoIndex),
    [allCandidates, searchQuery, techInfoIndex],
  );
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(candidates.length);
  const notableCandidates = useMemo(() => candidates.filter(isNotableRightsizingCandidate), [candidates]);
  const totalConfiguredVcpu = useMemo(() => candidates.reduce((sum, candidate) => sum + (candidate.vcpu ?? 0), 0), [candidates]);
  const totalReclaimableVcpu = useMemo(() => candidates.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0), [candidates]);
  const totalAdditionalVcpu = useMemo(() => candidates.reduce((sum, candidate) => sum + (candidate.additionalVcpu ?? 0), 0), [candidates]);
  const manyVcpuLowDemandCount = useMemo(() => candidates.filter((candidate) => candidate.flags.manyVcpuLowDemand).length, [candidates]);
  const withheldRecommendationCount = useMemo(() => candidates.filter((candidate) => candidate.recommendationWithheldReason !== null).length, [candidates]);
  const recommendationMix = useMemo(() => {
    const shrinkCount = candidates.filter((candidate) => (candidate.reclaimableVcpu ?? 0) > 0).length;
    const growCount = candidates.filter((candidate) => (candidate.additionalVcpu ?? 0) > 0).length;
    return [
      { key: "shrink", label: "Verkleinern", value: shrinkCount, color: CHART_COLORS.success },
      { key: "grow", label: "Vergrößern", value: growCount, color: CHART_COLORS.danger },
      { key: "review", label: "Beibehalten / prüfen", value: candidates.length - shrinkCount - growCount, color: CHART_COLORS.secondary },
    ].filter((entry) => entry.value > 0);
  }, [candidates]);
  const clusterSummary = useMemo(() => summarizeReclaimableVcpuByCluster(candidates), [candidates]);
  const shapeSummary = useMemo(() => summarizeReclaimableVcpuByShape(candidates), [candidates]);
  const densityGrid = useMemo(() => buildRightsizingDensityGrid(candidates), [candidates]);
  const growthGroups = useMemo(() => summarizeGrowthCandidatesByResourcePool(candidates), [candidates]);

  const candidateColumns = useMemo<ColumnDef<VmRightsizingCandidate, unknown>[]>(() => [
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
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu }, cell: ({ getValue }) => formatVcpu(getValue() as number) },
    {
      id: "shape",
      header: "Lastmuster",
      meta: { info: RIGHTSIZING_COLUMNS.shape },
      accessorFn: (row) => VM_WORKLOAD_SHAPE_LABEL[row.shape],
      cell: ({ row }) => <Badge variant="outline">{VM_WORKLOAD_SHAPE_LABEL[row.original.shape]}</Badge>,
    },
    {
      id: "intensity",
      header: "Niveau",
      meta: { info: RIGHTSIZING_COLUMNS.intensity },
      accessorFn: (row) => INTENSITY_ORDER.indexOf(row.intensity),
      cell: ({ row }) => <WorkloadIntensityBadge intensity={row.original.intensity} />,
    },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    {
      id: "demand-pct",
      header: "CPU Demand P95 %",
      meta: { info: RIGHTSIZING_COLUMNS.demandP95Pct },
      accessorFn: (row) => (row.usedVcpuEquivalentP95 !== null && row.vcpu ? (row.usedVcpuEquivalentP95 / row.vcpu) * 100 : -1),
      cell: ({ row }) => { const { usedVcpuEquivalentP95, vcpu } = row.original; return <UtilizationPercentCell value={usedVcpuEquivalentP95 !== null && vcpu ? (usedVcpuEquivalentP95 / vcpu) * 100 : null} />; },
    },
    {
      id: "ready-p95",
      header: "Ready P95",
      meta: { info: RIGHTSIZING_COLUMNS.readyP95 },
      accessorFn: (row) => row.ready.p95 ?? -1,
      cell: ({ row }) => { const value = row.original.ready.p95; return <span className={row.original.flags.highCpuReady ? "text-warning font-semibold" : ""}>{formatPercent(value)}</span>; },
    },
    { id: "used-vcpu", header: "Genutzt (P95)", meta: { info: RIGHTSIZING_COLUMNS.usedVcpuEquivalent }, accessorFn: (row) => row.usedVcpuEquivalentP95 ?? -1, cell: ({ row }) => formatVcpu(row.original.usedVcpuEquivalentP95) },
    { id: "recommended-vcpu", header: "Empfohlen", meta: { info: RIGHTSIZING_COLUMNS.recommendedVcpu }, accessorFn: (row) => row.recommendedVcpu ?? -1, cell: ({ row }) => formatVcpu(row.original.recommendedVcpu) },
    {
      id: "reclaimable-vcpu",
      header: "Rückgewinnbar",
      meta: { info: RIGHTSIZING_COLUMNS.reclaimableVcpu },
      accessorFn: (row) => row.reclaimableVcpu ?? -1,
      cell: ({ row }) => <span className={(row.original.reclaimableVcpu ?? 0) > 0 ? "font-semibold text-warning" : ""}>{formatVcpu(row.original.reclaimableVcpu)}</span>,
    },
    {
      id: "next-step-vcpu",
      header: "Nächster Schritt",
      meta: { info: RIGHTSIZING_COLUMNS.nextReclaimStepVcpu },
      accessorFn: (row) => row.nextReclaimStepVcpu ?? -1,
      cell: ({ row }) => {
        const { nextReclaimStepVcpu, reclaimableVcpu, vcpu } = row.original;
        if (!nextReclaimStepVcpu) return <span className="text-muted-foreground">—</span>;
        // Wo das Ziel in einem Schritt erreichbar ist, wäre die Wiederholung der
        // Rückgabemenge nur Rauschen; interessant ist der Zwischenstand.
        return nextReclaimStepVcpu === reclaimableVcpu
          ? <span>{formatVcpu(nextReclaimStepVcpu)}</span>
          : <span>{formatVcpu(nextReclaimStepVcpu)} <span className="text-xs text-muted-foreground">(auf {formatVcpu((vcpu ?? 0) - nextReclaimStepVcpu)})</span></span>;
      },
    },
    {
      id: "additional-vcpu",
      header: "Zusätzlich",
      meta: { info: RIGHTSIZING_COLUMNS.additionalVcpu },
      accessorFn: (row) => row.additionalVcpu ?? -1,
      cell: ({ row }) => {
        const additional = row.original.additionalVcpu ?? 0;
        return <div className="space-y-1">
          <span className={additional > 0 ? "font-semibold text-destructive" : ""}>{formatVcpu(row.original.additionalVcpu)}</span>
          {additional > 0 && row.original.flags.singleCoreBound
            ? <span className="flex items-center gap-1 text-[10px] font-medium text-warning"><TriangleAlert className="h-3 w-3" /> Einzelkern-Warnung</span>
            : null}
        </div>;
      },
    },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    {
      id: "flags",
      header: "Auffällig",
      accessorFn: (row) => RIGHTSIZING_FLAG_LABELS.filter((entry) => entry.isSet(row)).length,
      cell: ({ row }) => {
        const labels = RIGHTSIZING_FLAG_LABELS.filter((entry) => entry.isSet(row.original)).map((entry) => entry.label);
        return labels.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-xs text-warning">{labels.join(", ")}</span>;
      },
    },
  ], [techInfoIndex]);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<Recycle className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="Rightsizing-Kandidaten benötigen einen vollständig gespeicherten vROps-Zeitreihenimport. Importieren Sie einen Dateisatz in der Fill-Up-Planung." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        <KpiGrid>
          <KpiCard title="Rightsizing-Kandidaten" value={formatNum(notableCandidates.length)} subtitle={`von ${formatNum(candidates.length)} VMs`} severity={notableCandidates.length > 0 ? "warn" : "ok"} icon={<Recycle className="h-4 w-4" />} info={RIGHTSIZING_KPI.candidateCount} />
          <KpiCard title="Konfigurierte vCPU" value={formatVcpu(totalConfiguredVcpu)} icon={<SlidersHorizontal className="h-4 w-4" />} info={RIGHTSIZING_KPI.configuredVcpu} />
          <KpiCard title="Rückgewinnbare vCPU" value={formatVcpu(totalReclaimableVcpu)} icon={<Cpu className="h-4 w-4" />} info={RIGHTSIZING_KPI.reclaimableVcpu} />
          <KpiCard title="Zusätzlich nötige vCPU" value={formatVcpu(totalAdditionalVcpu)} severity={totalAdditionalVcpu > 0 ? "warn" : "ok"} icon={<TrendingUp className="h-4 w-4" />} info={RIGHTSIZING_KPI.additionalVcpu} />
          <KpiCard title="Viele vCPU, geringer Bedarf" value={formatNum(manyVcpuLowDemandCount)} severity={manyVcpuLowDemandCount > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={RIGHTSIZING_KPI.manyVcpuLowDemand} />
          <KpiCard title="Ohne Empfehlung" value={formatNum(withheldRecommendationCount)} icon={<ShieldQuestion className="h-4 w-4" />} info={RIGHTSIZING_KPI.withheldRecommendation} />
        </KpiGrid>
        <CpuRightsizingLevelControl />
        <SearchScopeNotice search={filters.search} fields="VM, Cluster, Systemverantwortliche:r und Abteilung" matched={candidates.length} total={allCandidates.length} />

        {growthGroups.length > 0 ? <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.growthGroups} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Gemeinsam zu prüfende Vergrößerungen</h3></InfoTooltip>
          <div className="mb-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p><span className="font-semibold">Sammelaussage:</span> Gleichartige Grow-Kandidaten desselben Ressourcenpools gemeinsam bewerten. Einzelziele bleiben als Nachweis erhalten; ein gemeinsamer Rollout kann Co-Stop und Scheduling-Breite verstärken.</p>
          </div>
          <VirtualTable tableId="vms/rightsizing-growth-groups" columnPicker data={growthGroups} columns={growthGroupColumns} height={220} getRowId={(row) => row.key} emptyTitle="Keine gemeinsamen Grow-Gruppen" />
        </div> : null}

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
                <Bar dataKey="reclaimableVcpu" radius={[0, 4, 4, 0]}>
                  {shapeSummary.map((entry) => <Cell key={entry.key} fill={shapeColor(entry.key as VmWorkloadShape)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.recommendationMix} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Empfehlungswege</h3></InfoTooltip>
            <div className="relative h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={recommendationMix} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={3} strokeWidth={0}>
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
        </div>}

        <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.candidateTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCPU-Vergleich je VM ({visibleCandidateCount})</h3></InfoTooltip>
          {/* Ohne `globalFilter`: die Suche ist bereits auf `candidates` angewandt, damit Kennzahlen und Tabelle denselben Ausschnitt zeigen. */}
          <VirtualTable tableId="vms/rightsizing-candidates" columnPicker data={candidates} columns={candidateColumns} height={480} getRowId={(row: VmRightsizingCandidate) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-rightsizing" emptyTitle="Keine Kandidaten" emptyDescription={searchQuery === "" ? "Für den gewählten Import fehlen VMs mit konfigurierter vCPU-Anzahl." : "Kein Treffer für die aktuelle Suche in VM-Name, Cluster und Systemverantwortliche:r."} onFilteredCountChange={setVisibleCandidateCount} />
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
      </>}
      <VmRightsizingDensityDialog
        selection={densitySelection}
        candidates={candidates}
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
