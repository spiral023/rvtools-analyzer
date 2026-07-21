import type { NormalizedCluster, NormalizedVm, Scenario, SheetRow } from "@/domain/models/types";
import { clusterScopeKey, type ClusterIdentity } from "@/lib/clusterIdentity";
import {
  aggregateCluster,
  applyVmMoves,
  emptyAggregate,
  estimateVmLoad,
  groupVHostRowsByCluster,
  metricsFromAggregate,
  type ClusterAggregate,
  type ClusterMetrics,
} from "@/domain/services/clusterCapacityEngine";

export interface WhatIfClusterResult {
  clusterKey: string;
  clusterName: string;
  before: ClusterMetrics;
  after: ClusterMetrics;
  incomingVmCount: number;
  outgoingVmCount: number;
}

export interface WhatIfResult {
  clusters: WhatIfClusterResult[];
  totalMovedVms: number;
  incompleteVmCount: number;
}

const vmClusterIdentity = (vm: NormalizedVm): ClusterIdentity => ({
  vcenterId: vm.vcenterId,
  datacenter: vm.datacenter,
  clusterName: vm.cluster,
});

const clusterIdentity = (cluster: NormalizedCluster): ClusterIdentity => ({
  vcenterId: cluster.vcenterId,
  datacenter: cluster.datacenter,
  clusterName: cluster.name,
});

/**
 * Berechnet Vorher-/Nachher-Metriken für alle Cluster, die vom Szenario betroffen sind.
 * Alle Zuordnungen verwenden den kanonischen Cluster-Scope-Key.
 */
export function computeWhatIf(
  scenario: Scenario,
  allVms: NormalizedVm[],
  rawVHostRows: SheetRow[],
  clusterRefs: NormalizedCluster[],
  vcenterBySnapshot: ReadonlyMap<string, string>,
): WhatIfResult {
  const vmByKey = new Map(allVms.map((vm) => [vm.vmKey, vm]));
  const clusterRefByKey = new Map(clusterRefs.map((cluster) => [cluster.clusterKey, cluster]));
  const rowsByCluster = groupVHostRowsByCluster(rawVHostRows, vcenterBySnapshot);
  const affectedClusterKeys = new Set<string>();
  const movesByCluster = new Map<string, { incoming: NormalizedVm[]; outgoing: NormalizedVm[] }>();
  const identitiesByKey = new Map<string, ClusterIdentity>(
    clusterRefs.map((cluster) => [cluster.clusterKey, clusterIdentity(cluster)]),
  );
  const labelsByKey = new Map(clusterRefs.map((cluster) => [cluster.clusterKey, cluster.name]));

  for (const group of scenario.groups) {
    const targetClusterKey = group.targetClusterKey;
    affectedClusterKeys.add(targetClusterKey);

    for (const vmKey of group.vmKeys) {
      const vm = vmByKey.get(vmKey);
      if (!vm || !vm.cluster) continue;

      const sourceIdentity = vmClusterIdentity(vm);
      const sourceClusterKey = clusterScopeKey(
        sourceIdentity.vcenterId,
        sourceIdentity.datacenter,
        sourceIdentity.clusterName,
      );
      identitiesByKey.set(sourceClusterKey, sourceIdentity);
      labelsByKey.set(sourceClusterKey, vm.cluster);
      affectedClusterKeys.add(sourceClusterKey);

      const sourceMoves = movesByCluster.get(sourceClusterKey) ?? { incoming: [], outgoing: [] };
      sourceMoves.outgoing.push(vm);
      movesByCluster.set(sourceClusterKey, sourceMoves);

      const targetMoves = movesByCluster.get(targetClusterKey) ?? { incoming: [], outgoing: [] };
      targetMoves.incoming.push(vm);
      movesByCluster.set(targetClusterKey, targetMoves);
    }
  }

  const beforeAggregates = new Map<string, ClusterAggregate>();
  const getBeforeAggregate = (clusterKey: string): ClusterAggregate => {
    const cached = beforeAggregates.get(clusterKey);
    if (cached) return cached;
    const identity = identitiesByKey.get(clusterKey);
    const aggregate = identity
      ? aggregateCluster(identity, rowsByCluster.get(clusterKey) ?? [], vcenterBySnapshot)
      : emptyAggregate();
    beforeAggregates.set(clusterKey, aggregate);
    return aggregate;
  };

  let totalMovedVms = 0;
  const results: WhatIfClusterResult[] = [];

  for (const clusterKey of affectedClusterKeys) {
    const clusterRef = clusterRefByKey.get(clusterKey) ?? null;
    const clusterName = labelsByKey.get(clusterKey) ?? "Unbekannter Cluster";
    const beforeAgg = getBeforeAggregate(clusterKey);
    const before = metricsFromAggregate(beforeAgg, { clusterName, clusterRef, projected: false });
    const moves = movesByCluster.get(clusterKey) ?? { incoming: [], outgoing: [] };

    const withLoad = (vm: NormalizedVm) => {
      const sourceKey = clusterScopeKey(vm.vcenterId, vm.datacenter, vm.cluster);
      return { vm, load: estimateVmLoad(getBeforeAggregate(sourceKey), vm) };
    };
    const afterAgg = applyVmMoves(beforeAgg, {
      incoming: moves.incoming.map(withLoad),
      outgoing: moves.outgoing.map(withLoad),
    });
    const after = metricsFromAggregate(afterAgg, { clusterName, clusterRef, projected: true });

    totalMovedVms += moves.incoming.length;
    results.push({
      clusterKey,
      clusterName,
      before,
      after,
      incomingVmCount: moves.incoming.length,
      outgoingVmCount: moves.outgoing.length,
    });
  }

  results.sort((a, b) => b.after.riskScore - a.after.riskScore);

  return { clusters: results, totalMovedVms, incompleteVmCount: 0 };
}
