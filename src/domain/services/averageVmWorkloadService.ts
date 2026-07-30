import type { VmWorkloadProfile, VropsTimeSeriesImport } from "@/domain/models/types";
import { buildHourGrid, WEEKDAY_ORDER } from "@/domain/services/vmWorkloadProfileService";
import { buildDistribution, type DistributionStats } from "@/lib/distribution";
import { average, percentile } from "@/lib/statistics";

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/** Ein Stundenschlitz des Importzeitraums, gemittelt über alle VMs im Scope. */
export interface AverageVmWorkloadSlot {
  timestampUtc: number;
  /** 0 = Montag … 6 = Sonntag, in der Zeitzone des Imports. */
  weekdayIndex: number;
  hour: number;
  /** Ø CPU Demand der VMs, die für diese Stunde einen Messwert liefern; `null` bei Datenlücke. */
  cpuDemandMHz: number | null;
  vmSampleCount: number;
}

/** Eine Zelle des Wochenrasters: derselbe Wochentag und dieselbe Stunde über den Import gemittelt. */
export interface AverageVmWorkloadWeekCell {
  weekdayIndex: number;
  hour: number;
  cpuDemandMHz: number | null;
  /** Anzahl der Stundenschlitze, die in diese Zelle eingegangen sind (bei einer Woche genau 1). */
  slotCount: number;
}

/**
 * Beobachtete Last der „durchschnittlichen VM": alle Profile im aktuellen Filter,
 * einmal als Streuung über VMs und einmal als gemittelte Zeitreihe über den
 * Importzeitraum. Rein beschreibend – keine Empfehlung, keine Extrapolation.
 */
export interface AverageVmWorkload {
  importId: string;
  timezone: string;
  rangeStartUtc: number;
  rangeEndUtc: number;
  /** VMs im Filter, für die der Import ein Profil liefert. */
  vmCount: number;
  /** VMs im Filter insgesamt – die Differenz zu `vmCount` ist der nicht abgedeckte Teil. */
  scopedVmCount: number;
  /** Ø Datenabdeckung der beteiligten Profile (0–1). */
  coverageRatio: number;
  /** Streuung des Ø CPU Demand je VM in MHz. */
  demandPerVm: DistributionStats | null;
  /** Streuung des Ready-P95 je VM in Prozent. */
  readyP95PerVm: DistributionStats | null;
  /**
   * Ø konfigurierte CPU-Kapazität der beteiligten VMs in MHz (vCPU × MHz je Kern) – die
   * Bezugsgröße aller Prozentangaben der Durchschnitts-VM. Gemittelt über die Profile mit
   * bekannter Hostfrequenz; `null`, wenn für keine VM eine Frequenz vorliegt.
   */
  configuredCpuCapacityMHz: number | null;
  /** Zeitliche Aggregate der gemittelten Zeitreihe – so sieht die typische VM über die Woche aus. */
  timeline: { average: number | null; p95: number | null; max: number | null };
  slots: AverageVmWorkloadSlot[];
  weekGrid: AverageVmWorkloadWeekCell[];
  /**
   * Index in `slots`, der auf denselben Wochentag und dieselbe Stunde wie „jetzt" fällt.
   * `null`, wenn der Import diese Stunde nicht enthält. Deckt der Import mehrere Wochen ab,
   * zeigt der Marker die jüngste passende Stunde.
   */
  nowSlotIndex: number | null;
  /** Wochentag und Stunde von „jetzt" in der Zeitzone des Imports – auch ohne passenden Slot belegt. */
  now: { weekdayIndex: number; hour: number };
}

export interface BuildAverageVmWorkloadInput {
  import: VropsTimeSeriesImport;
  /** Bereits auf den aktuellen Filter reduzierte Profile. */
  profiles: readonly VmWorkloadProfile[];
  /** VMs im Filter insgesamt, für die Abdeckungsangabe. */
  scopedVmCount: number;
  /** Referenzzeitpunkt des Jetzt-Markers; überschreibbar für Tests. */
  now?: Date;
}

/**
 * Verdichtet die gescopten VM-Profile zur beobachteten Last einer Durchschnitts-VM.
 * Gibt `null` zurück, wenn kein Profil im Scope liegt – dann existiert keine
 * gemeinsame Zeitreihe, die sich mitteln ließe.
 */
export function buildAverageVmWorkload({
  import: importMeta,
  profiles,
  scopedVmCount,
  now = new Date(),
}: BuildAverageVmWorkloadInput): AverageVmWorkload | null {
  if (profiles.length === 0) return null;

  const grid = buildHourGrid(importMeta);
  const indexByTimestamp = new Map(grid.map((entry, index) => [entry.timestampUtc, index]));
  const sums = new Float64Array(grid.length);
  const counts = new Int32Array(grid.length);
  for (const profile of profiles) {
    for (const point of profile.hourly) {
      if (point.cpuDemandMHz === null || !Number.isFinite(point.cpuDemandMHz)) continue;
      const index = indexByTimestamp.get(point.timestampUtc);
      if (index === undefined) continue;
      sums[index] += point.cpuDemandMHz;
      counts[index] += 1;
    }
  }

  const slots: AverageVmWorkloadSlot[] = grid.map((entry, index) => ({
    timestampUtc: entry.timestampUtc,
    weekdayIndex: entry.weekdayIndex,
    hour: entry.hour,
    cpuDemandMHz: counts[index] > 0 ? sums[index] / counts[index] : null,
    vmSampleCount: counts[index],
  }));

  const slotValues = slots.flatMap((slot) => (slot.cpuDemandMHz === null ? [] : [slot.cpuDemandMHz]));
  const nowSlot = resolveWeekSlot(importMeta.timezone, now);

  return {
    importId: importMeta.id,
    timezone: importMeta.timezone,
    rangeStartUtc: importMeta.rangeStartUtc,
    rangeEndUtc: importMeta.rangeEndUtc,
    vmCount: profiles.length,
    scopedVmCount,
    coverageRatio: average(profiles.map((profile) => profile.demand.coverageRatio)) ?? 0,
    demandPerVm: buildDistribution(profiles.map((profile) => profile.demand.average)),
    readyP95PerVm: buildDistribution(profiles.map((profile) => profile.ready.p95)),
    configuredCpuCapacityMHz: average(
      profiles.flatMap((profile) => {
        const value = profile.configuredCpuCapacityMHz;
        return value !== null && Number.isFinite(value) && value > 0 ? [value] : [];
      }),
    ),
    timeline: {
      average: average(slotValues),
      p95: percentile(slotValues, 0.95),
      max: slotValues.length ? Math.max(...slotValues) : null,
    },
    slots,
    weekGrid: buildWeekGrid(slots),
    nowSlotIndex: findLatestSlotIndex(slots, nowSlot),
    now: nowSlot,
  };
}

/** Faltet die Stundenschlitze auf das 7 × 24-Raster; ungemessene Zellen bleiben `null`. */
function buildWeekGrid(slots: readonly AverageVmWorkloadSlot[]): AverageVmWorkloadWeekCell[] {
  const buckets = new Map<string, number[]>();
  for (const slot of slots) {
    if (slot.cpuDemandMHz === null || slot.weekdayIndex < 0) continue;
    const key = `${slot.weekdayIndex}-${slot.hour}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(slot.cpuDemandMHz);
    buckets.set(key, bucket);
  }
  return Array.from({ length: WEEKDAY_LABELS.length }, (_, weekdayIndex) =>
    Array.from({ length: 24 }, (_, hour) => {
      const bucket = buckets.get(`${weekdayIndex}-${hour}`) ?? [];
      return { weekdayIndex, hour, cpuDemandMHz: average(bucket), slotCount: bucket.length };
    }),
  ).flat();
}

const weekSlotFormatterByTimezone = new Map<string, Intl.DateTimeFormat>();

/** Wochentag (0 = Montag) und Stunde eines Zeitpunkts in der Zeitzone des Imports. */
export function resolveWeekSlot(timezone: string, at: Date): { weekdayIndex: number; hour: number } {
  let formatter = weekSlotFormatterByTimezone.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", weekday: "short" });
    weekSlotFormatterByTimezone.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  return {
    weekdayIndex: WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]),
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24,
  };
}

function findLatestSlotIndex(
  slots: readonly AverageVmWorkloadSlot[],
  target: { weekdayIndex: number; hour: number },
): number | null {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index].weekdayIndex === target.weekdayIndex && slots[index].hour === target.hour) return index;
  }
  return null;
}
