import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { FillUpObservedVmProfile } from "@/domain/models/types";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { FILL_UP_COLUMNS, FILL_UP_UI } from "@/lib/glossaries/planning";

export function FillUpObservedVmProfileTable({
  rows,
  onAdopt,
}: {
  rows: readonly FillUpObservedVmProfile[];
  onAdopt: (profile: FillUpObservedVmProfile) => void;
}) {
  const columns = useMemo<ColumnDef<FillUpObservedVmProfile, unknown>[]>(() => [
    {
      id: "scope",
      header: "Cluster / Resource Pool",
      meta: { info: FILL_UP_COLUMNS.observedScope },
      accessorFn: (row) => `${row.clusterName} ${row.resourcePool ?? "Gesamt"}`,
      cell: ({ row }) => <div><p className="font-medium">{row.original.clusterName}</p><p className="text-xs text-muted-foreground">{row.original.scope === "cluster" ? "Gesamt" : row.original.resourcePool ?? "Ohne Resource Pool"}</p></div>,
    },
    {
      id: "vms",
      header: "VMs",
      meta: { info: FILL_UP_COLUMNS.observedVms },
      accessorFn: (row) => row.vmCount,
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.vmCount} <span className="text-xs text-muted-foreground">/ {row.original.vmWithCpuDemandCount} mit CPU</span></span>,
    },
    { id: "vcpu", header: "Ø vCPU", meta: { info: FILL_UP_COLUMNS.observedVcpu }, accessorFn: (row) => row.averageVcpu ?? -1, cell: ({ row }) => formatDecimal(row.original.averageVcpu, "vCPU") },
    { id: "memory", header: "Ø RAM", meta: { info: FILL_UP_COLUMNS.observedMemory }, accessorFn: (row) => row.averageConfiguredMemoryMiB ?? -1, cell: ({ row }) => formatFillUpValue(row.original.averageConfiguredMemoryMiB, "MiB") },
    { id: "cpu-average", header: "CPU Ø", meta: { info: FILL_UP_COLUMNS.observedCpuAverage }, accessorFn: (row) => row.averageCpuDemandMHz ?? -1, cell: ({ row }) => formatFillUpValue(row.original.averageCpuDemandMHz, "MHz") },
    { id: "cpu-p95", header: "CPU P95", meta: { info: FILL_UP_COLUMNS.observedCpuP95 }, accessorFn: (row) => row.cpuDemandP95MHz ?? -1, cell: ({ row }) => <span className="font-mono font-medium tabular-nums">{formatFillUpValue(row.original.cpuDemandP95MHz, "MHz")}</span> },
    { id: "ready-p95", header: "Ready P95", meta: { info: FILL_UP_COLUMNS.observedReadyP95 }, accessorFn: (row) => row.cpuReadyP95Pct ?? -1, cell: ({ row }) => formatPercent(row.original.cpuReadyP95Pct) },
    {
      id: "adopt",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const canAdopt = row.original.averageVcpu !== null && row.original.averageConfiguredMemoryMiB !== null && row.original.cpuDemandP95MHz !== null;
        return <Button type="button" size="sm" variant="outline" disabled={!canAdopt} title={canAdopt ? "Als neue typische zusätzliche VM übernehmen" : "Für die Übernahme fehlen vCPU, RAM oder CPU-Demand P95"} onClick={() => onAdopt(row.original)}><Plus className="mr-1 h-3.5 w-3.5" />Übernehmen</Button>;
      },
    },
  ], [onAdopt]);

  return (
    <section className="space-y-3 border-t pt-5">
      <div>
        <InfoTooltip entry={FILL_UP_UI.observedProfiles} side="right"><h3 className="w-fit cursor-help text-sm font-semibold">Typische VM aus Cluster / Resource Pool</h3></InfoTooltip>
        <p className="text-xs text-muted-foreground">„Gesamt“ und jeder Resource Pool werden aus der gewählten vROps-Zeitreihe abgeleitet. Übernehmen erzeugt ein editierbares Profil mit CPU P95.</p>
      </div>
      <VirtualTable data={[...rows]} columns={columns} height={324} getRowId={(row) => row.id} exportFileName="fill-up-beobachtete-vm-profile" emptyTitle="Keine verknüpften VM-Zeitreihen" emptyDescription="Für den gewählten Import fehlen eindeutig zugeordnete VM-Zeitreihen mit einem RVTools-Cluster." />
    </section>
  );
}

function formatDecimal(value: number | null, suffix: string): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${suffix}`;
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}
