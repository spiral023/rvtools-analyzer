import type {
  NormalizedVm,
  VmMemoryWorkloadStats,
  VmRamRightsizingCandidate,
  VmRamRightsizingDirection,
  VmRamRightsizingGroupSummary,
  VmRamRightsizingPolicy,
  VmWorkloadProfile,
  RamRightsizingLevel,
  VropsTimeSeriesConfidenceLevel,
} from "@/domain/models/types";
import { average } from "@/lib/statistics";
import { normalizeVmName } from "@/lib/globalFilter";
import { matchesSearchFields, techInfoSearchValues, type VmTechInfoSearchIndex } from "@/lib/vmSearch";

/**
 * Vorläufige, zentral konfigurierbare RAM-Policies. Die vier Stufen sind keine aus
 * CPU-Klassen abgeleiteten Gates: Sie koppeln nur die beiden RAM-Perzentile mit der
 * Zielauslastung. Bis der neue Memory-Export vorliegt, sind die Werte technische
 * Planungsparameter und müssen anschließend gegen die reale Verteilung validiert werden.
 */
export const RAM_RIGHTSIZING_POLICIES: Readonly<Record<RamRightsizingLevel, VmRamRightsizingPolicy>> = {
  "very-conservative": {
    level: "very-conservative",
    label: "Sehr vorsichtig",
    normalStatistic: "p99",
    peakStatistic: "p995",
    targetWorkloadFactor: 0.8,
    roundingStepMiB: 1_024,
    minimumCoverageRatio: 0.5,
    minimumSampleCount: 24,
    highConfidenceCoverageRatio: 0.9,
    highConfidenceMinSampleCount: 96,
  },
  conservative: {
    level: "conservative",
    label: "Vorsichtig",
    normalStatistic: "p95",
    peakStatistic: "p995",
    targetWorkloadFactor: 0.85,
    roundingStepMiB: 1_024,
    minimumCoverageRatio: 0.5,
    minimumSampleCount: 24,
    highConfidenceCoverageRatio: 0.9,
    highConfidenceMinSampleCount: 96,
  },
  balanced: {
    level: "balanced",
    label: "Ausgewogen",
    normalStatistic: "p95",
    peakStatistic: "p995",
    targetWorkloadFactor: 0.9,
    roundingStepMiB: 1_024,
    minimumCoverageRatio: 0.5,
    minimumSampleCount: 24,
    highConfidenceCoverageRatio: 0.9,
    highConfidenceMinSampleCount: 96,
  },
  offensive: {
    level: "offensive",
    label: "Offensiv",
    normalStatistic: "p95",
    peakStatistic: "p99",
    targetWorkloadFactor: 0.95,
    roundingStepMiB: 1_024,
    minimumCoverageRatio: 0.5,
    minimumSampleCount: 24,
    highConfidenceCoverageRatio: 0.9,
    highConfidenceMinSampleCount: 96,
  },
};

export const DEFAULT_RAM_RIGHTSIZING_LEVEL: RamRightsizingLevel = "balanced";
export const DEFAULT_RAM_RIGHTSIZING_POLICY = RAM_RIGHTSIZING_POLICIES[DEFAULT_RAM_RIGHTSIZING_LEVEL];

export interface BuildVmRamRightsizingCandidatesInput {
  profiles: readonly VmWorkloadProfile[];
  /** Vollständiger, bereits snapshot-bereinigter RVTools-Bestand für Not-computable-Zeilen. */
  vms?: readonly NormalizedVm[];
  expectedSlots?: number;
  /** Header vorhanden, Werte dürfen trotzdem vollständig fehlen. */
  hasMemoryWorkloadMax?: boolean;
  level?: RamRightsizingLevel;
  policy?: Partial<VmRamRightsizingPolicy>;
}

export interface VmRamDemandRequirements {
  normalDemandRequirementMiB: number | null;
  peakRequirementMiB: number | null;
  requiredMemoryMiB: number | null;
  targetMemoryBeforeRoundingMiB: number | null;
  recommendedMemoryMiB: number | null;
}

interface CandidateSource {
  vm: NormalizedVm | null;
  profile: VmWorkloadProfile | null;
}

/**
 * Verdichtet eine Prozentreihe. `null` und `undefined` sind Messlücken und gehen
 * weder als 0 in den Mittelwert noch in Perzentile ein.
 */
export function calculateVmMemoryWorkloadStats(
  values: readonly (number | null | undefined)[],
  expectedHours = values.length,
): VmMemoryWorkloadStats {
  const finite = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  const sorted = [...finite].sort((left, right) => left - right);
  const fromSorted = (fraction: number): number | null => sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]
    : null;
  const normalizedExpectedHours = Number.isFinite(expectedHours) && expectedHours > 0 ? Math.floor(expectedHours) : 0;
  return {
    expectedHours: normalizedExpectedHours,
    presentHours: finite.length,
    missingHours: Math.max(0, normalizedExpectedHours - finite.length),
    coverageRatio: normalizedExpectedHours > 0 ? finite.length / normalizedExpectedHours : 0,
    average: average(finite),
    p50: fromSorted(0.5),
    p95: fromSorted(0.95),
    p99: fromSorted(0.99),
    p995: fromSorted(0.995),
    maximum: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

/** Datenqualitätsstufe der Avg-Reihe; die Stufen sind unabhängig von CPU-Lastmustern. */
export function evaluateRamWorkloadConfidence(
  stats: Pick<VmMemoryWorkloadStats, "presentHours" | "coverageRatio">,
  policy: VmRamRightsizingPolicy = DEFAULT_RAM_RIGHTSIZING_POLICY,
): VropsTimeSeriesConfidenceLevel {
  if (stats.presentHours === 0) return "not-computable";
  if (stats.coverageRatio < policy.minimumCoverageRatio || stats.presentHours < policy.minimumSampleCount) return "low";
  if (stats.coverageRatio >= policy.highConfidenceCoverageRatio && stats.presentHours >= policy.highConfidenceMinSampleCount) return "high";
  return "medium";
}

/** Leitet die beiden unabhängigen RAM-Bedarfe und das gerundete Ziel ab. */
export function deriveRamDemand(
  configuredMemoryMiB: number | null,
  workloadAvg: VmMemoryWorkloadStats,
  workloadMax: VmMemoryWorkloadStats | null,
  policy: VmRamRightsizingPolicy = DEFAULT_RAM_RIGHTSIZING_POLICY,
): VmRamDemandRequirements {
  const empty: VmRamDemandRequirements = {
    normalDemandRequirementMiB: null,
    peakRequirementMiB: null,
    requiredMemoryMiB: null,
    targetMemoryBeforeRoundingMiB: null,
    recommendedMemoryMiB: null,
  };
  if (configuredMemoryMiB === null || !Number.isFinite(configuredMemoryMiB) || configuredMemoryMiB <= 0) return empty;
  if (!Number.isFinite(policy.targetWorkloadFactor) || policy.targetWorkloadFactor <= 0 || policy.targetWorkloadFactor > 1) return empty;

  const normalPct = statisticValue(workloadAvg, policy.normalStatistic);
  const peakPct = workloadMax && workloadMax.presentHours > 0
    ? statisticValue(workloadMax, policy.peakStatistic)
    : null;
  const normalDemandRequirementMiB = normalPct === null ? null : configuredMemoryMiB * normalPct / 100;
  const peakRequirementMiB = peakPct === null ? null : configuredMemoryMiB * peakPct / 100;
  const requirements = [normalDemandRequirementMiB, peakRequirementMiB].filter((value): value is number => value !== null && Number.isFinite(value));
  if (requirements.length === 0) return { ...empty, normalDemandRequirementMiB, peakRequirementMiB };

  const requiredMemoryMiB = Math.max(...requirements);
  const targetMemoryBeforeRoundingMiB = requiredMemoryMiB / policy.targetWorkloadFactor;
  const recommendedMemoryMiB = roundMemoryUp(targetMemoryBeforeRoundingMiB, policy.roundingStepMiB);
  return {
    normalDemandRequirementMiB,
    peakRequirementMiB,
    requiredMemoryMiB,
    targetMemoryBeforeRoundingMiB,
    recommendedMemoryMiB,
  };
}

/**
 * Baut RAM-Kandidaten für alle VMs im übergebenen Inventar. VMs ohne zugeordnetes
 * vROps-Objekt bleiben sichtbar und werden nicht mit künstlichen 0%-Messwerten
 * bewertet.
 */
export function buildVmRamRightsizingCandidates(
  input: BuildVmRamRightsizingCandidatesInput,
): VmRamRightsizingCandidate[] {
  const basePolicy = RAM_RIGHTSIZING_POLICIES[input.level ?? DEFAULT_RAM_RIGHTSIZING_LEVEL];
  const policy = { ...basePolicy, ...input.policy };
  const profileByRvtoolsKey = new Map<string, VmWorkloadProfile>();
  for (const profile of input.profiles) {
    if (profile.rvtoolsObjectKey) profileByRvtoolsKey.set(profile.rvtoolsObjectKey, profile);
  }
  const sources: CandidateSource[] = input.vms
    ? input.vms.map((vm) => ({ vm, profile: profileByRvtoolsKey.get(vm.vmKey) ?? null }))
    : input.profiles.map((profile): CandidateSource => ({ vm: null, profile }));

  // Ein Profil kann in einem alten/teilweise verknüpften Import existieren, ohne
  // im aktiven Inventar zu liegen. Es soll nicht verloren gehen.
  if (input.vms) {
    const knownProfileKeys = new Set(input.vms.map((vm) => vm.vmKey));
    for (const profile of input.profiles) {
      if (!profile.rvtoolsObjectKey || !knownProfileKeys.has(profile.rvtoolsObjectKey)) sources.push({ vm: null, profile });
    }
  }

  return sources.map(({ vm, profile }) => buildCandidate({ vm, profile, expectedSlots: input.expectedSlots, hasMemoryWorkloadMax: input.hasMemoryWorkloadMax ?? false, policy })).sort(sortRamCandidates);
}

/** Alias für Aufrufer, die den fachlichen Namen statt des VM-Präfixes verwenden. */
export const buildRamRightsizingCandidates = buildVmRamRightsizingCandidates;

export function filterRamRightsizingCandidatesBySearch(
  candidates: readonly VmRamRightsizingCandidate[],
  normalizedQuery: string,
  techInfoIndex: VmTechInfoSearchIndex = new Map(),
): VmRamRightsizingCandidate[] {
  if (normalizedQuery === "") return [...candidates];
  return candidates.filter((candidate) => matchesSearchFields(normalizedQuery, [
    candidate.vmName,
    candidate.clusterName,
    ...techInfoSearchValues(techInfoIndex, candidate.vmName),
  ]));
}

/**
 * Übernimmt den bereits berechneten globalen VM-Scope in den RAM-Tab.
 *
 * `useVms().vms` ist die fachliche Quelle für Suche, Cluster/Host, vCenter,
 * Powerstate, vCLS und globale Filterregeln. Der Kandidat trägt deshalb den
 * RVTools-Schlüssel separat; ein Join nur über den Anzeigenamen wäre bei
 * gleichnamigen VMs aus mehreren vCentern nicht zuverlässig.
 */
export function filterRamRightsizingCandidatesByVmScope(
  candidates: readonly VmRamRightsizingCandidate[],
  scopedVms: readonly Pick<NormalizedVm, "vmKey" | "vmName">[],
): VmRamRightsizingCandidate[] {
  const scopedVmKeys = new Set(scopedVms.map((vm) => vm.vmKey));
  const scopedVmNames = new Set(scopedVms.map((vm) => normalizeVmName(vm.vmName)));

  return candidates.filter((candidate) => candidate.rvtoolsObjectKey !== null
    ? scopedVmKeys.has(candidate.rvtoolsObjectKey)
    : scopedVmNames.has(normalizeVmName(candidate.vmName)));
}

export function summarizeRamRightsizingByCluster(
  candidates: readonly VmRamRightsizingCandidate[],
): VmRamRightsizingGroupSummary[] {
  return summarizeRamRightsizing(candidates, (candidate) => ({
    key: candidate.clusterKey ?? "unassigned",
    label: candidate.clusterName ?? "Ohne Cluster",
  }));
}

export function summarizeRamRightsizingByDirection(
  candidates: readonly VmRamRightsizingCandidate[],
): VmRamRightsizingGroupSummary[] {
  const labels: Record<VmRamRightsizingDirection, string> = {
    shrink: "Verkleinern",
    grow: "Vergrößern",
    unchanged: "Unverändert",
    "not-computable": "Nicht berechenbar",
  };
  return summarizeRamRightsizing(candidates, (candidate) => ({ key: candidate.direction, label: labels[candidate.direction] }));
}

function buildCandidate(input: {
  vm: NormalizedVm | null;
  profile: VmWorkloadProfile | null;
  expectedSlots?: number;
  hasMemoryWorkloadMax: boolean;
  policy: VmRamRightsizingPolicy;
}): VmRamRightsizingCandidate {
  const { vm, profile, policy } = input;
  const expectedHours = profile?.hourly.length || input.expectedSlots || 0;
  const avgValues = profile?.hourly.map((point) => point.memoryWorkloadAvgPct ?? null) ?? [];
  const maxValues = profile?.hourly.map((point) => point.memoryWorkloadMaxPct ?? null) ?? [];
  const workloadAvg = calculateVmMemoryWorkloadStats(avgValues, expectedHours);
  const workloadMax = input.hasMemoryWorkloadMax
    ? calculateVmMemoryWorkloadStats(maxValues, expectedHours)
    : null;
  const configuredMemoryMiB = profile?.configuredMemoryMiB ?? vm?.memoryMiB ?? null;
  const confidence = evaluateRamWorkloadConfidence(workloadAvg, policy);
  const demand = deriveRamDemand(configuredMemoryMiB, workloadAvg, workloadMax, policy);
  let recommendationReason: string | null = null;
  let effectiveConfidence = confidence;
  let recommendationAllowed = true;

  if (profile === null) {
    recommendationAllowed = false;
    recommendationReason = "Keine zugeordnete vROps-Memory-Workload-Zeitreihe.";
    effectiveConfidence = "not-computable";
  } else if (workloadAvg.presentHours === 0) {
    recommendationAllowed = false;
    recommendationReason = "Memory Workload Avg enthält keine verwertbaren Stundenwerte.";
  } else if (configuredMemoryMiB === null || !Number.isFinite(configuredMemoryMiB) || configuredMemoryMiB <= 0) {
    recommendationAllowed = false;
    recommendationReason = "Konfigurierter RAM aus RVTools vInfo.Memory fehlt oder ist nicht positiv.";
    effectiveConfidence = "not-computable";
  } else if (confidence === "low" || confidence === "not-computable") {
    recommendationAllowed = false;
    recommendationReason = `Datenabdeckung oder Stichprobe unterschreitet die RAM-Policy (${formatCoverage(workloadAvg.coverageRatio)} bei ${workloadAvg.presentHours.toLocaleString("de-DE")} von ${workloadAvg.expectedHours.toLocaleString("de-DE")} Stunden).`;
  } else if (demand.requiredMemoryMiB === null || demand.requiredMemoryMiB <= 0) {
    recommendationAllowed = false;
    recommendationReason = "Die ausgewählten Workload-Perzentile liefern keinen positiven RAM-Bedarf; keine scheinpräzise Empfehlung erzeugt.";
  }

  if (recommendationAllowed && workloadMax && workloadMax.presentHours > 0) {
    const maxConfidence = evaluateRamWorkloadConfidence(workloadMax, policy);
    effectiveConfidence = lowerConfidence(effectiveConfidence, maxConfidence);
    if (maxConfidence === "low" || maxConfidence === "not-computable") {
      recommendationAllowed = false;
      recommendationReason = `Die vorhandene Workload-Max-Reihe ist für die Peak-Policy zu lückenhaft (${formatCoverage(workloadMax.coverageRatio)} Abdeckung).`;
    }
  }

  const recommendedMemoryMiB = recommendationAllowed ? demand.recommendedMemoryMiB : null;
  const deltaMiB = recommendedMemoryMiB !== null && configuredMemoryMiB !== null
    ? recommendedMemoryMiB - configuredMemoryMiB
    : null;
  const direction: VmRamRightsizingDirection = recommendedMemoryMiB === null || deltaMiB === null
    ? "not-computable"
    : deltaMiB < 0
      ? "shrink"
      : deltaMiB > 0
        ? "grow"
        : "unchanged";

  return {
    objectKey: profile?.objectKey ?? `rvtools:${vm?.vmKey ?? vm?.vmName ?? "unknown"}`,
    rvtoolsObjectKey: profile?.rvtoolsObjectKey ?? vm?.vmKey ?? null,
    policyLevel: policy.level,
    normalStatistic: policy.normalStatistic,
    peakStatistic: policy.peakStatistic,
    vmName: profile?.vmName ?? vm?.vmName ?? "Unbekannte VM",
    clusterKey: profile?.clusterKey ?? (vm?.cluster ? `rvtools:${vm.cluster}` : null),
    clusterName: profile?.clusterName ?? vm?.cluster ?? null,
    configuredMemoryMiB,
    expectedHours: workloadAvg.expectedHours,
    presentHours: workloadAvg.presentHours,
    coverageRatio: workloadAvg.coverageRatio,
    workloadAvg,
    workloadMax,
    normalDemandRequirementMiB: demand.normalDemandRequirementMiB,
    peakRequirementMiB: demand.peakRequirementMiB,
    requiredMemoryMiB: demand.requiredMemoryMiB,
    targetMemoryBeforeRoundingMiB: demand.targetMemoryBeforeRoundingMiB,
    recommendedMemoryMiB,
    deltaMiB,
    direction,
    confidence: effectiveConfidence,
    recommendationReason: direction === "not-computable" ? recommendationReason : null,
    peakSignalUsed: recommendationAllowed && workloadMax !== null && workloadMax.presentHours > 0,
  };
}

function summarizeRamRightsizing(
  candidates: readonly VmRamRightsizingCandidate[],
  keyOf: (candidate: VmRamRightsizingCandidate) => { key: string; label: string },
): VmRamRightsizingGroupSummary[] {
  const groups = new Map<string, VmRamRightsizingGroupSummary>();
  for (const candidate of candidates) {
    const { key, label } = keyOf(candidate);
    const group = groups.get(key) ?? {
      key,
      label,
      vmCount: 0,
      shrinkCount: 0,
      growCount: 0,
      unchangedCount: 0,
      notComputableCount: 0,
      reclaimableMemoryMiB: 0,
      additionalMemoryMiB: 0,
    };
    group.vmCount += 1;
    if (candidate.direction === "shrink") {
      group.shrinkCount += 1;
      group.reclaimableMemoryMiB += Math.abs(candidate.deltaMiB ?? 0);
    } else if (candidate.direction === "grow") {
      group.growCount += 1;
      group.additionalMemoryMiB += candidate.deltaMiB ?? 0;
    } else if (candidate.direction === "unchanged") {
      group.unchangedCount += 1;
    } else {
      group.notComputableCount += 1;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => (
    right.reclaimableMemoryMiB + right.additionalMemoryMiB
    - left.reclaimableMemoryMiB - left.additionalMemoryMiB
  ));
}

function statisticValue(stats: VmMemoryWorkloadStats, statistic: "p95" | "p99" | "p995"): number | null {
  return stats[statistic];
}

function roundMemoryUp(value: number, stepMiB: number): number {
  const step = Number.isFinite(stepMiB) && stepMiB > 0 ? stepMiB : 1;
  return Math.ceil((value - Number.EPSILON) / step) * step;
}

function lowerConfidence(
  left: VropsTimeSeriesConfidenceLevel,
  right: VropsTimeSeriesConfidenceLevel,
): VropsTimeSeriesConfidenceLevel {
  const rank: Record<VropsTimeSeriesConfidenceLevel, number> = { high: 3, medium: 2, low: 1, "not-computable": 0 };
  return rank[left] <= rank[right] ? left : right;
}

function formatCoverage(value: number): string {
  return `${(value * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

function sortRamCandidates(left: VmRamRightsizingCandidate, right: VmRamRightsizingCandidate): number {
  const directionOrder: Record<VmRamRightsizingDirection, number> = { shrink: 0, grow: 1, unchanged: 2, "not-computable": 3 };
  return directionOrder[left.direction] - directionOrder[right.direction]
    || (left.deltaMiB ?? Number.POSITIVE_INFINITY) - (right.deltaMiB ?? Number.POSITIVE_INFINITY)
    || left.vmName.localeCompare(right.vmName, "de-DE");
}
