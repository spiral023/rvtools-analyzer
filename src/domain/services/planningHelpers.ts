import type { NormalizedCluster, NormalizedVm, Scenario, SheetRow } from "@/domain/models/types";
import {
  aggregateCluster,
  applyVmMoves,
  estimateVmLoad,
  groupVHostRowsByCluster,
  metricsFromAggregate,
  type ClusterMetrics,
} from "@/domain/services/clusterCapacityEngine";

export interface WhatIfClusterResult {
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

/**
 * Berechnet Vorher-/Nachher-Metriken für alle Cluster, die vom Szenario betroffen sind.
 *
 * 1. Ist-Aggregat je Cluster aus vHost-Rohzeilen.
 * 2. VM-Lastschätzung proportional zur Konfiguration.
 * 3. Additive Verschiebung eingehend/ausgehend.
 * 4. Metriken Vorher/Nachher.
 */
export function computeWhatIf(
  scenario: Scenario,
  allVms: NormalizedVm[],
  rawVHostRows: SheetRow[],
  clusterRefs: NormalizedCluster[],
): WhatIfResult {
  const vmByKey = new Map(allVms.map((v) => [v.vmKey, v]));
  const clusterRefMap = new Map(clusterRefs.map((c) => [c.name, c]));
  // Einmalig nach Cluster gruppieren, statt pro betroffenem Cluster und pro
  // verschobener VM erneut alle Host-Zeilen zu durchsuchen.
  const rowsByCluster = groupVHostRowsByCluster(rawVHostRows);

  const affectedClusters = new Set<string>();
  const movesByCluster = new Map<string, { incoming: NormalizedVm[]; outgoing: NormalizedVm[] }>();

  for (const group of scenario.groups) {
    const targetCluster = group.targetClusterKey;
    affectedClusters.add(targetCluster);

    for (const vmKey of group.vmKeys) {
      const vm = vmByKey.get(vmKey);
      if (!vm) continue;
      const sourceCluster = vm.cluster;
      if (!sourceCluster) continue;

      affectedClusters.add(sourceCluster);
      affectedClusters.add(targetCluster);

      if (!movesByCluster.has(sourceCluster)) {
        movesByCluster.set(sourceCluster, { incoming: [], outgoing: [] });
      }
      movesByCluster.get(sourceCluster)!.outgoing.push(vm);

      if (!movesByCluster.has(targetCluster)) {
        movesByCluster.set(targetCluster, { incoming: [], outgoing: [] });
      }
      movesByCluster.get(targetCluster)!.incoming.push(vm);
    }
  }

  let totalMovedVms = 0;
  const results: WhatIfClusterResult[] = [];

  for (const clusterName of affectedClusters) {
    const beforeAgg = aggregateCluster(clusterName, rowsByCluster.get(clusterName) ?? []);
    const clusterRef = clusterRefMap.get(clusterName) ?? null;
    const before = metricsFromAggregate(beforeAgg, { clusterName, clusterRef, projected: false });

    const moves = movesByCluster.get(clusterName) ?? { incoming: [], outgoing: [] };

    const incomingWithLoad = moves.incoming.map((vm) => {
      const sourceClusterName = vm.cluster ?? clusterName;
      const sourceAgg = aggregateCluster(sourceClusterName, rowsByCluster.get(sourceClusterName) ?? []);
      return { vm, load: estimateVmLoad(sourceAgg, vm) };
    });
    const outgoingWithLoad = moves.outgoing.map((vm) => {
      const sourceClusterName = vm.cluster ?? clusterName;
      const sourceAgg = aggregateCluster(sourceClusterName, rowsByCluster.get(sourceClusterName) ?? []);
      return { vm, load: estimateVmLoad(sourceAgg, vm) };
    });

    const afterAgg = applyVmMoves(beforeAgg, { incoming: incomingWithLoad, outgoing: outgoingWithLoad });
    const after = metricsFromAggregate(afterAgg, { clusterName, clusterRef, projected: true });

    totalMovedVms += moves.incoming.length;
    results.push({
      clusterName,
      before,
      after,
      incomingVmCount: moves.incoming.length,
      outgoingVmCount: moves.outgoing.length,
    });
  }

  results.sort((a, b) => b.after.riskScore - a.after.riskScore);

  return {
    clusters: results,
    totalMovedVms,
    incompleteVmCount: 0,
  };
}