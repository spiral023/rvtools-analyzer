import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVms, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  COMPLIANCE_KPI,
  COMPLIANCE_COLUMNS,
  COMPLIANCE_SECTIONS,
  OPERATIONS_KPI,
  NTP_COLUMNS,
  HW_UPGRADE_COLUMNS,
  TOOLS_WAVE_COLUMNS,
  INFRASTRUCTURE_KPI,
  HOST_COLUMNS,
  DRIVER_COLUMNS,
} from "@/lib/glossaries/compliance";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, SheetRow } from "@/domain/models/types";

interface ComplianceVm { snapshotId: string; vmName: string; hwVersion: string | null; firmware: string | null; secureBoot: boolean | null; cbt: boolean | null; osConfig: string | null; osTools: string | null; osDrift: boolean; toolsStatus: string | null; cluster: string | null; uuidMissing: boolean; annotationEmpty: boolean; latencySensitivity: string; ftState: string; haRestart: string }
interface DriverRow { host: string; cluster: string; device: string; type: string; driver: string; model: string }
interface NtpRow { host: string; ntpServers: string; ntpdRunning: boolean; dnsServers: string; dhcp: boolean; issues: string }
interface ToolsWaveRow { cluster: string; upgradeableCount: number; totalVms: number; pct: number }
interface HwUpgradeRow { snapshotId: string; vm: string; hwVersion: string; upgradeStatus: string; upgradePolicy: string; target: string; cluster: string }
type ComplianceTab = "compliance" | "operations" | "infrastructure" | "versions";

function collectLatencySpecialCases(vms: ComplianceVm[]): ComplianceVm[] {
  const rows: ComplianceVm[] = [];
  for (const vm of vms) {
    if (vm.latencySensitivity !== "normal" && vm.latencySensitivity !== "") rows.push(vm);
  }
  return rows;
}

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
  vcenterVersions: Array<{ name: string; fullname: string; version: string; build: string; apiVersion: string }>;
  hwVersionChart: Array<{ name: string; value: number }>;
  globalFilter: string;
  onOpenVmDetail: (row: unknown) => void;
}) {
  return (
    <TabsContent value="compliance" className="space-y-4">
      <KpiGrid>
        <KpiCard title="Kein Secure Boot" value={formatNum(noSecureBoot)} severity={noSecureBoot > 0 ? "warn" : "ok"} icon={<Shield className="h-4 w-4" />} info={COMPLIANCE_KPI.noSecureBoot} />
        <KpiCard title="BIOS (kein EFI)" value={formatNum(biosVms)} severity={biosVms > 0 ? "warn" : "ok"} info={COMPLIANCE_KPI.biosVms} />
        <KpiCard title="Kein CBT" value={formatNum(noCbt)} severity={noCbt > 0 ? "warn" : "ok"} info={COMPLIANCE_KPI.noCbt} />
        <KpiCard title="OS Drift" value={formatNum(osDrift)} severity={osDrift > 0 ? "warn" : "ok"} icon={<MonitorCheck className="h-4 w-4" />} info={COMPLIANCE_KPI.osDrift} />
        <KpiCard title="UUID fehlt" value={formatNum(uuidMissing)} severity={uuidMissing > 0 ? "warn" : "ok"} icon={<Fingerprint className="h-4 w-4" />} info={COMPLIANCE_KPI.uuidMissing} />
        <KpiCard title="Annotation leer" value={formatNum(annotationEmpty)} subtitle={`${complianceVms.length > 0 ? Math.round(annotationEmpty / complianceVms.length * 100) : 0}%`} icon={<Tag className="h-4 w-4" />} info={COMPLIANCE_KPI.annotationEmpty} />
      </KpiGrid>

      {vcenterVersions.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={COMPLIANCE_SECTIONS.vcenterVersion} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Globe className="h-4 w-4" /> vCenter Versionsstand</h3>
          </InfoTooltip>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {vcenterVersions.map((v) => (
              <div key={`${v.name}-${v.fullname}-${v.apiVersion}`} className="group rounded-md border border-border/60 bg-background/30 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 rounded bg-primary/10 p-1.5 text-primary"><Server className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={v.name}>{v.name || "vCenter Server"}</p>
                    <p className="mt-0.5 truncate font-mono-data text-[11px] text-muted-foreground" title={v.fullname}>{v.fullname || v.version || "Version nicht gemeldet"}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/50 pt-2 text-xs">
                  <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Version</dt><dd className="mt-0.5 font-mono-data text-foreground">{v.version || "—"}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Build</dt><dd className="mt-0.5 font-mono-data text-foreground">{v.build || "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">API</dt><dd className="mt-0.5 font-mono-data text-foreground">{v.apiVersion || "—"}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <InfoTooltip entry={COMPLIANCE_SECTIONS.hwVersionDistribution} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">HW Version Verteilung</h3>
        </InfoTooltip>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={hwVersionChart}><XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>

      <div><InfoTooltip entry={COMPLIANCE_SECTIONS.complianceTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Compliance ({complianceVms.length})</h3></InfoTooltip><VirtualTable data={complianceVms} columns={compColumns} globalFilter={globalFilter} onRowClick={onOpenVmDetail} /></div>
    </TabsContent>
  );
}

function renderOperationsTabPanel({
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
        <KpiCard title="Tools Upgrade" value={formatNum(toolsUpgradeable)} severity={toolsUpgradeable > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} info={OPERATIONS_KPI.toolsUpgradeable} />
        <KpiCard title="NTP/DNS Issues" value={formatNum(ntpDnsData.length)} severity={ntpDnsData.length > 0 ? "warn" : "ok"} icon={<Clock className="h-4 w-4" />} info={OPERATIONS_KPI.ntpDnsIssues} />
        <KpiCard title="HW Upgrade Backlog" value={formatNum(hwUpgradeBacklog.length)} severity={hwUpgradeBacklog.length > 0 ? "warn" : "ok"} info={OPERATIONS_KPI.hwUpgradeBacklog} />
        <KpiCard title="Latency Sonderfälle" value={formatNum(latencyNonNormal)} severity={latencyNonNormal > 0 ? "warn" : "ok"} info={OPERATIONS_KPI.latencyNonNormal} />
      </KpiGrid>

      {ntpDnsData.length > 0 && (<div><InfoTooltip entry={COMPLIANCE_SECTIONS.ntpDnsHygiene} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> NTP/DNS Hygiene ({ntpDnsData.length})</h3></InfoTooltip><VirtualTable data={ntpDnsData} columns={ntpColumns} globalFilter={globalFilter} height={300} onRowClick={onOpenHostDetail} /></div>)}

      {hwUpgradeBacklog.length > 0 && (<div><InfoTooltip entry={COMPLIANCE_SECTIONS.hwUpgradeBacklog} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM HW Upgrade Backlog ({hwUpgradeBacklog.length})</h3></InfoTooltip><VirtualTable data={hwUpgradeBacklog} columns={hwUpgradeColumns} globalFilter={globalFilter} height={300} onRowClick={onOpenVmDetail} /></div>)}

      {toolsWavePlan.length > 0 && (<div><InfoTooltip entry={COMPLIANCE_SECTIONS.toolsWavePlan} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VMTools Upgrade Wellenplanung</h3></InfoTooltip><VirtualTable data={toolsWavePlan} columns={toolsWaveColumns} globalFilter={globalFilter} height={250} /></div>)}

      {latencyNonNormal > 0 && (
        <div className="rounded-lg border border-warning/30 bg-card/30 p-4">
          <InfoTooltip entry={COMPLIANCE_SECTIONS.latencyCases} side="bottom">
            <h3 className="mb-2 w-fit cursor-help text-sm font-semibold text-warning">Latency Sensitivity Sonderfälle ({latencyNonNormal})</h3>
          </InfoTooltip>
          <div className="space-y-1">{collectLatencySpecialCases(complianceVms).map((v) => (<div key={v.vmName} className="flex gap-3 text-sm"><span className="font-mono-data">{v.vmName}</span><span className="text-warning">{v.latencySensitivity}</span><span className="text-muted-foreground">{v.cluster}</span></div>))}</div>
        </div>
      )}
    </TabsContent>
  );
}

function renderInfrastructureTabPanel({
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
        <KpiCard title="Maintenance" value={formatNum(maintenanceHosts)} severity={maintenanceHosts > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.maintenanceHosts} />
        <KpiCard title="Hosts" value={formatNum(hostsWithEsxVersion.length)} severity="ok" icon={<Server className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.hosts} />
        <KpiCard title="Treiber-Einträge" value={formatNum(driverInventory.length)} severity={driverInventory.length > 0 ? "ok" : "warn"} icon={<Wifi className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.driverEntries} />
        <KpiCard title="CPU Mix Cluster" value={formatNum(cpuMix.length)} severity={cpuMix.length > 0 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.cpuMix} />
      </KpiGrid>

      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <InfoTooltip entry={COMPLIANCE_SECTIONS.esxiBuild} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">ESXi Version/Build</h3>
        </InfoTooltip>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart><Pie data={buildChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} strokeWidth={0}>{buildChart.map((entry, index) => <Cell key={entry.name} fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]} />)}</Pie><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Legend wrapperStyle={{ fontSize: "11px" }} /></PieChart>
        </ResponsiveContainer>
      </div>

      <div><InfoTooltip entry={COMPLIANCE_SECTIONS.hostInventory} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Inventar ({hostsWithEsxVersion.length})</h3></InfoTooltip><VirtualTable data={hostsWithEsxVersion} columns={hostColumns} globalFilter={globalFilter} height={350} onRowClick={onOpenHostDetail} /></div>

      {driverInventory.length > 0 && (<div><InfoTooltip entry={COMPLIANCE_SECTIONS.driverInventory} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Wifi className="h-4 w-4" /> HBA/NIC Treiberinventar ({driverInventory.length})</h3></InfoTooltip><VirtualTable data={driverInventory} columns={driverColumns} globalFilter={globalFilter} height={350} onRowClick={onOpenHostDetail} /></div>)}

      {cpuMix.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={COMPLIANCE_SECTIONS.cpuMix} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU-Generationen Mix je Cluster</h3>
          </InfoTooltip>
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
  { accessorKey: "vmName", header: "VM", meta: { info: COMPLIANCE_COLUMNS.vmName } },
  {
    accessorKey: "hwVersion",
    header: "HW Version",
    meta: { info: COMPLIANCE_COLUMNS.hwVersion },
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
  { accessorKey: "firmware", header: "Firmware", meta: { info: COMPLIANCE_COLUMNS.firmware } },
  { accessorKey: "secureBoot", header: "Secure Boot", meta: { info: COMPLIANCE_COLUMNS.secureBoot }, cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "cbt", header: "CBT", meta: { info: COMPLIANCE_COLUMNS.cbt }, cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "osDrift", header: "OS Drift", meta: { info: COMPLIANCE_COLUMNS.osDrift }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "uuidMissing", header: "UUID fehlt", meta: { info: COMPLIANCE_COLUMNS.uuidMissing }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "annotationEmpty", header: "Annotation leer", meta: { info: COMPLIANCE_COLUMNS.annotationEmpty }, cell: ({ getValue }) => getValue() ? <span className="text-muted-foreground">Ja</span> : "Nein" },
  { accessorKey: "cluster", header: "Cluster", meta: { info: COMPLIANCE_COLUMNS.cluster } },
];

function makeHostColumns(onSelectHost: (hostName: string) => void): ColumnDef<NormalizedHost, unknown>[] {
  return [
    {
      accessorKey: "host",
      header: "Host",
      meta: { info: HOST_COLUMNS.host },
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            onSelectHost(row.original.host);
          }}
        >
          {row.original.host}
        </button>
      ),
    },
    { accessorKey: "cluster", header: "Cluster", meta: { info: HOST_COLUMNS.cluster } },
    { accessorKey: "version", header: "ESXi Version", meta: { info: HOST_COLUMNS.version } },
    { accessorKey: "build", header: "Build", meta: { info: HOST_COLUMNS.build } },
    { accessorKey: "cpuModel", header: "CPU Model", meta: { info: HOST_COLUMNS.cpuModel } },
    { accessorKey: "vendor", header: "Vendor", meta: { info: HOST_COLUMNS.vendor } },
    { accessorKey: "model", header: "Model", meta: { info: HOST_COLUMNS.model } },
    { accessorKey: "maintenanceMode", header: "Maintenance", meta: { info: HOST_COLUMNS.maintenanceMode }, cell: ({ getValue }) => { const v = getValue() as string; return v === "True" ? <span className="text-warning">Ja</span> : "Nein"; }},
  ];
}

const driverColumns: ColumnDef<DriverRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: DRIVER_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: DRIVER_COLUMNS.cluster } },
  { accessorKey: "device", header: "Device", meta: { info: DRIVER_COLUMNS.device } },
  { accessorKey: "type", header: "Typ", meta: { info: DRIVER_COLUMNS.type } },
  { accessorKey: "driver", header: "Treiber", meta: { info: DRIVER_COLUMNS.driver } },
  { accessorKey: "model", header: "Modell", meta: { info: DRIVER_COLUMNS.model } },
];

const ntpColumns: ColumnDef<NtpRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NTP_COLUMNS.host } },
  { accessorKey: "ntpServers", header: "NTP Server", meta: { info: NTP_COLUMNS.ntpServers } },
  { accessorKey: "ntpdRunning", header: "NTPD", meta: { info: NTP_COLUMNS.ntpdRunning }, cell: ({ getValue }) => getValue() ? <span className="text-success">Ja</span> : <span className="text-destructive">Nein</span> },
  { accessorKey: "dnsServers", header: "DNS Server", meta: { info: NTP_COLUMNS.dnsServers } },
  { accessorKey: "dhcp", header: "DHCP", meta: { info: NTP_COLUMNS.dhcp }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "issues", header: "Probleme", meta: { info: NTP_COLUMNS.issues }, cell: ({ getValue }) => <span className="text-warning text-xs">{getValue() as string}</span> },
];

const toolsWaveColumns: ColumnDef<ToolsWaveRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: TOOLS_WAVE_COLUMNS.cluster } },
  { accessorKey: "upgradeableCount", header: "Upgradeable", meta: { info: TOOLS_WAVE_COLUMNS.upgradeableCount } },
  { accessorKey: "totalVms", header: "VMs gesamt", meta: { info: TOOLS_WAVE_COLUMNS.totalVms } },
  { accessorKey: "pct", header: "% Upgradeable", meta: { info: TOOLS_WAVE_COLUMNS.pct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)}%` },
];

const hwUpgradeColumns: ColumnDef<HwUpgradeRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: HW_UPGRADE_COLUMNS.vm } },
  { accessorKey: "hwVersion", header: "HW Version", meta: { info: HW_UPGRADE_COLUMNS.hwVersion } },
  { accessorKey: "upgradeStatus", header: "Upgrade Status", meta: { info: HW_UPGRADE_COLUMNS.upgradeStatus } },
  { accessorKey: "upgradePolicy", header: "Policy", meta: { info: HW_UPGRADE_COLUMNS.upgradePolicy } },
  { accessorKey: "target", header: "Ziel", meta: { info: HW_UPGRADE_COLUMNS.target } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: HW_UPGRADE_COLUMNS.cluster } },
];

function useComplianceLifecycleView({ initialTab = "compliance" }: { initialTab?: ComplianceTab }) {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, allVms, isLoading: vmsLoading } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const [activeTab, setActiveTab] = useState<ComplianceTab>(initialTab);
  const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);

  const loadVInfo = activeTab === "compliance" || activeTab === "operations";
  const loadVTools = activeTab === "operations";
  const loadVSource = activeTab === "compliance";
  const loadVHost = activeTab === "operations" || activeTab === "infrastructure";
  const loadHba = activeTab === "infrastructure";
  const loadNic = activeTab === "infrastructure";

  const { data: rawVTools = [], isLoading: rawVToolsLoading } = useRawSheet("vTools", loadVTools);
  const { data: rawVInfo = [], isLoading: rawVInfoLoading } = useRawSheet("vInfo", loadVInfo);
  const { data: rawVSource = [], isLoading: rawVSourceLoading } = useRawSheet("vSource", loadVSource);
  const { data: rawHBA = [], isLoading: rawHBALoading } = useRawSheet("vHBA", loadHba);
  const { data: rawNIC = [], isLoading: rawNICLoading } = useRawSheet("vNIC", loadNic);
  const { data: rawVHost = [], isLoading: rawVHostLoading } = useRawSheet("vHost", loadVHost);
  const dataLoading = snapshotsLoading || vmsLoading || hostsLoading || rawVToolsLoading
    || rawVInfoLoading || rawVSourceLoading || rawHBALoading || rawNICLoading || rawVHostLoading;
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
    const rows: ToolsWaveRow[] = [];
    for (const [cluster, v] of clusterMap) {
      if (v.upgradeable > 0) {
        rows.push({ cluster, upgradeableCount: v.upgradeable, totalVms: v.total, pct: v.total > 0 ? (v.upgradeable / v.total) * 100 : 0 });
      }
    }
    return rows.sort((a, b) => b.upgradeableCount - a.upgradeableCount);
  }, [filteredRawVTools]);

  // CPU generation mix
  const cpuMix = useMemo(() => {
    const clusterCpus = new Map<string, Set<string>>();
    for (const h of hosts) { if (h.cluster && h.cpuModel) { if (!clusterCpus.has(h.cluster)) clusterCpus.set(h.cluster, new Set()); clusterCpus.get(h.cluster)!.add(h.cpuModel); } }
    const rows: Array<{ cluster: string; models: number; list: string }> = [];
    for (const [cluster, models] of clusterCpus) {
      if (models.size > 1) rows.push({ cluster, models: models.size, list: [...models].join(", ") });
    }
    return rows;
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
    const rows: NtpRow[] = [];
    for (const r of rawVHost) {
      const ntp = String(r.data["NTP Server(s)"] || "");
      const ntpd = String(r.data["NTPD running"] || "").toLowerCase() === "true";
      const dns = String(r.data["DNS Servers"] || "");
      const dhcp = String(r.data["DHCP"] || "").toLowerCase() === "true";
      const issues: string[] = [];
      if (!ntp) issues.push("Kein NTP");
      if (!ntpd) issues.push("NTPD nicht aktiv");
      if (!dns) issues.push("Kein DNS");
      if (dhcp) issues.push("DHCP aktiv");
      if (issues.length > 0) {
        rows.push({ host: String(r.data["Host"] || ""), ntpServers: ntp || "—", ntpdRunning: ntpd, dnsServers: dns || "—", dhcp, issues: issues.join(", ") });
      }
    }
    return rows;
  }, [rawVHost]);

  // HW Upgrade Backlog
  const hwUpgradeBacklog = useMemo<HwUpgradeRow[]>(() => {
    const rows: HwUpgradeRow[] = [];
    for (const r of filteredRawVInfo) {
      const status = String(r.data["HW upgrade status"] || "");
      if (status && status !== "none") {
        rows.push({ snapshotId: r.snapshotId, vm: String(r.data["VM"] || ""), hwVersion: String(r.data["HW version"] || ""), upgradeStatus: status, upgradePolicy: String(r.data["HW upgrade policy"] || ""), target: String(r.data["HW target"] || ""), cluster: String(r.data["Cluster"] || "") });
      }
    }
    return rows;
  }, [filteredRawVInfo]);

  if (dataLoading) return <PageLoadingState title="Compliance / Lifecycle" />;

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

        {renderOperationsTabPanel({
          toolsUpgradeable,
          ntpDnsData,
          hwUpgradeBacklog,
          latencyNonNormal,
          toolsWavePlan,
          complianceVms,
          globalFilter: filters.search,
          onOpenVmDetail: openVmDetail,
          onOpenHostDetail: openHostDetail,
        })}

        {renderInfrastructureTabPanel({
          maintenanceHosts,
          hostsWithEsxVersion,
          driverInventory,
          cpuMix,
          buildChart,
          hostColumns,
          globalFilter: filters.search,
          selectedHost,
          rawHBA,
          rawNIC,
          allVms,
          onCloseHostDetail: () => setSelectedHost(null),
          onOpenHostDetail: openHostDetail,
        })}

        <TabsContent value="versions" className="space-y-4">
          <VmwareVersionsPanel />
        </TabsContent>
      </Tabs>
      {vmDetailDialog}
    </div>
  );
}

export default function ComplianceLifecycle(props: { initialTab?: ComplianceTab }) {
  return useComplianceLifecycleView(props);
}
