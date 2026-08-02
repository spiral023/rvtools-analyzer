import type {
  CpuRightsizingLevel,
  NormalizedHost,
  NormalizedVm,
  VmRightsizingCandidate,
  VmRightsizingGroupSummary,
  VmWorkloadProfile,
  VmWorkloadProfileMetricStats,
  VmWorkloadShape,
} from "@/domain/models/types";
import { VM_BEHAVIOR_CLASS_LABEL, VM_WORKLOAD_SHAPE_LABEL, hasRepeatableWeeklyPeak } from "@/domain/services/vmWorkloadProfileService";
import { normalizeVmName } from "@/lib/globalFilter";
import { matchesSearchFields, techInfoSearchValues, type VmTechInfoSearchIndex } from "@/lib/vmSearch";

export interface CpuRightsizingPolicy {
  level: CpuRightsizingLevel;
  label: string;
  peakStatistic: "p95" | "p99" | "p995" | "maximum";
  peakPercentile: number;
  targetUtilizationP95: number;
  targetUtilizationPeak: number;
}

/** Vier geschlossene, datenbelegte Stufen; die drei Stellgrößen bleiben gekoppelt. */
export const CPU_RIGHTSIZING_POLICIES: Readonly<Record<CpuRightsizingLevel, CpuRightsizingPolicy>> = {
  "very-conservative": { level: "very-conservative", label: "Sehr vorsichtig", peakStatistic: "maximum", peakPercentile: 1, targetUtilizationP95: 0.55, targetUtilizationPeak: 0.8 },
  conservative: { level: "conservative", label: "Vorsichtig", peakStatistic: "p995", peakPercentile: 0.995, targetUtilizationP95: 0.6, targetUtilizationPeak: 0.85 },
  balanced: { level: "balanced", label: "Ausgewogen", peakStatistic: "p99", peakPercentile: 0.99, targetUtilizationP95: 0.65, targetUtilizationPeak: 0.9 },
  offensive: { level: "offensive", label: "Offensiv", peakStatistic: "p95", peakPercentile: 0.95, targetUtilizationP95: 0.7, targetUtilizationPeak: 0.95 },
};

export const DEFAULT_CPU_RIGHTSIZING_LEVEL: CpuRightsizingLevel = "balanced";
/** Untergrenze der Empfehlung: gerade Zahl und gängige Mindestgröße gängiger Gast-Betriebssysteme. */
const MIN_RECOMMENDED_VCPU = 2;
/**
 * Muster ohne reproduzierbaren Verlauf: `irregular` hat per Definition keinen,
 * `unclassified` hat zu wenig Datenbasis. Für sie kann der Messzeitraum den
 * Spitzenbedarf beliebig unterschätzen, deshalb wird keine Verkleinerung
 * vorgeschlagen – die Kennzahlen bleiben zur Beurteilung sichtbar.
 *
 * `bursty` stand hier ebenfalls, solange nur sieben Tage vorlagen. Mit vier vollen
 * Wochen lässt sich die Frage direkt beantworten: 48 % der `bursty`-VMs wiederholen
 * ihren Wochenverlauf mit einer Korrelation von mindestens 0,7 bei nahezu gleich hohen
 * Wochenmaxima, während das auf `irregular` nur für eine einzige VM von 213 zutrifft.
 * Für `bursty` entscheidet deshalb {@link hasRepeatableWeeklyPeak} statt einer
 * pauschalen Sperre.
 */
const SHAPES_WITHOUT_RECOMMENDATION: readonly VmWorkloadShape[] = ["irregular", "unclassified"];
/** Muster, deren Spitze erst mit nachgewiesener Wochen-Wiederholbarkeit planbar ist. */
const SHAPES_REQUIRING_REPEATABLE_PEAK: readonly VmWorkloadShape[] = ["bursty"];
const MANY_VCPU_MIN = 4;
/** Ab dieser Anzahl vCPU gilt eine VM als „viele vCPU“, falls sie zugleich nur einen Bruchteil davon nutzt. */
const MANY_VCPU_LOW_DEMAND_RATIO_MAX = 0.3;
/** Konsistent mit dem CPU-Ready-Hotspot-Grenzwert im Performance-Tab. */
const HIGH_CPU_READY_PCT = 5;
/**
 * Ab diesem Co-Stop unter Last kostet die vCPU-Anzahl selbst Leistung. In lasthaltigen
 * Stunden erreichen 45,9 % der VMs ab 17 vCPU diesen Wert, bei höchstens 16 vCPU nur
 * 12–26 %; im Stundenverlauf steigt Co-Stop bei den breiten VMs mit der Auslastung von
 * 0,4 % auf 10,6 %, bei schmalen bleibt er flach. Der einzige direkte Nachweis dafür,
 * dass eine Verkleinerung die VM schneller macht statt langsamer.
 */
const COSTOP_UNDER_LOAD_PCT = 5;
/** Ein voller Tag trennt wiederkehrende Einzelkern-Sättigung von sporadischen Stunden. */
const SINGLE_CORE_BOUND_MIN_HOURS = 24;
/**
 * Ab diesem Konzentrationsindex trägt ein Bruchteil der vCPU die Last. Die erwartete
 * zweigipflige Verteilung besteht nicht – der Median liegt bei 0,061 –, weshalb der Wert
 * am oberen Rand der Verteilung angesetzt ist: rund 180 der 4.018 VMs erreichen ihn, und
 * bei ihnen bleiben im Median 2,6 vCPU ohne Wirkung.
 */
const CONCENTRATION_INDEX_MIN = 0.4;
/**
 * So viele Stunden über 75 % der Kapazität müssen zusammenkommen, damit eine
 * Vergrößerung vorgeschlagen wird. Ohne diese Bedingung genügte eine einzelne
 * Spitze: Das Monatsmaximum von `vmCpuDemandMaxMHz` ist ein 20-Sekunden-Wert und
 * würde 27,6 % des Bestands als unterdimensioniert ausweisen. Mit ihr bleiben
 * 66 VMs (1,6 %) übrig – jene, die dauerhaft an der Grenze laufen.
 */
const UNDERSIZED_MIN_HOURS_NEAR_CAPACITY = 24;
/**
 * CPU Ready und Peak-Ready taugen in dieser Umgebung *nicht* als Nachweis für eine zu
 * kleine VM. Der reguläre Wert ist praktisch tot (P95 im Median 0,21 %, genau eine VM
 * über 5 %). Der Peak-Wert sieht mit einem P95-Median von 2,91 % zunächst lebendig aus,
 * verhält sich aber gegenläufig zur Erwartung: Er steigt nicht mit der Auslastung
 * (0–10 % Last: 9,8 %, über 90 % Last: 7,9 %) und *fällt* mit der vCPU-Breite (9,8 % bei
 * 1–2 vCPU gegenüber 1,8 % ab 17 vCPU). Er misst damit die Auflösung des
 * 20-Sekunden-Fensters, nicht Contention. Deshalb bleibt er eine angezeigte Kennzahl
 * ohne Einfluss auf die Empfehlung.
 */

/** Rundet auf die nächstgrößere gerade Zahl auf – für Zielgrößen, die nicht zu klein sein dürfen. */
function ceilToEven(value: number): number {
  return Math.ceil(value / 2) * 2;
}

export interface BuildVmRightsizingCandidatesInput {
  profiles: readonly VmWorkloadProfile[];
  hosts: readonly NormalizedHost[];
  level?: CpuRightsizingLevel;
}

/**
 * Vergleicht konfigurierte vCPU mit beobachtetem CPU Demand/Ready je VM.
 * Liefert ausschließlich prüfpflichtige Kandidaten – niemals eine automatische
 * Änderung von VM-Ressourcen.
 */
export function buildVmRightsizingCandidates(input: BuildVmRightsizingCandidatesInput): VmRightsizingCandidate[] {
  const hostByKey = new Map(input.hosts.map((host) => [host.hostKey, host]));
  const level = input.level ?? DEFAULT_CPU_RIGHTSIZING_LEVEL;
  const policy = CPU_RIGHTSIZING_POLICIES[level];

  return input.profiles.flatMap((profile): VmRightsizingCandidate[] => {
    if (profile.vcpu === null || profile.vcpu <= 0) return [];
    const host = profile.hostKey ? hostByKey.get(profile.hostKey) : undefined;
    const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
    // Die von vROps je VM gemeldete Kapazität geht vor. Sie stimmt zwar mit `mhzPerCore`
    // überein, wo beide vorliegen (Faktor 1,0000 im Median über acht Taktklassen), sie
    // begleitet aber die VM: 2,9 % der VMs wechselten im Messmonat die Taktklasse, für
    // die beschreibt der Host von heute den Zeitraum von gestern falsch.
    const mhzPerVcpu = profile.capacitySignals.mhzPerVcpu ?? mhzPerCore;
    const usedVcpuEquivalentP95 = mhzPerVcpu !== null && profile.demand.p95 !== null ? profile.demand.p95 / mhzPerVcpu : null;
    // Das Perzentil ist die wirksamste Stellschraube und wird durch die globale Stufe
    // gewählt. Fällt Demand Max aus, bleibt das Maximum der Stundenmittel als Fallback.
    const peakDemandMHz = peakDemandForPolicy(profile.demandMax, policy) ?? profile.demand.maximum;
    const usedVcpuEquivalentPeak = mhzPerVcpu !== null && peakDemandMHz !== null ? peakDemandMHz / mhzPerVcpu : null;

    // Bedarfsgerechte Zielgröße: was die Messung allein hergibt, ohne Zurückhaltung und
    // ohne Deckelung auf die konfigurierte Anzahl. Erst dadurch wird eine zu klein
    // konfigurierte VM überhaupt sichtbar. Bleibt auch dann stehen, wenn keine
    // Empfehlung ausgesprochen wird.
    const demandBasedVcpu = usedVcpuEquivalentP95 === null ? null : ceilToEven(Math.max(
      usedVcpuEquivalentP95 / policy.targetUtilizationP95,
      (usedVcpuEquivalentPeak ?? 0) / policy.targetUtilizationPeak,
      MIN_RECOMMENDED_VCPU,
    ));

    const sustainedNearCapacity = (profile.capacitySignals.hoursAboveCapacity75 ?? 0) >= UNDERSIZED_MIN_HOURS_NEAR_CAPACITY;
    const recommendationWithheldReason = determineWithheldReason(profile, demandBasedVcpu, sustainedNearCapacity);

    // Die Rückgabe ist die vollständige Differenz zur bedarfsgerechten Größe; die
    // Empfehlung folgt daraus, damit Empfehlung + Rückgabe stets die konfigurierte
    // Anzahl ergeben.
    const applies = demandBasedVcpu !== null && recommendationWithheldReason === null;
    const reclaimableVcpu = demandBasedVcpu === null
      ? null
      : applies && demandBasedVcpu < profile.vcpu
        ? profile.vcpu - demandBasedVcpu
        : 0;
    const additionalVcpu = demandBasedVcpu === null
      ? null
      : applies && demandBasedVcpu > profile.vcpu
        ? demandBasedVcpu - profile.vcpu
        : 0;
    const recommendedVcpu = reclaimableVcpu === null || additionalVcpu === null
      ? null
      : profile.vcpu - reclaimableVcpu + additionalVcpu;

    const manyVcpuLowDemand = profile.vcpu >= MANY_VCPU_MIN && usedVcpuEquivalentP95 !== null && usedVcpuEquivalentP95 <= profile.vcpu * MANY_VCPU_LOW_DEMAND_RATIO_MAX;
    const highCpuReady = profile.ready.p95 !== null && profile.ready.p95 > HIGH_CPU_READY_PCT;
    const costopUnderLoad = (profile.capacitySignals.costopUnderLoadP95Pct ?? 0) > COSTOP_UNDER_LOAD_PCT;
    const singleCoreBound = (profile.capacitySignals.singleCoreBoundHours ?? 0) >= SINGLE_CORE_BOUND_MIN_HOURS;
    const concentratedOnFewCores = (profile.capacitySignals.concentrationIndexP90 ?? 0) >= CONCENTRATION_INDEX_MIN;
    return [{
      objectKey: profile.objectKey,
      rvtoolsObjectKey: profile.rvtoolsObjectKey,
      vmName: profile.vmName,
      clusterKey: profile.clusterKey,
      clusterName: profile.clusterName,
      resourcePool: profile.resourcePool,
      hostName: host?.host ?? profile.host,
      powerState: profile.powerState,
      vcpu: profile.vcpu,
      shape: profile.shape,
      intensity: profile.intensity,
      behaviorClass: profile.behaviorClass,
      confidence: profile.confidence,
      rightsizingLevel: level,
      demand: profile.demand,
      ready: profile.ready,
      mhzPerCore,
      mhzPerVcpu,
      usedVcpuEquivalentP95,
      usedVcpuEquivalentPeak,
      demandBasedVcpu,
      recommendationWithheldReason,
      recommendedVcpu,
      reclaimableVcpu,
      additionalVcpu,
      flags: { manyVcpuLowDemand, highCpuReady, costopUnderLoad, singleCoreBound, concentratedOnFewCores, sustainedNearCapacity },
    }];
  }).sort((left, right) => (right.reclaimableVcpu ?? -1) - (left.reclaimableVcpu ?? -1));
}

/**
 * Prüft, ob die bedarfsgerechte Größe als Empfehlung taugt.
 *
 * Verkleinerung und Vergrößerung haben unterschiedliche Risiken und deshalb eigene
 * Bedingungen: Eine zu große VM verschwendet Kapazität, eine zu kleine fällt aus. Eine
 * Verkleinerung muss deshalb gegen ein verlässlich beobachtetes Muster abgesichert sein,
 * eine Vergrößerung gegen den Verdacht, nur einer einzelnen Spitze zu folgen.
 */
function determineWithheldReason(
  profile: VmWorkloadProfile,
  demandBasedVcpu: number | null,
  sustainedNearCapacity: boolean,
): VmRightsizingCandidate["recommendationWithheldReason"] {
  if (demandBasedVcpu === null || profile.vcpu === null || demandBasedVcpu === profile.vcpu) return null;
  if (profile.confidence !== "high") return "low-confidence";
  if (demandBasedVcpu > profile.vcpu) {
    return sustainedNearCapacity ? null : "peak-only";
  }
  if (SHAPES_WITHOUT_RECOMMENDATION.includes(profile.shape)) return "unreliable-shape";
  if (SHAPES_REQUIRING_REPEATABLE_PEAK.includes(profile.shape) && !hasRepeatableWeeklyPeak(profile.signals)) {
    return "burst-not-repeatable";
  }
  return null;
}

/** Ein Kandidat gilt als „auffällig“, wenn er tatsächlich hervorgehoben werden sollte – nicht jede Zeile der Vergleichstabelle. */
export function isNotableRightsizingCandidate(candidate: VmRightsizingCandidate): boolean {
  return candidate.flags.manyVcpuLowDemand
    || candidate.flags.highCpuReady
    || candidate.flags.costopUnderLoad
    || candidate.flags.singleCoreBound
    || candidate.flags.concentratedOnFewCores
    || (candidate.reclaimableVcpu ?? 0) > 0
    || (candidate.additionalVcpu ?? 0) > 0;
}

/**
 * Ein CPU-Vergleich ist nur sinnvoll, wenn beide Achsen des VM-Profils belastbar
 * klassifiziert wurden. Ein niedriges, aber bekanntes Niveau bleibt dabei
 * berechenbar; nur „Nicht berechenbar“ bzw. „Unbekannt“ werden ausgesondert.
 */
export function isComputableRightsizingCandidate(candidate: VmRightsizingCandidate): boolean {
  return candidate.shape !== "unclassified" && candidate.intensity !== "unknown";
}

/**
 * Wendet die Textsuche der Filterleiste auf die Kandidatenliste an – VM-Name, Cluster,
 * Systemverantwortliche:r und deren Abteilung. Der Filter greift bewusst an der Wurzel des
 * Tabs: KPI-Kacheln, Dichteraster, Diagramme und Zusammenfassungen leiten sich alle aus
 * derselben Liste ab und zeigen damit denselben Ausschnitt wie die Tabelle.
 *
 * `techInfoIndex` ist über den normalisierten VM-Namen verschlüsselt (siehe `vmNameNorm`),
 * weil Systemverantwortliche und Abteilung aus der Tech-Info stammen und nicht aus dem
 * RVTools-Export.
 */
export function filterRightsizingCandidatesBySearch(
  candidates: readonly VmRightsizingCandidate[],
  normalizedQuery: string,
  techInfoIndex: VmTechInfoSearchIndex,
): VmRightsizingCandidate[] {
  if (normalizedQuery === "") return [...candidates];
  return candidates.filter((candidate) => matchesSearchFields(normalizedQuery, [
    candidate.vmName,
    candidate.clusterName,
    ...techInfoSearchValues(techInfoIndex, candidate.vmName),
  ]));
}

/**
 * Übernimmt den globalen VM-Scope in den CPU-Rightsizing-Tab. Der Join verwendet
 * bevorzugt den eindeutigen RVTools-Schlüssel und fällt nur bei alten/teilweise
 * verknüpften Daten auf den normalisierten VM-Namen zurück.
 */
export function filterRightsizingCandidatesByVmScope(
  candidates: readonly VmRightsizingCandidate[],
  scopedVms: readonly Pick<NormalizedVm, "vmKey" | "vmName">[],
): VmRightsizingCandidate[] {
  const scopedVmKeys = new Set(scopedVms.map((vm) => vm.vmKey));
  const scopedVmNames = new Set(scopedVms.map((vm) => normalizeVmName(vm.vmName)));

  return candidates.filter((candidate) => candidate.rvtoolsObjectKey !== null
    ? scopedVmKeys.has(candidate.rvtoolsObjectKey)
    : scopedVmNames.has(normalizeVmName(candidate.vmName)));
}

export function summarizeReclaimableVcpuByCluster(candidates: readonly VmRightsizingCandidate[]): VmRightsizingGroupSummary[] {
  return summarizeBy(candidates, (candidate) => ({ key: candidate.clusterKey ?? "unassigned", label: candidate.clusterName ?? "Ohne Cluster" }));
}

export function summarizeReclaimableVcpuByBehaviorClass(candidates: readonly VmRightsizingCandidate[]): VmRightsizingGroupSummary[] {
  return summarizeBy(candidates, (candidate) => ({ key: candidate.behaviorClass, label: VM_BEHAVIOR_CLASS_LABEL[candidate.behaviorClass] }));
}

/**
 * Gruppiert nach zeitlichem Muster statt nach Verhaltensklasse. Für Rightsizing die
 * aussagekräftigere Sicht: die Kandidaten sind ohnehin überwiegend schwach ausgelastet,
 * sodass eine Gruppierung nach Verhaltensklasse fast alle in „gering genutzt“ sammelt.
 */
export function summarizeReclaimableVcpuByShape(candidates: readonly VmRightsizingCandidate[]): VmRightsizingGroupSummary[] {
  return summarizeBy(candidates, (candidate) => ({ key: candidate.shape, label: VM_WORKLOAD_SHAPE_LABEL[candidate.shape] }));
}

function summarizeBy(
  candidates: readonly VmRightsizingCandidate[],
  keyOf: (candidate: VmRightsizingCandidate) => { key: string; label: string },
): VmRightsizingGroupSummary[] {
  const groups = new Map<string, VmRightsizingGroupSummary>();
  for (const candidate of candidates) {
    const { key, label } = keyOf(candidate);
    const group = groups.get(key) ?? {
      key,
      label,
      vmCount: 0,
      candidateCount: 0,
      totalVcpu: 0,
      reclaimableVcpu: 0,
      reclaimableVcpuPercent: null,
    };
    group.vmCount += 1;
    group.totalVcpu += candidate.vcpu ?? 0;
    group.reclaimableVcpu += candidate.reclaimableVcpu ?? 0;
    if (isNotableRightsizingCandidate(candidate)) group.candidateCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      reclaimableVcpuPercent: group.totalVcpu > 0
        ? (group.reclaimableVcpu / group.totalVcpu) * 100
        : null,
    }))
    .sort((left, right) => right.reclaimableVcpu - left.reclaimableVcpu);
}

function peakDemandForPolicy(stats: VmWorkloadProfileMetricStats, policy: CpuRightsizingPolicy): number | null {
  switch (policy.peakStatistic) {
    case "p95": return stats.p95;
    case "p99": return stats.p99;
    case "p995": return stats.p995;
    case "maximum": return stats.maximum;
  }
}
