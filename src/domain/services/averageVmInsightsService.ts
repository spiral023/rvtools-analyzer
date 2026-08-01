import type { VmWorkloadProfile, VropsTimeSeriesImport } from "@/domain/models/types";
import { buildHourGrid } from "@/domain/services/vmWorkloadProfileService";
import { resolveWeekSlot, WEEKDAY_LABELS } from "@/domain/services/averageVmWorkloadService";
import { buildDistribution, type DistributionStats } from "@/lib/distribution";
import { average } from "@/lib/statistics";

export { WEEKDAY_LABELS };

/**
 * Ab dieser VM-Zahl trägt eine Box-Darstellung; darunter zeigt die Oberfläche die
 * Einzelwerte, weil ein Boxplot aus fünf Punkten eine Genauigkeit vortäuscht, die
 * die Datenlage nicht hergibt.
 */
export const DISTRIBUTION_MIN_VMS_FOR_BOX = 15;

/** P95-Auslastung, unter der eine VM dauerhaft weit unter ihrer Zuteilung bleibt. */
const LOW_UTILIZATION_P95_PCT = 10;
/** Ab diesem Ready-P95 gilt CPU-Contention als spürbar – dieselbe Grenze wie im Streuungsstreifen. */
const READY_ALERT_P95_PCT = 5;

/**
 * Ein Stundenschlitz als Verteilung **über die VMs** statt als Mittelwert.
 *
 * Der Mittelwert über viele VMs beschreibt bei schiefen Beständen keine reale VM: an
 * 4.018 Profilen gemessen liegt er zur Spitzenstunde bei 11,2 % der Kapazität, während
 * der Median 3,1 % und der P95 49,5 % beträgt. Erst die Quantile zeigen gleichzeitig,
 * wie die typische VM läuft und wie weit die aktivsten davon abweichen.
 */
export interface DemandBandSlot {
  index: number;
  timestampUtc: number;
  /** 0 = Montag … 6 = Sonntag, in der Zeitzone des Imports. */
  weekdayIndex: number;
  hour: number;
  /** Quantile des CPU Demand über alle VMs dieser Stunde in MHz; `null` bei Datenlücke. */
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  /** Mittelwert derselben Stunde – nur noch als Vergleichswert, nicht als Hauptsignal. */
  mean: number | null;
  vmSampleCount: number;
}

/**
 * Wie ungleich die Last über die VMs verteilt ist. `vmsForHalfOfDemand` ist die
 * greifbarste Form: Sie funktioniert bei acht VMs genauso wie bei viertausend.
 */
export interface DemandConcentration {
  /** Wie viele der aktivsten VMs zusammen die Hälfte des Demands stellen. */
  vmsForHalfOfDemand: number;
  /** Anteil des Gesamt-Demands, der auf das aktivste Zehntel entfällt (0–100). */
  topDecileSharePct: number;
  /** Anteil der aktivsten Einzel-VM am Gesamt-Demand (0–100). */
  topVmSharePct: number;
}

/**
 * Eine Kennzahl als Streuung über die VMs. `samples` ist nur bei kleinen Auswahlen
 * belegt: Unter fünfzehn VMs zeigt die Oberfläche die Einzelwerte, weil ein Boxplot
 * aus so wenigen Punkten eine Genauigkeit suggeriert, die nicht da ist.
 */
export interface MetricSpread {
  stats: DistributionStats | null;
  samples: number[] | null;
}

/** Zählwerke für die Handlungszeile – alle aus vorhandenen Profilkennzahlen abgeleitet. */
export interface DemandFindings {
  /** VMs, deren P95-Demand unter 10 % der Zuteilung bleibt. */
  lowUtilizationCount: number;
  /** VMs mit mindestens einer Stunde über 90 % ihrer Kapazität. */
  nearCapacityCount: number;
  /** VMs mit Ready-P95 über 5 %. */
  readyAlertCount: number;
  /** VMs, für die eine Auslastungsaussage möglich war (Nenner der Anteile). */
  ratedCount: number;
}

export interface AverageVmInsights {
  importId: string;
  timezone: string;
  rangeStartUtc: number;
  rangeEndUtc: number;
  vmCount: number;
  scopedVmCount: number;
  coverageRatio: number;
  /** Ø konfigurierte CPU-Kapazität je VM in MHz – Bezugsgröße aller Prozentangaben. */
  configuredCpuCapacityMHz: number | null;

  /** Streuung des über den Import gemittelten Demands je VM, in MHz. */
  demandAvgPerVm: MetricSpread;
  /** Streuung des P95-Demands je VM – die Größe, die eine Zielgröße trägt. */
  demandP95PerVm: MetricSpread;
  /**
   * Streuung der wiederkehrenden Spitze je VM: P99 des höchsten Demands *innerhalb*
   * einer Stunde. Das Stundenmittel glättet Spitzen weg – über denselben Bestand liegt
   * dieser Wert im Median 4,2-mal höher als der P95 der Stundenmittel.
   */
  demandPeakPerVm: MetricSpread;
  readyP95PerVm: MetricSpread;

  bands: DemandBandSlot[];
  concentration: DemandConcentration | null;
  findings: DemandFindings;

  /** Index in `bands`, der auf Wochentag und Stunde von „jetzt" fällt; `null`, wenn nicht enthalten. */
  nowSlotIndex: number | null;
  now: { weekdayIndex: number; hour: number };
}

export interface BuildAverageVmInsightsInput {
  import: VropsTimeSeriesImport;
  /** Bereits auf den aktuellen Filter reduzierte Profile. */
  profiles: readonly VmWorkloadProfile[];
  scopedVmCount: number;
  now?: Date;
}

/**
 * Verdichtet die gescopten Profile zu einer Sicht, die bei jeder Filtergröße trägt.
 *
 * Die beiden Achsen skalieren gegenläufig: Bei einer einzelnen VM ist das Zeitprofil
 * scharf und die Streuung leer, bei tausenden VMs ist das gemittelte Zeitprofil flach,
 * dafür die Streuung aussagekräftig. Beide werden deshalb immer berechnet – die
 * Oberfläche gewichtet sie, statt zwischen Darstellungen umzuschalten.
 */
export function buildAverageVmInsights({
  import: importMeta,
  profiles,
  scopedVmCount,
  now = new Date(),
}: BuildAverageVmInsightsInput): AverageVmInsights | null {
  if (profiles.length === 0) return null;

  const grid = buildHourGrid(importMeta);
  const indexByTimestamp = new Map(grid.map((entry, index) => [entry.timestampUtc, index]));

  // Zwei Durchläufe: erst zählen, dann in exakt passende typisierte Arrays füllen. Das
  // spart bei 4.018 VMs × 744 Stunden das Nachwachsen von Arrays und erlaubt die
  // numerische Sortierung von Float64Array statt eines Comparators je Vergleich.
  const counts = new Int32Array(grid.length);
  const sums = new Float64Array(grid.length);
  for (const profile of profiles) {
    for (const point of profile.hourly) {
      if (point.cpuDemandMHz === null || !Number.isFinite(point.cpuDemandMHz)) continue;
      const index = indexByTimestamp.get(point.timestampUtc);
      if (index === undefined) continue;
      counts[index] += 1;
      sums[index] += point.cpuDemandMHz;
    }
  }

  const buckets: Float64Array[] = grid.map((_, index) => new Float64Array(counts[index]));
  const cursors = new Int32Array(grid.length);
  for (const profile of profiles) {
    for (const point of profile.hourly) {
      if (point.cpuDemandMHz === null || !Number.isFinite(point.cpuDemandMHz)) continue;
      const index = indexByTimestamp.get(point.timestampUtc);
      if (index === undefined) continue;
      buckets[index][cursors[index]++] = point.cpuDemandMHz;
    }
  }

  const bands: DemandBandSlot[] = grid.map((entry, index) => {
    const bucket = buckets[index];
    if (bucket.length === 0) {
      return {
        index, timestampUtc: entry.timestampUtc, weekdayIndex: entry.weekdayIndex, hour: entry.hour,
        p25: null, p50: null, p75: null, p95: null, mean: null, vmSampleCount: 0,
      };
    }
    bucket.sort();
    return {
      index,
      timestampUtc: entry.timestampUtc,
      weekdayIndex: entry.weekdayIndex,
      hour: entry.hour,
      p25: quantile(bucket, 0.25),
      p50: quantile(bucket, 0.5),
      p75: quantile(bucket, 0.75),
      p95: quantile(bucket, 0.95),
      mean: sums[index] / bucket.length,
      vmSampleCount: bucket.length,
    };
  });

  const nowSlot = resolveWeekSlot(importMeta.timezone, now);

  return {
    importId: importMeta.id,
    timezone: importMeta.timezone,
    rangeStartUtc: importMeta.rangeStartUtc,
    rangeEndUtc: importMeta.rangeEndUtc,
    vmCount: profiles.length,
    scopedVmCount,
    coverageRatio: average(profiles.map((profile) => profile.demand.coverageRatio)) ?? 0,
    configuredCpuCapacityMHz: average(
      profiles.flatMap((profile) => {
        const value = profile.configuredCpuCapacityMHz;
        return value !== null && Number.isFinite(value) && value > 0 ? [value] : [];
      }),
    ),
    demandAvgPerVm: buildSpread(profiles.map((profile) => profile.demand.average)),
    demandP95PerVm: buildSpread(profiles.map((profile) => profile.demand.p95)),
    demandPeakPerVm: buildSpread(profiles.map((profile) => profile.demandMax.p99)),
    readyP95PerVm: buildSpread(profiles.map((profile) => profile.ready.p95)),
    bands,
    concentration: buildConcentration(profiles),
    findings: buildFindings(profiles),
    nowSlotIndex: findLatestSlotIndex(bands, nowSlot),
    now: nowSlot,
  };
}

/** Verteilung samt Einzelwerten, solange die Auswahl klein genug für eine Punktdarstellung ist. */
function buildSpread(values: readonly (number | null)[]): MetricSpread {
  const stats = buildDistribution(values);
  if (stats === null || stats.count >= DISTRIBUTION_MIN_VMS_FOR_BOX) return { stats, samples: null };
  const samples = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);
  return { stats, samples };
}

/** Perzentil als „nächster Rang" auf einem bereits sortierten Array – wie `percentile()`. */
function quantile(sorted: Float64Array, fraction: number): number {
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[rank];
}

/**
 * Ohne dieses Maß lässt sich der Median nicht einordnen: Tragen wenige VMs die Last,
 * beschreibt jede Aggregatzahl die Mehrheit korrekt und den Bestand trotzdem falsch.
 */
function buildConcentration(profiles: readonly VmWorkloadProfile[]): DemandConcentration | null {
  const values = profiles
    .map((profile) => profile.demand.average)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;

  let running = 0;
  let vmsForHalfOfDemand = values.length;
  for (let index = 0; index < values.length; index += 1) {
    running += values[index];
    if (running >= total / 2) { vmsForHalfOfDemand = index + 1; break; }
  }
  const decileCount = Math.max(1, Math.ceil(values.length * 0.1));
  const decileSum = values.slice(0, decileCount).reduce((sum, value) => sum + value, 0);

  return {
    vmsForHalfOfDemand,
    topDecileSharePct: (decileSum / total) * 100,
    topVmSharePct: (values[0] / total) * 100,
  };
}

function buildFindings(profiles: readonly VmWorkloadProfile[]): DemandFindings {
  let lowUtilizationCount = 0;
  let nearCapacityCount = 0;
  let readyAlertCount = 0;
  let ratedCount = 0;

  for (const profile of profiles) {
    const utilization = profile.signals.utilizationP95Pct;
    if (utilization !== null && Number.isFinite(utilization)) {
      ratedCount += 1;
      if (utilization < LOW_UTILIZATION_P95_PCT) lowUtilizationCount += 1;
    }
    const hoursAbove90 = profile.capacitySignals.hoursAboveCapacity90;
    if (hoursAbove90 !== null && hoursAbove90 > 0) nearCapacityCount += 1;
    const readyP95 = profile.ready.p95;
    if (readyP95 !== null && readyP95 > READY_ALERT_P95_PCT) readyAlertCount += 1;
  }

  return { lowUtilizationCount, nearCapacityCount, readyAlertCount, ratedCount };
}

function findLatestSlotIndex(
  bands: readonly DemandBandSlot[],
  target: { weekdayIndex: number; hour: number },
): number | null {
  for (let index = bands.length - 1; index >= 0; index -= 1) {
    if (bands[index].weekdayIndex === target.weekdayIndex && bands[index].hour === target.hour) return index;
  }
  return null;
}
