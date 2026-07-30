import { buildDistribution } from "@/lib/distribution";

/**
 * Farbskala eines Rasters, deren Nullpunkt der Median der Werte ist – nicht die Null.
 *
 * Eine Skala von 0 bis Maximum funktioniert nur bei Reihen, die tatsächlich bis in die
 * Nähe der Null fallen. Gemittelte Bestände tun das nie: über einige Tausend VMs bleibt
 * der Durchschnitt selbst nachts bei mehr als der Hälfte des Tagesmaximums, sodass jede
 * Zelle im obersten Skalendrittel landet und das Wochenmuster verschwindet.
 *
 * Deshalb trennt die Skala am Median und spreizt beide Hälften getrennt: oberhalb bis
 * zum P95, unterhalb bis zum P25. Ablesbar ist dann „welche Stunden liegen über dem
 * typischen Niveau“ – bei gemittelten Beständen die eigentliche Frage, und bei einzelnen
 * Systemen mit ruhigen Nachtstunden weiterhin dasselbe Bild wie zuvor.
 */
export interface HeatScale {
  /** Untere Bezugsgrenze (P25): alles darunter ist maximal blass. */
  lower: number;
  median: number;
  /** Obere Bezugsgrenze (P95): alles darüber ist voll gesättigt – einzelne Ausreißer stauchen die Skala nicht. */
  upper: number;
  min: number;
  max: number;
}

export function buildHeatScale(values: Iterable<number | null | undefined>): HeatScale | null {
  const distribution = buildDistribution(values);
  if (distribution === null) return null;
  return {
    lower: distribution.p25,
    median: distribution.p50,
    // Bei sehr gleichmäßigen Reihen fällt P95 mit dem Median zusammen; dann trägt das Maximum die obere Grenze.
    upper: distribution.p95 > distribution.p50 ? distribution.p95 : distribution.max,
    min: distribution.min,
    max: distribution.max,
  };
}

/**
 * Ab dem Median in der Primärfarbe, darunter in neutralem Grau. Der Farbtonwechsel
 * genau am Median macht die Trennlinie ohne Legende lesbar; die Gamma-Korrektur hebt
 * schwach überdurchschnittliche Stunden über die Sichtbarkeitsschwelle.
 */
export function heatCellColor(value: number, scale: HeatScale): string {
  if (value >= scale.median) {
    const span = scale.upper - scale.median;
    const ratio = span > 0 ? Math.min(1, (value - scale.median) / span) : 1;
    return `hsl(var(--primary) / ${(0.18 + 0.77 * ratio ** 0.85).toFixed(3)})`;
  }
  const span = scale.median - scale.lower;
  const ratio = span > 0 ? Math.min(1, (scale.median - value) / span) : 0;
  return `hsl(var(--muted-foreground) / ${(0.3 - 0.24 * ratio).toFixed(3)})`;
}

/** Abstand zum Median in Prozent – die Zahl, die den Farbton der Zelle erklärt. */
export function relativeToMedian(value: number, scale: HeatScale): number | null {
  if (scale.median <= 0) return null;
  return (value / scale.median - 1) * 100;
}
