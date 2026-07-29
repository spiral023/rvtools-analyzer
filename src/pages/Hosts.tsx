import { Cpu, HardDrive, MemoryStick, Server, Wrench } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { HostInventoryPanel } from "@/components/hosts/HostInventoryPanel";
import { HostHygienePanel } from "@/components/hosts/HostHygienePanel";
import { EsxiVersionsTable } from "@/components/vmware-versions/VmwareReleaseTables";
import { useActiveSnapshotIds, useHosts } from "@/hooks/useActiveSnapshots";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";

export default function Hosts() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();

  if (snapshotsLoading || hostsLoading) return <PageLoadingState title="Hosts" />;

  if (snapshots.length === 0) {
    return <div className="space-y-6 animate-fade-in"><PageHeader title="Hosts" /><EmptyState icon={<Server className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>;
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
      <HostInventoryPanel hosts={hosts} globalFilter={filters.search} />
      <HostHygienePanel />
      <EsxiVersionsTable />
    </div>
  );
}
