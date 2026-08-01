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

/**
 * Ein Punkt der durchschnittlichen Woche. `timestampMs` liegt auf einer
 * künstlichen Montag-bis-Sonntag-Woche und dient ausschließlich der Chartachse.
 */
export interface AverageWeekTrendPoint extends TrendBandPoint {
  /** 0 = Montag 00:00, 167 = Sonntag 23:00. */
  weekHour: number;
}

/** Richtwert aus der Chartbreite: darunter bleibt je Punkt mehr als ein Pixel. */
export const DEFAULT_MAX_TREND_POINTS = 336;

/** Oberhalb dieser CPU-Auslastung beginnt der visuell markierte Vermeidungsbereich. */
export const CPU_DEMAND_AVOIDANCE_THRESHOLD_PCT = 80;

/** Liefert die 80-%-Schwelle passend zur gewählten Chart-Einheit. */
export function cpuDemandAvoidanceThreshold(
  cpuCapacityMHz: number | null,
  unit: "absolute" | "percent",
): number | null {
  if (unit === "percent") return CPU_DEMAND_AVOIDANCE_THRESHOLD_PCT;
  if (cpuCapacityMHz === null || !Number.isFinite(cpuCapacityMHz) || cpuCapacityMHz <= 0) return null;
  return (cpuCapacityMHz * CPU_DEMAND_AVOIDANCE_THRESHOLD_PCT) / 100 / 1_000;
}

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateBuckets(points: readonly TrendSamplePoint[], bucketSize: number): TrendBandPoint[] {
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
      // Kennzahlen wie CPU Ready sind bereits Stundenmaxima; über ein Zeitfenster
      // hinweg ist deshalb ebenfalls das Maximum die ehrliche Verdichtung.
      secondary: secondaryValues.length > 0 ? Math.max(...secondaryValues) : null,
      cpuLow: cpuValues.length > 0 ? Math.min(...cpuValues) : null,
      cpuHigh: highValues.length > 0 ? Math.max(...highValues) : null,
      sampleCount: bucket.length,
    });
  }
  return buckets;
}

/** Verdichtet auf ein ausdrücklich gewähltes 1- oder Mehrstundenfenster. */
export function aggregateTrendPoints(
  points: readonly TrendSamplePoint[],
  windowHours: number,
): TrendBandPoint[] {
  if (points.length === 0) return [];
  return aggregateBuckets(points, Math.max(1, Math.round(windowHours)));
}

/**
 * Legt alle Messwochen auf eine gemeinsame Montag-bis-Sonntag-Woche.
 * Die Linie zeigt je Wochenstunde den Mittelwert; das Band behält das kleinste
 * Mittel und den höchsten beobachteten Stundenpeak. CPU Ready wird hier – anders
 * als bei einem Verdichtungsfenster – ebenfalls gemittelt, weil die Ansicht eine
 * typische Woche und nicht den schlimmsten historischen Wert beschreibt.
 */
export function buildAverageWeekTrendPoints(
  points: readonly TrendSamplePoint[],
): AverageWeekTrendPoint[] {
  const slots = new Map<number, TrendSamplePoint[]>();
  for (const point of points) {
    const date = new Date(point.timestampMs);
    const mondayBasedDay = (date.getDay() + 6) % 7;
    const weekHour = mondayBasedDay * 24 + date.getHours();
    const slot = slots.get(weekHour);
    if (slot) slot.push(point);
    else slots.set(weekHour, [point]);
  }

  return [...slots.entries()]
    .sort(([left], [right]) => left - right)
    .map(([weekHour, slot]) => {
      const cpuValues = slot.map((point) => point.cpu).filter((value): value is number => value !== null);
      const highValues = slot
        .map((point) => point.cpuPeak ?? point.cpu)
        .filter((value): value is number => value !== null);
      const secondaryValues = slot.map((point) => point.secondary).filter((value): value is number => value !== null);
      const peakValues = slot.map((point) => point.cpuPeak).filter((value): value is number => value !== null);
      const day = Math.floor(weekHour / 24);
      const hour = weekHour % 24;

      return {
        // 01.01.2024 war ein Montag. Die lokale Konstruktion hält Achse und
        // getDay()/getHours() unabhängig von der Browser-Zeitzone konsistent.
        timestampMs: new Date(2024, 0, 1 + day, hour).getTime(),
        weekHour,
        cpu: averageOf(cpuValues),
        cpuPeak: peakValues.length > 0 ? Math.max(...peakValues) : null,
        secondary: averageOf(secondaryValues),
        cpuLow: cpuValues.length > 0 ? Math.min(...cpuValues) : null,
        cpuHigh: highValues.length > 0 ? Math.max(...highValues) : null,
        sampleCount: slot.length,
      };
    });
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
  return aggregateBuckets(points, bucketSize);
}

/** Beschreibt den abgedeckten Zeitraum in Tagen, für Überschriften und Hinweistexte. */
export function describeTrendRange(pointCount: number, intervalMinutes = 60): string {
  const days = Math.round((pointCount * intervalMinutes) / (60 * 24));
  if (days <= 0) return "unbekannter Zeitraum";
  return days === 1 ? "1 Tag" : `${days} Tage`;
}
