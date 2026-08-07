import { Cpu, HardDrive, MemoryStick, Server, Wrench } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HostInventoryPanel } from "@/components/hosts/HostInventoryPanel";
import { HostHygienePanel } from "@/components/hosts/HostHygienePanel";
import { HostLoadMap } from "@/components/hosts/HostLoadMap";
import { EsxiVersionsTable } from "@/components/vmware-versions/VmwareReleaseTables";
import { HardwarePanel } from "@/pages/Hardware";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { useOptionalAppMode } from "@/hooks/useAppMode";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";

type HostsTab = "overview" | "hardware";

function isHostsTab(value: string | null): value is HostsTab {
  return value === "overview" || value === "hardware";
}

export default function Hosts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: rawVHost = [], isLoading: rawHostsLoading } = useRawSheet("vHost");
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const { isRestricted, isPending: restrictedPending } = useRestrictedDataset();
  const appMode = useOptionalAppMode();

  /**
   * Die Hardware-Analyse beschreibt den physischen Bestand der gesamten Umgebung und
   * bleibt im SysV-Modus deshalb verborgen — wie zuvor der eigene Menüpunkt. Solange der
   * Modus lädt, bleibt der Tab aus, damit keine falsche Auswahl aufblinkt.
   */
  const showsHardware = (appMode?.isHydrated ?? true) && appMode?.mode !== "sysv";
  const requestedTab = searchParams.get("tab");
  const tab: HostsTab = isHostsTab(requestedTab) && (requestedTab !== "hardware" || showsHardware)
    ? requestedTab
    : "overview";

  const selectTab = (value: string) => {
    if (!isHostsTab(value)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "overview") next.delete("tab");
      else next.set("tab", value);
      return next;
    });
  };

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
      <Tabs value={tab} onValueChange={selectTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          {showsHardware && <TabsTrigger value="hardware">Hardware</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
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
        </TabsContent>
        {showsHardware && (
          <TabsContent value="hardware">
            <HardwarePanel />
          </TabsContent>
        )}
      </Tabs>
      {hostDetailDialog}
    </div>
  );
}
