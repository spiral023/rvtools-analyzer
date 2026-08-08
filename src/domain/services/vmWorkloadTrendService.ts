import type { VmWorkloadTrend } from "@/domain/models/types";
import { average, percentile } from "@/lib/statistics";

export interface WorkloadTrendPoint {
  dayKey: string;
  value: number | null | undefined;
}

export interface WorkloadTrendOptions {
  /** 100 bei Prozentreihen, MHz-Kapazität bei CPU. */
  capacity: number | null;
  /** Minimale absolute Änderung in Kapazitätspunkten für stark/normal steigend. */
  strongCapacityChangePct?: number;
  capacityChangePct?: number;
}

export const EMPTY_WORKLOAD_TREND: VmWorkloadTrend = {
  direction: "not-computable",
  days: 0,
  slopePerDay: null,
  projectedChange: null,
  relativeChangePct: null,
  capacityChangePct: null,
  rSquared: null,
  firstWeekMedian: null,
  lastWeekMedian: null,
};

/**
 * Erkennt längerfristige Änderungen ohne durch einzelne Stundenpeaks getäuscht zu
 * werden. Grundlage sind Tagesmediane und eine lineare Regression über mindestens
 * 14 ausreichend belegte Tage.
 */
export function calculateWorkloadTrend(
  points: readonly WorkloadTrendPoint[],
  options: WorkloadTrendOptions,
): VmWorkloadTrend {
  const byDay = new Map<string, number[]>();
  for (const point of points) {
    if (point.value === null || point.value === undefined || !Number.isFinite(point.value)) continue;
    const day = byDay.get(point.dayKey) ?? [];
    day.push(point.value);
    byDay.set(point.dayKey, day);
  }
  const daily: number[] = [];
  for (const values of byDay.values()) {
    if (values.length < 12) continue;
    const median = percentile(values, 0.5);
    if (median !== null) daily.push(median);
  }
  if (daily.length < 14) return { ...EMPTY_WORKLOAD_TREND, days: daily.length };

  const xMean = (daily.length - 1) / 2;
  const yMean = average(daily) ?? 0;
  let numerator = 0;
  let xSquared = 0;
  let totalSquared = 0;
  for (let index = 0; index < daily.length; index += 1) {
    numerator += (index - xMean) * (daily[index] - yMean);
    xSquared += (index - xMean) ** 2;
    totalSquared += (daily[index] - yMean) ** 2;
  }
  const slopePerDay = xSquared > 0 ? numerator / xSquared : 0;
  const projectedChange = slopePerDay * (daily.length - 1);
  let residualSquared = 0;
  for (let index = 0; index < daily.length; index += 1) {
    const fitted = yMean + slopePerDay * (index - xMean);
    residualSquared += (daily[index] - fitted) ** 2;
  }
  const rSquared = totalSquared > 0 ? Math.max(0, 1 - residualSquared / totalSquared) : 0;
  const median = percentile(daily, 0.5) ?? 0;
  const baseline = Math.max(Math.abs(median), options.capacity === 100 ? 1 : 10);
  const relativeChangePct = (projectedChange / baseline) * 100;
  const capacityChangePct = options.capacity && options.capacity > 0 ? (projectedChange / options.capacity) * 100 : null;
  const magnitude = capacityChangePct ?? relativeChangePct;
  const strongMagnitude = options.strongCapacityChangePct ?? (options.capacity === 100 ? 8 : 2.5);
  const normalMagnitude = options.capacityChangePct ?? (options.capacity === 100 ? 4 : 1);
  const direction = rSquared >= 0.65 && relativeChangePct >= 40 && magnitude >= strongMagnitude
    ? "strongly-rising"
    : rSquared >= 0.5 && relativeChangePct >= 20 && magnitude >= normalMagnitude
      ? "rising"
      : rSquared >= 0.5 && relativeChangePct <= -20 && magnitude <= -normalMagnitude
        ? "falling"
        : "stable";

  return {
    direction,
    days: daily.length,
    slopePerDay,
    projectedChange,
    relativeChangePct,
    capacityChangePct,
    rSquared,
    firstWeekMedian: percentile(daily.slice(0, 7), 0.5),
    lastWeekMedian: percentile(daily.slice(-7), 0.5),
  };
}

export function isRisingWorkloadTrend(trend: VmWorkloadTrend | null | undefined): boolean {
  return trend?.direction === "rising" || trend?.direction === "strongly-rising";
}
