/**
 * Verdichtung stündlicher Verlaufsdaten für die Detailcharts.
 *
 * Sieben Tage sind 168 Stundenwerte und lassen sich eins zu eins zeichnen. Ein
 * Monat sind 744 — bei einer Chartbreite von rund 700 Pixeln bliebe weniger als
 * ein Pixel je Wert, die Linie würde zur Fläche und das Rendern spürbar träge.
 *
 * Verdichtet wird deshalb zu Zeitfenstern, aber ausdrücklich **nicht** durch
 * reine Mittelwertbildung: Die Spitzen sind der für das Rightsizing
 * interessante Teil und würden dabei gerade verschwinden. Jedes Fenster behält
 * seinen Mittelwert als Linie sowie sein Minimum und Maximum als Band.
 */

export interface TrendSamplePoint {
  timestampMs: number;
  /** Mittlere CPU-Last des Zeitpunkts. */
  cpu: number | null;
  /**
   * Höchstwert innerhalb der Stunde, sofern die Quelle ihn liefert
   * (`Demand Max`). Ohne diese Metrik `null`; das Band entsteht dann allein
   * aus der Streuung innerhalb des Verdichtungsfensters.
   */
  cpuPeak: number | null;
  secondary: number | null;
}

export interface TrendBandPoint extends TrendSamplePoint {
  /** Untere Bandgrenze: kleinster Wert des Fensters. */
  cpuLow: number | null;
  /** Obere Bandgrenze: größter Wert des Fensters, inklusive Stundenmaxima. */
  cpuHigh: number | null;
  /** Anzahl der zusammengefassten Ausgangspunkte; 1 bedeutet unverdichtet. */
  sampleCount: number;
}

/** Richtwert aus der Chartbreite: darunter bleibt je Punkt mehr als ein Pixel. */
export const DEFAULT_MAX_TREND_POINTS = 336;

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Fasst die Punkte auf höchstens `maxPoints` Fenster zusammen und ergänzt je
 * Fenster die Bandgrenzen. Liegt die Reihe bereits unter der Grenze, bleibt sie
 * unverändert — nur die Bandgrenzen kommen hinzu.
 */
export function downsampleTrendPoints(
  points: readonly TrendSamplePoint[],
  maxPoints: number = DEFAULT_MAX_TREND_POINTS,
): TrendBandPoint[] {
  if (points.length === 0) return [];

  const bucketSize = Math.max(1, Math.ceil(points.length / Math.max(1, maxPoints)));
  if (bucketSize === 1) {
    return points.map((point) => ({
      ...point,
      cpuLow: point.cpu,
      cpuHigh: point.cpuPeak ?? point.cpu,
      sampleCount: 1,
    }));
  }

  const buckets: TrendBandPoint[] = [];
  for (let start = 0; start < points.length; start += bucketSize) {
    const bucket = points.slice(start, start + bucketSize);
    const cpuValues = bucket.map((point) => point.cpu).filter((value): value is number => value !== null);
    // Für die Obergrenze zählt das Stundenmaximum, wo vorhanden — sonst der Mittelwert.
    const highValues = bucket
      .map((point) => point.cpuPeak ?? point.cpu)
      .filter((value): value is number => value !== null);
    const secondaryValues = bucket.map((point) => point.secondary).filter((value): value is number => value !== null);
    const peakValues = bucket.map((point) => point.cpuPeak).filter((value): value is number => value !== null);

    buckets.push({
      timestampMs: bucket[0].timestampMs,
      cpu: averageOf(cpuValues),
      cpuPeak: peakValues.length > 0 ? Math.max(...peakValues) : null,
      // Kennzahlen wie CPU Ready sind bereits Stundenmaxima; über das Fenster
      // hinweg ist deshalb ebenfalls das Maximum die ehrliche Verdichtung.
      secondary: secondaryValues.length > 0 ? Math.max(...secondaryValues) : null,
      cpuLow: cpuValues.length > 0 ? Math.min(...cpuValues) : null,
      cpuHigh: highValues.length > 0 ? Math.max(...highValues) : null,
      sampleCount: bucket.length,
    });
  }
  return buckets;
}

/** Beschreibt den abgedeckten Zeitraum in Tagen, für Überschriften und Hinweistexte. */
export function describeTrendRange(pointCount: number, intervalMinutes = 60): string {
  const days = Math.round((pointCount * intervalMinutes) / (60 * 24));
  if (days <= 0) return "unbekannter Zeitraum";
  return days === 1 ? "1 Tag" : `${days} Tage`;
}
