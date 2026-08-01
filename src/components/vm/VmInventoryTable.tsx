import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { NormalizedVm } from "@/domain/models/types";
import { shortHostName } from "@/lib/utils";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { OVERVIEW_SECTIONS, OVERVIEW_VM_COLUMNS } from "@/lib/glossary";
import { normalizedOptionalColumnMeta } from "@/lib/normalizedColumnMeta";

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
  { accessorKey: "vcenterId", header: "vCenter-ID", meta: normalizedOptionalColumnMeta("vCenter-ID", "Technische vCenter-ID des Snapshots.", "RVTools · Snapshot-Metadaten") },
  { accessorKey: "datacenter", header: "Datacenter", meta: normalizedOptionalColumnMeta("Datacenter", "Datacenter-Zuordnung der VM.", "RVTools · vInfo · „Datacenter“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "folder", header: "Ordner", meta: normalizedOptionalColumnMeta("Ordner", "vCenter-Ordner der VM.", "RVTools · vInfo · „Folder“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "resourcePool", header: "Resource Pool", meta: normalizedOptionalColumnMeta("Resource Pool", "Resource Pool der VM.", "RVTools · vInfo · „Resource pool“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "provisionedMiB", header: "Provisioniert", meta: normalizedOptionalColumnMeta("Provisioniert", "Provisionierter Speicher der VM.", "RVTools · vInfo · „Provisioned MiB“"), cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", meta: normalizedOptionalColumnMeta("Belegt", "Aktuell belegter Speicher der VM.", "RVTools · vInfo · „In Use MiB“"), cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "connectionState", header: "Verbindung", meta: normalizedOptionalColumnMeta("Verbindung", "Verbindungszustand der VM zum Host.", "RVTools · vInfo · „Connection state“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "consolidationNeeded", header: "Konsolidierung nötig", meta: normalizedOptionalColumnMeta("Konsolidierung nötig", "Kennzeichnet VMs mit ausstehender Snapshot-Konsolidierung.", "RVTools · vInfo · „Consolidation Needed“"), cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
  { accessorKey: "osTools", header: "OS (Tools)", meta: normalizedOptionalColumnMeta("OS (Tools)", "Gastbetriebssystem laut VMware Tools.", "RVTools · vInfo · „OS according to the VMware Tools“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "hwVersion", header: "HW-Version", meta: normalizedOptionalColumnMeta("HW-Version", "Virtuelle Hardware-Version der VM.", "RVTools · vInfo · „HW version“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "toolsStatus", header: "Tools-Status", meta: normalizedOptionalColumnMeta("Tools-Status", "Status der VMware Tools.", "RVTools · vInfo/vTools · „Tools status“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "toolsVersion", header: "Tools-Version", meta: normalizedOptionalColumnMeta("Tools-Version", "Versionsstring der VMware Tools.", "RVTools · vInfo · „Tools version string“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "annotation", header: "Annotation", meta: normalizedOptionalColumnMeta("Annotation", "Freitext-Notiz der VM.", "RVTools · vInfo · „Annotation“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "cpuReady", header: "CPU Ready", meta: normalizedOptionalColumnMeta("CPU Ready", "CPU-Ready-Wert der VM.", "RVTools · vCPU · „Ready“"), cell: ({ getValue }) => { const value = getValue() as number | null; return value === null ? "—" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`; } },
  { accessorKey: "vmUuid", header: "VM UUID", meta: normalizedOptionalColumnMeta("VM UUID", "Eindeutige BIOS-UUID der VM.", "RVTools · vInfo · „VM UUID“"), cell: ({ getValue }) => <span className="font-mono-data">{(getValue() as string | null) || "—"}</span> },
  { accessorKey: "firmware", header: "Firmware", meta: normalizedOptionalColumnMeta("Firmware", "Boot-Firmware der VM, z. B. BIOS oder EFI.", "RVTools · vInfo · „Firmware“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "efiSecureBoot", header: "Secure Boot", meta: normalizedOptionalColumnMeta("Secure Boot", "Kennzeichnet aktiviertes EFI Secure Boot.", "RVTools · vInfo · „EFI Secure boot“"), cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
  { accessorKey: "cbt", header: "CBT", meta: normalizedOptionalColumnMeta("CBT", "Kennzeichnet aktiviertes Changed Block Tracking.", "RVTools · vInfo · „CBT“"), cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
];

export function VmInventoryTable({ vms, globalFilter, onRowClick }: { vms: OverviewVmRow[]; globalFilter: string; onRowClick?: (vm: OverviewVmRow) => void }) {
  return <div><InfoTooltip entry={OVERVIEW_SECTIONS.vmTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Virtuelle Maschinen ({vms.length})</h3></InfoTooltip><VirtualTable tableId="vms/inventory" columnPicker data={vms} columns={vmColumns} globalFilter={globalFilter} height={400} onRowClick={onRowClick} /></div>;
}
