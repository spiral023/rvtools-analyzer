import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVms, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HostDetailDialog } from "@/pages/Hardware";
import { VmwareVersionsPanel } from "@/pages/VmwareVersions";
import { Shield, Cpu, Wrench, MonitorCheck, Fingerprint, Tag, Clock, Server, Wifi, Globe } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "@/components/charts/recharts";
import { formatNum, parseEsxVersionBuild } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import { buildHostDetails, type HostDetail } from "@/lib/conversion";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, SheetRow } from "@/domain/models/types";

interface ComplianceVm { snapshotId: string; vmName: string; hwVersion: string | null; firmware: string | null; secureBoot: boolean | null; cbt: boolean | null; osConfig: string | null; osTools: string | null; osDrift: boolean; toolsStatus: string | null; cluster: string | null; uuidMissing: boolean; annotationEmpty: boolean; latencySensitivity: string; ftState: string; haRestart: string }
interface DriverRow { host: string; cluster: string; device: string; type: string; driver: string; model: string }
interface NtpRow { host: string; ntpServers: string; ntpdRunning: boolean; dnsServers: string; dhcp: boolean; issues: string }
interface ToolsWaveRow { cluster: string; upgradeableCount: number; totalVms: number; pct: number }
interface HwUpgradeRow { snapshotId: string; vm: string; hwVersion: string; upgradeStatus: string; upgradePolicy: string; target: string; cluster: string }
type ComplianceTab = "compliance" | "operations" | "infrastructure" | "versions";

function ComplianceTabPanel({
  noSecureBoot,
  biosVms,
  noCbt,
  osDrift,
  uuidMissing,
  annotationEmpty,
  complianceVms,
  vcenterVersions,
  hwVersionChart,
  globalFilter,
  onOpenVmDetail,
}: {
  noSecureBoot: number;
  biosVms: number;
  noCbt: number;
  osDrift: number;
  uuidMissing: number;
  annotationEmpty: number;
  complianceVms: ComplianceVm[];
  vcenterVersions: Array<{ name: string; fullname: string; apiVersion: string }>;
  hwVersionChart: Array<{ name: string; value: number }>;
  globalFilter: string;
  onOpenVmDetail: (row: unknown) => void;
}) {
  return (
    <TabsContent value="compliance" className="space-y-4">
      <KpiGrid>
        <KpiCard title="Kein Secure Boot" value={formatNum(noSecureBoot)} severity={noSecureBoot > 0 ? "warn" : "ok"} icon={<Shield className="h-4 w-4" />} />
        <KpiCard title="BIOS (kein EFI)" value={formatNum(biosVms)} severity={biosVms > 0 ? "warn" : "ok"} />
        <KpiCard title="Kein CBT" value={formatNum(noCbt)} severity={noCbt > 0 ? "warn" : "ok"} />
        <KpiCard title="OS Drift" value={formatNum(osDrift)} severity={osDrift > 0 ? "warn" : "ok"} icon={<MonitorCheck className="h-4 w-4" />} />
        <KpiCard title="UUID fehlt" value={formatNum(uuidMissing)} severity={uuidMissing > 0 ? "warn" : "ok"} icon={<Fingerprint className="h-4 w-4" />} />
        <KpiCard title="Annotation leer" value={formatNum(annotationEmpty)} subtitle={`${complianceVms.length > 0 ? Math.round(annotationEmpty / complianceVms.length * 100) : 0}%`} icon={<Tag className="h-4 w-4" />} />
      </KpiGrid>

      {vcenterVersions.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Globe className="h-4 w-4" /> vCenter Versionsstand</h3>
          <div className="space-y-2">{vcenterVersions.map((v) => (<div key={`${v.name}-${v.fullname}-${v.apiVersion}`} className="flex flex-wrap gap-4 text-sm"><span className="font-semibold">{v.name}</span><span className="font-mono-data text-xs text-muted-foreground">{v.fullname}</span><span className="text-xs text-muted-foreground">API: {v.apiVersion}</span></div>))}</div>
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">HW Version Verteilung</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={hwVersionChart}><XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Compliance ({complianceVms.length})</h3><VirtualTable data={complianceVms} columns={compColumns} globalFilter={globalFilter} onRowClick={onOpenVmDetail} /></div>
    </TabsContent>
  );
}

function OperationsTabPanel({
  toolsUpgradeable,
  ntpDnsData,
  hwUpgradeBacklog,
  latencyNonNormal,
  toolsWavePlan,
  complianceVms,
  globalFilter,
  onOpenVmDetail,
  onOpenHostDetail,
}: {
  toolsUpgradeable: number;
  ntpDnsData: NtpRow[];
  hwUpgradeBacklog: HwUpgradeRow[];
  latencyNonNormal: number;
  toolsWavePlan: ToolsWaveRow[];
  complianceVms: ComplianceVm[];
  globalFilter: string;
  onOpenVmDetail: (row: unknown) => void;
  onOpenHostDetail: (row: unknown) => void;
}) {
  return (
    <TabsContent value="operations" className="space-y-4">
      <KpiGrid>
        <KpiCard title="Tools Upgrade" value={formatNum(toolsUpgradeable)} severity={toolsUpgradeable > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="NTP/DNS Issues" value={formatNum(ntpDnsData.length)} severity={ntpDnsData.length > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} />
        <KpiCard title="HW Upgrade Backlog" value={formatNum(hwUpgradeBacklog.length)} severity={hwUpgradeBacklog.length > 0 ? "warn" : "ok"} />
        <KpiCard title="Latency Sonderfälle" value={formatNum(latencyNonNormal)} severity={latencyNonNormal > 0 ? "warn" : "ok"} />
      </KpiGrid>

      {ntpDnsData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> NTP/DNS Hygiene ({ntpDnsData.length})</h3><VirtualTable data={ntpDnsData} columns={ntpColumns} globalFilter={globalFilter} height={300} onRowClick={onOpenHostDetail} /></div>)}

      {hwUpgradeBacklog.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM HW Upgrade Backlog ({hwUpgradeBacklog.length})</h3><VirtualTable data={hwUpgradeBacklog} columns={hwUpgradeColumns} globalFilter={globalFilter} height={300} onRowClick={onOpenVmDetail} /></div>)}

      {toolsWavePlan.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMTools Upgrade Wellenplanung</h3><VirtualTable data={toolsWavePlan} columns={toolsWaveColumns} globalFilter={globalFilter} height={250} /></div>)}

      {latencyNonNormal > 0 && (
        <div className="rounded-lg border border-warning/30 bg-card/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-warning">Latency Sensitivity Sonderfälle ({latencyNonNormal})</h3>
          <div className="space-y-1">{complianceVms.filter((v) => v.latencySensitivity !== "normal" && v.latencySensitivity !== "").map((v) => (<div key={v.vmName} className="flex gap-3 text-sm"><span className="font-mono-data">{v.vmName}</span><span className="text-warning">{v.latencySensitivity}</span><span className="text-muted-foreground">{v.cluster}</span></div>))}</div>
        </div>
      )}
    </TabsContent>
  );
}

function InfrastructureTabPanel({
  maintenanceHosts,
  hostsWithEsxVersion,
  driverInventory,
  cpuMix,
  buildChart,
  hostColumns,
  globalFilter,
  selectedHost,
  rawHBA,
  rawNIC,
  allVms,
  onCloseHostDetail,
  onOpenHostDetail,
}: {
  maintenanceHosts: number;
  hostsWithEsxVersion: NormalizedHost[];
  driverInventory: DriverRow[];
  cpuMix: Array<{ cluster: string; models: number; list: string }>;
  buildChart: Array<{ name: string; value: number }>;
  hostColumns: ColumnDef<NormalizedHost, unknown>[];
  globalFilter: string;
  selectedHost: HostDetail | null;
  rawHBA: SheetRow[];
  rawNIC: SheetRow[];
  allVms: NormalizedVm[];
  onCloseHostDetail: () => void;
  onOpenHostDetail: (row: unknown) => void;
}) {
  return (
    <TabsContent value="infrastructure" className="space-y-4">
      <KpiGrid>
        <KpiCard title="Maintenance" value={formatNum(maintenanceHosts)} severity={maintenanceHosts > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Hosts" value={formatNum(hostsWithEsxVersion.length)} severity="ok" icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Treiber-Einträge" value={formatNum(driverInventory.length)} severity={driverInventory.length > 0 ? "ok" : "warn"} icon={<Wifi className="h-4 w-4" />} />
        <KpiCard title="CPU Mix Cluster" value={formatNum(cpuMix.length)} severity={cpuMix.length > 0 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
      </KpiGrid>

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">ESXi Version/Build</h3>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart><Pie data={buildChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} strokeWidth={0}>{buildChart.map((entry, index) => <Cell key={entry.name} fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]} />)}</Pie><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Legend wrapperStyle={{ fontSize: "11px" }} /></PieChart>
        </ResponsiveContainer>
      </div>

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Inventar ({hostsWithEsxVersion.length})</h3><VirtualTable data={hostsWithEsxVersion} columns={hostColumns} globalFilter={globalFilter} height={350} onRowClick={onOpenHostDetail} /></div>

      {driverInventory.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Wifi className="h-4 w-4" /> HBA/NIC Treiberinventar ({driverInventory.length})</h3><VirtualTable data={driverInventory} columns={driverColumns} globalFilter={globalFilter} height={350} onRowClick={onOpenHostDetail} /></div>)}

      {cpuMix.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU-Generationen Mix je Cluster</h3>
          <div className="space-y-2">{cpuMix.map((c) => (<div key={c.cluster} className="flex items-start gap-2 text-sm"><span className="font-medium text-warning">{c.cluster}</span><span className="text-muted-foreground">— {c.models} Modelle: {c.list}</span></div>))}</div>
        </div>
      )}

      <HostDetailDialog
        host={selectedHost}
        hbaRows={rawHBA}
        nicRows={rawNIC}
        vmRows={allVms}
        open={!!selectedHost}
        onClose={onCloseHostDetail}
      />
    </TabsContent>
  );
}

function parseVmHwVersion(value: string | null | undefined): number | null {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

const compColumns: ColumnDef<ComplianceVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  {
    accessorKey: "hwVersion",
    header: "HW Version",
    cell: ({ getValue }) => {
      const raw = getValue() as string | null;
      const hwVersion = parseVmHwVersion(raw);
      // vmx-13 und älter = ESXi-6.x-Ära (rot); vmx-14..18 = veraltet (gelb).
      // Vorher war alles < 20 rot, wodurch echte Altlasten untergingen.
      if (hwVersion !== null && hwVersion < 14) {
        return <span className="text-destructive font-semibold">{raw || "—"}</span>;
      }
      if (hwVersion !== null && hwVersion < 19) {
        return <span className="text-warning">{raw || "—"}</span>;
      }
      return raw || "—";
    },
  },
  { accessorKey: "firmware", header: "Firmware" },
  { accessorKey: "secureBoot", header: "Secure Boot", cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "cbt", header: "CBT", cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "osDrift", header: "OS Drift", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "uuidMissing", header: "UUID fehlt", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "annotationEmpty", header: "Annotation leer", cell: ({ getValue }) => getValue() ? <span className="text-muted-foreground">Ja</span> : "Nein" },
  { accessorKey: "cluster", header: "Cluster" },
];

function makeHostColumns(onSelectHost: (hostName: string) => void): ColumnDef<NormalizedHost, unknown>[] {
  return [
    {
      accessorKey: "host",
      header: "Host",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono-data hover:underline"
          onClick={() => onSelectHost(row.original.host)}
        >
          {row.original.host}
        </button>
      ),
    },
    { accessorKey: "cluster", header: "Cluster" },
    { accessorKey: "version", header: "ESXi Version" },
    { accessorKey: "build", header: "Build" },
    { accessorKey: "cpuModel", header: "CPU Model" },
    { accessorKey: "vendor", header: "Vendor" },
    { accessorKey: "model", header: "Model" },
    { accessorKey: "maintenanceMode", header: "Maintenance", cell: ({ getValue }) => { const v = getValue() as string; return v === "True" ? <span className="text-warning">Ja</span> : "Nein"; }},
  ];
}

const driverColumns: ColumnDef<DriverRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "device", header: "Device" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "driver", header: "Treiber" },
  { accessorKey: "model", header: "Modell" },
];

const ntpColumns: ColumnDef<NtpRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "ntpServers", header: "NTP Server" },
  { accessorKey: "ntpdRunning", header: "NTPD", cell: ({ getValue }) => getValue() ? <span className="text-success">Ja</span> : <span className="text-destructive">Nein</span> },
  { accessorKey: "dnsServers", header: "DNS Server" },
  { accessorKey: "dhcp", header: "DHCP", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "issues", header: "Probleme", cell: ({ getValue }) => <span className="text-warning text-xs">{getValue() as string}</span> },
];

const toolsWaveColumns: ColumnDef<ToolsWaveRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "upgradeableCount", header: "Upgradeable" },
  { accessorKey: "totalVms", header: "VMs gesamt" },
  { accessorKey: "pct", header: "% Upgradeable", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)}%` },
];

const hwUpgradeColumns: ColumnDef<HwUpgradeRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "hwVersion", header: "HW Version" },
  { accessorKey: "upgradeStatus", header: "Upgrade Status" },
  { accessorKey: "upgradePolicy", header: "Policy" },
  { accessorKey: "target", header: "Ziel" },
  { accessorKey: "cluster", header: "Cluster" },
];

export default function ComplianceLifecycle({ initialTab = "compliance" }: { initialTab?: ComplianceTab }) {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: hosts = [] } = useHosts();
  const [activeTab, setActiveTab] = useState<ComplianceTab>(initialTab);
  const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);

  const loadVInfo = activeTab === "compliance" || activeTab === "operations";
  const loadVTools = activeTab === "operations";
  const loadVSource = activeTab === "compliance";
  const loadVHost = activeTab === "operations" || activeTab === "infrastructure";
  const loadHba = activeTab === "infrastructure";
  const loadNic = activeTab === "infrastructure";

  const { data: rawVTools = [] } = useRawSheet("vTools", loadVTools);
  const { data: rawVInfo = [] } = useRawSheet("vInfo", loadVInfo);
  const { data: rawVSource = [] } = useRawSheet("vSource", loadVSource);
  const { data: rawHBA = [] } = useRawSheet("vHBA", loadHba);
  const { data: rawNIC = [] } = useRawSheet("vNIC", loadNic);
  const { data: rawVHost = [] } = useRawSheet("vHost", loadVHost);
  const filteredRawVTools = useMemo(() => filterVmRows(rawVTools), [filterVmRows, rawVTools]);
  const filteredRawVInfo = useMemo(() => filterVmRows(rawVInfo), [filterVmRows, rawVInfo]);

  const complianceVms = useMemo<ComplianceVm[]>(() =>
    vms.map((v) => {
      const raw = filteredRawVInfo.find((r) => String(r.data["VM"]) === v.vmName);
      return {
        snapshotId: v.snapshotId,
        vmName: v.vmName, hwVersion: v.hwVersion, firmware: v.firmware, secureBoot: v.efiSecureBoot, cbt: v.cbt,
        osConfig: v.osConfig, osTools: v.osTools, osDrift: !!(v.osConfig && v.osTools && v.osConfig !== v.osTools),
        toolsStatus: v.toolsStatus, cluster: v.cluster,
        uuidMissing: !v.vmUuid || v.vmUuid === "",
        annotationEmpty: !v.annotation || v.annotation.trim() === "",
        latencySensitivity: raw ? String(raw.data["Latency Sensitivity"] || "normal") : "normal",
        ftState: raw ? String(raw.data["FT State"] || "") : "",
        haRestart: raw ? String(raw.data["HA Restart Priority"] || "") : "",
      };
    }), [filteredRawVInfo, vms]);

  const complianceStats = useMemo(
    () =>
      complianceVms.reduce(
        (acc, v) => {
          if (v.secureBoot === false) acc.noSecureBoot++;
          if (v.cbt === false) acc.noCbt++;
          if (v.osDrift) acc.osDrift++;
          if (v.firmware && v.firmware.toLowerCase() !== "efi") acc.biosVms++;
          if (v.uuidMissing) acc.uuidMissing++;
          if (v.annotationEmpty) acc.annotationEmpty++;
          if (v.latencySensitivity !== "normal" && v.latencySensitivity !== "") acc.latencyNonNormal++;
          return acc;
        },
        {
          noSecureBoot: 0,
          noCbt: 0,
          osDrift: 0,
          biosVms: 0,
          uuidMissing: 0,
          annotationEmpty: 0,
          latencyNonNormal: 0,
        },
      ),
    [complianceVms],
  );

  const { noSecureBoot, noCbt, osDrift, biosVms, uuidMissing, annotationEmpty, latencyNonNormal } =
    complianceStats;

  const hostsWithEsxVersion = useMemo<NormalizedHost[]>(() => {
    const fallbackByHost = new Map<string, { version: string | null; build: string | null }>();
    for (const r of rawVHost) {
      const host = String(r.data["Host"] || "").trim();
      if (!host || fallbackByHost.has(host)) continue;
      fallbackByHost.set(host, parseEsxVersionBuild(r.data["ESX Version"]));
    }

    return hosts.map((h) => {
      if (h.version || h.build) return h;
      const fallback = fallbackByHost.get(h.host);
      if (!fallback || (!fallback.version && !fallback.build)) return h;
      return { ...h, version: h.version || fallback.version, build: h.build || fallback.build };
    });
  }, [hosts, rawVHost]);

  const hostDetailsByName = useMemo(() => {
    const map = new Map<string, HostDetail>();
    for (const hostDetail of buildHostDetails(rawVHost)) {
      const key = hostDetail.host.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, hostDetail);
    }
    return map;
  }, [rawVHost]);

  const hostColumns = useMemo(
    () =>
      makeHostColumns((hostName: string) => {
        const hostDetail = hostDetailsByName.get(hostName.trim().toLowerCase());
        if (hostDetail) setSelectedHost(hostDetail);
      }),
    [hostDetailsByName],
  );

  const openHostDetail = (row: unknown) => {
    const hostName =
      typeof row === "string"
        ? row.trim()
        : row && typeof row === "object" && typeof (row as { host?: unknown }).host === "string"
          ? (row as { host: string }).host.trim()
          : "";
    if (!hostName) return;
    const hostDetail = hostDetailsByName.get(hostName.toLowerCase());
    if (hostDetail) setSelectedHost(hostDetail);
  };

  const maintenanceHosts = hostsWithEsxVersion.filter((h) => h.maintenanceMode === "True").length;

  // HW version distribution
  const hwVersionChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of complianceVms) { const hw = v.hwVersion || "Unknown"; map.set(hw, (map.get(hw) || 0) + 1); }
    const parseHwSortKey = (hw: string): number => {
      const m = hw.match(/\d+/);
      return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
    };
    return [...map.entries()]
      .map(([hw, value]) => ({ hw, name: hw === "Unknown" ? "Unknown" : `vmx-${hw.replace(/^vmx-/i, "")}`, value }))
      .sort((a, b) => parseHwSortKey(a.hw) - parseHwSortKey(b.hw) || a.name.localeCompare(b.name))
      .map(({ name, value }) => ({ name, value }));
  }, [complianceVms]);

  // ESXi build drift
  const buildChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hostsWithEsxVersion) { const ver = `${h.version || "?"} (${h.build || "?"})`; map.set(ver, (map.get(ver) || 0) + 1); }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [hostsWithEsxVersion]);

  // Tools upgrade candidates per cluster
  const toolsUpgradeable = filteredRawVTools.filter((r) => { const u = String(r.data["Upgradeable"] || "").toLowerCase(); return u === "yes" || u === "true"; }).length;

  const toolsWavePlan = useMemo<ToolsWaveRow[]>(() => {
    const clusterMap = new Map<string, { upgradeable: number; total: number }>();
    for (const r of filteredRawVTools) {
      const cluster = String(r.data["Cluster"] || "Unknown");
      if (!clusterMap.has(cluster)) clusterMap.set(cluster, { upgradeable: 0, total: 0 });
      const e = clusterMap.get(cluster)!;
      e.total++;
      const u = String(r.data["Upgradeable"] || "").toLowerCase();
      if (u === "yes" || u === "true") e.upgradeable++;
    }
    return [...clusterMap.entries()].map(([cluster, v]) => ({ cluster, upgradeableCount: v.upgradeable, totalVms: v.total, pct: v.total > 0 ? (v.upgradeable / v.total) * 100 : 0 })).filter((r) => r.upgradeableCount > 0).sort((a, b) => b.upgradeableCount - a.upgradeableCount);
  }, [filteredRawVTools]);

  // CPU generation mix
  const cpuMix = useMemo(() => {
    const clusterCpus = new Map<string, Set<string>>();
    for (const h of hosts) { if (h.cluster && h.cpuModel) { if (!clusterCpus.has(h.cluster)) clusterCpus.set(h.cluster, new Set()); clusterCpus.get(h.cluster)!.add(h.cpuModel); } }
    return [...clusterCpus.entries()].filter(([, models]) => models.size > 1).map(([cluster, models]) => ({ cluster, models: models.size, list: [...models].join(", ") }));
  }, [hosts]);

  // vCenter Version
  const vcenterVersions = useMemo(
    () =>
      rawVSource.map((r) => ({
        name: String(
          r.data["VI SDK Server"] ||
            r.data["VI DSK Server"] ||
            r.data["Server"] ||
            r.data["Name"] ||
            "",
        ),
        fullname: String(r.data["Fullname"] || ""),
        version: String(r.data["Version"] || ""),
        build: String(r.data["Build"] || ""),
        apiVersion: String(r.data["API version"] || ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de-DE", { numeric: true, sensitivity: "base" })),
    [rawVSource],
  );

  // HBA/NIC Driver inventory
  const driverInventory = useMemo<DriverRow[]>(() => {
    const hba = rawHBA.map((r) => ({ host: String(r.data["Host"] || ""), cluster: String(r.data["Cluster"] || ""), device: String(r.data["Device"] || ""), type: String(r.data["Type"] || ""), driver: String(r.data["Driver"] || ""), model: String(r.data["Model"] || "") }));
    const nic = rawNIC.map((r) => ({ host: String(r.data["Host"] || ""), cluster: String(r.data["Cluster"] || ""), device: String(r.data["Network Device"] || ""), type: "NIC", driver: String(r.data["Driver"] || ""), model: "" }));
    return [...hba, ...nic];
  }, [rawHBA, rawNIC]);

  // NTP/DNS Hygiene
  const ntpDnsData = useMemo<NtpRow[]>(() => {
    return rawVHost.map((r) => {
      const ntp = String(r.data["NTP Server(s)"] || "");
      const ntpd = String(r.data["NTPD running"] || "").toLowerCase() === "true";
      const dns = String(r.data["DNS Servers"] || "");
      const dhcp = String(r.data["DHCP"] || "").toLowerCase() === "true";
      const issues: string[] = [];
      if (!ntp) issues.push("Kein NTP");
      if (!ntpd) issues.push("NTPD nicht aktiv");
      if (!dns) issues.push("Kein DNS");
      if (dhcp) issues.push("DHCP aktiv");
      return { host: String(r.data["Host"] || ""), ntpServers: ntp || "—", ntpdRunning: ntpd, dnsServers: dns || "—", dhcp, issues: issues.join(", ") };
    }).filter((r) => r.issues.length > 0);
  }, [rawVHost]);

  // HW Upgrade Backlog
  const hwUpgradeBacklog = useMemo<HwUpgradeRow[]>(() => {
    return filteredRawVInfo.filter((r) => {
      const status = String(r.data["HW upgrade status"] || "");
      return status && status !== "none" && status !== "";
    }).map((r) => ({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), hwVersion: String(r.data["HW version"] || ""), upgradeStatus: String(r.data["HW upgrade status"] || ""), upgradePolicy: String(r.data["HW upgrade policy"] || ""), target: String(r.data["HW target"] || ""), cluster: String(r.data["Cluster"] || "") }));
  }, [filteredRawVInfo]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Compliance / Lifecycle</h1><EmptyState icon={<Shield className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Compliance / Lifecycle</h1>
      <FilterBar />
      <GlobalFilterScopeHint text="Compliance- und VM-Operations-Bereiche folgen dem globalen Filter; Infrastruktur-Tab, Hostdaten und Treiberinventar bleiben unverändert." />
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as ComplianceTab);
          setSelectedHost(null);
        }}
        className="space-y-4"
      >
        <TabsList className="h-auto w-full justify-start gap-1 p-1">
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="versions">Versionen</TabsTrigger>
        </TabsList>

        <ComplianceTabPanel
          noSecureBoot={noSecureBoot}
          biosVms={biosVms}
          noCbt={noCbt}
          osDrift={osDrift}
          uuidMissing={uuidMissing}
          annotationEmpty={annotationEmpty}
          complianceVms={complianceVms}
          vcenterVersions={vcenterVersions}
          hwVersionChart={hwVersionChart}
          globalFilter={filters.search}
          onOpenVmDetail={openVmDetail}
        />

        <OperationsTabPanel
          toolsUpgradeable={toolsUpgradeable}
          ntpDnsData={ntpDnsData}
          hwUpgradeBacklog={hwUpgradeBacklog}
          latencyNonNormal={latencyNonNormal}
          toolsWavePlan={toolsWavePlan}
          complianceVms={complianceVms}
          globalFilter={filters.search}
          onOpenVmDetail={openVmDetail}
          onOpenHostDetail={openHostDetail}
        />

        <InfrastructureTabPanel
          maintenanceHosts={maintenanceHosts}
          hostsWithEsxVersion={hostsWithEsxVersion}
          driverInventory={driverInventory}
          cpuMix={cpuMix}
          buildChart={buildChart}
          hostColumns={hostColumns}
          globalFilter={filters.search}
          selectedHost={selectedHost}
          rawHBA={rawHBA}
          rawNIC={rawNIC}
          allVms={allVms}
          onCloseHostDetail={() => setSelectedHost(null)}
          onOpenHostDetail={openHostDetail}
        />

        <TabsContent value="versions" className="space-y-4">
          <VmwareVersionsPanel />
        </TabsContent>
      </Tabs>
      {vmDetailDialog}
    </div>
  );
}
