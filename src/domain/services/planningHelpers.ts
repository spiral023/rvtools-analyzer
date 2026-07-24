import type { NormalizedCluster, NormalizedVm, Scenario, SheetRow, VropsLatest } from "@/domain/models/types";
import { clusterScopeKey, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import {
  aggregateCluster,
  applyVmMoves,
  classifyVmFailoverGroup,
  computeSiteFailoverRisk,
  emptyAggregate,
  estimateVmLoad,
  groupVHostRowsByCluster,
  metricsFromAggregate,
  type ClusterAggregate,
  type ClusterMetrics,
  type SiteFailoverRisk,
} from "@/domain/services/clusterCapacityEngine";

export interface WhatIfClusterResult {
  clusterKey: string;
  clusterName: string;
  before: ClusterMetrics;
  after: ClusterMetrics;
  incomingVmCount: number;
  outgoingVmCount: number;
  /** Ausfallskonzept-Projektion (HIGH-RP-RAM-Zuweisung) — `null` ohne vROps-Import für den Cluster. */
  vropsRamAssignedHighPctBefore: number | null;
  vropsRamAssignedHighPctAfter: number | null;
  siteFailoverRiskBefore: SiteFailoverRisk | null;
  siteFailoverRiskAfter: SiteFailoverRisk | null;
  /** `true`, wenn kein vROps-Import für diesen Cluster vorliegt — Vorher/Nachher-Score enthält dann keine vROps-Faktoren. */
  vropsMissing: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
  vropsLatest: VropsLatest[] = [],
): WhatIfResult {
  const vropsByClusterNorm = new Map(vropsLatest.map((entry) => [entry.clusterNorm, entry]));
  const vmByKey = new Map(allVms.map((vm) => [vm.vmKey, vm]));
  const clusterRefByKey = new Map(clusterRefs.map((cluster) => [cluster.clusterKey, cluster]));
  const rowsByCluster = groupVHostRowsByCluster(rawVHostRows, vcenterBySnapshot);
  const affectedClusterKeys = new Set<string>();
  const movesByCluster = new Map<string, { incoming: NormalizedVm[]; outgoing: NormalizedVm[] }>();
  // Der vCluster-Import liefert für manche Cluster kein Datacenter (null). Ohne Rehydration
  // würde die Cluster-Identität (mit Datacenter = null) nicht mit den vHost-Zeilen (mit dem
  // tatsächlichen Datacenter) übereinstimmen, sodass das Vorher-Aggregat leer bliebe — analog
  // zum Mechanismus in clusterCapacityWorkspace.ts.
  const associationIdentities: ClusterIdentity[] = [
    ...allVms.map(vmClusterIdentity),
    ...rawVHostRows.flatMap((row) => {
      const vcenterId = vcenterBySnapshot.get(row.snapshotId);
      return vcenterId
        ? [{ vcenterId, datacenter: String(row.data["Datacenter"] ?? ""), clusterName: String(row.data["Cluster"] ?? "") }]
        : [];
    }),
  ];
  const resolveIdentity = (identity: ClusterIdentity) => resolveClusterIdentity(identity, associationIdentities);
  const identitiesByKey = new Map<string, ClusterIdentity>(
    clusterRefs.map((cluster) => [cluster.clusterKey, resolveIdentity(clusterIdentity(cluster))]),
  );
  const labelsByKey = new Map(clusterRefs.map((cluster) => [cluster.clusterKey, cluster.name]));

  for (const group of scenario.groups) {
    const targetClusterKey = group.targetClusterKey;
    affectedClusterKeys.add(targetClusterKey);

    for (const vmKey of group.vmKeys) {
      const vm = vmByKey.get(vmKey);
      if (!vm || !vm.cluster) continue;

      const sourceIdentity = resolveIdentity(vmClusterIdentity(vm));
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
    // rowsByCluster ist nach dem tatsächlichen (rehydrierten) Datacenter gruppiert — der
    // übergebene clusterKey kann noch das ursprüngliche (ggf. fehlende) Datacenter tragen.
    const rowsKey = identity ? clusterScopeKey(identity.vcenterId, identity.datacenter, identity.clusterName) : clusterKey;
    const aggregate = identity
      ? aggregateCluster(identity, rowsByCluster.get(rowsKey) ?? [], vcenterBySnapshot)
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
    const moves = movesByCluster.get(clusterKey) ?? { incoming: [], outgoing: [] };

    const withLoad = (vm: NormalizedVm) => {
      const sourceIdentity = resolveIdentity(vmClusterIdentity(vm));
      const sourceKey = clusterScopeKey(sourceIdentity.vcenterId, sourceIdentity.datacenter, sourceIdentity.clusterName);
      return { vm, load: estimateVmLoad(getBeforeAggregate(sourceKey), vm) };
    };
    const afterAgg = applyVmMoves(beforeAgg, {
      incoming: moves.incoming.map(withLoad),
      outgoing: moves.outgoing.map(withLoad),
    });

    // Ausfallskonzept-Projektion: HIGH-RP-VMs, die in diesen Cluster wechseln bzw. ihn
    // verlassen, verschieben die HIGH-RP-RAM-Zuweisung additiv — analog zum Prinzip der
    // übrigen What-If-Metriken (proportionale/additive Fortschreibung des Ist-Zustands).
    const vropsEntry = vropsByClusterNorm.get(normalizeVmNameForMatch(clusterName)) ?? null;
    // vCluster-Import (clusterRef.totalMemoryMiB) kann fehlen; das vHost-Aggregat ist
    // dieselbe Kapazitätsbasis, die RAM-Commit & Co. bereits erfolgreich nutzen.
    const totalMemoryMiB = beforeAgg.totalMemoryMiB || clusterRef?.totalMemoryMiB || null;
    const baselineHighPct = vropsEntry?.ramAssignedHighPct ?? null;
    const baselineHighMiB = baselineHighPct !== null && totalMemoryMiB ? (baselineHighPct / 100) * totalMemoryMiB : null;

    let highDeltaMiB = 0;
    for (const vm of moves.incoming) {
      if (classifyVmFailoverGroup(vm.resourcePool) === "high") highDeltaMiB += vm.memoryMiB ?? 0;
    }
    for (const vm of moves.outgoing) {
      if (classifyVmFailoverGroup(vm.resourcePool) === "high") highDeltaMiB -= vm.memoryMiB ?? 0;
    }

    const afterHighMiB = baselineHighMiB !== null ? Math.max(0, baselineHighMiB + highDeltaMiB) : null;
    const afterHighPct = afterHighMiB !== null && totalMemoryMiB ? (afterHighMiB / totalMemoryMiB) * 100 : null;

    // Die übrigen vROps-Faktoren (CPU-Overcommit, HIGH-RP-CPU, ...) haben kein Projektionsmodell
    // für VM-Verschiebungen und fließen daher mit demselben statischen Ist-Wert in Vorher- und
    // Nachher-Score ein (siehe Design-Spec, Abschnitt "Integration").
    const staticVropsFactors = {
      ramUsageHighPct: vropsEntry?.ramUsageHighPct ?? null,
      cpuUsageHighPct: vropsEntry?.cpuUsageHighPct ?? null,
      clusterRamAssignedPct: vropsEntry?.clusterRamAssignedPct ?? null,
      clusterCpuUsagePct: vropsEntry?.clusterCpuUsagePct ?? null,
      avgVmsPerHost: vropsEntry?.avgVmsPerHost ?? null,
      cpuOvercommitRatio: vropsEntry?.cpuOvercommitRatio ?? null,
    };

    const before = metricsFromAggregate(beforeAgg, {
      clusterName, clusterRef, projected: false,
      vrops: { ramAssignedHighPct: baselineHighPct, ...staticVropsFactors },
    });
    const after = metricsFromAggregate(afterAgg, {
      clusterName, clusterRef, projected: true,
      vrops: { ramAssignedHighPct: afterHighPct, ...staticVropsFactors },
    });

    totalMovedVms += moves.incoming.length;
    results.push({
      clusterKey,
      clusterName,
      before,
      after,
      incomingVmCount: moves.incoming.length,
      outgoingVmCount: moves.outgoing.length,
      vropsRamAssignedHighPctBefore: baselineHighPct !== null ? round1(baselineHighPct) : null,
      vropsRamAssignedHighPctAfter: afterHighPct !== null ? round1(afterHighPct) : null,
      siteFailoverRiskBefore: computeSiteFailoverRisk(baselineHighPct),
      siteFailoverRiskAfter: computeSiteFailoverRisk(afterHighPct),
      vropsMissing: vropsEntry === null,
    });
  }

  results.sort((a, b) => b.after.riskScore - a.after.riskScore);

  return { clusters: results, totalMovedVms, incompleteVmCount: 0 };
}
