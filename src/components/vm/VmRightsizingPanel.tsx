import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, Gauge, HelpCircle, Recycle, Server, ShieldQuestion } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DemandCell } from "@/components/vm/DemandCell";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmRightsizingCandidate, VmRightsizingGroupSummary, VmWorkloadIntensity, VmWorkloadShape } from "@/domain/models/types";
import {
  buildVmRightsizingCandidates,
  isNotableRightsizingCandidate,
  summarizeReclaimableVcpuByShape,
  summarizeReclaimableVcpuByCluster,
} from "@/domain/services/vmRightsizingService";
import { VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_KPI, RIGHTSIZING_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

/** Dieselbe Reihenfolge wie im VM-Profile-Tab, damit die Farbzuordnung je Lastmuster app-weit konsistent bleibt. */
const SHAPE_ORDER: VmWorkloadShape[] = ["constant", "constant-with-peak", "business-hours", "night-batch", "weekend", "bursty", "variable", "irregular", "unclassified"];
const shapeColor = (shape: VmWorkloadShape) => SEVERITY_COLORS[SHAPE_ORDER.indexOf(shape) % SEVERITY_COLORS.length];

interface RightsizingScatterPoint {
  objectKey: string;
  vmName: string;
  clusterName: string | null;
  vcpu: number;
  demandPct: number;
  reclaimableVcpu: number;
  shape: VmWorkloadShape;
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatFillUpValue(value, "vCPU");
}

const CONFIDENCE_LABEL: Record<VmRightsizingCandidate["confidence"], string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };

/** Gering nach hoch: grün über gelb nach rot, damit die Auslastung auf einen Blick erkennbar ist. */
const INTENSITY_BADGE_CLASS: Record<VmWorkloadIntensity, string> = {
  idle: "border-success/40 text-success",
  "very-low": "border-success/40 text-success",
  low: "border-success/40 text-success",
  moderate: "border-warning/40 text-warning",
  elevated: "border-warning/40 text-warning",
  high: "border-destructive/40 text-destructive",
  unknown: "border-border text-muted-foreground",
};

function RightsizingScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: RightsizingScatterPoint }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono-data font-semibold text-popover-foreground">{point.vmName}</p>
      <p className="mt-0.5 text-muted-foreground">{point.clusterName ?? "Ohne Cluster"} · {VM_WORKLOAD_SHAPE_LABEL[point.shape]}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 text-muted-foreground">
        <span>Konfiguriert: <strong className="text-popover-foreground">{formatVcpu(point.vcpu)}</strong></span>
        <span>Demand P95: <strong className="text-popover-foreground">{formatPercent(point.demandPct)}</strong></span>
        <span>Rückgewinnbar: <strong className="text-popover-foreground">{formatVcpu(point.reclaimableVcpu)}</strong></span>
      </div>
    </div>
  );
}

const summaryColumns: ColumnDef<VmRightsizingGroupSummary, unknown>[] = [
  { accessorKey: "label", header: "" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "candidateCount", header: "Kandidaten", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "totalVcpu", header: "vCPU gesamt", cell: ({ getValue }) => formatVcpu(getValue() as number) },
  { accessorKey: "reclaimableVcpu", header: "Rückgewinnbar", cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 0 ? "font-semibold text-warning" : "font-medium"}>{formatVcpu(value)}</span>; } },
];

export function VmRightsizingPanel() {
  const { imports, profiles, hosts, isLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);

  const candidates = useMemo(() => buildVmRightsizingCandidates({ profiles, hosts }), [profiles, hosts]);
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(candidates.map((candidate) => candidate.vmName));
  const sysvByVmName = useMemo(() => new Map(techInfoLatest.map((entry) => [entry.vmNameNorm, entry.sysv])), [techInfoLatest]);
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(candidates.length);
  const notableCandidates = useMemo(() => candidates.filter(isNotableRightsizingCandidate), [candidates]);
  const totalReclaimableVcpu = useMemo(() => candidates.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0), [candidates]);
  const manyVcpuLowDemandCount = useMemo(() => candidates.filter((candidate) => candidate.flags.manyVcpuLowDemand).length, [candidates]);
  const highCpuReadyCount = useMemo(() => candidates.filter((candidate) => candidate.flags.highCpuReady).length, [candidates]);
  const withheldRecommendationCount = useMemo(() => candidates.filter((candidate) => candidate.recommendationWithheldReason !== null).length, [candidates]);
  const lowConfidenceCount = useMemo(() => candidates.filter((candidate) => candidate.confidence === "low" || candidate.confidence === "not-computable").length, [candidates]);
  const clusterSummary = useMemo(() => summarizeReclaimableVcpuByCluster(candidates), [candidates]);
  const shapeSummary = useMemo(() => summarizeReclaimableVcpuByShape(candidates), [candidates]);
  const scatterData = useMemo<RightsizingScatterPoint[]>(() => candidates
    .filter((candidate) => candidate.vcpu !== null && candidate.usedVcpuEquivalentP95 !== null)
    .map((candidate) => ({
      objectKey: candidate.objectKey,
      vmName: candidate.vmName,
      clusterName: candidate.clusterName,
      vcpu: candidate.vcpu as number,
      demandPct: ((candidate.usedVcpuEquivalentP95 as number) / (candidate.vcpu as number)) * 100,
      reclaimableVcpu: candidate.reclaimableVcpu ?? 0,
      shape: candidate.shape,
    })), [candidates]);

  const candidateColumns = useMemo<ColumnDef<VmRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RIGHTSIZING_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: RIGHTSIZING_COLUMNS.sysv },
      accessorFn: (row) => sysvByVmName.get(row.vmName.trim().toLowerCase()) ?? null,
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
      accessorFn: (row) => VM_WORKLOAD_INTENSITY_LABEL[row.intensity],
      cell: ({ row }) => <Badge variant="outline" className={INTENSITY_BADGE_CLASS[row.original.intensity]}>{VM_WORKLOAD_INTENSITY_LABEL[row.original.intensity]}</Badge>,
    },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    {
      id: "demand-pct",
      header: "CPU Demand P95 %",
      meta: { info: RIGHTSIZING_COLUMNS.demandP95Pct },
      accessorFn: (row) => (row.usedVcpuEquivalentP95 !== null && row.vcpu ? (row.usedVcpuEquivalentP95 / row.vcpu) * 100 : -1),
      cell: ({ row }) => { const { usedVcpuEquivalentP95, vcpu } = row.original; return formatPercent(usedVcpuEquivalentP95 !== null && vcpu ? (usedVcpuEquivalentP95 / vcpu) * 100 : null); },
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
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    {
      id: "flags",
      header: "Auffällig",
      accessorFn: (row) => Number(row.flags.manyVcpuLowDemand) + Number(row.flags.highCpuReady),
      cell: ({ row }) => {
        const labels = [row.original.flags.manyVcpuLowDemand ? "Viele vCPU, geringer Bedarf" : null, row.original.flags.highCpuReady ? "Ready hoch" : null].filter(Boolean);
        return labels.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-xs text-warning">{labels.join(", ")}</span>;
      },
    },
  ], [sysvByVmName]);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<Recycle className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="Rightsizing-Kandidaten benötigen einen vollständig gespeicherten vROps-Zeitreihenimport. Importieren Sie einen Dateisatz in der Fill-Up-Planung." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        <KpiGrid>
          <KpiCard title="Rightsizing-Kandidaten" value={formatNum(notableCandidates.length)} subtitle={`von ${formatNum(candidates.length)} VMs`} severity={notableCandidates.length > 0 ? "warn" : "ok"} icon={<Recycle className="h-4 w-4" />} info={RIGHTSIZING_KPI.candidateCount} />
          <KpiCard title="Rückgewinnbare vCPU" value={formatVcpu(totalReclaimableVcpu)} icon={<Cpu className="h-4 w-4" />} info={RIGHTSIZING_KPI.reclaimableVcpu} />
          <KpiCard title="Viele vCPU, geringer Bedarf" value={formatNum(manyVcpuLowDemandCount)} severity={manyVcpuLowDemandCount > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={RIGHTSIZING_KPI.manyVcpuLowDemand} />
          <KpiCard title="Auffälliges CPU Ready" value={formatNum(highCpuReadyCount)} severity={highCpuReadyCount > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} info={RIGHTSIZING_KPI.highCpuReady} />
          <KpiCard title="Ohne Empfehlung" value={formatNum(withheldRecommendationCount)} icon={<ShieldQuestion className="h-4 w-4" />} info={RIGHTSIZING_KPI.withheldRecommendation} />
          <KpiCard title="Niedriges Vertrauen" value={formatNum(lowConfidenceCount)} severity={lowConfidenceCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={RIGHTSIZING_KPI.lowConfidence} />
        </KpiGrid>

        {scatterData.length > 0 && <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.scatterChart} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Konfigurierte vCPU vs. CPU Demand P95 %</h3></InfoTooltip>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid {...CHART_GRID_STYLE} />
                <XAxis type="number" dataKey="vcpu" name="Konfigurierte vCPU" tick={CHART_AXIS_STYLE} label={{ value: "Konfigurierte vCPU", position: "insideBottom", offset: -8, ...CHART_AXIS_STYLE }} />
                <YAxis type="number" dataKey="demandPct" name="CPU Demand P95 %" tick={CHART_AXIS_STYLE} label={{ value: "CPU Demand P95 %", angle: -90, position: "insideLeft", ...CHART_AXIS_STYLE }} />
                <ZAxis type="number" dataKey="reclaimableVcpu" range={[40, 320]} name="Rückgewinnbare vCPU" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={(props) => <RightsizingScatterTooltip active={props.active} payload={props.payload as Array<{ payload?: RightsizingScatterPoint }> | undefined} />} />
                <Scatter data={scatterData} name="VMs">
                  {scatterData.map((point) => <Cell key={point.objectKey} fill={shapeColor(point.shape)} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
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
        </div>}

        <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.candidateTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCPU-Vergleich je VM ({visibleCandidateCount})</h3></InfoTooltip>
          <VirtualTable data={candidates} columns={candidateColumns} globalFilter={filters.search} height={480} getRowId={(row: VmRightsizingCandidate) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-rightsizing" emptyTitle="Keine Kandidaten" emptyDescription="Für den gewählten Import fehlen VMs mit konfigurierter vCPU-Anzahl." onFilteredCountChange={setVisibleCandidateCount} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.clusterSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Cluster</h3></InfoTooltip>
            <VirtualTable data={clusterSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.shapeSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Lastmuster</h3></InfoTooltip>
            <VirtualTable data={shapeSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
        </div>
      </>}
      {vmDetailDialog}
    </div>
  );
}
