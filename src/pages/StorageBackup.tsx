import { useMemo } from "react";
import { useActiveSnapshotIds, useDatastores, useRawSheet, useVmSnapshots } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { Database, HardDrive, AlertTriangle, Shield, Clock, FileWarning, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "@/components/charts/recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { buildVmJoinKey } from "@/lib/globalFilter";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";

interface PartitionRow { vm: string; disk: string; capacityMiB: number; consumedMiB: number; freeMiB: number; freePct: number }
interface MultipathRow { host: string; datastore: string; disk: string; policy: string; state: string; paths: number; activePaths: number }
interface DiskRow { vm: string; disk: string; diskPath: string; capacityMiB: number; thin: boolean; mode: string; raw: boolean; controller: string; scsiUnit: string }
interface BackupRow { vm: string; backupStatus: string; lastBackup: string; ageDays: number; risk: string }
interface ScsiRow { vm: string; controller: string; scsiUnit: string; disk: string; capacityMiB: number; mode: string }
interface DsLifecycleRow { name: string; type: string; version: string; upgradeable: string; mha: string; capacityMiB: number; freePct: number }

const partColumns: ColumnDef<PartitionRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "disk", header: "Partition" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "consumedMiB", header: "Konsumiert", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>; }},
];

const mpColumns: ColumnDef<MultipathRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "datastore", header: "Datastore" },
  { accessorKey: "policy", header: "Policy" },
  { accessorKey: "state", header: "Status", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "ok" ? "text-success" : "text-destructive font-semibold"}>{v}</span>; }},
  { accessorKey: "paths", header: "Pfade" },
  { accessorKey: "activePaths", header: "Aktiv" },
];

const diskColumns: ColumnDef<DiskRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "disk", header: "Disk" },
  {
    accessorKey: "diskPath",
    header: "Disk Path",
    cell: ({ getValue }) => {
      const value = getValue() as string;
      return <div className="max-w-[360px] truncate" title={value || "—"}>{value || "—"}</div>;
    },
  },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "thin", header: "Thin", cell: ({ getValue }) => getValue() ? "Ja" : "Nein" },
  { accessorKey: "mode", header: "Mode" },
  { accessorKey: "raw", header: "RDM", cell: ({ getValue }) => getValue() ? "Ja" : "—" },
  { accessorKey: "controller", header: "Controller" },
  { accessorKey: "scsiUnit", header: "SCSI Unit" },
];

const backupColumns: ColumnDef<BackupRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "backupStatus", header: "Backup Status" },
  { accessorKey: "lastBackup", header: "Letztes Backup" },
  { accessorKey: "ageDays", header: "Alter (Tage)", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 7 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v >= 0 ? v : "—"}</span>; }},
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : v === "kein Backup" ? "text-destructive" : "text-success"}>{v}</span>; }},
];

const scsiColumns: ColumnDef<ScsiRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "controller", header: "Controller" },
  { accessorKey: "scsiUnit", header: "SCSI Unit #" },
  { accessorKey: "disk", header: "Disk" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "mode", header: "Disk Mode" },
];

const dsLifeColumns: ColumnDef<DsLifecycleRow, unknown>[] = [
  { accessorKey: "name", header: "Datastore" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "upgradeable", header: "Upgradeable", cell: ({ getValue }) => { const v = getValue() as string; return v.toLowerCase() === "true" ? <span className="text-warning">Ja</span> : <span className="text-success">Nein</span>; }},
  { accessorKey: "mha", header: "MHA" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
];

export default function StorageBackup() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { filterVmRows, matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const { data: datastores = [] } = useDatastores();
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
    filteredRawPartitions.map((r) => { const cap = Number(r.data["Capacity MiB"] || 0); const free = Number(r.data["Free MiB"] || 0); return { vm: String(r.data["VM"] || ""), disk: String(r.data["Disk"] || ""), capacityMiB: cap, consumedMiB: Number(r.data["Consumed MiB"] || 0), freeMiB: free, freePct: cap > 0 ? (free / cap) * 100 : 100 }; }).sort((a, b) => a.freePct - b.freePct), [filteredRawPartitions]);

  const critParts = partitions.filter((p) => p.freePct < 10).length;
  const warnParts = partitions.filter((p) => p.freePct >= 10 && p.freePct < 20).length;

  const multipaths = useMemo<MultipathRow[]>(() =>
    rawMultiPath.map((r) => { let active = 0; let total = 0; for (let i = 1; i <= 8; i++) { if (r.data[`Path ${i}`]) { total++; if (String(r.data[`Path ${i} state`] || "") === "active") active++; } } return { host: String(r.data["Host"] || ""), datastore: String(r.data["Datastore"] || ""), disk: String(r.data["Disk"] || ""), policy: String(r.data["Policy"] || ""), state: String(r.data["Oper. State"] || ""), paths: total, activePaths: active }; }), [rawMultiPath]);

  const mpIssues = multipaths.filter((m) => m.state !== "ok").length;

  const disks = useMemo<DiskRow[]>(() =>
    filteredRawDisks.map((r) => ({ vm: String(r.data["VM"] || ""), disk: String(r.data["Disk"] || ""), diskPath: String(r.data["Disk Path"] || ""), capacityMiB: Number(r.data["Capacity MiB"] || 0), thin: String(r.data["Thin"] || "").toLowerCase() === "true", mode: String(r.data["Disk Mode"] || ""), raw: String(r.data["Raw"] || "").toLowerCase() === "true", controller: String(r.data["Controller"] || ""), scsiUnit: String(r.data["SCSI Unit #"] || "") })), [filteredRawDisks]);

  const thinDisks = disks.filter((d) => d.thin).length;
  const rdmDisks = disks.filter((d) => d.raw).length;

  // Backup Freshness/Coverage
  const backupData = useMemo<BackupRow[]>(() => {
    const now = Date.now();
    return filteredRawVInfo.map((r) => {
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
      return { vm, backupStatus: status || "—", lastBackup: lastBackupStr || "—", ageDays, risk };
    }).filter((b) => b.risk !== "niedrig").sort((a, b) => b.ageDays - a.ageDays);
  }, [filteredRawVInfo]);

  const noBackup = backupData.filter((b) => b.risk === "kein Backup").length;
  const staleBackup = backupData.filter((b) => b.ageDays > 7).length;

  // SCSI/Controller Mapping
  const scsiMapping = useMemo<ScsiRow[]>(() =>
    filteredRawDisks.map((r) => ({ vm: String(r.data["VM"] || ""), controller: String(r.data["Controller"] || ""), scsiUnit: String(r.data["SCSI Unit #"] || ""), disk: String(r.data["Disk"] || ""), capacityMiB: Number(r.data["Capacity MiB"] || 0), mode: String(r.data["Disk Mode"] || "") })), [filteredRawDisks]);

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

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Storage / Backup</h1><EmptyState icon={<Database className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Storage / Backup</h1>
      <FilterBar />
      <GlobalFilterScopeHint text="Datastores und Multipath bleiben unverändert; VM-bezogene Disks, Partitionen, Backups und Snapshot-Korrelationen folgen dem globalen Filter." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard title="Partitionen" value={formatNum(partitions.length)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critParts)} severity={critParts > 0 ? "crit" : "ok"} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnParts)} severity={warnParts > 0 ? "warn" : "ok"} />
        <KpiCard title="Multipath Issues" value={formatNum(mpIssues)} severity={mpIssues > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Kein Backup" value={formatNum(noBackup)} severity={noBackup > 0 ? "crit" : "ok"} icon={<FileWarning className="h-4 w-4" />} />
        <KpiCard title="Backup >7d" value={formatNum(staleBackup)} severity={staleBackup > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} />
        <KpiCard title="Thin Disks" value={formatNum(thinDisks)} icon={<Database className="h-4 w-4" />} />
        <KpiCard title="RDM / VMFS Upg." value={`${formatNum(rdmDisks)} / ${formatNum(upgradeableDs)}`} icon={<Layers className="h-4 w-4" />} />
      </div>

      {partChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Gast-Partitionen mit wenig Platz</h3>
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

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Gast-Partitionen</h3><VirtualTable data={partitions} columns={partColumns} globalFilter={filters.search} /></div>

      {backupData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Backup Frische / Coverage ({backupData.length})</h3><VirtualTable data={backupData} columns={backupColumns} globalFilter={filters.search} height={350} /></div>)}

      {snapshotBackupConflicts.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-card/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-destructive">Snapshot + Backup Konflikte ({snapshotBackupConflicts.length})</h3>
          <p className="text-xs text-muted-foreground mb-3">VMs mit aktivem Snapshot UND Backup-Problemen — Restore-Risiko!</p>
          <VirtualTable data={snapshotBackupConflicts} columns={backupColumns} globalFilter={filters.search} height={200} />
        </div>
      )}

      {multipaths.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Multipath Status ({multipaths.length})</h3><VirtualTable data={multipaths} columns={mpColumns} globalFilter={filters.search} height={350} /></div>)}
      {disks.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Virtuelle Disks ({disks.length})</h3><VirtualTable data={disks} columns={diskColumns} globalFilter={filters.search} height={350} /></div>)}
      {scsiMapping.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">SCSI/Controller Mapping ({scsiMapping.length})</h3><VirtualTable data={scsiMapping} columns={scsiColumns} globalFilter={filters.search} height={300} /></div>)}
      {dsLifecycle.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">MHA / VMFS Lifecycle ({dsLifecycle.length})</h3><VirtualTable data={dsLifecycle} columns={dsLifeColumns} globalFilter={filters.search} height={300} /></div>)}
    </div>
  );
}
