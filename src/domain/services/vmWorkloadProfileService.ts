import type {
  NormalizedHost,
  NormalizedVm,
  VmBehaviorClass,
  VmCpuCapacitySignals,
  VmWorkloadClassificationSignals,
  VmWorkloadHourlyPoint,
  VmWorkloadIntensity,
  VmWorkloadProfile,
  VmWorkloadProfileMetricStats,
  VmWorkloadShape,
  VmWorkloadTrendDirection,
  VropsTimeSeriesChunk,
  VropsTimeSeriesConfidenceLevel,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
} from "@/domain/models/types";
import { readVropsTimeSeriesMetric } from "@/domain/services/vropsTimeSeriesSeriesReader";
import { calculateWorkloadTrend } from "@/domain/services/vmWorkloadTrendService";
import { average, percentile, standardDeviation } from "@/lib/statistics";
import { matchesSearchFields, techInfoSearchValues, type VmTechInfoSearchIndex } from "@/lib/vmSearch";

const HOUR_MS = 60 * 60 * 1000;
const hourGridFormatterByTimezone = new Map<string, Intl.DateTimeFormat>();

export const VM_BEHAVIOR_CLASS_LABEL: Record<VmBehaviorClass, string> = {
  unclassified: "Nicht berechenbar",
  "constant-load": "Dauerlast",
  "business-hours": "Business-Hours",
  "night-batch": "Nächtliche Last",
  "weekend-load": "Wochenendlast",
  bursty: "Bursty",
  "variable-load": "Variable Last",
  "low-utilization": "Gering genutzt",
  irregular: "Unregelmäßig",
};

export const VM_WORKLOAD_SHAPE_LABEL: Record<VmWorkloadShape, string> = {
  unclassified: "Nicht berechenbar",
  constant: "Dauerlast",
  "business-hours": "Business-Hours",
  "night-batch": "Nächtliche Last",
  weekend: "Wochenendlast",
  bursty: "Bursty",
  irregular: "Unregelmäßig",
  variable: "Variable Last",
};

export const VM_WORKLOAD_INTENSITY_LABEL: Record<VmWorkloadIntensity, string> = {
  unknown: "Unbekannt",
  idle: "Ruhend",
  "very-low": "Sehr niedrig",
  low: "Niedrig",
  moderate: "Mittel",
  elevated: "Erhöht",
  high: "Hoch",
};

export const VM_WORKLOAD_TREND_LABEL: Record<VmWorkloadTrendDirection, string> = {
  "strongly-rising": "Stark steigend",
  rising: "Steigend",
  stable: "Stabil",
  falling: "Fallend",
  "not-computable": "Nicht berechenbar",
};

/** Obergrenze der jeweiligen Stufe in Prozent der konfigurierten CPU-Kapazität; `high` ist offen. */
export const VM_WORKLOAD_INTENSITY_RANGE: Record<Exclude<VmWorkloadIntensity, "unknown" | "high">, number> = {
  idle: 2.5,
  "very-low": 5,
  low: 10,
  moderate: 25,
  elevated: 50,
};

/* ------------------------------------------------------------------ */
/*  Schwellenwerte der Klassifikation – bewusst benannt und an einer   */
/*  Stelle gesammelt, damit die Herleitung nachvollziehbar bleibt.     */
/* ------------------------------------------------------------------ */

/**
 * Sämtliche Schwellenwerte der Verhaltensklassifikation. Als Typ und Default-Objekt
 * exportiert, damit Auswertungsskripte Varianten gegen echte Datensätze durchrechnen
 * können, ohne die Regelkaskade zu duplizieren (siehe `scripts/analyze-behavior-classes.ts`).
 */
export interface VmBehaviorThresholds {
  /**
   * Greift praktisch nur, wenn die konfigurierte CPU-Kapazität unbekannt ist – dann
   * ist ein Kapazitätsanteil nicht berechenbar und nur der Absolutwert bleibt. Auf
   * 3.950 vermessenen VMs (alle mit bekannter Kapazität) entschied er nie allein.
   */
  lowUtilizationP95MaxMHz: number;
  lowUtilizationP95CapacityMaxPct: number;
  /** Verhältnis Median/P95: liegt der Median deutlich unter dem P95, dominieren Spitzen statt einer Grundlast. */
  burstyMedianToP95Max: number;
  burstyCvMin: number;
  /** Bursts müssen im jüngsten Wochenprofil kompakt bleiben; breite Plateaus sind variable Last. */
  burstyPeakShareMaxPct: number;
  burstyPeakRunP90MaxHours: number;
  /** Variationskoeffizient, unterhalb dessen die stündliche Last als annähernd konstant gilt. */
  constantLoadCvMax: number;
  /** Konzentration = Demand-Anteil / Stunden-Anteil eines Zeitfensters; 1 = gleichverteilt über die Woche. */
  calendarConcentrationMin: number;
  calendarDominanceMarginMin: number;
  /** Schwächere Kalenderprägung gilt nur zusammen mit stabiler Tages- oder Wochenwiederholung. */
  subtleCalendarConcentrationMin: number;
  subtleCalendarDominanceMarginMin: number;
  subtleCalendarRepeatabilityMin: number;
  irregularCvMin: number;
  irregularDailyRepeatabilityMax: number;
  /**
   * Ab dieser Wochenkorrelation und unterhalb dieser Streuung der Wochenmaxima gilt eine
   * Spitzenlast als planbar. Beide Werte zusammen, weil ein wiederkehrender *Verlauf*
   * ohne vergleichbare *Höhe* die Spitze nicht vorhersagbar macht.
   */
  repeatableWeeklyCorrelationMin: number;
  repeatableWeeklyPeakVariationMax: number;
  /** Ab diesem Anteil der konfigurierten Kapazität gilt eine Stunde als produktive Arbeitsstunde. */
  dutyCycleCapacityMinPct: number;
  businessHourStart: number;
  businessHourEnd: number;
  nightHourStart: number;
  nightHourEnd: number;
  classificationMinCoverageRatio: number;
  classificationMinSamples: number;
}

export const VM_BEHAVIOR_THRESHOLDS: VmBehaviorThresholds = {
  lowUtilizationP95MaxMHz: 100,
  lowUtilizationP95CapacityMaxPct: 10,
  burstyMedianToP95Max: 0.4,
  burstyCvMin: 0.8,
  burstyPeakShareMaxPct: 25,
  burstyPeakRunP90MaxHours: 6,
  /**
   * An 3.980 vermessenen VMs hergeleitet. Als unabhängiges Maß für „wirklich flach“
   * dient p95/p50 ≤ 1,5 **und** Monatsmaximum/p50 ≤ 2,5 **und** ein Stunden-P95 des
   * Verhältnisses Demand-Max zu Demand-Avg ≤ 2; darauf kommen 376 VMs (9,4 %).
   *
   * | Schwelle | als `constant` | davon wirklich flach |
   * |----------|----------------|----------------------|
   * | 0,5      | 2.218          | 16,8 %               |
   * | 0,3      | 1.218          | 29,6 %               |
   * | 0,2      |   571          | 58,7 %               |
   * | 0,15     |   386          | 75,4 %               |
   *
   * Der Anteil flacher VMs kippt im Band 0,15–0,20 von 51,7 % auf 23,8 %; 0,2 hält die
   * Trefferquote bei 89,1 % und verdreifacht zugleich die Präzision. Die Umstellung
   * verschiebt rund 1.500 VMs nach `variable`; das frühere Mischmuster „Grundlast mit
   * Lastfenster“ lief dadurch leer und ist entfallen – deren VMs erreicht der
   * Kalenderpfad (`business-hours` +145).
   */
  constantLoadCvMax: 0.2,
  calendarConcentrationMin: 1.35,
  calendarDominanceMarginMin: 0.15,
  subtleCalendarConcentrationMin: 1.15,
  subtleCalendarDominanceMarginMin: 0.1,
  subtleCalendarRepeatabilityMin: 0.45,
  irregularCvMin: 0.5,
  irregularDailyRepeatabilityMax: 0.3,
  // An vier vollen Wochen gemessen: `bursty` erreicht im Median 0,66 Korrelation bei
  // 0,09 Streuung der Wochenmaxima, `irregular` 0,06 bei 0,70. Bei diesen Grenzen
  // gelten 54 % der `bursty`-VMs als planbar und 3 % der `irregular`.
  repeatableWeeklyCorrelationMin: 0.5,
  repeatableWeeklyPeakVariationMax: 0.4,
  dutyCycleCapacityMinPct: 5,
  businessHourStart: 6,
  businessHourEnd: 17,
  nightHourStart: 20,
  nightHourEnd: 6,
  classificationMinCoverageRatio: 0.5,
  classificationMinSamples: 24,
};

/** Ab dieser Datenabdeckung bzw. Stundenzahl gilt eine Klassifikation als vertrauenswürdig genug für „hoch“/„mittel“. */
const HIGH_CONFIDENCE_COVERAGE_RATIO = 0.9;
const HIGH_CONFIDENCE_MIN_SAMPLES = 96;
const MEDIUM_CONFIDENCE_COVERAGE_RATIO = 0.5;
const MEDIUM_CONFIDENCE_MIN_SAMPLES = 24;

export interface HourGridEntry {
  timestampUtc: number;
  dayKey: string;
  hour: number;
  /** 0 = Montag … 6 = Sonntag, in der Zeitzone des Imports. */
  weekdayIndex: number;
  isWeekend: boolean;
}

/** Reihenfolge entspricht `weekdayIndex`; `Intl` liefert die englischen Kurznamen. */
export const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface BuildVmWorkloadProfilesInput {
  import: VropsTimeSeriesImport;
  objects: readonly VropsTimeSeriesImportedObject[];
  chunks: readonly VropsTimeSeriesChunk[];
  vms: readonly NormalizedVm[];
  hosts?: readonly NormalizedHost[];
}

/**
 * Wendet die Textsuche der Filterleiste auf die Profile an – VM-Name, Cluster, Host,
 * Systemverantwortliche:r und deren Abteilung.
 * Der Filter greift an der Wurzel des Tabs, damit KPI-Kacheln, Verteilungsdiagramme und
 * Tabelle denselben Ausschnitt zeigen. Erwartet einen bereits normalisierten Suchbegriff
 * (`normalizeVmSearchTerm`); ein leerer Begriff liefert den vollständigen Bestand.
 */
export function filterVmWorkloadProfilesBySearch(
  profiles: readonly VmWorkloadProfile[],
  normalizedQuery: string,
  techInfoIndex: VmTechInfoSearchIndex = new Map(),
): VmWorkloadProfile[] {
  if (normalizedQuery === "") return [...profiles];
  return profiles.filter((profile) => matchesSearchFields(normalizedQuery, [
    profile.vmName,
    profile.clusterName,
    profile.host,
    ...techInfoSearchValues(techInfoIndex, profile.vmName),
  ]));
}

/**
 * Leitet für jede eindeutig zugeordnete VM ein CPU-Profil samt
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
      const demandMaxSeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuDemandMaxMHz");
      const readySeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuReadyMaxPct");
      const memoryWorkloadAvgSeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmMemoryWorkloadAvgPct");
      const memoryWorkloadMaxSeries = readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmMemoryWorkloadMaxPct");
      const hourly: VmWorkloadHourlyPoint[] = hourGrid.map((entry) => ({
        timestampUtc: entry.timestampUtc,
        cpuDemandMHz: finiteOrNull(demandSeries.get(entry.timestampUtc)),
        cpuDemandMaxMHz: finiteOrNull(demandMaxSeries.get(entry.timestampUtc)),
        cpuReadyPct: finiteOrNull(readySeries.get(entry.timestampUtc)),
        memoryWorkloadAvgPct: finiteOrNull(memoryWorkloadAvgSeries.get(entry.timestampUtc)),
        memoryWorkloadMaxPct: finiteOrNull(memoryWorkloadMaxSeries.get(entry.timestampUtc)),
      }));
      const demand = buildMetricStats(hourly.map((point) => point.cpuDemandMHz), input.import.expectedSlots);
      const demandMax = buildMetricStats(hourly.map((point) => point.cpuDemandMaxMHz), input.import.expectedSlots);
      const ready = buildMetricStats(hourly.map((point) => point.cpuReadyPct), input.import.expectedSlots);
      const host = object.hostKey ? hostByKey.get(object.hostKey) : undefined;
      const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
      const capacitySignals = buildCapacitySignals({
        hourGrid,
        demandSeries,
        capacitySeries: readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuTotalCapacityLastMHz"),
        vcpuSeries: readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmConfiguredVcpuLast"),
        costopSeries: readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuPeakCostopMaxPct"),
        disparitySeries: readVropsTimeSeriesMetric(input.chunks, object.objectKey, "vmCpuUsageDisparityAvgPct"),
        fallbackVcpu: vm.cpuCount,
      });
      // Die von vROps je VM gemeldete Kapazität geht vor: sie begleitet die VM über
      // Migrationen hinweg, während `mhzPerCore` immer den aktuellen Host beschreibt.
      const configuredCpuCapacityMHz = capacitySignals.totalCapacityMHz
        ?? (mhzPerCore !== null && vm.cpuCount ? mhzPerCore * vm.cpuCount : null);
      const { shape, intensity, behaviorClass, signals } = classifyVmBehavior(hourGrid, demandSeries, { configuredCpuCapacityMHz });
      const cpuTrend = calculateWorkloadTrend(hourGrid.map((entry) => ({ dayKey: entry.dayKey, value: demandSeries.get(entry.timestampUtc) })), { capacity: configuredCpuCapacityMHz });
      const memoryTrend = calculateWorkloadTrend(hourGrid.map((entry) => ({ dayKey: entry.dayKey, value: memoryWorkloadAvgSeries.get(entry.timestampUtc) })), { capacity: 100 });
      return [{
        objectKey: object.objectKey,
        rvtoolsObjectKey: object.rvtoolsObjectKey,
        vmName: vm.vmName,
        clusterKey: object.clusterKey,
        clusterName: vm.cluster,
        resourcePool: vm.resourcePool,
        hostKey: object.hostKey,
        host: vm.host,
        vcpu: vm.cpuCount,
        configuredCpuCapacityMHz,
        configuredMemoryMiB: vm.memoryMiB,
        powerState: object.powerState,
        workloadClass: object.workloadClass ?? "unknown",
        timezone: input.import.timezone,
        hourly,
        demand,
        demandMax,
        ready,
        capacitySignals,
        shape,
        intensity,
        behaviorClass,
        confidence: determineProfileConfidence(demand.coverageRatio, demand.sampleCount, { shape, signals }),
        signals,
        cpuTrend,
        memoryTrend,
      }];
    });

  return profiles.sort((left, right) => left.vmName.localeCompare(right.vmName, "de-DE"));
}

function buildMetricStats(values: readonly (number | null)[], expectedSlots: number): VmWorkloadProfileMetricStats {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  // Die Profile werden von mehreren Tabs geteilt und sind teuer. Alle Perzentile
  // deshalb aus genau einer Sortierung lesen, statt die Reihe je Kennzahl neu zu sortieren.
  const sorted = [...finite].sort((left, right) => left - right);
  const fromSorted = (fraction: number): number | null => sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]
    : null;
  return {
    expectedSlots,
    sampleCount: finite.length,
    coverageRatio: expectedSlots > 0 ? finite.length / expectedSlots : 0,
    average: average(finite),
    p50: fromSorted(0.5),
    p95: fromSorted(0.95),
    p995: fromSorted(0.995),
    p99: fromSorted(0.99),
    // `Math.max(...finite)` würde bei einem Monat Stundenwerten über alle VMs hinweg
    // den Aufrufstack sprengen; die Schleife bleibt unabhängig von der Reihenlänge.
    maximum: finite.length ? finite.reduce((left, right) => (right > left ? right : left), finite[0]) : null,
  };
}

/** Ab diesem Anteil der Kapazität gilt eine Stunde als Laststunde für die Druck-Signale. */
const COSTOP_LOAD_MIN_CAPACITY_PCT = 25;
/** Unterhalb dieser mittleren Kernauslastung ist die gemessene Disparity Rauschen. */
const CONCENTRATION_MIN_CORE_PCT = 5;
/** Ohne diese Zahl an Laststunden ist ein P95 des Co-Stop nicht belastbar. */
const COSTOP_MIN_LOAD_HOURS = 12;
/** Datenbelegte Grenzen des Einzelkern-Signals, siehe Analyseabschnitt 21. */
const SINGLE_CORE_LOAD_MIN_PCT = 1;
const SINGLE_CORE_SATURATION_PCT = 90;
const SINGLE_CORE_VM_HEADROOM_MAX_PCT = 60;

interface BuildCapacitySignalsInput {
  hourGrid: readonly HourGridEntry[];
  demandSeries: ReadonlyMap<number, number>;
  capacitySeries: ReadonlyMap<number, number>;
  vcpuSeries: ReadonlyMap<number, number>;
  costopSeries: ReadonlyMap<number, number>;
  disparitySeries: ReadonlyMap<number, number>;
  /** Aus RVTools, falls vROps keine vCPU-Anzahl liefert. */
  fallbackVcpu: number | null;
}

/**
 * Verdichtet die vier optionalen vROps-Metriken zu den Kennzahlen, die das Rightsizing
 * braucht. Alles wird in einem Durchlauf über das Stundenraster berechnet, weil je VM
 * sonst mehrfach über 744 Slots iteriert würde.
 */
function buildCapacitySignals(input: BuildCapacitySignalsInput): VmCpuCapacitySignals {
  const empty: VmCpuCapacitySignals = {
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
  };
  const totalCapacityMHz = lastFiniteValue(input.hourGrid, input.capacitySeries);
  const configuredVcpu = lastFiniteValue(input.hourGrid, input.vcpuSeries) ?? input.fallbackVcpu;
  if (totalCapacityMHz === null || totalCapacityMHz <= 0) return { ...empty, configuredVcpu };
  const mhzPerVcpu = configuredVcpu && configuredVcpu > 0 ? totalCapacityMHz / configuredVcpu : null;

  let hoursAboveCapacity75 = 0;
  let hoursAboveCapacity90 = 0;
  const costopUnderLoad: number[] = [];
  const concentrationIndices: number[] = [];
  let effectiveCoresMax: number | null = null;
  let singleCoreBoundHours = 0;
  let hasSingleCoreObservations = false;

  for (const entry of input.hourGrid) {
    const demand = input.demandSeries.get(entry.timestampUtc);
    if (demand === undefined || !Number.isFinite(demand)) continue;
    // Kapazität je Stunde, damit eine Migration in eine andere Taktklasse nicht den
    // ganzen Monat mit dem zuletzt gesehenen Wert verrechnet wird. Beschreibt, was
    // physisch geschah, und ist deshalb die richtige Bezugsgröße für Contention.
    const capacity = finiteOrNull(input.capacitySeries.get(entry.timestampUtc)) ?? totalCapacityMHz;
    if (capacity <= 0) continue;
    const utilizationPct = (demand / capacity) * 100;

    // Die Kapazitätsnähe dagegen misst gegen die *heutige* Größe. Sie beantwortet die
    // Frage „reicht die aktuelle Konfiguration?“ und darf sich nicht auf einen Engpass
    // stützen, der durch eine zwischenzeitliche Vergrößerung längst behoben ist. An
    // 4.018 VMs gemessen wurden 20 im Zeitraum umkonfiguriert; für eine von ihnen
    // erzeugte die stundenweise Bezugsgröße einen Vergrößerungsvorschlag, obwohl ihr
    // höchstes Stundenmittel nur 54 % der jetzigen Kapazität erreicht.
    const currentUtilizationPct = (demand / totalCapacityMHz) * 100;
    if (currentUtilizationPct > 75) hoursAboveCapacity75 += 1;
    if (currentUtilizationPct > 90) hoursAboveCapacity90 += 1;

    if (utilizationPct >= COSTOP_LOAD_MIN_CAPACITY_PCT) {
      const costop = finiteOrNull(input.costopSeries.get(entry.timestampUtc));
      if (costop !== null) costopUnderLoad.push(costop);
    }

    const vcpu = finiteOrNull(input.vcpuSeries.get(entry.timestampUtc)) ?? configuredVcpu;
    const disparity = finiteOrNull(input.disparitySeries.get(entry.timestampUtc));
    if (disparity === null || vcpu === null || vcpu <= 1) continue;
    hasSingleCoreObservations = true;
    const highestCorePct = Math.min(100, utilizationPct + (disparity * (vcpu - 1)) / vcpu);
    if (utilizationPct >= SINGLE_CORE_LOAD_MIN_PCT
      && highestCorePct >= SINGLE_CORE_SATURATION_PCT
      && utilizationPct <= SINGLE_CORE_VM_HEADROOM_MAX_PCT) singleCoreBoundHours += 1;
    if (utilizationPct < CONCENTRATION_MIN_CORE_PCT) continue;
    // `utilizationPct` ist zugleich die mittlere Auslastung eines einzelnen Kerns, weil
    // die Kapazität alle vCPU umfasst. Der Index wird damit 1, wenn ein Kern voll läuft
    // und alle anderen ruhen, und 0 bei gleichmäßiger Verteilung.
    concentrationIndices.push((disparity / utilizationPct) / vcpu);
    // Höchste Kernlast aus mittlerer Last und Abstand; daraus, wie viele Kerne die
    // Gesamtlast tatsächlich tragen. Mehr vCPU als dieser Wert können nichts bewirken.
    if (highestCorePct > 0) {
      const effectiveCores = (vcpu * utilizationPct) / highestCorePct;
      if (effectiveCoresMax === null || effectiveCores > effectiveCoresMax) effectiveCoresMax = effectiveCores;
    }
  }

  return {
    totalCapacityMHz,
    configuredVcpu,
    mhzPerVcpu,
    hoursAboveCapacity75,
    hoursAboveCapacity90,
    costopUnderLoadP95Pct: costopUnderLoad.length >= COSTOP_MIN_LOAD_HOURS ? percentile(costopUnderLoad, 0.95) : null,
    loadHourCount: costopUnderLoad.length,
    concentrationIndexP90: percentile(concentrationIndices, 0.9),
    effectiveCoresMax,
    singleCoreBoundHours: hasSingleCoreObservations ? singleCoreBoundHours : null,
  };
}

/** Letzter im Raster vorhandener Messwert einer Reihe; `null`, wenn die Metrik fehlt. */
function lastFiniteValue(hourGrid: readonly HourGridEntry[], series: ReadonlyMap<number, number>): number | null {
  for (let index = hourGrid.length - 1; index >= 0; index -= 1) {
    const value = finiteOrNull(series.get(hourGrid[index].timestampUtc));
    if (value !== null) return value;
  }
  return null;
}

/** Datenbasis bleibt die Untergrenze; bei Profilen kommen Mustergüte und Konsistenz hinzu. */
export function determineProfileConfidence(
  coverageRatio: number,
  sampleCount: number,
  classification?: { shape: VmWorkloadShape; signals: VmWorkloadClassificationSignals },
): VropsTimeSeriesConfidenceLevel {
  if (sampleCount === 0) return "not-computable";
  if (coverageRatio < MEDIUM_CONFIDENCE_COVERAGE_RATIO || sampleCount < MEDIUM_CONFIDENCE_MIN_SAMPLES) return "low";
  if (coverageRatio < HIGH_CONFIDENCE_COVERAGE_RATIO || sampleCount < HIGH_CONFIDENCE_MIN_SAMPLES) return "medium";
  if (!classification || classification.signals.confidenceScore === null) return "high";
  if (classification.shape === "unclassified") return "low";
  return classification.signals.confidenceScore >= 80 ? "high" : classification.signals.confidenceScore >= 55 ? "medium" : "low";
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
    const weekdayIndex = WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);
    return {
      timestampUtc,
      dayKey: `${year}-${month}-${day}`,
      hour,
      weekdayIndex,
      isWeekend: weekday === "Sat" || weekday === "Sun",
    };
  });
}

interface ClassifyVmBehaviorOptions {
  configuredCpuCapacityMHz?: number | null;
  /** Überschreibt einzelne Schwellwerte; ungesetzte Felder behalten den Produktionswert. */
  thresholds?: Partial<VmBehaviorThresholds>;
}

/**
 * Ordnet eine VM anhand ihres CPU-Demand-Wochenmusters ein – getrennt nach
 * zeitlichem Muster (`shape`) und Auslastungsniveau (`intensity`).
 *
 * Die Trennung ist der Kern: früher stand die Low-Utilization-Prüfung vor allen
 * Musterregeln, wodurch jede schwach ausgelastete VM ihr Muster verlor. `shape`
 * wird deshalb rein aus niveauunabhängigen Signalen bestimmt (Variationskoeffizient,
 * Kalenderkonzentrationen, Tageswiederholbarkeit), `intensity` rein aus dem P95
 * relativ zur konfigurierten Kapazität. `behaviorClass` kombiniert beides und
 * reproduziert die frühere Einzelklasse unverändert.
 */
export function classifyVmBehavior(
  hourGrid: readonly HourGridEntry[],
  demandByTimestamp: ReadonlyMap<number, number>,
  options: ClassifyVmBehaviorOptions = {},
): { shape: VmWorkloadShape; intensity: VmWorkloadIntensity; behaviorClass: VmBehaviorClass; signals: VmWorkloadClassificationSignals } {
  const emptySignals: VmWorkloadClassificationSignals = {
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
  };
  const thresholds: VmBehaviorThresholds = options.thresholds
    ? { ...VM_BEHAVIOR_THRESHOLDS, ...options.thresholds }
    : VM_BEHAVIOR_THRESHOLDS;
  const samples = hourGrid.flatMap((entry, slotIndex) => {
    const value = demandByTimestamp.get(entry.timestampUtc);
    return value !== undefined && Number.isFinite(value) ? [{ ...entry, slotIndex, value }] : [];
  });
  if (samples.length === 0) return { shape: "unclassified", intensity: "unknown", behaviorClass: "unclassified", signals: emptySignals };

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

  // Absolutes Aktivitätsmaß: nur mit bekannter Kapazität aussagekräftig, dafür aber
  // im Gegensatz zu activeHourSharePct über die Klassen hinweg trennscharf.
  const dutyCycleThreshold = options.configuredCpuCapacityMHz && options.configuredCpuCapacityMHz > 0
    ? options.configuredCpuCapacityMHz * (thresholds.dutyCycleCapacityMinPct / 100)
    : null;
  const dutyCyclePct = dutyCycleThreshold !== null
    ? (samples.filter((sample) => sample.value > dutyCycleThreshold).length / samples.length) * 100
    : null;
  const p10 = percentile(values, 0.1) ?? 0;
  const baselineRatio = p95 > 0 ? p10 / p95 : null;

  const concentration = (predicate: (sample: (typeof samples)[number]) => boolean): number | null => {
    const subset = samples.filter(predicate);
    if (subset.length === 0 || totalDemand <= 0) return null;
    const hourShare = subset.length / samples.length;
    const demandShare = subset.reduce((sum, sample) => sum + sample.value, 0) / totalDemand;
    return hourShare > 0 ? demandShare / hourShare : null;
  };
  const businessHoursConcentration = concentration((sample) => !sample.isWeekend && sample.hour >= thresholds.businessHourStart && sample.hour < thresholds.businessHourEnd);
  // Das stärkere der beiden Fenster gewinnt: Der bisher sehr treffsichere Kern
  // 00–06 Uhr bleibt erhalten, zusätzlich werden regelmäßige Läufe um 20–23 Uhr
  // erkannt. Ein einziges breites Fenster würde die Konzentration früher Nachtjobs
  // verwässern und bereits korrekt klassifizierte VMs zurück auf „variable“ setzen.
  const nightCoreConcentration = concentration((sample) => !sample.isWeekend && sample.hour < thresholds.nightHourEnd);
  const eveningNightConcentration = concentration((sample) => !sample.isWeekend && (sample.hour >= thresholds.nightHourStart || sample.hour < thresholds.nightHourEnd));
  const nightConcentration = Math.max(nightCoreConcentration ?? 0, eveningNightConcentration ?? 0) || null;
  const weekendConcentration = concentration((sample) => sample.isWeekend);
  const dailyRepeatability = calculateDailyRepeatability(samples);
  const { weeklyRepeatability, weeklyPeakVariation } = calculateWeeklySignals(samples);
  const { recentPeakSharePct, recentPeakRunP90Hours } = calculateRecentPeakSignals(samples, median, p95);

  const signals: VmWorkloadClassificationSignals = {
    coefficientOfVariation,
    activeHourSharePct,
    dutyCyclePct,
    baselineRatio,
    utilizationP95Pct,
    dailyRepeatability,
    weeklyRepeatability,
    weeklyPeakVariation,
    businessHoursConcentration,
    nightConcentration,
    weekendConcentration,
    recentPeakSharePct,
    recentPeakRunP90Hours,
    shapeFitScore: null,
    confidenceScore: null,
  };

  const shape = determineShape({ samples: samples.length, coverageRatio, coefficientOfVariation, median, p95, dailyRepeatability, weeklyRepeatability, businessHoursConcentration, nightConcentration, weekendConcentration, recentPeakSharePct, recentPeakRunP90Hours }, thresholds);
  signals.shapeFitScore = calculateShapeFitScore(shape, signals, thresholds);
  signals.confidenceScore = calculateConfidenceScore(coverageRatio, samples.length, shape, signals);
  // Reicht die Datenbasis nicht für eine Formaussage, trägt sie auch keine Niveauaussage.
  // Beide Achsen behandeln dieselbe Datenlücke damit gleich.
  const intensity = shape === "unclassified" ? "unknown" : determineIntensity(utilizationP95Pct);
  // Niveauurteil bewusst mit der bisherigen Oder-Logik: der MHz-Wert greift damit
  // weiterhin für VMs ohne bekannte Kapazität, für die kein Anteil berechenbar ist.
  const isLowUtilization =
    p95 < thresholds.lowUtilizationP95MaxMHz ||
    (utilizationP95Pct !== null && utilizationP95Pct < thresholds.lowUtilizationP95CapacityMaxPct);

  return { shape, intensity, behaviorClass: deriveBehaviorClass(shape, isLowUtilization), signals };
}

interface ShapeInput {
  samples: number;
  coverageRatio: number;
  coefficientOfVariation: number | null;
  median: number;
  p95: number;
  dailyRepeatability: number | null;
  weeklyRepeatability: number | null;
  businessHoursConcentration: number | null;
  nightConcentration: number | null;
  weekendConcentration: number | null;
  recentPeakSharePct: number | null;
  recentPeakRunP90Hours: number | null;
}

/**
 * Bestimmt das zeitliche Muster ausschließlich aus niveauunabhängigen Signalen.
 * Enthält absichtlich keine Auslastungsschwelle – sonst verlöre eine schwach
 * ausgelastete VM wieder ihr Muster.
 *
 * Die früheren Zusatzbedingungen über `activeHourSharePct` sind entfallen: an
 * 3.950 VMs gemessen änderten sie kein einziges Ergebnis, weil die Kennzahl bei
 * stündlich gemittelten Werten fast immer 100 % erreicht.
 */
function determineShape(input: ShapeInput, thresholds: VmBehaviorThresholds): VmWorkloadShape {
  const { coefficientOfVariation: cv, median, p95, dailyRepeatability } = input;
  if (input.samples < thresholds.classificationMinSamples || input.coverageRatio < thresholds.classificationMinCoverageRatio) {
    return "unclassified";
  }
  // Auch ein schwaches Lastfenster kann bei kleiner Streuung fachlich aussagekräftiger
  // als „Dauerlast“ sein. Die feinere Kalenderstufe verlangt dafür zusätzlich eine
  // stabile Tages- oder Wochenwiederholung und bleibt bei wirklich flachen Reihen aus.
  const calendarWindow = dominantCalendarShape(input, thresholds);
  if (calendarWindow !== null) return calendarWindow;
  if (cv !== null && cv <= thresholds.constantLoadCvMax) return "constant";
  if (cv !== null && cv >= thresholds.burstyCvMin && p95 > 0 && median < p95 * thresholds.burstyMedianToP95Max) {
    if ((input.recentPeakSharePct ?? 100) < thresholds.burstyPeakShareMaxPct
      && (input.recentPeakRunP90Hours ?? Number.POSITIVE_INFINITY) < thresholds.burstyPeakRunP90MaxHours) return "bursty";
  }
  if (cv !== null && cv >= thresholds.irregularCvMin && dailyRepeatability !== null && dailyRepeatability < thresholds.irregularDailyRepeatabilityMax) {
    return "irregular";
  }
  return "variable";
}

/**
 * Liefert das stärkste Kalenderfenster, sofern es die Mindestkonzentration erreicht *und*
 * genügend Abstand zum zweitstärksten hat. Der Abstand verhindert, dass bei Mischmustern
 * die Reihenfolge der Prüfungen entscheidet.
 */
function dominantCalendarShape(input: ShapeInput, thresholds: VmBehaviorThresholds): VmWorkloadShape | null {
  const patterns = [
    { shape: "business-hours" as const, concentration: input.businessHoursConcentration ?? 0 },
    { shape: "night-batch" as const, concentration: input.nightConcentration ?? 0 },
    { shape: "weekend" as const, concentration: input.weekendConcentration ?? 0 },
  ].sort((left, right) => right.concentration - left.concentration);
  const dominance = patterns[0].concentration - patterns[1].concentration;
  const strongMatch = patterns[0].concentration >= thresholds.calendarConcentrationMin
    && dominance >= thresholds.calendarDominanceMarginMin;
  const repeatability = Math.max(input.dailyRepeatability ?? -1, input.weeklyRepeatability ?? -1);
  const subtleRepeatableMatch = patterns[0].concentration >= thresholds.subtleCalendarConcentrationMin
    && dominance >= thresholds.subtleCalendarDominanceMarginMin
    && repeatability >= thresholds.subtleCalendarRepeatabilityMin;
  return strongMatch || subtleRepeatableMatch ? patterns[0].shape : null;
}

function calculateRecentPeakSignals(
  samples: readonly (HourGridEntry & { slotIndex: number; value: number })[],
  median: number,
  p95: number,
): { recentPeakSharePct: number | null; recentPeakRunP90Hours: number | null } {
  if (samples.length === 0 || p95 <= 0) return { recentPeakSharePct: null, recentPeakRunP90Hours: null };
  const lastSlot = samples[samples.length - 1].slotIndex;
  const recent = samples.filter((sample) => sample.slotIndex >= lastSlot - 167);
  if (recent.length === 0) return { recentPeakSharePct: null, recentPeakRunP90Hours: null };
  const threshold = median + 0.6 * Math.max(0, p95 - median);
  let highHours = 0;
  let run = 0;
  let previousSlot: number | null = null;
  const runs: number[] = [];
  for (const sample of recent) {
    const isPeak = sample.value >= threshold;
    if (isPeak) {
      highHours += 1;
      if (previousSlot !== null && sample.slotIndex !== previousSlot + 1 && run > 0) {
        runs.push(run);
        run = 0;
      }
      run += 1;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
    previousSlot = sample.slotIndex;
  }
  if (run > 0) runs.push(run);
  return {
    recentPeakSharePct: (highHours / recent.length) * 100,
    recentPeakRunP90Hours: percentile(runs, 0.9) ?? 0,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function calculateShapeFitScore(
  shape: VmWorkloadShape,
  signals: VmWorkloadClassificationSignals,
  thresholds: VmBehaviorThresholds,
): number {
  const cv = signals.coefficientOfVariation ?? 0;
  const concentrations = [
    signals.businessHoursConcentration ?? 0,
    signals.nightConcentration ?? 0,
    signals.weekendConcentration ?? 0,
  ].sort((left, right) => right - left);
  const dominance = concentrations[0] - concentrations[1];
  let fit = 0;
  switch (shape) {
    case "constant": fit = clamp01(1 - cv / (thresholds.constantLoadCvMax + 0.1)); break;
    case "business-hours": fit = calendarFit(signals.businessHoursConcentration, dominance); break;
    case "night-batch": fit = calendarFit(signals.nightConcentration, dominance); break;
    case "weekend": fit = calendarFit(signals.weekendConcentration, dominance); break;
    case "bursty":
      fit = clamp01(
        0.45 * ((cv - 0.6) / 0.8)
        + 0.35 * (1 - (signals.recentPeakRunP90Hours ?? 8) / 8)
        + 0.2 * (1 - (signals.recentPeakSharePct ?? 30) / 30),
      );
      break;
    case "irregular":
      fit = clamp01(0.5 * ((cv - 0.4) / 0.8) + 0.5 * (1 - ((signals.dailyRepeatability ?? 0) + 0.2) / 0.7));
      break;
    case "variable": fit = 0.58; break;
    case "unclassified": fit = 0; break;
  }
  return Math.round(fit * 100);
}

function calendarFit(concentration: number | null, dominance: number): number {
  return clamp01(0.6 * (((concentration ?? 0) - 1) / 0.7) + 0.4 * (dominance / 0.4));
}

function calculateConfidenceScore(
  coverageRatio: number,
  sampleCount: number,
  shape: VmWorkloadShape,
  signals: VmWorkloadClassificationSignals,
): number {
  const dataScore = clamp01((coverageRatio - 0.5) / 0.4);
  const sampleScore = clamp01((sampleCount - 24) / (168 - 24));
  const fitScore = (signals.shapeFitScore ?? 0) / 100;
  let consistencyScore = clamp01(((signals.dailyRepeatability ?? 0) + 0.2) / 1.2);
  if (shape === "constant") consistencyScore = clamp01(1 - (signals.weeklyPeakVariation ?? 0.5));
  if (shape === "bursty") consistencyScore = clamp01(((signals.weeklyRepeatability ?? 0) + 0.2) / 1.2);
  if (shape === "irregular") consistencyScore = clamp01(1 - ((signals.weeklyRepeatability ?? 0) + 0.2) / 0.8);
  if (shape === "variable") consistencyScore = clamp01(0.35 + 0.45 * ((signals.weeklyRepeatability ?? 0) + 0.2) / 1.2);
  if (shape === "unclassified") consistencyScore = 0;
  return Math.round(100 * (0.35 * dataScore + 0.15 * sampleScore + 0.35 * fitScore + 0.15 * consistencyScore));
}

/** Stuft das Auslastungsniveau anhand des P95-Anteils an der konfigurierten Kapazität ein. */
function determineIntensity(utilizationP95Pct: number | null): VmWorkloadIntensity {
  if (utilizationP95Pct === null) return "unknown";
  if (utilizationP95Pct < VM_WORKLOAD_INTENSITY_RANGE.idle) return "idle";
  if (utilizationP95Pct < VM_WORKLOAD_INTENSITY_RANGE["very-low"]) return "very-low";
  if (utilizationP95Pct < VM_WORKLOAD_INTENSITY_RANGE.low) return "low";
  if (utilizationP95Pct < VM_WORKLOAD_INTENSITY_RANGE.moderate) return "moderate";
  if (utilizationP95Pct < VM_WORKLOAD_INTENSITY_RANGE.elevated) return "elevated";
  return "high";
}

const SHAPE_TO_BEHAVIOR_CLASS: Record<Exclude<VmWorkloadShape, "unclassified">, VmBehaviorClass> = {
  constant: "constant-load",
  "business-hours": "business-hours",
  "night-batch": "night-batch",
  weekend: "weekend-load",
  bursty: "bursty",
  irregular: "irregular",
  variable: "variable-load",
};

/**
 * Faltet beide Achsen auf die frühere Einzelklasse zurück. Ein niedriges Niveau
 * überschreibt das Muster – genau die Reihenfolge der alten Kaskade, damit
 * bestehende Auswertungen unveränderte Ergebnisse sehen.
 */
function deriveBehaviorClass(shape: VmWorkloadShape, isLowUtilization: boolean): VmBehaviorClass {
  if (shape === "unclassified") return "unclassified";
  if (isLowUtilization) return "low-utilization";
  return SHAPE_TO_BEHAVIOR_CLASS[shape];
}

const WEEK_HOURS = 168;
/** Eine Woche zählt erst ab dieser Belegung; sonst vergleicht die Korrelation Bruchstücke. */
const WEEK_MIN_SAMPLES = 84;
/** Für eine Streuung der Wochenmaxima braucht es mindestens drei Wochen. */
const WEEKLY_PEAK_MIN_WEEKS = 3;

/**
 * Vergleicht die vollständigen Wochen einer VM miteinander.
 *
 * Blöcke zu 168 Stunden ab dem Rasteranfang sind untereinander automatisch
 * wochentagsgleich, unabhängig davon, auf welchen Wochentag der Zeitraum fällt.
 * Erst mit vier vollen Wochen wird daraus ein belastbares Signal – deshalb liefert
 * ein Sieben-Tage-Import hier `null` und die Rightsizing-Logik bleibt zurückhaltend.
 */
function calculateWeeklySignals(
  samples: readonly (HourGridEntry & { slotIndex: number; value: number })[],
): { weeklyRepeatability: number | null; weeklyPeakVariation: number | null } {
  const weeks = new Map<number, Map<number, number>>();
  for (const sample of samples) {
    const weekIndex = Math.floor(sample.slotIndex / WEEK_HOURS);
    const week = weeks.get(weekIndex) ?? new Map<number, number>();
    week.set(sample.slotIndex % WEEK_HOURS, sample.value);
    weeks.set(weekIndex, week);
  }
  const profiles = [...weeks.values()].filter((week) => week.size >= WEEK_MIN_SAMPLES);
  if (profiles.length < 2) return { weeklyRepeatability: null, weeklyPeakVariation: null };

  const correlations: number[] = [];
  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < profiles.length; rightIndex += 1) {
      const sharedHours = [...profiles[leftIndex].keys()].filter((hour) => profiles[rightIndex].has(hour));
      if (sharedHours.length < WEEK_MIN_SAMPLES) continue;
      const correlation = pearsonCorrelation(
        sharedHours.map((hour) => profiles[leftIndex].get(hour)!),
        sharedHours.map((hour) => profiles[rightIndex].get(hour)!),
      );
      if (correlation !== null) correlations.push(correlation);
    }
  }

  const peaks = profiles.map((week) => Math.max(...week.values()));
  const peakMean = average(peaks) ?? 0;
  return {
    weeklyRepeatability: percentile(correlations, 0.5),
    weeklyPeakVariation: profiles.length >= WEEKLY_PEAK_MIN_WEEKS && peakMean > 0
      ? standardDeviation(peaks, peakMean) / peakMean
      : null,
  };
}

/**
 * Ob die Spitzenlast einer VM planbar ist: gleicher Wochenverlauf *und* vergleichbar
 * hohe Wochenmaxima. Ohne ausreichende Datenbasis bewusst `false` – die Aussage wird
 * nur dort getroffen, wo sie belegt ist.
 */
export function hasRepeatableWeeklyPeak(
  signals: VmWorkloadClassificationSignals,
  thresholds: VmBehaviorThresholds = VM_BEHAVIOR_THRESHOLDS,
): boolean {
  return signals.weeklyRepeatability !== null
    && signals.weeklyPeakVariation !== null
    && signals.weeklyRepeatability >= thresholds.repeatableWeeklyCorrelationMin
    && signals.weeklyPeakVariation <= thresholds.repeatableWeeklyPeakVariationMax;
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
