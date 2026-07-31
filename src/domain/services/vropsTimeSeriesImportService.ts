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
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesMetricSummary,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesQualitySummary,
  VropsTimeSeriesSourceFile,
  VropsTimeSeriesSiteRule,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { computeChecksum } from "@/lib/xlsx/parseHelpers";
import { shortId } from "@/lib/shortId";
import { buildVropsTimeSeriesRelationships, createVropsTimeSeriesObjectKey } from "@/domain/services/vropsRelationshipService";
import type { VropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";
import {
  emptyVropsTimeSeriesWorkerPayload,
  type VropsTimeSeriesWorkerPayload,
} from "@/domain/services/vropsTimeSeriesWorkerPayload";

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
  gridDiagnostics?: VropsTimeSeriesGridDiagnostic[];
}

/** Kompakte, UI-unabhängige Erklärung des gemeinsamen Stundenrasters. */
export interface VropsTimeSeriesGridDiagnostic {
  objectType: VropsTimeSeriesObjectType;
  slotCount: number;
  rangeStartUtc?: number;
  rangeEndUtc?: number;
  missingHourlySlots: number;
  missingFromVmCount: number;
  additionalToVmCount: number;
  missingFromVmSamples: number[];
  additionalToVmSamples: number[];
}

interface PreparedPayload {
  chunks: VropsTimeSeriesChunk[];
  summaries: VropsTimeSeriesSummary[];
  objectNames: Map<VropsTimeSeriesObjectType, string[]>;
  rangeStartUtc: number;
  rangeEndUtc: number;
  expectedSlots: number;
}

/**
 * Der RVTools-Scope wird nicht mehr manuell gewählt, sondern umfasst automatisch alle aktuell
 * gespeicherten Snapshots: VM-, Cluster- und Hostnamen sind in der Praxis vCenter-übergreifend
 * eindeutig, und ein echter Namenskonflikt wird von `buildVropsTimeSeriesRelationships` ohnehin
 * als "ambiguous"/"name-collision" erkannt und im Datenqualitätsbericht sichtbar gemacht statt
 * still falsch zugeordnet.
 */
export async function importVropsTimeSeriesFileSet(
  files: VropsTimeSeriesFileSet,
  onProgress?: (progress: VropsTimeSeriesImportProgress) => void,
  options?: VropsTimeSeriesImportOptions,
): Promise<VropsTimeSeriesImportResult> {
  const report = (step: string, percent: number, detail?: string) => onProgress?.({ step, percent, detail });

  report("Zeitreihen im Worker parsen", 10, "VM, Cluster und Host");
  const entries = [
    ["vm", files.vm],
    ["cluster", files.cluster],
    ["host", files.host],
  ] as const satisfies ReadonlyArray<readonly [VropsTimeSeriesObjectType, File]>;

  // Der Worker streamt die Dateien, baut die Matrizen und liefert die fertige
  // Nutzlast zurück; Prüfsummen fallen dabei nebenbei an.
  const workerResult = await parseInWorker(files, (progress) => report(progress.step, progress.percent, progress.detail));
  if (workerResult.errors.length > 0) {
    return {
      success: false,
      warnings: workerResult.warnings,
      errors: workerResult.errors,
      gridDiagnostics: workerResult.gridDiagnostics as VropsTimeSeriesGridDiagnostic[],
    };
  }

  report("Dateisatz prüfen", 55);
  const fileSetChecksum = await computeChecksum(new TextEncoder().encode(
    entries.map(([type]) => `${type}:${workerResult.fileStats[type].fileChecksum}`).join("\n"),
  ).buffer);
  const existing = await getVropsTimeSeriesImportByFileSetChecksum(fileSetChecksum);
  if (existing) {
    return {
      success: false,
      warnings: [],
      errors: [`Dieser VM-/Cluster-/Host-Dateisatz wurde bereits am ${new Date(existing.importedAt).toLocaleString("de-DE")} importiert.`],
    };
  }

  const objectNames = new Map<VropsTimeSeriesObjectType, string[]>(
    entries.map(([type]) => [type, workerResult.objectNamesByType[type]]),
  );

  report("RVTools-Scope prüfen", 60);
  const snapshots = await getSnapshots();
  if (snapshots.length === 0) {
    return {
      success: false,
      warnings: workerResult.warnings,
      errors: ["Für den Zeitreihenimport muss zuerst mindestens ein RVTools-Snapshot importiert sein."],
      gridDiagnostics: workerResult.gridDiagnostics as VropsTimeSeriesGridDiagnostic[],
    };
  }
  const rvtoolsSnapshotIds = snapshots.map((snapshot) => snapshot.snapshotId);
  const importedAt = new Date().toISOString();
  const importId = shortId();
  const [vms, hosts, clusters] = await Promise.all([
    getBySnapshotIds<NormalizedVm>("entities_vm", rvtoolsSnapshotIds),
    getBySnapshotIds<NormalizedHost>("entities_host", rvtoolsSnapshotIds),
    getBySnapshotIds<NormalizedCluster>("entities_cluster", rvtoolsSnapshotIds),
  ]);
  const relationships = buildVropsTimeSeriesRelationships({
    importId,
    objectNames,
    inventory: { vms, hosts, clusters, snapshots },
    siteRules: options?.siteRules,
  });
  const objects = relationships.objects;
  const relationshipWarnings = relationships.issues.map((issue) => issue.message);
  const qualitySummary: VropsTimeSeriesQualitySummary = {
    objectCountByType: {
      vm: objectNames.get("vm")?.length ?? 0,
      cluster: objectNames.get("cluster")?.length ?? 0,
      host: objectNames.get("host")?.length ?? 0,
    },
    expectedSlots: workerResult.expectedSlots,
    errorCount: 0,
    warningCount: workerResult.warnings.length + relationships.issues.length,
    missingValueCount: workerResult.issueCountsByCode["missing-value"] ?? 0,
  };
  const sourceFiles = entries.map(([objectType, file]) => {
    const stats = workerResult.fileStats[objectType];
    return {
      objectType,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileChecksum: stats.fileChecksum,
      rowCount: stats.rowCount,
      columnCount: stats.columnCount,
      detectedColumns: stats.detectedColumns,
      status: "accepted",
    } satisfies VropsTimeSeriesSourceFile;
  });
  const meta: VropsTimeSeriesImport = {
    id: importId,
    importedAt,
    timezone: "Europe/Vienna",
    intervalMinutes: 60,
    rangeStartUtc: workerResult.rangeStartUtc,
    rangeEndUtc: workerResult.rangeEndUtc,
    expectedSlots: workerResult.expectedSlots,
    rvtoolsSnapshotIds,
    files: sourceFiles,
    fileSetChecksum,
    schemaVersion: workerResult.schemaVersion,
    validationStatus: objects.every((object) => object.matchStatus === "matched") ? "relationships-valid" : "relationships-partial",
    qualitySummary,
    relationshipIssues: relationships.issues,
  };

  report("Zeitreihen lokal speichern", 75, `${workerResult.chunks.length} kompakte Blöcke`);
  await persistVropsTimeSeriesImport(
    meta,
    objects,
    workerResult.chunks.map((chunk) => ({ ...chunk, importId })),
    workerResult.summaries.map((summary) => ({ ...summary, importId })),
  );
  report("Abgeschlossen", 100, `${qualitySummary.expectedSlots} Stunden, ${objects.length} Objekte`);
  return {
    success: true,
    importId,
    warnings: [...workerResult.warnings, ...relationshipWarnings],
    errors: [],
    qualitySummary,
    gridDiagnostics: workerResult.gridDiagnostics as VropsTimeSeriesGridDiagnostic[],
  };
}

function parseInWorker(
  files: VropsTimeSeriesFileSet,
  onProgress?: (progress: VropsTimeSeriesImportProgress) => void,
): Promise<VropsTimeSeriesWorkerPayload> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/vrops-timeseries.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      if (event.data.type === "VROPS_TIMESERIES_PARSE_PROGRESS") {
        const { fileIndex, fileLabel, pass, bytesRead, totalBytes } = event.data.payload as {
          fileIndex: number; fileLabel: string; pass: 1 | 2; bytesRead: number; totalBytes: number;
        };
        // Je Datei zwei Durchgänge; daraus ein monoton steigender Gesamtfortschritt.
        const fileFraction = totalBytes > 0 ? ((pass - 1) + bytesRead / totalBytes) / 2 : 0;
        onProgress?.({
          step: "Zeitreihen im Worker parsen",
          percent: 10 + Math.round(((fileIndex + fileFraction) / 3) * 45),
          detail: `${fileLabel}: Durchgang ${pass} von 2 — ${formatMebibytes(bytesRead)} / ${formatMebibytes(totalBytes)}`,
        });
        return;
      }
      if (event.data.type === "VROPS_TIMESERIES_PARSE_FAILED") {
        worker.terminate();
        const { errors, gridDiagnostics } = event.data.payload as { errors: string[]; gridDiagnostics: unknown[] };
        resolve({ ...emptyVropsTimeSeriesWorkerPayload(), errors, gridDiagnostics });
        return;
      }
      worker.terminate();
      if (event.data.type === "VROPS_TIMESERIES_PARSE_ERROR") reject(new Error(event.data.payload));
      else resolve(event.data.payload as VropsTimeSeriesWorkerPayload);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event);
    };
    worker.postMessage({ type: "PARSE_VROPS_TIMESERIES_FILES", payload: { files } });
  });
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * Baut die Persistenz-Nutzlast aus bereits gefüllten Matrizen.
 *
 * Gegenstück zu {@link prepareVropsTimeSeriesPayload} für den gestreamten
 * Importpfad: Die Float32-Felder der Matrix sind bereits der Chunk-Inhalt, es
 * wird nur noch validiert und zusammengesetzt statt umkopiert.
 */
export function prepareVropsTimeSeriesPayloadFromMatrices(
  matrices: Record<VropsTimeSeriesObjectType, VropsTimeSeriesMatrix>,
): {
  payload?: PreparedPayload;
  errors: string[];
  warnings: string[];
  gridDiagnostics: VropsTimeSeriesGridDiagnostic[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const grids = new Map<VropsTimeSeriesObjectType, number[]>(
    (["vm", "cluster", "host"] as const).map((type) => [type, matrices[type].timestampsUtc]),
  );
  for (const type of ["vm", "cluster", "host"] as const) {
    if (matrices[type].timestampsUtc.length === 0) {
      errors.push(`Die ${type.toUpperCase()}-CSV enthält keine gültigen Messpunkte.`);
    }
    const partialObjects = countPartialObjects(matrices[type]);
    if (partialObjects > 0) {
      warnings.push(`${type.toUpperCase()}-CSV enthält ${partialObjects.toLocaleString("de-DE")} Objekt(e) mit Teilzeitraum. Fehlende Stunden werden als Missing Values gespeichert und in der Datenqualität ausgewiesen.`);
    }
  }

  const gridDiagnostics = buildGridDiagnostics(grids);
  for (const diagnostic of gridDiagnostics) {
    if (diagnostic.missingHourlySlots > 0) {
      errors.push(`${diagnostic.objectType.toUpperCase()}-CSV enthält ${diagnostic.missingHourlySlots.toLocaleString("de-DE")} Lücke(n) im Stundenraster.`);
    }
  }
  for (const type of ["cluster", "host"] as const) {
    const diagnostic = gridDiagnostics.find((candidate) => candidate.objectType === type)!;
    if (diagnostic.missingFromVmCount > 0 || diagnostic.additionalToVmCount > 0) {
      errors.push(
        `Stundenraster der ${type.toUpperCase()}-CSV passt nicht zur VM-CSV: `
        + `${diagnostic.missingFromVmCount.toLocaleString("de-DE")} fehlende und ${diagnostic.additionalToVmCount.toLocaleString("de-DE")} zusätzliche Stunde(n).`,
      );
    }
  }
  if (errors.length > 0) return { errors, warnings, gridDiagnostics };

  const vmGrid = matrices.vm.timestampsUtc;
  const chunks: VropsTimeSeriesChunk[] = [];
  const summaries: VropsTimeSeriesSummary[] = [];
  const objectNames = new Map<VropsTimeSeriesObjectType, string[]>();

  for (const type of ["vm", "cluster", "host"] as const) {
    const matrix = matrices[type];
    const objectKeys = matrix.objectNames.map((name) => createVropsTimeSeriesObjectKey(type, name));
    if (new Set(objectKeys).size !== objectKeys.length) {
      return {
        errors: [`Die ${type.toUpperCase()}-CSV enthält Objektbezeichner, die sich nur in Groß-/Kleinschreibung unterscheiden.`],
        warnings,
        gridDiagnostics,
      };
    }
    objectNames.set(type, matrix.objectNames);
    const slots = matrix.timestampsUtc.length;
    const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
    for (const [metric, values] of Object.entries(matrix.metricValues) as Array<[VropsTimeSeriesMetricKey, Float32Array]>) {
      metricValues[metric] = values.buffer as ArrayBuffer;
    }

    for (let index = 0; index < objectKeys.length; index += 1) {
      const metricStats: VropsTimeSeriesSummary["metricStats"] = {};
      for (const [metric, values] of Object.entries(matrix.metricValues) as Array<[VropsTimeSeriesMetricKey, Float32Array]>) {
        metricStats[metric] = summarizeMetric(values, index * slots, slots);
      }
      summaries.push({ importId: "", objectKey: objectKeys[index], objectType: type, metricStats });
    }

    chunks.push({
      importId: "",
      objectType: type,
      chunkKey: "all",
      clusterKey: null,
      startUtc: matrix.timestampsUtc[0],
      slotCount: slots,
      objectKeys,
      metricValues,
      ...(matrix.maintenanceCodes
        ? {
          maintenanceCodes: matrix.maintenanceCodes.buffer as ArrayBuffer,
          maintenanceLexicon: matrix.maintenanceLexicon ?? [],
          maintenanceDerived: matrix.maintenanceDerived!.buffer as ArrayBuffer,
        }
        : {}),
    });
  }

  return {
    errors,
    warnings,
    gridDiagnostics,
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

/** Zählt Objekte, die nicht in jedem Slot mindestens einen Messwert haben. */
function countPartialObjects(matrix: VropsTimeSeriesMatrix): number {
  const slots = matrix.timestampsUtc.length;
  const metricArrays = Object.values(matrix.metricValues);
  if (slots === 0 || metricArrays.length === 0) return 0;

  let partial = 0;
  for (let objectIndex = 0; objectIndex < matrix.objectNames.length; objectIndex += 1) {
    const base = objectIndex * slots;
    for (let slot = 0; slot < slots; slot += 1) {
      const hasValue = metricArrays.some((values) => !Number.isNaN(values[base + slot]));
      if (!hasValue) {
        partial += 1;
        break;
      }
    }
  }
  return partial;
}

function buildGridDiagnostics(grids: ReadonlyMap<VropsTimeSeriesObjectType, number[]>): VropsTimeSeriesGridDiagnostic[] {
  const vmGrid = grids.get("vm") ?? [];
  const vmSlots = new Set(vmGrid);
  return (["vm", "cluster", "host"] as const).map((objectType) => {
    const timestamps = grids.get(objectType) ?? [];
    const slots = new Set(timestamps);
    const missingHourlySlots = timestamps.reduce((missing, timestamp, index) => {
      if (index === 0) return missing;
      const elapsedHours = (timestamp - timestamps[index - 1]) / HOUR_MS;
      return elapsedHours > 1 ? missing + Math.round(elapsedHours - 1) : missing;
    }, 0);
    const missingFromVm = objectType === "vm" ? [] : vmGrid.filter((timestamp) => !slots.has(timestamp));
    const additionalToVm = objectType === "vm" ? [] : timestamps.filter((timestamp) => !vmSlots.has(timestamp));
    return {
      objectType,
      slotCount: timestamps.length,
      ...(timestamps[0] !== undefined ? { rangeStartUtc: timestamps[0], rangeEndUtc: timestamps.at(-1)! } : {}),
      missingHourlySlots,
      missingFromVmCount: missingFromVm.length,
      additionalToVmCount: additionalToVm.length,
      missingFromVmSamples: missingFromVm.slice(0, 3),
      additionalToVmSamples: additionalToVm.slice(0, 3),
    };
  });
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
