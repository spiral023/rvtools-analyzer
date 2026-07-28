/** Kleine, reine Statistik-Hilfsfunktionen für Zeitreihen-Aggregationen (Fill Up, VM-Profile, Rightsizing). */

export function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Perzentil als „nächster Rang“ (kein Interpolationsverfahren); bei `fraction=0.95` konservativ für Planungswerte. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}

export function standardDeviation(values: readonly number[], mean: number): number {
  if (!values.length) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
