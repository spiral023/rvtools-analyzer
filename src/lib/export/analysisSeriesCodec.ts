/**
 * Kompakte Textkodierung stündlicher Messreihen für den Analyse-Export.
 *
 * Der Anlass: Im bisherigen Export macht der wiederholte Zeitstempel je Messpunkt
 * 91 % der Dateigröße aus (`2026-07-21 00:00=19488.68;` — 17 von 24 Byte sind das
 * Datum). Bei 5.000 VMs und einem Monat Stundenwerte wären das rund 87 MB je Metrik.
 *
 * Die Kodierung ersetzt das durch drei Schritte, gemessen an echten Exportdaten:
 *
 * | Schritt                        | gzip-Größe je Metrik, 5.000 VMs / 30 Tage |
 * |--------------------------------|-------------------------------------------|
 * | Ist-Zustand `Datum=Wert;`      | 13,5 MB                                   |
 * | nur Werte, ganzzahlig          |  6,4 MB                                   |
 * | + Delta                        |  5,3 MB                                   |
 * | + Quantisierung und RLE        |  3,3 MB                                   |
 *
 * Ein Binärformat brachte nach gzip keinen weiteren Vorteil (3,5 MB) und hätte die
 * Dateien unlesbar gemacht — deshalb bewusst Text.
 *
 * Format einer Reihe: durch Komma getrennte Deltas des quantisierten Ganzzahlwerts,
 * ein leeres Feld für eine Messlücke, `wert*anzahl` für Wiederholungen ab drei.
 * Lücken unterbrechen die Delta-Kette nicht — Bezugspunkt bleibt der letzte bekannte
 * Wert, sodass eine Lücke keinen Sprung in allen Folgewerten erzeugt.
 */

/** Kodierungsparameter einer Metrik; wird im Export als Metadatum mitgeführt. */
export interface SeriesEncoding {
  /**
   * Faktor, mit dem vor der Ganzzahlrundung multipliziert wird. Prozentwerte
   * brauchen 1000, weil CPU-Ready-Werte um 0,2 % liegen und eine Rundung auf ganze
   * Prozent jede Unterscheidung vernichten würde.
   */
  scale: number;
  /**
   * Signifikante Stellen der zusätzlichen relativen Rundung; `null` speichert exakt.
   * Relativ statt absolut, damit eine VM mit 20 MHz Grundlast nicht dieselbe
   * absolute Rundung abbekommt wie eine mit 20.000 MHz.
   */
  significantDigits: number | null;
}

/**
 * MHz mit Zehntel-Auflösung und drei signifikanten Stellen.
 *
 * An echten Exportdaten gemessen: Mit `scale: 1` beträgt der relative Fehler bei
 * Werten unter 10 MHz bis zu 14 %, weil die abschließende Ganzzahlrundung dort
 * fast die gesamte Information verwirft. Eine idle VM mit Werten zwischen 0,5 und
 * 1,4 MHz würde zur konstanten Reihe und damit als „Dauerlast“ klassifiziert.
 * Mit `scale: 10` bleibt der Fehler über alle Größenordnungen unter 0,5 %, bei
 * praktisch unveränderter Dateigröße (5,44 statt 5,35 MB je Reihe).
 */
export const MHZ_ENCODING: SeriesEncoding = { scale: 10, significantDigits: 3 };
export const PERCENT_ENCODING: SeriesEncoding = { scale: 1000, significantDigits: 3 };
export const COUNT_ENCODING: SeriesEncoding = { scale: 1, significantDigits: null };

/** Ab dieser Lauflänge lohnt sich `wert*anzahl` gegenüber der Aufzählung. */
const MIN_RUN_LENGTH = 3;

/** Rundet auf `digits` signifikante Stellen; 0 bleibt 0. */
export function roundToSignificantDigits(value: number, digits: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (digits - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

/** Bildet einen Messwert auf die im Export gespeicherte Ganzzahl ab. */
export function quantize(value: number, encoding: SeriesEncoding): number {
  const scaled = value * encoding.scale;
  const rounded = encoding.significantDigits === null
    ? scaled
    : roundToSignificantDigits(scaled, encoding.significantDigits);
  return Math.round(rounded);
}

export function encodeAnalysisSeries(
  values: readonly (number | null)[],
  encoding: SeriesEncoding,
): string {
  const tokens: string[] = [];
  let previous = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      tokens.push("");
      continue;
    }
    const quantized = quantize(value, encoding);
    tokens.push(String(quantized - previous));
    previous = quantized;
  }
  return compressRuns(tokens);
}

function compressRuns(tokens: readonly string[]): string {
  const output: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    let end = index;
    while (end + 1 < tokens.length && tokens[end + 1] === tokens[index]) end += 1;
    const runLength = end - index + 1;
    if (runLength >= MIN_RUN_LENGTH) {
      output.push(`${tokens[index]}*${runLength}`);
    } else {
      for (let repeat = 0; repeat < runLength; repeat += 1) output.push(tokens[index]);
    }
    index = end + 1;
  }
  return output.join(",");
}

/**
 * Gegenstück zu {@link encodeAnalysisSeries}. Wird für die Round-Trip-Tests und von
 * Auswertungsskripten gebraucht und hält damit das Format überprüfbar dokumentiert.
 */
export function decodeAnalysisSeries(
  encoded: string,
  encoding: SeriesEncoding,
): (number | null)[] {
  if (encoded === "") return [];
  const values: (number | null)[] = [];
  let previous = 0;
  for (const token of encoded.split(",")) {
    const starIndex = token.indexOf("*");
    const payload = starIndex < 0 ? token : token.slice(0, starIndex);
    const repeats = starIndex < 0 ? 1 : Number(token.slice(starIndex + 1));
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      if (payload === "") {
        values.push(null);
        continue;
      }
      previous += Number(payload);
      values.push(previous / encoding.scale);
    }
  }
  return values;
}
