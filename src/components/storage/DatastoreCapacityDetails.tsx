import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { NormalizedDatastore, NormalizedHost, NormalizedVm, SheetRow } from "@/domain/models/types";
import { buildDatastoreDetailRows, type DatastoreDetailRow } from "@/lib/datastoreDetails";
import { normalizeVmName } from "@/lib/globalFilter";
import { CAPACITY_DS_COLUMNS, CAPACITY_SECTIONS, CAPACITY_THIN_COLUMNS, CAPACITY_THIN_DISK_COLUMNS } from "@/lib/glossaries/capacity";
import { normalizedOptionalColumnMeta } from "@/lib/normalizedColumnMeta";
import { formatBytes, formatPct, parseDatastoreFromDiskPath } from "@/lib/xlsx/parseHelpers";

interface ThinRiskRow { datastore: string; freePct: number | null; thinDisks: number; totalThinMiB: number; risk: string }
interface ThinDiskRow { snapshotId: string; vm: string; disk: string; capacityMiB: number; diskPath: string; datastore: string; datastoreFreePct: number | null; cluster: string; host: string }

const datastoreColumns: ColumnDef<DatastoreDetailRow, unknown>[] = [
  { accessorKey: "name", header: "Datastore", meta: { info: CAPACITY_DS_COLUMNS.name } },
  { accessorKey: "type", header: "Typ", meta: { info: CAPACITY_DS_COLUMNS.type } },
  {
    id: "computeClusters",
    accessorFn: (row) => row.computeClusters.join(", "),
    header: "Compute-Cluster",
    meta: { info: CAPACITY_DS_COLUMNS.computeClusters },
    cell: ({ row }) => {
      const value = row.original.computeClusters.join(", ");
      return <div className="max-w-[280px] truncate" title={value || "—"}>{value || "—"}</div>;
    },
  },
  {
    accessorKey: "computeClusterCount",
    header: "Anzahl Compute-Cluster",
    meta: { info: CAPACITY_DS_COLUMNS.computeClusterCount },
    cell: ({ getValue }) => <span className="font-mono-data tabular-nums">{getValue() as number}</span>,
  },
  {
    accessorKey: "datastoreClusterName",
    header: "Datastore Cluster",
    meta: { info: CAPACITY_DS_COLUMNS.datastoreClusterName },
    cell: ({ getValue }) => (getValue() as string | null | undefined) || "—",
  },
  { accessorKey: "capacityMiB", header: "Kapazität", meta: { info: CAPACITY_DS_COLUMNS.capacityMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", meta: { info: CAPACITY_DS_COLUMNS.inUseMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", meta: { info: CAPACITY_DS_COLUMNS.freeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", meta: { info: CAPACITY_DS_COLUMNS.freePct }, cell: ({ getValue }) => { const value = getValue() as number | null; return <span className={value !== null && value < 10 ? "text-destructive font-semibold" : value !== null && value < 20 ? "text-warning" : "text-success"}>{formatPct(value)}</span>; } },
  { accessorKey: "vcenterId", header: "vCenter-ID", meta: normalizedOptionalColumnMeta("vCenter-ID", "Technische vCenter-ID des Datastore-Snapshots.", "RVTools · Snapshot-Metadaten") },
  { accessorKey: "clusterName", header: "Cluster-Zuordnung", meta: normalizedOptionalColumnMeta("Cluster-Zuordnung", "Direkte Cluster-Zuordnung des Datastores, sofern vom Export geliefert.", "RVTools · vDatastore · „Cluster“"), cell: ({ getValue }) => (getValue() as string | null | undefined) || "—" },
  {
    id: "hostNames",
    header: "Verbundene Hosts",
    meta: normalizedOptionalColumnMeta("Verbundene Hosts", "ESXi-Hosts, die den Datastore verbunden haben.", "RVTools · vDatastore · „Hosts“"),
    accessorFn: (row) => row.hostNames.join(", "),
    cell: ({ row }) => {
      const value = row.original.hostNames.join(", ");
      return <div className="max-w-[320px] truncate" title={value || "—"}>{value || "—"}</div>;
    },
  },
  { accessorKey: "version", header: "Version", meta: normalizedOptionalColumnMeta("Version", "Dateisystem- bzw. Datastore-Version.", "RVTools · vDatastore · „Version“"), cell: ({ getValue }) => (getValue() as string | null) || "—" },
  { accessorKey: "siocEnabled", header: "SIOC", meta: normalizedOptionalColumnMeta("SIOC", "Kennzeichnet aktiviertes Storage I/O Control.", "RVTools · vDatastore · „SIOC enabled“"), cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
];

const thinRiskColumns: ColumnDef<ThinRiskRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore", meta: { info: CAPACITY_THIN_COLUMNS.datastore } },
  { accessorKey: "freePct", header: "Frei % (knappster DS)", meta: { info: CAPACITY_THIN_COLUMNS.freePct }, cell: ({ getValue }) => { const value = getValue() as number | null; return value === null ? "—" : <span className={value < 10 ? "text-destructive font-semibold" : value < 20 ? "text-warning" : ""}>{formatPct(value)}</span>; } },
  { accessorKey: "thinDisks", header: "Thin Disks", meta: { info: CAPACITY_THIN_COLUMNS.thinDisks } },
  { accessorKey: "totalThinMiB", header: "Thin Kapaz.", meta: { info: CAPACITY_THIN_COLUMNS.totalThinMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_THIN_COLUMNS.risk }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "hoch" ? "text-destructive font-semibold" : value === "mittel" ? "text-warning" : "text-success"}>{value}</span>; } },
];

const thinDiskColumns: ColumnDef<ThinDiskRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: CAPACITY_THIN_DISK_COLUMNS.vm } },
  { accessorKey: "disk", header: "Disk", meta: { info: CAPACITY_THIN_DISK_COLUMNS.disk } },
  { accessorKey: "capacityMiB", header: "Größe", meta: { info: CAPACITY_THIN_DISK_COLUMNS.capacityMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "diskPath", header: "VMDK-Pfad", meta: { info: CAPACITY_THIN_DISK_COLUMNS.diskPath }, cell: ({ getValue }) => { const value = getValue() as string; return <div className="max-w-[360px] truncate" title={value || "—"}>{value || "—"}</div>; } },
  { accessorKey: "datastore", header: "Datastore", meta: { info: CAPACITY_THIN_DISK_COLUMNS.datastore }, cell: ({ getValue }) => (getValue() as string) || "—" },
  { accessorKey: "datastoreFreePct", header: "Datastore Frei %", meta: { info: CAPACITY_THIN_DISK_COLUMNS.datastoreFreePct }, cell: ({ getValue }) => { const value = getValue() as number | null; return value === null ? "—" : <span className={value < 10 ? "text-destructive font-semibold" : value < 20 ? "text-warning" : ""}>{formatPct(value)}</span>; } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: CAPACITY_THIN_DISK_COLUMNS.cluster }, cell: ({ getValue }) => (getValue() as string) || "—" },
  { accessorKey: "host", header: "Host", meta: { info: CAPACITY_THIN_DISK_COLUMNS.host }, cell: ({ getValue }) => (getValue() as string) || "—" },
];

export function DatastoreCapacityDetails({ datastores, hosts, allVms, rawDatastores, rawDisks, search, onOpenVm }: { datastores: NormalizedDatastore[]; hosts: NormalizedHost[]; allVms: NormalizedVm[]; rawDatastores: SheetRow[]; rawDisks: SheetRow[]; search: string; onOpenVm: (row: unknown) => void }) {
  const datastoreDetailRows = useMemo(() => buildDatastoreDetailRows(datastores, hosts, rawDatastores), [datastores, hosts, rawDatastores]);

  const thinRiskRows = useMemo<ThinRiskRow[]>(() => {
    let thinDisks = 0;
    let totalThinMiB = 0;
    for (const row of rawDisks) {
      if (String(row.data.Thin || "").toLowerCase() === "true") {
        thinDisks += 1;
        totalThinMiB += Number(row.data["Capacity MiB"] || 0);
      }
    }
    if (thinDisks === 0) return [];
    const freePcts = datastores.map((datastore) => datastore.freePct).filter((value): value is number => value !== null);
    const minFreePct = freePcts.length ? Math.min(...freePcts) : null;
    const risk = minFreePct !== null && minFreePct < 10 && thinDisks > 5 ? "hoch" : minFreePct !== null && minFreePct < 20 ? "mittel" : "niedrig";
    return [{ datastore: "Alle Datastores (gesamt)", freePct: minFreePct, thinDisks, totalThinMiB, risk }];
  }, [datastores, rawDisks]);

  const thinDiskRows = useMemo<ThinDiskRow[]>(() => {
    const datastoreByKey = new Map(datastoreDetailRows.map((datastore) => [`${datastore.snapshotId}::${datastore.name.trim().toLowerCase()}`, datastore]));
    const vmByKey = new Map(allVms.map((vm) => [`${vm.snapshotId}::${normalizeVmName(vm.vmName)}`, vm]));
    const rows: ThinDiskRow[] = [];
    for (const row of rawDisks) {
      if (String(row.data.Thin || "").toLowerCase() !== "true") continue;
      const vmName = String(row.data.VM || "");
      const diskPath = String(row.data["Disk Path"] || "");
      const datastoreName = parseDatastoreFromDiskPath(diskPath) || "";
      const datastore = datastoreName ? datastoreByKey.get(`${row.snapshotId}::${datastoreName.toLowerCase()}`) : undefined;
      const vm = vmByKey.get(`${row.snapshotId}::${normalizeVmName(vmName)}`);
      rows.push({ snapshotId: row.snapshotId, vm: vmName, disk: String(row.data.Disk || ""), capacityMiB: Number(row.data["Capacity MiB"] || 0), diskPath, datastore: datastoreName || datastore?.name || "", datastoreFreePct: datastore?.freePct ?? null, cluster: vm?.cluster || datastore?.computeClusters.join(", ") || "", host: vm?.host || "" });
    }
    return rows.sort((left, right) => (left.datastoreFreePct ?? Infinity) - (right.datastoreFreePct ?? Infinity) || right.capacityMiB - left.capacityMiB);
  }, [allVms, datastoreDetailRows, rawDisks]);

  return (
    <>
      <div><InfoTooltip entry={CAPACITY_SECTIONS.datastoreDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Details</h3></InfoTooltip><VirtualTable tableId="storage/datastore-details" columnPicker data={datastoreDetailRows} columns={datastoreColumns} globalFilter={search} initialSorting={[{ id: "freePct", desc: false }]} /></div>
      {thinRiskRows.length > 0 && <div><InfoTooltip entry={CAPACITY_SECTIONS.thinRisk} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Thin-Provisioning Risiko</h3></InfoTooltip><VirtualTable tableId="storage/thin-risk" columnPicker data={thinRiskRows} columns={thinRiskColumns} globalFilter={search} height={250} /></div>}
      {thinDiskRows.length > 0 && <div><InfoTooltip entry={CAPACITY_SECTIONS.thinDiskDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Thin Disks – Migrationsplanung ({thinDiskRows.length})</h3></InfoTooltip><VirtualTable tableId="storage/thin-disk-details" columnPicker data={thinDiskRows} columns={thinDiskColumns} globalFilter={search} height={400} onRowClick={onOpenVm} /></div>}
    </>
  );
}
