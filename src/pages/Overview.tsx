import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useVmsWithTechInfo, useHosts, useDatastores, useHealthEvents, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AverageVmPanel } from "@/components/dashboard/AverageVmPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { VmDetailDialog } from "@/components/vm/VmDetailDialog";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { Server, Cpu, AlertTriangle, Monitor, Database as DbIcon } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";
import { formatNum, formatBytes } from "@/lib/xlsx/parseHelpers";
import { buildAverageVm } from "@/lib/averageVm";
import { buildVmJoinKey, filterRowsByMatchingVmJoinKeys } from "@/lib/globalFilter";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OVERVIEW_KPI, OVERVIEW_VM_COLUMNS, OVERVIEW_SECTIONS } from "@/lib/glossary";

interface OverviewVmRow extends NormalizedVm {
  sysv: string | null;
}

const vmColumns: ColumnDef<OverviewVmRow, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: OVERVIEW_VM_COLUMNS.vmName } },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—", meta: { info: OVERVIEW_VM_COLUMNS.sysv } },
  { accessorKey: "powerState", header: "Power", meta: { info: OVERVIEW_VM_COLUMNS.powerState }, cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "poweredOn" ? "text-success" : v === "poweredOff" ? "text-muted-foreground" : "text-warning"}>{v || "—"}</span>;
  }},
  { accessorKey: "cluster", header: "Cluster", meta: { info: OVERVIEW_VM_COLUMNS.cluster } },
  { accessorKey: "host", header: "Host", meta: { info: OVERVIEW_VM_COLUMNS.host } },
  { accessorKey: "cpuCount", header: "vCPU", cell: ({ getValue }) => getValue() ?? "—", meta: { info: OVERVIEW_VM_COLUMNS.cpuCount } },
  { accessorKey: "memoryMiB", header: "RAM", cell: ({ getValue }) => formatBytes(getValue() as number | null), meta: { info: OVERVIEW_VM_COLUMNS.memoryMiB } },
  { accessorKey: "configStatus", header: "Config", meta: { info: OVERVIEW_VM_COLUMNS.configStatus }, cell: ({ getValue }) => {
    const v = getValue() as string;
    return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : v === "red" ? "text-destructive" : ""}>{v || "—"}</span>;
  }},
  { accessorKey: "osConfig", header: "OS", meta: { info: OVERVIEW_VM_COLUMNS.osConfig } },
];

export default function Overview() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vmsWithTechInfo: filteredVms, isLoading: vmsLoading } = useVmsWithTechInfo();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { data: healthEvents = [] } = useHealthEvents();
  const { data: rawCpuRows = [], isLoading: rawCpuLoading } = useRawSheet("vCPU");
  const { data: rawMemoryRows = [], isLoading: rawMemoryLoading } = useRawSheet("vMemory");
  const { data: rawDiskRows = [], isLoading: rawDiskLoading } = useRawSheet("vDisk");
  const { data: rawPartitionRows = [], isLoading: rawPartitionLoading } = useRawSheet("vPartition");
  const { data: rawNetworkRows = [], isLoading: rawNetworkLoading } = useRawSheet("vNetwork");
  const { data: rawSnapshotRows = [], isLoading: rawSnapshotLoading } = useRawSheet("vSnapshot");
  const { data: rawToolsRows = [], isLoading: rawToolsLoading } = useRawSheet("vTools");
  const dataLoading = snapshotsLoading || vmsLoading || hostsLoading || datastoresLoading
    || rawCpuLoading || rawMemoryLoading || rawDiskLoading || rawPartitionLoading
    || rawNetworkLoading || rawSnapshotLoading || rawToolsLoading;

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

  // Raw-Sheets exakt auf die aktuell gefilterten VMs beschränken – filterVmRows berücksichtigt
  // Suche/Cluster/Host nicht, daher wird der Scope direkt aus filteredVms gebildet.
  const scopedVmJoinKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const vm of filteredVms) keys.add(buildVmJoinKey(vm.snapshotId, vm.vmName));
    return keys;
  }, [filteredVms]);

  const averageVm = useMemo(
    () =>
      buildAverageVm({
        vms: filteredVms,
        memoryRows: filterRowsByMatchingVmJoinKeys(rawMemoryRows, scopedVmJoinKeys),
        diskRows: filterRowsByMatchingVmJoinKeys(rawDiskRows, scopedVmJoinKeys),
        partitionRows: filterRowsByMatchingVmJoinKeys(rawPartitionRows, scopedVmJoinKeys),
        networkRows: filterRowsByMatchingVmJoinKeys(rawNetworkRows, scopedVmJoinKeys),
      }),
    [filteredVms, rawMemoryRows, rawDiskRows, rawPartitionRows, rawNetworkRows, scopedVmJoinKeys],
  );

  const vmsForTable = useMemo<OverviewVmRow[]>(
    () =>
      [...filteredVms].sort((a, b) =>
        a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }),
      ).map((vm) => ({
        ...vm,
        sysv: vm.techInfo?.sysv ?? null,
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
      <AverageVmPanel avg={averageVm} />
      <div>
        <InfoTooltip entry={OVERVIEW_SECTIONS.vmTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Virtuelle Maschinen ({filteredVms.length})</h3>
        </InfoTooltip>
        <VirtualTable
          data={vmsForTable}
          columns={vmColumns}
          globalFilter={filters.search}
          height={400}
          onRowClick={setSelectedVm}
        />
      </div>
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
