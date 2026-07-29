import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Gauge, MemoryStick, Network, Timer, Zap } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useActiveSnapshotIds, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { PERFORMANCE_KPI, PERFORMANCE_MEM_COLUMNS, PERFORMANCE_ENTITLEMENT_COLUMNS, PERFORMANCE_FT_COLUMNS, PERFORMANCE_PERF_COLUMNS, PERFORMANCE_SECTIONS, PERFORMANCE_VMNET_COLUMNS } from "@/lib/glossaries/performance";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";
import type { NormalizedVm } from "@/domain/models/types";

interface MemoryIssueVm { snapshotId: string; vmName: string; cluster: string | null; host: string | null; sizeMiB: number; swapped: number; ballooned: number; active: number }
interface EntitlementRow { snapshotId: string; vm: string; cluster: string; cpuEntitlement: number; cpuDrsEntitlement: number; cpuOverall: number; cpuDelta: number; memEntitlement: number; memActive: number; memDelta: number }
interface FtRow { snapshotId: string; vm: string; ftState: string; ftRole: string; ftLatency: number; ftSecLatency: number; ftBandwidth: number; risk: string }
interface VmNetAnomalyRow { snapshotId: string; vm: string; nic: string; network: string; connected: boolean; ipv4: string; issue: string }
interface LatencyRow { snapshotId: string; vm: string; cluster: string; host: string; latencySensitivity: string }

const perfColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: PERFORMANCE_PERF_COLUMNS.vmName } },
  { accessorKey: "cpuReady", header: "CPU Ready %", meta: { info: PERFORMANCE_PERF_COLUMNS.cpuReady }, cell: ({ getValue }) => { const value = getValue() as number | null; if (value === null) return "—"; return <span className={value > 10 ? "text-destructive font-semibold" : value > 5 ? "text-warning" : ""}>{value.toFixed(1)}%</span>; } },
  { accessorKey: "cpuCount", header: "vCPU", meta: { info: PERFORMANCE_PERF_COLUMNS.cpuCount } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: PERFORMANCE_PERF_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: PERFORMANCE_PERF_COLUMNS.host } },
  { accessorKey: "powerState", header: "Power", meta: { info: PERFORMANCE_PERF_COLUMNS.powerState } },
];
const memColumns: ColumnDef<MemoryIssueVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: PERFORMANCE_MEM_COLUMNS.vmName } },
  { accessorKey: "sizeMiB", header: "RAM", meta: { info: PERFORMANCE_MEM_COLUMNS.sizeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "swapped", header: "Swapped MiB", meta: { info: PERFORMANCE_MEM_COLUMNS.swapped }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 0 ? "text-destructive font-semibold" : ""}>{value.toLocaleString("de-DE")}</span>; } },
  { accessorKey: "ballooned", header: "Ballooned MiB", meta: { info: PERFORMANCE_MEM_COLUMNS.ballooned }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 0 ? "text-warning font-semibold" : ""}>{value.toLocaleString("de-DE")}</span>; } },
  { accessorKey: "active", header: "Active MiB", meta: { info: PERFORMANCE_MEM_COLUMNS.active }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "cluster", header: "Cluster", meta: { info: PERFORMANCE_MEM_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: PERFORMANCE_MEM_COLUMNS.host } },
];
const entitlementColumns: ColumnDef<EntitlementRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.vm } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cluster } },
  { accessorKey: "cpuEntitlement", header: "CPU Entitlement", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cpuEntitlement } },
  { accessorKey: "cpuDrsEntitlement", header: "DRS Entitlement", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cpuDrsEntitlement } },
  { accessorKey: "cpuOverall", header: "CPU Overall", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cpuOverall } },
  { accessorKey: "cpuDelta", header: "CPU Delta", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cpuDelta }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={Math.abs(value) > 500 ? "text-warning font-semibold" : ""}>{value}</span>; } },
  { accessorKey: "memEntitlement", header: "Mem Entitl.", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memEntitlement } },
  { accessorKey: "memActive", header: "Mem Active", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memActive } },
  { accessorKey: "memDelta", header: "Mem Delta", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memDelta }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={Math.abs(value) > 1024 ? "text-warning font-semibold" : ""}>{value}</span>; } },
];
const ftColumns: ColumnDef<FtRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: PERFORMANCE_FT_COLUMNS.vm } },
  { accessorKey: "ftState", header: "FT State", meta: { info: PERFORMANCE_FT_COLUMNS.ftState } },
  { accessorKey: "ftRole", header: "FT Role", meta: { info: PERFORMANCE_FT_COLUMNS.ftRole } },
  { accessorKey: "ftLatency", header: "Latency (ms)", meta: { info: PERFORMANCE_FT_COLUMNS.ftLatency } },
  { accessorKey: "ftSecLatency", header: "Sec. Latency (ms)", meta: { info: PERFORMANCE_FT_COLUMNS.ftSecLatency } },
  { accessorKey: "ftBandwidth", header: "Bandwidth", meta: { info: PERFORMANCE_FT_COLUMNS.ftBandwidth } },
  { accessorKey: "risk", header: "Risiko", meta: { info: PERFORMANCE_FT_COLUMNS.risk }, cell: ({ getValue }) => { const value = getValue() as string; return <span className={value === "hoch" ? "text-destructive font-semibold" : value === "mittel" ? "text-warning" : "text-success"}>{value}</span>; } },
];
const vmNetColumns: ColumnDef<VmNetAnomalyRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: PERFORMANCE_VMNET_COLUMNS.vm } },
  { accessorKey: "nic", header: "NIC", meta: { info: PERFORMANCE_VMNET_COLUMNS.nic } },
  { accessorKey: "network", header: "Netzwerk", meta: { info: PERFORMANCE_VMNET_COLUMNS.network } },
  { accessorKey: "connected", header: "Verbunden", meta: { info: PERFORMANCE_VMNET_COLUMNS.connected }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-destructive">Nein</span> },
  { accessorKey: "ipv4", header: "IPv4", meta: { info: PERFORMANCE_VMNET_COLUMNS.ipv4 } },
  { accessorKey: "issue", header: "Problem", meta: { info: PERFORMANCE_VMNET_COLUMNS.issue }, cell: ({ getValue }) => <span className="text-warning">{getValue() as string}</span> },
];
const latencyColumns: ColumnDef<LatencyRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "latencySensitivity", header: "Latency Sensitivity" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
];

export function VmPerformancePanel() {
  const { filters } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: rawMemory = [], isLoading: memoryLoading } = useRawSheet("vMemory");
  const { data: rawCpu = [], isLoading: cpuLoading } = useRawSheet("vCPU");
  const { data: rawNetwork = [], isLoading: networkLoading } = useRawSheet("vNetwork");
  const { data: rawInfo = [], isLoading: infoLoading } = useRawSheet("vInfo");
  const filteredMemory = useMemo(() => filterVmRows(rawMemory), [filterVmRows, rawMemory]);
  const filteredCpu = useMemo(() => filterVmRows(rawCpu), [filterVmRows, rawCpu]);
  const filteredNetwork = useMemo(() => filterVmRows(rawNetwork), [filterVmRows, rawNetwork]);
  const filteredInfo = useMemo(() => filterVmRows(rawInfo), [filterVmRows, rawInfo]);
  const cpuReadyVms = useMemo(() => [...vms].filter((vm) => vm.cpuReady !== null && vm.cpuReady > 0).sort((left, right) => (right.cpuReady || 0) - (left.cpuReady || 0)), [vms]);
  const topChart = useMemo(() => cpuReadyVms.slice(0, 15).map((vm) => ({ name: vm.vmName.length > 18 ? `${vm.vmName.slice(0, 16)}…` : vm.vmName, cpuReady: vm.cpuReady })), [cpuReadyVms]);
  const memoryIssues = useMemo<MemoryIssueVm[]>(() => filteredMemory.map((row) => ({
    snapshotId: row.snapshotId,
    vmName: String(row.data["VM"] || ""),
    cluster: row.data["Cluster"] as string | null,
    host: row.data["Host"] as string | null,
    sizeMiB: Number(row.data["Size MiB"] || 0),
    swapped: Number(row.data["Swapped"] || 0),
    ballooned: Number(row.data["Ballooned"] || 0),
    active: Number(row.data["Active"] || 0),
  })).filter((row) => row.swapped > 0 || row.ballooned > 0).sort((left, right) => right.swapped + right.ballooned - left.swapped - left.ballooned), [filteredMemory]);
  const entitlementGaps = useMemo<EntitlementRow[]>(() => filteredCpu.map((row) => {
    if (String(row.data["Powerstate"] || "").toLowerCase() !== "poweredon") return null;
    const cpuEntitlement = Number(row.data["Entitlement"] || 0);
    const cpuDrsEntitlement = Number(row.data["DRS Entitlement"] || 0);
    const cpuOverall = Number(row.data["Overall"] || 0);
    const cpuDelta = cpuEntitlement - cpuOverall;
    if (Math.abs(cpuDelta) <= 200) return null;
    return { snapshotId: row.snapshotId, vm: String(row.data["VM"] || ""), cluster: String(row.data["Cluster"] || ""), cpuEntitlement, cpuDrsEntitlement, cpuOverall, cpuDelta, memEntitlement: 0, memActive: 0, memDelta: 0 };
  }).filter((row): row is EntitlementRow => row !== null).sort((left, right) => Math.abs(right.cpuDelta) - Math.abs(left.cpuDelta)), [filteredCpu]);
  const entitlementFull = useMemo(() => {
    const memoryByVm = new Map(filteredMemory.map((row) => [String(row.data["VM"] || ""), { entitlement: Number(row.data["Entitlement"] || 0), active: Number(row.data["Active"] || 0) }]));
    return entitlementGaps.map((row) => {
      const memory = memoryByVm.get(row.vm);
      return memory ? { ...row, memEntitlement: memory.entitlement, memActive: memory.active, memDelta: memory.entitlement - memory.active } : row;
    });
  }, [entitlementGaps, filteredMemory]);
  const ftData = useMemo<FtRow[]>(() => filteredInfo.flatMap((row) => {
    const ftState = String(row.data["FT State"] || "");
    if (!ftState || ftState === "notConfigured") return [];
    const ftLatency = Number(row.data["FT Latency"] || 0);
    const ftSecLatency = Number(row.data["FT Sec. Latency"] || 0);
    const risk = ftLatency > 10 || ftSecLatency > 10 ? "hoch" : ftLatency > 5 || ftSecLatency > 5 ? "mittel" : "niedrig";
    return [{ snapshotId: row.snapshotId, vm: String(row.data["VM"] || ""), ftState, ftRole: String(row.data["FT Role"] || ""), ftLatency, ftSecLatency, ftBandwidth: Number(row.data["FT Bandwidth"] || 0), risk }];
  }), [filteredInfo]);
  const vmNetAnomalies = useMemo<VmNetAnomalyRow[]>(() => filteredNetwork.flatMap((row) => {
    const connected = String(row.data["Connected"] || "").toLowerCase() === "true";
    const ipv4 = String(row.data["IPv4 Address"] || "");
    if (String(row.data["Powerstate"] || "").toLowerCase() !== "poweredon" || (connected && ipv4)) return [];
    const issues = [!connected ? "Disconnected" : "", !ipv4 ? "Keine IPv4" : ""].filter(Boolean).join(", ");
    return [{ snapshotId: row.snapshotId, vm: String(row.data["VM"] || ""), nic: String(row.data["NIC label"] || ""), network: String(row.data["Network"] || ""), connected, ipv4: ipv4 || "—", issue: issues }];
  }), [filteredNetwork]);
  const latencyCases = useMemo<LatencyRow[]>(() => filteredInfo.flatMap((row) => {
    const latencySensitivity = String(row.data["Latency Sensitivity"] || "normal");
    if (!latencySensitivity || latencySensitivity === "normal") return [];
    return [{ snapshotId: row.snapshotId, vm: String(row.data["VM"] || ""), cluster: String(row.data["Cluster"] || ""), host: String(row.data["Host"] || ""), latencySensitivity }];
  }), [filteredInfo]);
  const dataLoading = memoryLoading || cpuLoading || networkLoading || infoLoading;
  if (dataLoading) return <PanelLoadingState />;
  const hotspots = cpuReadyVms.filter((vm) => (vm.cpuReady || 0) > 5).length;

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="CPU Ready Hotspots" value={formatNum(hotspots)} severity={hotspots > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} subtitle="> 5% Ready" info={PERFORMANCE_KPI.cpuReadyHotspots} />
        <KpiCard title="Memory Pressure" value={formatNum(memoryIssues.length)} severity={memoryIssues.length > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} info={PERFORMANCE_KPI.memoryPressure} />
        <KpiCard title="Entitlement Gaps" value={formatNum(entitlementFull.length)} severity={entitlementFull.length > 0 ? "warn" : "ok"} icon={<Zap className="h-4 w-4" />} info={PERFORMANCE_KPI.entitlementGaps} />
        <KpiCard title="FT VMs" value={formatNum(ftData.length)} severity={ftData.some((row) => row.risk === "hoch") ? "crit" : ftData.length > 0 ? "warn" : "ok"} info={PERFORMANCE_KPI.ftVms} />
        <KpiCard title="VM Netz-Anomalien" value={formatNum(vmNetAnomalies.length)} severity={vmNetAnomalies.length > 0 ? "warn" : "ok"} icon={<Network className="h-4 w-4" />} info={PERFORMANCE_KPI.vmNetAnomalies} />
        <KpiCard title="Latency Sensitivity" value={formatNum(latencyCases.length)} severity={latencyCases.length > 0 ? "warn" : "ok"} icon={<Timer className="h-4 w-4" />} info={PERFORMANCE_KPI.latencyCases} />
      </KpiGrid>

      {topChart.length > 0 && <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <InfoTooltip entry={PERFORMANCE_SECTIONS.topCpuReady} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Top CPU Ready VMs</h3></InfoTooltip>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={topChart} layout="vertical"><XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="cpuReady" radius={[0, 4, 4, 0]}>{topChart.map((entry) => <Cell key={entry.name} fill={(entry.cpuReady || 0) > 10 ? CHART_COLORS.danger : (entry.cpuReady || 0) > 5 ? CHART_COLORS.warning : CHART_COLORS.primary} />)}</Bar></BarChart>
        </ResponsiveContainer>
      </div>}

      <div><InfoTooltip entry={PERFORMANCE_SECTIONS.cpuReadyDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">CPU Ready Details ({cpuReadyVms.length})</h3></InfoTooltip><VirtualTable data={cpuReadyVms} columns={perfColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>
      {memoryIssues.length > 0 && <div><InfoTooltip entry={PERFORMANCE_SECTIONS.memoryPressure} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Memory Pressure — Swapped / Ballooned ({memoryIssues.length})</h3></InfoTooltip><VirtualTable data={memoryIssues} columns={memColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>}
      {entitlementFull.length > 0 && <div><InfoTooltip entry={PERFORMANCE_SECTIONS.entitlementGaps} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Entitlement Gaps ({entitlementFull.length})</h3></InfoTooltip><VirtualTable data={entitlementFull} columns={entitlementColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>}
      {ftData.length > 0 && <div><InfoTooltip entry={PERFORMANCE_SECTIONS.ftLatency} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">FT Latenz Monitoring ({ftData.length})</h3></InfoTooltip><VirtualTable data={ftData} columns={ftColumns} globalFilter={filters.search} height={250} onRowClick={openVmDetail} /></div>}
      {vmNetAnomalies.length > 0 && <div><InfoTooltip entry={PERFORMANCE_SECTIONS.vmNetAnomalies} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Netzwerkanomalien ({vmNetAnomalies.length})</h3></InfoTooltip><VirtualTable data={vmNetAnomalies} columns={vmNetColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>}
      {latencyCases.length > 0 && <div><InfoTooltip entry={PERFORMANCE_SECTIONS.latencyCases} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-warning">Latency Sensitivity Sonderfälle ({latencyCases.length})</h3></InfoTooltip><VirtualTable data={latencyCases} columns={latencyColumns} globalFilter={filters.search} height={260} onRowClick={openVmDetail} /></div>}
      {vmDetailDialog}
    </div>
  );
}
