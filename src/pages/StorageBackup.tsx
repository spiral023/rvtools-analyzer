import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet, useVmSnapshots, useVms } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Database, HardDrive, AlertTriangle, Clock, FileWarning, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "@/components/charts/recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { buildVmJoinKey } from "@/lib/globalFilter";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  STORAGE_KPI,
  STORAGE_PARTITION_COLUMNS,
  STORAGE_MULTIPATH_COLUMNS,
  STORAGE_DEADPATH_COLUMNS,
  STORAGE_DISK_COLUMNS,
  STORAGE_BACKUP_COLUMNS,
  STORAGE_SCSI_COLUMNS,
  STORAGE_DSLIFECYCLE_COLUMNS,
  STORAGE_SECTIONS,
} from "@/lib/glossaries/storageBackup";
import type { ColumnDef } from "@tanstack/react-table";

interface PartitionRow { snapshotId: string; vm: string; disk: string; capacityMiB: number; consumedMiB: number; freeMiB: number; freePct: number }
interface MultipathRow { host: string; datastore: string; disk: string; policy: string; state: string; paths: number; activePaths: number; deadPaths: number }
interface DeadPathHostRow { host: string; affectedDevices: number; deadPaths: number; datastores: string }
interface DiskRow { snapshotId: string; vm: string; disk: string; diskPath: string; capacityMiB: number; thin: boolean; mode: string; raw: boolean; controller: string; scsiUnit: string }
interface BackupRow { snapshotId: string; vm: string; backupStatus: string; lastBackup: string; ageDays: number; risk: string }
interface ScsiRow { snapshotId: string; vm: string; controller: string; scsiUnit: string; disk: string; capacityMiB: number; mode: string }
interface DsLifecycleRow { name: string; type: string; version: string; upgradeable: string; mha: string; capacityMiB: number; freePct: number }

const partColumns: ColumnDef<PartitionRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: STORAGE_PARTITION_COLUMNS.vm } },
  { accessorKey: "disk", header: "Partition", meta: { info: STORAGE_PARTITION_COLUMNS.disk } },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_PARTITION_COLUMNS.capacityMiB } },
  { accessorKey: "consumedMiB", header: "Konsumiert", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_PARTITION_COLUMNS.consumedMiB } },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_PARTITION_COLUMNS.freeMiB } },
  { accessorKey: "freePct", header: "Frei %", meta: { info: STORAGE_PARTITION_COLUMNS.freePct }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>; }},
];

const mpColumns: ColumnDef<MultipathRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: STORAGE_MULTIPATH_COLUMNS.host } },
  { accessorKey: "datastore", header: "Datastore", meta: { info: STORAGE_MULTIPATH_COLUMNS.datastore } },
  { accessorKey: "policy", header: "Policy", meta: { info: STORAGE_MULTIPATH_COLUMNS.policy } },
  { accessorKey: "state", header: "Status", meta: { info: STORAGE_MULTIPATH_COLUMNS.state }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "ok" ? "text-success" : "text-destructive font-semibold"}>{v}</span>; }},
  { accessorKey: "paths", header: "Pfade", meta: { info: STORAGE_MULTIPATH_COLUMNS.paths } },
  { accessorKey: "activePaths", header: "Aktiv", meta: { info: STORAGE_MULTIPATH_COLUMNS.activePaths } },
  { accessorKey: "deadPaths", header: "Tote Pfade", meta: { info: STORAGE_MULTIPATH_COLUMNS.deadPaths }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>{v}</span>; }},
];

const deadPathHostColumns: ColumnDef<DeadPathHostRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: STORAGE_DEADPATH_COLUMNS.host } },
  { accessorKey: "affectedDevices", header: "Betroffene Devices", meta: { info: STORAGE_DEADPATH_COLUMNS.affectedDevices }, cell: ({ getValue }) => <span className="text-destructive font-semibold">{getValue() as number}</span> },
  { accessorKey: "deadPaths", header: "Tote Pfade gesamt", meta: { info: STORAGE_DEADPATH_COLUMNS.deadPaths }, cell: ({ getValue }) => <span className="text-destructive font-semibold">{getValue() as number}</span> },
  { accessorKey: "datastores", header: "Betroffene Datastores", meta: { info: STORAGE_DEADPATH_COLUMNS.datastores }, cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[360px] truncate" title={v}>{v || "—"}</div>; }},
];

const diskColumns: ColumnDef<DiskRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: STORAGE_DISK_COLUMNS.vm } },
  { accessorKey: "disk", header: "Disk", meta: { info: STORAGE_DISK_COLUMNS.disk } },
  {
    accessorKey: "diskPath",
    header: "Disk Path",
    meta: { info: STORAGE_DISK_COLUMNS.diskPath },
    cell: ({ getValue }) => {
      const value = getValue() as string;
      return <div className="max-w-[360px] truncate" title={value || "—"}>{value || "—"}</div>;
    },
  },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_DISK_COLUMNS.capacityMiB } },
  { accessorKey: "thin", header: "Thin", cell: ({ getValue }) => getValue() ? "Ja" : "Nein", meta: { info: STORAGE_DISK_COLUMNS.thin } },
  { accessorKey: "mode", header: "Mode", meta: { info: STORAGE_DISK_COLUMNS.mode } },
  { accessorKey: "raw", header: "RDM", cell: ({ getValue }) => getValue() ? "Ja" : "—", meta: { info: STORAGE_DISK_COLUMNS.raw } },
  { accessorKey: "controller", header: "Controller", meta: { info: STORAGE_DISK_COLUMNS.controller } },
  { accessorKey: "scsiUnit", header: "SCSI Unit", meta: { info: STORAGE_DISK_COLUMNS.scsiUnit } },
];

const backupColumns: ColumnDef<BackupRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: STORAGE_BACKUP_COLUMNS.vm } },
  { accessorKey: "backupStatus", header: "Backup Status", meta: { info: STORAGE_BACKUP_COLUMNS.backupStatus } },
  { accessorKey: "lastBackup", header: "Letztes Backup", meta: { info: STORAGE_BACKUP_COLUMNS.lastBackup } },
  { accessorKey: "ageDays", header: "Alter (Tage)", meta: { info: STORAGE_BACKUP_COLUMNS.ageDays }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 7 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v >= 0 ? v : "—"}</span>; }},
  { accessorKey: "risk", header: "Risiko", meta: { info: STORAGE_BACKUP_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : v === "kein Backup" ? "text-destructive" : "text-success"}>{v}</span>; }},
];

const scsiColumns: ColumnDef<ScsiRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: STORAGE_SCSI_COLUMNS.vm } },
  { accessorKey: "controller", header: "Controller", meta: { info: STORAGE_SCSI_COLUMNS.controller } },
  { accessorKey: "scsiUnit", header: "SCSI Unit #", meta: { info: STORAGE_SCSI_COLUMNS.scsiUnit } },
  { accessorKey: "disk", header: "Disk", meta: { info: STORAGE_SCSI_COLUMNS.disk } },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_SCSI_COLUMNS.capacityMiB } },
  { accessorKey: "mode", header: "Disk Mode", meta: { info: STORAGE_SCSI_COLUMNS.mode } },
];

const dsLifeColumns: ColumnDef<DsLifecycleRow, unknown>[] = [
  { accessorKey: "name", header: "Datastore", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.name } },
  { accessorKey: "type", header: "Typ", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.type } },
  { accessorKey: "version", header: "Version", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.version } },
  { accessorKey: "upgradeable", header: "Upgradeable", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.upgradeable }, cell: ({ getValue }) => { const v = getValue() as string; return v.toLowerCase() === "true" ? <span className="text-warning">Ja</span> : <span className="text-success">Nein</span>; }},
  { accessorKey: "mha", header: "MHA", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.mha } },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number), meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.capacityMiB } },
  { accessorKey: "freePct", header: "Frei %", meta: { info: STORAGE_DSLIFECYCLE_COLUMNS.freePct }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
];

export default function StorageBackup() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const { filterVmRows, matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const { data: rawPartitions = [] } = useRawSheet("vPartition");
  const { data: rawMultiPath = [] } = useRawSheet("vMultiPath");
  const { data: rawDisks = [] } = useRawSheet("vDisk");
  const { data: rawVInfo = [] } = useRawSheet("vInfo");
  const { data: rawDatastore = [] } = useRawSheet("vDatastore");
  const { data: vmSnapshots = [] } = useVmSnapshots();
  const filteredRawPartitions = useMemo(() => filterVmRows(rawPartitions), [filterVmRows, rawPartitions]);
  const filteredRawDisks = useMemo(() => filterVmRows(rawDisks), [filterVmRows, rawDisks]);
  const filteredRawVInfo = useMemo(() => filterVmRows(rawVInfo), [filterVmRows, rawVInfo]);
  const filteredVmSnapshots = useMemo(
    () =>
      matchingVmJoinKeys
        ? vmSnapshots.filter((snapshot) => matchingVmJoinKeys.has(buildVmJoinKey(snapshot.snapshotId, snapshot.vmName)))
        : vmSnapshots,
    [matchingVmJoinKeys, vmSnapshots],
  );

  const partitions = useMemo<PartitionRow[]>(() =>
    filteredRawPartitions.map((r) => { const cap = Number(r.data["Capacity MiB"] || 0); const free = Number(r.data["Free MiB"] || 0); return { snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), disk: String(r.data["Disk"] || ""), capacityMiB: cap, consumedMiB: Number(r.data["Consumed MiB"] || 0), freeMiB: free, freePct: cap > 0 ? (free / cap) * 100 : 100 }; }).sort((a, b) => a.freePct - b.freePct), [filteredRawPartitions]);

  const critParts = partitions.filter((p) => p.freePct < 10).length;
  const warnParts = partitions.filter((p) => p.freePct >= 10 && p.freePct < 20).length;

  const multipaths = useMemo<MultipathRow[]>(() =>
    rawMultiPath.map((r) => { let active = 0; let dead = 0; let total = 0; for (let i = 1; i <= 8; i++) { if (r.data[`Path ${i}`]) { total++; const ps = String(r.data[`Path ${i} state`] || "").toLowerCase(); if (ps === "active") active++; else if (ps === "dead") dead++; } } return { host: String(r.data["Host"] || ""), datastore: String(r.data["Datastore"] || ""), disk: String(r.data["Disk"] || ""), policy: String(r.data["Policy"] || ""), state: String(r.data["Oper. State"] || ""), paths: total, activePaths: active, deadPaths: dead }; }).sort((a, b) => (b.deadPaths - a.deadPaths) || (a.state === "ok" ? 1 : 0) - (b.state === "ok" ? 1 : 0)), [rawMultiPath]);

  const mpIssues = multipaths.filter((m) => m.state !== "ok").length;
  const deadPathDevices = multipaths.filter((m) => m.deadPaths > 0).length;

  const deadPathHosts = useMemo<DeadPathHostRow[]>(() => {
    const map = new Map<string, { affectedDevices: number; deadPaths: number; datastores: Set<string> }>();
    for (const m of multipaths) {
      if (m.deadPaths <= 0) continue;
      const entry = map.get(m.host) || { affectedDevices: 0, deadPaths: 0, datastores: new Set<string>() };
      entry.affectedDevices += 1;
      entry.deadPaths += m.deadPaths;
      if (m.datastore) entry.datastores.add(m.datastore);
      map.set(m.host, entry);
    }
    return [...map.entries()]
      .map(([host, e]) => ({ host, affectedDevices: e.affectedDevices, deadPaths: e.deadPaths, datastores: [...e.datastores].sort((a, b) => a.localeCompare(b, "de-DE")).join(", ") }))
      .sort((a, b) => (b.deadPaths - a.deadPaths) || (b.affectedDevices - a.affectedDevices));
  }, [multipaths]);

  const disks = useMemo<DiskRow[]>(() =>
    filteredRawDisks.map((r) => ({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), disk: String(r.data["Disk"] || ""), diskPath: String(r.data["Disk Path"] || ""), capacityMiB: Number(r.data["Capacity MiB"] || 0), thin: String(r.data["Thin"] || "").toLowerCase() === "true", mode: String(r.data["Disk Mode"] || ""), raw: String(r.data["Raw"] || "").toLowerCase() === "true", controller: String(r.data["Controller"] || ""), scsiUnit: String(r.data["SCSI Unit #"] || "") })), [filteredRawDisks]);

  const thinDisks = disks.filter((d) => d.thin).length;
  const rdmDisks = disks.filter((d) => d.raw).length;

  // Backup Freshness/Coverage
  const backupData = useMemo<BackupRow[]>(() => {
    const now = Date.now();
    const rows: BackupRow[] = [];
    for (const r of filteredRawVInfo) {
      const vm = String(r.data["VM"] || "");
      const status = String(r.data["Backup Status"] || "");
      const lastBackupStr = String(r.data["Last Backup"] || "");
      let ageDays = -1;
      if (lastBackupStr) {
        const d = new Date(lastBackupStr);
        if (!isNaN(d.getTime())) ageDays = Math.floor((now - d.getTime()) / 86400000);
      }
      let risk = "niedrig";
      if (!status && !lastBackupStr) risk = "kein Backup";
      else if (ageDays > 7) risk = "hoch";
      else if (ageDays > 3) risk = "mittel";
      if (risk !== "niedrig") rows.push({ snapshotId: r.snapshotId, vm, backupStatus: status || "—", lastBackup: lastBackupStr || "—", ageDays, risk });
    }
    return rows.sort((a, b) => b.ageDays - a.ageDays);
  }, [filteredRawVInfo]);

  const noBackup = backupData.filter((b) => b.risk === "kein Backup").length;
  const staleBackup = backupData.filter((b) => b.ageDays > 7).length;

  // SCSI/Controller Mapping
  const scsiMapping = useMemo<ScsiRow[]>(() =>
    filteredRawDisks.map((r) => ({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), controller: String(r.data["Controller"] || ""), scsiUnit: String(r.data["SCSI Unit #"] || ""), disk: String(r.data["Disk"] || ""), capacityMiB: Number(r.data["Capacity MiB"] || 0), mode: String(r.data["Disk Mode"] || "") })), [filteredRawDisks]);

  // MHA/VMFS Lifecycle
  const dsLifecycle = useMemo<DsLifecycleRow[]>(() =>
    rawDatastore.map((r) => ({ name: String(r.data["Name"] || ""), type: String(r.data["Type"] || ""), version: String(r.data["Version"] || ""), upgradeable: String(r.data["VMFS Upgradeable"] || ""), mha: String(r.data["MHA"] || ""), capacityMiB: Number(r.data["Capacity MiB"] || 0), freePct: Number(r.data["Free %"] || 0) })), [rawDatastore]);

  const upgradeableDs = dsLifecycle.filter((d) => d.upgradeable.toLowerCase() === "true").length;

  // Snapshot + Backup Conflict
  const snapshotBackupConflicts = useMemo(() => {
    const snapVms = new Set(filteredVmSnapshots.map((s) => s.vmName));
    return backupData.filter((b) => snapVms.has(b.vm) && b.risk !== "niedrig");
  }, [filteredVmSnapshots, backupData]);

  const partChart = useMemo(() =>
    partitions.filter((p) => p.freePct < 30).slice(0, 15).map((p) => ({ name: `${p.vm}:${p.disk}`.slice(0, 25), freePct: Math.round(p.freePct * 10) / 10 })), [partitions]);

  if (snapshotsLoading) return <PageLoadingState title="Storage / Backup" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Storage / Backup</h1><EmptyState icon={<Database className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Storage / Backup</h1>
      <FilterBar />
      <GlobalFilterScopeHint text="Datastores und Multipath bleiben unverändert; VM-bezogene Disks, Partitionen, Backups und Snapshot-Korrelationen folgen dem globalen Filter." />
      <KpiGrid>
        <KpiCard title="Partitionen" value={formatNum(partitions.length)} icon={<HardDrive className="h-4 w-4" />} info={STORAGE_KPI.partitions} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critParts)} severity={critParts > 0 ? "crit" : "ok"} info={STORAGE_KPI.critical} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnParts)} severity={warnParts > 0 ? "warn" : "ok"} info={STORAGE_KPI.warning} />
        <KpiCard title="Multipath Issues" value={formatNum(mpIssues)} severity={mpIssues > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={STORAGE_KPI.multipathIssues} />
        <KpiCard title="Dead Paths" value={`${formatNum(deadPathHosts.length)} / ${formatNum(deadPathDevices)}`} severity={deadPathDevices > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} subtitle="Hosts / Devices" info={STORAGE_KPI.deadPaths} />
        <KpiCard title="Kein Backup" value={formatNum(noBackup)} severity={noBackup > 0 ? "crit" : "ok"} icon={<FileWarning className="h-4 w-4" />} info={STORAGE_KPI.noBackup} />
        <KpiCard title="Backup >7d" value={formatNum(staleBackup)} severity={staleBackup > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} info={STORAGE_KPI.staleBackup} />
        <KpiCard title="Thin Disks" value={formatNum(thinDisks)} icon={<Database className="h-4 w-4" />} info={STORAGE_KPI.thinDisks} />
        <KpiCard title="RDM / VMFS Upg." value={`${formatNum(rdmDisks)} / ${formatNum(upgradeableDs)}`} icon={<Layers className="h-4 w-4" />} info={STORAGE_KPI.rdmUpgradeable} />
      </KpiGrid>

      {partChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={STORAGE_SECTIONS.partitionChart} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Gast-Partitionen mit wenig Platz</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={partChart} layout="vertical">
              <XAxis type="number" domain={[0, 30]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {partChart.map((entry) => <Cell key={entry.name} fill={entry.freePct < 10 ? CHART_COLORS.danger : entry.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div><InfoTooltip entry={STORAGE_SECTIONS.partitionTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Gast-Partitionen</h3></InfoTooltip><VirtualTable data={partitions} columns={partColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>

      {backupData.length > 0 && (<div><InfoTooltip entry={STORAGE_SECTIONS.backupTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Backup Frische / Coverage ({backupData.length})</h3></InfoTooltip><VirtualTable data={backupData} columns={backupColumns} globalFilter={filters.search} height={350} onRowClick={openVmDetail} /></div>)}

      {snapshotBackupConflicts.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-card/30 p-4">
          <InfoTooltip entry={STORAGE_SECTIONS.snapshotConflicts} side="bottom">
            <h3 className="mb-2 w-fit cursor-help text-sm font-semibold text-destructive">Snapshot + Backup Konflikte ({snapshotBackupConflicts.length})</h3>
          </InfoTooltip>
          <p className="text-xs text-muted-foreground mb-3">VMs mit aktivem Snapshot UND Backup-Problemen — Restore-Risiko!</p>
          <VirtualTable data={snapshotBackupConflicts} columns={backupColumns} globalFilter={filters.search} height={200} onRowClick={openVmDetail} />
        </div>
      )}

      {deadPathHosts.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-card/30 p-4">
          <InfoTooltip entry={STORAGE_SECTIONS.deadPathHosts} side="bottom">
            <h3 className="mb-2 w-fit cursor-help text-sm font-semibold text-destructive">Hosts mit toten Storage-Pfaden ({deadPathHosts.length})</h3>
          </InfoTooltip>
          <p className="text-xs text-muted-foreground mb-3">Pfad-Redundanz reduziert — Fabric/Zoning/HBA prüfen. Mit `Oper. State != ok` abgleichen für akute Device-Ausfälle.</p>
          <VirtualTable data={deadPathHosts} columns={deadPathHostColumns} globalFilter={filters.search} height={250} onRowClick={openHostDetail} />
        </div>
      )}

      {multipaths.length > 0 && (<div><InfoTooltip entry={STORAGE_SECTIONS.multipathTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Multipath Status ({multipaths.length})</h3></InfoTooltip><VirtualTable data={multipaths} columns={mpColumns} globalFilter={filters.search} height={350} onRowClick={openHostDetail} /></div>)}
      {disks.length > 0 && (<div><InfoTooltip entry={STORAGE_SECTIONS.diskTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Virtuelle Disks ({disks.length})</h3></InfoTooltip><VirtualTable data={disks} columns={diskColumns} globalFilter={filters.search} height={350} onRowClick={openVmDetail} /></div>)}
      {scsiMapping.length > 0 && (<div><InfoTooltip entry={STORAGE_SECTIONS.scsiTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">SCSI/Controller Mapping ({scsiMapping.length})</h3></InfoTooltip><VirtualTable data={scsiMapping} columns={scsiColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>)}
      {dsLifecycle.length > 0 && (<div><InfoTooltip entry={STORAGE_SECTIONS.dsLifecycleTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">MHA / VMFS Lifecycle ({dsLifecycle.length})</h3></InfoTooltip><VirtualTable data={dsLifecycle} columns={dsLifeColumns} globalFilter={filters.search} height={300} /></div>)}
      {vmDetailDialog}
      {hostDetailDialog}
    </div>
  );
}
