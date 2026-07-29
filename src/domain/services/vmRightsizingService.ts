import type { NormalizedHost, VmRightsizingCandidate, VmRightsizingGroupSummary, VmWorkloadProfile, VmWorkloadShape } from "@/domain/models/types";
import { VM_BEHAVIOR_CLASS_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";

/** Zielauslastung der empfohlenen vCPU-Größe beim P95-Bedarf. */
const TARGET_UTILIZATION_P95 = 0.65;
/**
 * Zweite Bedingung gegen das beobachtete Maximum. Ohne sie richtet sich die Empfehlung
 * allein nach dem P95 *stündlicher Mittelwerte* – vROps liefert `cpuCpuDemandAvg`, womit
 * Spitzen innerhalb einer Stunde vollständig herausgemittelt sind. Eine VM mit kurzen,
 * heftigen Lastspitzen sähe dadurch harmlos aus und würde zu klein empfohlen.
 */
const TARGET_UTILIZATION_PEAK = 0.9;
/** Untergrenze der Empfehlung: gerade Zahl und gängige Mindestgröße gängiger Gast-Betriebssysteme. */
const MIN_RECOMMENDED_VCPU = 2;
/**
 * Höchstens dieser Anteil der konfigurierten vCPU wird auf einmal zur Rückgabe
 * vorgeschlagen. Rightsizing bleibt damit ein schrittweiser Vorgang mit überprüfbaren
 * Schritten; die bedarfsgerechte Zielgröße bleibt als `demandBasedVcpu` sichtbar.
 */
const MAX_RECLAIM_RATIO = 0.25;
/**
 * Muster, deren Spitzenlast in einem Sieben-Tage-Fenster nicht verlässlich erfasst ist:
 * `bursty` lebt von seltenen Ausschlägen, `irregular` hat per Definition keinen
 * reproduzierbaren Tagesverlauf, `unclassified` hat zu wenig Datenbasis. Für diese VMs
 * kann eine Woche den Jahresspitzenbedarf deutlich unterschätzen, deshalb wird keine
 * Verkleinerung vorgeschlagen – die Kennzahlen bleiben zur Beurteilung sichtbar.
 */
const SHAPES_WITHOUT_RECOMMENDATION: readonly VmWorkloadShape[] = ["bursty", "irregular", "unclassified"];
const MANY_VCPU_MIN = 4;
/** Ab dieser Anzahl vCPU gilt eine VM als „viele vCPU“, falls sie zugleich nur einen Bruchteil davon nutzt. */
const MANY_VCPU_LOW_DEMAND_RATIO_MAX = 0.3;
/** Konsistent mit dem CPU-Ready-Hotspot-Grenzwert im Performance-Tab. */
const HIGH_CPU_READY_PCT = 5;

/** Rundet auf die nächstkleinere gerade Zahl ab – vCPU werden paarweise zurückgegeben. */
function floorToEven(value: number): number {
  return Math.max(0, Math.floor(value / 2) * 2);
}

/** Rundet auf die nächstgrößere gerade Zahl auf – für Zielgrößen, die nicht zu klein sein dürfen. */
function ceilToEven(value: number): number {
  return Math.ceil(value / 2) * 2;
}

export interface BuildVmRightsizingCandidatesInput {
  profiles: readonly VmWorkloadProfile[];
  hosts: readonly NormalizedHost[];
}

/**
 * Vergleicht konfigurierte vCPU mit beobachtetem CPU Demand/Ready je VM.
 * Liefert ausschließlich prüfpflichtige Kandidaten – niemals eine automatische
 * Änderung von VM-Ressourcen.
 */
export function buildVmRightsizingCandidates(input: BuildVmRightsizingCandidatesInput): VmRightsizingCandidate[] {
  const hostByKey = new Map(input.hosts.map((host) => [host.hostKey, host]));

  return input.profiles.flatMap((profile): VmRightsizingCandidate[] => {
    if (profile.vcpu === null || profile.vcpu <= 0) return [];
    const host = profile.hostKey ? hostByKey.get(profile.hostKey) : undefined;
    const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
    const usedVcpuEquivalentP95 = mhzPerCore !== null && profile.demand.p95 !== null ? profile.demand.p95 / mhzPerCore : null;
    const usedVcpuEquivalentPeak = mhzPerCore !== null && profile.demand.maximum !== null ? profile.demand.maximum / mhzPerCore : null;

    // Bedarfsgerechte Zielgröße: was die Messung allein hergibt, ohne Zurückhaltung.
    // Bleibt auch dann sichtbar, wenn keine Empfehlung ausgesprochen wird.
    const demandBasedVcpu = usedVcpuEquivalentP95 === null ? null : Math.min(
      profile.vcpu,
      ceilToEven(Math.max(
        usedVcpuEquivalentP95 / TARGET_UTILIZATION_P95,
        (usedVcpuEquivalentPeak ?? 0) / TARGET_UTILIZATION_PEAK,
        MIN_RECOMMENDED_VCPU,
      )),
    );

    // Eine Verkleinerung ist ein Eingriff in ein laufendes System. Sie wird nur
    // vorgeschlagen, wenn die Datenbasis belastbar ist und das Muster in sieben Tagen
    // verlässlich beobachtbar war.
    const recommendationWithheldReason = profile.confidence !== "high"
      ? "low-confidence" as const
      : SHAPES_WITHOUT_RECOMMENDATION.includes(profile.shape)
        ? "unreliable-shape" as const
        : null;

    // Die Rückgabe ist die primäre Größe und immer gerade; die Empfehlung folgt daraus,
    // damit Empfehlung + Rückgabe stets die konfigurierte Anzahl ergeben.
    const reclaimableVcpu = demandBasedVcpu === null
      ? null
      : recommendationWithheldReason !== null
        ? 0
        : floorToEven(Math.min(profile.vcpu - demandBasedVcpu, profile.vcpu * MAX_RECLAIM_RATIO));
    const recommendedVcpu = reclaimableVcpu === null ? null : profile.vcpu - reclaimableVcpu;
    const manyVcpuLowDemand = profile.vcpu >= MANY_VCPU_MIN && usedVcpuEquivalentP95 !== null && usedVcpuEquivalentP95 <= profile.vcpu * MANY_VCPU_LOW_DEMAND_RATIO_MAX;
    const highCpuReady = profile.ready.p95 !== null && profile.ready.p95 > HIGH_CPU_READY_PCT;
    return [{
      objectKey: profile.objectKey,
      vmName: profile.vmName,
      clusterKey: profile.clusterKey,
      clusterName: profile.clusterName,
      hostName: host?.host ?? profile.host,
      vcpu: profile.vcpu,
      shape: profile.shape,
      intensity: profile.intensity,
      behaviorClass: profile.behaviorClass,
      confidence: profile.confidence,
      demand: profile.demand,
      ready: profile.ready,
      mhzPerCore,
      usedVcpuEquivalentP95,
      usedVcpuEquivalentPeak,
      demandBasedVcpu,
      recommendationWithheldReason,
      recommendedVcpu,
      reclaimableVcpu,
      flags: { manyVcpuLowDemand, highCpuReady },
    }];
  }).sort((left, right) => (right.reclaimableVcpu ?? -1) - (left.reclaimableVcpu ?? -1));
}

/** Ein Kandidat gilt als „auffällig“, wenn er tatsächlich hervorgehoben werden sollte – nicht jede Zeile der Vergleichstabelle. */
export function isNotableRightsizingCandidate(candidate: VmRightsizingCandidate): boolean {
  return candidate.flags.manyVcpuLowDemand || candidate.flags.highCpuReady || (candidate.reclaimableVcpu ?? 0) > 0;
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
    const group = groups.get(key) ?? { key, label, vmCount: 0, candidateCount: 0, totalVcpu: 0, reclaimableVcpu: 0 };
    group.vmCount += 1;
    group.totalVcpu += candidate.vcpu ?? 0;
    group.reclaimableVcpu += candidate.reclaimableVcpu ?? 0;
    if (isNotableRightsizingCandidate(candidate)) group.candidateCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.reclaimableVcpu - left.reclaimableVcpu);
}
