import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVms, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { HostDetailDialog, type HostDetail } from "@/pages/Hardware";
import { Shield, Cpu, Wrench, MonitorCheck, Fingerprint, Tag, Clock, Server, Wifi, Globe } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { formatNum, parseEsxVersionBuild } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost, SheetRow } from "@/domain/models/types";

interface ComplianceVm { vmName: string; hwVersion: string | null; firmware: string | null; secureBoot: boolean | null; cbt: boolean | null; osConfig: string | null; osTools: string | null; osDrift: boolean; toolsStatus: string | null; cluster: string | null; uuidMissing: boolean; annotationEmpty: boolean; latencySensitivity: string; ftState: string; haRestart: string }
interface DriverRow { host: string; cluster: string; device: string; type: string; driver: string; model: string }
interface NtpRow { host: string; ntpServers: string; ntpdRunning: boolean; dnsServers: string; dhcp: boolean; issues: string }
interface ToolsWaveRow { cluster: string; upgradeableCount: number; totalVms: number; pct: number }
interface HwUpgradeRow { vm: string; hwVersion: string; upgradeStatus: string; upgradePolicy: string; target: string; cluster: string }

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function bool(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "1";
}

function normalizeHardwareModel(vendor: string, model: string): string {
  const cleaned = model.trim().replace(/^"+|"+$/g, "").replace(/\s+/g, " ");
  const isHitachi = vendor.toLowerCase().includes("hitachi");
  if (!isHitachi) return cleaned;

  const advancedServerMatch = cleaned.match(
    /^advanced server ds(\d+)\s+g2(?:[\s\-_]+#?([a-z0-9]+))?$/i,
  );
  if (advancedServerMatch) {
    const canonicalBase = `Advanced Server DS${advancedServerMatch[1]} G2`;
    const suffix = advancedServerMatch[2];
    if (!suffix) return canonicalBase;
    if (/^\d+$/.test(suffix)) return canonicalBase;
    if (/^[a-z0-9]{8,}$/i.test(suffix)) return canonicalBase;
  }

  return cleaned;
}

function buildHostDetails(hostRows: SheetRow[]): HostDetail[] {
  return hostRows.map((r) => {
    const d = r.data;
    const vendor = str(d["Vendor"]);
    const rawModel = str(d["Model"]);
    return {
      host: str(d["Host"]),
      datacenter: str(d["Datacenter"]) || null,
      cluster: str(d["Cluster"]) || null,
      model: normalizeHardwareModel(vendor, rawModel),
      vendor,
      serial: str(d["Serial number"]),
      cpuModel: str(d["CPU Model"]),
      cpuSockets: num(d["# CPU"]),
      coresPerCpu: num(d["Cores per CPU"]),
      totalCores: num(d["# Cores"]),
      threads: num(d["NumCpuThreads"]) || num(d["# Cores"]) * 2,
      speedMHz: num(d["Speed"]),
      memoryMiB: num(d["# Memory"]),
      esxVersion: str(d["ESX Version"]),
      biosVendor: str(d["BIOS Vendor"]),
      biosVersion: str(d["BIOS Version"]),
      biosDate: str(d["BIOS Date"]),
      vmCount: num(d["# VMs"]),
      nicCount: num(d["# NICs"]),
      hbaCount: num(d["# HBAs"]),
      htActive: bool(d["HT Active"]),
      maintenanceMode: bool(d["in Maintenance Mode"]),
      serviceTag: str(d["Service tag"]),
    };
  });
}

const compColumns: ColumnDef<ComplianceVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "hwVersion", header: "HW Version" },
  { accessorKey: "firmware", header: "Firmware" },
  { accessorKey: "secureBoot", header: "Secure Boot", cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "cbt", header: "CBT", cell: ({ getValue }) => { const v = getValue() as boolean | null; return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—"; }},
  { accessorKey: "osDrift", header: "OS Drift", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "uuidMissing", header: "UUID fehlt", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "annotationEmpty", header: "Annotation leer", cell: ({ getValue }) => getValue() ? <span className="text-muted-foreground">Ja</span> : "Nein" },
  { accessorKey: "latencySensitivity", header: "Latency Sens." },
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
          className="font-mono-data text-primary hover:underline"
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

export default function ComplianceLifecycle() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { data: hosts = [] } = useHosts();
  const { data: rawVTools = [] } = useRawSheet("vTools");
  const { data: rawVInfo = [] } = useRawSheet("vInfo");
  const { data: rawVSource = [] } = useRawSheet("vSource");
  const { data: rawHBA = [] } = useRawSheet("vHBA");
  const { data: rawNIC = [] } = useRawSheet("vNIC");
  const { data: rawVHost = [] } = useRawSheet("vHost");
  const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);

  const complianceVms = useMemo<ComplianceVm[]>(() =>
    vms.map((v) => {
      const raw = rawVInfo.find((r) => String(r.data["VM"]) === v.vmName);
      return {
        vmName: v.vmName, hwVersion: v.hwVersion, firmware: v.firmware, secureBoot: v.efiSecureBoot, cbt: v.cbt,
        osConfig: v.osConfig, osTools: v.osTools, osDrift: !!(v.osConfig && v.osTools && v.osConfig !== v.osTools),
        toolsStatus: v.toolsStatus, cluster: v.cluster,
        uuidMissing: !v.vmUuid || v.vmUuid === "",
        annotationEmpty: !v.annotation || v.annotation.trim() === "",
        latencySensitivity: raw ? String(raw.data["Latency Sensitivity"] || "normal") : "normal",
        ftState: raw ? String(raw.data["FT State"] || "") : "",
        haRestart: raw ? String(raw.data["HA Restart Priority"] || "") : "",
      };
    }), [vms, rawVInfo]);

  const noSecureBoot = complianceVms.filter((v) => v.secureBoot === false).length;
  const noCbt = complianceVms.filter((v) => v.cbt === false).length;
  const osDrift = complianceVms.filter((v) => v.osDrift).length;
  const biosVms = complianceVms.filter((v) => v.firmware && v.firmware.toLowerCase() !== "efi").length;
  const uuidMissing = complianceVms.filter((v) => v.uuidMissing).length;
  const annotationEmpty = complianceVms.filter((v) => v.annotationEmpty).length;
  const latencyNonNormal = complianceVms.filter((v) => v.latencySensitivity !== "normal" && v.latencySensitivity !== "").length;

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
      .map(([hw, value]) => ({ hw, name: hw === "Unknown" ? "Unknown" : `vmx-${hw}`, value }))
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
  const toolsUpgradeable = useMemo(() => rawVTools.filter((r) => { const u = String(r.data["Upgradeable"] || "").toLowerCase(); return u === "yes" || u === "true"; }).length, [rawVTools]);

  const toolsWavePlan = useMemo<ToolsWaveRow[]>(() => {
    const clusterMap = new Map<string, { upgradeable: number; total: number }>();
    for (const r of rawVTools) {
      const cluster = String(r.data["Cluster"] || "Unknown");
      if (!clusterMap.has(cluster)) clusterMap.set(cluster, { upgradeable: 0, total: 0 });
      const e = clusterMap.get(cluster)!;
      e.total++;
      const u = String(r.data["Upgradeable"] || "").toLowerCase();
      if (u === "yes" || u === "true") e.upgradeable++;
    }
    return [...clusterMap.entries()].map(([cluster, v]) => ({ cluster, upgradeableCount: v.upgradeable, totalVms: v.total, pct: v.total > 0 ? (v.upgradeable / v.total) * 100 : 0 })).filter((r) => r.upgradeableCount > 0).sort((a, b) => b.upgradeableCount - a.upgradeableCount);
  }, [rawVTools]);

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
    return rawVInfo.filter((r) => {
      const status = String(r.data["HW upgrade status"] || "");
      return status && status !== "none" && status !== "";
    }).map((r) => ({ vm: String(r.data["VM"] || ""), hwVersion: String(r.data["HW version"] || ""), upgradeStatus: String(r.data["HW upgrade status"] || ""), upgradePolicy: String(r.data["HW upgrade policy"] || ""), target: String(r.data["HW target"] || ""), cluster: String(r.data["Cluster"] || "") }));
  }, [rawVInfo]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Compliance / Lifecycle</h1><EmptyState icon={<Shield className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Compliance / Lifecycle</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard title="Kein Secure Boot" value={formatNum(noSecureBoot)} severity={noSecureBoot > 0 ? "warn" : "ok"} icon={<Shield className="h-4 w-4" />} />
        <KpiCard title="BIOS (kein EFI)" value={formatNum(biosVms)} severity={biosVms > 0 ? "warn" : "ok"} />
        <KpiCard title="Kein CBT" value={formatNum(noCbt)} severity={noCbt > 0 ? "warn" : "ok"} />
        <KpiCard title="OS Drift" value={formatNum(osDrift)} severity={osDrift > 0 ? "warn" : "ok"} icon={<MonitorCheck className="h-4 w-4" />} />
        <KpiCard title="UUID fehlt" value={formatNum(uuidMissing)} severity={uuidMissing > 0 ? "warn" : "ok"} icon={<Fingerprint className="h-4 w-4" />} />
        <KpiCard title="Annotation leer" value={formatNum(annotationEmpty)} subtitle={`${complianceVms.length > 0 ? Math.round(annotationEmpty / complianceVms.length * 100) : 0}%`} icon={<Tag className="h-4 w-4" />} />
        <KpiCard title="Tools Upgrade" value={formatNum(toolsUpgradeable)} severity={toolsUpgradeable > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="Maintenance" value={formatNum(maintenanceHosts)} severity={maintenanceHosts > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} />
      </div>

      {/* vCenter Version */}
      {vcenterVersions.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Globe className="h-4 w-4" /> vCenter Versionsstand</h3>
          <div className="space-y-2">{vcenterVersions.map((v, i) => (<div key={i} className="flex flex-wrap gap-4 text-sm"><span className="font-semibold">{v.name}</span><span className="font-mono-data text-xs text-muted-foreground">{v.fullname}</span><span className="text-xs text-muted-foreground">API: {v.apiVersion}</span></div>))}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">HW Version Verteilung</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hwVersionChart}><XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">ESXi Version/Build</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart><Pie data={buildChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} strokeWidth={0}>{buildChart.map((_, i) => <Cell key={i} fill={SEVERITY_COLORS[i % SEVERITY_COLORS.length]} />)}</Pie><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Legend wrapperStyle={{ fontSize: "11px" }} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Compliance ({complianceVms.length})</h3><VirtualTable data={complianceVms} columns={compColumns} globalFilter={filters.search} /></div>
      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Inventar ({hostsWithEsxVersion.length})</h3><VirtualTable data={hostsWithEsxVersion} columns={hostColumns} globalFilter={filters.search} height={350} /></div>

      {ntpDnsData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> NTP/DNS Hygiene ({ntpDnsData.length})</h3><VirtualTable data={ntpDnsData} columns={ntpColumns} globalFilter={filters.search} height={300} /></div>)}

      {hwUpgradeBacklog.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM HW Upgrade Backlog ({hwUpgradeBacklog.length})</h3><VirtualTable data={hwUpgradeBacklog} columns={hwUpgradeColumns} globalFilter={filters.search} height={300} /></div>)}

      {toolsWavePlan.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMTools Upgrade Wellenplanung</h3><VirtualTable data={toolsWavePlan} columns={toolsWaveColumns} globalFilter={filters.search} height={250} /></div>)}

      {driverInventory.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Wifi className="h-4 w-4" /> HBA/NIC Treiberinventar ({driverInventory.length})</h3><VirtualTable data={driverInventory} columns={driverColumns} globalFilter={filters.search} height={350} /></div>)}

      {cpuMix.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU-Generationen Mix je Cluster</h3>
          <div className="space-y-2">{cpuMix.map((c) => (<div key={c.cluster} className="flex items-start gap-2 text-sm"><span className="font-medium text-warning">{c.cluster}</span><span className="text-muted-foreground">— {c.models} Modelle: {c.list}</span></div>))}</div>
        </div>
      )}

      {latencyNonNormal > 0 && (
        <div className="rounded-lg border border-warning/30 bg-card/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-warning">Latency Sensitivity Sonderfälle ({latencyNonNormal})</h3>
          <div className="space-y-1">{complianceVms.filter((v) => v.latencySensitivity !== "normal" && v.latencySensitivity !== "").map((v) => (<div key={v.vmName} className="flex gap-3 text-sm"><span className="font-mono-data">{v.vmName}</span><span className="text-warning">{v.latencySensitivity}</span><span className="text-muted-foreground">{v.cluster}</span></div>))}</div>
        </div>
      )}

      <HostDetailDialog
        host={selectedHost}
        hbaRows={rawHBA}
        nicRows={rawNIC}
        vmRows={allVms}
        open={!!selectedHost}
        onClose={() => setSelectedHost(null)}
      />
    </div>
  );
}
