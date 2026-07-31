/**
 * Die eigentliche Arbeit des Zeitreihen-Workers: drei CSV-Dateien streamen,
 * Matrizen füllen und daraus die Persistenz-Nutzlast bauen.
 *
 * Bewusst getrennt von der Worker-Datei, damit die Logik ohne Worker-Umgebung
 * getestet werden kann und die Worker-Schale nur noch Nachrichten übersetzt.
 */
import { parseVropsTimeSeriesMatrix, type VropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";
import { prepareVropsTimeSeriesPayloadFromMatrices } from "@/domain/services/vropsTimeSeriesImportService";
import type {
  VropsTimeSeriesChunk,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesSummary,
  VropsTimeSeriesValidationIssue,
} from "@/domain/models/types";

export const VROPS_TIME_SERIES_OBJECT_TYPES = ["vm", "cluster", "host"] as const;

const FILE_LABELS: Record<VropsTimeSeriesObjectType, string> = { vm: "VM", cluster: "Cluster", host: "Host" };

export interface VropsTimeSeriesFileStats {
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
}

/** Was der Worker zurückliefert; bewusst frei von Zeilenobjekten. */
export interface VropsTimeSeriesWorkerPayload {
  chunks: VropsTimeSeriesChunk[];
  summaries: VropsTimeSeriesSummary[];
  objectNamesByType: Record<VropsTimeSeriesObjectType, string[]>;
  rangeStartUtc: number;
  rangeEndUtc: number;
  expectedSlots: number;
  schemaVersion: number;
  fileStats: Record<VropsTimeSeriesObjectType, VropsTimeSeriesFileStats>;
  issueCountsByCode: Record<string, number>;
  warnings: string[];
  errors: string[];
  gridDiagnostics: unknown[];
}

export interface WorkerPayloadProgress {
  fileIndex: number;
  fileLabel: string;
  pass: 1 | 2;
  bytesRead: number;
  totalBytes: number;
}

export function emptyVropsTimeSeriesWorkerPayload(): VropsTimeSeriesWorkerPayload {
  const emptyStats: VropsTimeSeriesFileStats = { fileChecksum: "", rowCount: 0, columnCount: 0, detectedColumns: [] };
  return {
    chunks: [],
    summaries: [],
    objectNamesByType: { vm: [], cluster: [], host: [] },
    rangeStartUtc: 0,
    rangeEndUtc: 0,
    expectedSlots: 0,
    schemaVersion: 0,
    fileStats: { vm: { ...emptyStats }, cluster: { ...emptyStats }, host: { ...emptyStats } },
    issueCountsByCode: {},
    warnings: [],
    errors: [],
    gridDiagnostics: [],
  };
}

export async function buildVropsTimeSeriesWorkerPayload(
  files: Record<VropsTimeSeriesObjectType, File>,
  onProgress?: (progress: WorkerPayloadProgress) => void,
): Promise<VropsTimeSeriesWorkerPayload> {
  const matrices = {} as Record<VropsTimeSeriesObjectType, VropsTimeSeriesMatrix>;
  const issues: VropsTimeSeriesValidationIssue[] = [];
  const issueCountsByCode: Record<string, number> = {};

  for (let fileIndex = 0; fileIndex < VROPS_TIME_SERIES_OBJECT_TYPES.length; fileIndex += 1) {
    const objectType = VROPS_TIME_SERIES_OBJECT_TYPES[fileIndex];
    const fileLabel = FILE_LABELS[objectType];
    const result = await parseVropsTimeSeriesMatrix(files[objectType], {
      onProgress: ({ pass, bytesRead, totalBytes }) =>
        onProgress?.({ fileIndex, fileLabel, pass, bytesRead, totalBytes }),
    });

    for (const [code, count] of Object.entries(result.issueCountsByCode)) {
      issueCountsByCode[code] = (issueCountsByCode[code] ?? 0) + count;
    }
    issues.push(...result.issues);

    if (!result.matrix) {
      return failure([
        `Die ${fileLabel}-CSV konnte nicht gelesen werden.`,
        ...result.issues.filter((issue) => issue.severity === "error").map(formatIssue),
      ]);
    }
    if (result.matrix.objectType !== objectType) {
      return failure([`Die als ${fileLabel} übergebene Datei enthält Daten der Objektart ${result.matrix.objectType.toUpperCase()}.`]);
    }
    matrices[objectType] = result.matrix;
  }

  const prepared = prepareVropsTimeSeriesPayloadFromMatrices(matrices);
  const parseErrors = issues.filter((issue) => issue.severity === "error").map(formatIssue);
  if (prepared.errors.length > 0 || parseErrors.length > 0) {
    return { ...failure([...parseErrors, ...prepared.errors]), gridDiagnostics: prepared.gridDiagnostics };
  }

  return {
    chunks: prepared.payload!.chunks,
    summaries: prepared.payload!.summaries,
    objectNamesByType: {
      vm: prepared.payload!.objectNames.get("vm") ?? [],
      cluster: prepared.payload!.objectNames.get("cluster") ?? [],
      host: prepared.payload!.objectNames.get("host") ?? [],
    },
    rangeStartUtc: prepared.payload!.rangeStartUtc,
    rangeEndUtc: prepared.payload!.rangeEndUtc,
    expectedSlots: prepared.payload!.expectedSlots,
    schemaVersion: Math.max(...VROPS_TIME_SERIES_OBJECT_TYPES.map((type) => matrices[type].schema.version)),
    fileStats: {
      vm: fileStatsOf(matrices.vm),
      cluster: fileStatsOf(matrices.cluster),
      host: fileStatsOf(matrices.host),
    },
    issueCountsByCode,
    warnings: [
      ...issues.filter((issue) => issue.severity === "warning").map(formatIssue),
      ...prepared.warnings,
    ],
    errors: [],
    gridDiagnostics: prepared.gridDiagnostics,
  };
}

/** Sammelt die ArrayBuffers der Chunks für den kopierfreien Transfer. */
export function collectVropsTimeSeriesTransferables(chunks: VropsTimeSeriesChunk[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const chunk of chunks) {
    for (const buffer of Object.values(chunk.metricValues)) {
      if (buffer instanceof ArrayBuffer) buffers.add(buffer);
    }
    if (chunk.maintenanceCodes instanceof ArrayBuffer) buffers.add(chunk.maintenanceCodes);
    if (chunk.maintenanceDerived instanceof ArrayBuffer) buffers.add(chunk.maintenanceDerived);
  }
  return [...buffers];
}

function fileStatsOf(matrix: VropsTimeSeriesMatrix): VropsTimeSeriesFileStats {
  const metricHeaders = Object.values(matrix.schema.metricHeaders);
  return {
    fileChecksum: matrix.fileChecksum,
    rowCount: matrix.rowCount,
    columnCount: metricHeaders.length + 2,
    detectedColumns: [matrix.schema.objectNameHeader, matrix.schema.intervalHeader, ...metricHeaders],
  };
}

function formatIssue(issue: VropsTimeSeriesValidationIssue): string {
  return `${issue.row ? `Zeile ${issue.row}: ` : ""}${issue.message}`;
}

function failure(errors: string[]): VropsTimeSeriesWorkerPayload {
  return { ...emptyVropsTimeSeriesWorkerPayload(), errors };
}
