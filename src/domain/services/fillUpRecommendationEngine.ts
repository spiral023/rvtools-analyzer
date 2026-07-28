import type {
  FillUpCapacityAnalysis,
  FillUpClusterRecommendationRankInput,
  FillUpGuardrailHeadroom,
  FillUpHeadroomValue,
  FillUpIndependentHeadroom,
  FillUpProfileRecommendation,
  FillUpRecommendationAnalysis,
  FillUpScenarioResult,
  FillUpWorkloadMix,
  FillUpWorkloadMixRecommendation,
  FillUpWorkloadProfile,
} from "@/domain/models/types";

export interface FillUpRecommendationEngineInput {
  capacityAnalysis: FillUpCapacityAnalysis;
  profiles: readonly FillUpWorkloadProfile[];
  workloadMix?: FillUpWorkloadMix;
}

type ProjectableMetric = FillUpGuardrailHeadroom["metricKey"];

const PROJECTABLE_METRICS: readonly ProjectableMetric[] = [
  "vcpu-per-core",
  "cpu-demand",
  "total-ram-assigned",
  "high-cpu-site",
  "high-ram-assigned",
];

/**
 * Berechnet reproduzierbare zusätzliche VM-Mengen aus der bereits bewerteten
 * Stunden-/Szenariobasis. Die Funktion kennt weder UI noch Persistenz und
 * kombiniert CPU- und RAM-Maxima bewusst nicht miteinander.
 */
export function calculateFillUpRecommendations(input: FillUpRecommendationEngineInput): FillUpRecommendationAnalysis {
  const warnings = [...input.capacityAnalysis.warnings];
  const profiles = uniqueValidProfiles(input.profiles, warnings);
  const guardrails = collectGuardrails(input.capacityAnalysis, warnings);
  const hardScenarioIsRed = hardScenarios(input.capacityAnalysis).some((scenario) => scenario.status === "red");
  if (hardScenarioIsRed) warnings.push("Mindestens ein verpflichtendes Ausgangsszenario ist bereits rot; zusätzliche Workloads werden mit 0 bewertet.");

  const independentHeadroom = calculateIndependentHeadroom(guardrails);
  const profileRecommendations = profiles.map((profile) => calculateProfileRecommendation(profile, guardrails, hardScenarioIsRed));
  const workloadMixRecommendation = input.workloadMix
    ? calculateMixRecommendation(input.workloadMix, profiles, guardrails, hardScenarioIsRed, warnings)
    : null;

  return { independentHeadroom, guardrails, profileRecommendations, workloadMixRecommendation, warnings: unique(warnings) };
}

/**
 * Sortiert bei gleicher sicherer Zusatzmenge nach dem geringeren relativen
 * N-1-Verlust. Dadurch werden größere, robustere Cluster deterministisch
 * bevorzugt, ohne unterschiedliche Workloadprofile zu vermischen.
 */
export function rankFillUpClusterRecommendations(
  candidates: readonly FillUpClusterRecommendationRankInput[],
): FillUpClusterRecommendationRankInput[] {
  return [...candidates].sort((left, right) => {
    const leftCapacity = left.recommendation.maxAdditionalVms;
    const rightCapacity = right.recommendation.maxAdditionalVms;
    if (leftCapacity === null && rightCapacity !== null) return 1;
    if (leftCapacity !== null && rightCapacity === null) return -1;
    if (leftCapacity !== null && rightCapacity !== null && leftCapacity !== rightCapacity) return rightCapacity - leftCapacity;
    const leftLoss = left.recommendation.relativeN1LossPct;
    const rightLoss = right.recommendation.relativeN1LossPct;
    if (leftLoss === null && rightLoss !== null) return 1;
    if (leftLoss !== null && rightLoss === null) return -1;
    if (leftLoss !== null && rightLoss !== null && leftLoss !== rightLoss) return leftLoss - rightLoss;
    return left.clusterName.localeCompare(right.clusterName, "de-DE") || left.clusterKey.localeCompare(right.clusterKey);
  });
}

function collectGuardrails(analysis: FillUpCapacityAnalysis, warnings: string[]): FillUpGuardrailHeadroom[] {
  const scenarios = [analysis.normal, analysis.n1, analysis.n2, ...analysis.siteFailover].filter((scenario): scenario is FillUpScenarioResult => scenario !== null);
  const guardrails: FillUpGuardrailHeadroom[] = [];
  for (const scenario of scenarios) {
    for (const finding of scenario.findings) {
      if (!PROJECTABLE_METRICS.includes(finding.metricKey as ProjectableMetric)) continue;
      if (scenario.definition.kind === "site-failover" && finding.metricKey !== "high-cpu-site" && finding.metricKey !== "high-ram-assigned") continue;
      const guardrail = toGuardrail(scenario, finding.metricKey as ProjectableMetric, finding.title, finding.status);
      if (!guardrail) continue;
      guardrails.push(guardrail);
      if (scenario.definition.hardLimit && guardrail.available === null) {
        warnings.push(`Für ${guardrail.label} in ${scenario.definition.id} fehlt ein berechenbarer Headroom.`);
      }
    }
  }
  return guardrails;
}

function toGuardrail(
  scenario: FillUpScenarioResult,
  metricKey: ProjectableMetric,
  label: string,
  currentStatus: FillUpGuardrailHeadroom["currentStatus"],
): FillUpGuardrailHeadroom | null {
  const finding = scenario.findings.find((entry) => entry.metricKey === metricKey);
  const danger = finding?.threshold.danger;
  if (danger === null || danger === undefined) return null;

  if (metricKey === "vcpu-per-core") {
    return makeGuardrail(scenario, metricKey, label, currentStatus, "all", scenario.cpuCores === null || finding?.actualValue === null
      ? null
      : scenario.cpuCores * (danger - finding.actualValue), "vCPU");
  }
  if (metricKey === "cpu-demand") {
    return makeGuardrail(scenario, metricKey, label, currentStatus, "all", headroomFromPercent(scenario.cpuCapacityMHz, danger, scenario.cpuDemandMHz), "MHz");
  }
  if (metricKey === "total-ram-assigned") {
    return makeGuardrail(scenario, metricKey, label, currentStatus, "all", headroomFromPercent(scenario.memoryCapacityMiB, danger, scenario.assignedMemoryMiB), "MiB");
  }
  if (metricKey === "high-cpu-site") {
    return makeGuardrail(scenario, metricKey, label, currentStatus, "high", headroomFromPercent(scenario.cpuCapacityMHz, danger, scenario.highCpuDemandMHz), "MHz");
  }
  return makeGuardrail(scenario, metricKey, label, currentStatus, "high", headroomFromPercent(scenario.memoryCapacityMiB, danger, scenario.highAssignedMemoryMiB), "MiB");
}

function makeGuardrail(
  scenario: FillUpScenarioResult,
  metricKey: ProjectableMetric,
  label: string,
  currentStatus: FillUpGuardrailHeadroom["currentStatus"],
  workloadScope: FillUpGuardrailHeadroom["workloadScope"],
  available: number | null,
  unit: FillUpGuardrailHeadroom["unit"],
): FillUpGuardrailHeadroom {
  return {
    scenarioId: scenario.definition.id,
    scenario: scenario.definition.kind,
    hardLimit: scenario.definition.hardLimit,
    metricKey,
    label,
    workloadScope,
    available: available === null || !Number.isFinite(available) ? null : available,
    unit,
    currentStatus,
  };
}

function calculateIndependentHeadroom(guardrails: readonly FillUpGuardrailHeadroom[]): FillUpIndependentHeadroom {
  return {
    vcpu: minimumHeadroom(guardrails, "vcpu-per-core", "vCPU"),
    cpuDemand: minimumHeadroom(guardrails, "cpu-demand", "MHz"),
    memory: minimumHeadroom(guardrails, "total-ram-assigned", "MiB"),
  };
}

function minimumHeadroom(
  guardrails: readonly FillUpGuardrailHeadroom[],
  metricKey: ProjectableMetric,
  unit: FillUpHeadroomValue["unit"],
): FillUpHeadroomValue {
  const relevant = guardrails.filter((guardrail) => guardrail.hardLimit && guardrail.workloadScope === "all" && guardrail.metricKey === metricKey);
  if (!relevant.length || relevant.some((guardrail) => guardrail.available === null)) {
    return { value: null, unit, limitingScenarioId: null, limitingMetricKey: metricKey };
  }
  const limiting = [...relevant].sort((left, right) => left.available! - right.available! || left.scenarioId.localeCompare(right.scenarioId))[0];
  return {
    value: Math.max(0, limiting.available!),
    unit,
    limitingScenarioId: limiting.scenarioId,
    limitingMetricKey: limiting.metricKey,
  };
}

function calculateProfileRecommendation(
  profile: FillUpWorkloadProfile,
  guardrails: readonly FillUpGuardrailHeadroom[],
  hardScenarioIsRed: boolean,
): FillUpProfileRecommendation {
  const relevant = relevantForProfile(guardrails, profile);
  const maxAdditionalVms = calculateMaximum(relevant, (guardrail) => profileConsumption(profile, guardrail));
  const normalOnlyMaxAdditionalVms = calculateMaximum(relevant.filter((guardrail) => guardrail.scenarioId === "normal"), (guardrail) => profileConsumption(profile, guardrail));
  const ordered = orderByMaximum(relevant, (guardrail) => profileConsumption(profile, guardrail));
  return {
    profile,
    maxAdditionalVms: hardScenarioIsRed ? 0 : maxAdditionalVms,
    normalOnlyMaxAdditionalVms: hardScenarioIsRed ? 0 : normalOnlyMaxAdditionalVms,
    limitingGuardrail: ordered[0] ?? null,
    nextGuardrails: ordered.slice(1, 4),
  };
}

function calculateMixRecommendation(
  mix: FillUpWorkloadMix,
  profiles: readonly FillUpWorkloadProfile[],
  guardrails: readonly FillUpGuardrailHeadroom[],
  hardScenarioIsRed: boolean,
  warnings: string[],
): FillUpWorkloadMixRecommendation | null {
  if (!Number.isFinite(mix.highSharePct) || mix.highSharePct < 0 || mix.highSharePct > 100) {
    warnings.push("Der HIGH-Anteil muss zwischen 0 und 100 Prozent liegen.");
    return null;
  }
  const high = profiles.find((profile) => profile.id === mix.highProfileId && profile.workloadClass === "high");
  const std = profiles.find((profile) => profile.id === mix.stdProfileId && profile.workloadClass === "std");
  if (!high || !std) {
    warnings.push("Die HIGH-/STD-Mischung benötigt je ein gültiges Profil der passenden Workloadklasse.");
    return null;
  }
  const relevant = guardrails.filter((guardrail) => guardrail.hardLimit && (guardrail.workloadScope === "all" || mix.highSharePct > 0));
  const maximum = calculateMixMaximum(relevant, high, std, mix.highSharePct);
  const normalOnly = calculateMixMaximum(relevant.filter((guardrail) => guardrail.scenarioId === "normal"), high, std, mix.highSharePct);
  const safeMaximum = hardScenarioIsRed ? 0 : maximum;
  const safeNormal = hardScenarioIsRed ? 0 : normalOnly;
  const ordered = orderMixGuardrails(relevant, high, std, mix.highSharePct);
  const highVmCount = safeMaximum === null ? null : highCount(safeMaximum, mix.highSharePct);
  const relativeN1LossPct = safeMaximum === null || safeNormal === null || safeNormal <= 0
    ? null
    : Math.max(0, (safeNormal - safeMaximum) / safeNormal * 100);
  return {
    mix,
    maxAdditionalVms: safeMaximum,
    normalOnlyMaxAdditionalVms: safeNormal,
    highVmCount,
    stdVmCount: highVmCount === null || safeMaximum === null ? null : safeMaximum - highVmCount,
    relativeN1LossPct,
    limitingGuardrail: ordered[0] ?? null,
    nextGuardrails: ordered.slice(1, 4),
  };
}

function relevantForProfile(guardrails: readonly FillUpGuardrailHeadroom[], profile: FillUpWorkloadProfile): FillUpGuardrailHeadroom[] {
  return guardrails.filter((guardrail) => guardrail.hardLimit && (guardrail.workloadScope === "all" || profile.workloadClass === "high"));
}

function calculateMaximum(
  guardrails: readonly FillUpGuardrailHeadroom[],
  consumption: (guardrail: FillUpGuardrailHeadroom) => number,
): number | null {
  if (!guardrails.length || guardrails.some((guardrail) => guardrail.available === null)) return null;
  return Math.max(0, Math.min(...guardrails.map((guardrail) => Math.floor(Math.max(0, guardrail.available!) / consumption(guardrail)))));
}

function calculateMixMaximum(
  guardrails: readonly FillUpGuardrailHeadroom[],
  high: FillUpWorkloadProfile,
  std: FillUpWorkloadProfile,
  highSharePct: number,
): number | null {
  if (!guardrails.length || guardrails.some((guardrail) => guardrail.available === null)) return null;
  const upperBound = Math.min(...guardrails.map((guardrail) => {
    const average = highSharePct / 100 * profileConsumption(high, guardrail)
      + (guardrail.workloadScope === "all" ? (1 - highSharePct / 100) * profileConsumption(std, guardrail) : 0);
    return average === 0 ? Number.MAX_SAFE_INTEGER : Math.floor(Math.max(0, guardrail.available!) / average) + 1;
  }));
  let lower = 0;
  let upper = Math.max(0, upperBound);
  while (lower < upper) {
    const candidate = Math.ceil((lower + upper) / 2);
    if (guardrails.every((guardrail) => mixConsumption(high, std, highSharePct, guardrail, candidate) <= guardrail.available! + 1e-9)) lower = candidate;
    else upper = candidate - 1;
  }
  return lower;
}

function orderByMaximum(
  guardrails: readonly FillUpGuardrailHeadroom[],
  consumption: (guardrail: FillUpGuardrailHeadroom) => number,
): FillUpGuardrailHeadroom[] {
  return [...guardrails].sort((left, right) => {
    const leftMaximum = left.available === null ? Number.POSITIVE_INFINITY : Math.floor(Math.max(0, left.available) / consumption(left));
    const rightMaximum = right.available === null ? Number.POSITIVE_INFINITY : Math.floor(Math.max(0, right.available) / consumption(right));
    return leftMaximum - rightMaximum || left.scenarioId.localeCompare(right.scenarioId) || left.metricKey.localeCompare(right.metricKey);
  });
}

function orderMixGuardrails(
  guardrails: readonly FillUpGuardrailHeadroom[],
  high: FillUpWorkloadProfile,
  std: FillUpWorkloadProfile,
  highSharePct: number,
): FillUpGuardrailHeadroom[] {
  return [...guardrails].sort((left, right) => {
    const leftMaximum = calculateMixMaximum([left], high, std, highSharePct) ?? Number.POSITIVE_INFINITY;
    const rightMaximum = calculateMixMaximum([right], high, std, highSharePct) ?? Number.POSITIVE_INFINITY;
    return leftMaximum - rightMaximum || left.scenarioId.localeCompare(right.scenarioId) || left.metricKey.localeCompare(right.metricKey);
  });
}

function profileConsumption(profile: FillUpWorkloadProfile, guardrail: FillUpGuardrailHeadroom): number {
  if (guardrail.metricKey === "vcpu-per-core") return profile.vcpu;
  if (guardrail.metricKey === "cpu-demand" || guardrail.metricKey === "high-cpu-site") return profile.cpuDemandP95MHz;
  return profile.memoryMiB;
}

function mixConsumption(
  high: FillUpWorkloadProfile,
  std: FillUpWorkloadProfile,
  highSharePct: number,
  guardrail: FillUpGuardrailHeadroom,
  total = 1,
): number {
  const highVms = highCount(total, highSharePct);
  const stdVms = total - highVms;
  const highConsumption = profileConsumption(high, guardrail) * highVms;
  return guardrail.workloadScope === "high" ? highConsumption : highConsumption + profileConsumption(std, guardrail) * stdVms;
}

function highCount(total: number, highSharePct: number): number {
  return highSharePct === 0 ? 0 : Math.ceil(total * highSharePct / 100 - 1e-12);
}

function headroomFromPercent(capacity: number | null, dangerPct: number, current: number | null): number | null {
  return capacity === null || current === null ? null : capacity * dangerPct / 100 - current;
}

function hardScenarios(analysis: FillUpCapacityAnalysis): FillUpScenarioResult[] {
  return [analysis.normal, analysis.n1, analysis.n2, ...analysis.siteFailover]
    .filter((scenario): scenario is FillUpScenarioResult => scenario !== null && scenario.definition.hardLimit);
}

function uniqueValidProfiles(profiles: readonly FillUpWorkloadProfile[], warnings: string[]): FillUpWorkloadProfile[] {
  const ids = new Set<string>();
  return profiles.filter((profile) => {
    const valid = Boolean(profile.id.trim() && profile.name.trim())
      && (profile.workloadClass === "high" || profile.workloadClass === "std")
      && [profile.vcpu, profile.memoryMiB, profile.cpuDemandP95MHz].every((value) => Number.isFinite(value) && value > 0)
      && !ids.has(profile.id);
    if (!valid) warnings.push(`Ungültiges oder doppeltes Workloadprofil „${profile.name || profile.id || "ohne Namen"}“ wurde ignoriert.`);
    else ids.add(profile.id);
    return valid;
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
