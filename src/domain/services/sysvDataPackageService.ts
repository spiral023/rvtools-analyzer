import {
  getAllTechInfoLatest,
  getAllTechInfoRows,
  getBySnapshotIds,
  getRawSheetBlobsBySnapshotIds,
  getSnapshots,
  getVropsTimeSeriesChunks,
  getVropsTimeSeriesImports,
  getVropsTimeSeriesObjects,
  getVropsTimeSeriesSummaries,
} from "@/data/db";
import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHost,
  NormalizedSnapshot,
  NormalizedVm,
  RawSheetBlob,
  SheetRow,
  SnapshotMeta,
  SysvDataPackageManifestV1,
  SysvDataPackageManifestWarning,
  SysvDataPackageScope,
  TechInfoImportMeta,
  TechInfoLatest,
  TechInfoRow,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesQualitySummary,
  VropsTimeSeriesSourceFile,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import { gunzipJson } from "@/lib/compression";
import { buildSysvDataPackageScopeDirectory, resolveSysvDataPackageVmNames } from "@/lib/sysvDataPackageScope";
import { filterSysvRawSheet, deriveSysvRawScopeReferences, type FilteredSysvRawSheet, type SysvRawSheetScopeWarning } from "@/domain/services/sysvRawSheetScopeService";
import { toVropsTimeSeriesMetricColumns } from "@/domain/services/vropsTimeSeriesSchema";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import { serializeSysvDataPackage, type SysvDataPackagePayload, type SysvDataPackageRawSheet, type SysvDataPackageVropsPayload } from "@/lib/export/sysvDataPackageFormat";
import { shortId } from "@/lib/shortId";

export type SysvDataPackageProgressStep =
  | "Scope auflösen"
  | "RVTools-Daten filtern"
  | "Tech-Info filtern"
  | "vROps-Zeitreihen beschneiden"
  | "Prüfsummen berechnen"
  | "ZIP komprimieren"
  | "Download vorbereiten";

export interface SysvDataPackageProgress {
  step: SysvDataPackageProgressStep;
  percent: number;
  detail?: string;
}

export interface SysvDataPackageVmCandidate {
  vmKey: string;
  vmName: string;
  snapshotId: string;
  vcenterId: string;
}

export interface SysvDataPackageDiagnostic {
  code: string;
  message: string;
  vmName?: string;
  candidates?: SysvDataPackageVmCandidate[];
  count?: number;
}

export interface SysvDataPackagePreview {
  packageId: string;
  scope: SysvDataPackageScope;
  selectedTechInfoVmNames: string[];
  vms: NormalizedVm[];
  vcenters: string[];
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  vropsVmObjects: VropsTimeSeriesImportedObject[];
  vropsVmNamesWithSeries: string[];
  vropsVmNamesWithoutSeries: string[];
  vropsImport: VropsTimeSeriesImport | null;
  warnings: SysvDataPackageDiagnostic[];
  errors: SysvDataPackageDiagnostic[];
  estimatedUncompressedBytes: number;
  estimatedCompressedBytes: number;
  canExport: boolean;
}

export interface BuildSysvDataPackageOptions {
  includeVropsTimeSeries?: boolean;
  packageId?: string;
  createdAt?: string;
  appVersion?: string;
  onProgress?: (progress: SysvDataPackageProgress) => void;
}

export interface BuiltSysvDataPackage {
  payload: SysvDataPackagePayload;
  manifest: SysvDataPackageManifestV1;
  files: Record<string, Uint8Array<ArrayBuffer>>;
  preview: SysvDataPackagePreview;
}

export interface ResolvedSysvDataPackage {
  payload: SysvDataPackagePayload | null;
  preview: SysvDataPackagePreview;
}

export interface SnapshotRawData {
  snapshot: SnapshotMeta;
  blobs: RawSheetBlob[];
  sheets: Map<string, SheetRow[]>;
}

/** Einmalig geladene, über alle Scopes eines Laufs geteilte Rohdatenbasis. */
export interface SysvDataPackageSource {
  snapshots: SnapshotMeta[];
  techInfoLatest: TechInfoLatest[];
  techInfoRows: TechInfoRow[];
  /** `techInfoImportId`+`rowIndex` → Rohzeile, damit Zeiger je Scope in O(1) auflösbar bleiben. */
  techInfoRowsByPointer: ReadonlyMap<string, TechInfoRow>;
  allVms: NormalizedVm[];
  vmsByNormalizedName: ReadonlyMap<string, readonly NormalizedVm[]>;
  /** Normalisierte Namen aller RVTools-VMs je Snapshot (fail-closed Raw-Sheet-Filter). */
  vmNamesBySnapshot: ReadonlyMap<string, ReadonlySet<string>>;
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  snapshotEntities: NormalizedSnapshot[];
  rawData: SnapshotRawData[];
  vrops: {
    importMeta: VropsTimeSeriesImport;
    objects: VropsTimeSeriesImportedObject[];
    chunks: VropsTimeSeriesChunk[];
    summaries: VropsTimeSeriesSummary[];
  } | null;
}

function report(options: BuildSysvDataPackageOptions, step: SysvDataPackageProgressStep, percent: number, detail?: string): void {
  options.onProgress?.({ step, percent, detail });
}

export function sortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de-DE", { sensitivity: "base" }));
}

/** Zeigerschlüssel von `techinfo_latest` auf die zugehörige `techinfo_rows`-Zeile. */
function techInfoPointerKey(pointer: { techInfoImportId: string; rowIndex: number }): string {
  return `${pointer.techInfoImportId}\u0000${pointer.rowIndex}`;
}

function normalizedSet(values: Iterable<string>): Set<string> {
  return new Set([...values].map((value) => normalizeVmNameForMatch(value)).filter(Boolean));
}

function hydrateRows(blob: RawSheetBlob, values: Array<Array<string | number | boolean | null>>): SheetRow[] {
  return values.map((row, rowIndex) => {
    const data: SheetRow["data"] = {};
    for (let index = 0; index < blob.headers.length; index += 1) data[blob.headers[index]] = row[index] ?? null;
    return { snapshotId: blob.snapshotId, sheetName: blob.sheetName, rowIndex, data };
  });
}

async function loadSnapshotRawData(snapshots: SnapshotMeta[], options: BuildSysvDataPackageOptions): Promise<SnapshotRawData[]> {
  const snapshotIds = snapshots.map((snapshot) => snapshot.snapshotId);
  const blobs = await getRawSheetBlobsBySnapshotIds(snapshotIds);
  const bySnapshot = new Map<string, RawSheetBlob[]>();
  for (const blob of blobs) bySnapshot.set(blob.snapshotId, [...(bySnapshot.get(blob.snapshotId) ?? []), blob]);
  const result: SnapshotRawData[] = [];
  for (const snapshot of snapshots) {
    const snapshotBlobs = bySnapshot.get(snapshot.snapshotId) ?? [];
    const sheets = new Map<string, SheetRow[]>();
    for (const blob of snapshotBlobs) {
      report(options, "RVTools-Daten filtern", 24, `${snapshot.vcenterDisplayName}: ${blob.sheetName} lesen`);
      const values = await gunzipJson<Array<Array<string | number | boolean | null>>>(blob.data);
      sheets.set(blob.sheetName, hydrateRows(blob, values));
    }
    result.push({ snapshot, blobs: snapshotBlobs, sheets });
  }
  return result;
}

function diagnosticFromRawWarning(warning: SysvRawSheetScopeWarning): SysvDataPackageDiagnostic {
  return { code: warning.code, message: `${warning.sheetName}: ${warning.message}`, count: warning.count };
}

/** Zusammengesetzter Schlüssel für „Entität gehört zu Snapshot“ (Host, Datastore, VM-Name). */
function snapshotScopedKey(snapshotId: string, name: string): string {
  return `${snapshotId}\u0000${normalizeVmNameForMatch(name)}`;
}

function buildSnapshotScopedRawPayload(
  snapshotData: SnapshotRawData,
  selectedVms: readonly NormalizedVm[],
  vmNamesBySnapshot: ReadonlyMap<string, ReadonlySet<string>>,
  warnings: SysvDataPackageDiagnostic[],
): { rawSheets: SysvDataPackageRawSheet[]; snapshot: SnapshotMeta; hostNames: Set<string>; clusterNames: Set<string>; datastoreNames: Set<string> } {
  const selectedVmNames = normalizedSet(selectedVms.map((vm) => vm.vmName));
  const allVmNames = vmNamesBySnapshot.get(snapshotData.snapshot.snapshotId) ?? new Set<string>();
  const references = deriveSysvRawScopeReferences(snapshotData.sheets, selectedVmNames);
  // Host- und Cluster-Sheets müssen auch dann sicher filterbar bleiben, wenn ein
  // einzelnes VM-Sheet das Feld nicht führt. Die normalisierten VM-Beziehungen
  // sind dafür der primäre Referenzsatz; Datastores bleiben bewusst raw-only.
  const selectedHostNames = new Set([
    ...references.hostNames,
    ...selectedVms.map((vm) => normalizeVmNameForMatch(vm.host ?? "")).filter(Boolean),
  ]);
  const selectedClusterNames = new Set([
    ...references.clusterNames,
    ...selectedVms.map((vm) => normalizeVmNameForMatch(vm.cluster ?? "")).filter(Boolean),
  ]);
  const rawSheets: SysvDataPackageRawSheet[] = [];
  const sheetStats: Record<string, { rowCount: number; columnCount: number }> = {};
  for (const blob of snapshotData.blobs) {
    const rows = snapshotData.sheets.get(blob.sheetName) ?? [];
    const filtered: FilteredSysvRawSheet = filterSysvRawSheet({
      sheetName: blob.sheetName,
      headers: blob.headers,
      rows,
    }, {
      selectedVmNames,
       selectedHostNames,
       selectedClusterNames,
      selectedDatastoreNames: references.datastoreNames,
      selectedSwitchIds: references.switchIds,
      allVmNames,
    });
    warnings.push(...filtered.warnings.map(diagnosticFromRawWarning));
    if (filtered.values.length === 0) continue;
    rawSheets.push({
      snapshotId: blob.snapshotId,
      sheetName: blob.sheetName,
      headers: filtered.headers,
      values: filtered.values,
      sheetStats: { rowCount: filtered.values.length, columnCount: filtered.headers.length },
    });
    sheetStats[blob.sheetName] = { rowCount: filtered.values.length, columnCount: filtered.headers.length };
  }
  return {
    rawSheets,
    snapshot: {
      ...snapshotData.snapshot,
      sheetStats,
      restrictedDataset: snapshotData.snapshot.restrictedDataset,
    },
    hostNames: selectedHostNames,
    clusterNames: selectedClusterNames,
    datastoreNames: references.datastoreNames,
  };
}

function metricMissingValueCount(chunk: VropsTimeSeriesChunk): number {
  let missing = 0;
  for (const buffer of Object.values(chunk.metricValues)) {
    if (!buffer) continue;
    const values = new Float32Array(buffer);
    for (const value of values) if (Number.isNaN(value)) missing += 1;
  }
  return missing;
}

/** Schneidet einen VM-Chunk physisch anhand der ausgewählten Objektindizes. */
export function sliceVropsTimeSeriesChunk(
  chunk: VropsTimeSeriesChunk,
  selectedObjectKeys: ReadonlySet<string>,
): VropsTimeSeriesChunk | null {
  if (chunk.objectType !== "vm") return null;
  const indexes = chunk.objectKeys
    .map((objectKey, index) => selectedObjectKeys.has(objectKey) ? index : -1)
    .filter((index): index is number => index >= 0);
  if (indexes.length === 0) return null;
  const oldObjectCount = chunk.objectKeys.length;
  const slotCount = chunk.slotCount;
  if (!Number.isInteger(slotCount) || slotCount < 1) throw new Error(`vROps-Chunk ${chunk.chunkKey} hat eine ungültige Slot-Anzahl.`);
  const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
  for (const [metric, buffer] of Object.entries(chunk.metricValues)) {
    if (!buffer || buffer.byteLength % 4 !== 0) throw new Error(`vROps-Metrik ${metric} ist kein vollständiger Float32-Buffer.`);
    const source = new Float32Array(buffer);
    if (source.length !== oldObjectCount * slotCount) throw new Error(`vROps-Metrik ${metric} hat eine falsche Quelllänge.`);
    const target = new Float32Array(indexes.length * slotCount);
    indexes.forEach((sourceIndex, targetIndex) => {
      const start = sourceIndex * slotCount;
      target.set(source.subarray(start, start + slotCount), targetIndex * slotCount);
    });
    metricValues[metric as keyof typeof metricValues] = target.buffer as ArrayBuffer;
  }

  const target = (buffer: ArrayBuffer | undefined, label: string): ArrayBuffer | undefined => {
    if (!buffer) return undefined;
    if (buffer.byteLength !== oldObjectCount * slotCount) throw new Error(`vROps-${label} hat eine falsche Quelllänge.`);
    const source = new Uint8Array(buffer);
    const sliced = new Uint8Array(indexes.length * slotCount);
    indexes.forEach((sourceIndex, targetIndex) => sliced.set(source.subarray(sourceIndex * slotCount, (sourceIndex + 1) * slotCount), targetIndex * slotCount));
    return sliced.buffer as ArrayBuffer;
  };

  // Legacy-`maintenanceStates` werden hier verworfen: Das Paketformat kennt nur die
  // kodierte Variante und würde sie erst beim Serialisieren ablehnen — also lange nachdem
  // die Vorschau den Export bereits als möglich gemeldet hat. Der Verlust wird in
  // `buildScopedVropsPayload` als Warnung ausgewiesen.
  const { maintenanceStates: _legacyMaintenanceStates, ...sliced } = chunk;
  return {
    ...sliced,
    objectKeys: indexes.map((index) => chunk.objectKeys[index]),
    metricValues,
    ...(chunk.maintenanceCodes ? { maintenanceCodes: target(chunk.maintenanceCodes, "Maintenance-Codes") } : {}),
    ...(chunk.maintenanceDerived ? { maintenanceDerived: target(chunk.maintenanceDerived, "Maintenance-Derived") } : {}),
  };
}

/** Kompatibilitätsalias für Tests und externe Paketwerkzeuge. */
export const sliceSysvVropsChunk = sliceVropsTimeSeriesChunk;

function cloneVropsSummary(summary: VropsTimeSeriesSummary, importId: string): VropsTimeSeriesSummary {
  return { ...summary, importId, metricStats: { ...summary.metricStats } };
}

/**
 * Beschreibt die im Paket tatsächlich enthaltenen Zeitreihen als Quellangabe.
 *
 * Ohne diese Ersetzung würden die Metadaten der ursprünglichen vROps-CSVs
 * unverändert mitwandern. Der Empfänger sähe in der Uploadliste Dateinamen,
 * Byte- und Zeilenzahlen des vollständigen Quellimports — also Kennzahlen eines
 * Datenbestands, der gar nicht im Paket ist.
 */
export function describeScopedVropsSource(
  packageId: string,
  chunks: readonly VropsTimeSeriesChunk[],
): VropsTimeSeriesSourceFile[] {
  let sizeBytes = 0;
  let dataPointCount = 0;
  const metrics = new Set<string>();
  for (const chunk of chunks) {
    for (const [metric, buffer] of Object.entries(chunk.metricValues)) {
      if (!buffer) continue;
      metrics.add(metric);
      sizeBytes += buffer.byteLength;
    }
    sizeBytes += chunk.maintenanceCodes?.byteLength ?? 0;
    sizeBytes += chunk.maintenanceDerived?.byteLength ?? 0;
    dataPointCount += chunk.objectKeys.length * chunk.slotCount;
  }
  // Spaltennamen statt interner Schlüssel: Nur so erkennen die Ansichten die
  // enthaltenen Metriken wieder (siehe `toVropsTimeSeriesMetricColumns`).
  const detectedColumns = toVropsTimeSeriesMetricColumns(metrics);
  return [{
    objectType: "vm",
    fileName: `sysv-datenpaket_${packageId}_vm-zeitreihen`,
    fileSizeBytes: sizeBytes,
    fileChecksum: packageId,
    rowCount: dataPointCount,
    columnCount: detectedColumns.length,
    detectedColumns,
    status: "accepted",
  }];
}

function buildScopedVropsPayload(
  packageId: string,
  selectedVmKeys: ReadonlySet<string>,
  selectedSnapshotIds: ReadonlySet<string>,
  importMeta: VropsTimeSeriesImport,
  objects: readonly VropsTimeSeriesImportedObject[],
  chunks: readonly VropsTimeSeriesChunk[],
  summaries: readonly VropsTimeSeriesSummary[],
  warnings: SysvDataPackageDiagnostic[],
): SysvDataPackageVropsPayload {
  const legacyMaintenanceChunks = chunks.filter((chunk) => chunk.objectType === "vm" && chunk.maintenanceStates).length;
  if (legacyMaintenanceChunks > 0) {
    warnings.push({
      code: "legacy-vrops-maintenance-states",
      message: "Nicht kodierte vROps-Wartungszustände werden vom Paketformat nicht unterstützt und sind im Paket nicht enthalten.",
      count: legacyMaintenanceChunks,
    });
  }
  const importedObjects = objects.filter((object) => object.objectType === "vm" && object.matchStatus === "matched" && object.rvtoolsObjectKey !== null && selectedVmKeys.has(object.rvtoolsObjectKey));
  const selectedObjectKeys = new Set(importedObjects.map((object) => object.objectKey));
  const newImportId = `sysv-package:${packageId}:vrops`;
  const scopedChunks = chunks
    .filter((chunk) => chunk.objectType === "vm")
    .map((chunk) => sliceVropsTimeSeriesChunk(chunk, selectedObjectKeys))
    .filter((chunk): chunk is VropsTimeSeriesChunk => chunk !== null)
    .map((chunk) => ({ ...chunk, importId: newImportId }));
  // Matched VM-Objekte ohne Zeitreihe bleiben als Zuordnungsdiagnose im Paket;
  // nur die physischen Chunks und Summaries werden auf vorhandene Serien reduziert.
  const scopedObjects = importedObjects.map((object) => ({ ...object, importId: newImportId }));
  const scopedObjectKeys = new Set(scopedObjects.map((object) => object.objectKey));
  const scopedSummaries = summaries
    .filter((summary) => scopedObjectKeys.has(summary.objectKey))
    .map((summary) => cloneVropsSummary(summary, newImportId));
  const expectedSlots = importMeta.expectedSlots;
  const missingValueCount = scopedChunks.reduce((sum, chunk) => sum + metricMissingValueCount(chunk), 0);
  const qualitySummary: VropsTimeSeriesQualitySummary = {
    objectCountByType: { vm: scopedObjects.length, cluster: 0, host: 0 },
    expectedSlots,
    errorCount: 0,
    warningCount: 0,
    missingValueCount,
  };
  const scopedMeta: VropsTimeSeriesImport = {
    ...importMeta,
    id: newImportId,
    rvtoolsSnapshotIds: importMeta.rvtoolsSnapshotIds.filter((snapshotId) => selectedSnapshotIds.has(snapshotId)),
    validationStatus: "relationships-partial",
    qualitySummary,
    files: describeScopedVropsSource(packageId, scopedChunks),
    relationshipIssues: importMeta.relationshipIssues?.filter((issue) => issue.objectKey && scopedObjectKeys.has(issue.objectKey)),
  };
  return { importMeta: scopedMeta, objects: scopedObjects, chunks: scopedChunks, summaries: scopedSummaries };
}

function buildTechInfoPayload(
  packageId: string,
  selectedLatest: readonly TechInfoLatest[],
  sourceRows: readonly TechInfoRow[],
): { techInfo: SysvDataPackagePayload["techInfo"]; error?: SysvDataPackageDiagnostic } {
  const sourceByPointer = new Map(sourceRows.map((row) => [`${row.techInfoImportId}\u0000${row.rowIndex}`, row]));
  const rows: TechInfoRow[] = [];
  const latest: TechInfoLatest[] = [];
  for (const sourceLatest of selectedLatest) {
    const source = sourceByPointer.get(`${sourceLatest.techInfoImportId}\u0000${sourceLatest.rowIndex}`);
    if (!source) {
      return {
        techInfo: { importMeta: {} as TechInfoImportMeta, rows: [], latest: [] },
        error: { code: "missing-tech-info-row", message: `Tech-Info-Rohzeile für „${sourceLatest.vmName}“ fehlt.` },
      };
    }
    const rowIndex = rows.length;
    const row: TechInfoRow = {
      ...source,
      techInfoImportId: `sysv-package:${packageId}:tech-info`,
      rowIndex,
    };
    rows.push(row);
    latest.push({
      ...sourceLatest,
      techInfoImportId: row.techInfoImportId,
      rowIndex,
    });
  }
  const columnCount = new Set(rows.flatMap((row) => Object.keys(row.rawData))).size;
  const importMeta: TechInfoImportMeta = {
    techInfoImportId: `sysv-package:${packageId}:tech-info`,
    importedAt: new Date().toISOString(),
    fileName: `sysv-package:${packageId}`,
    fileChecksum: packageId,
    sheetName: "Tech-Info",
    rowCount: rows.length,
    columnCount,
  };
  return { techInfo: { importMeta, rows, latest } };
}

/**
 * Ordnet die Scope-VM-Namen den RVTools-VMs zu. Ein mehrdeutiger Name wird wie ein
 * fehlender behandelt: Die VM landet in beiden Fällen nicht im Paket, deshalb darf
 * ein einzelner Doppelname nicht den gesamten Export blockieren. Fail-closed bleibt
 * erhalten — im Zweifel wird nichts übernommen, nur eben nicht alles verworfen.
 */
export function matchScopeVmsToRvtools(
  selectedNames: Iterable<string>,
  vmsByNormalizedName: ReadonlyMap<string, readonly NormalizedVm[]>,
): { selectedVms: NormalizedVm[]; warnings: SysvDataPackageDiagnostic[] } {
  const selectedVms: NormalizedVm[] = [];
  const warnings: SysvDataPackageDiagnostic[] = [];
  for (const vmName of selectedNames) {
    const candidates = vmsByNormalizedName.get(vmName) ?? [];
    if (candidates.length === 0) {
      warnings.push({ code: "missing-rvtools-vm", message: `„${vmName}“ wurde in RVTools nicht gefunden.`, vmName });
    } else if (candidates.length > 1) {
      warnings.push({
        code: "ambiguous-vm-name",
        message: `„${vmName}“ ist in RVTools nicht eindeutig (${candidates.length} Treffer) und ist deshalb nicht im Paket enthalten.`,
        vmName,
        candidates: candidates.map((candidate) => ({ vmKey: candidate.vmKey, vmName: candidate.vmName, snapshotId: candidate.snapshotId, vcenterId: candidate.vcenterId })),
      });
    } else {
      selectedVms.push(candidates[0]);
    }
  }
  return { selectedVms, warnings };
}

/**
 * Reduziert Diagnosen auf die Manifestfelder. `candidates` bleibt bewusst lokal:
 * Der Eintrag nennt vmKey, snapshotId und vcenterId auch von vCentern, die gar nicht
 * Teil des Pakets sind, und hat im ausgelieferten Manifest nichts zu suchen.
 */
export function toManifestWarnings(diagnostics: readonly SysvDataPackageDiagnostic[]): SysvDataPackageManifestWarning[] {
  return diagnostics.map(({ code, message, count }) => count === undefined ? { code, message } : { code, message, count });
}

function estimatePayloadBytes(payload: SysvDataPackagePayload): number {
  let bytes = new TextEncoder().encode(JSON.stringify({
    snapshots: payload.snapshots,
    vms: payload.vms,
    hosts: payload.hosts,
    clusters: payload.clusters,
    datastores: payload.datastores,
    snapshotsEntities: payload.snapshotsEntities,
    techInfo: payload.techInfo,
    rawSheets: payload.rawSheets.map((sheet) => ({ ...sheet, values: null as null })),
    vrops: payload.vrops ? { ...payload.vrops, chunks: payload.vrops.chunks.map((chunk) => ({ ...chunk, metricValues: null as null })) } : null,
  })).byteLength;
  for (const sheet of payload.rawSheets) bytes += new TextEncoder().encode(JSON.stringify({ headers: sheet.headers, values: sheet.values })).byteLength;
  for (const chunk of payload.vrops?.chunks ?? []) for (const buffer of Object.values(chunk.metricValues)) bytes += buffer?.byteLength ?? 0;
  for (const chunk of payload.vrops?.chunks ?? []) bytes += (chunk.maintenanceCodes?.byteLength ?? 0) + (chunk.maintenanceDerived?.byteLength ?? 0);
  return bytes;
}

function previewFrom(
  packageId: string,
  scope: SysvDataPackageScope,
  selectedNames: Set<string>,
  vms: NormalizedVm[],
  hosts: NormalizedHost[],
  clusters: NormalizedCluster[],
  datastores: NormalizedDatastore[],
  vrops: SysvDataPackageVropsPayload | undefined,
  vropsImport: VropsTimeSeriesImport | null,
  warnings: SysvDataPackageDiagnostic[],
  errors: SysvDataPackageDiagnostic[],
  payload: SysvDataPackagePayload | null,
): SysvDataPackagePreview {
  const vropsVmObjects = vrops?.objects ?? [];
  const vropsSeriesKeys = new Set(vrops?.chunks.flatMap((chunk) => chunk.objectKeys) ?? []);
  const vmNameByKey = new Map(vms.map((vm) => [vm.vmKey, normalizeVmNameForMatch(vm.vmName)]));
  const vropsNames = new Set(vropsVmObjects.flatMap((object) => object.rvtoolsObjectKey && vropsSeriesKeys.has(object.objectKey)
    ? [vmNameByKey.get(object.rvtoolsObjectKey) ?? ""]
    : []));
  const uncompressed = payload ? estimatePayloadBytes(payload) : 0;
  return {
    packageId,
    scope,
    selectedTechInfoVmNames: sortedStrings(selectedNames),
    vms,
    vcenters: sortedStrings(vms.map((vm) => vm.vcenterId)),
    hosts,
    clusters,
    datastores,
    vropsVmObjects,
    vropsVmNamesWithSeries: sortedStrings(vropsNames),
    vropsVmNamesWithoutSeries: sortedStrings(vms.filter((vm) => !vropsNames.has(normalizeVmNameForMatch(vm.vmName))).map((vm) => vm.vmName)),
    vropsImport,
    warnings,
    errors,
    estimatedUncompressedBytes: uncompressed,
    estimatedCompressedBytes: uncompressed ? Math.max(1, Math.round(uncompressed * 0.6)) : 0,
    canExport: errors.length === 0 && vms.length > 0,
  };
}

export async function loadSysvDataPackageSource(
  options: Pick<BuildSysvDataPackageOptions, "includeVropsTimeSeries" | "onProgress"> = {},
): Promise<SysvDataPackageSource> {
  report(options, "Scope auflösen", 2, "Gemeinsame Datenbasis laden");
  const [snapshots, techInfoLatest, techInfoRows, vropsImports] = await Promise.all([
    getSnapshots(),
    getAllTechInfoLatest(),
    getAllTechInfoRows(),
    options.includeVropsTimeSeries !== false ? getVropsTimeSeriesImports() : Promise.resolve([] as VropsTimeSeriesImport[]),
  ]);
  const allSnapshotIds = snapshots.map((snapshot) => snapshot.snapshotId);
  const [allVms, hosts, clusters, datastores, snapshotEntities, rawData] = await Promise.all([
    getBySnapshotIds<NormalizedVm>("entities_vm", allSnapshotIds),
    getBySnapshotIds<NormalizedHost>("entities_host", allSnapshotIds),
    getBySnapshotIds<NormalizedCluster>("entities_cluster", allSnapshotIds),
    getBySnapshotIds<NormalizedDatastore>("entities_datastore", allSnapshotIds),
    getBySnapshotIds<NormalizedSnapshot>("entities_snapshot", allSnapshotIds),
    loadSnapshotRawData(snapshots, options),
  ]);
  const vropsImport = vropsImports[0] ?? null;
  let vrops: SysvDataPackageSource["vrops"] = null;
  if (vropsImport) {
    report(options, "vROps-Zeitreihen beschneiden", 36, "vROps-Datenbasis laden");
    const [objects, chunks, summaries] = await Promise.all([
      getVropsTimeSeriesObjects(vropsImport.id),
      getVropsTimeSeriesChunks(vropsImport.id),
      getVropsTimeSeriesSummaries(vropsImport.id),
    ]);
    vrops = { importMeta: vropsImport, objects, chunks, summaries };
  }
  // Beide Indizes werden einmal je Lauf aufgebaut; ein Neuaufbau pro Scope wäre im
  // Batch-Export linear in der Zahl der Blattpakete.
  const vmsByNormalizedName = new Map<string, NormalizedVm[]>();
  const vmNamesBySnapshot = new Map<string, Set<string>>();
  for (const vm of allVms) {
    const key = normalizeVmNameForMatch(vm.vmName);
    const bucket = vmsByNormalizedName.get(key);
    if (bucket) bucket.push(vm);
    else vmsByNormalizedName.set(key, [vm]);
    if (key) {
      const names = vmNamesBySnapshot.get(vm.snapshotId);
      if (names) names.add(key);
      else vmNamesBySnapshot.set(vm.snapshotId, new Set([key]));
    }
  }
  const techInfoRowsByPointer = new Map(techInfoRows.map((row) => [techInfoPointerKey(row), row] as const));
  report(options, "Scope auflösen", 42, `${allVms.length.toLocaleString("de-DE")} RVTools-VMs verfügbar`);
  return {
    snapshots,
    techInfoLatest,
    techInfoRows,
    techInfoRowsByPointer,
    allVms,
    vmsByNormalizedName,
    vmNamesBySnapshot,
    hosts,
    clusters,
    datastores,
    snapshotEntities,
    rawData,
    vrops,
  };
}

export function resolveSysvDataPackageFromSource(
  source: SysvDataPackageSource,
  scope: SysvDataPackageScope,
  options: BuildSysvDataPackageOptions = {},
): ResolvedSysvDataPackage {
  const packageId = options.packageId ?? `sysv-${shortId()}`;
  report(options, "Scope auflösen", 5, scope.displayName);
  const selectedNames = resolveSysvDataPackageVmNames(source.techInfoLatest, scope);
  const errors: SysvDataPackageDiagnostic[] = [];
  const { selectedVms, warnings } = matchScopeVmsToRvtools(selectedNames, source.vmsByNormalizedName);
  if (selectedVms.length === 0) errors.push({ code: "no-rvtools-vm", message: "Keine VM des gewählten SysV-Scopes konnte eindeutig RVTools zugeordnet werden." });
  const selectedSnapshotIds = new Set(selectedVms.map((vm) => vm.snapshotId));
  report(options, "RVTools-Daten filtern", 18, `${selectedVms.length.toLocaleString("de-DE")} eindeutig zugeordnete VMs`);
  const rawSheets: SysvDataPackageRawSheet[] = [];
  const hostRefs = new Set<string>();
  const datastoreRefs = new Set<string>();
  const scopedSnapshots: SnapshotMeta[] = [];
  const selectedVmsBySnapshot = new Map<string, NormalizedVm[]>();
  for (const vm of selectedVms) {
    const bucket = selectedVmsBySnapshot.get(vm.snapshotId);
    if (bucket) bucket.push(vm);
    else selectedVmsBySnapshot.set(vm.snapshotId, [vm]);
  }
  for (const snapshotRaw of source.rawData) {
    const snapshotVms = selectedVmsBySnapshot.get(snapshotRaw.snapshot.snapshotId);
    if (!snapshotVms) continue;
    const scoped = buildSnapshotScopedRawPayload(snapshotRaw, snapshotVms, source.vmNamesBySnapshot, warnings);
    rawSheets.push(...scoped.rawSheets);
    const { restrictedDatasetSources: _previousSources, ...snapshotWithoutPreviousSources } = scoped.snapshot;
    scopedSnapshots.push({
      ...snapshotWithoutPreviousSources,
      restrictedDataset: {
        kind: "sysv-package",
        packageId,
        packageVersion: 1,
        scopeKind: scope.kind,
        scopeLabel: scope.displayName,
        dataPolicy: "strict-vm-scope-v1",
        sharedCapacityContext: true,
      },
    });
    for (const host of scoped.hostNames) hostRefs.add(snapshotScopedKey(snapshotRaw.snapshot.snapshotId, host));
    for (const datastore of scoped.datastoreNames) datastoreRefs.add(snapshotScopedKey(snapshotRaw.snapshot.snapshotId, datastore));
  }
  // Die normalisierten Hostdaten müssen auch dann als gemeinsamer Kontext
  // erhalten bleiben, wenn ein historischer Raw-Blob das Hostfeld nicht führt.
  for (const vm of selectedVms) {
    if (vm.host) hostRefs.add(snapshotScopedKey(vm.snapshotId, vm.host));
  }
  // Die Referenzschlüssel werden einmal aufgebaut; ein `some()` je Entität wäre
  // quadratisch in der Zahl der ausgewählten VMs.
  const selectedClusterRefs = new Set(selectedVms.map((vm) => `${vm.snapshotId}\u0000${clusterScopeKey(vm.vcenterId, vm.datacenter, vm.cluster)}`));
  const selectedVmRefs = new Set(selectedVms.map((vm) => snapshotScopedKey(vm.snapshotId, vm.vmName)));
  const hosts = source.hosts.filter((host) => hostRefs.has(snapshotScopedKey(host.snapshotId, host.host)));
  const clusters = source.clusters.filter((cluster) => selectedClusterRefs.has(`${cluster.snapshotId}\u0000${cluster.clusterKey}`));
  const datastores = source.datastores.filter((datastore) => datastoreRefs.has(snapshotScopedKey(datastore.snapshotId, datastore.name)));
  const vms = selectedVms.map(({ sysvPackageScopes: _previousScopes, ...vm }) => vm);
  const snapshotEntities = source.snapshotEntities.filter((row) => selectedVmRefs.has(snapshotScopedKey(row.snapshotId, row.vmName)));
  // Cluster- und Hostverweise werden oben über die finalen VM-Objekte ermittelt. Die
  // Rohdatenrefs dienen ausschließlich dem fail-closed Datastore-/Host-Sheet-Filter.

  report(options, "Tech-Info filtern", 56, `${selectedNames.size.toLocaleString("de-DE")} Scope-Namen`);
  const finalNameSet = new Set(vms.map((vm) => normalizeVmNameForMatch(vm.vmName)));
  const selectedLatest = source.techInfoLatest.filter((row) => finalNameSet.has(normalizeVmNameForMatch(row.vmName)));
  const selectedLatestPointers = selectedLatest
    .map((latest) => source.techInfoRowsByPointer.get(techInfoPointerKey(latest)))
    .filter((row): row is TechInfoRow => Boolean(row));
  const techInfoResult = buildTechInfoPayload(packageId, selectedLatest, selectedLatestPointers);
  if (techInfoResult.error) errors.push(techInfoResult.error);
  const techInfo = techInfoResult.techInfo;

  let vrops: SysvDataPackageVropsPayload | undefined;
  let vropsImport: VropsTimeSeriesImport | null = null;
  if (options.includeVropsTimeSeries !== false && source.vrops) {
    vropsImport = source.vrops.importMeta;
    report(options, "vROps-Zeitreihen beschneiden", 68, new Date(vropsImport.rangeStartUtc).toLocaleDateString("de-DE"));
    try {
      vrops = buildScopedVropsPayload(packageId, new Set(vms.map((vm) => vm.vmKey)), selectedSnapshotIds, vropsImport, source.vrops.objects, source.vrops.chunks, source.vrops.summaries, warnings);
    } catch (error) {
      errors.push({ code: "invalid-vrops-chunk", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const payload: SysvDataPackagePayload | null = errors.length === 0
    ? {
        snapshots: scopedSnapshots,
        rawSheets,
        vms,
        hosts,
        clusters,
        datastores,
        snapshotsEntities: snapshotEntities,
        health: [],
        techInfo,
        ...(vrops ? { vrops } : {}),
      }
    : null;
  const preview = previewFrom(packageId, scope, selectedNames, vms, hosts, clusters, datastores, vrops, vropsImport, warnings, errors, payload);
  return { payload, preview };
}

async function resolveSysvDataPackage(
  scope: SysvDataPackageScope,
  options: BuildSysvDataPackageOptions = {},
): Promise<ResolvedSysvDataPackage> {
  const source = await loadSysvDataPackageSource(options);
  return resolveSysvDataPackageFromSource(source, scope, options);
}

export async function buildSysvDataPackagePreview(
  scope: SysvDataPackageScope,
  options: Omit<BuildSysvDataPackageOptions, "packageId"> = {},
): Promise<SysvDataPackagePreview> {
  return (await resolveSysvDataPackage(scope, options)).preview;
}

export async function buildSysvDataPackage(
  scope: SysvDataPackageScope,
  options: BuildSysvDataPackageOptions = {},
): Promise<BuiltSysvDataPackage> {
  const resolved = await resolveSysvDataPackage(scope, options);
  if (!resolved.payload || !resolved.preview.canExport) {
    throw new Error(resolved.preview.errors.map((error) => error.message).join(" ") || "Der SysV-Datensatz kann nicht erzeugt werden.");
  }
  report(options, "Prüfsummen berechnen", 82);
  const serialized = await serializeSysvDataPackage(resolved.payload, {
    packageId: resolved.preview.packageId,
    createdAt: options.createdAt ?? new Date().toISOString(),
    scope,
    warnings: toManifestWarnings(resolved.preview.warnings),
    appVersion: options.appVersion,
  });
  report(options, "ZIP komprimieren", 94);
  return { payload: resolved.payload, manifest: serialized.manifest, files: serialized.files, preview: resolved.preview };
}

/** Dateisystem- und ZIP-Pfad-taugliche Kurzform eines Scope-Labels. */
export function sysvScopeSlug(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "scope";
}

export function buildSysvDataPackageFileName(scope: SysvDataPackageScope, date = new Date()): string {
  return `rvtools-sysv_${scope.kind}_${sysvScopeSlug(scope.displayName)}_${date.toISOString().slice(0, 10)}.zip`;
}

/** Re-exportiert die Scope-Hilfe für Komponenten, die nur die Service-Datei kennen. */
export { buildSysvDataPackageScopeDirectory };
