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
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { normalizeVmName } from "@/lib/globalFilter";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
import { formatNum } from "@/lib/xlsx/parseHelpers";

const CONFIDENCE_LABEL: Record<VmRightsizingCandidate["confidence"], string> = {
  high: "hoch",
  medium: "mittel",
  low: "niedrig",
  "not-computable": "nicht berechenbar",
};

const WITHHELD_LABEL: Record<NonNullable<VmRightsizingCandidate["recommendationWithheldReason"]>, string> = {
  "low-confidence": "Datenbasis zu dünn",
  "unreliable-shape": "Lastmuster nicht belastbar",
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

function createColumns(sysvByVmName: ReadonlyMap<string, string | null>): ColumnDef<VmRightsizingCandidate, unknown>[] {
  return [
    { accessorKey: "vmName", header: "VM", meta: { info: RIGHTSIZING_COLUMNS.vmName } },
    { accessorKey: "clusterName", header: "Cluster", meta: { info: RIGHTSIZING_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      meta: { info: RIGHTSIZING_COLUMNS.sysv },
      accessorFn: (row) => sysvByVmName.get(normalizeVmName(row.vmName)) ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    { accessorKey: "vcpu", header: "Konfiguriert", meta: { info: RIGHTSIZING_COLUMNS.vcpu }, cell: ({ getValue }) => formatVcpu(getValue() as number | null) },
    { id: "demand", header: "CPU Demand P95", meta: { info: RIGHTSIZING_COLUMNS.demandP95 }, accessorFn: (row) => row.demand.p95 ?? -1, cell: ({ row }) => <DemandCell demand={row.original.demand} /> },
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
      meta: { info: RIGHTSIZING_COLUMNS.readyP95 },
      accessorFn: (row) => row.ready.p95 ?? -1,
      cell: ({ row }) => <span className={row.original.flags.highCpuReady ? "font-semibold text-warning" : ""}>{formatPercent(row.original.ready.p95)}</span>,
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
      id: "withheld",
      header: "Hinweis",
      meta: { info: RIGHTSIZING_COLUMNS.recommendationWithheld },
      accessorFn: (row) => row.recommendationWithheldReason ?? "",
      cell: ({ row }) => row.original.recommendationWithheldReason
        ? <span className="text-xs text-muted-foreground">{WITHHELD_LABEL[row.original.recommendationWithheldReason]}</span>
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
  sysvByVmName,
  onOpenChange,
  onOpenVm,
}: {
  selection: RightsizingDensitySelection | null;
  candidates: readonly VmRightsizingCandidate[];
  sysvByVmName: ReadonlyMap<string, string | null>;
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
  const columns = useMemo(() => createColumns(sysvByVmName), [sysvByVmName]);
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
