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

/**
 * Schwellenwerte der Ampel-Spalten in der Cluster-Capacity-Health-Tabelle (CPU %, RAM %,
 * vCPU/Core, RAM Commit %) — sichtbare Rot-Grenze je Metrik, siehe {@link CAPACITY_HEALTH_COLUMNS}
 * in `lib/glossaries/capacity.ts`. Basis für {@link computeMaxHostFailures}.
 */
export const HEALTH_COLUMN_THRESHOLDS = {
  cpuUsage: { warn: 40, danger: 50 },
  memoryUsage: { warn: 50, danger: 70 },
  vcpuPerCore: { warn: 4, danger: 5 },
  ramCommit: { warn: 50, danger: 70 },
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

export type SiteFailoverRisk = "ok" | "warn" | "crit";

/**
 * Schwellenwerte für die Site-Failover-Tragfähigkeit (Stretched-Cluster, ESXi-Hosts 50/50
 * auf zwei Standorte verteilt). Basis ist der vROps-Ist-Wert "% RAM Assigned High_RP/Prod"
 * relativ zur Gesamt-Cluster-Kapazität, siehe {@link computeSiteFailoverRisk}.
 */
export const SITE_FAILOVER_THRESHOLDS = {
  ramAssignedHigh: { warn: 45, danger: 50 },
} as const;

/** Vom vROps-Ausfallskonzept-Export abgeleitete Risiko-Eingaben, siehe {@link VROPS_RISK_THRESHOLDS}. */
export interface VropsRiskInput {
  ramAssignedHighPct: number | null;
  ramUsageHighPct: number | null;
  cpuUsageHighPct: number | null;
  clusterRamAssignedPct: number | null;
  clusterCpuUsagePct: number | null;
  avgVmsPerHost: number | null;
  cpuOvercommitRatio: number | null;
}

/**
 * Schwellenwerte für die vROps-gewichteten Risiko-Faktoren (Ausfallskonzept-Panels).
 * Priorisiert nach Business-Relevanz: HIGH-RP RAM (Standortausfall-Tragfähigkeit) > CPU-
 * Overcommit (Ist) > HIGH-RP CPU > restliche Panels als Ist-Cross-Check/Dichte-Signal.
 * Siehe docs/superpowers/specs/2026-07-24-cluster-risk-score-vrops-design.md.
 */
export const VROPS_RISK_THRESHOLDS = {
  ramAssignedHigh: SITE_FAILOVER_THRESHOLDS.ramAssignedHigh,
  cpuOvercommit: { warn: 4, danger: 5 },
  cpuUsageHigh: { warn: 40, danger: 50 },
  ramUsageHigh: { warn: 80, danger: 90 },
  clusterRamAssigned: { warn: 80, danger: 90 },
  clusterCpuUsage: { warn: 75, danger: 85 },
  avgVmsPerHost: { warn: 25, danger: 40 },
} as const;

/**
 * Bewertet, ob die HIGH-RP-VMs (produktive/wichtige VMs) im Worst-Case — ein kompletter
 * Standort fällt aus, es bleiben nur noch ~50 % der Cluster-Hosts — auf den verbleibenden
 * Ressourcen weiterlaufen können. Reicht die HIGH-RP-RAM-Zuweisung nahe an oder über 50 %
 * der Gesamt-Cluster-Kapazität heran, ist im Ausfall kein Platz mehr für HIGH-RP-VMs auf
 * der halbierten Kapazität. `null`, wenn keine vROps-Daten für den Cluster vorliegen.
 */
export function computeSiteFailoverRisk(ramAssignedHighPct: number | null): SiteFailoverRisk | null {
  if (ramAssignedHighPct === null) return null;
  if (ramAssignedHighPct > SITE_FAILOVER_THRESHOLDS.ramAssignedHigh.danger) return "crit";
  if (ramAssignedHighPct > SITE_FAILOVER_THRESHOLDS.ramAssignedHigh.warn) return "warn";
  return "ok";
}

export type VmFailoverGroup = "high" | "std" | "unknown";

/**
 * Erkennt die Ausfallskonzept-Gruppe einer VM anhand des VMware-Resource-Pool-Pfads
 * (RVTools vInfo „Resource pool“, z.B. "/LNZ9910/CL_LNZ_SRV_9910_Linux02/Resources/HIGH").
 * Nur das letzte Pfadsegment entscheidet — clusterunabhängig, daher auch für
 * hypothetische Cluster-Wechsel in der What-If-Planung gültig ("unknown" für VMs
 * außerhalb der HIGH/STD-Pools, z.B. direkt in "Resources").
 */
export function classifyVmFailoverGroup(resourcePool: string | null): VmFailoverGroup {
  if (!resourcePool) return "unknown";
  const segments = resourcePool.split("/").map((segment) => segment.trim()).filter(Boolean);
  const last = segments.at(-1)?.toUpperCase();
  if (last === "HIGH") return "high";
  if (last === "STD") return "std";
  return "unknown";
}

/** Ein einzelner Beitrag zum Risk-Score, mit dem konkreten Ist-Wert dieses Clusters im Label. */
export interface RiskFactor {
  label: string;
  points: number;
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
  /** Alle ausgelösten Risk-Score-Beiträge dieses Clusters, für die Risiko-Tooltip-Aufschlüsselung. */
  riskFactors: RiskFactor[];
  /** `true`, wenn ein kritisches Site-Failover-Risiko die Einstufung auf „hoch“ erzwungen hat, obwohl der Summen-Score darunter läge. */
  siteFailoverOverride: boolean;
  /** Siehe {@link computeHostFailureCapacity}. */
  maxHostFailures: number;
  /** Metrik(en), die beim nächsten Host-Ausfall (maxHostFailures + 1) ins Rote kippen würden. */
  hostFailureBreaches: HostFailureBreach[];
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
    const vcenterId = vcenterBySnapshot?.get(row.snapshotId);
    if (vcenterBySnapshot && !vcenterId) continue;
    const key = vcenterBySnapshot
      ? clusterScopeKey(vcenterId, datacenter, name)
      : name;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/** Baut das gemessene Ist-Aggregat eines Clusters aus den vHost-Rohzeilen. */
export function aggregateCluster(clusterName: string, rawVHostRows: SheetRow[]): ClusterAggregate;
export function aggregateCluster(
  cluster: ClusterIdentity,
  rawVHostRows: SheetRow[],
  vcenterBySnapshot: ReadonlyMap<string, string>,
): ClusterAggregate;
export function aggregateCluster(
  cluster: ClusterIdentity | string,
  rawVHostRows: SheetRow[],
  vcenterBySnapshot?: ReadonlyMap<string, string>,
): ClusterAggregate {
  if (typeof cluster !== "string" && !vcenterBySnapshot) {
    throw new Error("vCenter-Index ist für Identity-Aggregationen erforderlich.");
  }
  const agg = emptyAggregate();
  const targetName = typeof cluster === "string" ? cluster.trim() : null;
  for (const r of rawVHostRows) {
    const d = r.data;
    const rowCluster = String(d["Cluster"] ?? "").trim();
    const hostName = String(d["Host"] ?? "").trim();
    const datacenter = String(d["Datacenter"] ?? "").trim();
    const rowVcenterId = typeof cluster === "string" ? undefined : vcenterBySnapshot?.get(r.snapshotId);
    if (typeof cluster !== "string" && rowVcenterId === undefined) continue;
    const matches = typeof cluster === "string"
      ? rowCluster === targetName
      : isSameCluster(cluster, {
        vcenterId: rowVcenterId,
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

export type HealthColumnMetric = "cpuUsage" | "memoryUsage" | "vcpuPerCore" | "ramCommit";

const HEALTH_COLUMN_LABELS: Record<HealthColumnMetric, string> = {
  cpuUsage: "CPU %",
  memoryUsage: "RAM %",
  vcpuPerCore: "vCPU/Core",
  ramCommit: "RAM Commit %",
};

/** Eine Health-Tabellen-Metrik, die beim nächsten Host-Ausfall ihre Rot-Grenze überschreiten würde. */
export interface HostFailureBreach {
  metric: HealthColumnMetric;
  label: string;
  /** Wert der Metrik bei genau `maxHostFailures + 1` gleichzeitigen Host-Ausfällen. */
  value: number;
  /** Rot-Grenze der Metrik, siehe {@link HEALTH_COLUMN_THRESHOLDS}. */
  danger: number;
}

export interface HostFailureCapacity {
  /** Größte Anzahl gleichzeitiger Host-Ausfälle, die der Cluster verkraftet, ohne dass eine Metrik auf Rot springt. */
  maxHostFailures: number;
  /** Metriken, die beim ersten überschreitenden Ausfall (`maxHostFailures + 1`) ins Rote kippen; leer, wenn selbst hosts-1 Ausfälle grün bleiben. */
  breaches: HostFailureBreach[];
}

/**
 * Simuliert den gleichzeitigen Ausfall von 1..hosts-1 ESXi-Hosts: die Ist-Last (genutzte
 * Cores, belegtes RAM, vCPUs, zugewiesenes RAM) bleibt konstant und verteilt sich auf die
 * verbleibenden Hosts (HA-Restart), während sich die Kapazität (Cores/RAM) proportional zur
 * Hostzahl reduziert (Annahme: homogene Hosts). Ergebnis: die größte Anzahl gleichzeitiger
 * Host-Ausfälle, die der Cluster verkraftet, bevor CPU %, RAM %, vCPU/Core oder RAM Commit %
 * in der Health-Tabelle auf Rot springen ({@link HEALTH_COLUMN_THRESHOLDS}), plus die Metrik(en),
 * die den Ausschlag geben würde(n).
 */
export function computeHostFailureCapacity(agg: ClusterAggregate): HostFailureCapacity {
  const hosts = agg.hosts;
  if (hosts <= 1) return { maxHostFailures: 0, breaches: [] };
  const t = HEALTH_COLUMN_THRESHOLDS;
  for (let failed = 1; failed < hosts; failed++) {
    const factor = (hosts - failed) / hosts;
    const remainingCores = agg.totalCores * factor;
    const remainingMemoryMiB = agg.totalMemoryMiB * factor;
    const values: Record<HealthColumnMetric, number> = {
      cpuUsage: pct(agg.cpuUsedCoreEquiv, remainingCores),
      memoryUsage: pct(agg.memConsumedMiB, remainingMemoryMiB),
      vcpuPerCore: remainingCores > 0 ? agg.vcpus / remainingCores : Number.POSITIVE_INFINITY,
      ramCommit: pct(agg.vRamMiB, remainingMemoryMiB),
    };
    const breaches = (Object.keys(values) as HealthColumnMetric[])
      .filter((metric) => values[metric] >= t[metric].danger)
      .map((metric) => ({
        metric,
        label: HEALTH_COLUMN_LABELS[metric],
        value: round(values[metric], metric === "vcpuPerCore" ? 2 : 1),
        danger: t[metric].danger,
      }));
    if (breaches.length > 0) return { maxHostFailures: failed - 1, breaches };
  }
  return { maxHostFailures: hosts - 1, breaches: [] };
}

export function computeMaxHostFailures(agg: ClusterAggregate): number {
  return computeHostFailureCapacity(agg).maxHostFailures;
}

export function metricsFromAggregate(
  agg: ClusterAggregate,
  opts: {
    clusterName: string;
    clusterRef?: NormalizedCluster | null;
    projected: boolean;
    incompleteVmCount?: number;
    /** vROps-Ausfallskonzept-Werte, `null`/weggelassen ohne vROps-Import für den Cluster. */
    vrops?: VropsRiskInput | null;
  },
): ClusterMetrics {
  const cpuUsagePct = pct(agg.cpuUsedCoreEquiv, agg.totalCores);
  const memoryUsagePct = pct(agg.memConsumedMiB, agg.totalMemoryMiB);
  const vcpuPerCore = agg.totalCores > 0 ? agg.vcpus / agg.totalCores : 0;
  const ramCommitPct = pct(agg.vRamMiB, agg.totalMemoryMiB);
  const ramActivePct = pct(agg.vmActiveMiB, agg.totalMemoryMiB);
  const swapBalloonPct = pct(agg.swapBalloonMiB, agg.totalMemoryMiB);
  const hostFailureCapacity = computeHostFailureCapacity(agg);

  const cpuSpread = Number.isFinite(agg.cpuMin) && Number.isFinite(agg.cpuMax) ? agg.cpuMax - agg.cpuMin : 0;
  const memSpread = Number.isFinite(agg.memMin) && Number.isFinite(agg.memMax) ? agg.memMax - agg.memMin : 0;
  const clusterHostDelta = opts.clusterRef?.numHosts != null ? agg.hosts - opts.clusterRef.numHosts : null;
  const clusterMemoryDeltaPct = opts.clusterRef?.totalMemoryMiB
    ? ((agg.totalMemoryMiB - opts.clusterRef.totalMemoryMiB) / opts.clusterRef.totalMemoryMiB) * 100
    : null;

  const riskFactors: RiskFactor[] = [];
  const addRiskFactor = (label: string, points: number) => riskFactors.push({ label, points });

  if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.danger) addRiskFactor(`CPU-Auslastung ${round(cpuUsagePct, 1)} % (> ${CAPACITY_THRESHOLDS.cpuUsage.danger} %)`, 25);
  else if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.warn) addRiskFactor(`CPU-Auslastung ${round(cpuUsagePct, 1)} % (> ${CAPACITY_THRESHOLDS.cpuUsage.warn} %)`, 12);
  if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.danger) addRiskFactor(`RAM-Auslastung ${round(memoryUsagePct, 1)} % (> ${CAPACITY_THRESHOLDS.memoryUsage.danger} %)`, 25);
  else if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.warn) addRiskFactor(`RAM-Auslastung ${round(memoryUsagePct, 1)} % (> ${CAPACITY_THRESHOLDS.memoryUsage.warn} %)`, 12);
  if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.danger) addRiskFactor(`vCPU/Core ${round(vcpuPerCore, 2)}:1 (> ${CAPACITY_THRESHOLDS.vcpuPerCore.danger}:1)`, 20);
  else if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.warn) addRiskFactor(`vCPU/Core ${round(vcpuPerCore, 2)}:1 (> ${CAPACITY_THRESHOLDS.vcpuPerCore.warn}:1)`, 10);
  if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.danger) addRiskFactor(`RAM Commit ${round(ramCommitPct, 1)} % (> ${CAPACITY_THRESHOLDS.ramCommit.danger} %)`, 15);
  else if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.warn) addRiskFactor(`RAM Commit ${round(ramCommitPct, 1)} % (> ${CAPACITY_THRESHOLDS.ramCommit.warn} %)`, 8);
  if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.danger) addRiskFactor(`Swap+Balloon ${round(swapBalloonPct, 2)} % (> ${CAPACITY_THRESHOLDS.swapBalloon.danger} %)`, 20);
  else if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.warn) addRiskFactor(`Swap+Balloon ${round(swapBalloonPct, 2)} % (> ${CAPACITY_THRESHOLDS.swapBalloon.warn} %)`, 10);
  const hotRatio = agg.hosts > 0 ? agg.hotHosts / agg.hosts : 0;
  if (hotRatio > 0.5) addRiskFactor(`Hot Hosts ${agg.hotHosts}/${agg.hosts} (> 50 %)`, 10);
  else if (hotRatio > 0.3) addRiskFactor(`Hot Hosts ${agg.hotHosts}/${agg.hosts} (> 30 %)`, 5);
  if (opts.clusterRef?.drsEnabled === false && (cpuSpread > 30 || memSpread > 30)) addRiskFactor(`DRS aus bei Auslastungs-Spreizung CPU ${round(cpuSpread, 1)} pp / RAM ${round(memSpread, 1)} pp (> 30 pp)`, 8);
  if (agg.htInactiveHosts > 0) addRiskFactor(`Hyper-Threading auf ${agg.htInactiveHosts}/${agg.hosts} Host(s) inaktiv`, 5);
  if (clusterHostDelta !== null && clusterHostDelta !== 0) addRiskFactor(`Host-Anzahl weicht von vCluster ab (Δ ${clusterHostDelta})`, 3);
  if (clusterMemoryDeltaPct !== null && Math.abs(clusterMemoryDeltaPct) > 5) addRiskFactor(`RAM-Summe weicht von vCluster ab (Δ ${round(clusterMemoryDeltaPct, 1)} %)`, 3);

  const vrops = opts.vrops ?? null;
  if (vrops) {
    const t = VROPS_RISK_THRESHOLDS;
    if (vrops.ramAssignedHighPct !== null) {
      if (vrops.ramAssignedHighPct > t.ramAssignedHigh.danger) addRiskFactor(`HIGH-RP RAM % ${round(vrops.ramAssignedHighPct, 1)} % (> ${t.ramAssignedHigh.danger} %)`, 35);
      else if (vrops.ramAssignedHighPct > t.ramAssignedHigh.warn) addRiskFactor(`HIGH-RP RAM % ${round(vrops.ramAssignedHighPct, 1)} % (> ${t.ramAssignedHigh.warn} %)`, 18);
    }
    if (vrops.cpuOvercommitRatio !== null) {
      if (vrops.cpuOvercommitRatio > t.cpuOvercommit.danger) addRiskFactor(`CPU-Overcommit (vROps Ist) ${round(vrops.cpuOvercommitRatio, 2)}:1 (> ${t.cpuOvercommit.danger}:1)`, 20);
      else if (vrops.cpuOvercommitRatio > t.cpuOvercommit.warn) addRiskFactor(`CPU-Overcommit (vROps Ist) ${round(vrops.cpuOvercommitRatio, 2)}:1 (> ${t.cpuOvercommit.warn}:1)`, 10);
    }
    if (vrops.cpuUsageHighPct !== null) {
      if (vrops.cpuUsageHighPct > t.cpuUsageHigh.danger) addRiskFactor(`HIGH-RP CPU % ${round(vrops.cpuUsageHighPct, 1)} % (> ${t.cpuUsageHigh.danger} %)`, 18);
      else if (vrops.cpuUsageHighPct > t.cpuUsageHigh.warn) addRiskFactor(`HIGH-RP CPU % ${round(vrops.cpuUsageHighPct, 1)} % (> ${t.cpuUsageHigh.warn} %)`, 9);
    }
    if (vrops.ramUsageHighPct !== null) {
      if (vrops.ramUsageHighPct > t.ramUsageHigh.danger) addRiskFactor(`HIGH-RP RAM-Nutzung % ${round(vrops.ramUsageHighPct, 1)} % (> ${t.ramUsageHigh.danger} %)`, 10);
      else if (vrops.ramUsageHighPct > t.ramUsageHigh.warn) addRiskFactor(`HIGH-RP RAM-Nutzung % ${round(vrops.ramUsageHighPct, 1)} % (> ${t.ramUsageHigh.warn} %)`, 5);
    }
    if (vrops.clusterRamAssignedPct !== null) {
      if (vrops.clusterRamAssignedPct > t.clusterRamAssigned.danger) addRiskFactor(`Cluster-RAM-Zuweisung (vROps) ${round(vrops.clusterRamAssignedPct, 1)} % (> ${t.clusterRamAssigned.danger} %)`, 8);
      else if (vrops.clusterRamAssignedPct > t.clusterRamAssigned.warn) addRiskFactor(`Cluster-RAM-Zuweisung (vROps) ${round(vrops.clusterRamAssignedPct, 1)} % (> ${t.clusterRamAssigned.warn} %)`, 4);
    }
    if (vrops.clusterCpuUsagePct !== null) {
      if (vrops.clusterCpuUsagePct > t.clusterCpuUsage.danger) addRiskFactor(`Cluster-CPU-Nutzung (vROps) ${round(vrops.clusterCpuUsagePct, 1)} % (> ${t.clusterCpuUsage.danger} %)`, 8);
      else if (vrops.clusterCpuUsagePct > t.clusterCpuUsage.warn) addRiskFactor(`Cluster-CPU-Nutzung (vROps) ${round(vrops.clusterCpuUsagePct, 1)} % (> ${t.clusterCpuUsage.warn} %)`, 4);
    }
    if (vrops.avgVmsPerHost !== null) {
      if (vrops.avgVmsPerHost > t.avgVmsPerHost.danger) addRiskFactor(`Ø VMs/Host (vROps Ist) ${round(vrops.avgVmsPerHost, 1)} (> ${t.avgVmsPerHost.danger})`, 5);
      else if (vrops.avgVmsPerHost > t.avgVmsPerHost.warn) addRiskFactor(`Ø VMs/Host (vROps Ist) ${round(vrops.avgVmsPerHost, 1)} (> ${t.avgVmsPerHost.warn})`, 2);
    }
  }

  const riskScore = riskFactors.reduce((sum, factor) => sum + factor.points, 0);
  let risk: ClusterMetrics["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";
  // Site-Failover-Risiko ist binär, kein Gradient: reicht die HIGH-RP-RAM-Zuweisung im
  // Standortausfall nicht, können HIGH-RP-VMs nicht starten — das erzwingt "hoch" unabhängig
  // vom Summen-Score (siehe Design-Spec).
  const siteFailoverOverride = computeSiteFailoverRisk(vrops?.ramAssignedHighPct ?? null) === "crit" && risk !== "hoch";
  if (siteFailoverOverride) risk = "hoch";

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
    riskFactors,
    siteFailoverOverride,
    maxHostFailures: hostFailureCapacity.maxHostFailures,
    hostFailureBreaches: hostFailureCapacity.breaches,
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

