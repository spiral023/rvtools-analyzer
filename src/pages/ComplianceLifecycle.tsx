import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Shield, Cpu, Wrench, MonitorCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm, NormalizedHost } from "@/domain/models/types";

interface ComplianceVm { vmName: string; hwVersion: string | null; firmware: string | null; secureBoot: boolean | null; cbt: boolean | null; osConfig: string | null; osTools: string | null; osDrift: boolean; toolsStatus: string | null; cluster: string | null }

const compColumns: ColumnDef<ComplianceVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "hwVersion", header: "HW Version" },
  { accessorKey: "firmware", header: "Firmware" },
  { accessorKey: "secureBoot", header: "Secure Boot", cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—";
  }},
  { accessorKey: "cbt", header: "CBT", cell: ({ getValue }) => {
    const v = getValue() as boolean | null;
    return v === true ? <span className="text-success">Ja</span> : v === false ? <span className="text-warning">Nein</span> : "—";
  }},
  { accessorKey: "osDrift", header: "OS Drift", cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : <span className="text-success">Nein</span> },
  { accessorKey: "toolsStatus", header: "Tools" },
  { accessorKey: "cluster", header: "Cluster" },
];

const hostColumns: ColumnDef<NormalizedHost, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "version", header: "ESXi Version" },
  { accessorKey: "build", header: "Build" },
  { accessorKey: "cpuModel", header: "CPU Model" },
  { accessorKey: "vendor", header: "Vendor" },
  { accessorKey: "model", header: "Model" },
];

export default function ComplianceLifecycle() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: hosts = [] } = useHosts();
  const { data: rawVTools = [] } = useRawSheet("vTools");

  const complianceVms = useMemo<ComplianceVm[]>(() =>
    vms.map((v) => ({
      vmName: v.vmName,
      hwVersion: v.hwVersion,
      firmware: v.firmware,
      secureBoot: v.efiSecureBoot,
      cbt: v.cbt,
      osConfig: v.osConfig,
      osTools: v.osTools,
      osDrift: !!(v.osConfig && v.osTools && v.osConfig !== v.osTools),
      toolsStatus: v.toolsStatus,
      cluster: v.cluster,
    })),
  [vms]);

  const noSecureBoot = complianceVms.filter((v) => v.secureBoot === false).length;
  const noCbt = complianceVms.filter((v) => v.cbt === false).length;
  const osDrift = complianceVms.filter((v) => v.osDrift).length;
  const biosVms = complianceVms.filter((v) => v.firmware && v.firmware.toLowerCase() !== "efi").length;

  // HW version distribution
  const hwVersionChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of complianceVms) {
      const hw = v.hwVersion || "Unknown";
      map.set(hw, (map.get(hw) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name: `vmx-${name}`, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [complianceVms]);

  // ESXi build drift
  const buildChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hosts) {
      const ver = `${h.version || "?"} (${h.build || "?"})`;
      map.set(ver, (map.get(ver) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [hosts]);

  // Tools upgrade candidates
  const toolsUpgradeable = useMemo(() => {
    return rawVTools.filter((r) => {
      const upgradeable = String(r.data["Upgradeable"] || "");
      return upgradeable.toLowerCase() === "yes" || upgradeable.toLowerCase() === "true";
    }).length;
  }, [rawVTools]);

  // CPU generation mix per cluster
  const cpuMix = useMemo(() => {
    const clusterCpus = new Map<string, Set<string>>();
    for (const h of hosts) {
      if (h.cluster && h.cpuModel) {
        if (!clusterCpus.has(h.cluster)) clusterCpus.set(h.cluster, new Set());
        clusterCpus.get(h.cluster)!.add(h.cpuModel);
      }
    }
    return [...clusterCpus.entries()]
      .filter(([, models]) => models.size > 1)
      .map(([cluster, models]) => ({ cluster, models: models.size, list: [...models].join(", ") }));
  }, [hosts]);

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Compliance / Lifecycle</h1><EmptyState icon={<Shield className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Compliance / Lifecycle</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Kein Secure Boot" value={formatNum(noSecureBoot)} severity={noSecureBoot > 0 ? "warn" : "ok"} icon={<Shield className="h-4 w-4" />} />
        <KpiCard title="BIOS (kein EFI)" value={formatNum(biosVms)} severity={biosVms > 0 ? "warn" : "ok"} />
        <KpiCard title="Kein CBT" value={formatNum(noCbt)} severity={noCbt > 0 ? "warn" : "ok"} />
        <KpiCard title="OS Drift" value={formatNum(osDrift)} severity={osDrift > 0 ? "warn" : "ok"} icon={<MonitorCheck className="h-4 w-4" />} />
        <KpiCard title="Tools Upgrade" value={formatNum(toolsUpgradeable)} severity={toolsUpgradeable > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="CPU-Mix Cluster" value={formatNum(cpuMix.length)} severity={cpuMix.length > 0 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">HW Version Verteilung</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hwVersionChart}>
              <XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">ESXi Version/Build</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={buildChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} strokeWidth={0}>
                {buildChart.map((_, i) => <Cell key={i} fill={SEVERITY_COLORS[i % SEVERITY_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Compliance ({complianceVms.length})</h3>
        <VirtualTable data={complianceVms} columns={compColumns} globalFilter={filters.search} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Inventar ({hosts.length})</h3>
        <VirtualTable data={hosts} columns={hostColumns} globalFilter={filters.search} height={350} />
      </div>

      {cpuMix.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">CPU-Generationen Mix je Cluster</h3>
          <div className="space-y-2">
            {cpuMix.map((c) => (
              <div key={c.cluster} className="flex items-start gap-2 text-sm">
                <span className="font-medium text-warning">{c.cluster}</span>
                <span className="text-muted-foreground">— {c.models} Modelle: {c.list}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
