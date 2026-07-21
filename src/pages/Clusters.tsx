import { useMemo, useState } from "react";
import { Server } from "lucide-react";
import { ClusterDetailDialog } from "@/components/cluster/ClusterDetailDialog";
import { ClusterCapacityPanel } from "@/components/cluster/ClusterCapacityPanel";
import { ClusterInfrastructurePanel } from "@/components/cluster/ClusterInfrastructurePanel";
import { ClusterMaintenancePanel } from "@/components/cluster/ClusterMaintenancePanel";
import { ClusterOverviewPanel } from "@/components/cluster/ClusterOverviewPanel";
import { ClusterPlanningPanel } from "@/components/cluster/ClusterPlanningPanel";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSnapshotIds, useClusters, useDatastores, useHosts, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { buildClusterOverviewRows } from "@/lib/clusterWorkspace";
import { buildClusterCapacityWorkspace } from "@/lib/clusterCapacityWorkspace";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import { buildClusterOsDistributionRows } from "@/lib/vmOsDistribution";
import { CLUSTER_TABS } from "@/lib/glossaries/clusters";

type ClusterTab = "overview" | "capacity" | "maintenance" | "planning" | "infrastructure";

function isClusterTab(value: string | null): value is ClusterTab {
  return value === "overview" || value === "capacity" || value === "maintenance" || value === "planning" || value === "infrastructure";
}

export default function Clusters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const tab: ClusterTab = isClusterTab(queryTab) ? queryTab : "overview";
  const { snapshots, activeSnapshotIds, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { vms = [], isLoading: vmsLoading } = useVms();
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const { data: rawHbaRows = [], isLoading: rawHbaLoading } = useRawSheet("vHBA", tab === "infrastructure");
  const { data: rawNicRows = [], isLoading: rawNicLoading } = useRawSheet("vNIC", tab === "infrastructure");
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
  const capacityData = useMemo(
    () => buildClusterCapacityWorkspace({
      clusters: clusters.filter((cluster) => activeSnapshotSet.has(cluster.snapshotId)),
      hosts: hosts.filter((host) => activeSnapshotSet.has(host.snapshotId)),
      vms,
      rawVHostRows,
      snapshots: scopedSnapshots,
    }),
    [activeSnapshotSet, clusters, hosts, rawVHostRows, scopedSnapshots, vms],
  );
  const selectedRow = filteredRows.find((row) => row.clusterKey === selectedClusterKey) ?? null;

  const selectTab = (value: string) => {
    if (!isClusterTab(value)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", value);
      return next;
    });
  };

  const dataLoading = snapshotsLoading || clustersLoading || hostsLoading || datastoresLoading || vmsLoading || rawVHostLoading || rawHbaLoading || rawNicLoading;
  if (dataLoading) return <PageLoadingState title="Cluster" />;
  if (snapshots.length === 0) {
    return <EmptyState icon={<Server className="h-6 w-6" />} title="Keine Daten vorhanden" description="Laden Sie einen RVTools XLSX-Export hoch, um Ihre Cluster zu analysieren." actionLabel="Zum Upload" actionTo="/upload" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Cluster" meta={`${activeSnapshotIds.length} aktive Snapshot${activeSnapshotIds.length === 1 ? "" : "s"}`} />
      <GlobalFilterScopeHint text="Die globale Einschränkung gilt für die gesamte Seite: vCenter-, Cluster- und Sucheingrenzung werden vCenter-sicher auf alle Cluster-Tabs angewendet." />
      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <InfoTooltip entry={CLUSTER_TABS.overview}><TabsTrigger value="overview">Übersicht</TabsTrigger></InfoTooltip>
          <InfoTooltip entry={CLUSTER_TABS.capacity}><TabsTrigger value="capacity">Kapazität</TabsTrigger></InfoTooltip>
          <InfoTooltip entry={CLUSTER_TABS.maintenance}><TabsTrigger value="maintenance">Wartung</TabsTrigger></InfoTooltip>
          <InfoTooltip entry={CLUSTER_TABS.planning}><TabsTrigger value="planning">Planung</TabsTrigger></InfoTooltip>
          <InfoTooltip entry={CLUSTER_TABS.infrastructure}><TabsTrigger value="infrastructure">Infrastruktur</TabsTrigger></InfoTooltip>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <ClusterOverviewPanel rows={filteredRows} osRows={osRows} search={filters.search} onOpenCluster={setSelectedClusterKey} />
        </TabsContent>
        <TabsContent value="capacity" className="mt-6">
          <ClusterCapacityPanel
            capacityRows={capacityData.capacityRows.filter((row) => scopedClusterKeys.has(row.clusterKey))}
            overcommitRows={capacityData.overcommitRows.filter((row) => scopedClusterKeys.has(row.clusterKey))}
            hostDensity={capacityData.hostDensity.filter((row) => scopedClusterKeys.has(row.clusterKey))}
            clusterDensity={capacityData.clusterDensity.filter((row) => scopedClusterKeys.has(row.clusterKey))}
            search={filters.search}
            onOpenCluster={setSelectedClusterKey}
          />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-6">
          <ClusterMaintenancePanel />
        </TabsContent>
        <TabsContent value="planning" className="mt-6">
          <ClusterPlanningPanel />
        </TabsContent>
        <TabsContent value="infrastructure" className="mt-6">
          <ClusterInfrastructurePanel
            clusters={clusters.filter((cluster) => activeSnapshotSet.has(cluster.snapshotId) && scopedClusterKeys.has(cluster.clusterKey))}
            hosts={hosts.filter((host) => activeSnapshotSet.has(host.snapshotId) && scopedClusterKeys.has(clusterScopeKey(host.vcenterId, host.datacenter, host.cluster)))}
            rawHbaRows={rawHbaRows}
            rawNicRows={rawNicRows}
            search={filters.search}
          />
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
