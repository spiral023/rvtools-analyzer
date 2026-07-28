import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, Clock, Gauge, Layers } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemandCell } from "@/components/vm/DemandCell";
import { useActiveSnapshotIds, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmBehaviorClass, VmWorkloadProfile } from "@/domain/models/types";
import { VM_BEHAVIOR_CLASS_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { average } from "@/lib/statistics";
import { VM_PROFILE_COLUMNS, VM_PROFILE_KPI, VM_PROFILE_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const BEHAVIOR_CLASS_ORDER: VmBehaviorClass[] = ["constant-load", "business-hours", "night-batch", "weekend-load", "bursty", "variable-load", "low-utilization", "irregular", "unclassified"];

function formatPercent(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

function confidenceBadgeVariant(confidence: VmWorkloadProfile["confidence"]): "default" | "secondary" | "destructive" {
  if (confidence === "high") return "default";
  if (confidence === "not-computable") return "destructive";
  return "secondary";
}

const CONFIDENCE_LABEL: Record<VmWorkloadProfile["confidence"], string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };

function Sparkline({ profile }: { profile: VmWorkloadProfile }) {
  const values = profile.hourly.map((point) => point.cpuDemandMHz);
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...finite, 1);
  const width = 120;
  const height = 26;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => `${(index * stepX).toFixed(1)},${(height - (value === null ? 0 : (value / max) * height)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="text-primary" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function VmWorkloadProfilePanel() {
  const [importId, setImportId] = useState<string | null>(null);
  const { imports, selectedImport, profiles, isLoading } = useVmWorkloadProfiles(importId);
  const { filters } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);

  const distribution = useMemo(() => {
    const counts = new Map<VmBehaviorClass, number>();
    for (const profile of profiles) counts.set(profile.behaviorClass, (counts.get(profile.behaviorClass) ?? 0) + 1);
    return BEHAVIOR_CLASS_ORDER.map((behaviorClass) => ({ behaviorClass, label: VM_BEHAVIOR_CLASS_LABEL[behaviorClass], count: counts.get(behaviorClass) ?? 0 }));
  }, [profiles]);

  const lowConfidenceCount = useMemo(() => profiles.filter((profile) => profile.confidence === "low" || profile.confidence === "not-computable").length, [profiles]);
  const averageCoveragePct = useMemo(() => (average(profiles.map((profile) => profile.demand.coverageRatio)) ?? 0) * 100, [profiles]);
  const irregularCount = useMemo(() => profiles.filter((profile) => profile.behaviorClass === "irregular").length, [profiles]);

  const columns = useMemo<ColumnDef<VmWorkloadProfile, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: VM_PROFILE_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: VM_PROFILE_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { accessorKey: "host", header: "Host", meta: { info: VM_PROFILE_COLUMNS.host }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { accessorKey: "vcpu", header: "vCPU", meta: { info: VM_PROFILE_COLUMNS.vcpu }, cell: ({ getValue }) => formatNum(getValue() as number | null) },
    {
      id: "behaviorClass",
      header: "Verhaltensklasse",
      meta: { info: VM_PROFILE_COLUMNS.behaviorClass },
      accessorFn: (row) => VM_BEHAVIOR_CLASS_LABEL[row.behaviorClass],
      cell: ({ row }) => <Badge variant="outline">{VM_BEHAVIOR_CLASS_LABEL[row.original.behaviorClass]}</Badge>,
    },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={confidenceBadgeVariant(row.original.confidence)}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    { id: "coverage", header: "Abdeckung", meta: { info: VM_PROFILE_COLUMNS.coverage }, accessorFn: (row) => row.demand.coverageRatio, cell: ({ row }) => formatPercent(row.original.demand.coverageRatio * 100, 0) },
    { id: "sparkline", header: "7-Tage-Profil", enableSorting: false, meta: { info: VM_PROFILE_COLUMNS.sparkline }, cell: ({ row }) => <Sparkline profile={row.original} /> },
    { id: "demand", header: "CPU Demand P95", meta: { info: VM_PROFILE_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    { id: "ready-p95", header: "Ready P95", meta: { info: VM_PROFILE_COLUMNS.readyP95 }, accessorFn: (row) => row.ready.p95 ?? -1, cell: ({ row }) => { const value = row.original.ready.p95; return <span className={value !== null && value > 5 ? "text-warning font-semibold" : ""}>{formatPercent(value)}</span>; } },
  ], []);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<Activity className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="VM-Profile benötigen einen vollständig gespeicherten vROps-Zeitreihenimport (VM/Cluster/Host, stündlich). Importieren Sie einen Dateisatz in der Fill-Up-Planung." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 px-5 py-4">
        <div className="min-w-[16rem] space-y-1.5">
          <InfoTooltip entry={VM_PROFILE_UI.timeSeriesImport} side="bottom"><Label htmlFor="vm-profile-import" className="w-fit cursor-help text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zeitreihenimport</Label></InfoTooltip>
          <Select value={selectedImport?.id ?? ""} onValueChange={setImportId} disabled={imports.length === 0}>
            <SelectTrigger id="vm-profile-import" aria-label="vROps-Zeitreihenimport auswählen"><SelectValue placeholder="Kein Import ausgewählt" /></SelectTrigger>
            <SelectContent>
              {imports.map((entry) => <SelectItem key={entry.id} value={entry.id}>{new Date(entry.importedAt).toLocaleString("de-DE")} · {entry.expectedSlots} Stunden</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      {isLoading ? <PanelLoadingState /> : <>
        <KpiGrid>
          <KpiCard title="VMs mit Profil" value={formatNum(profiles.length)} icon={<Layers className="h-4 w-4" />} info={VM_PROFILE_KPI.profiledVms} />
          <KpiCard title="Ø Datenabdeckung" value={formatPercent(averageCoveragePct, 0)} icon={<Gauge className="h-4 w-4" />} info={VM_PROFILE_KPI.averageCoverage} />
          <KpiCard title="Niedriges Vertrauen" value={formatNum(lowConfidenceCount)} severity={lowConfidenceCount > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} info={VM_PROFILE_KPI.lowConfidence} />
          <KpiCard title="Unregelmäßig" value={formatNum(irregularCount)} icon={<Activity className="h-4 w-4" />} info={VM_PROFILE_KPI.irregular} />
        </KpiGrid>

        {profiles.length > 0 && <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={VM_PROFILE_SECTIONS.distribution} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Verteilung der Verhaltensklassen</h3></InfoTooltip>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={130} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>{distribution.map((entry) => <Cell key={entry.behaviorClass} fill={CHART_COLORS.primary} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>}

        <div>
          <InfoTooltip entry={VM_PROFILE_SECTIONS.table} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM-Profile ({profiles.length})</h3></InfoTooltip>
          <VirtualTable data={profiles} columns={columns} globalFilter={filters.search} height={500} getRowId={(row) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-profile" emptyTitle="Keine profilierten VMs" emptyDescription="Für den gewählten Import fehlen eindeutig zugeordnete VM-Zeitreihen." />
        </div>
      </>}
      {vmDetailDialog}
    </div>
  );
}
