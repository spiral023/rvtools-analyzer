import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { NormalizedVm } from "@/domain/models/types";
import { shortHostName } from "@/lib/utils";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { OVERVIEW_SECTIONS, OVERVIEW_VM_COLUMNS } from "@/lib/glossary";

export interface OverviewVmRow extends NormalizedVm { sysv: string | null; sysvDepartment: string | null }

const vmColumns: ColumnDef<OverviewVmRow, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: OVERVIEW_VM_COLUMNS.vmName } },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—", meta: { info: OVERVIEW_VM_COLUMNS.sysv } },
  // Als Spalte vorhanden, weil die Textsuche sie durchsucht: die Tabelle filtert ein zweites
  // Mal über ihre eigenen Spalten, sodass ein Treffer ohne Spalte wieder herausfiele.
  { accessorKey: "sysvDepartment", header: "Abteilung", cell: ({ getValue }) => getValue() || "—", meta: { info: OVERVIEW_VM_COLUMNS.sysvDepartment } },
  { accessorKey: "powerState", header: "Power", meta: { info: OVERVIEW_VM_COLUMNS.powerState }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "poweredOn" ? "text-success" : value === "poweredOff" ? "text-muted-foreground" : "text-warning"}>{value || "—"}</span>; } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: OVERVIEW_VM_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: OVERVIEW_VM_COLUMNS.host }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? shortHostName(value) : "—"; } },
  { accessorKey: "cpuCount", header: "vCPU", cell: ({ getValue }) => getValue() ?? "—", meta: { info: OVERVIEW_VM_COLUMNS.cpuCount } },
  { accessorKey: "memoryMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number | null), meta: { info: OVERVIEW_VM_COLUMNS.memoryMiB } },
  { accessorKey: "configStatus", header: "Config", meta: { info: OVERVIEW_VM_COLUMNS.configStatus }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "green" ? "text-success" : value === "yellow" ? "text-warning" : value === "red" ? "text-destructive" : ""}>{value || "—"}</span>; } },
  { accessorKey: "osConfig", header: "OS", meta: { info: OVERVIEW_VM_COLUMNS.osConfig } },
];

export function VmInventoryTable({ vms, globalFilter, onRowClick }: { vms: OverviewVmRow[]; globalFilter: string; onRowClick?: (vm: OverviewVmRow) => void }) {
  return <div><InfoTooltip entry={OVERVIEW_SECTIONS.vmTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Virtuelle Maschinen ({vms.length})</h3></InfoTooltip><VirtualTable data={vms} columns={vmColumns} globalFilter={globalFilter} height={400} onRowClick={onRowClick} /></div>;
}
