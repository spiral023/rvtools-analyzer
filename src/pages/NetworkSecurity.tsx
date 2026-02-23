import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Network, ShieldAlert, Wifi, Router, Cable, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";

interface PolicyRow { name: string; type: string; vlan: string; promiscuous: boolean; macChanges: boolean; forgedTransmits: boolean; policy: string }
interface VmkRow { host: string; portGroup: string; device: string; ip: string; subnet: string; mtu: number; dhcp: boolean }
interface NicRow { host: string; device: string; speed: number; duplex: boolean; driver: string; mac: string }
interface UplinkRow { port: string; switchName: string; activeUplinks: string; standbyUplinks: string; redundant: boolean; risk: string }
interface DvDriftRow { port: string; switchName: string; field: string; value: string; expected: string }
interface TeamingRow { name: string; type: string; policy: string; rollingOrder: boolean; notifySwitch: boolean; issues: string }
interface VlanChartRow { vlan: string; count: number; vlanName: string }

const policyColumns: ColumnDef<PolicyRow, unknown>[] = [
  { accessorKey: "name", header: "Port/Switch" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "vlan", header: "VLAN" },
  { accessorKey: "promiscuous", header: "Promiscuous", cell: ({ getValue }) => { const v = getValue() as boolean; return <span className={v ? "text-destructive font-semibold" : "text-success"}>{v ? "AN" : "Aus"}</span>; }},
  { accessorKey: "macChanges", header: "MAC Changes", cell: ({ getValue }) => { const v = getValue() as boolean; return <span className={v ? "text-warning" : "text-success"}>{v ? "AN" : "Aus"}</span>; }},
  { accessorKey: "forgedTransmits", header: "Forged Transmits", cell: ({ getValue }) => { const v = getValue() as boolean; return <span className={v ? "text-warning" : "text-success"}>{v ? "AN" : "Aus"}</span>; }},
  { accessorKey: "policy", header: "Teaming" },
];

const vmkColumns: ColumnDef<VmkRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "portGroup", header: "Port Group" },
  { accessorKey: "device", header: "Device" },
  { accessorKey: "ip", header: "IP" },
  { accessorKey: "subnet", header: "Subnet" },
  { accessorKey: "mtu", header: "MTU", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v !== 1500 && v !== 9000 ? "text-warning" : ""}>{v}</span>; }},
  { accessorKey: "dhcp", header: "DHCP", cell: ({ getValue }) => { const v = getValue() as boolean; return <span className={v ? "text-warning" : ""}>{v ? "Ja" : "Nein"}</span>; }},
];

const nicColumns: ColumnDef<NicRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "device", header: "NIC" },
  { accessorKey: "speed", header: "Speed (Mbps)", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "duplex", header: "Full Duplex", cell: ({ getValue }) => getValue() ? "Ja" : "Nein" },
  { accessorKey: "driver", header: "Treiber" },
  { accessorKey: "mac", header: "MAC" },
];

const uplinkColumns: ColumnDef<UplinkRow, unknown>[] = [
  { accessorKey: "port", header: "Portgroup" },
  { accessorKey: "switchName", header: "Switch" },
  { accessorKey: "activeUplinks", header: "Active Uplinks" },
  { accessorKey: "standbyUplinks", header: "Standby Uplinks" },
  { accessorKey: "redundant", header: "Redundant", cell: ({ getValue }) => getValue() ? <span className="text-success">Ja</span> : <span className="text-destructive">Nein</span> },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const teamingColumns: ColumnDef<TeamingRow, unknown>[] = [
  { accessorKey: "name", header: "Port/Switch" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "policy", header: "Policy" },
  { accessorKey: "rollingOrder", header: "Rolling Order", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "notifySwitch", header: "Notify Switch", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "issues", header: "Auffälligkeiten", cell: ({ getValue }) => <span className="text-warning text-xs">{getValue() as string}</span> },
];

export default function NetworkSecurity() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { data: rawVPort = [] } = useRawSheet("vPort");
  const { data: rawDvPort = [] } = useRawSheet("dvPort");
  const { data: rawVSwitch = [] } = useRawSheet("vSwitch");
  const { data: rawDvSwitch = [] } = useRawSheet("dvSwitch");
  const { data: rawVmk = [] } = useRawSheet("vSC_VMK");
  const { data: rawNIC = [] } = useRawSheet("vNIC");

  const policies = useMemo<PolicyRow[]>(() => {
    const fromVPort = rawVPort.map((r) => ({ name: String(r.data["Port Group"] || ""), type: "Standard", vlan: String(r.data["VLAN"] || ""), promiscuous: String(r.data["Promiscuous Mode"] || "").toLowerCase() === "true", macChanges: String(r.data["Mac Changes"] || "").toLowerCase() === "true", forgedTransmits: String(r.data["Forged Transmits"] || "").toLowerCase() === "true", policy: String(r.data["Policy"] || "") }));
    const fromDvPort = rawDvPort.map((r) => ({ name: String(r.data["Port"] || ""), type: "Distributed", vlan: String(r.data["VLAN"] || ""), promiscuous: String(r.data["Allow Promiscuous"] || "").toLowerCase() === "true", macChanges: String(r.data["Mac Changes"] || "").toLowerCase() === "true", forgedTransmits: String(r.data["Forged Transmits"] || "").toLowerCase() === "true", policy: String(r.data["Policy"] || "") }));
    return [...fromVPort, ...fromDvPort];
  }, [rawVPort, rawDvPort]);

  const securityDrift = policies.filter((p) => p.promiscuous || p.macChanges || p.forgedTransmits);
  const promiscuousCount = policies.filter((p) => p.promiscuous).length;

  const vmkAdapters = useMemo<VmkRow[]>(() =>
    rawVmk.map((r) => ({ host: String(r.data["Host"] || ""), portGroup: String(r.data["Port Group"] || ""), device: String(r.data["Device"] || ""), ip: String(r.data["IP Address"] || ""), subnet: String(r.data["Subnet mask"] || ""), mtu: Number(String(r.data["MTU"] || "0").replace(/,/g, "")), dhcp: String(r.data["DHCP"] || "").toLowerCase() === "true" })), [rawVmk]);

  const mtuValues = useMemo(() => new Set(vmkAdapters.map((v) => v.mtu)).size, [vmkAdapters]);
  const dhcpVmk = vmkAdapters.filter((v) => v.dhcp).length;

  const nics = useMemo<NicRow[]>(() =>
    rawNIC.map((r) => ({ host: String(r.data["Host"] || ""), device: String(r.data["Network Device"] || ""), speed: Number(String(r.data["Speed"] || "0").replace(/,/g, "")), duplex: String(r.data["Duplex"] || "").toLowerCase() === "true", driver: String(r.data["Driver"] || ""), mac: String(r.data["MAC"] || "") })), [rawNIC]);

  // VLAN chart
  const vlanChart = useMemo<VlanChartRow[]>(() => {
    const map = new Map<string, { count: number; names: Set<string> }>();
    for (const p of policies) {
      if (!p.vlan) continue;
      if (!map.has(p.vlan)) map.set(p.vlan, { count: 0, names: new Set<string>() });
      const entry = map.get(p.vlan)!;
      entry.count += 1;
      if (p.name) entry.names.add(p.name);
    }
    return [...map.entries()]
      .map(([vlan, entry]) => ({ vlan, count: entry.count, vlanName: [...entry.names].join(", ") || "—" }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [policies]);

  // NIC Speed Histogram
  const speedChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nics) { const label = n.speed >= 1000 ? `${n.speed / 1000} Gbps` : `${n.speed} Mbps`; map.set(label, (map.get(label) || 0) + 1); }
    return [...map.entries()].map(([speed, count]) => ({ speed, count })).sort((a, b) => b.count - a.count);
  }, [nics]);

  // Uplink Redundancy
  const uplinkData = useMemo<UplinkRow[]>(() => {
    return rawDvPort.map((r) => {
      const active = String(r.data["Active Uplink"] || "");
      const standby = String(r.data["Standby Uplink"] || "");
      const activeCount = active ? active.split(",").filter(Boolean).length : 0;
      const standbyCount = standby ? standby.split(",").filter(Boolean).length : 0;
      const redundant = activeCount >= 2 || (activeCount >= 1 && standbyCount >= 1);
      let risk = "niedrig";
      if (activeCount === 0) risk = "hoch";
      else if (!redundant) risk = "mittel";
      return { port: String(r.data["Port"] || ""), switchName: String(r.data["Switch"] || ""), activeUplinks: active || "—", standbyUplinks: standby || "—", redundant, risk };
    }).filter((u) => u.risk !== "niedrig").sort((a, b) => (a.risk === "hoch" ? 0 : 1) - (b.risk === "hoch" ? 0 : 1));
  }, [rawDvPort]);

  // NIC Teaming
  const teamingData = useMemo<TeamingRow[]>(() => {
    const all = [
      ...rawVPort.map((r) => ({ name: String(r.data["Port Group"] || ""), type: "Standard", policy: String(r.data["Policy"] || ""), rollingOrder: String(r.data["Rolling Order"] || "").toLowerCase() === "true", notifySwitch: String(r.data["Notify Switch"] || "").toLowerCase() === "true" })),
      ...rawDvPort.map((r) => ({ name: String(r.data["Port"] || ""), type: "Distributed", policy: String(r.data["Policy"] || ""), rollingOrder: String(r.data["Rolling Order"] || "").toLowerCase() === "true", notifySwitch: String(r.data["Notify Switch"] || "").toLowerCase() === "true" })),
    ];
    const policyCount = new Map<string, number>();
    for (const t of all) policyCount.set(t.policy, (policyCount.get(t.policy) || 0) + 1);
    const dominant = [...policyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return all.map((t) => {
      const issues: string[] = [];
      if (t.policy !== dominant) issues.push(`Policy ${t.policy} (Standard: ${dominant})`);
      if (t.rollingOrder) issues.push("Rolling Order aktiv");
      if (!t.notifySwitch) issues.push("Notify Switch aus");
      return { ...t, issues: issues.join("; ") };
    }).filter((t) => t.issues.length > 0);
  }, [rawVPort, rawDvPort]);

  // dVSwitch Config Drift
  const dvSwitchDrift = useMemo(() => {
    if (rawDvSwitch.length < 2) return [];
    const fields = ["Max MTU", "In Traffic Shaping", "Out Traffic Shaping", "CDP Operation"];
    const baseline = rawDvSwitch[0]?.data || {};
    return rawDvSwitch.slice(1).flatMap((r) => {
      return fields.filter((f) => String(r.data[f] || "") !== String(baseline[f] || ""))
        .map((f) => ({ port: String(r.data["Switch"] || ""), switchName: String(r.data["Name"] || ""), field: f, value: String(r.data[f] || ""), expected: String(baseline[f] || "") }));
    });
  }, [rawDvSwitch]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Network / Security</h1><EmptyState icon={<Network className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Network / Security</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard title="Portgroups" value={formatNum(policies.length)} icon={<Network className="h-4 w-4" />} />
        <KpiCard title="Security Drift" value={formatNum(securityDrift.length)} severity={securityDrift.length > 0 ? "warn" : "ok"} icon={<ShieldAlert className="h-4 w-4" />} />
        <KpiCard title="Promiscuous" value={formatNum(promiscuousCount)} severity={promiscuousCount > 0 ? "crit" : "ok"} />
        <KpiCard title="MTU Varianten" value={formatNum(mtuValues)} severity={mtuValues > 2 ? "warn" : "ok"} icon={<Router className="h-4 w-4" />} />
        <KpiCard title="VMK DHCP" value={formatNum(dhcpVmk)} severity={dhcpVmk > 0 ? "warn" : "ok"} />
        <KpiCard title="Uplink SPOF" value={formatNum(uplinkData.length)} severity={uplinkData.length > 0 ? "warn" : "ok"} icon={<Cable className="h-4 w-4" />} />
        <KpiCard title="Teaming Issues" value={formatNum(teamingData.length)} severity={teamingData.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VLAN Verteilung (Top 20)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vlanChart}>
              <XAxis dataKey="vlan" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as VlanChartRow;
                  return (
                    <div style={CHART_TOOLTIP_STYLE}>
                      <div className="text-xs font-semibold">VLAN Name</div>
                      <div className="text-xs">{row.vlanName}</div>
                      <div className="mt-1 text-xs">Anzahl: <span className="font-semibold">{row.count}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Link Speed Verteilung</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={speedChart}><XAxis dataKey="speed" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="count" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Security Policies ({policies.length})</h3><VirtualTable data={policies} columns={policyColumns} globalFilter={filters.search} /></div>

      {uplinkData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Uplink Redundanz Risiken ({uplinkData.length})</h3><VirtualTable data={uplinkData} columns={uplinkColumns} globalFilter={filters.search} height={300} /></div>)}
      {teamingData.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">NIC Teaming Auffälligkeiten ({teamingData.length})</h3><VirtualTable data={teamingData} columns={teamingColumns} globalFilter={filters.search} height={300} /></div>)}
      {dvSwitchDrift.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">dVSwitch Config Drift ({dvSwitchDrift.length})</h3>
        <div className="space-y-1">{dvSwitchDrift.map((d, i) => (<div key={i} className="flex gap-3 text-sm rounded bg-muted/30 px-3 py-1.5"><span className="font-mono-data">{d.port}</span><span className="text-warning">{d.field}</span><span>Ist: <span className="font-mono-data">{d.value}</span></span><span className="text-muted-foreground">Soll: <span className="font-mono-data">{d.expected}</span></span></div>))}</div>
      </div>)}

      {vmkAdapters.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMkernel Adapter ({vmkAdapters.length})</h3><VirtualTable data={vmkAdapters} columns={vmkColumns} globalFilter={filters.search} height={350} /></div>)}
      {nics.length > 0 && (<div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Physische NICs ({nics.length})</h3><VirtualTable data={nics} columns={nicColumns} globalFilter={filters.search} height={350} /></div>)}
    </div>
  );
}
