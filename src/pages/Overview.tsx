import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useAllVropsLatest, useVmsWithTechInfo, useHosts, useClusters, useDatastores, useHealthEvents, useVmSnapshots, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AverageVmPanel } from "@/components/dashboard/AverageVmPanel";
import { HealthEventsPanel } from "@/components/dashboard/HealthEventsPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import { VmInventoryTable, type OverviewVmRow } from "@/components/vm/VmInventoryTable";
import { VCenterOverviewTable } from "@/components/fleet/VCenterOverviewTable";
import { clusterOverviewColumns } from "@/components/cluster/clusterOverviewColumns";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useAverageVm } from "@/hooks/useAverageVm";
import { Server, Cpu, AlertTriangle, Monitor, Database as DbIcon } from "lucide-react";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { OVERVIEW_KPI } from "@/lib/glossary";
import { buildClusterOverviewRows } from "@/lib/clusterWorkspace";
import { buildVCenterSummaries, buildVCenterVersionBySnapshot, latestSnapshotsByVcenter } from "@/lib/vcenterWorkspace";

export default function Overview() {
  const { snapshots, activeSnapshotIds, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vmsWithTechInfo: filteredVms, isLoading: vmsLoading } = useVmsWithTechInfo();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { data: healthEvents = [] } = useHealthEvents();
  const { data: vmSnapshots = [], isLoading: vmSnapshotsLoading } = useVmSnapshots();
  const { data: vropsLatest = [], isLoading: vropsLoading } = useAllVropsLatest();
  const { data: rawCpuRows = [], isLoading: rawCpuLoading } = useRawSheet("vCPU");
  const { data: rawMemoryRows = [], isLoading: rawMemoryLoading } = useRawSheet("vMemory");
  const { data: rawDiskRows = [], isLoading: rawDiskLoading } = useRawSheet("vDisk");
  const { data: rawPartitionRows = [], isLoading: rawPartitionLoading } = useRawSheet("vPartition");
  const { data: rawNetworkRows = [], isLoading: rawNetworkLoading } = useRawSheet("vNetwork");
  const { data: rawSnapshotRows = [], isLoading: rawSnapshotLoading } = useRawSheet("vSnapshot");
  const { data: rawToolsRows = [], isLoading: rawToolsLoading } = useRawSheet("vTools");
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const { data: rawDvPortRows = [], isLoading: rawDvPortLoading } = useRawSheet("dvPort");
  const { data: rawVSourceRows = [], isLoading: rawVSourceLoading } = useRawSheet("vSource");
  const dataLoading = snapshotsLoading || vmsLoading || hostsLoading || datastoresLoading
    || clustersLoading || vmSnapshotsLoading || vropsLoading
    || rawCpuLoading || rawMemoryLoading || rawDiskLoading || rawPartitionLoading
    || rawNetworkLoading || rawSnapshotLoading || rawToolsLoading || rawVHostLoading
    || rawDvPortLoading || rawVSourceLoading;

  const [selectedVm, setSelectedVm] = useState<OverviewVmRow | null>(null);
  const filteredRawCpuRows = useMemo(() => filterVmRows(rawCpuRows), [filterVmRows, rawCpuRows]);
  const filteredRawMemoryRows = useMemo(() => filterVmRows(rawMemoryRows), [filterVmRows, rawMemoryRows]);
  const filteredRawDiskRows = useMemo(() => filterVmRows(rawDiskRows), [filterVmRows, rawDiskRows]);
  const filteredRawPartitionRows = useMemo(() => filterVmRows(rawPartitionRows), [filterVmRows, rawPartitionRows]);
  const filteredRawNetworkRows = useMemo(() => filterVmRows(rawNetworkRows), [filterVmRows, rawNetworkRows]);
  const filteredRawSnapshotRows = useMemo(() => filterVmRows(rawSnapshotRows), [filterVmRows, rawSnapshotRows]);
  const filteredRawToolsRows = useMemo(() => filterVmRows(rawToolsRows), [filterVmRows, rawToolsRows]);

  const poweredOn = filteredVms.filter((v) => v.powerState === "poweredOn").length;
  const poweredOff = filteredVms.filter((v) => v.powerState === "poweredOff").length;
  const critDs = datastores.filter((d) => d.freePct !== null && d.freePct < 10).length;

  const activeSnapshots = useMemo(() => {
    const activeSnapshotSet = new Set(activeSnapshotIds);
    return snapshots.filter((snapshot) => activeSnapshotSet.has(snapshot.snapshotId));
  }, [activeSnapshotIds, snapshots]);

  const clusterRows = useMemo(() => {
    const allRows = buildClusterOverviewRows({
      clusters,
      hosts,
      vms: filteredVms,
      rawVHostRows,
      snapshots: activeSnapshots,
      vropsLatest,
    });
    const selectedClusters = new Set(filters.clusters);
    const query = filters.search.trim().toLocaleLowerCase("de-DE");
    return allRows.filter((row) => {
      if (selectedClusters.size > 0 && !selectedClusters.has(row.cluster)) return false;
      return !query || [row.vcenterDisplayName, row.datacenter, row.cluster].some((value) => value.toLocaleLowerCase("de-DE").includes(query));
    });
  }, [activeSnapshots, clusters, filteredVms, filters.clusters, filters.search, hosts, rawVHostRows, vropsLatest]);

  const vcenterSummaries = useMemo(
    () => buildVCenterSummaries({
      snapshots: latestSnapshotsByVcenter(activeSnapshots),
      vms: filteredVms,
      hosts,
      clusters,
      datastores,
      health: healthEvents,
      vmSnapshots,
      rawDvPort: rawDvPortRows,
      versionBySnapshot: buildVCenterVersionBySnapshot(rawVSourceRows),
    }),
    [activeSnapshots, clusters, datastores, filteredVms, healthEvents, hosts, rawDvPortRows, rawVSourceRows, vmSnapshots],
  );

  const { avg: averageVm, workload: averageVmWorkload, hasVropsImport: hasVropsTimeSeriesImport } = useAverageVm(filteredVms);

  const vmsForTable = useMemo<OverviewVmRow[]>(
    () =>
      [...filteredVms].sort((a, b) =>
        a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }),
      ).map((vm) => ({
        ...vm,
        sysv: vm.techInfo?.sysv ?? null,
        sysvDepartment: vm.techInfo?.sysvDepartment ?? null,
      })),
    [filteredVms],
  );

  if (dataLoading) return <PageLoadingState title="Overview" />;

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Overview</h1>
        <EmptyState icon={<Monitor className="h-6 w-6" />} title="Keine Daten vorhanden" description="Laden Sie einen RVTools XLSX-Export hoch, um Ihre VMware-Infrastruktur zu analysieren." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Overview" />
      <GlobalFilterScopeHint text="VM-bezogene Bereiche und Health-Events mit eindeutigem VM-Entity folgen dem globalen Filter; Hosts und Datastores bleiben unverändert." />
      <KpiGrid>
        <KpiCard title="VMs Total" value={formatNum(filteredVms.length)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.vmsTotal} />
        <KpiCard title="Powered On" value={formatNum(poweredOn)} severity="ok" icon={<Cpu className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOn} />
        <KpiCard title="Powered Off" value={formatNum(poweredOff)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOff} />
        <KpiCard title="Hosts" value={formatNum(hosts.length)} icon={<Server className="h-4 w-4" />} info={OVERVIEW_KPI.hosts} />
        <KpiCard title="Datastores" value={formatNum(datastores.length)} severity={critDs > 0 ? "crit" : undefined} subtitle={critDs > 0 ? `${critDs} kritisch` : undefined} icon={<DbIcon className="h-4 w-4" />} info={OVERVIEW_KPI.datastores} />
        <KpiCard title="Health Events" value={formatNum(healthEvents.length)} severity={healthEvents.length > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={OVERVIEW_KPI.healthEvents} />
      </KpiGrid>
      <AverageVmPanel avg={averageVm} workload={averageVmWorkload} hasVropsImport={hasVropsTimeSeriesImport} />
      <HealthEventsPanel />
      {vcenterSummaries.length > 0 && <VCenterOverviewTable summaries={vcenterSummaries} />}
      {clusterRows.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Clusterübersicht</h3>
            <span className="text-xs text-muted-foreground">({formatNum(clusterRows.length)})</span>
          </div>
          <VirtualTable data={clusterRows} columns={clusterOverviewColumns} globalFilter={filters.search} height={420} initialSorting={[{ id: "riskScore", desc: true }]} exportFileName="overview-cluster-uebersicht" />
        </section>
      )}
      <VmInventoryTable vms={vmsForTable} globalFilter={filters.search} onRowClick={setSelectedVm} />
      <VmDetailDialog
        vm={selectedVm}
        open={!!selectedVm}
        onClose={() => setSelectedVm(null)}
        rawCpuRows={filteredRawCpuRows}
        rawMemoryRows={filteredRawMemoryRows}
        rawDiskRows={filteredRawDiskRows}
        rawPartitionRows={filteredRawPartitionRows}
        rawNetworkRows={filteredRawNetworkRows}
        rawSnapshotRows={filteredRawSnapshotRows}
        rawToolsRows={filteredRawToolsRows}
      />
    </div>
  );
}
