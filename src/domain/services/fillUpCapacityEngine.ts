import type {
  CapacityFinding,
  CapacityMetricObservation,
  CapacityPolicy,
  CapacityStatus,
  FillUpCapacityAnalysis,
  FillUpHour,
  FillUpHost,
  FillUpPlacementResult,
  FillUpScenarioDefinition,
  FillUpScenarioResult,
  FillUpVm,
  VropsTimeSeriesConfidenceLevel,
} from "@/domain/models/types";
import { evaluateCapacityFindings } from "@/domain/services/capacityFindingEngine";
import { getPolicyThreshold } from "@/domain/services/capacityPolicyService";
import { createFillUpScenarioDefinitions } from "@/domain/services/fillUpScenarioEngine";

export interface FillUpCapacityEngineInput {
  policy: CapacityPolicy;
  hosts: readonly FillUpHost[];
  vms: readonly FillUpVm[];
  hours: readonly FillUpHour[];
  confidence: VropsTimeSeriesConfidenceLevel;
  includeN2?: boolean;
}

/**
 * Bewertet den vorhandenen Clusterzustand stündlich für Normalbetrieb, jeden
 * N-1-/N-2-Ausfall sowie beide Site-Ausfallrichtungen. Zusätzlichen Workload
 * berechnet bewusst erst Phase 6; diese Engine liefert die belastbare Basis.
 */
export function analyzeFillUpCapacity(input: FillUpCapacityEngineInput): FillUpCapacityAnalysis {
  const scenarios = createFillUpScenarioDefinitions(input.hosts, input.policy, input.includeN2);
  const warnings: string[] = [];
  const activeVms = input.vms.filter((vm) => isPoweredOn(vm.powerState));
  const highVms = activeVms.filter((vm) => vm.workloadClass === "high");
  const stdVms = activeVms.filter((vm) => vm.workloadClass === "std");
  const context: EvaluationContext = {
    all: createVmScope(activeVms),
    high: createVmScope(highVms),
    std: createVmScope(stdVms),
  };
  if (activeVms.some((vm) => vm.workloadClass === "unknown")) warnings.push("Mindestens eine eingeschaltete VM hat keinen HIGH-/STD-Resource-Pool.");
  if (input.hosts.some((host) => !host.siteId)) warnings.push("Mindestens ein Host hat keine Site-Zuordnung; Site-Failover bleibt unvollständig.");
  if (input.hours.length === 0) warnings.push("Es liegen keine stündlichen Kapazitätswerte vor.");

  const evaluate = (definition: FillUpScenarioDefinition) => evaluateScenario(definition, input, context);
  const normal = evaluate(scenarios.normal);
  const n1Results = scenarios.n1.map(evaluate);
  const n2Results = scenarios.n2.map(evaluate);
  const siteResults = scenarios.siteFailover.map(evaluate);
  const n1 = selectWorstScenario(n1Results);
  const n2 = selectWorstScenario(n2Results);
  if (normal.status === "red") warnings.push("Der Normalbetrieb liegt bereits außerhalb der Policy; zusätzliche Kapazität wird nicht als sicher empfohlen.");
  if (normal.status === "unknown") warnings.push("Der Normalbetrieb ist wegen fehlender Kapazitäts- oder Beziehungsdaten nicht vollständig bewertbar.");

  return { normal, n1, n2, siteFailover: siteResults, warnings };
}

function evaluateScenario(
  definition: FillUpScenarioDefinition,
  input: FillUpCapacityEngineInput,
  context: EvaluationContext,
): FillUpScenarioResult {
  const removedHostKeys = new Set(definition.removedHostKeys);
  const remainingHosts = input.hosts.filter((host) => !removedHostKeys.has(host.hostKey));
  const scoped = definition.workloadScope === "high" ? context.high : context.all;
  const candidates = input.hours.map((hour) => evaluateHour(definition, input, remainingHosts, scoped, context, hour));
  const worst = selectWorstCandidate(candidates);
  if (!worst) return emptyScenarioResult(definition);
  return {
    definition,
    status: worst.status,
    worstTimestampUtc: worst.hour.timestampUtc,
    findings: worst.findings,
    placement: worst.placement,
    usedRvtoolsFallback: worst.usedRvtoolsFallback,
    cpuCores: worst.cpuCores,
    cpuCapacityMHz: worst.cpuCapacityMHz,
    memoryCapacityMiB: worst.memoryCapacityMiB,
    cpuDemandMHz: worst.cpuDemandMHz,
    highCpuDemandMHz: worst.highCpuDemandMHz,
    stdCpuDemandMHz: worst.stdCpuDemandMHz,
    assignedMemoryMiB: worst.assignedMemoryMiB,
    highAssignedMemoryMiB: worst.highAssignedMemoryMiB,
  };
}

interface VmScope {
  vms: readonly FillUpVm[];
  objectKeys: string[];
  assignedMemoryMiB: number;
  totalVcpu: number;
}

interface EvaluationContext {
  all: VmScope;
  high: VmScope;
  std: VmScope;
}

function createVmScope(vms: readonly FillUpVm[]): VmScope {
  return {
    vms,
    objectKeys: vms.map((vm) => vm.objectKey),
    assignedMemoryMiB: vms.reduce((sum, vm) => sum + vm.configuredMemoryMiB, 0),
    totalVcpu: vms.reduce((sum, vm) => sum + vm.vcpu, 0),
  };
}

interface HourCandidate {
  hour: FillUpHour;
  status: CapacityStatus;
  score: number;
  findings: CapacityFinding[];
  placement: FillUpPlacementResult;
  usedRvtoolsFallback: boolean;
  cpuCores: number | null;
  cpuCapacityMHz: number | null;
  memoryCapacityMiB: number | null;
  cpuDemandMHz: number | null;
  highCpuDemandMHz: number | null;
  stdCpuDemandMHz: number | null;
  assignedMemoryMiB: number | null;
  highAssignedMemoryMiB: number | null;
}

function evaluateHour(
  definition: FillUpScenarioDefinition,
  input: FillUpCapacityEngineInput,
  remainingHosts: readonly FillUpHost[],
  scoped: VmScope,
  context: EvaluationContext,
  hour: FillUpHour,
): HourCandidate {
  const capacity = calculateCapacity(remainingHosts, hour, input.policy);
  const vmDemand = (vm: FillUpVm) => hour.vmCpuDemandMHzByVm?.[vm.objectKey] ?? vm.fallbackCpuDemandMHz;
  const vmReady = (vm: FillUpVm) => hour.vmCpuReadyPctByVm?.[vm.objectKey] ?? null;
  const scopedVmDemand = sumVmValues(scoped.vms, vmDemand);
  const highCpuDemandMHz = sumVmValues(context.high.vms, vmDemand);
  const stdCpuDemandMHz = sumVmValues(context.std.vms, vmDemand);
  const cpuDemandMHz = definition.workloadScope === "all"
    ? (hour.clusterCpuDemandMHz ?? scopedVmDemand)
    : highCpuDemandMHz;
  const assignedMemoryMiB = scoped.assignedMemoryMiB;
  const highAssignedMemoryMiB = context.high.assignedMemoryMiB;
  const maxReady = maxVmValue(scoped.vms, vmReady);
  const totalVcpu = scoped.totalVcpu;
  const observations = buildObservations({
    definition,
    policy: input.policy,
    capacity,
    cpuDemandMHz,
    assignedMemoryMiB,
    highCpuDemandMHz,
    highAssignedMemoryMiB,
    totalVcpu,
    maxReady,
    contention: hour.clusterCpuContentionPct,
    memoryUtilizationMiB: hour.clusterMemoryUtilizationMiB,
    affectedObjectKeys: scoped.objectKeys,
  });
  const findings = evaluateCapacityFindings(input.policy, observations, input.confidence);
  const placement = simulatePlacement(remainingHosts, hour, scoped.vms, input.policy, vmDemand);
  if (!placement.placeable) findings.push(placementFinding(input.policy, definition, input.confidence, placement.unplacedVmKeys));
  if (placement.oversizedVmKeys.length) findings.push(oversizedVmFinding(input.policy, definition, input.confidence, placement.oversizedVmKeys));
  const status = scenarioStatus(findings, placement);
  return {
    hour,
    status,
    score: severityScore(status, findings),
    findings,
    placement,
    usedRvtoolsFallback: capacity.usedFallback || (definition.workloadScope === "all" && hour.clusterCpuDemandMHz === null),
    cpuCores: capacity.cpuCores,
    cpuCapacityMHz: capacity.cpuCapacityMHz,
    memoryCapacityMiB: capacity.memoryCapacityMiB,
    cpuDemandMHz,
    highCpuDemandMHz,
    stdCpuDemandMHz,
    assignedMemoryMiB,
    highAssignedMemoryMiB,
  };
}

function sumVmValues(vms: readonly FillUpVm[], getValue: (vm: FillUpVm) => number | null): number | null {
  let sum = 0;
  for (const vm of vms) {
    const value = getValue(vm);
    if (value === null || !Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function maxVmValue(vms: readonly FillUpVm[], getValue: (vm: FillUpVm) => number | null): number | null {
  let maximum: number | null = null;
  for (const vm of vms) {
    const value = getValue(vm);
    if (value !== null && Number.isFinite(value)) maximum = maximum === null ? value : Math.max(maximum, value);
  }
  return maximum;
}

function buildObservations(input: {
  definition: FillUpScenarioDefinition;
  policy: CapacityPolicy;
  capacity: ReturnType<typeof calculateCapacity>;
  cpuDemandMHz: number | null;
  assignedMemoryMiB: number | null;
  highCpuDemandMHz: number | null;
  highAssignedMemoryMiB: number | null;
  totalVcpu: number;
  maxReady: number | null;
  contention: number | null;
  memoryUtilizationMiB: number | null;
  affectedObjectKeys: string[];
}): CapacityMetricObservation[] {
  const { definition, policy, capacity, affectedObjectKeys } = input;
  const observation = (key: string, label: string, value: number | null, source: string): CapacityMetricObservation | null => {
    const threshold = getPolicyThreshold(policy, key, definition.kind === "site-failover" ? "site-failover" : definition.kind);
    return threshold ? { key, label, value, threshold, scenario: definition.kind === "site-failover" ? "site-failover" : definition.kind, dataSource: source, affectedObjectKeys } : null;
  };
  const ratio = (value: number | null, total: number | null) => value === null || total === null || total <= 0 ? null : value / total * 100;
  const values = [
    observation("vcpu-per-core", "vCPU pro Core", capacity.cpuCores === null ? null : input.totalVcpu / capacity.cpuCores, "RVTools VM-Konfiguration / Host-Cores"),
    observation("cpu-demand", "CPU Demand", ratio(input.cpuDemandMHz, capacity.cpuCapacityMHz), "vROps Cluster CPU Demand / Hostkapazität"),
    observation("total-ram-assigned", "Zugewiesener RAM", ratio(input.assignedMemoryMiB, capacity.memoryCapacityMiB), "RVTools VM-RAM / Hostkapazität"),
    observation("cpu-ready", "CPU Ready", input.maxReady, "vROps VM CPU Ready"),
    observation("cpu-contention", "CPU Contention", input.contention, "vROps Cluster CPU Contention"),
    observation("memory-utilization", "Memory Utilization", ratio(input.memoryUtilizationMiB, capacity.memoryCapacityMiB), "vROps Cluster Memory Utilization / Hostkapazität"),
  ];
  if (definition.kind === "site-failover") {
    values.push(
      observation("high-cpu-site", "HIGH CPU Site-Failover", ratio(input.highCpuDemandMHz, capacity.cpuCapacityMHz), "vROps VM-Demand HIGH / Restkapazität"),
      observation("high-ram-assigned", "HIGH RAM Site-Failover", ratio(input.highAssignedMemoryMiB, capacity.memoryCapacityMiB), "RVTools HIGH-RAM / Restkapazität"),
    );
  }
  return values.filter((value): value is CapacityMetricObservation => value !== null);
}

function calculateCapacity(hosts: readonly FillUpHost[], hour: FillUpHour, policy: CapacityPolicy) {
  let usedFallback = false;
  let cpuCapacityMHz = 0;
  let memoryCapacityMiB = 0;
  let cpuCores = 0;
  let missingCapacity = false;
  for (const host of hosts) {
    const values = hour.hostCapacities[host.hostKey];
    const cpu = values?.cpuCapacityMHz ?? host.fallbackCpuCapacityMHz;
    const memory = values?.memoryCapacityMiB ?? host.fallbackMemoryCapacityMiB;
    if (values?.cpuCapacityMHz === null || values?.cpuCapacityMHz === undefined || values?.memoryCapacityMiB === null || values?.memoryCapacityMiB === undefined) {
      usedFallback ||= cpu === host.fallbackCpuCapacityMHz || memory === host.fallbackMemoryCapacityMiB;
    }
    if (cpu === null || memory === null) missingCapacity = true;
    else {
      cpuCapacityMHz += cpu;
      memoryCapacityMiB += memory;
    }
    if (host.cpuCores === null) missingCapacity = true;
    else cpuCores += host.cpuCores;
  }
  if (missingCapacity || hosts.length === 0) return { cpuCapacityMHz: null, memoryCapacityMiB: null, cpuCores: null, usedFallback };
  return {
    cpuCapacityMHz: cpuCapacityMHz * (1 - policy.cpuSafetyBufferPct / 100),
    memoryCapacityMiB: Math.max(0, memoryCapacityMiB - policy.ramSystemReserveMiBPerHost * hosts.length) * (1 - policy.ramSafetyBufferPct / 100),
    cpuCores,
    usedFallback,
  };
}

function simulatePlacement(
  hosts: readonly FillUpHost[],
  hour: FillUpHour,
  vms: readonly FillUpVm[],
  policy: CapacityPolicy,
  getDemand: (vm: FillUpVm) => number | null,
): FillUpPlacementResult {
  const capacities = hosts.map((host) => {
    const values = hour.hostCapacities[host.hostKey];
    const cpu = values?.cpuCapacityMHz ?? host.fallbackCpuCapacityMHz;
    const memory = values?.memoryCapacityMiB ?? host.fallbackMemoryCapacityMiB;
    return cpu === null || memory === null ? null : { hostKey: host.hostKey, cpu: cpu * (1 - policy.cpuSafetyBufferPct / 100), memory: Math.max(0, memory - policy.ramSystemReserveMiBPerHost) * (1 - policy.ramSafetyBufferPct / 100) };
  }).filter((value): value is { hostKey: string; cpu: number; memory: number } => value !== null);
  const oversizedVmKeys = vms.filter((vm) => capacities.every((host) => vm.configuredMemoryMiB > host.memory * policy.maxSingleVmHostRamPct / 100 || (getDemand(vm) ?? Number.POSITIVE_INFINITY) > host.cpu * policy.maxSingleVmHostCpuPct / 100)).map((vm) => vm.objectKey);
  const unplacedVmKeys: string[] = [];
  const ordered = [...vms].sort((left, right) => right.configuredMemoryMiB - left.configuredMemoryMiB || (getDemand(right) ?? 0) - (getDemand(left) ?? 0));
  for (const vm of ordered) {
    const demand = getDemand(vm);
    if (demand === null) {
      unplacedVmKeys.push(vm.objectKey);
      continue;
    }
    const target = capacities.find((host) => host.memory >= vm.configuredMemoryMiB && host.cpu >= demand);
    if (!target) unplacedVmKeys.push(vm.objectKey);
    else {
      target.memory -= vm.configuredMemoryMiB;
      target.cpu -= demand;
    }
  }
  return { placeable: unplacedVmKeys.length === 0, unplacedVmKeys, oversizedVmKeys };
}

function selectWorstCandidate(candidates: readonly HourCandidate[]): HourCandidate | null {
  return candidates.reduce<HourCandidate | null>((worst, candidate) => !worst || candidate.score > worst.score ? candidate : worst, null);
}

function selectWorstScenario(results: readonly FillUpScenarioResult[]): FillUpScenarioResult | null {
  return results.reduce<FillUpScenarioResult | null>((worst, result) => !worst || statusRank(result.status) > statusRank(worst.status) ? result : worst, null);
}

function scenarioStatus(findings: readonly CapacityFinding[], placement: FillUpPlacementResult): CapacityStatus {
  if (!placement.placeable) return "red";
  if (findings.some((finding) => finding.status === "unknown")) return "unknown";
  if (findings.some((finding) => finding.status === "red" && finding.metricKey !== "single-vm-host")) return "red";
  if (findings.some((finding) => finding.status === "yellow")) return "yellow";
  return "green";
}

function severityScore(status: CapacityStatus, findings: readonly CapacityFinding[]): number {
  const ratios = findings.map((finding) => finding.actualValue !== null && finding.threshold.danger ? finding.actualValue / finding.threshold.danger : 0);
  return statusRank(status) * 10_000 + Math.max(0, ...ratios);
}

function statusRank(status: CapacityStatus): number {
  return ({ green: 0, yellow: 1, red: 2, unknown: 3 } as const)[status];
}

function emptyScenarioResult(definition: FillUpScenarioDefinition): FillUpScenarioResult {
  return {
    definition,
    status: "unknown",
    worstTimestampUtc: null,
    findings: [],
    placement: { placeable: false, unplacedVmKeys: [], oversizedVmKeys: [] },
    usedRvtoolsFallback: false,
    cpuCores: null,
    cpuCapacityMHz: null,
    memoryCapacityMiB: null,
    cpuDemandMHz: null,
    highCpuDemandMHz: null,
    stdCpuDemandMHz: null,
    assignedMemoryMiB: null,
    highAssignedMemoryMiB: null,
  };
}

function placementFinding(policy: CapacityPolicy, definition: FillUpScenarioDefinition, confidence: VropsTimeSeriesConfidenceLevel, objectKeys: string[]): CapacityFinding {
  return { id: `${policy.id}:v${policy.version}:${definition.id}:placement`, status: "red", title: "VM-Platzierbarkeit", metricKey: "placement", actualValue: objectKeys.length, threshold: { warning: 0, danger: 0, unit: "MiB" }, scenario: definition.kind === "site-failover" ? "site-failover" : definition.kind, dataSource: "First-Fit Decreasing auf verbleibenden Hostkapazitäten", affectedObjectKeys: objectKeys, confidence, policyId: policy.id, policyVersion: policy.version };
}

function oversizedVmFinding(policy: CapacityPolicy, definition: FillUpScenarioDefinition, confidence: VropsTimeSeriesConfidenceLevel, objectKeys: string[]): CapacityFinding {
  return { id: `${policy.id}:v${policy.version}:${definition.id}:large-vm`, status: "red", title: "Große Einzel-VM", metricKey: "single-vm-host", actualValue: objectKeys.length, threshold: { warning: null, danger: null, unit: "%" }, scenario: definition.kind === "site-failover" ? "site-failover" : definition.kind, dataSource: "RVTools VM-Konfiguration / einzelne Resthostkapazität", affectedObjectKeys: objectKeys, confidence, policyId: policy.id, policyVersion: policy.version };
}

function isPoweredOn(powerState: string | null): boolean {
  return powerState?.trim().toLocaleLowerCase("en-US") === "poweredon";
}
