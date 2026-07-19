import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useRawSheet, useDatastores } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Gauge, MemoryStick, Activity, Network, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "@/components/charts/recharts";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  PERFORMANCE_KPI,
  PERFORMANCE_PERF_COLUMNS,
  PERFORMANCE_MEM_COLUMNS,
  PERFORMANCE_ENTITLEMENT_COLUMNS,
  PERFORMANCE_FT_COLUMNS,
  PERFORMANCE_VMNET_COLUMNS,
  PERFORMANCE_SIOC_COLUMNS,
  PERFORMANCE_NIC_COLUMNS,
  PERFORMANCE_SECTIONS,
} from "@/lib/glossaries/performance";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

interface MemoryIssueVm { snapshotId: string; vmName: string; cluster: string | null; host: string | null; sizeMiB: number; swapped: number; ballooned: number; active: number }
interface EntitlementRow { snapshotId: string; vm: string; cluster: string; cpuEntitlement: number; cpuDrsEntitlement: number; cpuOverall: number; cpuDelta: number; memEntitlement: number; memActive: number; memDelta: number }
interface FtRow { snapshotId: string; vm: string; ftState: string; ftRole: string; ftLatency: number; ftSecLatency: number; ftBandwidth: number; risk: string }
interface VmNetAnomalyRow { snapshotId: string; vm: string; nic: string; network: string; connected: boolean; ipv4: string; issue: string }
interface SiocRow { datastore: string; siocEnabled: boolean; siocThreshold: number; freePct: number; risk: string }
interface NicQualityRow { host: string; device: string; speed: number; duplex: boolean; issue: string }

const perfColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: PERFORMANCE_PERF_COLUMNS.vmName } },
  { accessorKey: "cpuReady", header: "CPU Ready %", meta: { info: PERFORMANCE_PERF_COLUMNS.cpuReady }, cell: ({ getValue }) => { const v = getValue() as number | null; if (v === null) return "—"; return <span className={v > 10 ? "text-destructive font-semibold" : v > 5 ? "text-warning" : ""}>{v.toFixed(1)}%</span>; }},
  { accessorKey: "cpuCount", header: "vCPU", meta: { info: PERFORMANCE_PERF_COLUMNS.cpuCount } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: PERFORMANCE_PERF_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: PERFORMANCE_PERF_COLUMNS.host } },
  { accessorKey: "powerState", header: "Power", meta: { info: PERFORMANCE_PERF_COLUMNS.powerState } },
];

const memColumns: ColumnDef<MemoryIssueVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: PERFORMANCE_MEM_COLUMNS.vmName } },
  { accessorKey: "sizeMiB", header: "RAM", meta: { info: PERFORMANCE_MEM_COLUMNS.sizeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "swapped", header: "Swapped MiB", meta: { info: PERFORMANCE_MEM_COLUMNS.swapped }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-destructive font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>; }},
  { accessorKey: "ballooned", header: "Ballooned MiB", meta: { info: PERFORMANCE_MEM_COLUMNS.ballooned }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-warning font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>; }},
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
  { accessorKey: "cpuDelta", header: "CPU Delta", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.cpuDelta }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={Math.abs(v) > 500 ? "text-warning font-semibold" : ""}>{v}</span>; }},
  { accessorKey: "memEntitlement", header: "Mem Entitl.", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memEntitlement } },
  { accessorKey: "memActive", header: "Mem Active", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memActive } },
  { accessorKey: "memDelta", header: "Mem Delta", meta: { info: PERFORMANCE_ENTITLEMENT_COLUMNS.memDelta }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={Math.abs(v) > 1024 ? "text-warning font-semibold" : ""}>{v}</span>; }},
];

const ftColumns: ColumnDef<FtRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: PERFORMANCE_FT_COLUMNS.vm } },
  { accessorKey: "ftState", header: "FT State", meta: { info: PERFORMANCE_FT_COLUMNS.ftState } },
  { accessorKey: "ftRole", header: "FT Role", meta: { info: PERFORMANCE_FT_COLUMNS.ftRole } },
  { accessorKey: "ftLatency", header: "Latency (ms)", meta: { info: PERFORMANCE_FT_COLUMNS.ftLatency } },
  { accessorKey: "ftSecLatency", header: "Sec. Latency (ms)", meta: { info: PERFORMANCE_FT_COLUMNS.ftSecLatency } },
  { accessorKey: "ftBandwidth", header: "Bandwidth", meta: { info: PERFORMANCE_FT_COLUMNS.ftBandwidth } },
  { accessorKey: "risk", header: "Risiko", meta: { info: PERFORMANCE_FT_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const vmNetColumns: ColumnDef<VmNetAnomalyRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: PERFORMANCE_VMNET_COLUMNS.vm } },
  { accessorKey: "nic", header: "NIC", meta: { info: PERFORMANCE_VMNET_COLUMNS.nic } },
  { accessorKey: "network", header: "Netzwerk", meta: { info: PERFORMANCE_VMNET_COLUMNS.network } },
  { accessorKey: "connected", header: "Verbunden", meta: { info: PERFORMANCE_VMNET_COLUMNS.connected }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-destructive">Nein</span> },
  { accessorKey: "ipv4", header: "IPv4", meta: { info: PERFORMANCE_VMNET_COLUMNS.ipv4 } },
  { accessorKey: "issue", header: "Problem", meta: { info: PERFORMANCE_VMNET_COLUMNS.issue }, cell: ({ getValue }) => <span className="text-warning">{getValue() as string}</span> },
];

const siocColumns: ColumnDef<SiocRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore", meta: { info: PERFORMANCE_SIOC_COLUMNS.datastore } },
  { accessorKey: "siocEnabled", header: "SIOC", meta: { info: PERFORMANCE_SIOC_COLUMNS.siocEnabled }, cell: ({ getValue }) => getValue() ? <span className="text-success">An</span> : <span className="text-muted-foreground">Aus</span> },
  { accessorKey: "siocThreshold", header: "Threshold (ms)", meta: { info: PERFORMANCE_SIOC_COLUMNS.siocThreshold } },
  { accessorKey: "freePct", header: "Frei %", meta: { info: PERFORMANCE_SIOC_COLUMNS.freePct }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive" : v < 20 ? "text-warning" : ""}>{v.toFixed(1)}%</span>; }},
  { accessorKey: "risk", header: "Risiko", meta: { info: PERFORMANCE_SIOC_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : ""}>{v}</span>; }},
];

const nicQualityColumns: ColumnDef<NicQualityRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: PERFORMANCE_NIC_COLUMNS.host } },
  { accessorKey: "device", header: "NIC", meta: { info: PERFORMANCE_NIC_COLUMNS.device } },
  { accessorKey: "speed", header: "Speed (Mbps)", meta: { info: PERFORMANCE_NIC_COLUMNS.speed }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "duplex", header: "Full Duplex", meta: { info: PERFORMANCE_NIC_COLUMNS.duplex }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "issue", header: "Problem", meta: { info: PERFORMANCE_NIC_COLUMNS.issue }, cell: ({ getValue }) => <span className="text-warning">{getValue() as string}</span> },
];

export default function PerformancePage() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, allVms, isLoading: vmsLoading } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: rawVMemory = [], isLoading: rawVMemoryLoading } = useRawSheet("vMemory");
  const { data: rawVCPU = [], isLoading: rawVCPULoading } = useRawSheet("vCPU");
  const { data: rawMultiPath = [], isLoading: rawMultiPathLoading } = useRawSheet("vMultiPath");
  const { data: rawVNetwork = [], isLoading: rawVNetworkLoading } = useRawSheet("vNetwork");
  const { data: rawNIC = [], isLoading: rawNICLoading } = useRawSheet("vNIC");
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const filteredRawVMemory = useMemo(() => filterVmRows(rawVMemory), [filterVmRows, rawVMemory]);
  const filteredRawVCPU = useMemo(() => filterVmRows(rawVCPU), [filterVmRows, rawVCPU]);
  const filteredRawVNetwork = useMemo(() => filterVmRows(rawVNetwork), [filterVmRows, rawVNetwork]);

  const cpuReadyVms = useMemo(() => vms.filter((v) => v.cpuReady !== null && v.cpuReady > 0).sort((a, b) => (b.cpuReady || 0) - (a.cpuReady || 0)), [vms]);
  const hotspots = cpuReadyVms.filter((v) => (v.cpuReady || 0) > 5).length;
  const topChart = useMemo(() => cpuReadyVms.slice(0, 15).map((v) => ({ name: v.vmName.length > 18 ? v.vmName.slice(0, 16) + "…" : v.vmName, cpuReady: v.cpuReady })), [cpuReadyVms]);

  const memoryIssues = useMemo<MemoryIssueVm[]>(() => {
    const rows: MemoryIssueVm[] = [];
    for (const r of filteredRawVMemory) {
      const swapped = Number(r.data["Swapped"] || 0);
      const ballooned = Number(r.data["Ballooned"] || 0);
      if (swapped > 0 || ballooned > 0) {
        rows.push({ snapshotId: r.snapshotId, vmName: String(r.data["VM"] || ""), cluster: r.data["Cluster"] as string | null, host: r.data["Host"] as string | null, sizeMiB: Number(r.data["Size MiB"] || 0), swapped, ballooned, active: Number(r.data["Active"] || 0) });
      }
    }
    return rows.sort((a, b) => (b.swapped + b.ballooned) - (a.swapped + a.ballooned));
  }, [filteredRawVMemory]);

  const multipathIssues = rawMultiPath.filter((r) => {
    const s = String(r.data["Oper. State"] || "").toLowerCase();
    if (s !== "" && s !== "ok") return true;
    for (let i = 1; i <= 8; i++) { if (String(r.data[`Path ${i} state`] || "").toLowerCase() === "dead") return true; }
    return false;
  }).length;

  // Entitlement Gaps
  const entitlementGaps = useMemo<EntitlementRow[]>(() => {
    const rows: EntitlementRow[] = [];
    for (const r of filteredRawVCPU) {
      if (String(r.data["Powerstate"] || "").toLowerCase() !== "poweredon") continue;
      const cpuEnt = Number(r.data["Entitlement"] || 0);
      const cpuDrs = Number(r.data["DRS Entitlement"] || 0);
      const cpuOver = Number(r.data["Overall"] || 0);
      const cpuDelta = cpuEnt - cpuOver;
      if (Math.abs(cpuDelta) > 200) {
        rows.push({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), cluster: String(r.data["Cluster"] || ""), cpuEntitlement: cpuEnt, cpuDrsEntitlement: cpuDrs, cpuOverall: cpuOver, cpuDelta, memEntitlement: 0, memActive: 0, memDelta: 0 });
      }
    }
    return rows.sort((a, b) => Math.abs(b.cpuDelta) - Math.abs(a.cpuDelta));
  }, [filteredRawVCPU]);

  // Enrich with memory entitlement
  const entitlementFull = useMemo<EntitlementRow[]>(() => {
    const memMap = new Map<string, { ent: number; active: number }>();
    for (const r of filteredRawVMemory) {
      const vm = String(r.data["VM"] || "");
      memMap.set(vm, { ent: Number(r.data["Entitlement"] || 0), active: Number(r.data["Active"] || 0) });
    }
    return entitlementGaps.map((e) => {
      const m = memMap.get(e.vm);
      if (m) { e.memEntitlement = m.ent; e.memActive = m.active; e.memDelta = m.ent - m.active; }
      return e;
    });
  }, [entitlementGaps, filteredRawVMemory]);

  // Actually get FT from raw vInfo
  const { data: rawVInfo = [], isLoading: rawVInfoLoading } = useRawSheet("vInfo");
  const filteredRawVInfo = useMemo(() => filterVmRows(rawVInfo), [filterVmRows, rawVInfo]);
  const ftData = useMemo<FtRow[]>(() => {
    const rows: FtRow[] = [];
    for (const r of filteredRawVInfo) {
      const ftState = String(r.data["FT State"] || "");
      if (!ftState || ftState === "notConfigured") continue;
      const lat = Number(r.data["FT Latency"] || 0);
      const secLat = Number(r.data["FT Sec. Latency"] || 0);
      let risk = "niedrig";
      if (lat > 5 || secLat > 5) risk = "mittel";
      if (lat > 10 || secLat > 10) risk = "hoch";
      rows.push({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), ftState, ftRole: String(r.data["FT Role"] || ""), ftLatency: lat, ftSecLatency: secLat, ftBandwidth: Number(r.data["FT Bandwidth"] || 0), risk });
    }
    return rows;
  }, [filteredRawVInfo]);

  // VM Network Anomalies
  const vmNetAnomalies = useMemo<VmNetAnomalyRow[]>(() => {
    const rows: VmNetAnomalyRow[] = [];
    for (const r of filteredRawVNetwork) {
      const connected = String(r.data["Connected"] || "").toLowerCase() === "true";
      const ip = String(r.data["IPv4 Address"] || "");
      const powerState = String(r.data["Powerstate"] || "").toLowerCase();
      if (powerState !== "poweredon" || (connected && ip)) continue;
      const issues: string[] = [];
      if (!connected) issues.push("Disconnected");
      if (!ip) issues.push("Keine IPv4");
      rows.push({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), nic: String(r.data["NIC label"] || ""), network: String(r.data["Network"] || ""), connected, ipv4: ip || "—", issue: issues.join(", ") });
    }
    return rows;
  }, [filteredRawVNetwork]);

  // SIOC Congestion Context
  const siocData = useMemo<SiocRow[]>(() => {
    const rows: SiocRow[] = [];
    for (const ds of datastores) {
      const sioc = ds.siocEnabled === true;
      const freePct = ds.freePct ?? 100;
      let risk = "niedrig";
      if (freePct < 20 && !sioc) risk = "mittel";
      if (freePct < 10) risk = "hoch";
      if (risk !== "niedrig" || sioc) rows.push({ datastore: ds.name, siocEnabled: sioc, siocThreshold: 30, freePct, risk });
    }
    return rows.sort((a, b) => a.freePct - b.freePct);
  }, [datastores]);

  // Host NIC Link Quality
  const nicQuality = useMemo<NicQualityRow[]>(() => {
    const rows: NicQualityRow[] = [];
    for (const r of rawNIC) {
      const speed = Number(String(r.data["Speed"] || "0").replace(/,/g, ""));
      const duplex = String(r.data["Duplex"] || "").toLowerCase() === "true";
      const issues: string[] = [];
      if (speed < 10000) issues.push(`Low speed (${speed} Mbps)`);
      if (!duplex) issues.push("Half Duplex");
      if (issues.length > 0) {
        rows.push({ host: String(r.data["Host"] || ""), device: String(r.data["Network Device"] || ""), speed, duplex, issue: issues.join(", ") });
      }
    }
    return rows;
  }, [rawNIC]);

  const dataLoading = snapshotsLoading || vmsLoading || rawVMemoryLoading || rawVCPULoading
    || rawMultiPathLoading || rawVNetworkLoading || rawNICLoading || datastoresLoading || rawVInfoLoading;
  if (dataLoading) return <PageLoadingState title="Performance" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Performance</h1><EmptyState icon={<Gauge className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Performance">
      </PageHeader>
      <GlobalFilterScopeHint text="Multipath, Datastore-SIOC und Host-NIC-Qualität bleiben unverändert; VM-bezogene Performance-Sichten folgen dem globalen Filter." />
      <KpiGrid>
        <KpiCard title="CPU Ready Hotspots" value={formatNum(hotspots)} severity={hotspots > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} subtitle="> 5% Ready" info={PERFORMANCE_KPI.cpuReadyHotspots} />
        <KpiCard title="Memory Pressure" value={formatNum(memoryIssues.length)} severity={memoryIssues.length > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} info={PERFORMANCE_KPI.memoryPressure} />
        <KpiCard title="Entitlement Gaps" value={formatNum(entitlementFull.length)} severity={entitlementFull.length > 0 ? "warn" : "ok"} icon={<Zap className="h-4 w-4" />} info={PERFORMANCE_KPI.entitlementGaps} />
        <KpiCard title="FT VMs" value={formatNum(ftData.length)} severity={ftData.some((f) => f.risk === "hoch") ? "crit" : ftData.length > 0 ? "warn" : "ok"} info={PERFORMANCE_KPI.ftVms} />
        <KpiCard title="VM Netz-Anomalien" value={formatNum(vmNetAnomalies.length)} severity={vmNetAnomalies.length > 0 ? "warn" : "ok"} icon={<Network className="h-4 w-4" />} info={PERFORMANCE_KPI.vmNetAnomalies} />
        <KpiCard title="Multipath Issues" value={formatNum(multipathIssues)} severity={multipathIssues > 0 ? "crit" : "ok"} icon={<Activity className="h-4 w-4" />} info={PERFORMANCE_KPI.multipathIssues} />
        <KpiCard title="NIC Qualität" value={formatNum(nicQuality.length)} severity={nicQuality.length > 0 ? "warn" : "ok"} subtitle="Probleme" info={PERFORMANCE_KPI.nicQuality} />
      </KpiGrid>

      {topChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={PERFORMANCE_SECTIONS.topCpuReady} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Top CPU Ready VMs</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topChart} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="cpuReady" radius={[0, 4, 4, 0]}>
                {topChart.map((entry) => <Cell key={entry.name} fill={(entry.cpuReady || 0) > 10 ? CHART_COLORS.danger : (entry.cpuReady || 0) > 5 ? CHART_COLORS.warning : CHART_COLORS.primary} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div><InfoTooltip entry={PERFORMANCE_SECTIONS.cpuReadyDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">CPU Ready Details</h3></InfoTooltip><VirtualTable data={cpuReadyVms} columns={perfColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>

      {memoryIssues.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.memoryPressure} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Memory Pressure — Swapped / Ballooned ({memoryIssues.length})</h3></InfoTooltip><VirtualTable data={memoryIssues} columns={memColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>)}

      {entitlementFull.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.entitlementGaps} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Entitlement Gaps ({entitlementFull.length})</h3></InfoTooltip><VirtualTable data={entitlementFull} columns={entitlementColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>)}

      {ftData.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.ftLatency} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">FT Latenz Monitoring ({ftData.length})</h3></InfoTooltip><VirtualTable data={ftData} columns={ftColumns} globalFilter={filters.search} height={250} onRowClick={openVmDetail} /></div>)}

      {vmNetAnomalies.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.vmNetAnomalies} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Netzwerkanomalien ({vmNetAnomalies.length})</h3></InfoTooltip><VirtualTable data={vmNetAnomalies} columns={vmNetColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>)}

      {siocData.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.sioc} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Storage Congestion / SIOC ({siocData.length})</h3></InfoTooltip><VirtualTable data={siocData} columns={siocColumns} globalFilter={filters.search} height={250} /></div>)}

      {nicQuality.length > 0 && (<div><InfoTooltip entry={PERFORMANCE_SECTIONS.nicQuality} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host NIC Link Qualität ({nicQuality.length})</h3></InfoTooltip><VirtualTable data={nicQuality} columns={nicQualityColumns} globalFilter={filters.search} height={250} onRowClick={openHostDetail} /></div>)}
      {vmDetailDialog}
      {hostDetailDialog}
    </div>
  );
}
