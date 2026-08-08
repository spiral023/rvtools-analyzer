/**
 * Gemeinsame Testbausteine für VM-Profile und Rightsizing-Kandidaten.
 *
 * Diese Strukturen wurden zuvor in sechs Testdateien parallel aufgebaut, sodass jedes
 * neue Pflichtfeld sechs Stellen gleichzeitig brach. Die Fabriken setzen bewusst
 * neutrale Werte: `null` überall dort, wo eine Kennzahl fehlen darf, damit ein Test nur
 * die Felder benennt, um die es ihm tatsächlich geht.
 */
import type {
  VmCpuCapacitySignals,
  VmRightsizingCandidate,
  VmWorkloadClassificationSignals,
  VmWorkloadProfile,
  VmWorkloadProfileMetricStats,
} from "@/domain/models/types";
import { EMPTY_WORKLOAD_TREND } from "@/domain/services/vmWorkloadTrendService";

export function metricStatsFixture(
  overrides: Partial<VmWorkloadProfileMetricStats> = {},
): VmWorkloadProfileMetricStats {
  return {
    expectedSlots: 168,
    sampleCount: 168,
    coverageRatio: 1,
    average: null,
    p50: null,
    p95: null,
    p995: null,
    p99: null,
    maximum: null,
    ...overrides,
  };
}

export function classificationSignalsFixture(
  overrides: Partial<VmWorkloadClassificationSignals> = {},
): VmWorkloadClassificationSignals {
  return {
    coefficientOfVariation: null,
    activeHourSharePct: null,
    dutyCyclePct: null,
    baselineRatio: null,
    utilizationP95Pct: null,
    dailyRepeatability: null,
    weeklyRepeatability: null,
    weeklyPeakVariation: null,
    businessHoursConcentration: null,
    nightConcentration: null,
    weekendConcentration: null,
    recentPeakSharePct: null,
    recentPeakRunP90Hours: null,
    shapeFitScore: null,
    confidenceScore: null,
    ...overrides,
  };
}

export function capacitySignalsFixture(
  overrides: Partial<VmCpuCapacitySignals> = {},
): VmCpuCapacitySignals {
  return {
    totalCapacityMHz: null,
    configuredVcpu: null,
    mhzPerVcpu: null,
    hoursAboveCapacity75: null,
    hoursAboveCapacity90: null,
    costopUnderLoadP95Pct: null,
    loadHourCount: null,
    concentrationIndexP90: null,
    effectiveCoresMax: null,
    singleCoreBoundHours: null,
    ...overrides,
  };
}

export function vmWorkloadProfileFixture(
  overrides: Partial<VmWorkloadProfile> & { objectKey: string },
): VmWorkloadProfile {
  return {
    rvtoolsObjectKey: overrides.objectKey,
    vmName: overrides.objectKey,
    clusterKey: "cluster-1",
    clusterName: "Cluster A",
    resourcePool: "Pool A",
    hostKey: "host-1",
    host: "esx01",
    vcpu: 4,
    configuredCpuCapacityMHz: 4_000,
    configuredMemoryMiB: 8_192,
    powerState: "poweredOn",
    workloadClass: "std",
    timezone: "Europe/Vienna",
    hourly: [],
    demand: metricStatsFixture(),
    demandMax: metricStatsFixture(),
    ready: metricStatsFixture(),
    capacitySignals: capacitySignalsFixture(),
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    signals: classificationSignalsFixture(),
    cpuTrend: EMPTY_WORKLOAD_TREND,
    memoryTrend: EMPTY_WORKLOAD_TREND,
    ...overrides,
  };
}

export function rightsizingCandidateFixture(
  overrides: Partial<VmRightsizingCandidate> & { objectKey: string },
): VmRightsizingCandidate {
  return {
    rvtoolsObjectKey: overrides.objectKey,
    vmName: overrides.objectKey,
    clusterKey: "cluster-1",
    clusterName: "Cluster A",
    resourcePool: "Pool A",
    hostName: "esx01",
    powerState: "poweredOn",
    vcpu: 4,
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    trend: EMPTY_WORKLOAD_TREND,
    rightsizingLevel: "balanced",
    demand: metricStatsFixture(),
    ready: metricStatsFixture(),
    mhzPerCore: 1_000,
    mhzPerVcpu: 1_000,
    usedVcpuEquivalentP95: 1,
    usedVcpuEquivalentPeak: null,
    demandBasedVcpu: null,
    recommendationWithheldReason: null,
    recommendedVcpu: null,
    reclaimableVcpu: 0,
    additionalVcpu: 0,
    flags: {
      manyVcpuLowDemand: false,
      highCpuReady: false,
      costopUnderLoad: false,
      singleCoreBound: false,
      concentratedOnFewCores: false,
      sustainedNearCapacity: false,
      risingTrend: false,
    },
    ...overrides,
  };
}
