import type {
  NormalizedHost,
  NormalizedVm,
  VmBehaviorClass,
  VmWorkloadClassificationSignals,
  VmWorkloadHourlyPoint,
  VmWorkloadProfile,
  VmWorkloadProfileMetricStats,
  VropsTimeSeriesChunk,
  VropsTimeSeriesConfidenceLevel,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
} from "@/domain/models/types";
import { readVropsTimeSeriesMetric } from "@/domain/services/vropsTimeSeriesSeriesReader";
import { average, percentile, standardDeviation } from "@/lib/statistics";

const HOUR_MS = 60 * 60 * 1000;
const hourGridFormatterByTimezone = new Map<string, Intl.DateTimeFormat>();

export const VM_BEHAVIOR_CLASS_LABEL: Record<VmBehaviorClass, string> = {
  unclassified: "Nicht berechenbar",
  "constant-load": "Dauerlast",
  "business-hours": "Business-Hours",
  "night-batch": "Nächtlicher Batch",
  "weekend-load": "Wochenendlast",
  bursty: "Bursty",
  "variable-load": "Variable Last",
  "low-utilization": "Gering genutzt",
  irregular: "Unregelmäßig",
};

/* ------------------------------------------------------------------ */
/*  Schwellenwerte der Klassifikation – bewusst benannt und an einer   */
/*  Stelle gesammelt, damit die Herleitung nachvollziehbar bleibt.     */
/* ------------------------------------------------------------------ */
/** Robuster als das Maximum: einzelne Ausreißer verhindern keine Low-Utilization-Einstufung. */
const LOW_UTILIZATION_P95_MAX_MHZ = 100;
const LOW_UTILIZATION_P95_CAPACITY_MAX_PCT = 10;
const BURSTY_ACTIVE_HOUR_SHARE_MAX_PCT = 30;
/** Verhältnis Median/P95: liegt der Median deutlich unter dem P95, dominieren Spitzen statt einer Grundlast. */
const BURSTY_MEDIAN_TO_P95_MAX = 0.4;
const BURSTY_CV_MIN = 0.8;
/** Variationskoeffizient, unterhalb dessen die stündliche Last als annähernd konstant gilt. */
const CONSTANT_LOAD_CV_MAX = 0.5;
const CONSTANT_LOAD_ACTIVE_HOUR_SHARE_MIN_PCT = 70;
/** Konzentration = Demand-Anteil / Stunden-Anteil eines Zeitfensters; 1 = gleichverteilt über die Woche. */
const CALENDAR_CONCENTRATION_MIN = 1.35;
const CALENDAR_DOMINANCE_MARGIN_MIN = 0.15;
const IRREGULAR_CV_MIN = 0.5;
const IRREGULAR_DAILY_REPEATABILITY_MAX = 0.3;
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 18;
const NIGHT_HOUR_END = 6;

/** Ab dieser Datenabdeckung bzw. Stundenzahl gilt eine Klassifikation als vertrauenswürdig genug für „hoch“/„mittel“. */
const HIGH_CONFIDENCE_COVERAGE_RATIO = 0.9;
const HIGH_CONFIDENCE_MIN_SAMPLES = 96;
const MEDIUM_CONFIDENCE_COVERAGE_RATIO = 0.5;
const MEDIUM_CONFIDENCE_MIN_SAMPLES = 24;
const CLASSIFICATION_MIN_COVERAGE_RATIO = 0.5;
const CLASSIFICATION_MIN_SAMPLES = 24;

interface HourGridEntry {
  timestampUtc: number;
  dayKey: string;
  hour: number;
  isWeekend: boolean;
}

export interface BuildVmWorkloadProfilesInput {
  import: VropsTimeSeriesImport;
  objects: readonly VropsTimeSeriesImportedObject[];
  chunks: readonly VropsTimeSeriesChunk[];
  vms: readonly NormalizedVm[];
  hosts?: readonly NormalizedHost[];
}

/**
 * Leitet für jede eindeutig zugeordnete VM ein Sieben-Tage-CPU-Profil samt
 * Verhaltensklasse ab. Reine Funktion ohne UI- oder Persistenzbezug; wird von
 * VM-Profilen und Rightsizing-Kandidaten gemeinsam genutzt. Cluster- und
 * Hostname stammen direkt aus RVTools; `clusterKey`/`hostKey` sind die beim
 * Import bereits aufgelösten, global eindeutigen Schlüssel.
 */
export function buildVmWorkloadProfiles(input: BuildVmWorkloadProfilesInput): VmWorkloadProfile[] {
  const hourGrid = buildHourGrid(input.import);
  const vmByKey = new Map(input.vms.map((vm) => [vm.vmKey, vm]));
  const hostByKey = new Map((input.hosts ?? []).map((host) => [host.hostKey, host]));

  const profiles = input.objects
    .flatMap((object): VmWorkloadProfile[] => {
      if (object.objectType !== "vm" || object.matchStatus !== "matched" || !object.rvtoolsObjectKey) return [];
      const vm = vmByKey.get(object.rvtoolsObjectKey!);
      if (!vm) return [];
      const demandSeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuDemandAvgMHz");
      const readySeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuReadyMaxPct");
      const hourly: VmWorkloadHourlyPoint[] = hourGrid.map((entry) => ({
        timestampUtc: entry.timestampUtc,
        cpuDemandMHz: finiteOrNull(demandSeries.get(entry.timestampUtc)),
        cpuReadyPct: finiteOrNull(readySeries.get(entry.timestampUtc)),
      }));
      const demand = buildMetricStats(hourly.map((point) => point.cpuDemandMHz), input.import.expectedSlots);
      const ready = buildMetricStats(hourly.map((point) => point.cpuReadyPct), input.import.expectedSlots);
      const host = object.hostKey ? hostByKey.get(object.hostKey) : undefined;
      const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
      const configuredCpuCapacityMHz = mhzPerCore !== null && vm.cpuCount ? mhzPerCore * vm.cpuCount : null;
      const { behaviorClass, signals } = classifyVmBehavior(hourGrid, demandSeries, { configuredCpuCapacityMHz });
      return [{
        objectKey: object.objectKey,
        rvtoolsObjectKey: object.rvtoolsObjectKey,
        vmName: vm.vmName,
        clusterKey: object.clusterKey,
        clusterName: vm.cluster,
        hostKey: object.hostKey,
        host: vm.host,
        vcpu: vm.cpuCount,
        configuredMemoryMiB: vm.memoryMiB,
        powerState: object.powerState,
        workloadClass: object.workloadClass ?? "unknown",
        hourly,
        demand,
        ready,
        behaviorClass,
        confidence: determineProfileConfidence(demand.coverageRatio, demand.sampleCount),
        signals,
      }];
    });

  return profiles.sort((left, right) => left.vmName.localeCompare(right.vmName, "de-DE"));
}

function buildMetricStats(values: readonly (number | null)[], expectedSlots: number): VmWorkloadProfileMetricStats {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    expectedSlots,
    sampleCount: finite.length,
    coverageRatio: expectedSlots > 0 ? finite.length / expectedSlots : 0,
    average: average(finite),
    p50: percentile(finite, 0.5),
    p95: percentile(finite, 0.95),
    maximum: finite.length ? Math.max(...finite) : null,
  };
}

/** Vertrauensniveau folgt ausschließlich der Datenabdeckung; die Musterschwellen selbst enthalten keine Unsicherheit. */
export function determineProfileConfidence(coverageRatio: number, sampleCount: number): VropsTimeSeriesConfidenceLevel {
  if (sampleCount === 0) return "not-computable";
  if (coverageRatio < MEDIUM_CONFIDENCE_COVERAGE_RATIO || sampleCount < MEDIUM_CONFIDENCE_MIN_SAMPLES) return "low";
  if (coverageRatio < HIGH_CONFIDENCE_COVERAGE_RATIO || sampleCount < HIGH_CONFIDENCE_MIN_SAMPLES) return "medium";
  return "high";
}

/** Berechnet Lokalzeit-Stunde und Wochenendflag je Zeitschlitz einmal für den ganzen Import statt je VM. */
export function buildHourGrid(importMeta: VropsTimeSeriesImport): HourGridEntry[] {
  let formatter = hourGridFormatterByTimezone.get(importMeta.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: importMeta.timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      weekday: "short",
    });
    hourGridFormatterByTimezone.set(importMeta.timezone, formatter);
  }
  return Array.from({ length: importMeta.expectedSlots }, (_, index) => {
    const timestampUtc = importMeta.rangeStartUtc + index * HOUR_MS;
    const parts = formatter.formatToParts(new Date(timestampUtc));
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    return { timestampUtc, dayKey: `${year}-${month}-${day}`, hour, isWeekend: weekday === "Sat" || weekday === "Sun" };
  });
}

interface ClassifyVmBehaviorOptions {
  configuredCpuCapacityMHz?: number | null;
}

/**
 * Ordnet eine VM anhand ihres CPU-Demand-Wochenmusters einer Verhaltensklasse zu.
 * Die Reihenfolge der Regeln ist bewusst: nahezu ungenutzte und stark spitzenlastige
 * VMs werden zuerst ausgeschlossen, bevor Wochenmuster geprüft werden.
 */
export function classifyVmBehavior(
  hourGrid: readonly HourGridEntry[],
  demandByTimestamp: ReadonlyMap<number, number>,
  options: ClassifyVmBehaviorOptions = {},
): { behaviorClass: VmBehaviorClass; signals: VmWorkloadClassificationSignals } {
  const emptySignals: VmWorkloadClassificationSignals = {
    coefficientOfVariation: null,
    activeHourSharePct: null,
    utilizationP95Pct: null,
    dailyRepeatability: null,
    businessHoursConcentration: null,
    nightConcentration: null,
    weekendConcentration: null,
  };
  const samples = hourGrid.flatMap((entry) => {
    const value = demandByTimestamp.get(entry.timestampUtc);
    return value !== undefined && Number.isFinite(value) ? [{ ...entry, value }] : [];
  });
  if (samples.length === 0) return { behaviorClass: "unclassified", signals: emptySignals };

  const values = samples.map((sample) => sample.value);
  const totalDemand = values.reduce((sum, value) => sum + value, 0);
  const mean = average(values) ?? 0;
  const stdDev = standardDeviation(values, mean);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : null;
  const p95 = percentile(values, 0.95) ?? 0;
  const median = percentile(values, 0.5) ?? 0;
  const coverageRatio = hourGrid.length > 0 ? samples.length / hourGrid.length : 0;
  const utilizationP95Pct = options.configuredCpuCapacityMHz && options.configuredCpuCapacityMHz > 0
    ? (p95 / options.configuredCpuCapacityMHz) * 100
    : null;

  const activeThreshold = Math.max(p95 * 0.1, Number.EPSILON);
  const activeHourSharePct = (samples.filter((sample) => sample.value > activeThreshold).length / samples.length) * 100;

  const concentration = (predicate: (sample: (typeof samples)[number]) => boolean): number | null => {
    const subset = samples.filter(predicate);
    if (subset.length === 0 || totalDemand <= 0) return null;
    const hourShare = subset.length / samples.length;
    const demandShare = subset.reduce((sum, sample) => sum + sample.value, 0) / totalDemand;
    return hourShare > 0 ? demandShare / hourShare : null;
  };
  const businessHoursConcentration = concentration((sample) => !sample.isWeekend && sample.hour >= BUSINESS_HOUR_START && sample.hour < BUSINESS_HOUR_END);
  const nightConcentration = concentration((sample) => !sample.isWeekend && sample.hour < NIGHT_HOUR_END);
  const weekendConcentration = concentration((sample) => sample.isWeekend);
  const dailyRepeatability = calculateDailyRepeatability(samples);

  const signals: VmWorkloadClassificationSignals = {
    coefficientOfVariation,
    activeHourSharePct,
    utilizationP95Pct,
    dailyRepeatability,
    businessHoursConcentration,
    nightConcentration,
    weekendConcentration,
  };

  if (samples.length < CLASSIFICATION_MIN_SAMPLES || coverageRatio < CLASSIFICATION_MIN_COVERAGE_RATIO) {
    return { behaviorClass: "unclassified", signals };
  }
  if (p95 < LOW_UTILIZATION_P95_MAX_MHZ || (utilizationP95Pct !== null && utilizationP95Pct < LOW_UTILIZATION_P95_CAPACITY_MAX_PCT)) {
    return { behaviorClass: "low-utilization", signals };
  }
  if (coefficientOfVariation !== null && coefficientOfVariation <= CONSTANT_LOAD_CV_MAX && activeHourSharePct >= CONSTANT_LOAD_ACTIVE_HOUR_SHARE_MIN_PCT) {
    return { behaviorClass: "constant-load", signals };
  }

  // Das stärkste Kalenderfenster gewinnt nur mit ausreichendem Abstand. So entscheidet
  // bei Mischmustern nicht mehr die Reihenfolge der if-Zweige.
  const calendarPatterns = [
    { behaviorClass: "business-hours" as const, concentration: businessHoursConcentration ?? 0 },
    { behaviorClass: "night-batch" as const, concentration: nightConcentration ?? 0 },
    { behaviorClass: "weekend-load" as const, concentration: weekendConcentration ?? 0 },
  ].sort((left, right) => right.concentration - left.concentration);
  if (
    calendarPatterns[0].concentration >= CALENDAR_CONCENTRATION_MIN &&
    calendarPatterns[0].concentration - calendarPatterns[1].concentration >= CALENDAR_DOMINANCE_MARGIN_MIN
  ) {
    return { behaviorClass: calendarPatterns[0].behaviorClass, signals };
  }
  if (
    coefficientOfVariation !== null &&
    coefficientOfVariation >= BURSTY_CV_MIN &&
    (activeHourSharePct < BURSTY_ACTIVE_HOUR_SHARE_MAX_PCT || (p95 > 0 && median < p95 * BURSTY_MEDIAN_TO_P95_MAX))
  ) {
    return { behaviorClass: "bursty", signals };
  }
  if (
    coefficientOfVariation !== null &&
    coefficientOfVariation >= IRREGULAR_CV_MIN &&
    dailyRepeatability !== null &&
    dailyRepeatability < IRREGULAR_DAILY_REPEATABILITY_MAX
  ) {
    return { behaviorClass: "irregular", signals };
  }
  return { behaviorClass: "variable-load", signals };
}

function calculateDailyRepeatability(samples: readonly (HourGridEntry & { value: number })[]): number | null {
  const days = new Map<string, Map<number, number>>();
  for (const sample of samples) {
    const day = days.get(sample.dayKey) ?? new Map<number, number>();
    day.set(sample.hour, sample.value);
    days.set(sample.dayKey, day);
  }
  const profiles = [...days.values()];
  const correlations: number[] = [];
  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < profiles.length; rightIndex += 1) {
      const sharedHours = [...profiles[leftIndex].keys()].filter((hour) => profiles[rightIndex].has(hour));
      if (sharedHours.length < 12) continue;
      const left = sharedHours.map((hour) => profiles[leftIndex].get(hour)!);
      const right = sharedHours.map((hour) => profiles[rightIndex].get(hour)!);
      const correlation = pearsonCorrelation(left, right);
      if (correlation !== null) correlations.push(correlation);
    }
  }
  return percentile(correlations, 0.5);
}

function pearsonCorrelation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length === 0) return null;
  const leftMean = average(left) ?? 0;
  const rightMean = average(right) ?? 0;
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquared += leftDelta ** 2;
    rightSquared += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator > 0 ? numerator / denominator : null;
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}
