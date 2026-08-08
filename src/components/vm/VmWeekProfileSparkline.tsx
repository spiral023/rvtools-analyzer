import type { VmWorkloadProfile } from "@/domain/models/types";
import { resolveWeekSlot } from "@/domain/services/averageVmWorkloadService";

const WEEK_HOURS = 7 * 24;
const averageWeekCache = new WeakMap<VmWorkloadProfile, readonly (number | null)[]>();

export type VmWeekProfileMode = "recent" | "average";

function averageWeek(profile: VmWorkloadProfile): readonly (number | null)[] {
  const cached = averageWeekCache.get(profile);
  if (cached) return cached;
  const sums = new Float64Array(WEEK_HOURS);
  const counts = new Uint16Array(WEEK_HOURS);
  for (const point of profile.hourly) {
    if (point.cpuDemandMHz === null || !Number.isFinite(point.cpuDemandMHz)) continue;
    const { weekdayIndex, hour } = resolveWeekSlot(profile.timezone, new Date(point.timestampUtc));
    if (weekdayIndex < 0) continue;
    const index = weekdayIndex * 24 + hour;
    sums[index] += point.cpuDemandMHz;
    counts[index] += 1;
  }
  const values = Array.from({ length: WEEK_HOURS }, (_, index) => counts[index] > 0 ? sums[index] / counts[index] : null);
  averageWeekCache.set(profile, values);
  return values;
}

function lineSegments(values: readonly (number | null)[], width: number, height: number, max: number): string[] {
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const segments: string[] = [];
  let current: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${(index * stepX).toFixed(1)},${(height - (value / max) * height).toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

/** Kompakte Darstellung der jüngsten oder über den Messmonat gemittelten Woche. */
export function VmWeekProfileSparkline({ profile, mode = "recent" }: { profile: VmWorkloadProfile; mode?: VmWeekProfileMode }) {
  const values = mode === "average"
    ? averageWeek(profile)
    : profile.hourly.slice(-WEEK_HOURS).map((point) => point.cpuDemandMHz);
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const max = finite.reduce((largest, value) => Math.max(largest, value), 1);
  const width = 120;
  const height = 26;
  const segments = lineSegments(values, width, height, max);
  const label = mode === "average" ? "Durchschnittliche CPU-Demand-Woche" : "CPU Demand der letzten sieben Tage";

  return (
    <svg width={width} height={height} className={mode === "average" ? "text-chart-2" : "text-primary"} role="img" aria-label={label}>
      <title>{label}</title>
      {[1, 2, 3, 4, 5, 6].map((day) => <line key={day} x1={(day * width) / 7} x2={(day * width) / 7} y1={0} y2={height} stroke="hsl(var(--border))" strokeWidth="0.5" />)}
      {segments.map((points, index) => <polyline key={index} points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />)}
    </svg>
  );
}
