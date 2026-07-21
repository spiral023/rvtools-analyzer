import type { NormalizedCluster, NormalizedVm, SheetRow, VmLoadEstimate } from "@/domain/models/types";
import { toBoolLoose, toNumLoose } from "@/lib/conversion";
import { clusterScopeKey, isSameCluster, type ClusterIdentity } from "@/lib/clusterIdentity";

/** Schwellenwerte für Ampeln und Risk-Score — 1:1 aus der Capacity-Seite. */
export const CAPACITY_THRESHOLDS = {
  cpuUsage: { warn: 75, danger: 85 },
  memoryUsage: { warn: 80, danger: 90 },
  vcpuPerCore: { warn: 4, danger: 6 },
  ramCommit: { warn: 140, danger: 180 },
  ramActive: { warn: 80, danger: 90 },
  swapBalloon: { warn: 2, danger: 5 },
} as const;

export interface ClusterAggregate {
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  vcpus: number;
  vRamMiB: number;
  vmActiveMiB: number;
  swapBalloonMiB: number;
  cpuUsedCoreEquiv: number;
  memConsumedMiB: number;
  hotHosts: number;
  htInactiveHosts: number;
  cpuMin: number;
  cpuMax: number;
  memMin: number;
  memMax: number;
}

export interface ClusterMetrics {
  clusterName: string;
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  totalVcpus: number;
  vRamMiB: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vcpuPerCore: number;
  ramCommitPct: number;
  ramActivePct: number;
  swapBalloonPct: number;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
  projected: boolean;
  incompleteVmCount: number;
}

export function emptyAggregate(): ClusterAggregate {
  return {
    hosts: 0, totalCores: 0, totalMemoryMiB: 0, totalVms: 0, vcpus: 0,
    vRamMiB: 0, vmActiveMiB: 0, swapBalloonMiB: 0, cpuUsedCoreEquiv: 0,
    memConsumedMiB: 0, hotHosts: 0, htInactiveHosts: 0,
    cpuMin: Number.POSITIVE_INFINITY, cpuMax: Number.NEGATIVE_INFINITY,
    memMin: Number.POSITIVE_INFINITY, memMax: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Gruppiert vHost-Rohzeilen einmalig nach vCenter, Datacenter und Cluster. Vermeidet, dass
 * {@link aggregateCluster} bei mehreren Clustern jeweils alle Zeilen erneut
 * durchsucht (O(Cluster × Zeilen) → O(Zeilen + Cluster)).
 *
 * Ohne `vcenterBySnapshot` bleibt die bisherige Gruppierung nach Clustername
 * für noch nicht migrierte Aufrufer erhalten.
 */
export function groupVHostRowsByCluster(
  rawVHostRows: SheetRow[],
  vcenterBySnapshot?: ReadonlyMap<string, string>,
): Map<string, SheetRow[]> {
  const grouped = new Map<string, SheetRow[]>();
  for (const row of rawVHostRows) {
    const name = String(row.data["Cluster"] ?? "").trim();
    if (!name) continue;
    const datacenter = String(row.data["Datacenter"] ?? "").trim();
    const key = vcenterBySnapshot
      ? clusterScopeKey(vcenterBySnapshot.get(row.snapshotId) ?? "", datacenter, name)
      : name;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/** Baut das gemessene Ist-Aggregat eines Clusters aus den vHost-Rohzeilen. */
export function aggregateCluster(
  cluster: ClusterIdentity | string,
  rawVHostRows: SheetRow[],
  vcenterBySnapshot?: ReadonlyMap<string, string>,
): ClusterAggregate {
  const agg = emptyAggregate();
  const targetName = typeof cluster === "string" ? cluster.trim() : null;
  for (const r of rawVHostRows) {
    const d = r.data;
    const rowCluster = String(d["Cluster"] ?? "").trim();
    const hostName = String(d["Host"] ?? "").trim();
    const datacenter = String(d["Datacenter"] ?? "").trim();
    const matches = typeof cluster === "string"
      ? rowCluster === targetName
      : isSameCluster(cluster, {
        vcenterId: vcenterBySnapshot?.get(r.snapshotId) ?? "",
        datacenter,
        clusterName: rowCluster,
      });
    if (!rowCluster || !hostName || !matches) continue;

    const cpuCores = toNumLoose(d["# Cores"]);
    const memMiB = toNumLoose(d["# Memory"]);
    const cpuUsagePct = toNumLoose(d["CPU usage %"]);
    const memUsagePct = toNumLoose(d["Memory usage %"]);
    const htAvailable = toBoolLoose(d["HT Available"]);
    const htActive = toBoolLoose(d["HT Active"]);

    agg.hosts += 1;
    agg.totalCores += cpuCores;
    agg.totalMemoryMiB += memMiB;
    agg.totalVms += toNumLoose(d["# VMs"]);
    agg.vcpus += toNumLoose(d["# vCPUs"]);
    agg.vRamMiB += toNumLoose(d["vRAM"]);
    agg.vmActiveMiB += toNumLoose(d["VM Used memory"]);
    agg.swapBalloonMiB += toNumLoose(d["VM Memory Swapped"]) + toNumLoose(d["VM Memory Ballooned"]);
    // Absolute Kern-/Speicher-Äquivalente, damit VM-Verschiebungen additiv wirken.
    agg.cpuUsedCoreEquiv += (cpuUsagePct / 100) * cpuCores;
    agg.memConsumedMiB += (memUsagePct / 100) * memMiB;

    if (cpuUsagePct > 60 || memUsagePct > 75) agg.hotHosts += 1;
    if (htAvailable && !htActive) agg.htInactiveHosts += 1;
    agg.cpuMin = Math.min(agg.cpuMin, cpuUsagePct);
    agg.cpuMax = Math.max(agg.cpuMax, cpuUsagePct);
    agg.memMin = Math.min(agg.memMin, memUsagePct);
    agg.memMax = Math.max(agg.memMax, memUsagePct);
  }
  return agg;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function metricsFromAggregate(
  agg: ClusterAggregate,
  opts: { clusterName: string; clusterRef?: NormalizedCluster | null; projected: boolean; incompleteVmCount?: number },
): ClusterMetrics {
  const cpuUsagePct = pct(agg.cpuUsedCoreEquiv, agg.totalCores);
  const memoryUsagePct = pct(agg.memConsumedMiB, agg.totalMemoryMiB);
  const vcpuPerCore = agg.totalCores > 0 ? agg.vcpus / agg.totalCores : 0;
  const ramCommitPct = pct(agg.vRamMiB, agg.totalMemoryMiB);
  const ramActivePct = pct(agg.vmActiveMiB, agg.totalMemoryMiB);
  const swapBalloonPct = pct(agg.swapBalloonMiB, agg.totalMemoryMiB);

  const cpuSpread = Number.isFinite(agg.cpuMin) && Number.isFinite(agg.cpuMax) ? agg.cpuMax - agg.cpuMin : 0;
  const memSpread = Number.isFinite(agg.memMin) && Number.isFinite(agg.memMax) ? agg.memMax - agg.memMin : 0;
  const clusterHostDelta = opts.clusterRef?.numHosts != null ? agg.hosts - opts.clusterRef.numHosts : null;
  const clusterMemoryDeltaPct = opts.clusterRef?.totalMemoryMiB
    ? ((agg.totalMemoryMiB - opts.clusterRef.totalMemoryMiB) / opts.clusterRef.totalMemoryMiB) * 100
    : null;

  let riskScore = 0;
  if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.danger) riskScore += 25;
  else if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.warn) riskScore += 12;
  if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.danger) riskScore += 25;
  else if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.warn) riskScore += 12;
  if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.danger) riskScore += 20;
  else if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.warn) riskScore += 10;
  if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.danger) riskScore += 15;
  else if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.warn) riskScore += 8;
  if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.danger) riskScore += 20;
  else if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.warn) riskScore += 10;
  const hotRatio = agg.hosts > 0 ? agg.hotHosts / agg.hosts : 0;
  if (hotRatio > 0.5) riskScore += 10;
  else if (hotRatio > 0.3) riskScore += 5;
  if (opts.clusterRef?.drsEnabled === false && (cpuSpread > 30 || memSpread > 30)) riskScore += 8;
  if (agg.htInactiveHosts > 0) riskScore += 5;
  if (clusterHostDelta !== null && clusterHostDelta !== 0) riskScore += 3;
  if (clusterMemoryDeltaPct !== null && Math.abs(clusterMemoryDeltaPct) > 5) riskScore += 3;

  const risk: ClusterMetrics["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";

  return {
    clusterName: opts.clusterName,
    hosts: agg.hosts,
    totalCores: agg.totalCores,
    totalMemoryMiB: agg.totalMemoryMiB,
    totalVms: agg.totalVms,
    totalVcpus: agg.vcpus,
    vRamMiB: agg.vRamMiB,
    cpuUsagePct: round(cpuUsagePct, 1),
    memoryUsagePct: round(memoryUsagePct, 1),
    vcpuPerCore: round(vcpuPerCore, 2),
    ramCommitPct: round(ramCommitPct, 1),
    ramActivePct: round(ramActivePct, 1),
    swapBalloonPct: round(swapBalloonPct, 2),
    riskScore,
    risk,
    projected: opts.projected,
    incompleteVmCount: opts.incompleteVmCount ?? 0,
  };
}

export interface VmMove {
  vm: NormalizedVm;
  load: VmLoadEstimate;
}

/** Teilt die gemessene Cluster-Ist-Last proportional zur VM-Konfiguration auf. */
export function estimateVmLoad(agg: ClusterAggregate, vm: NormalizedVm): VmLoadEstimate {
  const ramShare = agg.vRamMiB > 0 ? (vm.memoryMiB ?? 0) / agg.vRamMiB : 0;
  const cpuShare = agg.vcpus > 0 ? (vm.cpuCount ?? 0) / agg.vcpus : 0;
  return {
    activeMiB: agg.vmActiveMiB * ramShare,
    consumedMiB: agg.memConsumedMiB * ramShare,
    swapBalloonMiB: agg.swapBalloonMiB * ramShare,
    usedCoreEquiv: agg.cpuUsedCoreEquiv * cpuShare,
  };
}

/** Wendet ein-/ausgehende VM-Verschiebungen additiv auf ein Aggregat an. Denominatoren (Hosts/Cores/RAM) bleiben unverändert. */
export function applyVmMoves(
  agg: ClusterAggregate,
  moves: { incoming: VmMove[]; outgoing: VmMove[] },
): ClusterAggregate {
  const next: ClusterAggregate = { ...agg };
  for (const { vm, load } of moves.incoming) {
    next.totalVms += 1;
    next.vcpus += vm.cpuCount ?? 0;
    next.vRamMiB += vm.memoryMiB ?? 0;
    next.vmActiveMiB += load.activeMiB;
    next.memConsumedMiB += load.consumedMiB;
    next.swapBalloonMiB += load.swapBalloonMiB;
    next.cpuUsedCoreEquiv += load.usedCoreEquiv;
  }
  for (const { vm, load } of moves.outgoing) {
    next.totalVms -= 1;
    next.vcpus -= vm.cpuCount ?? 0;
    next.vRamMiB -= vm.memoryMiB ?? 0;
    next.vmActiveMiB -= load.activeMiB;
    next.memConsumedMiB -= load.consumedMiB;
    next.swapBalloonMiB -= load.swapBalloonMiB;
    next.cpuUsedCoreEquiv -= load.usedCoreEquiv;
  }
  // Keine negativen Restwerte durch Rundungsdrift.
  next.totalVms = Math.max(0, next.totalVms);
  next.vcpus = Math.max(0, next.vcpus);
  next.vRamMiB = Math.max(0, next.vRamMiB);
  next.vmActiveMiB = Math.max(0, next.vmActiveMiB);
  next.memConsumedMiB = Math.max(0, next.memConsumedMiB);
  next.swapBalloonMiB = Math.max(0, next.swapBalloonMiB);
  next.cpuUsedCoreEquiv = Math.max(0, next.cpuUsedCoreEquiv);
  return next;
}

