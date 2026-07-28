import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, Gauge, Recycle, Server } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DemandCell } from "@/components/vm/DemandCell";
import { useActiveSnapshotIds, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmRightsizingCandidate, VmRightsizingGroupSummary } from "@/domain/models/types";
import {
  buildVmRightsizingCandidates,
  isNotableRightsizingCandidate,
  summarizeReclaimableVcpuByBehaviorClass,
  summarizeReclaimableVcpuByCluster,
} from "@/domain/services/vmRightsizingService";
import { VM_BEHAVIOR_CLASS_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_KPI, RIGHTSIZING_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { shortHostName } from "@/lib/utils";
import { formatNum } from "@/lib/xlsx/parseHelpers";

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatFillUpValue(value, "vCPU");
}

const CONFIDENCE_LABEL: Record<VmRightsizingCandidate["confidence"], string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };

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
  const notableCandidates = useMemo(() => candidates.filter(isNotableRightsizingCandidate), [candidates]);
  const totalReclaimableVcpu = useMemo(() => candidates.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0), [candidates]);
  const manyVcpuLowDemandCount = useMemo(() => candidates.filter((candidate) => candidate.flags.manyVcpuLowDemand).length, [candidates]);
  const highCpuReadyCount = useMemo(() => candidates.filter((candidate) => candidate.flags.highCpuReady).length, [candidates]);
  const clusterSummary = useMemo(() => summarizeReclaimableVcpuByCluster(candidates), [candidates]);
  const behaviorSummary = useMemo(() => summarizeReclaimableVcpuByBehaviorClass(candidates), [candidates]);

  const candidateColumns = useMemo<ColumnDef<VmRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM", meta: { info: RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RIGHTSIZING_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { accessorKey: "hostName", header: "Host", meta: { info: RIGHTSIZING_COLUMNS.host }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? shortHostName(value) : "—"; } },
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu }, cell: ({ getValue }) => formatVcpu(getValue() as number) },
    {
      id: "behaviorClass",
      header: "Verhaltensklasse",
      meta: { info: RIGHTSIZING_COLUMNS.behaviorClass },
      accessorFn: (row) => VM_BEHAVIOR_CLASS_LABEL[row.behaviorClass],
      cell: ({ row }) => <Badge variant="outline">{VM_BEHAVIOR_CLASS_LABEL[row.original.behaviorClass]}</Badge>,
    },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
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
      enableSorting: false,
      cell: ({ row }) => {
        const labels = [row.original.flags.manyVcpuLowDemand ? "Viele vCPU, geringer Bedarf" : null, row.original.flags.highCpuReady ? "Ready hoch" : null].filter(Boolean);
        return labels.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-xs text-warning">{labels.join(", ")}</span>;
      },
    },
  ], []);

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
        </KpiGrid>

        <div>
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.candidateTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCPU-Vergleich je VM ({candidates.length})</h3></InfoTooltip>
          <VirtualTable data={candidates} columns={candidateColumns} globalFilter={filters.search} height={480} getRowId={(row: VmRightsizingCandidate) => row.objectKey} onRowClick={openVmDetail} exportFileName="vm-rightsizing" emptyTitle="Keine Kandidaten" emptyDescription="Für den gewählten Import fehlen VMs mit konfigurierter vCPU-Anzahl." />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.clusterSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Cluster</h3></InfoTooltip>
            <VirtualTable data={clusterSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
          <div>
            <InfoTooltip entry={RIGHTSIZING_SECTIONS.behaviorSummary} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Rückgewinnbare vCPU je Verhaltensklasse</h3></InfoTooltip>
            <VirtualTable data={behaviorSummary} columns={summaryColumns} height={240} getRowId={(row) => row.key} emptyTitle="Keine Daten" />
          </div>
        </div>
      </>}
      {vmDetailDialog}
    </div>
  );
}
