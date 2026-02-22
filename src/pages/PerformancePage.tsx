import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useRawSheet, useHosts, useDatastores } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Gauge, MemoryStick, Activity, Network, Shield, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

interface MemoryIssueVm { vmName: string; cluster: string | null; host: string | null; sizeMiB: number; swapped: number; ballooned: number; active: number }
interface EntitlementRow { vm: string; cluster: string; cpuEntitlement: number; cpuDrsEntitlement: number; cpuOverall: number; cpuDelta: number; memEntitlement: number; memActive: number; memDelta: number }
interface FtRow { vm: string; ftState: string; ftRole: string; ftLatency: number; ftSecLatency: number; ftBandwidth: number; risk: string }
interface VmNetAnomalyRow { vm: string; nic: string; network: string; connected: boolean; ipv4: string; issue: string }
interface SiocRow { datastore: string; siocEnabled: boolean; siocThreshold: number; freePct: number; risk: string }
interface NicQualityRow { host: string; device: string; speed: number; duplex: boolean; issue: string }

const perfColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cpuReady", header: "CPU Ready %", cell: ({ getValue }) => { const v = getValue() as number | null; if (v === null) return "—"; return <span className={v > 10 ? "text-destructive font-semibold" : v > 5 ? "text-warning" : ""}>{v.toFixed(1)}%</span>; }},
  { accessorKey: "cpuCount", header: "vCPU" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
  { accessorKey: "powerState", header: "Power" },
];

const memColumns: ColumnDef<MemoryIssueVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "sizeMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "swapped", header: "Swapped MiB", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-destructive font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>; }},
  { accessorKey: "ballooned", header: "Ballooned MiB", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 0 ? "text-warning font-semibold" : ""}>{v.toLocaleString("de-DE")}</span>; }},
  { accessorKey: "active", header: "Active MiB", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
];

const entitlementColumns: ColumnDef<EntitlementRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "cpuEntitlement", header: "CPU Entitlement" },
  { accessorKey: "cpuDrsEntitlement", header: "DRS Entitlement" },
  { accessorKey: "cpuOverall", header: "CPU Overall" },
  { accessorKey: "cpuDelta", header: "CPU Delta", cell: ({ getValue }) => { const v = getValue() as number; return <span className={Math.abs(v) > 500 ? "text-warning font-semibold" : ""}>{v}</span>; }},
  { accessorKey: "memEntitlement", header: "Mem Entitl." },
  { accessorKey: "memActive", header: "Mem Active" },
  { accessorKey: "memDelta", header: "Mem Delta", cell: ({ getValue }) => { const v = getValue() as number; return <span className={Math.abs(v) > 1024 ? "text-warning font-semibold" : ""}>{v}</span>; }},
];

const ftColumns: ColumnDef<FtRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "ftState", header: "FT State" },
  { accessorKey: "ftRole", header: "FT Role" },
  { accessorKey: "ftLatency", header: "Latency (ms)" },
  { accessorKey: "ftSecLatency", header: "Sec. Latency (ms)" },
  { accessorKey: "ftBandwidth", header: "Bandwidth" },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const vmNetColumns: ColumnDef<VmNetAnomalyRow, unknown>[] = [
  { accessorKey: "vm", header: "VM" },
  { accessorKey: "nic", header: "NIC" },
  { accessorKey: "network", header: "Netzwerk" },
  { accessorKey: "connected", header: "Verbunden", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-destructive">Nein</span> },
  { accessorKey: "ipv4", header: "IPv4" },
  { accessorKey: "issue", header: "Problem", cell: ({ getValue }) => <span className="text-warning">{getValue() as string}</span> },
];

const siocColumns: ColumnDef<SiocRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore" },
  { accessorKey: "siocEnabled", header: "SIOC", cell: ({ getValue }) => getValue() ? <span className="text-success">An</span> : <span className="text-muted-foreground">Aus</span> },
  { accessorKey: "siocThreshold", header: "Threshold (ms)" },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive" : v < 20 ? "text-warning" : ""}>{v.toFixed(1)}%</span>; }},
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : ""}>{v}</span>; }},
];

const nicQualityColumns: ColumnDef<NicQualityRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "device", header: "NIC" },
  { accessorKey: "speed", header: "Speed (Mbps)", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "duplex", header: "Full Duplex", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "issue", header: "Problem", cell: ({ getValue }) => <span className="text-warning">{getValue() as string}</span> },
];

export default function PerformancePage() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: rawVMemory = [] } = useRawSheet("vMemory");
  const { data: rawVCPU = [] } = useRawSheet("vCPU");
  const { data: rawMultiPath = [] } = useRawSheet("vMultiPath");
  const { data: rawVNetwork = [] } = useRawSheet("vNetwork");
  const { data: rawNIC = [] } = useRawSheet("vNIC");
  const { data: datastores = [] } = useDatastores();

  const cpuReadyVms = useMemo(() => vms.filter((v) => v.cpuReady !== null && v.cpuReady > 0).sort((a, b) => (b.cpuReady || 0) - (a.cpuReady || 0)), [vms]);
  const hotspots = cpuReadyVms.filter((v) => (v.cpuReady || 0) > 5).length;
  const topChart = useMemo(() => cpuReadyVms.slice(0, 15).map((v) => ({ name: v.vmName.length > 18 ? v.vmName.slice(0, 16) + "…" : v.vmName, cpuReady: v.cpuReady })), [cpuReadyVms]);

  const memoryIssues = useMemo<MemoryIssueVm[]>(() => {
    return rawVMemory.filter((r) => { const sw = Number(r.data["Swapped"] || 0); const bl = Number(r.data["Ballooned"] || 0); return sw > 0 || bl > 0; })
      .map((r) => ({ vmName: String(r.data["VM"] || ""), cluster: r.data["Cluster"] as string | null, host: r.data["Host"] as string | null, sizeMiB: Number(r.data["Size MiB"] || 0), swapped: Number(r.data["Swapped"] || 0), ballooned: Number(r.data["Ballooned"] || 0), active: Number(r.data["Active"] || 0) }))
      .sort((a, b) => (b.swapped + b.ballooned) - (a.swapped + a.ballooned));
  }, [rawVMemory]);

  const multipathIssues = useMemo(() => rawMultiPath.filter((r) => { const s = String(r.data["Oper. State"] || "").toLowerCase(); return s !== "" && s !== "ok"; }).length, [rawMultiPath]);

  // Entitlement Gaps
  const entitlementGaps = useMemo<EntitlementRow[]>(() => {
    return rawVCPU.filter((r) => String(r.data["Powerstate"] || "").toLowerCase() === "poweredon")
      .map((r) => {
        const cpuEnt = Number(r.data["Entitlement"] || 0);
        const cpuDrs = Number(r.data["DRS Entitlement"] || 0);
        const cpuOver = Number(r.data["Overall"] || 0);
        const cpuDelta = cpuEnt - cpuOver;
        return { vm: String(r.data["VM"] || ""), cluster: String(r.data["Cluster"] || ""), cpuEntitlement: cpuEnt, cpuDrsEntitlement: cpuDrs, cpuOverall: cpuOver, cpuDelta, memEntitlement: 0, memActive: 0, memDelta: 0 };
      })
      .filter((e) => Math.abs(e.cpuDelta) > 200)
      .sort((a, b) => Math.abs(b.cpuDelta) - Math.abs(a.cpuDelta));
  }, [rawVCPU]);

  // Enrich with memory entitlement
  const entitlementFull = useMemo<EntitlementRow[]>(() => {
    const memMap = new Map<string, { ent: number; active: number }>();
    for (const r of rawVMemory) {
      const vm = String(r.data["VM"] || "");
      memMap.set(vm, { ent: Number(r.data["Entitlement"] || 0), active: Number(r.data["Active"] || 0) });
    }
    return entitlementGaps.map((e) => {
      const m = memMap.get(e.vm);
      if (m) { e.memEntitlement = m.ent; e.memActive = m.active; e.memDelta = m.ent - m.active; }
      return e;
    });
  }, [entitlementGaps, rawVMemory]);

  // FT Latency
  const ftVms = useMemo<FtRow[]>(() => {
    return vms.filter((v) => v.powerState === "poweredOn").map((v) => {
      const raw = rawVCPU.find((r) => String(r.data["VM"]) === v.vmName);
      if (!raw) return null;
      // FT data is in vInfo
      return null;
    }).filter(Boolean) as FtRow[];
  }, [vms, rawVCPU]);

  // Actually get FT from raw vInfo
  const { data: rawVInfo = [] } = useRawSheet("vInfo");
  const ftData = useMemo<FtRow[]>(() => {
    return rawVInfo.filter((r) => {
      const ftState = String(r.data["FT State"] || "");
      return ftState && ftState !== "notConfigured" && ftState !== "";
    }).map((r) => {
      const lat = Number(r.data["FT Latency"] || 0);
      const secLat = Number(r.data["FT Sec. Latency"] || 0);
      let risk = "niedrig";
      if (lat > 5 || secLat > 5) risk = "mittel";
      if (lat > 10 || secLat > 10) risk = "hoch";
      return { vm: String(r.data["VM"] || ""), ftState: String(r.data["FT State"] || ""), ftRole: String(r.data["FT Role"] || ""), ftLatency: lat, ftSecLatency: secLat, ftBandwidth: Number(r.data["FT Bandwidth"] || 0), risk };
    });
  }, [rawVInfo]);

  // VM Network Anomalies
  const vmNetAnomalies = useMemo<VmNetAnomalyRow[]>(() => {
    return rawVNetwork.filter((r) => {
      const connected = String(r.data["Connected"] || "").toLowerCase() === "true";
      const ip = String(r.data["IPv4 Address"] || "");
      const powerState = String(r.data["Powerstate"] || "").toLowerCase();
      return powerState === "poweredon" && (!connected || !ip);
    }).map((r) => {
      const connected = String(r.data["Connected"] || "").toLowerCase() === "true";
      const ip = String(r.data["IPv4 Address"] || "");
      const issues: string[] = [];
      if (!connected) issues.push("Disconnected");
      if (!ip) issues.push("Keine IPv4");
      return { vm: String(r.data["VM"] || ""), nic: String(r.data["NIC label"] || ""), network: String(r.data["Network"] || ""), connected, ipv4: ip || "—", issue: issues.join(", ") };
    });
  }, [rawVNetwork]);

  // SIOC Congestion Context
  const siocData = useMemo<SiocRow[]>(() => {
    return datastores.map((ds) => {
      const sioc = ds.siocEnabled === true;
      const freePct = ds.freePct ?? 100;
      let risk = "niedrig";
      if (freePct < 20 && !sioc) risk = "mittel";
      if (freePct < 10) risk = "hoch";
      return { datastore: ds.name, siocEnabled: sioc, siocThreshold: 30, freePct, risk };
    }).filter((s) => s.risk !== "niedrig" || s.siocEnabled)
      .sort((a, b) => a.freePct - b.freePct);
  }, [datastores]);

  // Host NIC Link Quality
  const nicQuality = useMemo<NicQualityRow[]>(() => {
    return rawNIC.map((r) => {
      const speed = Number(String(r.data["Speed"] || "0").replace(/,/g, ""));
      const duplex = String(r.data["Duplex"] || "").toLowerCase() === "true";
      const issues: string[] = [];
      if (speed < 10000) issues.push(`Low speed (${speed} Mbps)`);
      if (!duplex) issues.push("Half Duplex");
      if (issues.length === 0) return null;
      return { host: String(r.data["Host"] || ""), device: String(r.data["Network Device"] || ""), speed, duplex, issue: issues.join(", ") };
    }).filter(Boolean) as NicQualityRow[];
  }, [rawNIC]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Performance</h1><EmptyState icon={<Gauge className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Performance</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard title="CPU Ready Hotspots" value={formatNum(hotspots)} severity={hotspots > 0 ? "warn" : "ok"} icon={<Gauge className="h-4 w-4" />} subtitle="> 5% Ready" />
        <KpiCard title="Memory Pressure" value={formatNum(memoryIssues.length)} severity={memoryIssues.length > 0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
        <KpiCard title="Entitlement Gaps" value={formatNum(entitlementFull.length)} severity={entitlementFull.length > 0 ? "warn" : "ok"} icon={<Zap className="h-4 w-4" />} />
        <KpiCard title="FT VMs" value={formatNum(ftData.length)} severity={ftData.some((f) => f.risk === "hoch") ? "crit" : ftData.length > 0 ? "warn" : "ok"} />
        <KpiCard title="VM Netz-Anomalien" value={formatNum(vmNetAnomalies.length)} severity={vmNetAnomalies.length > 0 ? "warn" : "ok"} icon={<Network className="h-4 w-4" />} />
        <KpiCard title="Multipath Issues" value={formatNum(multipathIssues)} severity={multipathIssues > 0 ? "crit" : "ok"} icon={<Activity className="h-4 w-4" />} />
        <KpiCard title="NIC Qualität" value={formatNum(nicQuality.length)} severity={nicQuality.length > 0 ? "warn" : "ok"} subtitle="Probleme" />
      </div>

      {topChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Top CPU Ready VMs</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topChart} layout="vertical">
              <XAxis type="number" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="cpuReady" radius={[0, 4, 4, 0]}>
                {topChart.map((entry, i) => <Cell key={i} fill={(entry.cpuReady || 0) > 10 ? CHART_COLORS.danger : (entry.cpuReady || 0) > 5 ? CHART_COLORS.warning : CHART_COLORS.primary} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">CPU Ready Details</h3><VirtualTable data={cpuReadyVms} columns={perfColumns} globalFilter={filters.search} /></div>

      {memoryIssues.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Memory Pressure — Swapped / Ballooned ({memoryIssues.length})</h3><VirtualTable data={memoryIssues} columns={memColumns} globalFilter={filters.search} /></div>)}

      {entitlementFull.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Entitlement Gaps ({entitlementFull.length})</h3><VirtualTable data={entitlementFull} columns={entitlementColumns} globalFilter={filters.search} height={300} /></div>)}

      {ftData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">FT Latenz Monitoring ({ftData.length})</h3><VirtualTable data={ftData} columns={ftColumns} globalFilter={filters.search} height={250} /></div>)}

      {vmNetAnomalies.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Netzwerkanomalien ({vmNetAnomalies.length})</h3><VirtualTable data={vmNetAnomalies} columns={vmNetColumns} globalFilter={filters.search} height={300} /></div>)}

      {siocData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Storage Congestion / SIOC ({siocData.length})</h3><VirtualTable data={siocData} columns={siocColumns} globalFilter={filters.search} height={250} /></div>)}

      {nicQuality.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host NIC Link Qualität ({nicQuality.length})</h3><VirtualTable data={nicQuality} columns={nicQualityColumns} globalFilter={filters.search} height={250} /></div>)}
    </div>
  );
}
