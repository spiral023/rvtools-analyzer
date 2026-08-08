import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, Clock, Gauge, HelpCircle, Layers, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { SearchScopeNotice } from "@/components/dashboard/SearchScopeNotice";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DemandCell } from "@/components/vm/DemandCell";
import { VmWeekProfileSparkline } from "@/components/vm/VmWeekProfileSparkline";
import { WorkloadTrendBadge } from "@/components/vm/WorkloadTrendBadge";
import { UtilizationPercentCell, WorkloadIntensityBadge, WorkloadShapeBadge } from "@/components/vm/WorkloadBadges";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmWorkloadIntensity, VmWorkloadProfile, VmWorkloadShape } from "@/domain/models/types";
import { filterVmWorkloadProfilesBySearch, VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL, VM_WORKLOAD_TREND_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { average } from "@/lib/statistics";
import { normalizeVmName } from "@/lib/globalFilter";
import { filterByVmScope } from "@/lib/vmScope";
import { buildTechInfoSearchIndex, normalizeVmSearchTerm } from "@/lib/vmSearch";
import { shortHostName } from "@/lib/utils";
import { VM_WORKLOAD_SHAPE_CHART_COLOR } from "@/lib/workloadShapeColors";
import { VM_PROFILE_COLUMNS, VM_PROFILE_KPI, VM_PROFILE_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const SHAPE_ORDER: VmWorkloadShape[] = ["constant", "business-hours", "night-batch", "weekend", "bursty", "variable", "irregular", "unclassified"];
/** Aufsteigend nach Auslastung, damit die Achse als Skala lesbar bleibt. */
const INTENSITY_ORDER: VmWorkloadIntensity[] = ["idle", "very-low", "low", "moderate", "elevated", "high", "unknown"];
const CLASSIFIABLE_SHAPE_ORDER = SHAPE_ORDER.filter((shape) => shape !== "unclassified");
const CLASSIFIABLE_INTENSITY_ORDER = INTENSITY_ORDER.filter((intensity) => intensity !== "unknown");

function formatPercent(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

function confidenceBadgeVariant(confidence: VmWorkloadProfile["confidence"]): "default" | "secondary" | "destructive" {
  if (confidence === "high") return "default";
  if (confidence === "not-computable") return "destructive";
  return "secondary";
}

function notComputableReason(profile: VmWorkloadProfile): string {
  if (profile.demand.sampleCount === 0) return "Keine verwertbaren CPU-Demand-Messwerte im Import.";
  const reasons: string[] = [];
  if (profile.shape === "unclassified") {
    reasons.push(`Datenabdeckung ${formatPercent(profile.demand.coverageRatio * 100, 0)} reicht für ein Lastmuster nicht aus.`);
  }
  if (profile.intensity === "unknown") {
    reasons.push(profile.configuredCpuCapacityMHz === null
      ? "Konfigurierte CPU-Kapazität fehlt; das Niveau kann nicht als Prozentwert berechnet werden."
      : "Das Niveau wird ohne belastbares Lastmuster nicht abgeleitet.");
  }
  return reasons.join(" ") || "Lastmuster oder Niveau konnten nicht berechnet werden.";
}

const CONFIDENCE_LABEL: Record<VmWorkloadProfile["confidence"], string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };

export function VmWorkloadProfilePanel() {
  const { imports, profiles: allProfiles, isLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { vms: scopedVms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);

  // Die Tech-Info-Zuordnung wird über den vollständigen Bestand geladen, damit eine
  // Suche nach Systemverantwortlichen oder Abteilungen nicht schon vor der Zuordnung leerläuft.
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(allProfiles.map((profile) => profile.vmName));
  const techInfoIndex = useMemo(() => buildTechInfoSearchIndex(techInfoLatest), [techInfoLatest]);

  // Der globale VM-Scope (nur eingeschaltete VMs, vCLS-/Dummy-Ausschluss, VM-Namensliste) wirkt
  // auf dem RVTools-Inventar. Die Profile stammen aus dem vROps-Import und müssen deshalb – wie im
  // Rightsizing-Tab – über den RVTools-Schlüssel gegen den bereits gefilterten Bestand gejoint
  // werden; ohne diesen Schritt bliebe der Scope in diesem Tab wirkungslos.
  const scopedProfiles = useMemo(() => filterByVmScope(allProfiles, scopedVms), [allProfiles, scopedVms]);

  // Die Textsuche schränkt den gesamten Tab ein, nicht nur die Tabelle: KPI-Kacheln und
  // Verteilungsdiagramme leiten sich aus derselben gefilterten Liste ab.
  const searchQuery = normalizeVmSearchTerm(filters.search.trim());
  const profiles = useMemo(
    () => filterVmWorkloadProfilesBySearch(scopedProfiles, searchQuery, techInfoIndex),
    [scopedProfiles, searchQuery, techInfoIndex],
  );
  const uncomputableProfiles = useMemo(
    () => profiles.filter((profile) => profile.shape === "unclassified" || profile.intensity === "unknown"),
    [profiles],
  );
  const classifiableProfiles = useMemo(
    () => profiles.filter((profile) => profile.shape !== "unclassified" && profile.intensity !== "unknown"),
    [profiles],
  );
  const [visibleProfileCount, setVisibleProfileCount] = useState(classifiableProfiles.length);

  const shapeDistribution = useMemo(() => {
    const counts = new Map<VmWorkloadShape, number>();
    for (const profile of classifiableProfiles) counts.set(profile.shape, (counts.get(profile.shape) ?? 0) + 1);
    return CLASSIFIABLE_SHAPE_ORDER.map((shape) => ({ key: shape, label: VM_WORKLOAD_SHAPE_LABEL[shape], count: counts.get(shape) ?? 0, color: VM_WORKLOAD_SHAPE_CHART_COLOR[shape] }));
  }, [classifiableProfiles]);

  const intensityDistribution = useMemo(() => {
    const counts = new Map<VmWorkloadIntensity, number>();
    for (const profile of classifiableProfiles) counts.set(profile.intensity, (counts.get(profile.intensity) ?? 0) + 1);
    return CLASSIFIABLE_INTENSITY_ORDER.map((intensity) => ({ key: intensity, label: VM_WORKLOAD_INTENSITY_LABEL[intensity], count: counts.get(intensity) ?? 0 }));
  }, [classifiableProfiles]);

  const lowConfidenceCount = useMemo(() => profiles.filter((profile) => profile.confidence === "low" || profile.confidence === "not-computable").length, [profiles]);
  const averageCoveragePct = useMemo(() => (average(profiles.map((profile) => profile.demand.coverageRatio)) ?? 0) * 100, [profiles]);
  const idleCount = useMemo(() => profiles.filter((profile) => profile.intensity === "idle").length, [profiles]);
  const highIntensityCount = useMemo(() => profiles.filter((profile) => profile.intensity === "high").length, [profiles]);
  const unclassifiedCount = uncomputableProfiles.length;

  const columns = useMemo<ColumnDef<VmWorkloadProfile, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: VM_PROFILE_COLUMNS.vmName } },
    { accessorKey: "vcpu", header: "vCPU", meta: { info: VM_PROFILE_COLUMNS.vcpu }, cell: ({ getValue }) => formatNum(getValue() as number | null) },
    {
      id: "shape",
      header: "Lastmuster",
      meta: { info: VM_PROFILE_COLUMNS.shape },
      accessorFn: (row) => VM_WORKLOAD_SHAPE_LABEL[row.shape],
      cell: ({ row }) => <WorkloadShapeBadge shape={row.original.shape} />,
    },
    {
      id: "intensity",
      header: "Niveau",
      meta: { info: VM_PROFILE_COLUMNS.intensity },
      // Nach der Skalenreihenfolge sortieren, nicht alphabetisch nach Label.
      accessorFn: (row) => INTENSITY_ORDER.indexOf(row.intensity),
      cell: ({ row }) => <WorkloadIntensityBadge intensity={row.original.intensity} />,
    },
    { id: "trend", header: "Tendenz", meta: { info: VM_PROFILE_COLUMNS.trend, exportValue: (row) => VM_WORKLOAD_TREND_LABEL[row.cpuTrend.direction] }, accessorFn: (row) => row.cpuTrend.direction, cell: ({ row }) => <WorkloadTrendBadge trend={row.original.cpuTrend} compact /> },
    { id: "sparkline", header: "Letzte 7 Tage", enableSorting: false, meta: { info: VM_PROFILE_COLUMNS.sparkline, configurable: false, exportable: false }, cell: ({ row }) => <VmWeekProfileSparkline profile={row.original} /> },
    { id: "average-week", header: "Durchschnittliche Woche", enableSorting: false, meta: { info: VM_PROFILE_COLUMNS.averageWeek, configurable: false, exportable: false }, cell: ({ row }) => <VmWeekProfileSparkline profile={row.original} mode="average" /> },
    { id: "demand", header: "CPU Demand P95", meta: { info: VM_PROFILE_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    { id: "demand-pct", header: "CPU Demand P95 %", meta: { info: VM_PROFILE_COLUMNS.demandP95Pct }, accessorFn: (row) => row.signals.utilizationP95Pct ?? -1, cell: ({ row }) => <UtilizationPercentCell value={row.original.signals.utilizationP95Pct} /> },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={confidenceBadgeVariant(row.original.confidence)}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: VM_PROFILE_COLUMNS.cluster, initiallyVisible: false }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: VM_PROFILE_COLUMNS.sysv, initiallyVisible: false },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysv ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "sysv-department",
      header: "Abteilung",
      meta: { info: VM_PROFILE_COLUMNS.sysvDepartment, initiallyVisible: false },
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysvDepartment ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    { accessorKey: "host", header: "Host", meta: { info: VM_PROFILE_COLUMNS.host, initiallyVisible: false }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? shortHostName(value) : "—"; } },
    { id: "coverage", header: "Abdeckung", meta: { info: VM_PROFILE_COLUMNS.coverage, initiallyVisible: false }, accessorFn: (row) => row.demand.coverageRatio, cell: ({ row }) => formatPercent(row.original.demand.coverageRatio * 100, 0) },
    { id: "ready-p95", header: "Ready P95", meta: { info: VM_PROFILE_COLUMNS.readyP95, initiallyVisible: false }, accessorFn: (row) => row.ready.p95 ?? -1, cell: ({ row }) => { const value = row.original.ready.p95; return <span className={value !== null && value > 5 ? "text-warning font-semibold" : ""}>{formatPercent(value)}</span>; } },
  ], [techInfoIndex]);

  const uncomputableColumns = useMemo<ColumnDef<VmWorkloadProfile, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: VM_PROFILE_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: VM_PROFILE_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { accessorKey: "host", header: "Host", meta: { info: VM_PROFILE_COLUMNS.host }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? shortHostName(value) : "—"; } },
    { id: "coverage", header: "Abdeckung", meta: { info: VM_PROFILE_COLUMNS.coverage }, accessorFn: (row) => row.demand.coverageRatio, cell: ({ row }) => formatPercent(row.original.demand.coverageRatio * 100, 0) },
    {
      id: "missing-classification",
      header: "Grund",
      meta: { info: VM_PROFILE_SECTIONS.uncomputableTable },
      accessorFn: notComputableReason,
      cell: ({ row }) => <span className="block max-w-xl whitespace-normal text-xs leading-5 text-muted-foreground">{notComputableReason(row.original)}</span>,
    },
  ], []);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<Activity className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="VM-Profile benötigen einen vollständig gespeicherten vROps-Zeitreihenimport (VM/Cluster/Host, stündlich). Importiere einen Dateisatz in der Fill-Up-Planung." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        {/* `total` ist der Bestand nach VM-Scope: die Meldung erklärt die Wirkung der Suche,
            nicht die des Scopes. */}
        <SearchScopeNotice search={filters.search} fields="VM, Cluster, Host, Systemverantwortliche:r und Abteilung" matched={profiles.length} total={scopedProfiles.length} />
        <KpiGrid>
          <KpiCard title="VMs mit Profil" value={formatNum(profiles.length)} icon={<Layers className="h-4 w-4" />} info={VM_PROFILE_KPI.profiledVms} />
          <KpiCard title="Ø Datenabdeckung" value={formatPercent(averageCoveragePct, 0)} icon={<Gauge className="h-4 w-4" />} info={VM_PROFILE_KPI.averageCoverage} />
          <KpiCard title="Niedriges Vertrauen" value={formatNum(lowConfidenceCount)} severity={lowConfidenceCount > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} info={VM_PROFILE_KPI.lowConfidence} />
          <KpiCard title="Ruhend (< 2,5 %)" value={formatNum(idleCount)} icon={<Activity className="h-4 w-4" />} info={VM_PROFILE_KPI.idle} />
          <KpiCard title="Hohe Auslastung" value={formatNum(highIntensityCount)} icon={<TrendingUp className="h-4 w-4" />} info={VM_PROFILE_KPI.highIntensity} />
          <KpiCard title="Nicht klassifizierbar" value={formatNum(unclassifiedCount)} severity={unclassifiedCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={VM_PROFILE_KPI.unclassified} />
        </KpiGrid>

        {classifiableProfiles.length > 0 && <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={VM_PROFILE_SECTIONS.distribution} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Verteilung der Lastmuster</h3></InfoTooltip>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={shapeDistribution} layout="vertical">
                <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={130} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>{shapeDistribution.map((entry) => <Cell key={entry.key} fill={entry.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={VM_PROFILE_SECTIONS.intensityDistribution} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Verteilung der Auslastungsniveaus</h3></InfoTooltip>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={intensityDistribution} layout="vertical">
                <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={130} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>{intensityDistribution.map((entry) => <Cell key={entry.key} fill={CHART_COLORS.primary} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>}

        <div>
          <InfoTooltip entry={VM_PROFILE_SECTIONS.table} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM-Profile ({visibleProfileCount})</h3></InfoTooltip>
          {/* Ohne `globalFilter`: die Suche ist bereits auf den Klassifikationsbestand angewandt, damit Kennzahlen, Diagramme und Tabelle denselben Ausschnitt zeigen. */}
          <VirtualTable tableId="vms/workload-profile" columnPicker data={classifiableProfiles} columns={columns} height={500} getRowId={(row: VmWorkloadProfile) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-profile" emptyTitle="Keine berechenbaren VM-Profile" emptyDescription={searchQuery === "" ? "Für den gewählten Import fehlen VMs mit belastbar berechenbarem Lastmuster und Niveau." : "Kein Treffer für die aktuelle Suche in VM-Name, Cluster, Host und Systemverantwortliche:r."} onFilteredCountChange={setVisibleProfileCount} />
        </div>

        {uncomputableProfiles.length > 0 && <div>
          <InfoTooltip entry={VM_PROFILE_SECTIONS.uncomputableTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Nicht berechenbare Profile ({uncomputableProfiles.length})</h3></InfoTooltip>
          <VirtualTable tableId="vms/workload-profile-uncomputable" columnPicker data={uncomputableProfiles} columns={uncomputableColumns} height={280} getRowId={(row: VmWorkloadProfile) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-profile-nicht-berechenbar" emptyTitle="Keine nicht berechenbaren Profile" />
        </div>}
      </>}
      {vmDetailDialog}
    </div>
  );
}
