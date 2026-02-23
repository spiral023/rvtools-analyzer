import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useClusters, useDatastores, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { HardDrive, Cpu, MemoryStick, Server, Layers, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, CartesianGrid } from "recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE, CHART_COLORS, SEVERITY_COLORS, CHART_GRID_STYLE, CHART_AXIS_LABEL_STYLE } from "@/lib/chartStyles";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedDatastore } from "@/domain/models/types";

const dsColumns: ColumnDef<NormalizedDatastore, unknown>[] = [
  { accessorKey: "name", header: "Datastore" },
  { accessorKey: "type", header: "Typ" },
  { accessorKey: "capacityMiB", header: "Kapazität", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => {
    const v = getValue() as number | null;
    return <span className={v !== null && v < 10 ? "text-destructive font-semibold" : v !== null && v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "clusterName", header: "Cluster" },
];

interface ClusterMetric {
  name: string; cpuRatio: number; ramRatio: number; vCpuSum: number;
  threads: number; ramAllocGiB: number; ramTotalGiB: number;
}

interface RpRow { name: string; path: string; status: string; vms: number; cpuLimit: string; cpuReservation: number; cpuExpandable: boolean; memLimit: string; memReservation: number; memExpandable: boolean; risk: string }
interface ThinRiskRow { datastore: string; freePct: number; thinDisks: number; totalThinMiB: number; risk: string }

const clusterColumns: ColumnDef<ClusterMetric, unknown>[] = [
  { accessorKey: "name", header: "Cluster" },
  { accessorKey: "cpuRatio", header: "CPU Overcommit", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 5 ? "text-destructive font-semibold" : v > 3 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>; }},
  { accessorKey: "ramRatio", header: "RAM Overcommit", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 1.5 ? "text-destructive font-semibold" : v > 1.0 ? "text-warning" : "text-success"}>{v.toFixed(2)}:1</span>; }},
  { accessorKey: "vCpuSum", header: "vCPUs", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "threads", header: "Threads", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "ramAllocGiB", header: "RAM Alloc", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
  { accessorKey: "ramTotalGiB", header: "RAM Total", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB` },
];

const rpColumns: ColumnDef<RpRow, unknown>[] = [
  { accessorKey: "name", header: "Resource Pool" },
  { accessorKey: "path", header: "Pfad" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v}</span>; }},
  { accessorKey: "vms", header: "VMs" },
  { accessorKey: "cpuLimit", header: "CPU Limit" },
  { accessorKey: "cpuReservation", header: "CPU Res. MHz" },
  { accessorKey: "cpuExpandable", header: "CPU Expand.", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "memLimit", header: "Mem Limit" },
  { accessorKey: "memReservation", header: "Mem Res. MiB" },
  { accessorKey: "memExpandable", header: "Mem Expand.", cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const thinRiskColumns: ColumnDef<ThinRiskRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore" },
  { accessorKey: "freePct", header: "Frei %", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
  { accessorKey: "thinDisks", header: "Thin Disks" },
  { accessorKey: "totalThinMiB", header: "Thin Kapaz.", cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "risk", header: "Risiko", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

export default function Capacity() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: datastores = [] } = useDatastores();
  const { data: hosts = [] } = useHosts();
  const { data: rawRP = [] } = useRawSheet("vRP");
  const { data: rawDisks = [] } = useRawSheet("vDisk");

  const avgFreePct = useMemo(() => {
    const withPct = datastores.filter((d) => d.freePct !== null);
    if (!withPct.length) return null;
    return withPct.reduce((s, d) => s + d.freePct!, 0) / withPct.length;
  }, [datastores]);

  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;
  const warnDs = datastores.filter((d) => d.freePct !== null && d.freePct >= 10 && d.freePct < 20).length;

  const clusterMetrics = useMemo<ClusterMetric[]>(() => {
    return clusters.map((c) => {
      const clusterVms = vms.filter((v) => v.cluster === c.name && v.powerState === "poweredOn");
      const vCpuSum = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const ramAllocMiB = clusterVms.reduce((s, v) => s + (v.memoryMiB || 0), 0);
      const cpuRatio = c.numCpuThreads ? vCpuSum / c.numCpuThreads : 0;
      const ramRatio = c.totalMemoryMiB ? ramAllocMiB / c.totalMemoryMiB : 0;
      return { name: c.name, cpuRatio: Math.round(cpuRatio * 100) / 100, ramRatio: Math.round(ramRatio * 100) / 100, vCpuSum, threads: c.numCpuThreads || 0, ramAllocGiB: ramAllocMiB / 1024, ramTotalGiB: (c.totalMemoryMiB || 0) / 1024 };
    }).sort((a, b) => b.cpuRatio - a.cpuRatio);
  }, [clusters, vms]);

  const hostDensity = useMemo(() => {
    return hosts.map((h) => {
      const hostVms = vms.filter((v) => v.host === h.host && v.powerState === "poweredOn");
      const vCpuSum = hostVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      return { name: h.host, vms: hostVms.length, vcpuPerCore: h.cpuCores ? Math.round((vCpuSum / h.cpuCores) * 100) / 100 : 0, ramGiB: (h.memoryTotalMiB || 0) / 1024 };
    }).filter((h) => h.vms > 0);
  }, [hosts, vms]);

  const dsChart = useMemo(() => {
    return datastores.filter((d) => d.freePct !== null).map((d) => ({ name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name, freePct: Math.round(d.freePct! * 10) / 10 })).sort((a, b) => a.freePct - b.freePct).slice(0, 15);
  }, [datastores]);

  // Resource Pool Pressure
  const rpData = useMemo<RpRow[]>(() => {
    return rawRP.map((r) => {
      const d = r.data;
      const cpuLimit = Number(d["CPU limit"] ?? -1);
      const memLimit = Number(d["Mem limit"] ?? -1);
      const cpuExp = String(d["CPU expandableReservation"] || "").toLowerCase() === "true";
      const memExp = String(d["Mem expandableReservation"] || "").toLowerCase() === "true";
      const cpuRes = Number(d["CPU reservation"] || 0);
      const memRes = Number(d["Mem reservation"] || 0);
      let risk = "niedrig";
      if ((cpuLimit > 0 && cpuLimit !== -1) || (memLimit > 0 && memLimit !== -1)) risk = "mittel";
      if (!cpuExp || !memExp) risk = "mittel";
      if ((cpuLimit > 0 && cpuLimit !== -1 && !cpuExp) || (memLimit > 0 && memLimit !== -1 && !memExp)) risk = "hoch";
      return {
        name: String(d["Resource Pool name"] || ""),
        path: String(d["Resource Pool path"] || ""),
        status: String(d["Status"] || ""),
        vms: Number(d["# VMs"] || 0),
        cpuLimit: cpuLimit === -1 ? "Unlimited" : String(cpuLimit),
        cpuReservation: cpuRes,
        cpuExpandable: cpuExp,
        memLimit: memLimit === -1 ? "Unlimited" : String(memLimit),
        memReservation: memRes,
        memExpandable: memExp,
        risk,
      };
    }).sort((a, b) => (a.risk === "hoch" ? 0 : a.risk === "mittel" ? 1 : 2) - (b.risk === "hoch" ? 0 : b.risk === "mittel" ? 1 : 2));
  }, [rawRP]);

  const rpRisks = rpData.filter((r) => r.risk !== "niedrig").length;

  // Thin-Provisioning Risk per Datastore
  const thinRiskData = useMemo<ThinRiskRow[]>(() => {
    const dsMap = new Map<string, { freePct: number; thinDisks: number; totalThinMiB: number }>();
    for (const ds of datastores) {
      if (ds.freePct !== null) dsMap.set(ds.name, { freePct: ds.freePct, thinDisks: 0, totalThinMiB: 0 });
    }
    // We don't have DS name on vDisk directly, but we can count thin disks globally
    for (const r of rawDisks) {
      const thin = String(r.data["Thin"] || "").toLowerCase() === "true";
      if (thin) {
        // Count globally for now
        const cap = Number(r.data["Capacity MiB"] || 0);
        // Associate with first matching DS or create bucket
        const key = "__global__";
        if (!dsMap.has(key)) dsMap.set(key, { freePct: 0, thinDisks: 0, totalThinMiB: 0 });
        const e = dsMap.get(key)!;
        e.thinDisks++;
        e.totalThinMiB += cap;
      }
    }
    return [...dsMap.entries()]
      .filter(([, v]) => v.thinDisks > 0 || v.freePct < 20)
      .map(([name, v]) => {
        let risk = "niedrig";
        if (v.freePct < 20 && v.thinDisks > 0) risk = "mittel";
        if (v.freePct < 10 && v.thinDisks > 5) risk = "hoch";
        return { datastore: name, ...v, risk };
      })
      .filter((r) => r.risk !== "niedrig" || r.thinDisks > 0)
      .sort((a, b) => a.freePct - b.freePct);
  }, [datastores, rawDisks]);

  // Unshared vs Provisioned
  const storageEfficiency = useMemo(() => {
    const totalProv = vms.reduce((s, v) => s + (v.provisionedMiB || 0), 0);
    const totalInUse = vms.reduce((s, v) => s + (v.inUseMiB || 0), 0);
    const ratio = totalProv > 0 ? (totalInUse / totalProv) * 100 : 0;
    return { provGiB: totalProv / 1024, inUseGiB: totalInUse / 1024, ratio: Math.round(ratio * 10) / 10 };
  }, [vms]);

  const maxCpuOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.cpuRatio)) : 0;
  const maxRamOC = clusterMetrics.length > 0 ? Math.max(...clusterMetrics.map((c) => c.ramRatio)) : 0;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Capacity</h1><EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Capacity</h1>
      <FilterBar />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard title="Datastores" value={formatNum(datastores.length)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} />
        <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} />
        <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} />
        <KpiCard title="Max CPU OC" value={`${maxCpuOC.toFixed(1)}:1`} severity={maxCpuOC > 5 ? "crit" : maxCpuOC > 3 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} />
        <KpiCard title="Max RAM OC" value={`${maxRamOC.toFixed(1)}:1`} severity={maxRamOC > 1.5 ? "crit" : maxRamOC > 1.0 ? "warn" : "ok"} icon={<MemoryStick className="h-4 w-4" />} />
        <KpiCard title="RP Risiken" value={formatNum(rpRisks)} severity={rpRisks > 0 ? "warn" : "ok"} icon={<Layers className="h-4 w-4" />} />
        <KpiCard title="Speicherwirkgrad" value={`${storageEfficiency.ratio}%`} subtitle={`${storageEfficiency.inUseGiB.toFixed(0)} / ${storageEfficiency.provGiB.toFixed(0)} GiB`} icon={<Server className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dsChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {dsChart.map((entry, i) => <Cell key={i} fill={entry.freePct < 10 ? CHART_COLORS.danger : entry.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Host Dichte (VMs vs vCPU/Core)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis dataKey="vms" name="VMs" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "VMs/Host", position: "insideBottom", offset: -5, style: CHART_AXIS_LABEL_STYLE }} />
              <YAxis dataKey="vcpuPerCore" name="vCPU/Core" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} label={{ value: "vCPU/Core", angle: -90, position: "insideLeft", style: CHART_AXIS_LABEL_STYLE }} />
              <ZAxis dataKey="ramGiB" range={[40, 400]} name="RAM GiB" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={hostDensity} fill={CHART_COLORS.primary} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Cluster Overcommit</h3><VirtualTable data={clusterMetrics} columns={clusterColumns} globalFilter={filters.search} height={300} /></div>
      <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Datastore Details</h3><VirtualTable data={datastores} columns={dsColumns} globalFilter={filters.search} /></div>

      {rpData.length > 0 && (
        <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Resource Pool Pressure ({rpData.length})</h3><VirtualTable data={rpData} columns={rpColumns} globalFilter={filters.search} height={300} /></div>
      )}

      {thinRiskData.length > 0 && (
        <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Thin-Provisioning Risiko</h3><VirtualTable data={thinRiskData} columns={thinRiskColumns} globalFilter={filters.search} height={250} /></div>
      )}
    </div>
  );
}
