/**
 * Erfasst Ausführungsdauer und Zeilenzahl teurer Abfragen (IndexedDB-Reads +
 * Hydratisierung) im Speicher, damit die Diagnostics-Seite reale Zahlen zeigen
 * kann, statt dass Performance-Probleme nur anhand von Vermutungen analysiert
 * werden müssen.
 */

export interface QueryTimingEntry {
  durationMs: number;
  rowCount: number;
  recordedAt: string;
}

export interface QueryTimingSummary {
  queryKey: string;
  lastDurationMs: number;
  lastRowCount: number;
  lastRecordedAt: string;
  avgDurationMs: number;
  sampleCount: number;
}

const MAX_SAMPLES_PER_KEY = 5;

const timings = new Map<string, QueryTimingEntry[]>();

export function recordQueryTiming(queryKey: string, durationMs: number, rowCount: number): void {
  const entries = timings.get(queryKey) ?? [];
  entries.push({ durationMs, rowCount, recordedAt: new Date().toISOString() });
  if (entries.length > MAX_SAMPLES_PER_KEY) entries.shift();
  timings.set(queryKey, entries);
}

export function getQueryTimings(): QueryTimingSummary[] {
  const summaries: QueryTimingSummary[] = [];
  for (const [queryKey, entries] of timings) {
    if (entries.length === 0) continue;
    const last = entries[entries.length - 1];
    const avgDurationMs = Math.round(entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length);
    summaries.push({
      queryKey,
      lastDurationMs: last.durationMs,
      lastRowCount: last.rowCount,
      lastRecordedAt: last.recordedAt,
      avgDurationMs,
      sampleCount: entries.length,
    });
  }
  return summaries.sort((a, b) => b.lastDurationMs - a.lastDurationMs);
}

export function clearQueryTimings(): void {
  timings.clear();
}

/** Misst `fn`, protokolliert Dauer + Zeilenzahl unter `queryKey` und gibt das Ergebnis unverändert zurück. */
export async function timeQuery<T>(
  queryKey: string,
  fn: () => Promise<T>,
  countOf: (result: T) => number = (result) => (Array.isArray(result) ? result.length : 1),
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  recordQueryTiming(queryKey, durationMs, countOf(result));
  return result;
}
