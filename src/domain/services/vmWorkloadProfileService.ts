import type {
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

export const VM_BEHAVIOR_CLASS_LABEL: Record<VmBehaviorClass, string> = {
  "constant-load": "Dauerlast",
  "business-hours": "Business-Hours",
  "night-batch": "Nächtlicher Batch",
  "weekend-load": "Wochenendlast",
  bursty: "Bursty",
  "low-utilization": "Gering genutzt",
  irregular: "Unregelmäßig",
};

/* ------------------------------------------------------------------ */
/*  Schwellenwerte der Klassifikation – bewusst benannt und an einer   */
/*  Stelle gesammelt, damit die Herleitung nachvollziehbar bleibt.     */
/* ------------------------------------------------------------------ */
/** Unterhalb dieses Spitzenwerts gilt eine VM als praktisch ungenutzt, unabhängig vom zeitlichen Muster. */
const LOW_UTILIZATION_MAX_MHZ = 100;
/** Anteil aktiver Stunden, unterhalb dessen eine VM als „bursty“ statt „gering genutzt“ gilt (bei hohem Spitzenwert). */
const BURSTY_ACTIVE_HOUR_SHARE_MAX_PCT = 20;
/** Verhältnis Median/P95: liegt der Median deutlich unter dem P95, dominieren einzelne Spitzen statt einer Grundlast. */
const BURSTY_MEDIAN_TO_P95_MAX = 0.25;
/** Variationskoeffizient, unterhalb dessen die stündliche Last als annähernd konstant gilt. */
const CONSTANT_LOAD_CV_MAX = 0.35;
const CONSTANT_LOAD_ACTIVE_HOUR_SHARE_MIN_PCT = 80;
/** Konzentration = Demand-Anteil / Stunden-Anteil eines Zeitfensters; 1 = gleichverteilt über die Woche. */
const BUSINESS_HOURS_CONCENTRATION_MIN = 1.4;
const OFF_PATTERN_CONCENTRATION_MAX = 1.2;
const NIGHT_CONCENTRATION_MIN = 1.6;
const WEEKEND_CONCENTRATION_MIN = 1.5;
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 18;
const NIGHT_HOUR_END = 6;

/** Ab dieser Datenabdeckung bzw. Stundenzahl gilt eine Klassifikation als vertrauenswürdig genug für „hoch“/„mittel“. */
const HIGH_CONFIDENCE_COVERAGE_RATIO = 0.9;
const HIGH_CONFIDENCE_MIN_SAMPLES = 96;
const MEDIUM_CONFIDENCE_COVERAGE_RATIO = 0.5;
const MEDIUM_CONFIDENCE_MIN_SAMPLES = 24;

interface HourGridEntry {
  timestampUtc: number;
  hour: number;
  isWeekend: boolean;
}

export interface BuildVmWorkloadProfilesInput {
  import: VropsTimeSeriesImport;
  objects: readonly VropsTimeSeriesImportedObject[];
  chunks: readonly VropsTimeSeriesChunk[];
  vms: readonly NormalizedVm[];
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

  const profiles = input.objects
    .filter((object) => object.objectType === "vm" && object.matchStatus === "matched" && object.rvtoolsObjectKey)
    .flatMap((object): VmWorkloadProfile[] => {
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
      const { behaviorClass, signals } = classifyVmBehavior(hourGrid, demandSeries);
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
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: importMeta.timezone, hourCycle: "h23", hour: "2-digit", weekday: "short" });
  return Array.from({ length: importMeta.expectedSlots }, (_, index) => {
    const timestampUtc = importMeta.rangeStartUtc + index * HOUR_MS;
    const parts = formatter.formatToParts(new Date(timestampUtc));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    return { timestampUtc, hour, isWeekend: weekday === "Sat" || weekday === "Sun" };
  });
}

/**
 * Ordnet eine VM anhand ihres CPU-Demand-Wochenmusters einer Verhaltensklasse zu.
 * Die Reihenfolge der Regeln ist bewusst: nahezu ungenutzte und stark spitzenlastige
 * VMs werden zuerst ausgeschlossen, bevor Wochenmuster geprüft werden.
 */
export function classifyVmBehavior(
  hourGrid: readonly HourGridEntry[],
  demandByTimestamp: ReadonlyMap<number, number>,
): { behaviorClass: VmBehaviorClass; signals: VmWorkloadClassificationSignals } {
  const emptySignals: VmWorkloadClassificationSignals = {
    coefficientOfVariation: null,
    activeHourSharePct: null,
    businessHoursConcentration: null,
    nightConcentration: null,
    weekendConcentration: null,
  };
  const samples = hourGrid.flatMap((entry) => {
    const value = demandByTimestamp.get(entry.timestampUtc);
    return value !== undefined && Number.isFinite(value) ? [{ ...entry, value }] : [];
  });
  if (samples.length === 0) return { behaviorClass: "irregular", signals: emptySignals };

  const values = samples.map((sample) => sample.value);
  const totalDemand = values.reduce((sum, value) => sum + value, 0);
  const mean = average(values) ?? 0;
  const stdDev = standardDeviation(values, mean);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : null;
  const p95 = percentile(values, 0.95) ?? 0;
  const median = percentile(values, 0.5) ?? 0;
  const maximum = Math.max(...values);

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

  const signals: VmWorkloadClassificationSignals = { coefficientOfVariation, activeHourSharePct, businessHoursConcentration, nightConcentration, weekendConcentration };

  // Nahezu ungenutzt und konstante Last werden zuerst ausgeschlossen: Beide sind eindeutig
  // erkennbar, bevor Kalendermuster (Business-Hours/Nacht/Wochenende) geprüft werden.
  if (maximum < LOW_UTILIZATION_MAX_MHZ) return { behaviorClass: "low-utilization", signals };
  if (coefficientOfVariation !== null && coefficientOfVariation < CONSTANT_LOAD_CV_MAX && activeHourSharePct > CONSTANT_LOAD_ACTIVE_HOUR_SHARE_MIN_PCT) {
    return { behaviorClass: "constant-load", signals };
  }
  // Kalendermuster vor „bursty“ prüfen: ein regelmäßiges nächtliches Batch-Fenster deckt
  // naturgemäß nur einen kleinen Stundenanteil ab und wäre sonst mit Spitzenlast verwechselbar.
  if (
    businessHoursConcentration !== null &&
    businessHoursConcentration >= BUSINESS_HOURS_CONCENTRATION_MIN &&
    (nightConcentration ?? 0) < OFF_PATTERN_CONCENTRATION_MAX &&
    (weekendConcentration ?? 0) < OFF_PATTERN_CONCENTRATION_MAX
  ) {
    return { behaviorClass: "business-hours", signals };
  }
  if (nightConcentration !== null && nightConcentration >= NIGHT_CONCENTRATION_MIN) return { behaviorClass: "night-batch", signals };
  if (weekendConcentration !== null && weekendConcentration >= WEEKEND_CONCENTRATION_MIN) return { behaviorClass: "weekend-load", signals };
  if (activeHourSharePct < BURSTY_ACTIVE_HOUR_SHARE_MAX_PCT && p95 > 0 && median < p95 * BURSTY_MEDIAN_TO_P95_MAX) {
    return { behaviorClass: "bursty", signals };
  }
  return { behaviorClass: "irregular", signals };
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}
