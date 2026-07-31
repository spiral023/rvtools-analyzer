/**
 * Gestreamter vROps-Zeitreihenparser.
 *
 * Liest eine Export-CSV direkt in die kompakte Object×Hour-Matrix, ohne die
 * Zeilen als Objekte zu materialisieren. Damit hängt der Speicherbedarf an der
 * Zielmatrix (Objekte × Stunden × Metriken) statt an der Zeilenzahl.
 *
 * Es wird zweimal über die Datei gelesen:
 *  1. Objektnamen, Stundenraster und Prüfsumme erfassen — dieser Durchgang
 *     meldet bewusst keine Issues, damit nichts doppelt auftaucht.
 *  2. Messwerte in die Matrix schreiben und dabei validieren.
 *
 * Zeilenbezogene Prüfungen bleiben erhalten: Wertfehler, doppelte
 * Objekt/Zeitpunkt-Kombinationen und Avg>Max entstehen im zweiten Durchgang und
 * behalten ihre Quellzeilennummer.
 */
import type {
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesSchemaMatch,
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
import { toVropsCsvIssue } from "@/domain/services/vropsTimeSeriesParser";
import { IncrementalCsvSplitter } from "@/lib/csv/incrementalCsvSplitter";
import { IncrementalSha256 } from "@/lib/hash/incrementalSha256";

/** Obergrenze je Fehlercode; die Gesamtzahl bleibt in `issueCountsByCode` erhalten. */
export const MAX_ISSUES_PER_CODE = 50;

/** Avg/Max-Paare, deren Verhältnis je Zeile geprüft wird. */
const AVERAGE_MAXIMUM_PAIRS: ReadonlyArray<readonly [VropsTimeSeriesMetricKey, VropsTimeSeriesMetricKey]> = [
  ["clusterCpuDemandAvgMHz", "clusterCpuDemandMaxMHz"],
  ["clusterMemoryUtilizationAvgMiB", "clusterMemoryUtilizationMaxMiB"],
  ["clusterCpuContentionAvgPct", "clusterCpuContentionMaxPct"],
  ["hostCpuDemandAvgMHz", "hostCpuDemandMaxMHz"],
  ["hostCpuUsageAvgMHz", "hostCpuUsageMaxMHz"],
  ["hostMemoryUtilizationAvgMiB", "hostMemoryUtilizationMaxMiB"],
  ["hostCpuContentionAvgPct", "hostCpuContentionMaxPct"],
];

export interface VropsTimeSeriesMatrix {
  schema: VropsTimeSeriesSchemaMatch;
  objectType: VropsTimeSeriesObjectType;
  /** Aufsteigend sortiert; die Zeilenreihenfolge der Matrix. */
  objectNames: string[];
  /** Aufsteigend sortiertes Stundenraster; die Spaltenreihenfolge der Matrix. */
  timestampsUtc: number[];
  /** Je Metrik ein `objectNames.length * timestampsUtc.length` grosses Feld, NaN = fehlt. */
  metricValues: Partial<Record<VropsTimeSeriesMetricKey, Float32Array>>;
  /** 0 = kein Zustand, sonst Position im Lexikon plus eins. */
  maintenanceCodes?: Uint8Array;
  maintenanceLexicon?: string[];
  /** 1, wenn der Zustand aus der Vorstunde fortgeschrieben wurde. */
  maintenanceDerived?: Uint8Array;
  fileChecksum: string;
  rowCount: number;
  issues: VropsTimeSeriesValidationIssue[];
  issueCountsByCode: Record<string, number>;
}

export interface VropsTimeSeriesMatrixResult {
  /** Fehlt, wenn die Datei leer ist oder der Objekttyp nicht erkannt wurde. */
  matrix?: VropsTimeSeriesMatrix;
  issues: VropsTimeSeriesValidationIssue[];
  issueCountsByCode: Record<string, number>;
}

export interface MatrixParseProgress {
  pass: 1 | 2;
  bytesRead: number;
  totalBytes: number;
}

export interface ParseVropsTimeSeriesMatrixOptions {
  onProgress?: (progress: MatrixParseProgress) => void;
  /** Nur für Tests: erlaubt kleine Chunks, um Grenzfälle zu erzwingen. */
  chunkSizeBytes?: number;
}

/** Sammelt Issues mit Deckelung je Code, damit ein systematischer Fehler den Heap nicht flutet. */
class IssueCollector {
  private readonly collected: VropsTimeSeriesValidationIssue[] = [];
  private readonly counts = new Map<string, number>();

  add(issue: VropsTimeSeriesValidationIssue): void {
    const seen = (this.counts.get(issue.code) ?? 0) + 1;
    this.counts.set(issue.code, seen);
    if (seen <= MAX_ISSUES_PER_CODE) this.collected.push(issue);
  }

  get issues(): VropsTimeSeriesValidationIssue[] {
    return this.collected;
  }

  get countsByCode(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  hasErrors(): boolean {
    return this.collected.some((issue) => issue.severity === "error");
  }
}

/** Blockgrösse des slice-Fallbacks; klein genug, um den Heap flach zu halten. */
const DEFAULT_SLICE_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Liest einen Blob-Ausschnitt als Bytes. Reiner Umgebungsadapter: ältere
 * jsdom-Versionen kennen weder `Blob.arrayBuffer` noch `Blob.stream`.
 */
async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Blob konnte nicht gelesen werden.")));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}

/**
 * Liest einen Blob als Textchunks und hasht dabei die Rohbytes.
 *
 * Bevorzugt `Blob.stream()`; wo das fehlt (jsdom in den Tests) wird der Blob in
 * Scheiben gelesen. Beide Wege liefern demselben Splitter dieselbe Bytefolge —
 * die Chunk-Invarianz ist im Splitter und hier separat abgesichert.
 */
async function streamBlob(
  blob: Blob,
  onText: (text: string) => void,
  options: { hash?: IncrementalSha256; onBytes?: (bytesRead: number) => void; chunkSizeBytes?: number },
): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  let bytesRead = 0;
  const consume = (bytes: Uint8Array) => {
    options.hash?.update(bytes);
    bytesRead += bytes.length;
    onText(decoder.decode(bytes, { stream: true }));
    options.onBytes?.(bytesRead);
  };

  const useSlices = Boolean(options.chunkSizeBytes) || typeof blob.stream !== "function";
  if (useSlices) {
    const chunkSizeBytes = options.chunkSizeBytes && options.chunkSizeBytes > 0
      ? options.chunkSizeBytes
      : DEFAULT_SLICE_CHUNK_BYTES;
    for (let offset = 0; offset < blob.size; offset += chunkSizeBytes) {
      consume(await readBlobBytes(blob.slice(offset, offset + chunkSizeBytes)));
    }
    onText(decoder.decode());
    return;
  }

  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(value instanceof Uint8Array ? value : new Uint8Array(value));
  }
  onText(decoder.decode());
}

/** Erster Durchgang: Struktur und Prüfsumme, ohne Issues zu melden. */
async function scanStructure(
  blob: Blob,
  options: ParseVropsTimeSeriesMatrixOptions,
  timestampCache: TimestampCache,
): Promise<{
  headerValues: string[] | null;
  objectNames: Set<string>;
  timestamps: Set<number>;
  rowCount: number;
  fileChecksum: string;
}> {
  const hash = new IncrementalSha256();
  const objectNames = new Set<string>();
  const timestamps = new Set<number>();
  let headerValues: string[] | null = null;
  let objectNameIndex = -1;
  let intervalIndex = -1;
  let rowCount = 0;

  const splitter = new IncrementalCsvSplitter({
    onRecord: (values) => {
      if (!headerValues) {
        headerValues = values;
        const schema = matchVropsTimeSeriesSchema(values).schema;
        if (schema) {
          objectNameIndex = values.indexOf(schema.objectNameHeader);
          intervalIndex = values.indexOf(schema.intervalHeader);
        }
        return;
      }
      if (objectNameIndex < 0 || intervalIndex < 0) return;
      if (values.length !== headerValues.length) return;
      const objectName = values[objectNameIndex].trim();
      if (!objectName) return;
      const timestamp = parseViennaTimestamp(values[intervalIndex], timestampCache);
      if (timestamp.value === null) return;
      objectNames.add(objectName);
      timestamps.add(timestamp.value);
      rowCount += 1;
    },
  });

  await streamBlob(blob, (text) => splitter.push(text), {
    hash,
    chunkSizeBytes: options.chunkSizeBytes,
    onBytes: (bytesRead) => options.onProgress?.({ pass: 1, bytesRead, totalBytes: blob.size }),
  });
  splitter.finish();

  return { headerValues, objectNames, timestamps, rowCount, fileChecksum: hash.digestHex() };
}

export async function parseVropsTimeSeriesMatrix(
  blob: Blob,
  options: ParseVropsTimeSeriesMatrixOptions = {},
): Promise<VropsTimeSeriesMatrixResult> {
  const issues = new IssueCollector();
  const timestampCache: TimestampCache = new Map();
  const structure = await scanStructure(blob, options, timestampCache);

  if (!structure.headerValues) {
    issues.add({ code: "empty-file", severity: "error", message: "Die CSV-Datei enthält keine Zeilen." });
    return { issues: issues.issues, issueCountsByCode: issues.countsByCode };
  }

  const headerValues: string[] = structure.headerValues;
  const schemaMatch = matchVropsTimeSeriesSchema(headerValues);
  for (const issue of schemaMatch.issues) issues.add(issue);
  if (!schemaMatch.schema) {
    return { issues: issues.issues, issueCountsByCode: issues.countsByCode };
  }
  const schema = schemaMatch.schema;

  const objectNames = [...structure.objectNames].sort((left, right) => left.localeCompare(right, "en-US"));
  const timestampsUtc = [...structure.timestamps].sort((left, right) => left - right);
  const slotCount = timestampsUtc.length;
  const objectCount = objectNames.length;

  const objectIndexByName = new Map(objectNames.map((name, index) => [name, index]));
  const slotIndexByTimestamp = new Map(timestampsUtc.map((timestamp, index) => [timestamp, index]));
  const columnIndexByHeader = new Map(headerValues.map((header, index) => [header, index]));

  const metricKeys = Object.keys(schema.metricHeaders) as VropsTimeSeriesMetricKey[];
  const numericMetricKeys = metricKeys.filter((key) => key !== "hostMaintenanceStateLast");
  const metricValues: Partial<Record<VropsTimeSeriesMetricKey, Float32Array>> = {};
  const cellCount = objectCount * slotCount;
  for (const metric of numericMetricKeys) {
    const values = new Float32Array(cellCount);
    values.fill(Number.NaN);
    metricValues[metric] = values;
  }

  const tracksMaintenance = metricKeys.includes("hostMaintenanceStateLast");
  const maintenanceCodes = tracksMaintenance ? new Uint8Array(cellCount) : undefined;
  const maintenanceDerived = tracksMaintenance ? new Uint8Array(cellCount) : undefined;
  const maintenanceLexicon: string[] = [];
  const maintenanceCodeByState = new Map<string, number>();

  // Belegt-Marker ersetzt das frühere Set aus Objekt/Zeitstempel-Strings.
  const filled = new Uint8Array(cellCount);
  const numericColumns = numericMetricKeys.map((metric) => ({
    metric,
    header: schema.metricHeaders[metric]!,
    columnIndex: columnIndexByHeader.get(schema.metricHeaders[metric]!)!,
    valueKind: getVropsTimeSeriesMetricDefinition(metric).valueKind,
    values: metricValues[metric]!,
  }));
  const maintenanceColumnIndex = tracksMaintenance
    ? columnIndexByHeader.get(schema.metricHeaders.hostMaintenanceStateLast!)!
    : -1;
  const objectNameIndex = columnIndexByHeader.get(schema.objectNameHeader)!;
  const intervalIndex = columnIndexByHeader.get(schema.intervalHeader)!;
  const relevantPairs = AVERAGE_MAXIMUM_PAIRS.filter(
    ([average, maximum]) => metricValues[average] && metricValues[maximum],
  );

  let isHeader = true;
  const splitter = new IncrementalCsvSplitter({
    onIssue: (issue) => issues.add(toVropsCsvIssue(issue)),
    onRecord: (values, line) => {
      if (isHeader) {
        isHeader = false;
        return;
      }
      if (values.length === 1 && values[0] === "") return;
      if (values.length !== headerValues.length) {
        issues.add({
          code: "column-count-mismatch",
          severity: "error",
          message: `Zeile enthält ${values.length} statt ${headerValues.length} Spalten.`,
          row: line,
        });
        return;
      }
      const objectName = values[objectNameIndex].trim();
      if (!objectName) {
        issues.add({ code: "missing-object-name", severity: "error", message: "Objektname fehlt.", row: line });
        return;
      }
      const rawTimestamp = values[intervalIndex];
      const parsedTimestamp = parseViennaTimestamp(rawTimestamp, timestampCache);
      if (parsedTimestamp.value === null) {
        issues.add({
          code: parsedTimestamp.code ?? "invalid-timestamp",
          severity: "error",
          message: parsedTimestamp.message ?? `Ungültiger Zeitstempel: ${rawTimestamp}.`,
          row: line,
          objectName,
        });
        return;
      }

      const objectIndex = objectIndexByName.get(objectName);
      const slotIndex = slotIndexByTimestamp.get(parsedTimestamp.value);
      if (objectIndex === undefined || slotIndex === undefined) return;
      const position = objectIndex * slotCount + slotIndex;

      if (filled[position]) {
        issues.add({
          code: "duplicate-object-timestamp",
          severity: "error",
          message: "Objekt/Zeitpunkt-Kombination kommt mehrfach vor.",
          row: line,
          objectName,
          intervalStartUtc: parsedTimestamp.value,
        });
      }
      filled[position] = 1;

      for (const column of numericColumns) {
        const parsedValue = parseMetricNumber(values[column.columnIndex], column.valueKind, column.header);
        if (parsedValue.value !== null) column.values[position] = parsedValue.value;
        if (parsedValue.issue) {
          issues.add({
            ...parsedValue.issue,
            severity: parsedValue.issue.code === "missing-value" ? "warning" : "error",
            row: line,
            header: column.header,
            objectName,
            intervalStartUtc: parsedTimestamp.value,
            metric: column.metric,
          });
        }
      }

      for (const [averageKey, maximumKey] of relevantPairs) {
        const average = metricValues[averageKey]![position];
        const maximum = metricValues[maximumKey]![position];
        if (!Number.isNaN(average) && !Number.isNaN(maximum) && maximum < average) {
          issues.add({
            code: "maximum-below-average",
            severity: "error",
            message: `${maximumKey} ist kleiner als ${averageKey}.`,
            row: line,
            objectName,
            intervalStartUtc: parsedTimestamp.value,
            metric: maximumKey,
          });
        }
      }

      if (maintenanceCodes) {
        const rawState = values[maintenanceColumnIndex];
        if (!normalizeMissing(rawState)) {
          const state = rawState.trim();
          let code = maintenanceCodeByState.get(state);
          if (code === undefined) {
            maintenanceLexicon.push(state);
            code = maintenanceLexicon.length;
            maintenanceCodeByState.set(state, code);
          }
          maintenanceCodes[position] = code;
        }
      }
    },
  });

  await streamBlob(blob, (text) => splitter.push(text), {
    chunkSizeBytes: options.chunkSizeBytes,
    onBytes: (bytesRead) => options.onProgress?.({ pass: 2, bytesRead, totalBytes: blob.size }),
  });
  splitter.finish();

  if (maintenanceCodes && maintenanceDerived) {
    forwardFillMaintenance(maintenanceCodes, maintenanceDerived, objectCount, slotCount);
  }
  reportHourGaps(timestampsUtc, objectNames, filled, slotCount, issues);

  return {
    matrix: {
      schema,
      objectType: schema.objectType,
      objectNames,
      timestampsUtc,
      metricValues,
      ...(maintenanceCodes ? { maintenanceCodes, maintenanceDerived, maintenanceLexicon } : {}),
      fileChecksum: structure.fileChecksum,
      rowCount: structure.rowCount,
      issues: issues.issues,
      issueCountsByCode: issues.countsByCode,
    },
    issues: issues.issues,
    issueCountsByCode: issues.countsByCode,
  };
}

/** Schreibt den letzten bekannten Wartungszustand je Objekt über fehlende Stunden fort. */
function forwardFillMaintenance(
  codes: Uint8Array,
  derived: Uint8Array,
  objectCount: number,
  slotCount: number,
): void {
  for (let objectIndex = 0; objectIndex < objectCount; objectIndex += 1) {
    const base = objectIndex * slotCount;
    let previous = 0;
    for (let slot = 0; slot < slotCount; slot += 1) {
      const position = base + slot;
      if (codes[position] !== 0) {
        previous = codes[position];
      } else if (previous !== 0) {
        codes[position] = previous;
        derived[position] = 1;
      }
    }
  }
}

/**
 * Meldet Lücken im Stundenraster je Objekt. Die frühere Prüfung verglich
 * aufeinanderfolgende Zeilen; auf der Matrix ist eine Lücke eine unbelegte
 * Zelle zwischen zwei belegten.
 */
function reportHourGaps(
  timestampsUtc: number[],
  objectNames: string[],
  filled: Uint8Array,
  slotCount: number,
  issues: IssueCollector,
): void {
  for (let objectIndex = 0; objectIndex < objectNames.length; objectIndex += 1) {
    const base = objectIndex * slotCount;
    let lastFilledSlot = -1;
    for (let slot = 0; slot < slotCount; slot += 1) {
      if (!filled[base + slot]) continue;
      if (lastFilledSlot >= 0 && slot - lastFilledSlot > 1) {
        issues.add({
          code: "hour-gap",
          severity: "error",
          message: "Die Stundenreihe enthält eine Lücke oder ein nichtstündliches Intervall.",
          objectName: objectNames[objectIndex],
          intervalStartUtc: timestampsUtc[slot],
          details: {
            previousIntervalStartUtc: timestampsUtc[lastFilledSlot],
            currentIntervalStartUtc: timestampsUtc[slot],
          },
        });
      }
      lastFilledSlot = slot;
    }
  }
}

export { HOUR_MS };
