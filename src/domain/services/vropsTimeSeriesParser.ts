import type {
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesParseResult,
  VropsTimeSeriesParsedRow,
  VropsTimeSeriesValidationIssue,
} from "@/domain/models/types";
import {
  getVropsTimeSeriesMetricDefinition,
  matchVropsTimeSeriesSchema,
  type VropsTimeSeriesValueKind,
} from "@/domain/services/vropsTimeSeriesSchema";

const HOUR_MS = 60 * 60 * 1000;
const VROPS_TIME_SERIES_DETECTION_SAMPLE_BYTES = 64 * 1024;
const MONTHS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12],
]);

interface CsvRecord {
  values: string[];
  line: number;
}

interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface NumericParseResult {
  value: number | null;
  issue?: Pick<VropsTimeSeriesValidationIssue, "code" | "message" | "details">;
}

interface TimestampParseResult {
  value: number | null;
  code?: string;
  message?: string;
}

export interface VropsTimeSeriesParseOptions {
  onProgress?: (processedRows: number, totalRows: number) => void;
}

const VIENNA_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function parseVropsTimeSeriesCsv(csv: string, options?: VropsTimeSeriesParseOptions): VropsTimeSeriesParseResult {
  const csvResult = parseRfc4180Csv(csv);
  const issues = [...csvResult.issues];
  if (csvResult.records.length === 0) {
    issues.push({ code: "empty-file", severity: "error", message: "Die CSV-Datei enthält keine Zeilen." });
    return { schema: null, rows: [], issues };
  }

  const [headerRecord, ...dataRecords] = csvResult.records;
  const schemaMatch = matchVropsTimeSeriesSchema(headerRecord.values);
  issues.push(...schemaMatch.issues);
  if (!schemaMatch.schema) return { schema: null, rows: [], issues };

  const { schema } = schemaMatch;
  const indexByHeader = new Map(headerRecord.values.map((header, index) => [header, index]));
  const rows: VropsTimeSeriesParsedRow[] = [];
  const timestampCache = new Map<string, TimestampParseResult>();
  options?.onProgress(0, dataRecords.length);

  for (let recordIndex = 0; recordIndex < dataRecords.length; recordIndex += 1) {
    const record = dataRecords[recordIndex];
    if (record.values.length === 1 && record.values[0] === "") continue;
    if (record.values.length !== headerRecord.values.length) {
      issues.push({
        code: "column-count-mismatch",
        severity: "error",
        message: `Zeile enthält ${record.values.length} statt ${headerRecord.values.length} Spalten.`,
        row: record.line,
      });
      continue;
    }
    const objectName = record.values[indexByHeader.get(schema.objectNameHeader)!].trim();
    if (!objectName) {
      issues.push({ code: "missing-object-name", severity: "error", message: "Objektname fehlt.", row: record.line });
      continue;
    }
    const rawTimestamp = record.values[indexByHeader.get(schema.intervalHeader)!];
    const parsedTimestamp = parseViennaTimestamp(rawTimestamp, timestampCache);
    if (parsedTimestamp.value === null) {
      issues.push({
        code: parsedTimestamp.code ?? "invalid-timestamp",
        severity: "error",
        message: parsedTimestamp.message ?? `Ungültiger Zeitstempel: ${rawTimestamp}.`,
        row: record.line,
        objectName,
      });
      continue;
    }

    const values: VropsTimeSeriesParsedRow["values"] = {};
    for (const [metric, header] of Object.entries(schema.metricHeaders) as Array<[VropsTimeSeriesMetricKey, string]>) {
      const definition = getVropsTimeSeriesMetricDefinition(metric);
      const rawValue = record.values[indexByHeader.get(header)!];
      if (definition.valueKind === "state") {
        values[metric] = normalizeMissing(rawValue) ? null : rawValue.trim();
        continue;
      }
      const parsedValue = parseMetricNumber(rawValue, definition.valueKind, header);
      values[metric] = parsedValue.value;
      if (parsedValue.issue) {
        issues.push({
          ...parsedValue.issue,
          severity: parsedValue.issue.code === "missing-value" ? "warning" : "error",
          row: record.line,
          header,
          objectName,
          intervalStartUtc: parsedTimestamp.value,
          metric,
        });
      }
    }
    rows.push({ objectName, intervalStartUtc: parsedTimestamp.value, values, sourceRow: record.line });
    if ((recordIndex + 1) % 5_000 === 0 || recordIndex + 1 === dataRecords.length) options?.onProgress(recordIndex + 1, dataRecords.length);
  }

  validateSeries(rows, schema.objectType, issues);
  return { schema, rows, issues };
}

/**
 * Identifies a vROps time-series export from its CSV header without loading the
 * complete file. The schema matcher remains the single source of truth for the
 * accepted columns and aliases.
 */
export async function detectVropsTimeSeriesCsvFile(file: Blob): Promise<VropsTimeSeriesObjectType | null> {
  const sample = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("CSV-Kopf konnte nicht gelesen werden.")));
    reader.readAsText(file.slice(0, VROPS_TIME_SERIES_DETECTION_SAMPLE_BYTES));
  });
  return parseVropsTimeSeriesCsv(sample).schema?.objectType ?? null;
}

/**
 * Leitet den vROps-Objekttyp aus einem typischen Exportdateinamen ab. Diese
 * Zuordnung ist bewusst konservativ: Der Begriff muss als eigenes Wort im
 * Namen stehen, damit etwa „hostclone“ nicht versehentlich als Host gilt.
 */
export function inferVropsTimeSeriesObjectTypeFromFileName(fileName: string): VropsTimeSeriesObjectType | null {
  const normalized = fileName.trim().toLocaleLowerCase("en-US");
  const matches = (["vm", "cluster", "host"] as const).filter((type) => (
    new RegExp(`(?:^|[^a-z0-9])${type}(?:[^a-z0-9]|$)`, "i").test(normalized)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function parseRfc4180Csv(input: string): { records: CsvRecord[]; issues: VropsTimeSeriesValidationIssue[] } {
  const records: CsvRecord[] = [];
  const issues: VropsTimeSeriesValidationIssue[] = [];
  let values: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    values.push(field);
    records.push({ values, line: recordLine });
    values = [];
    field = "";
    afterQuote = false;
    recordLine = line + 1;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
        if (char === "\n") line += 1;
      }
      continue;
    }
    if (afterQuote) {
      if (char === ",") {
        values.push(field);
        field = "";
        afterQuote = false;
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        finishRecord();
        line += 1;
      } else {
        issues.push({ code: "invalid-character-after-quote", severity: "error", message: "Nach einem schließenden Quote sind nur Komma oder Zeilenumbruch erlaubt.", row: line });
        afterQuote = false;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field) {
        issues.push({ code: "unexpected-quote", severity: "error", message: "Ein Quote darf nur am Anfang eines CSV-Feldes stehen.", row: line });
      }
      quoted = true;
    } else if (char === ",") {
      values.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      finishRecord();
      line += 1;
    } else {
      field += char;
    }
  }
  if (quoted) {
    issues.push({ code: "unclosed-quote", severity: "error", message: "Ein CSV-Feld mit Quote wurde nicht geschlossen.", row: recordLine });
    return { records, issues };
  }
  if (field || values.length > 0 || afterQuote) finishRecord();
  return { records, issues };
}

function normalizeMissing(raw: string): boolean {
  const value = raw.trim();
  return value === "" || value === "-";
}

function parseMetricNumber(raw: string, valueKind: VropsTimeSeriesValueKind, header: string): NumericParseResult {
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
  return null;
}

function parseViennaTimestamp(raw: string, cache?: Map<string, TimestampParseResult>): TimestampParseResult {
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

function cacheTimestamp(raw: string, result: TimestampParseResult, cache?: Map<string, TimestampParseResult>): TimestampParseResult {
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

function validateSeries(rows: VropsTimeSeriesParsedRow[], objectType: "vm" | "cluster" | "host", issues: VropsTimeSeriesValidationIssue[]) {
  const seen = new Set<string>();
  const byObject = new Map<string, VropsTimeSeriesParsedRow[]>();
  for (const row of rows) {
    const identity = `${row.objectName}\u0000${row.intervalStartUtc}`;
    if (seen.has(identity)) {
      issues.push({ code: "duplicate-object-timestamp", severity: "error", message: "Objekt/Zeitpunkt-Kombination kommt mehrfach vor.", row: row.sourceRow, objectName: row.objectName, intervalStartUtc: row.intervalStartUtc });
    }
    seen.add(identity);
    const list = byObject.get(row.objectName) ?? [];
    list.push(row);
    byObject.set(row.objectName, list);
  }
  for (const [objectName, objectRows] of byObject) {
    objectRows.sort((left, right) => left.intervalStartUtc - right.intervalStartUtc);
    for (let index = 1; index < objectRows.length; index += 1) {
      const previous = objectRows[index - 1];
      const current = objectRows[index];
      if (current.intervalStartUtc - previous.intervalStartUtc !== HOUR_MS) {
        issues.push({ code: "hour-gap", severity: "error", message: "Die Stundenreihe enthält eine Lücke oder ein nichtstündliches Intervall.", objectName, intervalStartUtc: current.intervalStartUtc, details: { previousIntervalStartUtc: previous.intervalStartUtc, currentIntervalStartUtc: current.intervalStartUtc } });
      }
    }
    if (objectType === "host") forwardFillMaintenance(objectRows);
    validateAverageMaximumPairs(objectRows, issues);
  }
}

function forwardFillMaintenance(rows: VropsTimeSeriesParsedRow[]) {
  let previous: string | null = null;
  for (const row of rows) {
    const current = row.values.hostMaintenanceStateLast;
    if (typeof current === "string") {
      previous = current;
    } else if (current === null && previous !== null) {
      row.values.hostMaintenanceStateLast = previous;
      row.derivedMetrics = { ...row.derivedMetrics, hostMaintenanceStateLast: true };
    }
  }
}

function validateAverageMaximumPairs(rows: VropsTimeSeriesParsedRow[], issues: VropsTimeSeriesValidationIssue[]) {
  const pairs: Array<[VropsTimeSeriesMetricKey, VropsTimeSeriesMetricKey]> = [
    ["clusterCpuDemandAvgMHz", "clusterCpuDemandMaxMHz"],
    ["clusterMemoryUtilizationAvgMiB", "clusterMemoryUtilizationMaxMiB"],
    ["clusterCpuContentionAvgPct", "clusterCpuContentionMaxPct"],
    ["hostCpuDemandAvgMHz", "hostCpuDemandMaxMHz"],
    ["hostCpuUsageAvgMHz", "hostCpuUsageMaxMHz"],
    ["hostMemoryUtilizationAvgMiB", "hostMemoryUtilizationMaxMiB"],
    ["hostCpuContentionAvgPct", "hostCpuContentionMaxPct"],
  ];
  for (const row of rows) {
    for (const [averageKey, maximumKey] of pairs) {
      const average = row.values[averageKey];
      const maximum = row.values[maximumKey];
      if (typeof average === "number" && typeof maximum === "number" && maximum < average) {
        issues.push({ code: "maximum-below-average", severity: "error", message: `${maximumKey} ist kleiner als ${averageKey}.`, row: row.sourceRow, objectName: row.objectName, intervalStartUtc: row.intervalStartUtc, metric: maximumKey });
      }
    }
  }
}
