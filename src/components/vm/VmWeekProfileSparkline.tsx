import type { VmWorkloadProfile } from "@/domain/models/types";

const WEEK_HOURS = 7 * 24;

/** Kompakte Darstellung der jüngsten sieben Tage, gemeinsam für Profil und Rightsizing. */
export function VmWeekProfileSparkline({ profile }: { profile: VmWorkloadProfile }) {
  const values = profile.hourly.slice(-WEEK_HOURS).map((point) => point.cpuDemandMHz);
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const max = Math.max(...finite, 1);
  const width = 120;
  const height = 26;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => `${(index * stepX).toFixed(1)},${(height - (value === null ? 0 : (value / max) * height)).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="text-primary" role="img" aria-label="CPU-Demand-Profil der jüngsten sieben Tage">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
