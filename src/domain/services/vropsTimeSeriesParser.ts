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
} from "@/domain/services/vropsTimeSeriesSchema";
import {
  HOUR_MS,
  normalizeMissing,
  parseMetricNumber,
  parseViennaTimestamp,
  type TimestampCache,
} from "@/domain/services/vropsTimeSeriesValues";
import {
  IncrementalCsvSplitter,
  type CsvSplitterIssue,
  type CsvSplitterIssueCode,
} from "@/lib/csv/incrementalCsvSplitter";

const VROPS_TIME_SERIES_DETECTION_SAMPLE_BYTES = 64 * 1024;

interface CsvRecord {
  values: string[];
  line: number;
}

export interface VropsTimeSeriesParseOptions {
  onProgress?: (processedRows: number, totalRows: number) => void;
}

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
  const timestampCache: TimestampCache = new Map();
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
          // Die Wertprüfung entscheidet selbst, ob ein Befund den Import
          // abbricht; ohne Angabe bleibt es beim Fehler.
          severity: parsedValue.issue.severity
            ?? (parsedValue.issue.code === "missing-value" ? "warning" : "error"),
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

const CSV_SPLITTER_ISSUE_MESSAGES: Record<CsvSplitterIssueCode, string> = {
  "invalid-character-after-quote": "Nach einem schließenden Quote sind nur Komma oder Zeilenumbruch erlaubt.",
  "unexpected-quote": "Ein Quote darf nur am Anfang eines CSV-Feldes stehen.",
  "unclosed-quote": "Ein CSV-Feld mit Quote wurde nicht geschlossen.",
};

/** Übersetzt eine Splittermeldung in die vROps-Issue-Form. */
export function toVropsCsvIssue(issue: CsvSplitterIssue): VropsTimeSeriesValidationIssue {
  return {
    code: issue.code,
    severity: "error",
    message: CSV_SPLITTER_ISSUE_MESSAGES[issue.code],
    row: issue.line,
  };
}

function parseRfc4180Csv(input: string): { records: CsvRecord[]; issues: VropsTimeSeriesValidationIssue[] } {
  const records: CsvRecord[] = [];
  const issues: VropsTimeSeriesValidationIssue[] = [];
  const splitter = new IncrementalCsvSplitter({
    onRecord: (values, line) => records.push({ values, line }),
    onIssue: (issue) => issues.push(toVropsCsvIssue(issue)),
  });
  splitter.push(input);
  splitter.finish();
  return { records, issues };
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
    ["vmMemoryWorkloadAvgPct", "vmMemoryWorkloadMaxPct"],
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
