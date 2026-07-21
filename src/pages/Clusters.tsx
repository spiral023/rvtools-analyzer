import { useMemo, useState } from "react";
import { Server } from "lucide-react";
import { ClusterDetailDialog } from "@/components/cluster/ClusterDetailDialog";
import { ClusterOverviewPanel } from "@/components/cluster/ClusterOverviewPanel";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSnapshotIds, useClusters, useDatastores, useHosts, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { buildClusterOverviewRows } from "@/lib/clusterWorkspace";
import { buildClusterOsDistributionRows } from "@/lib/vmOsDistribution";

type ClusterTab = "overview" | "capacity" | "maintenance" | "planning" | "infrastructure";

export default function Clusters() {
  const { snapshots, activeSnapshotIds, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { vms = [], isLoading: vmsLoading } = useVms();
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const [tab, setTab] = useState<ClusterTab>("overview");
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);

  const activeSnapshotSet = useMemo(() => new Set(activeSnapshotIds), [activeSnapshotIds]);
  const scopedSnapshots = useMemo(
    () => snapshots.filter((snapshot) => activeSnapshotSet.has(snapshot.snapshotId)),
    [activeSnapshotSet, snapshots],
  );
  const filteredRows = useMemo(() => {
    const allRows = buildClusterOverviewRows({ clusters, hosts, vms, rawVHostRows, snapshots: scopedSnapshots });
    const selectedClusters = new Set(filters.clusters);
    const query = filters.search.trim().toLocaleLowerCase("de-DE");
    return allRows.filter((row) => {
      if (selectedClusters.size > 0 && !selectedClusters.has(row.cluster)) return false;
      return !query || [row.vcenterDisplayName, row.datacenter, row.cluster].some((value) => value.toLocaleLowerCase("de-DE").includes(query));
    });
  }, [clusters, filters.clusters, filters.search, hosts, rawVHostRows, scopedSnapshots, vms]);
  const scopedClusterKeys = useMemo(() => new Set(filteredRows.map((row) => row.clusterKey)), [filteredRows]);
  const osRows = useMemo(
    () => buildClusterOsDistributionRows(vms, "tools").filter((row) => scopedClusterKeys.has(row.clusterKey)),
    [scopedClusterKeys, vms],
  );
  const selectedRow = filteredRows.find((row) => row.clusterKey === selectedClusterKey) ?? null;

  const dataLoading = snapshotsLoading || clustersLoading || hostsLoading || datastoresLoading || vmsLoading || rawVHostLoading;
  if (dataLoading) return <PageLoadingState title="Cluster" />;
  if (snapshots.length === 0) {
    return <EmptyState icon={<Server className="h-6 w-6" />} title="Keine Daten vorhanden" description="Laden Sie einen RVTools XLSX-Export hoch, um Ihre Cluster zu analysieren." actionLabel="Zum Upload" actionTo="/upload" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Cluster" meta={`${activeSnapshotIds.length} aktive Snapshot${activeSnapshotIds.length === 1 ? "" : "s"}`} />
      <GlobalFilterScopeHint text="Die globale Einschränkung gilt für die gesamte Clusteransicht; vCenter-, Cluster- und Suchfilter werden vCenter-sicher ausgewertet." />
      <Tabs value={tab} onValueChange={(value) => setTab(value as ClusterTab)}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="capacity">Kapazität</TabsTrigger>
          <TabsTrigger value="maintenance">Wartung</TabsTrigger>
          <TabsTrigger value="planning">Planung</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastruktur</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <ClusterOverviewPanel rows={filteredRows} osRows={osRows} search={filters.search} onOpenCluster={setSelectedClusterKey} />
        </TabsContent>
      </Tabs>
      <ClusterDetailDialog
        clusterKey={selectedClusterKey}
        vcenterDisplayName={selectedRow?.vcenterDisplayName}
        open={selectedClusterKey !== null}
        onClose={() => setSelectedClusterKey(null)}
        clusters={clusters.filter((cluster) => activeSnapshotSet.has(cluster.snapshotId))}
        hosts={hosts.filter((host) => activeSnapshotSet.has(host.snapshotId))}
        vms={vms}
        datastores={datastores.filter((datastore) => activeSnapshotSet.has(datastore.snapshotId))}
        rawVHostRows={rawVHostRows}
      />
    </div>
  );
}
