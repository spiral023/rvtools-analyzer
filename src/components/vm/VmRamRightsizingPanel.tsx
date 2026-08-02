import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, HelpCircle, MemoryStick, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { SearchScopeNotice } from "@/components/dashboard/SearchScopeNotice";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { useActiveSnapshotIds, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import type { VmMemoryWorkloadStats, VmRamRightsizingCandidate, VmRamRightsizingDirection } from "@/domain/models/types";
import {
  DEFAULT_RAM_RIGHTSIZING_POLICY,
  buildVmRamRightsizingCandidates,
  filterRamRightsizingCandidatesBySearch,
  summarizeRamRightsizingByCluster,
  summarizeRamRightsizingByDirection,
} from "@/domain/services/vmRamRightsizingService";
import { normalizeVmName } from "@/lib/globalFilter";
import { buildTechInfoSearchIndex, normalizeVmSearchTerm } from "@/lib/vmSearch";
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

function memoryPolicyDescription(): string {
  return `Avg ${DEFAULT_RAM_RIGHTSIZING_POLICY.normalStatistic.toUpperCase()} · Max ${DEFAULT_RAM_RIGHTSIZING_POLICY.peakStatistic === "p995" ? "P99,5" : "P99"} · Ziel ${formatPercent(DEFAULT_RAM_RIGHTSIZING_POLICY.targetWorkloadFactor * 100)} · Rundung ${formatMemory(DEFAULT_RAM_RIGHTSIZING_POLICY.roundingStepMiB)}`;
}

const directionColumns: ColumnDef<ReturnType<typeof summarizeRamRightsizingByDirection>[number], unknown>[] = [
  { accessorKey: "label", header: "Richtung" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "reclaimableMemoryMiB", header: "Freigebbar", cell: ({ getValue }) => formatMemory(getValue() as number) },
  { accessorKey: "additionalMemoryMiB", header: "Zusätzlich", cell: ({ getValue }) => formatMemory(getValue() as number) },
];

const clusterColumns: ColumnDef<ReturnType<typeof summarizeRamRightsizingByCluster>[number], unknown>[] = [
  { accessorKey: "label", header: "Cluster" },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "shrinkCount", header: "Shrink", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "growCount", header: "Grow", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "notComputableCount", header: "Nicht berechenbar", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "reclaimableMemoryMiB", header: "Freigebbar", cell: ({ getValue }) => formatMemory(getValue() as number) },
  { accessorKey: "additionalMemoryMiB", header: "Zusätzlich", cell: ({ getValue }) => formatMemory(getValue() as number) },
];

export function VmRamRightsizingPanel() {
  const { imports, profiles, selectedImport, hasMemoryWorkloadAvg, hasMemoryWorkloadMax, isLoading: workloadLoading } = useVmWorkloadProfiles(null);
  const { filters } = useActiveSnapshotIds();
  const { allVms, isLoading: vmsLoading } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const isLoading = workloadLoading || vmsLoading;
  const allCandidates = useMemo(
    () => buildVmRamRightsizingCandidates({
      profiles,
      vms: allVms,
      expectedSlots: selectedImport?.expectedSlots,
      hasMemoryWorkloadMax: hasMemoryWorkloadMax,
    }),
    [allVms, hasMemoryWorkloadMax, profiles, selectedImport?.expectedSlots],
  );
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(allCandidates.map((candidate) => candidate.vmName));
  const techInfoIndex = useMemo(() => buildTechInfoSearchIndex(techInfoLatest), [techInfoLatest]);
  const searchQuery = normalizeVmSearchTerm(filters.search.trim());
  const candidates = useMemo(
    () => filterRamRightsizingCandidatesBySearch(allCandidates, searchQuery, techInfoIndex),
    [allCandidates, searchQuery, techInfoIndex],
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

  const candidateColumns = useMemo<ColumnDef<VmRamRightsizingCandidate, unknown>[]>(() => [
    { accessorKey: "vmName", header: "VM" },
    {
      id: "sysv",
      header: "Systemverantwortlicher",
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysv ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    {
      id: "sysv-department",
      header: "Abteilung",
      accessorFn: (row) => techInfoIndex.get(normalizeVmName(row.vmName))?.sysvDepartment ?? null,
      cell: ({ getValue }) => (getValue() as string | null) ?? "—",
    },
    { accessorKey: "clusterName", header: "Cluster", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
    { id: "configured-memory", header: "RAM aktuell", accessorFn: (row) => row.configuredMemoryMiB ?? -1, cell: ({ row }) => formatMemory(row.original.configuredMemoryMiB) },
    { id: "avg-p95", header: "Workload Avg P95", accessorFn: (row) => row.workloadAvg.p95 ?? -1, cell: ({ row }) => formatStatistic(row.original.workloadAvg, "p95") },
    { id: "avg-p99", header: "Workload Avg P99", accessorFn: (row) => row.workloadAvg.p99 ?? -1, cell: ({ row }) => formatStatistic(row.original.workloadAvg, "p99") },
    {
      id: "peak-workload",
      header: `Peak-Workload Max ${DEFAULT_RAM_RIGHTSIZING_POLICY.peakStatistic === "p995" ? "P99,5" : "P99"}`,
      accessorFn: (row) => row.workloadMax?.[DEFAULT_RAM_RIGHTSIZING_POLICY.peakStatistic] ?? -1,
      cell: ({ row }) => row.original.workloadMax
        ? formatStatistic(row.original.workloadMax, DEFAULT_RAM_RIGHTSIZING_POLICY.peakStatistic)
        : "—",
    },
    { id: "required-memory", header: "RAM-Bedarf berechnet", accessorFn: (row) => row.requiredMemoryMiB ?? -1, cell: ({ row }) => formatMemory(row.original.requiredMemoryMiB) },
    { id: "recommended-memory", header: "RAM empfohlen", accessorFn: (row) => row.recommendedMemoryMiB ?? -1, cell: ({ row }) => <span className="font-semibold">{formatMemory(row.original.recommendedMemoryMiB)}</span> },
    {
      id: "delta-memory",
      header: "Delta",
      accessorFn: (row) => row.deltaMiB ?? -1,
      cell: ({ row }) => <span className={row.original.direction === "shrink" ? "font-semibold text-warning" : row.original.direction === "grow" ? "font-semibold text-destructive" : ""}>{formatSignedMemory(row.original.deltaMiB)}</span>,
    },
    { id: "direction", header: "Richtung", accessorFn: (row) => row.direction, cell: ({ row }) => <DirectionBadge direction={row.original.direction} /> },
    { id: "coverage", header: "Coverage", accessorFn: (row) => row.coverageRatio, cell: ({ row }) => formatPercent(row.original.coverageRatio * 100, 0) },
    {
      id: "confidence",
      header: "Datenqualität",
      accessorFn: (row) => row.confidence,
      cell: ({ row }) => <Badge variant={row.original.confidence === "high" ? "default" : row.original.confidence === "not-computable" ? "destructive" : "secondary"}>{CONFIDENCE_LABEL[row.original.confidence]}</Badge>,
    },
    {
      id: "reason",
      header: "Begründung",
      accessorFn: (row) => row.recommendationReason ?? "",
      cell: ({ row }) => <span className="block max-w-[28rem] whitespace-normal text-xs leading-5 text-muted-foreground">{row.original.recommendationReason ?? "—"}</span>,
    },
  ], [techInfoIndex]);

  if (imports.length === 0 && !isLoading) {
    return <EmptyState icon={<MemoryStick className="h-6 w-6" />} title="Kein vROps-Zeitreihenimport" description="RAM-Rightsizing benötigt einen vROps-VM-Export mit Memory Workload Avg sowie ein RVTools-Inventar. Importiere zuerst einen passenden Dateisatz." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  if (!hasMemoryWorkloadAvg && !isLoading) {
    return <EmptyState icon={<MemoryStick className="h-6 w-6" />} title="Keine Memory-Workload-Metrik" description="Der ausgewählte vROps-VM-Export enthält noch keine verwertbare Memory|Workload|Avg-Spalte. Ältere CPU-Importe bleiben gültig; nach einem erneuten Import mit der Avg-Reihe wird dieser Tab automatisch berechnet." actionLabel="Zur Planung" actionTo="/planning" />;
  }

  return (
    <div className="space-y-6">
      {isLoading ? <PanelLoadingState /> : <>
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">RAM-Rightsizing-Policy</p>
              <p className="mt-1 text-muted-foreground">{memoryPolicyDescription()}. Der berechnete Bedarf bleibt roh sichtbar; das Ziel wird nur auf die konfigurierte Schrittweite aufgerundet. Die Parameter sind zentral konfigurierbar und werden nach dem ersten Memory-Workload-Export gegen dessen Verteilung validiert.</p>
              <p className="mt-1 text-xs text-muted-foreground">Memory Workload wird als Prozentpunkte interpretiert. vMemory.Active ist ausdrücklich kein Signal dieser Berechnung.{hasMemoryWorkloadMax ? " Die Max-Reihe ist im Import vorhanden." : " Die Max-Reihe fehlt; die Empfehlung verwendet nur die Avg-Reihe."}</p>
            </div>
          </div>
        </div>
        <SearchScopeNotice search={filters.search} fields="VM, Cluster, Systemverantwortliche:r und Abteilung" matched={candidates.length} total={allCandidates.length} />
        <KpiGrid>
          <KpiCard title="Verwertbare RAM-Zeitreihe" value={formatNum(usableCount)} subtitle={`von ${formatNum(candidates.length)} VMs`} severity={usableCount > 0 ? "ok" : "warn"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="VMs zur Verkleinerung" value={formatNum(shrinkCandidates.length)} severity={shrinkCandidates.length > 0 ? "warn" : "ok"} icon={<ArrowDown className="h-4 w-4" />} />
          <KpiCard title="Freigebbarer RAM" value={formatMemory(reclaimableMemoryMiB)} severity={reclaimableMemoryMiB > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="VMs zur Vergrößerung" value={formatNum(growCandidates.length)} severity={growCandidates.length > 0 ? "crit" : "ok"} icon={<ArrowUp className="h-4 w-4" />} />
          <KpiCard title="Zusätzlicher RAM" value={formatMemory(additionalMemoryMiB)} severity={additionalMemoryMiB > 0 ? "crit" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
          <KpiCard title="Nicht berechenbare VMs" value={formatNum(notComputableCount)} severity={notComputableCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} />
        </KpiGrid>

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
            emptyDescription={searchQuery === "" ? "Für den gewählten Import fehlen VMs mit verwertbaren Memory-Workload-Werten." : "Kein Treffer für die aktuelle Suche in VM, Cluster, Systemverantwortliche:r oder Abteilung."}
            onFilteredCountChange={setVisibleCandidateCount}
          />
        </div>
      </>}
      {vmDetailDialog}
    </div>
  );
}
