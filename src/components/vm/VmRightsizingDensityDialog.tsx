import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Cpu, Gauge, Recycle } from "lucide-react";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DemandCell } from "@/components/vm/DemandCell";
import type { RightsizingDensitySelection } from "@/components/vm/VmRightsizingDensityGrid";
import { UtilizationPercentCell } from "@/components/vm/WorkloadBadges";
import type { VmRightsizingCandidate } from "@/domain/models/types";
import { VM_RIGHTSIZING_WITHHELD_LABEL } from "@/domain/services/vmRightsizingService";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { normalizeVmName } from "@/lib/globalFilter";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import type { VmTechInfoSearchIndex } from "@/lib/vmSearch";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const CONFIDENCE_LABEL: Record<VmRightsizingCandidate["confidence"], string> = {
  high: "hoch",
  medium: "mittel",
  low: "niedrig",
  "not-computable": "nicht berechenbar",
};

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatVcpu(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatFillUpValue(value, "vCPU");
}

function demandPercent(candidate: VmRightsizingCandidate): number | null {
  return candidate.usedVcpuEquivalentP95 !== null && candidate.vcpu
    ? (candidate.usedVcpuEquivalentP95 / candidate.vcpu) * 100
    : null;
}

function createColumns(techInfoIndex: VmTechInfoSearchIndex): ColumnDef<VmRightsizingCandidate, unknown>[] {
  return [
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
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu, exportUnit: "vCPU" }, cell: ({ getValue }) => formatVcpu(getValue() as number | null) },
    // Direkt neben der konfigurierten Größe: das Begriffspaar, um das es in dieser Ansicht
    // geht, steht damit unmittelbar nebeneinander statt durch sechs Kennzahlen getrennt.
    {
      id: "reclaimable-vcpu",
      header: "Rückgewinnbar",
      meta: { info: RIGHTSIZING_COLUMNS.reclaimableVcpu, exportUnit: "vCPU" },
      accessorFn: (row) => row.reclaimableVcpu ?? -1,
      cell: ({ row }) => <span className={(row.original.reclaimableVcpu ?? 0) > 0 ? "font-semibold text-warning" : ""}>{formatVcpu(row.original.reclaimableVcpu)}</span>,
    },
    {
      id: "additional-vcpu",
      header: "Zusätzlich",
      meta: { info: RIGHTSIZING_COLUMNS.additionalVcpu, exportUnit: "vCPU" },
      accessorFn: (row) => row.additionalVcpu ?? -1,
      cell: ({ row }) => <span className={(row.original.additionalVcpu ?? 0) > 0 ? "font-semibold text-destructive" : ""}>{formatVcpu(row.original.additionalVcpu)}</span>,
    },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95, exportUnit: "MHz" }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
    {
      id: "demand-pct",
      header: "Demand P95 %",
      meta: { info: RIGHTSIZING_COLUMNS.demandP95Pct },
      accessorFn: (row) => demandPercent(row) ?? -1,
      cell: ({ row }) => <UtilizationPercentCell value={demandPercent(row.original)} />,
    },
    {
      id: "ready-p95",
      header: "Ready P95",
      meta: { info: RIGHTSIZING_COLUMNS.readyP95, exportUnit: "%" },
      accessorFn: (row) => row.ready.p95 ?? -1,
      cell: ({ row }) => <span className={row.original.flags.highCpuReady ? "font-semibold text-warning" : ""}>{formatPercent(row.original.ready.p95)}</span>,
    },
    { id: "used-vcpu", header: "Genutzt (P95)", meta: { info: RIGHTSIZING_COLUMNS.usedVcpuEquivalent, exportUnit: "vCPU" }, accessorFn: (row) => row.usedVcpuEquivalentP95 ?? -1, cell: ({ row }) => formatVcpu(row.original.usedVcpuEquivalentP95) },
    { id: "recommended-vcpu", header: "Empfohlen", meta: { info: RIGHTSIZING_COLUMNS.recommendedVcpu, exportUnit: "vCPU" }, accessorFn: (row) => row.recommendedVcpu ?? -1, cell: ({ row }) => formatVcpu(row.original.recommendedVcpu) },
    {
      id: "confidence",
      header: "Vertrauen",
      meta: { info: VM_PROFILE_UI.confidence, exportValue: (row) => CONFIDENCE_LABEL[row.confidence] },
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    {
      id: "withheld",
      header: "Hinweis",
      meta: {
        info: RIGHTSIZING_COLUMNS.recommendationWithheld,
        exportValue: (row) => row.recommendationWithheldReason
          ? VM_RIGHTSIZING_WITHHELD_LABEL[row.recommendationWithheldReason]
          : "Empfehlung berechenbar",
      },
      accessorFn: (row) => row.recommendationWithheldReason ?? "",
      cell: ({ row }) => row.original.recommendationWithheldReason
        ? <span className="text-xs text-muted-foreground">{VM_RIGHTSIZING_WITHHELD_LABEL[row.original.recommendationWithheldReason]}</span>
        : <span className="text-xs text-success">Empfehlung berechenbar</span>,
    },
  ];
}

function SummaryFact({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-mono-data text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function VmRightsizingDensityDialog({
  selection,
  candidates,
  techInfoIndex,
  onOpenChange,
  onOpenVm,
}: {
  selection: RightsizingDensitySelection | null;
  candidates: readonly VmRightsizingCandidate[];
  techInfoIndex: VmTechInfoSearchIndex;
  onOpenChange: (open: boolean) => void;
  onOpenVm: (candidate: VmRightsizingCandidate) => void;
}) {
  const candidateByKey = useMemo(() => new Map(candidates.map((candidate) => [candidate.objectKey, candidate])), [candidates]);
  const rows = useMemo(() => {
    if (!selection) return [];
    return selection.cell.candidateKeys
      .map((key) => candidateByKey.get(key))
      .filter((candidate): candidate is VmRightsizingCandidate => Boolean(candidate))
      .sort((left, right) => (right.reclaimableVcpu ?? -1) - (left.reclaimableVcpu ?? -1));
  }, [candidateByKey, selection]);
  const columns = useMemo(() => createColumns(techInfoIndex), [techInfoIndex]);
  const averageDemandPct = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const row of rows) {
      const value = demandPercent(row);
      if (value === null) continue;
      sum += value;
      count += 1;
    }
    return count > 0 ? sum / count : null;
  }, [rows]);

  return (
    <Dialog open={selection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/10 px-6 py-5">
          <InfoTooltip entry={RIGHTSIZING_SECTIONS.densityCellDetails} side="bottom">
            <DialogTitle className="w-fit cursor-help">VMs der Rightsizing-Kachel</DialogTitle>
          </InfoTooltip>
          <DialogDescription>
            {selection
              ? `${selection.vcpuLabel} konfigurierte vCPU · ${selection.demandLabel} CPU Demand P95`
              : "VMs des gewählten vCPU- und CPU-Demand-Bands."}
          </DialogDescription>
          <div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
            <SummaryFact label="VMs" value={formatNum(rows.length)} icon={<Cpu className="h-3.5 w-3.5" />} />
            <SummaryFact label="Rückgewinnbar" value={formatVcpu(selection?.cell.reclaimableVcpu ?? 0)} icon={<Recycle className="h-3.5 w-3.5" />} />
            <SummaryFact label="Auffällig" value={formatNum(selection?.cell.notableCount ?? 0)} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
            <SummaryFact label="Ø Demand P95" value={formatPercent(averageDemandPct)} icon={<Gauge className="h-3.5 w-3.5" />} />
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-4">
          <VirtualTable
            tableId="vms/rightsizing-density-details"
            columnPicker
            data={rows}
            columns={columns}
            height={460}
            getRowId={(row) => row.objectKey}
            exportFileName="vm-rightsizing-kachel"
            emptyTitle="Keine VMs"
            emptyDescription="Für diese Kachel wurden keine zugehörigen VMs gefunden."
            onRowClick={(row) => {
              onOpenChange(false);
              onOpenVm(row);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
