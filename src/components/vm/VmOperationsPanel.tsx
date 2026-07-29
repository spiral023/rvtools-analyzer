import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Camera, Clock, Disc, Unplug } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { VmToolsWavePlan } from "@/components/vm/VmToolsWavePlan";
import { useActiveSnapshotIds, useRawSheet, useVmSnapshots, useVms } from "@/hooks/useActiveSnapshots";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { buildVmJoinKey } from "@/lib/globalFilter";
import { DAILY_OPS_COLUMNS, DAILY_OPS_KPI, DAILY_OPS_SECTIONS } from "@/lib/glossaries/dailyOps";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { NormalizedSnapshot, NormalizedVm } from "@/domain/models/types";

function parseSnapshotDate(value: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const serial = Number(raw);
  if (Number.isFinite(serial) && /^\d+(\.\d+)?$/.test(raw)) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const dotted = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (dotted) {
    const [, y, m, d, hh, mm, ss] = dotted;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSnapshotCreated(value: string | null): string {
  const date = parseSnapshotDate(value);
  if (!date) return value || "—";
  return date.toLocaleString("de-DE", { timeZone: "UTC" });
}

function formatSinceCreation(value: string | null): string {
  const date = parseSnapshotDate(value);
  if (!date) return "—";
  const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
  return days === 0 ? "heute" : `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

const issueColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: DAILY_OPS_COLUMNS.vmName } },
  { accessorKey: "configStatus", header: "Config Status", meta: { info: DAILY_OPS_COLUMNS.configStatus }, cell: ({ getValue }) => {
    const value = getValue() as string;
    return <span className={value === "green" ? "text-success" : value === "yellow" ? "text-warning" : "text-destructive"}>{value || "—"}</span>;
  } },
  { accessorKey: "connectionState", header: "Verbindung", meta: { info: DAILY_OPS_COLUMNS.connectionState } },
  { accessorKey: "powerState", header: "Power", meta: { info: DAILY_OPS_COLUMNS.powerState } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: DAILY_OPS_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: DAILY_OPS_COLUMNS.host } },
  { accessorKey: "osConfig", header: "OS", meta: { info: DAILY_OPS_COLUMNS.osConfig } },
];

const snapshotColumns: ColumnDef<NormalizedSnapshot, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: DAILY_OPS_COLUMNS.vmName } },
  { accessorKey: "snapshotName", header: "Snapshot", meta: { info: DAILY_OPS_COLUMNS.snapshotName } },
  { accessorKey: "description", header: "Beschreibung", meta: { info: DAILY_OPS_COLUMNS.description } },
  { accessorKey: "dateTaken", header: "Erstellt", meta: { info: DAILY_OPS_COLUMNS.dateTaken }, cell: ({ getValue }) => formatSnapshotCreated((getValue() as string | null) ?? null) },
  { accessorKey: "dateTaken", id: "ageDays", header: "Seit Erstellung", meta: { info: DAILY_OPS_COLUMNS.ageDays }, cell: ({ getValue }) => {
    const value = (getValue() as string | null) ?? null;
    const date = parseSnapshotDate(value);
    const days = date ? Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000)) : null;
    const className = days !== null && days > 14 ? "text-destructive font-semibold" : days !== null && days > 7 ? "text-warning" : "";
    return <span className={className}>{formatSinceCreation(value)}</span>;
  } },
  { accessorKey: "sizeMiB", header: "Größe (GiB)", meta: { info: DAILY_OPS_COLUMNS.sizeMiB }, cell: ({ getValue }) => {
    const value = getValue() as number | null;
    if (value === null) return "—";
    const gib = value / 1024;
    return <span className={value > 51200 ? "text-destructive font-semibold" : value > 20480 ? "text-warning" : ""}>{gib.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</span>;
  } },
  { accessorKey: "quiesced", header: "Quiesced", meta: { info: DAILY_OPS_COLUMNS.quiesced }, cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
];

export function VmOperationsPanel() {
  const { filters } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows, matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const { data: vmSnapshots = [], isLoading: snapshotsLoading } = useVmSnapshots();
  const { data: rawVTools = [], isLoading: toolsLoading } = useRawSheet("vTools");
  const { data: rawVCD = [], isLoading: cdLoading } = useRawSheet("vCD");
  const { data: rawVUSB = [], isLoading: usbLoading } = useRawSheet("vUSB");

  const configIssues = useMemo(() => vms.filter((vm) => vm.configStatus && vm.configStatus !== "green"), [vms]);
  const consolidationNeeded = useMemo(() => vms.filter((vm) => vm.consolidationNeeded === true), [vms]);
  const disconnectedVms = useMemo(() => vms.filter((vm) => vm.connectionState && vm.connectionState !== "connected"), [vms]);
  const filteredSnapshots = useMemo(() => matchingVmJoinKeys
    ? vmSnapshots.filter((snapshot) => matchingVmJoinKeys.has(buildVmJoinKey(snapshot.snapshotId, snapshot.vmName)))
    : vmSnapshots, [matchingVmJoinKeys, vmSnapshots]);
  const staleSnapshotCount = useMemo(() => filteredSnapshots.filter((snapshot) => {
    const date = parseSnapshotDate(snapshot.dateTaken);
    if (!date) return false;
    return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000)) > 14;
  }).length, [filteredSnapshots]);
  const filteredTools = useMemo(() => filterVmRows(rawVTools), [filterVmRows, rawVTools]);
  const filteredCd = useMemo(() => filterVmRows(rawVCD), [filterVmRows, rawVCD]);
  const filteredUsb = useMemo(() => filterVmRows(rawVUSB), [filterVmRows, rawVUSB]);
  const toolsIssues = filteredTools.filter((row) => {
    const tools = String(row.data["Tools"] || "");
    return tools !== "" && tools !== "toolsOk";
  }).length;
  const connectedMedia = filteredCd.filter((row) => String(row.data["Connected"]).toLowerCase() === "true").length
    + filteredUsb.filter((row) => String(row.data["Connected"]).toLowerCase() === "true").length;

  if (snapshotsLoading || toolsLoading || cdLoading || usbLoading) return <PanelLoadingState />;

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Consolidation" value={formatNum(consolidationNeeded.length)} severity={consolidationNeeded.length > 0 ? "warn" : "ok"} info={DAILY_OPS_KPI.consolidation} />
        <KpiCard title="Disconnected" value={formatNum(disconnectedVms.length)} severity={disconnectedVms.length > 0 ? "crit" : "ok"} icon={<Unplug className="h-4 w-4" />} info={DAILY_OPS_KPI.disconnected} />
        <KpiCard title="Tools Issues" value={formatNum(toolsIssues)} severity={toolsIssues > 0 ? "warn" : "ok"} info={DAILY_OPS_KPI.toolsIssues} />
        <KpiCard title="CD/USB verbunden" value={formatNum(connectedMedia)} severity={connectedMedia > 0 ? "warn" : "ok"} icon={<Disc className="h-4 w-4" />} info={DAILY_OPS_KPI.cdUsb} />
        <KpiCard title="VM Snapshots" value={formatNum(filteredSnapshots.length)} icon={<Camera className="h-4 w-4" />} info={DAILY_OPS_KPI.vmSnapshots} />
        <KpiCard title="Alte Snapshots" value={formatNum(staleSnapshotCount)} subtitle="> 14 Tage" severity={staleSnapshotCount > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} info={DAILY_OPS_KPI.staleSnapshots} />
      </KpiGrid>

      <div className="space-y-6">
        <div>
          <InfoTooltip entry={DAILY_OPS_SECTIONS.configIssuesTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VMs mit Konfigurationsproblemen ({configIssues.length})</h3>
          </InfoTooltip>
          <VirtualTable data={configIssues} columns={issueColumns} globalFilter={filters.search} onRowClick={openVmDetail} />
        </div>
        {filteredSnapshots.length > 0 && (
          <div>
            <InfoTooltip entry={DAILY_OPS_SECTIONS.snapshotsTable} side="bottom">
              <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Snapshots ({filteredSnapshots.length})</h3>
            </InfoTooltip>
            <VirtualTable data={filteredSnapshots} columns={snapshotColumns} globalFilter={filters.search} onRowClick={openVmDetail} />
          </div>
        )}
        <VmToolsWavePlan />
      </div>
      {vmDetailDialog}
    </div>
  );
}
