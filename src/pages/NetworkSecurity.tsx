import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Network, ShieldAlert, Wifi, Router } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";

interface PolicyRow { name: string; type: string; vlan: string; promiscuous: boolean; macChanges: boolean; forgedTransmits: boolean; policy: string }
interface VmkRow { host: string; portGroup: string; device: string; ip: string; subnet: string; mtu: number; dhcp: boolean }
interface NicRow { host: string; device: string; speed: number; duplex: boolean; driver: string; mac: string }

const policyColumns: ColumnDef<PolicyRow, unknown>[] = [
  { accessorKey: "name", header: "Port/Switch" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "vlan", header: "VLAN" },
  { accessorKey: "promiscuous", header: "Promiscuous", cell: ({ getValue }) => {
    const v = getValue() as boolean;
    return <span className={v ? "text-destructive font-semibold" : "text-success"}>{v ? "AN" : "Aus"}</span>;
  }},
  { accessorKey: "macChanges", header: "MAC Changes", cell: ({ getValue }) => {
    const v = getValue() as boolean;
    return <span className={v ? "text-warning" : "text-success"}>{v ? "AN" : "Aus"}</span>;
  }},
  { accessorKey: "forgedTransmits", header: "Forged Transmits", cell: ({ getValue }) => {
    const v = getValue() as boolean;
    return <span className={v ? "text-warning" : "text-success"}>{v ? "AN" : "Aus"}</span>;
  }},
  { accessorKey: "policy", header: "Teaming" },
];

const vmkColumns: ColumnDef<VmkRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "portGroup", header: "Port Group" },
  { accessorKey: "device", header: "Device" },
  { accessorKey: "ip", header: "IP" },
  { accessorKey: "subnet", header: "Subnet" },
  { accessorKey: "mtu", header: "MTU", cell: ({ getValue }) => {
    const v = getValue() as number;
    return <span className={v !== 1500 && v !== 9000 ? "text-warning" : ""}>{v}</span>;
  }},
  { accessorKey: "dhcp", header: "DHCP", cell: ({ getValue }) => {
    const v = getValue() as boolean;
    return <span className={v ? "text-warning" : ""}>{v ? "Ja" : "Nein"}</span>;
  }},
];

const nicColumns: ColumnDef<NicRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "device", header: "NIC" },
  { accessorKey: "speed", header: "Speed (Mbps)", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "duplex", header: "Full Duplex", cell: ({ getValue }) => getValue() ? "Ja" : "Nein" },
  { accessorKey: "driver", header: "Treiber" },
  { accessorKey: "mac", header: "MAC" },
];

export default function NetworkSecurity() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { data: rawVPort = [] } = useRawSheet("vPort");
  const { data: rawDvPort = [] } = useRawSheet("dvPort");
  const { data: rawVSwitch = [] } = useRawSheet("vSwitch");
  const { data: rawVmk = [] } = useRawSheet("vSC_VMK");
  const { data: rawNIC = [] } = useRawSheet("vNIC");

  // Combine security policies from vPort + dvPort
  const policies = useMemo<PolicyRow[]>(() => {
    const fromVPort = rawVPort.map((r) => ({
      name: String(r.data["Port Group"] || ""),
      type: "Standard",
      vlan: String(r.data["VLAN"] || ""),
      promiscuous: String(r.data["Promiscuous Mode"] || "").toLowerCase() === "true",
      macChanges: String(r.data["Mac Changes"] || "").toLowerCase() === "true",
      forgedTransmits: String(r.data["Forged Transmits"] || "").toLowerCase() === "true",
      policy: String(r.data["Policy"] || ""),
    }));
    const fromDvPort = rawDvPort.map((r) => ({
      name: String(r.data["Port"] || ""),
      type: "Distributed",
      vlan: String(r.data["VLAN"] || ""),
      promiscuous: String(r.data["Allow Promiscuous"] || "").toLowerCase() === "true",
      macChanges: String(r.data["Mac Changes"] || "").toLowerCase() === "true",
      forgedTransmits: String(r.data["Forged Transmits"] || "").toLowerCase() === "true",
      policy: String(r.data["Policy"] || ""),
    }));
    return [...fromVPort, ...fromDvPort];
  }, [rawVPort, rawDvPort]);

  const securityDrift = policies.filter((p) => p.promiscuous || p.macChanges || p.forgedTransmits);
  const promiscuousCount = policies.filter((p) => p.promiscuous).length;

  // VMkernel adapters
  const vmkAdapters = useMemo<VmkRow[]>(() =>
    rawVmk.map((r) => ({
      host: String(r.data["Host"] || ""),
      portGroup: String(r.data["Port Group"] || ""),
      device: String(r.data["Device"] || ""),
      ip: String(r.data["IP Address"] || ""),
      subnet: String(r.data["Subnet mask"] || ""),
      mtu: Number(r.data["MTU"] || 0),
      dhcp: String(r.data["DHCP"] || "").toLowerCase() === "true",
    })),
  [rawVmk]);

  const mtuValues = useMemo(() => {
    const set = new Set(vmkAdapters.map((v) => v.mtu));
    return set.size;
  }, [vmkAdapters]);

  const dhcpVmk = vmkAdapters.filter((v) => v.dhcp).length;

  // Physical NICs
  const nics = useMemo<NicRow[]>(() =>
    rawNIC.map((r) => ({
      host: String(r.data["Host"] || ""),
      device: String(r.data["Network Device"] || ""),
      speed: Number(r.data["Speed"] || 0),
      duplex: String(r.data["Duplex"] || "").toLowerCase() === "true",
      driver: String(r.data["Driver"] || ""),
      mac: String(r.data["MAC"] || ""),
    })),
  [rawNIC]);

  // VLAN distribution chart
  const vlanChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of policies) { if (p.vlan) map.set(p.vlan, (map.get(p.vlan) || 0) + 1); }
    return [...map.entries()].map(([vlan, count]) => ({ vlan, count })).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [policies]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Network / Security</h1><EmptyState icon={<Network className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Network / Security</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Portgroups" value={formatNum(policies.length)} icon={<Network className="h-4 w-4" />} />
        <KpiCard title="Security Drift" value={formatNum(securityDrift.length)} severity={securityDrift.length > 0 ? "warn" : "ok"} icon={<ShieldAlert className="h-4 w-4" />} />
        <KpiCard title="Promiscuous" value={formatNum(promiscuousCount)} severity={promiscuousCount > 0 ? "crit" : "ok"} />
        <KpiCard title="MTU Varianten" value={formatNum(mtuValues)} severity={mtuValues > 2 ? "warn" : "ok"} icon={<Router className="h-4 w-4" />} />
        <KpiCard title="VMK DHCP" value={formatNum(dhcpVmk)} severity={dhcpVmk > 0 ? "warn" : "ok"} />
        <KpiCard title="Phys. NICs" value={formatNum(nics.length)} icon={<Wifi className="h-4 w-4" />} />
      </div>

      {vlanChart.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VLAN Verteilung (Top 20)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vlanChart}>
              <XAxis dataKey="vlan" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Security Policies ({policies.length})</h3>
        <VirtualTable data={policies} columns={policyColumns} globalFilter={filters.search} />
      </div>

      {vmkAdapters.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMkernel Adapter ({vmkAdapters.length})</h3>
          <VirtualTable data={vmkAdapters} columns={vmkColumns} globalFilter={filters.search} height={350} />
        </div>
      )}

      {nics.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Physische NICs ({nics.length})</h3>
          <VirtualTable data={nics} columns={nicColumns} globalFilter={filters.search} height={350} />
        </div>
      )}
    </div>
  );
}
