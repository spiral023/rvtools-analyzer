import {
  getBySnapshotIds,
  getSnapshots,
  getVropsTimeSeriesImportByFileSetChecksum,
  persistVropsTimeSeriesImport,
} from "@/data/db";
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  VropsRelationshipIssue,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesMetricSummary,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesParseResult,
  VropsTimeSeriesQualitySummary,
  VropsTimeSeriesSourceFile,
  VropsTimeSeriesSiteRule,
  VropsTimeSeriesSummary,
  VropsTimeSeriesWorkerResult,
} from "@/domain/models/types";
import { computeChecksum } from "@/lib/xlsx/parseHelpers";
import { shortId } from "@/lib/shortId";
import { buildVropsTimeSeriesRelationships, createVropsTimeSeriesObjectKey } from "@/domain/services/vropsRelationshipService";

const HOUR_MS = 60 * 60 * 1000;

export interface VropsTimeSeriesFileSet {
  vm: File;
  cluster: File;
  host: File;
}

/** Regeln werden bei jedem Import als Beziehungsergebnis in den Objekten eingefroren. */
export interface VropsTimeSeriesImportOptions {
  siteRules?: readonly VropsTimeSeriesSiteRule[];
}

export interface VropsTimeSeriesImportProgress {
  step: string;
  percent: number;
  detail?: string;
}

export interface VropsTimeSeriesImportResult {
  success: boolean;
  importId?: string;
  warnings: string[];
  errors: string[];
  qualitySummary?: VropsTimeSeriesQualitySummary;
}

interface PreparedPayload {
  chunks: VropsTimeSeriesChunk[];
  summaries: VropsTimeSeriesSummary[];
  objectNames: Map<VropsTimeSeriesObjectType, string[]>;
  rangeStartUtc: number;
  rangeEndUtc: number;
  expectedSlots: number;
}

export async function importVropsTimeSeriesFileSet(
  files: VropsTimeSeriesFileSet,
  rvtoolsSnapshotIds: string[],
  onProgress?: (progress: VropsTimeSeriesImportProgress) => void,
  options?: VropsTimeSeriesImportOptions,
): Promise<VropsTimeSeriesImportResult> {
  const report = (step: string, percent: number, detail?: string) => onProgress?.({ step, percent, detail });
  const selectedSnapshotIds = [...new Set(rvtoolsSnapshotIds)];
  if (selectedSnapshotIds.length === 0) {
    return { success: false, warnings: [], errors: ["Für den Zeitreihenimport muss mindestens ein RVTools-Snapshot gewählt werden."] };
  }

  report("CSV-Dateien lesen", 5);
  const entries = [
    ["vm", files.vm],
    ["cluster", files.cluster],
    ["host", files.host],
  ] as const satisfies ReadonlyArray<readonly [VropsTimeSeriesObjectType, File]>;
  const buffers = await Promise.all(entries.map(([, file]) => file.arrayBuffer()));

  report("Prüfsummen berechnen", 15);
  const checksums = await Promise.all(buffers.map((buffer) => computeChecksum(buffer)));
  const fileSetChecksum = await computeChecksum(new TextEncoder().encode(
    entries.map(([type], index) => `${type}:${checksums[index]}`).join("\n"),
  ).buffer);
  const existing = await getVropsTimeSeriesImportByFileSetChecksum(fileSetChecksum);
  if (existing) {
    return {
      success: false,
      warnings: [],
      errors: [`Dieser VM-/Cluster-/Host-Dateisatz wurde bereits am ${new Date(existing.importedAt).toLocaleString("de-DE")} importiert.`],
    };
  }

  report("Zeitreihen im Worker parsen", 30, "VM, Cluster und Host");
  const workerResult = await parseInWorker(buffers);
  const parsedByType = validateParsedFileSet(workerResult.parsedFiles);
  if (parsedByType.errors.length > 0) return { success: false, warnings: parsedByType.warnings, errors: parsedByType.errors };

  report("Stundenraster prüfen", 50);
  const prepared = prepareVropsTimeSeriesPayload(parsedByType.files!);
  if (prepared.errors.length > 0) return { success: false, warnings: parsedByType.warnings, errors: prepared.errors };

  report("RVTools-Scope prüfen", 60);
  const snapshots = await getSnapshots();
  const selectedSnapshots = snapshots.filter((snapshot) => selectedSnapshotIds.includes(snapshot.snapshotId));
  if (selectedSnapshots.length !== selectedSnapshotIds.length) {
    return { success: false, warnings: parsedByType.warnings, errors: ["Mindestens ein gewählter RVTools-Snapshot ist nicht mehr verfügbar."] };
  }
  const importedAt = new Date().toISOString();
  const importId = shortId();
  const [vms, hosts, clusters] = await Promise.all([
    getBySnapshotIds<NormalizedVm>("entities_vm", selectedSnapshotIds),
    getBySnapshotIds<NormalizedHost>("entities_host", selectedSnapshotIds),
    getBySnapshotIds<NormalizedCluster>("entities_cluster", selectedSnapshotIds),
  ]);
  const relationships = buildVropsTimeSeriesRelationships({
    importId,
    objectNames: prepared.payload!.objectNames,
    inventory: { vms, hosts, clusters, snapshots: selectedSnapshots },
    siteRules: options?.siteRules,
  });
  const objects = relationships.objects;
  const relationshipWarnings = relationships.issues.map((issue) => issue.message);
  const qualitySummary = buildQualitySummary(parsedByType.files!, prepared.payload!, relationships.issues);
  const sourceFiles = entries.map(([objectType, file], index) => {
    const parsed = parsedByType.files![objectType];
    return {
      objectType,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileChecksum: checksums[index],
      rowCount: parsed.rows.length,
      columnCount: Object.keys(parsed.schema!.metricHeaders).length + 2,
      detectedColumns: [parsed.schema!.objectNameHeader, parsed.schema!.intervalHeader, ...Object.values(parsed.schema!.metricHeaders)],
      status: "accepted",
    } satisfies VropsTimeSeriesSourceFile;
  });
  const meta: VropsTimeSeriesImport = {
    id: importId,
    importedAt,
    timezone: "Europe/Vienna",
    intervalMinutes: 60,
    rangeStartUtc: prepared.payload!.rangeStartUtc,
    rangeEndUtc: prepared.payload!.rangeEndUtc,
    expectedSlots: prepared.payload!.expectedSlots,
    rvtoolsSnapshotIds: selectedSnapshotIds,
    files: sourceFiles,
    fileSetChecksum,
    schemaVersion: Math.max(...Object.values(parsedByType.files!).map((file) => file.schema!.version)),
    validationStatus: objects.every((object) => object.matchStatus === "matched") ? "relationships-valid" : "relationships-partial",
    qualitySummary,
    relationshipIssues: relationships.issues,
  };

  report("Zeitreihen lokal speichern", 75, `${prepared.payload!.chunks.length} kompakte Blöcke`);
  await persistVropsTimeSeriesImport(
    meta,
    objects,
    prepared.payload!.chunks.map((chunk) => ({ ...chunk, importId })),
    prepared.payload!.summaries.map((summary) => ({ ...summary, importId })),
  );
  report("Abgeschlossen", 100, `${qualitySummary.expectedSlots} Stunden, ${objects.length} Objekte`);
  return { success: true, importId, warnings: [...parsedByType.warnings, ...relationshipWarnings], errors: [], qualitySummary };
}

function parseInWorker(buffers: ArrayBuffer[]): Promise<VropsTimeSeriesWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/vrops-timeseries.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data.type === "VROPS_TIMESERIES_PARSE_ERROR") reject(new Error(event.data.payload));
      else resolve(event.data.payload as VropsTimeSeriesWorkerResult);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event);
    };
    worker.postMessage({ type: "PARSE_VROPS_TIMESERIES_FILES", payload: { buffers } }, buffers);
  });
}

function formatIssues(result: VropsTimeSeriesParseResult): { warnings: string[]; errors: string[] } {
  const format = (issue: VropsTimeSeriesParseResult["issues"][number]) =>
    `${issue.row ? `Zeile ${issue.row}: ` : ""}${issue.message}`;
  return {
    warnings: result.issues.filter((issue) => issue.severity === "warning").map(format),
    errors: result.issues.filter((issue) => issue.severity === "error").map(format),
  };
}

function validateParsedFileSet(parsedFiles: VropsTimeSeriesParseResult[]): {
  files?: Record<VropsTimeSeriesObjectType, VropsTimeSeriesParseResult>;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const files = {} as Partial<Record<VropsTimeSeriesObjectType, VropsTimeSeriesParseResult>>;
  for (const parsed of parsedFiles) {
    const issues = formatIssues(parsed);
    warnings.push(...issues.warnings);
    errors.push(...issues.errors);
    const type = parsed.schema?.objectType;
    if (!type) continue;
    if (files[type]) errors.push(`Die Objektart ${type} wurde mehr als einmal geliefert.`);
    else files[type] = parsed;
  }
  for (const type of ["vm", "cluster", "host"] as const) {
    if (!files[type]) errors.push(`Die verpflichtende ${type.toUpperCase()}-CSV konnte nicht erkannt werden.`);
  }
  return errors.length > 0 ? { warnings, errors } : { files: files as Record<VropsTimeSeriesObjectType, VropsTimeSeriesParseResult>, warnings, errors };
}

/** Exportiert für Tests und den Worker-Vertrag die kompakte, noch nicht persistierte Nutzlast. */
export function prepareVropsTimeSeriesPayload(files: Record<VropsTimeSeriesObjectType, VropsTimeSeriesParseResult>): {
  payload?: PreparedPayload;
  errors: string[];
} {
  const errors: string[] = [];
  const grids = new Map<VropsTimeSeriesObjectType, number[]>();
  for (const type of ["vm", "cluster", "host"] as const) {
    const file = files[type];
    const timestamps = [...new Set(file.rows.map((row) => row.intervalStartUtc))].sort((left, right) => left - right);
    if (timestamps.length === 0) errors.push(`Die ${type.toUpperCase()}-CSV enthält keine gültigen Messpunkte.`);
    grids.set(type, timestamps);
    const byObject = new Map<string, number[]>();
    for (const row of file.rows) {
      const objectTimestamps = byObject.get(row.objectName) ?? [];
      objectTimestamps.push(row.intervalStartUtc);
      byObject.set(row.objectName, objectTimestamps);
    }
    for (const [objectName, objectTimestamps] of byObject) {
      const unique = [...new Set(objectTimestamps)].sort((left, right) => left - right);
      if (!sameGrid(unique, timestamps)) errors.push(`${type.toUpperCase()}-Objekt „${objectName}“ besitzt kein vollständiges gemeinsames Stundenraster.`);
    }
  }
  const vmGrid = grids.get("vm") ?? [];
  for (const type of ["cluster", "host"] as const) {
    if (!sameGrid(vmGrid, grids.get(type) ?? [])) errors.push(`Das Stundenraster der ${type.toUpperCase()}-CSV stimmt nicht mit der VM-CSV überein.`);
  }
  if (errors.length > 0) return { errors };

  const chunks: VropsTimeSeriesChunk[] = [];
  const summaries: VropsTimeSeriesSummary[] = [];
  const objectNames = new Map<VropsTimeSeriesObjectType, string[]>();
  for (const type of ["vm", "cluster", "host"] as const) {
    const file = files[type];
    const names = [...new Set(file.rows.map((row) => row.objectName))].sort((left, right) => left.localeCompare(right, "en-US"));
    const objectKeys = names.map((name) => createVropsTimeSeriesObjectKey(type, name));
    if (new Set(objectKeys).size !== objectKeys.length) {
      return { errors: [`Die ${type.toUpperCase()}-CSV enthält Objektbezeichner, die sich nur in Groß-/Kleinschreibung unterscheiden.`] };
    }
    objectNames.set(type, names);
    const slots = vmGrid.length;
    const objectIndex = new Map(names.map((name, index) => [name, index]));
    const slotIndex = new Map(vmGrid.map((timestamp, index) => [timestamp, index]));
    const metricKeys = Object.keys(file.schema!.metricHeaders) as VropsTimeSeriesMetricKey[];
    const numericMetricKeys = metricKeys.filter((key) => key !== "hostMaintenanceStateLast");
    const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
    const summaryValues = new Map<VropsTimeSeriesMetricKey, Float32Array>();
    for (const metric of numericMetricKeys) {
      const values = new Float32Array(names.length * slots);
      values.fill(Number.NaN);
      summaryValues.set(metric, values);
      metricValues[metric] = values.buffer;
    }
    const maintenanceStates = metricKeys.includes("hostMaintenanceStateLast") ? Array<string | null>(names.length * slots).fill(null) : undefined;
    const maintenanceDerived = maintenanceStates ? new Uint8Array(names.length * slots) : undefined;
    for (const row of file.rows) {
      const position = objectIndex.get(row.objectName)! * slots + slotIndex.get(row.intervalStartUtc)!;
      for (const metric of numericMetricKeys) {
        const value = row.values[metric];
        if (typeof value === "number") summaryValues.get(metric)![position] = value;
      }
      if (maintenanceStates) {
        const state = row.values.hostMaintenanceStateLast;
        maintenanceStates[position] = typeof state === "string" ? state : null;
        if (row.derivedMetrics?.hostMaintenanceStateLast) maintenanceDerived![position] = 1;
      }
    }
    for (let index = 0; index < names.length; index += 1) {
      const metricStats: VropsTimeSeriesSummary["metricStats"] = {};
      for (const metric of numericMetricKeys) {
        metricStats[metric] = summarizeMetric(summaryValues.get(metric)!, index * slots, slots);
      }
      summaries.push({ importId: "", objectKey: objectKeys[index], objectType: type, metricStats });
    }
    chunks.push({
      importId: "",
      objectType: type,
      chunkKey: "all",
      clusterKey: null,
      startUtc: vmGrid[0],
      slotCount: slots,
      objectKeys,
      metricValues,
      ...(maintenanceStates ? { maintenanceStates, maintenanceDerived: maintenanceDerived!.buffer } : {}),
    });
  }
  return {
    errors,
    payload: {
      chunks,
      summaries,
      objectNames,
      rangeStartUtc: vmGrid[0],
      rangeEndUtc: vmGrid.at(-1)!,
      expectedSlots: vmGrid.length,
    },
  };
}

function summarizeMetric(values: Float32Array, start: number, count: number): VropsTimeSeriesMetricSummary {
  let presentSlots = 0;
  let sum = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = start; index < start + count; index += 1) {
    const value = values[index];
    if (Number.isNaN(value)) continue;
    presentSlots += 1;
    sum += value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return {
    expectedSlots: count,
    presentSlots,
    missingSlots: count - presentSlots,
    minimum: presentSlots ? minimum : null,
    maximum: presentSlots ? maximum : null,
    average: presentSlots ? sum / presentSlots : null,
  };
}

function sameGrid(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]) && left.every((value, index) => index === 0 || value - left[index - 1] === HOUR_MS);
}

function buildQualitySummary(
  files: Record<VropsTimeSeriesObjectType, VropsTimeSeriesParseResult>,
  payload: PreparedPayload,
  relationshipIssues: readonly VropsRelationshipIssue[],
): VropsTimeSeriesQualitySummary {
  const issues = Object.values(files).flatMap((file) => file.issues);
  return {
    objectCountByType: {
      vm: payload.objectNames.get("vm")?.length ?? 0,
      cluster: payload.objectNames.get("cluster")?.length ?? 0,
      host: payload.objectNames.get("host")?.length ?? 0,
    },
    expectedSlots: payload.expectedSlots,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length + relationshipIssues.length,
    missingValueCount: issues.filter((issue) => issue.code === "missing-value").length,
  };
}
