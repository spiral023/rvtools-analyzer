import { Cpu, HardDrive, MemoryStick, Server, Wrench } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { HostInventoryPanel } from "@/components/hosts/HostInventoryPanel";
import { HostHygienePanel } from "@/components/hosts/HostHygienePanel";
import { HostLoadMap } from "@/components/hosts/HostLoadMap";
import { EsxiVersionsTable } from "@/components/vmware-versions/VmwareReleaseTables";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";

export default function Hosts() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: rawVHost = [], isLoading: rawHostsLoading } = useRawSheet("vHost");
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const { isRestricted, isPending: restrictedPending } = useRestrictedDataset();

  if (snapshotsLoading || hostsLoading || restrictedPending) return <PageLoadingState title="Hosts" />;

  // Die Navigation blendet den Eintrag bereits aus; dieser Zweig fängt Deep-Links
  // und gespeicherte Lesezeichen ab.
  if (isRestricted) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Hosts" />
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title="Im eingeschränkten SysV-Datensatz nicht verfügbar"
          description="Das importierte Datenpaket enthält Hosts ausschließlich als gemeinsamen Kapazitätskontext der enthaltenen VMs. Eine Hostübersicht wäre daher unvollständig."
          actionLabel="Zu den VMs"
          actionTo="/vms"
        />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return <div className="space-y-6 animate-fade-in"><PageHeader title="Hosts" /><EmptyState icon={<Server className="h-6 w-6" />} title="Keine Daten" description="Lade RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>;
  }

  const connectedHosts = hosts.filter((host) => host.connectionState === "connected").length;
  const maintenanceHosts = hosts.filter((host) => host.maintenanceMode === "True").length;
  const hostedVms = hosts.reduce((sum, host) => sum + (host.vmCount ?? 0), 0);
  const totalCpuCores = hosts.reduce((sum, host) => sum + (host.cpuCores ?? 0), 0);
  const totalMemoryMiB = hosts.reduce((sum, host) => sum + (host.memoryTotalMiB ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Hosts" />
      <KpiGrid>
        <KpiCard title="ESXi Hosts" value={formatNum(hosts.length)} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Verbunden" value={formatNum(connectedHosts)} severity={connectedHosts === hosts.length ? "ok" : "warn"} subtitle={`von ${formatNum(hosts.length)}`} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Wartungsmodus" value={formatNum(maintenanceHosts)} severity={maintenanceHosts > 0 ? "warn" : "ok"} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard title="VMs auf Hosts" value={formatNum(hostedVms)} icon={<HardDrive className="h-4 w-4" />} />
        <KpiCard title="CPU-Kerne" value={formatNum(totalCpuCores)} icon={<Cpu className="h-4 w-4" />} />
        <KpiCard title="RAM" value={formatBytes(totalMemoryMiB)} icon={<MemoryStick className="h-4 w-4" />} />
      </KpiGrid>
      <HostLoadMap
        hosts={hosts}
        rawVHostRows={rawVHost}
        snapshots={snapshots}
        filters={{ clusters: filters.clusters, hosts: filters.hosts, search: filters.search }}
        isLoading={rawHostsLoading}
        onHostClick={openHostDetail}
      />
      <HostInventoryPanel hosts={hosts} globalFilter={filters.search} rawVHostRows={rawVHost} />
      <HostHygienePanel />
      <EsxiVersionsTable />
      {hostDetailDialog}
    </div>
  );
}
