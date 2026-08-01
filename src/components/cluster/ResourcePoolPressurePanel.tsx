import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { SheetRow } from "@/domain/models/types";
import { CAPACITY_RP_COLUMNS, CAPACITY_SECTIONS } from "@/lib/glossaries/capacity";
import { buildResourcePoolPressureRows, type ResourcePoolPressureRow } from "@/lib/resourcePoolPressure";

const columns: ColumnDef<ResourcePoolPressureRow, unknown>[] = [
  { accessorKey: "name", header: "Resource Pool", meta: { info: CAPACITY_RP_COLUMNS.name } },
  { accessorKey: "path", header: "Pfad", meta: { info: CAPACITY_RP_COLUMNS.path } },
  { accessorKey: "status", header: "Status", meta: { info: CAPACITY_RP_COLUMNS.status }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "green" ? "text-success" : value === "yellow" ? "text-warning" : "text-destructive"}>{value}</span>; } },
  { accessorKey: "vms", header: "VMs", meta: { info: CAPACITY_RP_COLUMNS.vms } },
  { accessorKey: "cpuLimit", header: "CPU Limit", meta: { info: CAPACITY_RP_COLUMNS.cpuLimit } },
  { accessorKey: "cpuReservation", header: "CPU Res. MHz", meta: { info: CAPACITY_RP_COLUMNS.cpuReservation } },
  { accessorKey: "cpuExpandable", header: "CPU Expand.", meta: { info: CAPACITY_RP_COLUMNS.cpuExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "memLimit", header: "Mem Limit", meta: { info: CAPACITY_RP_COLUMNS.memLimit } },
  { accessorKey: "memReservation", header: "Mem Res. MiB", meta: { info: CAPACITY_RP_COLUMNS.memReservation } },
  { accessorKey: "memExpandable", header: "Mem Expand.", meta: { info: CAPACITY_RP_COLUMNS.memExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_RP_COLUMNS.risk }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "hoch" ? "text-destructive font-semibold" : value === "mittel" ? "text-warning" : "text-success"}>{value}</span>; } },
];

export function ResourcePoolPressurePanel({ rawResourcePools, search }: { rawResourcePools: SheetRow[]; search: string }) {
  const rows = useMemo(() => buildResourcePoolPressureRows(rawResourcePools), [rawResourcePools]);
  if (rows.length === 0) return null;

  return (
    <section>
      <InfoTooltip entry={CAPACITY_SECTIONS.resourcePool} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Resource Pool Pressure ({rows.length})</h3></InfoTooltip>
      <VirtualTable tableId="clusters/resource-pools" columnPicker data={rows} columns={columns} globalFilter={search} height={300} />
    </section>
  );
}
