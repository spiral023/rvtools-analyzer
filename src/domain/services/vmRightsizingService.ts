import type { NormalizedHost, VmRightsizingCandidate, VmRightsizingGroupSummary, VmWorkloadProfile } from "@/domain/models/types";
import { VM_BEHAVIOR_CLASS_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";

/** Zielauslastung der empfohlenen vCPU-Größe; Sicherheitsaufschlag gegenüber dem reinen P95-Bedarf. */
const TARGET_UTILIZATION = 0.65;
const MANY_VCPU_MIN = 4;
/** Ab dieser Anzahl vCPU gilt eine VM als „viele vCPU“, falls sie zugleich nur einen Bruchteil davon nutzt. */
const MANY_VCPU_LOW_DEMAND_RATIO_MAX = 0.3;
/** Konsistent mit dem CPU-Ready-Hotspot-Grenzwert im Performance-Tab. */
const HIGH_CPU_READY_PCT = 5;

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
    const recommendedVcpu = usedVcpuEquivalentP95 !== null ? Math.max(1, Math.ceil(usedVcpuEquivalentP95 / TARGET_UTILIZATION)) : null;
    const reclaimableVcpu = recommendedVcpu !== null ? Math.max(0, profile.vcpu - recommendedVcpu) : null;
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
