/**
 * Wertkonvertierung für vROps-Zeitreihen: Zeitstempel und Messwerte.
 *
 * Bewusst als eigenes Modul, damit der zeilenbasierte Parser und der
 * gestreamte Matrixparser dieselbe Konvertierungslogik verwenden und nicht
 * auseinanderlaufen können.
 */
import type { VropsTimeSeriesValidationIssue } from "@/domain/models/types";
import type { VropsTimeSeriesValueKind } from "@/domain/services/vropsTimeSeriesSchema";

export const HOUR_MS = 60 * 60 * 1000;

const MONTHS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12],
]);

const VIENNA_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface NumericParseResult {
  value: number | null;
  issue?: Pick<VropsTimeSeriesValidationIssue, "code" | "message" | "details">;
}

export interface TimestampParseResult {
  value: number | null;
  code?: string;
  message?: string;
}

export type TimestampCache = Map<string, TimestampParseResult>;

export function normalizeMissing(raw: string): boolean {
  const value = raw.trim();
  return value === "" || value === "-";
}

export function parseMetricNumber(raw: string, valueKind: VropsTimeSeriesValueKind, header: string): NumericParseResult {
  if (normalizeMissing(raw)) return { value: null, issue: { code: "missing-value", message: "Messwert fehlt (- oder leer)." } };
  if (/\d+\.\d+,\d/.test(raw.trim())) {
    return { value: null, issue: { code: "invalid-number", message: `Lokalisierte Dezimaltrennzeichen sind nicht zulässig: ${raw}.` } };
  }
  const match = raw.trim().match(/^([+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([^\s]*)$/);
  if (!match) return { value: null, issue: { code: "invalid-number", message: `Ungültiges englisches Zahlenformat: ${raw}.` } };
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return { value: null, issue: { code: "invalid-number", message: `Nicht endlicher Zahlenwert: ${raw}.` } };
  if (value < 0) return { value: null, issue: { code: "negative-value", message: `Negative Messwerte sind nicht zulässig: ${raw}.` } };
  const unit = match[2] || unitFromHeader(header) || defaultUnit(valueKind);
  const normalized = normalizeUnit(value, unit, valueKind);
  if (normalized === null) return { value: null, issue: { code: "unknown-unit", message: `Unbekannte oder unpassende Einheit "${unit}".`, details: { unit } } };
  if (valueKind === "percent" && normalized > 100) {
    return { value: null, issue: { code: "percentage-out-of-range", message: `Prozentwert außerhalb des Bereichs 0–100: ${raw}.`, details: { value: normalized } } };
  }
  return { value: normalized };
}

function unitFromHeader(header: string): string | null {
  const match = header.match(/\(([^)]+)\)/);
  return match?.[1] ?? null;
}

function defaultUnit(kind: VropsTimeSeriesValueKind): string {
  if (kind === "cpu") return "MHz";
  if (kind === "memory") return "MiB";
  if (kind === "percent") return "%";
  return "";
}

/** Einheitenlose Zählwerte wie die konfigurierte vCPU-Anzahl. */
function normalizeCount(value: number, unit: string): number | null {
  return unit === "" ? value : null;
}

function normalizeUnit(value: number, rawUnit: string, kind: VropsTimeSeriesValueKind): number | null {
  const unit = rawUnit.trim().toLocaleLowerCase("en-US");
  if (kind === "cpu") {
    if (unit === "mhz") return value;
    if (unit === "ghz") return value * 1000;
    if (unit === "khz") return value / 1000;
    if (unit === "hz") return value / 1_000_000;
    return null;
  }
  if (kind === "memory") {
    // VMware's displayed KB/MB/GB/TB memory counters are binary units (KB = KiB).
    if (unit === "kib" || unit === "kb") return value / 1024;
    if (unit === "mib" || unit === "mb") return value;
    if (unit === "gib" || unit === "gb") return value * 1024;
    if (unit === "tib" || unit === "tb") return value * 1024 * 1024;
    if (unit === "b" || unit === "byte" || unit === "bytes") return value / (1024 * 1024);
    return null;
  }
  if (kind === "percent") return unit === "%" || unit === "pct" || unit === "percent" ? value : null;
  if (kind === "count") return normalizeCount(value, unit);
  return null;
}

export function parseViennaTimestamp(raw: string, cache?: TimestampCache): TimestampParseResult {
  const cached = cache?.get(raw);
  if (cached) return cached;
  const trimmed = raw.trim();
  if (!trimmed) return cacheTimestamp(raw, { value: null, code: "missing-timestamp", message: "Interval Breakdown fehlt." }, cache);
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const value = Date.parse(trimmed);
    return cacheTimestamp(raw, Number.isFinite(value) ? { value } : { value: null, code: "invalid-timestamp", message: `Ungültiger ISO-Zeitstempel: ${raw}.` }, cache);
  }
  const civil = parseCivilDateTime(trimmed);
  if (!civil) return cacheTimestamp(raw, { value: null, code: "invalid-timestamp", message: `Nicht unterstütztes Interval-Breakdown-Format: ${raw}.` }, cache);
  const candidates = matchingViennaInstants(civil);
  if (candidates.length === 0) return cacheTimestamp(raw, { value: null, code: "nonexistent-local-time", message: `Lokale Zeit existiert wegen Zeitumstellung nicht: ${raw}.` }, cache);
  if (candidates.length > 1) return cacheTimestamp(raw, { value: null, code: "ambiguous-local-time", message: `Lokale Zeit ist ohne Offset mehrdeutig: ${raw}.` }, cache);
  return cacheTimestamp(raw, { value: candidates[0] }, cache);
}

function cacheTimestamp(raw: string, result: TimestampParseResult, cache?: TimestampCache): TimestampParseResult {
  cache?.set(raw, result);
  return result;
}

function parseCivilDateTime(value: string): CivilDateTime | null {
  const meridiem = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (meridiem) {
    const hour12 = Number(meridiem[1]);
    const minute = Number(meridiem[2]);
    const second = Number(meridiem[3] ?? 0);
    const isPm = meridiem[4].toLocaleUpperCase("en-US") === "PM";
    const day = Number(meridiem[5]);
    const month = MONTHS.get(meridiem[6].toLocaleLowerCase("en-US"));
    const year = Number(meridiem[7]);
    if (!month || hour12 < 1 || hour12 > 12) return null;
    return validCivil({ year, month, day, hour: (hour12 % 12) + (isPm ? 12 : 0), minute, second });
  }
  const isoLocal = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!isoLocal) return null;
  return validCivil({ year: Number(isoLocal[1]), month: Number(isoLocal[2]), day: Number(isoLocal[3]), hour: Number(isoLocal[4]), minute: Number(isoLocal[5]), second: Number(isoLocal[6] ?? 0) });
}

function validCivil(value: CivilDateTime): CivilDateTime | null {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second));
  return date.getUTCFullYear() === value.year && date.getUTCMonth() === value.month - 1 && date.getUTCDate() === value.day && date.getUTCHours() === value.hour && date.getUTCMinutes() === value.minute && date.getUTCSeconds() === value.second ? value : null;
}

function matchingViennaInstants(civil: CivilDateTime): number[] {
  const naiveUtc = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
  const candidates: number[] = [];
  for (let offsetHours = -14; offsetHours <= 14; offsetHours += 1) {
    const candidate = naiveUtc - offsetHours * HOUR_MS;
    const parts = viennaParts(candidate);
    if (parts.year === civil.year && parts.month === civil.month && parts.day === civil.day && parts.hour === civil.hour && parts.minute === civil.minute && parts.second === civil.second) candidates.push(candidate);
  }
  return candidates;
}

function viennaParts(timestamp: number): CivilDateTime {
  const parts = VIENNA_FORMATTER.formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}
