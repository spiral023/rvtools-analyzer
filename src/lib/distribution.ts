import { average, percentile } from "@/lib/statistics";

/**
 * Fünf-Punkte-Zusammenfassung einer Wertemenge samt P95 und Mittelwert – die
 * Datenbasis eines Boxplots. Bewusst ohne Einheit: die Anzeige entscheidet, ob
 * MiB, MHz, Prozent oder Kerne formatiert werden.
 */
export interface DistributionStats {
  /** Anzahl der Werte, die in die Verteilung eingegangen sind (ohne Lücken). */
  count: number;
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
  average: number;
}

/**
 * Verdichtet Messwerte zu einer Verteilung. Lücken (`null`, `undefined`, `NaN`)
 * fallen heraus, statt als 0 zu zählen – sonst zöge eine einzelne fehlende
 * Angabe das Minimum grundlos auf 0. Ohne verwertbaren Wert `null`.
 */
export function buildDistribution(values: Iterable<number | null | undefined>): DistributionStats | null {
  const finite: number[] = [];
  for (const value of values) {
    if (value !== null && value !== undefined && Number.isFinite(value)) finite.push(value);
  }
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0],
    p25: percentile(sorted, 0.25)!,
    p50: percentile(sorted, 0.5)!,
    p75: percentile(sorted, 0.75)!,
    p95: percentile(sorted, 0.95)!,
    max: sorted[sorted.length - 1],
    average: average(sorted)!,
  };
}
