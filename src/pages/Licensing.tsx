import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet, useVms, useClusters, useHosts, useDatastores } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Key, AlertTriangle, CheckCircle2, Power, Database, Server, Gauge } from "lucide-react";
import { formatNum, formatPct, formatBytes } from "@/lib/xlsx/parseHelpers";
import { formatRvtoolsDate } from "@/lib/vmDetail";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  LICENSING_KPI,
  LICENSING_COLUMNS,
  IDLE_COLUMNS,
  CLUSTER_DENSITY_COLUMNS,
  DS_EFFICIENCY_COLUMNS,
  LICENSING_SECTIONS,
} from "@/lib/glossaries/licensing";
import type { ColumnDef } from "@tanstack/react-table";

interface LicenseRow { name: string; key: string; costUnit: string; total: number; used: number; usedPct: number; expiration: string; features: string }
interface IdleRow { snapshotId: string; vm: string; powerState: string; cpuCount: number; memoryMiB: number; cluster: string; reason: string }
interface ClusterDensityRow { cluster: string; hosts: number; vmsPerHost: number; vcpuPerCore: number; ramUtilPct: number }
interface DsEffRow { datastore: string; provisionedMiB: number; inUseMiB: number; freeMiB: number; efficiency: number }

const licColumns: ColumnDef<LicenseRow, unknown>[] = [
  { accessorKey: "name", header: "Lizenz", meta: { info: LICENSING_COLUMNS.name } },
  { accessorKey: "key", header: "Key", meta: { info: LICENSING_COLUMNS.key } },
  { accessorKey: "costUnit", header: "Einheit", meta: { info: LICENSING_COLUMNS.costUnit } },
  { accessorKey: "total", header: "Total", meta: { info: LICENSING_COLUMNS.total }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "used", header: "Verwendet", meta: { info: LICENSING_COLUMNS.used }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "usedPct", header: "Auslastung", meta: { info: LICENSING_COLUMNS.usedPct }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 95 ? "text-destructive font-semibold" : v > 85 ? "text-warning" : "text-success"}>{formatPct(v)}</span>; }},
  { accessorKey: "expiration", header: "Ablauf", meta: { info: LICENSING_COLUMNS.expiration } },
  { accessorKey: "features", header: "Features", meta: { info: LICENSING_COLUMNS.features }, cell: ({ getValue }) => { const v = getValue() as string; return <span className="text-xs text-muted-foreground">{v.length > 80 ? v.slice(0, 77) + "…" : v}</span>; }},
];

const idleColumns: ColumnDef<IdleRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: IDLE_COLUMNS.vm } },
  { accessorKey: "powerState", header: "Power", meta: { info: IDLE_COLUMNS.powerState } },
  { accessorKey: "cpuCount", header: "vCPU", meta: { info: IDLE_COLUMNS.cpuCount } },
  { accessorKey: "memoryMiB", header: "RAM", meta: { info: IDLE_COLUMNS.memoryMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "cluster", header: "Cluster", meta: { info: IDLE_COLUMNS.cluster } },
  { accessorKey: "reason", header: "Grund", meta: { info: IDLE_COLUMNS.reason }, cell: ({ getValue }) => <span className="text-warning text-xs">{getValue() as string}</span> },
];

const clusterDensityColumns: ColumnDef<ClusterDensityRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_DENSITY_COLUMNS.cluster } },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CLUSTER_DENSITY_COLUMNS.hosts } },
  { accessorKey: "vmsPerHost", header: "VMs/Host", meta: { info: CLUSTER_DENSITY_COLUMNS.vmsPerHost }, cell: ({ getValue }) => (getValue() as number).toFixed(1) },
  { accessorKey: "vcpuPerCore", header: "vCPU/Core", meta: { info: CLUSTER_DENSITY_COLUMNS.vcpuPerCore }, cell: ({ getValue }) => (getValue() as number).toFixed(2) },
  { accessorKey: "ramUtilPct", header: "RAM Util %", meta: { info: CLUSTER_DENSITY_COLUMNS.ramUtilPct }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v > 85 ? "text-warning" : ""}>{v.toFixed(0)}%</span>; }},
];

const dsEffColumns: ColumnDef<DsEffRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore", meta: { info: DS_EFFICIENCY_COLUMNS.datastore } },
  { accessorKey: "provisionedMiB", header: "Provisioned", meta: { info: DS_EFFICIENCY_COLUMNS.provisionedMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "inUseMiB", header: "In Use", meta: { info: DS_EFFICIENCY_COLUMNS.inUseMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "freeMiB", header: "Frei", meta: { info: DS_EFFICIENCY_COLUMNS.freeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "efficiency", header: "Effizienz %", meta: { info: DS_EFFICIENCY_COLUMNS.efficiency }, cell: ({ getValue }) => { const v = getValue() as number; return `${v.toFixed(0)}%`; }},
];

export default function Licensing() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: rawLicense = [] } = useRawSheet("vLicense");
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { data: clusters = [] } = useClusters();
  const { data: hosts = [] } = useHosts();
  const { data: datastores = [] } = useDatastores();

  const licenses = useMemo<LicenseRow[]>(() =>
    rawLicense.map((r) => { const total = Number(r.data["Total"] || 0); const used = Number(r.data["Used"] || 0); return { name: String(r.data["Name"] || ""), key: String(r.data["Key"] || ""), costUnit: String(r.data["Cost Unit"] || ""), total, used, usedPct: total > 0 ? (used / total) * 100 : 0, expiration: formatRvtoolsDate(r.data["Expiration Date"]), features: String(r.data["Features"] || "") }; }), [rawLicense]);

  const totalLicenses = licenses.length;
  const highUtil = licenses.filter((l) => l.usedPct > 85).length;
  const critUtil = licenses.filter((l) => l.usedPct > 95).length;
  const expiring = licenses.filter((l) => l.expiration !== "Never" && l.expiration !== "—").length;

  const utilizationLicenses = useMemo(
    () => [...licenses].sort((a, b) => b.usedPct - a.usedPct),
    [licenses],
  );

  // Idle/Shutdown Candidates
  const idleCandidates = useMemo<IdleRow[]>(() => {
    const rows: IdleRow[] = [];
    for (const vm of vms) {
      if (vm.powerState === "poweredOff") {
        rows.push({ snapshotId: vm.snapshotId, vm: vm.vmName, powerState: vm.powerState || "", cpuCount: vm.cpuCount || 0, memoryMiB: vm.memoryMiB || 0, cluster: vm.cluster || "", reason: "Powered Off" });
      }
    }
    return rows;
  }, [vms]);

  const idleCpus = idleCandidates.reduce((s, v) => s + v.cpuCount, 0);
  const idleRamGiB = idleCandidates.reduce((s, v) => s + v.memoryMiB, 0) / 1024;

  // Cluster Density
  const clusterDensity = useMemo<ClusterDensityRow[]>(() => {
    return clusters.map((c) => {
      const clusterHosts = hosts.filter((h) => h.cluster === c.name);
      const clusterVms = vms.filter((v) => v.cluster === c.name && v.powerState === "poweredOn");
      const totalVcpu = clusterVms.reduce((s, v) => s + (v.cpuCount || 0), 0);
      const totalRam = clusterVms.reduce((s, v) => s + (v.memoryMiB || 0), 0);
      return { cluster: c.name, hosts: clusterHosts.length, vmsPerHost: clusterHosts.length > 0 ? clusterVms.length / clusterHosts.length : 0, vcpuPerCore: c.numCpuThreads ? totalVcpu / c.numCpuThreads : 0, ramUtilPct: c.totalMemoryMiB ? (totalRam / c.totalMemoryMiB) * 100 : 0 };
    }).sort((a, b) => b.vmsPerHost - a.vmsPerHost);
  }, [clusters, hosts, vms]);

  // Datastore Efficiency
  const dsEfficiency = useMemo<DsEffRow[]>(() => {
    return datastores.map((ds) => {
      const prov = ds.capacityMiB || 0;
      const inUse = ds.inUseMiB || 0;
      return { datastore: ds.name, provisionedMiB: prov, inUseMiB: inUse, freeMiB: ds.freeMiB || 0, efficiency: prov > 0 ? (inUse / prov) * 100 : 0 };
    }).sort((a, b) => b.efficiency - a.efficiency);
  }, [datastores]);

  if (snapshotsLoading) return <PageLoadingState title="Licensing & Effizienz" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Licensing</h1><EmptyState icon={<Key className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Licensing & Effizienz</h1>
      <FilterBar />
      <GlobalFilterScopeHint text="Idle-VM-Kandidaten folgen dem globalen Filter; Lizenz-, Cluster- und Datastore-Übersichten bleiben unverändert." />
      <KpiGrid>
        <KpiCard title="Lizenzen" value={formatNum(totalLicenses)} icon={<Key className="h-4 w-4" />} info={LICENSING_KPI.totalLicenses} />
        <KpiCard title="Hoch (>85%)" value={formatNum(highUtil)} severity={highUtil > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={LICENSING_KPI.highUtil} />
        <KpiCard title="Kritisch (>95%)" value={formatNum(critUtil)} severity={critUtil > 0 ? "crit" : "ok"} info={LICENSING_KPI.critUtil} />
        <KpiCard title="Mit Ablaufdatum" value={formatNum(expiring)} severity={expiring > 0 ? "warn" : "ok"} icon={<CheckCircle2 className="h-4 w-4" />} info={LICENSING_KPI.expiring} />
        <KpiCard title="Idle VMs" value={formatNum(idleCandidates.length)} subtitle={`${idleCpus} vCPU · ${idleRamGiB.toFixed(0)} GiB`} icon={<Power className="h-4 w-4" />} info={LICENSING_KPI.idleVms} />
        <KpiCard title="Clusters" value={formatNum(clusterDensity.length)} icon={<Server className="h-4 w-4" />} info={LICENSING_KPI.clusters} />
        <KpiCard title="Datastores" value={formatNum(dsEfficiency.length)} icon={<Database className="h-4 w-4" />} info={LICENSING_KPI.datastores} />
      </KpiGrid>

      {utilizationLicenses.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={LICENSING_SECTIONS.utilizationChart} side="bottom">
            <h3 className="mb-1 flex w-fit items-center gap-2 cursor-help text-sm font-semibold text-muted-foreground"><Gauge className="h-4 w-4" /> Lizenzauslastung</h3>
          </InfoTooltip>
          <p className="mb-4 text-xs text-muted-foreground">Karten zeigen Verbrauch, Restkapazität und den Schwellenstatus je Lizenz auf einen Blick.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {utilizationLicenses.map((license) => {
              const severity = license.usedPct > 95 ? "crit" : license.usedPct > 85 ? "warn" : "ok";
              const accentClass = severity === "crit" ? "bg-destructive" : severity === "warn" ? "bg-warning" : "bg-success";
              const textClass = severity === "crit" ? "text-destructive" : severity === "warn" ? "text-warning" : "text-success";
              return (
                <div key={`${license.name}-${license.key}`} className="rounded-md border border-border/60 bg-background/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold" title={license.name}>{license.name || "Unbenannte Lizenz"}</p><p className="mt-0.5 text-xs text-muted-foreground">{license.costUnit || "Einheiten"}</p></div>
                    <span className={`shrink-0 font-mono-data text-lg font-semibold ${textClass}`}>{formatPct(license.usedPct)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${accentClass}`} style={{ width: `${Math.min(license.usedPct, 100)}%` }} /></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span><span className="font-mono-data text-foreground">{formatNum(license.used)}</span> verwendet</span><span><span className="font-mono-data text-foreground">{formatNum(Math.max(license.total - license.used, 0))}</span> frei</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {licenses.length > 0 && (<div><InfoTooltip entry={LICENSING_SECTIONS.licenseTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Lizenz Details</h3></InfoTooltip><VirtualTable data={licenses} columns={licColumns} globalFilter={filters.search} /></div>)}

      {idleCandidates.length > 0 && (<div><InfoTooltip entry={LICENSING_SECTIONS.idleTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Idle / Stilllegungskandidaten ({idleCandidates.length})</h3></InfoTooltip><VirtualTable data={idleCandidates} columns={idleColumns} globalFilter={filters.search} height={350} onRowClick={openVmDetail} /></div>)}

      <div><InfoTooltip entry={LICENSING_SECTIONS.clusterDensity} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Cluster Dichte & Effizienz</h3></InfoTooltip><VirtualTable data={clusterDensity} columns={clusterDensityColumns} globalFilter={filters.search} height={300} /></div>
      <div><InfoTooltip entry={LICENSING_SECTIONS.dsEfficiency} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Effizienz</h3></InfoTooltip><VirtualTable data={dsEfficiency} columns={dsEffColumns} globalFilter={filters.search} height={300} /></div>
      {vmDetailDialog}
    </div>
  );
}
