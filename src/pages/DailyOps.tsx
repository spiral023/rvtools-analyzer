import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useHealthEvents, useVmSnapshots, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Activity, AlertTriangle, Camera, Wrench, Unplug, Disc } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "@/components/charts/recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { buildVmJoinKey } from "@/lib/globalFilter";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DAILY_OPS_KPI, DAILY_OPS_COLUMNS, DAILY_OPS_SECTIONS } from "@/lib/glossaries/dailyOps";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedSnapshot, NormalizedHealth } from "@/domain/models/types";

function parseSnapshotDate(value: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && raw.match(/^\d+(\.\d+)?$/)) {
    const epochUtc = Date.UTC(1899, 11, 30);
    return new Date(epochUtc + serial * 86400000);
  }

  const dotted = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (dotted) {
    const [, y, m, d, hh, mm, ss] = dotted;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDe(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = String(date.getUTCFullYear());
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${d}.${m}.${y} ${hh}:${mm}:${ss}`;
}

function formatSnapshotCreated(value: string | null): string {
  const date = parseSnapshotDate(value);
  if (!date) return value || "—";
  return formatDateDe(date);
}

function snapshotAgeDays(value: string | null): number | null {
  const date = parseSnapshotDate(value);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
}

function formatSinceCreation(value: string | null): string {
  const diffDays = snapshotAgeDays(value);
  if (diffDays === null) return "—";
  if (diffDays === 0) return "heute";
  return `vor ${diffDays} ${diffDays === 1 ? "Tag" : "Tagen"}`;
}

const issueColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: DAILY_OPS_COLUMNS.vmName } },
  { accessorKey: "configStatus", header: "Config Status", meta: { info: DAILY_OPS_COLUMNS.configStatus }, cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v || "—"}</span>;
  }},
  { accessorKey: "connectionState", header: "Verbindung", meta: { info: DAILY_OPS_COLUMNS.connectionState } },
  { accessorKey: "powerState", header: "Power", meta: { info: DAILY_OPS_COLUMNS.powerState } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: DAILY_OPS_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: DAILY_OPS_COLUMNS.host } },
  { accessorKey: "osConfig", header: "OS", meta: { info: DAILY_OPS_COLUMNS.osConfig } },
];

const healthColumns: ColumnDef<NormalizedHealth, unknown>[] = [
  { accessorKey: "entity", header: "Entity", meta: { info: DAILY_OPS_COLUMNS.entity } },
  { accessorKey: "messageType", header: "Typ", meta: { info: DAILY_OPS_COLUMNS.messageType } },
  { accessorKey: "message", header: "Meldung", meta: { info: DAILY_OPS_COLUMNS.message } },
];

const snapshotColumns: ColumnDef<NormalizedSnapshot, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: DAILY_OPS_COLUMNS.vmName } },
  { accessorKey: "snapshotName", header: "Snapshot", meta: { info: DAILY_OPS_COLUMNS.snapshotName } },
  { accessorKey: "description", header: "Beschreibung", meta: { info: DAILY_OPS_COLUMNS.description } },
  { accessorKey: "dateTaken", header: "Erstellt", meta: { info: DAILY_OPS_COLUMNS.dateTaken }, cell: ({ getValue }) => formatSnapshotCreated((getValue() as string | null) ?? null) },
  { accessorKey: "dateTaken", id: "ageDays", header: "Seit Erstellung", meta: { info: DAILY_OPS_COLUMNS.ageDays }, cell: ({ getValue }) => {
    const value = (getValue() as string | null) ?? null;
    const diffDays = snapshotAgeDays(value);
    const className = diffDays !== null && diffDays > 14 ? "text-destructive font-semibold" : diffDays !== null && diffDays > 7 ? "text-warning" : "";
    return <span className={className}>{formatSinceCreation(value)}</span>;
  }},
  { accessorKey: "sizeMiB", header: "Größe (GiB)", meta: { info: DAILY_OPS_COLUMNS.sizeMiB }, cell: ({ getValue }) => {
    const v = getValue() as number | null;
    if (v === null) return "—";
    const gib = v / 1024;
    return <span className={v > 51200 ? "text-destructive font-semibold" : v > 20480 ? "text-warning" : ""}>{gib.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</span>;
  }},
  { accessorKey: "quiesced", header: "Quiesced", meta: { info: DAILY_OPS_COLUMNS.quiesced }, cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
];

export default function DailyOps() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows, matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const { data: healthEvents = [] } = useHealthEvents();
  const { data: vmSnapshots = [] } = useVmSnapshots();
  const { data: rawVTools = [] } = useRawSheet("vTools");
  const { data: rawVCD = [] } = useRawSheet("vCD");
  const { data: rawVUSB = [] } = useRawSheet("vUSB");
  const filteredVmSnapshots = useMemo(
    () =>
      matchingVmJoinKeys
        ? vmSnapshots.filter((snapshot) => matchingVmJoinKeys.has(buildVmJoinKey(snapshot.snapshotId, snapshot.vmName)))
        : vmSnapshots,
    [matchingVmJoinKeys, vmSnapshots],
  );
  const filteredRawVTools = useMemo(() => filterVmRows(rawVTools), [filterVmRows, rawVTools]);
  const filteredRawVCD = useMemo(() => filterVmRows(rawVCD), [filterVmRows, rawVCD]);
  const filteredRawVUSB = useMemo(() => filterVmRows(rawVUSB), [filterVmRows, rawVUSB]);

  const configIssues = useMemo(() => vms.filter((v) => v.configStatus && v.configStatus !== "green"), [vms]);
  const consolidationNeeded = useMemo(() => vms.filter((v) => v.consolidationNeeded === true), [vms]);
  const disconnectedVms = useMemo(() => vms.filter((v) => v.connectionState && v.connectionState !== "connected"), [vms]);

  // Tools hygiene
  const toolsIssues = filteredRawVTools.filter((r) => {
    const tools = String(r.data["Tools"] || "");
    return tools !== "" && tools !== "toolsOk";
  }).length;

  // CD/USB connected
  const connectedCD = filteredRawVCD.filter((r) => String(r.data["Connected"]).toLowerCase() === "true").length;
  const connectedUSB = filteredRawVUSB.filter((r) => String(r.data["Connected"]).toLowerCase() === "true").length;

  // Health by type
  const healthByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of healthEvents) { const t = h.messageType || "Unknown"; map.set(t, (map.get(t) || 0) + 1); }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [healthEvents]);

  // Power state distribution
  const powerData = useMemo(() => {
    const on = vms.filter((v) => v.powerState === "poweredOn").length;
    const off = vms.filter((v) => v.powerState === "poweredOff").length;
    const sus = vms.filter((v) => v.powerState === "suspended").length;
    return [
      { name: "Powered On", value: on },
      { name: "Powered Off", value: off },
      { name: "Suspended", value: sus },
    ].filter((d) => d.value > 0);
  }, [vms]);

  if (snapshotsLoading) return <PageLoadingState title="Daily Ops" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Daily Ops</h1><EmptyState icon={<Activity className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Daily Ops</h1>
      <FilterBar />
      <GlobalFilterScopeHint text="Snapshots, Tools, CD/USB und Health-Events mit eindeutigem VM-Entity folgen dem globalen Filter." />
      <KpiGrid>
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={DAILY_OPS_KPI.healthEvents} />
        <KpiCard title="Config Issues" value={formatNum(configIssues.length)} severity={configIssues.length > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} info={DAILY_OPS_KPI.configIssues} />
        <KpiCard title="Consolidation" value={formatNum(consolidationNeeded.length)} severity={consolidationNeeded.length > 0 ? "warn" : "ok"} info={DAILY_OPS_KPI.consolidation} />
        <KpiCard title="Disconnected" value={formatNum(disconnectedVms.length)} severity={disconnectedVms.length > 0 ? "crit" : "ok"} icon={<Unplug className="h-4 w-4" />} info={DAILY_OPS_KPI.disconnected} />
        <KpiCard title="VM Snapshots" value={formatNum(filteredVmSnapshots.length)} severity={filteredVmSnapshots.length > 20 ? "warn" : "ok"} icon={<Camera className="h-4 w-4" />} info={DAILY_OPS_KPI.vmSnapshots} />
        <KpiCard title="Tools Issues" value={formatNum(toolsIssues)} severity={toolsIssues > 0 ? "warn" : "ok"} info={DAILY_OPS_KPI.toolsIssues} />
        <KpiCard title="CD/USB verbunden" value={formatNum(connectedCD + connectedUSB)} severity={connectedCD + connectedUSB > 0 ? "warn" : "ok"} icon={<Disc className="h-4 w-4" />} info={DAILY_OPS_KPI.cdUsb} />
      </KpiGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={DAILY_OPS_SECTIONS.healthByType} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Health Events nach Typ</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={healthByType} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} interval={0} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={DAILY_OPS_SECTIONS.powerState} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Power State</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={powerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={0}>
                {powerData.map((entry, index) => <Cell key={entry.name} fill={SEVERITY_COLORS[index]} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <InfoTooltip entry={DAILY_OPS_SECTIONS.configIssuesTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VMs mit Konfigurationsproblemen ({configIssues.length})</h3>
        </InfoTooltip>
        <VirtualTable data={configIssues} columns={issueColumns} globalFilter={filters.search} onRowClick={openVmDetail} />
      </div>

      {filteredVmSnapshots.length > 0 && (
        <div>
          <InfoTooltip entry={DAILY_OPS_SECTIONS.snapshotsTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Snapshots ({filteredVmSnapshots.length})</h3>
          </InfoTooltip>
          <VirtualTable data={filteredVmSnapshots} columns={snapshotColumns} globalFilter={filters.search} onRowClick={openVmDetail} />
        </div>
      )}
      {healthEvents.length > 0 && (
        <div>
          <InfoTooltip entry={DAILY_OPS_SECTIONS.healthTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Health-Events ({healthEvents.length})</h3>
          </InfoTooltip>
          <VirtualTable data={healthEvents} columns={healthColumns} globalFilter={filters.search} />
        </div>
      )}
      {vmDetailDialog}
    </div>
  );
}
