import { unzipSync, zip } from "fflate";
import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHealth,
  NormalizedHost,
  NormalizedSnapshot,
  NormalizedVm,
  RawSheetBlob,
  SheetStats,
  SnapshotMeta,
  SysvDataPackageManifestV1,
  SysvDataPackageScope,
  TechInfoImportMeta,
  TechInfoLatest,
  TechInfoRow,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { parseModeFile } from "@/lib/appMode";
import { gzipJson } from "@/lib/compression";
import { computeChecksum, normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";

export const SYSV_DATA_PACKAGE_KIND = "rvtools-analyzer-sysv-data-package" as const;
export const SYSV_DATA_PACKAGE_VERSION = 1 as const;
export const MAX_SYSV_PACKAGE_COMPRESSED_BYTES = 1_000_000_000;
export const MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES = 4_000_000_000;
export const MAX_SYSV_PACKAGE_ENTRIES = 20_000;

const CORE_PACKAGE_PATHS = [
  "modus.json",
  "data/snapshots.json",
  "data/entities/vms.json",
  "data/entities/hosts.json",
  "data/entities/clusters.json",
  "data/entities/datastores.json",
  "data/entities/snapshots.json",
  "data/raw-sheets/index.json",
  "data/tech-info/import.json",
  "data/tech-info/rows.json",
  "data/tech-info/latest.json",
] as const;

const VROPS_PACKAGE_PATHS = [
  "data/vrops/import.json",
  "data/vrops/objects.json",
  "data/vrops/summaries.json",
  "data/vrops/chunks/index.json",
] as const;

const RAW_SHEET_FILE_PATTERN = /^data\/raw-sheets\/[^/]+\/[^/]+\.json$/;
const VROPS_CHUNK_FILE_PATTERN = /^data\/vrops\/chunks\/[^/]+\/[^/]+\.(?:f32|u8)$/;

export interface SysvDataPackageRawSheet {
  snapshotId: string;
  sheetName: string;
  headers: string[];
  values: Array<Array<string | number | boolean | null>>;
  sheetStats?: SheetStats;
}

export interface SysvDataPackageTechInfoPayload {
  importMeta: TechInfoImportMeta;
  rows: TechInfoRow[];
  latest: TechInfoLatest[];
}

export interface SysvDataPackageVropsPayload {
  importMeta: VropsTimeSeriesImport;
  objects: VropsTimeSeriesImportedObject[];
  chunks: VropsTimeSeriesChunk[];
  summaries: VropsTimeSeriesSummary[];
}

/** JSON-/Builder-Nutzlast vor dem Aufbau der IndexedDB-RawSheetBlobs. */
export interface SysvDataPackagePayload {
  snapshots: SnapshotMeta[];
  rawSheets: SysvDataPackageRawSheet[];
  vms: NormalizedVm[];
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  snapshotsEntities: Array<NormalizedSnapshot & { id?: number }>;
  health: Array<NormalizedHealth & { id?: number }>;
  techInfo: SysvDataPackageTechInfoPayload;
  vrops?: SysvDataPackageVropsPayload;
}

/** Vollständig validierte Import-Nutzlast, bereit für eine einzige IDB-Transaktion. */
export interface ValidatedSysvDataPackagePayload {
  manifest: SysvDataPackageManifestV1;
  payload: SysvDataPackagePayload;
  rawSheetBlobs: RawSheetBlob[];
}

export interface SysvDataPackageArchive {
  manifest: SysvDataPackageManifestV1;
  files: Record<string, Uint8Array<ArrayBuffer>>;
  zipBytes: Uint8Array<ArrayBuffer>;
}

export interface SysvDataPackageBuildMetadata {
  packageId: string;
  createdAt: string;
  scope: SysvDataPackageScope;
  warnings?: SysvDataPackageManifestV1["warnings"];
  appVersion?: string;
}

interface RawSheetIndexEntry {
  snapshotId: string;
  sheetName: string;
  path: string;
}

interface VropsChunkIndexEntry {
  chunkId: string;
  importId: string;
  objectType: "vm";
  chunkKey: string;
  clusterKey: string | null;
  startUtc: number;
  slotCount: number;
  objectKeys: string[];
  metricPaths: Record<string, string>;
  maintenanceCodesPath?: string;
  maintenanceDerivedPath?: string;
  maintenanceLexicon?: string[];
}

function bytesFrom(value: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
  return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function jsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>;
}

function parseJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function safePathSegment(value: string): string {
  const normalized = value.replace(/\\/g, "/").split("/").pop() ?? value;
  const sanitized = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "item";
}

function addFile(files: Record<string, Uint8Array<ArrayBuffer>>, path: string, value: unknown): void {
  if (files[path]) throw new Error(`Paketdatei doppelt erzeugt: ${path}`);
  files[path] = value instanceof Uint8Array ? bytesFrom(value) : jsonBytes(value);
}

function countPayload(payload: SysvDataPackagePayload): SysvDataPackageManifestV1["counts"] {
  return {
    vcenters: new Set(payload.snapshots.map((snapshot) => snapshot.vcenterId)).size,
    snapshots: payload.snapshots.length,
    vms: payload.vms.length,
    techInfoRows: payload.techInfo.rows.length,
    sharedHosts: payload.hosts.length,
    sharedClusters: payload.clusters.length,
    referencedDatastores: payload.datastores.length,
    vropsVmObjects: payload.vrops?.objects.length ?? 0,
    vropsChunks: payload.vrops?.chunks.length ?? 0,
  };
}

function addRawSheetFiles(files: Record<string, Uint8Array<ArrayBuffer>>, rawSheets: readonly SysvDataPackageRawSheet[]): RawSheetIndexEntry[] {
  const index: RawSheetIndexEntry[] = [];
  for (const rawSheet of rawSheets) {
    if (rawSheet.values.length === 0) continue;
    const path = `data/raw-sheets/${safePathSegment(rawSheet.snapshotId)}/${safePathSegment(rawSheet.sheetName)}.json`;
    addFile(files, path, { headers: rawSheet.headers, values: rawSheet.values });
    index.push({ snapshotId: rawSheet.snapshotId, sheetName: rawSheet.sheetName, path });
  }
  return index.sort((left, right) => left.path.localeCompare(right.path));
}

function addVropsFiles(files: Record<string, Uint8Array<ArrayBuffer>>, vrops: SysvDataPackageVropsPayload): VropsChunkIndexEntry[] {
  const index: VropsChunkIndexEntry[] = [];
  vrops.chunks.forEach((chunk, chunkIndex) => {
    if (chunk.objectType !== "vm") throw new Error("SysV-Pakete dürfen nur vROps-VM-Chunks enthalten.");
    if (chunk.maintenanceStates) throw new Error("Legacy-vROps-Maintenance-States werden in SysV-Paketen nicht unterstützt.");
    const chunkId = `${chunkIndex}-${safePathSegment(chunk.objectType)}-${safePathSegment(chunk.chunkKey)}`;
    const metricPaths: Record<string, string> = {};
    for (const [metric, buffer] of Object.entries(chunk.metricValues)) {
      if (!buffer) continue;
      const path = `data/vrops/chunks/${chunkId}/${safePathSegment(metric)}.f32`;
      addFile(files, path, new Uint8Array(buffer));
      metricPaths[metric] = path;
    }
    const entry: VropsChunkIndexEntry = {
      chunkId,
      importId: chunk.importId,
      objectType: "vm",
      chunkKey: chunk.chunkKey,
      clusterKey: chunk.clusterKey,
      startUtc: chunk.startUtc,
      slotCount: chunk.slotCount,
      objectKeys: [...chunk.objectKeys],
      metricPaths,
    };
    if (chunk.maintenanceCodes) {
      const path = `data/vrops/chunks/${chunkId}/maintenance-codes.u8`;
      addFile(files, path, new Uint8Array(chunk.maintenanceCodes));
      entry.maintenanceCodesPath = path;
      entry.maintenanceLexicon = [...(chunk.maintenanceLexicon ?? [])];
    }
    if (chunk.maintenanceDerived) {
      const path = `data/vrops/chunks/${chunkId}/maintenance-derived.u8`;
      addFile(files, path, new Uint8Array(chunk.maintenanceDerived));
      entry.maintenanceDerivedPath = path;
    }
    index.push(entry);
  });
  return index;
}

/** Baut alle Paketdateien und das Manifest; `manifest.json` wird zuletzt ergänzt. */
export async function serializeSysvDataPackage(
  payload: SysvDataPackagePayload,
  metadata: SysvDataPackageBuildMetadata,
): Promise<{ manifest: SysvDataPackageManifestV1; files: Record<string, Uint8Array<ArrayBuffer>> }> {
  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  addFile(files, "modus.json", {
    kind: "rvtools-analyzer-mode",
    version: 1,
    mode: "sysv",
  });
  addFile(files, "data/snapshots.json", payload.snapshots);
  addFile(files, "data/entities/vms.json", payload.vms);
  addFile(files, "data/entities/hosts.json", payload.hosts);
  addFile(files, "data/entities/clusters.json", payload.clusters);
  addFile(files, "data/entities/datastores.json", payload.datastores);
  addFile(files, "data/entities/snapshots.json", payload.snapshotsEntities);
  const rawIndex = addRawSheetFiles(files, payload.rawSheets);
  addFile(files, "data/raw-sheets/index.json", rawIndex);
  addFile(files, "data/tech-info/import.json", payload.techInfo.importMeta);
  addFile(files, "data/tech-info/rows.json", payload.techInfo.rows);
  addFile(files, "data/tech-info/latest.json", payload.techInfo.latest);

  let vropsChunkIndex: VropsChunkIndexEntry[] = [];
  if (payload.vrops) {
    addFile(files, "data/vrops/import.json", payload.vrops.importMeta);
    addFile(files, "data/vrops/objects.json", payload.vrops.objects);
    addFile(files, "data/vrops/summaries.json", payload.vrops.summaries);
    vropsChunkIndex = addVropsFiles(files, payload.vrops);
    addFile(files, "data/vrops/chunks/index.json", vropsChunkIndex);
  }

  const manifestWithoutFiles: Omit<SysvDataPackageManifestV1, "files"> = {
    kind: SYSV_DATA_PACKAGE_KIND,
    version: SYSV_DATA_PACKAGE_VERSION,
    packageId: metadata.packageId,
    createdAt: metadata.createdAt,
    appVersion: metadata.appVersion ?? "0.0.0",
    dataPolicy: "strict-vm-scope-v1",
    scope: { ...metadata.scope, roleMatch: "sysv-or-deputy" },
    capabilities: {
      vmInventory: true,
      techInfo: true,
      vmRawSheets: true,
      vmVropsTimeSeries: Boolean(payload.vrops),
      cpuRightsizing: true,
      ramRightsizing: true,
      fullClusterAnalysis: false,
      fillUpPlanning: false,
    },
    counts: countPayload(payload),
    warnings: metadata.warnings ?? [],
  };
  const fileEntries = await Promise.all(Object.entries(files).map(async ([path, bytes]) => ({
    path,
    sizeBytes: bytes.byteLength,
    sha256: await computeChecksum(exactArrayBuffer(bytes)),
  })));
  const manifest: SysvDataPackageManifestV1 = {
    ...manifestWithoutFiles,
    files: fileEntries.sort((left, right) => left.path.localeCompare(right.path)),
  };
  addFile(files, "manifest.json", manifest);
  return { manifest, files };
}

export function zipSysvDataPackage(
  files: Record<string, Uint8Array<ArrayBuffer>>,
  onProgress?: (percent: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    onProgress?.(0);
    zip(files, { level: 6 }, (error, bytes) => {
      if (error) {
        reject(error);
        return;
      }
      onProgress?.(100);
      resolve(bytes);
    });
  });
}

export function isSysvDataPackageManifest(value: unknown): value is SysvDataPackageManifestV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<SysvDataPackageManifestV1>;
  return manifest.kind === SYSV_DATA_PACKAGE_KIND && manifest.version === SYSV_DATA_PACKAGE_VERSION;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

interface ZipCentralDirectoryEntry {
  name: string;
  /** Unkomprimierte Größe laut Zentraldirectory, ohne das Archiv zu entpacken. */
  uncompressedSize: number;
}

/**
 * Liest die ZIP-Zentraldirectory, bevor fflate Duplikate in ein Objekt abbildet.
 * Liefert zusätzlich die deklarierten Zielgrößen, damit das Entpack-Limit greifen
 * kann, *bevor* `unzipSync` den gesamten Inhalt in den Speicher schreibt.
 */
function readZipCentralDirectory(bytes: Uint8Array): ZipCentralDirectoryEntry[] {
  const minimumEocdOffset = Math.max(0, bytes.byteLength - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (offset >= 0 && readU32(bytes, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP-Ende nicht gefunden.");
  const commentLength = readU16(bytes, eocdOffset + 20);
  if (eocdOffset + 22 + commentLength > bytes.byteLength) throw new Error("ZIP-Ende ist abgeschnitten.");
  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralSize = readU32(bytes, eocdOffset + 12);
  const centralOffset = readU32(bytes, eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64-Archive werden für SysV-Pakete nicht unterstützt.");
  }
  const centralEnd = centralOffset + centralSize;
  if (centralOffset < 0 || centralEnd > bytes.byteLength || centralEnd > eocdOffset) throw new Error("ZIP-Zentraldirectory ist ungültig.");
  const entries: ZipCentralDirectoryEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || readU32(bytes, cursor) !== 0x02014b50) throw new Error("ZIP-Zentraldirectory enthält einen ungültigen Eintrag.");
    const uncompressedSize = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const fileCommentLength = readU16(bytes, cursor + 32);
    const nameStart = cursor + 46;
    const next = nameStart + nameLength + extraLength + fileCommentLength;
    if (next > centralEnd) throw new Error("ZIP-Zentraldirectory ist abgeschnitten.");
    // 0xffffffff verweist auf ein ZIP64-Extra-Feld, das wir bewusst nicht auswerten:
    // ohne die echte Zielgröße wäre das Entpack-Limit nicht durchsetzbar.
    if (uncompressedSize === 0xffffffff) throw new Error("ZIP64-Archive werden für SysV-Pakete nicht unterstützt.");
    entries.push({
      name: new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength)),
      uncompressedSize,
    });
    cursor = next;
  }
  if (cursor !== centralEnd) throw new Error("ZIP-Zentraldirectory enthält unerwartete Bytes.");
  return entries;
}

/** Liest nur die Root-Datei zur frühen Paket-Erkennung vor dem generischen ZIP-Expand. */
export async function inspectSysvDataPackageFile(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_SYSV_PACKAGE_COMPRESSED_BYTES) return false;
  try {
    const entries = readZipCentralDirectory(bytes);
    const manifestEntry = entries.filter((entry) => entry.name === "manifest.json");
    if (manifestEntry.length !== 1 || manifestEntry[0].uncompressedSize > MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES) return false;
    // Nur das Manifest entpacken: Die vollständige Validierung liest das Archiv
    // ohnehin erneut, ein zweiter kompletter Entpackvorgang wäre reine Verschwendung.
    const manifest = unzipSync(bytes, { filter: (entry) => entry.name === "manifest.json" })["manifest.json"];
    if (!manifest) return false;
    return isSysvDataPackageManifest(parseJson(manifest));
  } catch {
    return false;
  }
}

function assertSafeZipPath(path: string): void {
  if (!path || path.includes("\\") || path.startsWith("/") || path.includes(":")) {
    throw new Error(`Ungültiger Paketpfad: ${path}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment === "")) {
    throw new Error(`Ungültiger Paketpfad: ${path}`);
  }
}

function assertKnownPackagePath(path: string): void {
  if ((CORE_PACKAGE_PATHS as readonly string[]).includes(path)) return;
  if ((VROPS_PACKAGE_PATHS as readonly string[]).includes(path)) return;
  if (RAW_SHEET_FILE_PATTERN.test(path) || VROPS_CHUNK_FILE_PATTERN.test(path)) return;
  throw new Error(`Unerwarteter Pfad im SysV-Paket: ${path}`);
}

function assertRawSheetFilePath(path: string): void {
  if (!RAW_SHEET_FILE_PATTERN.test(path)) throw new Error(`Ungültiger Raw-Sheet-Pfad: ${path}`);
}

function assertVropsChunkFilePath(path: string, extension: "f32" | "u8"): void {
  if (!VROPS_CHUNK_FILE_PATTERN.test(path) || !path.endsWith(`.${extension}`)) {
    throw new Error(`Ungültiger vROps-Chunk-Pfad: ${path}`);
  }
}

function assertManifestShape(value: unknown): asserts value is SysvDataPackageManifestV1 {
  if (!isSysvDataPackageManifest(value)) {
    throw new Error("Das Archiv ist kein unterstütztes SysV-Datenpaket Version 1.");
  }
  const manifest = value;
  if (!manifest.packageId || !manifest.createdAt || !manifest.appVersion || !manifest.dataPolicy || !manifest.scope || !manifest.counts || !manifest.capabilities || !Array.isArray(manifest.warnings) || !Array.isArray(manifest.files)) {
    throw new Error("Das SysV-Paketmanifest ist unvollständig.");
  }
  if (manifest.dataPolicy !== "strict-vm-scope-v1" || manifest.scope.roleMatch !== "sysv-or-deputy") {
    throw new Error("Das SysV-Paket verwendet eine nicht unterstützte Datenrichtlinie.");
  }
  const scopeHasValidShape = manifest.scope.kind === "area"
    ? typeof manifest.scope.displayName === "string" && typeof manifest.scope.normalizedOrganisation === "string" && typeof manifest.scope.normalizedArea === "string" && manifest.scope.normalizedArea.length > 0
    : manifest.scope.kind === "department"
      ? typeof manifest.scope.displayName === "string" && typeof manifest.scope.normalizedPath === "string" && manifest.scope.normalizedPath.length > 0
      : manifest.scope.kind === "person"
        ? typeof manifest.scope.displayName === "string" && typeof manifest.scope.normalizedName === "string" && manifest.scope.normalizedName.length > 0
        : false;
  if (!scopeHasValidShape || !manifest.scope.displayName.trim()) throw new Error("Der SysV-Scope im Manifest ist ungültig.");
  if (manifest.capabilities.vmInventory !== true || manifest.capabilities.techInfo !== true || manifest.capabilities.vmRawSheets !== true || typeof manifest.capabilities.vmVropsTimeSeries !== "boolean" || typeof manifest.capabilities.cpuRightsizing !== "boolean" || typeof manifest.capabilities.ramRightsizing !== "boolean" || manifest.capabilities.fullClusterAnalysis !== false || manifest.capabilities.fillUpPlanning !== false) {
    throw new Error("Das Paket darf keine vollständige Clusteranalyse oder Fill-Up-Planung versprechen.");
  }
  for (const key of ["vcenters", "snapshots", "vms", "techInfoRows", "sharedHosts", "sharedClusters", "referencedDatastores", "vropsVmObjects", "vropsChunks"] as const) {
    if (!Number.isSafeInteger(manifest.counts[key]) || manifest.counts[key] < 0) throw new Error(`Ungültiger Manifestcount: ${key}.`);
  }
  const paths = new Set<string>();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || entry.path === "manifest.json") throw new Error("Ungültiger Dateieintrag im Paketmanifest.");
    assertSafeZipPath(entry.path);
    assertKnownPackagePath(entry.path);
    if (paths.has(entry.path)) throw new Error(`Datei mehrfach im Paketmanifest: ${entry.path}`);
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Ungültige Prüfsumme oder Bytezahl für ${entry.path}.`);
    }
    paths.add(entry.path);
  }
  for (const path of CORE_PACKAGE_PATHS) if (!paths.has(path)) throw new Error(`Erforderliche Paketdatei fehlt im Manifest: ${path}`);
  const hasVropsFiles = [...paths].some((path) => path.startsWith("data/vrops/"));
  if (hasVropsFiles) for (const path of VROPS_PACKAGE_PATHS) if (!paths.has(path)) throw new Error(`Erforderliche vROps-Paketdatei fehlt im Manifest: ${path}`);
  if (manifest.capabilities.vmVropsTimeSeries !== hasVropsFiles) throw new Error("vROps-Capability und Paketdateien stimmen nicht überein.");
}

function ensureArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} muss ein Array sein.`);
  return value as T[];
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} muss ein Objekt sein.`);
  return value as Record<string, unknown>;
}

function bytesForPath(entries: Record<string, Uint8Array>, path: string): Uint8Array {
  const bytes = entries[path];
  if (!bytes) throw new Error(`Erforderliche Paketdatei fehlt: ${path}`);
  return bytes;
}

function validateEntityReferences(payload: SysvDataPackagePayload, manifest: SysvDataPackageManifestV1): void {
  const snapshotIds = new Set(payload.snapshots.map((snapshot) => snapshot.snapshotId));
  const vmKeys = new Set(payload.vms.map((vm) => vm.vmKey));
  if (payload.snapshots.length === 0 || payload.vms.length === 0) throw new Error("Ein SysV-Paket muss mindestens einen Snapshot und eine VM enthalten.");
  if (snapshotIds.size !== payload.snapshots.length) throw new Error("Snapshots sind im SysV-Paket nicht eindeutig.");
  if (vmKeys.size !== payload.vms.length) throw new Error("VM-Schlüssel sind im SysV-Paket nicht eindeutig.");
  if (payload.snapshots.some((snapshot) => snapshot.restrictedDataset?.kind !== "sysv-package")) {
    throw new Error("Jeder Snapshot eines SysV-Pakets muss als eingeschränkter Datensatz markiert sein.");
  }
  for (const snapshot of payload.snapshots) {
    const restricted = snapshot.restrictedDataset!;
    if (restricted.packageVersion !== 1 || restricted.packageId !== manifest.packageId || restricted.scopeKind !== manifest.scope.kind || restricted.scopeLabel !== manifest.scope.displayName || restricted.dataPolicy !== manifest.dataPolicy || restricted.sharedCapacityContext !== true) {
      throw new Error(`Restricted-Dataset-Metadaten des Snapshots ${snapshot.snapshotId} sind inkonsistent.`);
    }
  }
  for (const vm of payload.vms) if (!snapshotIds.has(vm.snapshotId)) throw new Error(`VM verweist auf unbekannten Snapshot: ${vm.vmKey}`);
  for (const entity of [...payload.hosts, ...payload.clusters, ...payload.datastores]) if (!snapshotIds.has(entity.snapshotId)) throw new Error("Infrastrukturentität verweist auf unbekannten Snapshot.");
  const selectedVmNamesBySnapshot = new Map<string, Set<string>>();
  for (const vm of payload.vms) {
    const names = selectedVmNamesBySnapshot.get(vm.snapshotId) ?? new Set<string>();
    names.add(normalizeVmNameForMatch(vm.vmName));
    selectedVmNamesBySnapshot.set(vm.snapshotId, names);
  }
  for (const row of payload.snapshotsEntities) {
    if (!snapshotIds.has(row.snapshotId)) throw new Error("VM-Snapshot verweist auf unbekannten Snapshot.");
    if (!selectedVmNamesBySnapshot.get(row.snapshotId)?.has(normalizeVmNameForMatch(row.vmName))) throw new Error("VM-Snapshot verweist auf eine nicht enthaltene VM.");
  }
  for (const row of payload.health) if (!snapshotIds.has(row.snapshotId)) throw new Error("Health-Zeile verweist auf unbekannten Snapshot.");
  for (const row of payload.rawSheets) {
    if (!snapshotIds.has(row.snapshotId)) throw new Error("Raw-Sheet verweist auf unbekannten Snapshot.");
    if (row.values.some((values) => values.length !== row.headers.length)) throw new Error(`Raw-Sheet ${row.sheetName} hat eine ungültige Matrix.`);
  }
  const techInfoImportId = payload.techInfo.importMeta.techInfoImportId;
  if (!techInfoImportId || typeof techInfoImportId !== "string") throw new Error("Tech-Info-Importmetadaten sind ungültig.");
  const techRowIndexes = new Set<number>();
  for (const row of payload.techInfo.rows) {
    if (row.techInfoImportId !== techInfoImportId || !Number.isInteger(row.rowIndex) || row.rowIndex < 0 || techRowIndexes.has(row.rowIndex)) throw new Error("Tech-Info-Rohzeilen sind inkonsistent.");
    techRowIndexes.add(row.rowIndex);
  }
  if (techRowIndexes.size !== payload.techInfo.rows.length || payload.techInfo.rows.some((row) => !techRowIndexes.has(row.rowIndex))) throw new Error("Tech-Info-Rohzeilen sind inkonsistent.");
  const vmNamesInPackage = new Set(payload.vms.map((vm) => normalizeVmNameForMatch(vm.vmName)));
  for (const row of payload.techInfo.latest) {
    if (row.techInfoImportId !== techInfoImportId || !vmNamesInPackage.has(normalizeVmNameForMatch(row.vmName))) throw new Error(`Tech-Info-Zuordnung ist ungültig: ${row.vmName}.`);
    // `techRowIndexes` enthält bereits alle Zeilen und ist auf `techInfoImportId` geprüft.
    if (!techRowIndexes.has(row.rowIndex)) throw new Error(`Tech-Info-Pointer ist ungültig: ${row.vmName}.`);
  }
  if (payload.vrops) {
    const objectKeys = new Set<string>();
    for (const object of payload.vrops.objects) {
      if (object.objectType !== "vm" || object.matchStatus !== "matched" || !object.rvtoolsObjectKey || !vmKeys.has(object.rvtoolsObjectKey)) {
        throw new Error("Das vROps-Paket enthält ein nicht erlaubtes oder nicht zugeordnetes Objekt.");
      }
      if (objectKeys.has(object.objectKey)) throw new Error("vROps-Objektkeys sind im Paket nicht eindeutig.");
      objectKeys.add(object.objectKey);
    }
    for (const chunk of payload.vrops.chunks) {
      if (chunk.objectType !== "vm" || new Set(chunk.objectKeys).size !== chunk.objectKeys.length || chunk.objectKeys.some((key) => !objectKeys.has(key))) {
        throw new Error("vROps-Chunk enthält fremde oder nicht zugeordnete Objektkeys.");
      }
    }
    if (payload.vrops.importMeta.rvtoolsSnapshotIds.some((snapshotId) => !snapshotIds.has(snapshotId))) throw new Error("vROps-Import verweist auf einen nicht enthaltenen Snapshot.");
  }
}

function validateCounts(manifest: SysvDataPackageManifestV1, payload: SysvDataPackagePayload): void {
  const actual = countPayload(payload);
  for (const key of Object.keys(actual) as Array<keyof typeof actual>) {
    if (actual[key] !== manifest.counts[key]) {
      throw new Error(`Manifestcount „${key}“ stimmt nicht mit dem Paketinhalt überein.`);
    }
  }
}

async function parseRawSheets(entries: Record<string, Uint8Array>, indexBytes: Uint8Array): Promise<{ rawSheets: SysvDataPackageRawSheet[]; blobs: RawSheetBlob[]; referencedPaths: Set<string> }> {
  const index = ensureArray<RawSheetIndexEntry>(parseJson(indexBytes), "data/raw-sheets/index.json");
  const rawSheets: SysvDataPackageRawSheet[] = [];
  const blobs: RawSheetBlob[] = [];
  const referencedPaths = new Set<string>();
  const seen = new Set<string>();
  for (const item of index) {
    if (!item || typeof item.snapshotId !== "string" || typeof item.sheetName !== "string" || typeof item.path !== "string") throw new Error("Ungültiger Raw-Sheet-Index.");
    assertSafeZipPath(item.path);
    assertRawSheetFilePath(item.path);
    if (referencedPaths.has(item.path)) throw new Error("Raw-Sheet-Pfad ist mehrfach referenziert.");
    referencedPaths.add(item.path);
    const key = `${item.snapshotId}\u0000${item.sheetName}`;
    if (seen.has(key)) throw new Error("Raw-Sheet ist mehrfach referenziert.");
    seen.add(key);
    const parsed = ensureObject(parseJson(bytesForPath(entries, item.path)), item.path);
    const headers = ensureArray<string>(parsed.headers, `${item.path}.headers`);
    const values = ensureArray<Array<string | number | boolean | null>>(parsed.values, `${item.path}.values`);
    if (headers.some((header) => typeof header !== "string") || values.some((row) => !Array.isArray(row) || row.length !== headers.length)) {
      throw new Error(`Raw-Sheet ${item.path} hat eine ungültige Matrix.`);
    }
    const normalizedHeaders = [...headers];
    const normalizedValues = values.map((row) => [...row]);
    rawSheets.push({ snapshotId: item.snapshotId, sheetName: item.sheetName, headers: normalizedHeaders, values: normalizedValues });
    blobs.push({
      snapshotId: item.snapshotId,
      sheetName: item.sheetName,
      headers: normalizedHeaders,
      rowCount: normalizedValues.length,
      codec: "gzip-json-v1",
      data: await gzipJson(normalizedValues),
    });
  }
  return { rawSheets, blobs, referencedPaths };
}

async function parseVrops(entries: Record<string, Uint8Array>, manifest: SysvDataPackageManifestV1): Promise<{ payload: SysvDataPackageVropsPayload; referencedPaths: Set<string> } | undefined> {
  const importBytes = entries["data/vrops/import.json"];
  if (!importBytes) return undefined;
  const importMeta = parseJson<VropsTimeSeriesImport>(importBytes);
  const objects = ensureArray<VropsTimeSeriesImportedObject>(parseJson(bytesForPath(entries, "data/vrops/objects.json")), "vROps-Objekte");
  const summaries = ensureArray<VropsTimeSeriesSummary>(parseJson(bytesForPath(entries, "data/vrops/summaries.json")), "vROps-Zusammenfassungen");
  const chunkIndex = ensureArray<VropsChunkIndexEntry>(parseJson(bytesForPath(entries, "data/vrops/chunks/index.json")), "vROps-Chunk-Index");
  const chunks: VropsTimeSeriesChunk[] = [];
  const referencedPaths = new Set<string>(VROPS_PACKAGE_PATHS);
  for (const item of chunkIndex) {
    if (item.objectType !== "vm" || !Array.isArray(item.objectKeys) || !Number.isInteger(item.slotCount) || item.slotCount < 1) throw new Error("Ungültiger vROps-Chunk-Index.");
    const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
    for (const [metric, path] of Object.entries(item.metricPaths ?? {})) {
      const bytes = bytesForPath(entries, path);
      assertVropsChunkFilePath(path, "f32");
      referencedPaths.add(path);
      if (bytes.byteLength % 4 !== 0) throw new Error(`vROps-Metrikbuffer ist nicht Float32-ausgerichtet: ${path}`);
      const expected = item.objectKeys.length * item.slotCount * 4;
      if (bytes.byteLength !== expected) throw new Error(`vROps-Metrikbuffer hat eine falsche Länge: ${path}`);
      metricValues[metric as keyof typeof metricValues] = exactArrayBuffer(bytes);
    }
    const chunk: VropsTimeSeriesChunk = {
      importId: item.importId,
      objectType: "vm",
      chunkKey: item.chunkKey,
      clusterKey: item.clusterKey ?? null,
      startUtc: item.startUtc,
      slotCount: item.slotCount,
      objectKeys: [...item.objectKeys],
      metricValues,
    };
    if (item.maintenanceCodesPath) {
      assertVropsChunkFilePath(item.maintenanceCodesPath, "u8");
      const bytes = bytesForPath(entries, item.maintenanceCodesPath);
      referencedPaths.add(item.maintenanceCodesPath);
      const expected = item.objectKeys.length * item.slotCount;
      if (bytes.byteLength !== expected) throw new Error("vROps-Wartungscodes haben eine falsche Länge.");
      chunk.maintenanceCodes = exactArrayBuffer(bytes);
      chunk.maintenanceLexicon = [...(item.maintenanceLexicon ?? [])];
    }
    if (item.maintenanceDerivedPath) {
      assertVropsChunkFilePath(item.maintenanceDerivedPath, "u8");
      const bytes = bytesForPath(entries, item.maintenanceDerivedPath);
      referencedPaths.add(item.maintenanceDerivedPath);
      const expected = item.objectKeys.length * item.slotCount;
      if (bytes.byteLength !== expected) throw new Error("vROps-Derived-Flags haben eine falsche Länge.");
      chunk.maintenanceDerived = exactArrayBuffer(bytes);
    }
    chunks.push(chunk);
  }
  if (chunks.some((chunk) => chunk.importId !== importMeta.id)) throw new Error("vROps-Import-ID und Chunk-IDs stimmen nicht überein.");
  if (objects.some((object) => object.importId !== importMeta.id) || summaries.some((summary) => summary.importId !== importMeta.id)) {
    throw new Error("vROps-Import-ID ist nicht durchgängig.");
  }
  if (manifest.counts.vropsChunks !== chunks.length) throw new Error("Manifestcount für vROps-Chunks stimmt nicht.");
  return { payload: { importMeta, objects, chunks, summaries }, referencedPaths };
}

/** Validiert ein bereits entpacktes Archiv und erzeugt die transaktionsfertige Nutzlast. */
export async function validateSysvDataPackageEntries(
  rawEntries: Record<string, Uint8Array>,
): Promise<ValidatedSysvDataPackagePayload> {
  const entries: Record<string, Uint8Array> = {};
  const keys = Object.keys(rawEntries);
  if (keys.length > MAX_SYSV_PACKAGE_ENTRIES) throw new Error("Das SysV-Paket enthält zu viele Dateien.");
  let uncompressedBytes = 0;
  for (const path of keys) {
    assertSafeZipPath(path);
    if (entries[path]) throw new Error(`Datei doppelt im ZIP: ${path}`);
    entries[path] = bytesFrom(rawEntries[path]);
    uncompressedBytes += entries[path].byteLength;
    if (uncompressedBytes > MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES) throw new Error("Das SysV-Paket überschreitet das Größenlimit nach dem Entpacken.");
  }
  const manifestBytes = bytesForPath(entries, "manifest.json");
  const manifest = parseJson<SysvDataPackageManifestV1>(manifestBytes);
  assertManifestShape(manifest);
  const expectedPaths = new Set(["manifest.json", ...manifest.files.map((entry) => entry.path)]);
  for (const path of keys) if (!expectedPaths.has(path)) throw new Error(`Unerwartete Datei im SysV-Paket: ${path}`);
  for (const path of expectedPaths) if (!entries[path]) throw new Error(`Im Manifest aufgeführte Datei fehlt: ${path}`);
  for (const file of manifest.files) {
    const bytes = entries[file.path];
    if (bytes.byteLength !== file.sizeBytes) throw new Error(`Bytezahl stimmt nicht: ${file.path}`);
    const checksum = await computeChecksum(exactArrayBuffer(bytes));
    if (checksum !== file.sha256) throw new Error(`Prüfsumme stimmt nicht: ${file.path}`);
  }
  const mode = parseModeFile(new TextDecoder().decode(bytesForPath(entries, "modus.json")));
  if (mode.mode !== "sysv") throw new Error("Ein SysV-Datenpaket muss modus.json mit mode=sysv enthalten.");

  const snapshots = ensureArray<SnapshotMeta>(parseJson(bytesForPath(entries, "data/snapshots.json")), "Snapshots");
  const vms = ensureArray<NormalizedVm>(parseJson(bytesForPath(entries, "data/entities/vms.json")), "VMs");
  const hosts = ensureArray<NormalizedHost>(parseJson(bytesForPath(entries, "data/entities/hosts.json")), "Hosts");
  const clusters = ensureArray<NormalizedCluster>(parseJson(bytesForPath(entries, "data/entities/clusters.json")), "Cluster");
  const datastores = ensureArray<NormalizedDatastore>(parseJson(bytesForPath(entries, "data/entities/datastores.json")), "Datastores");
  const snapshotsEntities = ensureArray<NormalizedSnapshot & { id?: number }>(parseJson(bytesForPath(entries, "data/entities/snapshots.json")), "VM-Snapshots");
  const { rawSheets, blobs, referencedPaths: rawSheetPaths } = await parseRawSheets(entries, bytesForPath(entries, "data/raw-sheets/index.json"));
  const importMeta = parseJson<TechInfoImportMeta>(bytesForPath(entries, "data/tech-info/import.json"));
  const techRows = ensureArray<TechInfoRow>(parseJson(bytesForPath(entries, "data/tech-info/rows.json")), "Tech-Info-Zeilen");
  const techLatest = ensureArray<TechInfoLatest>(parseJson(bytesForPath(entries, "data/tech-info/latest.json")), "Tech-Info-Latest");
  const parsedVrops = await parseVrops(entries, manifest);
  const referencedPaths = new Set<string>([
    ...CORE_PACKAGE_PATHS,
    ...rawSheetPaths,
    ...(parsedVrops?.referencedPaths ?? []),
  ]);
  for (const path of manifest.files.map((entry) => entry.path)) {
    if (!referencedPaths.has(path)) throw new Error(`Nicht referenzierte Datei im SysV-Paket: ${path}`);
  }
  const payload: SysvDataPackagePayload = {
    snapshots,
    rawSheets,
    vms,
    hosts,
    clusters,
    datastores,
    snapshotsEntities,
    health: [],
    techInfo: { importMeta, rows: techRows, latest: techLatest },
    vrops: parsedVrops?.payload,
  };
  validateEntityReferences(payload, manifest);
  validateCounts(manifest, payload);
  return { manifest, payload, rawSheetBlobs: blobs };
}

/** Entpackt, prüft Limits und validiert ein SysV-ZIP vollständig vor dem DB-Zugriff. */
export async function validateSysvDataPackageZip(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ValidatedSysvDataPackagePayload> {
  const bytes = bytesFrom(buffer);
  if (bytes.byteLength > MAX_SYSV_PACKAGE_COMPRESSED_BYTES) throw new Error("Das SysV-Paket überschreitet das komprimierte Größenlimit.");
  const centralDirectory = readZipCentralDirectory(bytes);
  if (centralDirectory.length > MAX_SYSV_PACKAGE_ENTRIES) throw new Error("Das SysV-Paket enthält zu viele Dateien.");
  // Muss vor dem Entpacken greifen: `unzipSync` materialisiert sonst zuerst den
  // gesamten Inhalt im Speicher und ein nachgelagertes Limit käme zu spät.
  const declaredUncompressedBytes = centralDirectory.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (declaredUncompressedBytes > MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES) throw new Error("Das SysV-Paket überschreitet das Größenlimit nach dem Entpacken.");
  const zipNames = centralDirectory.map((entry) => entry.name);
  const normalizedZipNames = new Set<string>();
  for (const path of zipNames) {
    assertSafeZipPath(path);
    if (normalizedZipNames.has(path)) throw new Error(`Datei doppelt im ZIP: ${path}`);
    normalizedZipNames.add(path);
  }
  if (zipNames.filter((path) => path === "manifest.json").length !== 1) throw new Error("Genau ein manifest.json im ZIP-Root ist erforderlich.");
  let entries: Record<string, Uint8Array<ArrayBuffer>>;
  try {
    entries = unzipSync(bytes) as Record<string, Uint8Array<ArrayBuffer>>;
  } catch (error) {
    throw new Error(`SysV-Paket konnte nicht entpackt werden: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Object.keys(entries).length !== zipNames.length) throw new Error("ZIP-Einträge konnten nicht eindeutig gelesen werden.");
  return validateSysvDataPackageEntries(entries);
}

export function estimateSysvDataPackageUncompressedBytes(files: Record<string, Uint8Array>): number {
  return Object.values(files).reduce((sum, file) => sum + file.byteLength, 0);
}

export interface MergedVropsTimeSeriesChunks {
  chunks: VropsTimeSeriesChunk[];
  warnings: string[];
}

function cloneFloat32Buffer(buffer: ArrayBuffer | undefined, expectedLength: number, label: string): Float32Array | null {
  if (!buffer) return null;
  if (buffer.byteLength !== expectedLength * 4) throw new Error(`vROps-${label} hat eine falsche Quelllänge.`);
  return new Float32Array(buffer);
}

function mergeVropsByteBuffers(
  chunks: readonly VropsTimeSeriesChunk[],
  objectIndexes: ReadonlyMap<string, number>,
  slotCount: number,
  property: "maintenanceCodes" | "maintenanceDerived",
): ArrayBuffer | undefined {
  if (!chunks.some((chunk) => chunk[property])) return undefined;
  const target = new Uint8Array(objectIndexes.size * slotCount);
  for (const chunk of chunks) {
    if (!chunk[property]) continue;
    if (chunk[property]!.byteLength !== chunk.objectKeys.length * slotCount) {
      throw new Error(`vROps-${property} hat eine falsche Quelllänge.`);
    }
    const source = new Uint8Array(chunk[property]!);
    chunk.objectKeys.forEach((objectKey, sourceIndex) => {
      const targetIndex = objectIndexes.get(objectKey);
      if (targetIndex === undefined) return;
      target.set(source.subarray(sourceIndex * slotCount, (sourceIndex + 1) * slotCount), targetIndex * slotCount);
    });
  }
  return target.buffer as ArrayBuffer;
}

/**
 * Führt physisch beschnittene VM-Chunks wieder zusammen. Die Funktion ist
 * absichtlich frei von IndexedDB- oder UI-Zugriffen und erhält die erste
 * Einfügereihenfolge der Objektkeys.
 */
export function mergeVropsTimeSeriesChunksWithWarnings(
  chunks: readonly VropsTimeSeriesChunk[],
  importId = "sysv-merge:preview:vrops",
): MergedVropsTimeSeriesChunks {
  const byChunkKey = new Map<string, VropsTimeSeriesChunk[]>();
  for (const chunk of chunks) {
    if (chunk.objectType !== "vm") throw new Error("SysV-vROps-Merges dürfen nur VM-Chunks enthalten.");
    const group = byChunkKey.get(chunk.chunkKey);
    if (group) group.push(chunk);
    else byChunkKey.set(chunk.chunkKey, [chunk]);
  }

  const merged: VropsTimeSeriesChunk[] = [];
  const warnings: string[] = [];
  for (const group of byChunkKey.values()) {
    const first = group[0];
    const slotCount = first.slotCount;
    if (!Number.isInteger(slotCount) || slotCount < 1) throw new Error(`vROps-Chunk ${first.chunkKey} hat eine ungültige Slot-Anzahl.`);
    if (group.some((chunk) => chunk.startUtc !== first.startUtc || chunk.slotCount !== slotCount)) {
      throw new Error(`vROps-Chunk ${first.chunkKey} hat widersprüchliche Zeitachsen.`);
    }

    const objectKeys: string[] = [];
    const objectIndexes = new Map<string, number>();
    for (const chunk of group) {
      for (const objectKey of chunk.objectKeys) {
        if (!objectIndexes.has(objectKey)) {
          objectIndexes.set(objectKey, objectKeys.length);
          objectKeys.push(objectKey);
        }
      }
    }

    const metricNames = new Set<string>();
    for (const chunk of group) for (const metric of Object.keys(chunk.metricValues)) metricNames.add(metric);
    const metricValues: VropsTimeSeriesChunk["metricValues"] = {};
    for (const metric of metricNames) {
      const target = new Float32Array(objectKeys.length * slotCount);
      target.fill(Number.NaN);
      for (const chunk of group) {
        const source = cloneFloat32Buffer(chunk.metricValues[metric as keyof typeof chunk.metricValues], chunk.objectKeys.length * slotCount, metric);
        if (!source) continue;
        chunk.objectKeys.forEach((objectKey, sourceIndex) => {
          const targetIndex = objectIndexes.get(objectKey);
          if (targetIndex === undefined) return;
          target.set(source.subarray(sourceIndex * slotCount, (sourceIndex + 1) * slotCount), targetIndex * slotCount);
        });
      }
      metricValues[metric as keyof typeof metricValues] = target.buffer as ArrayBuffer;
    }

    const lexicons = group
      .filter((chunk) => chunk.maintenanceCodes)
      .map((chunk) => JSON.stringify(chunk.maintenanceLexicon ?? []));
    const maintenanceLexiconMatches = lexicons.every((lexicon) => lexicon === lexicons[0]);
    let maintenanceCodes = mergeVropsByteBuffers(group, objectIndexes, slotCount, "maintenanceCodes");
    if (maintenanceCodes && !maintenanceLexiconMatches) {
      maintenanceCodes = undefined;
      warnings.push(`vROps-Chunk ${first.chunkKey}: Wartungscodes wurden wegen unterschiedlicher Lexika verworfen.`);
    }
    const maintenanceDerived = mergeVropsByteBuffers(group, objectIndexes, slotCount, "maintenanceDerived");
    const {
      maintenanceCodes: _firstMaintenanceCodes,
      maintenanceLexicon: _firstMaintenanceLexicon,
      maintenanceDerived: _firstMaintenanceDerived,
      maintenanceStates: _legacyMaintenanceStates,
      ...baseChunk
    } = first;
    // Ohne übernommene Wartungscodes bleibt auch das Lexikon weg — sonst würde ein
    // Lexikon ohne zugehörige Codes in die Zieldaten wandern.
    const mergedChunk: VropsTimeSeriesChunk = { ...baseChunk, importId, objectKeys, metricValues };
    if (maintenanceCodes) {
      mergedChunk.maintenanceCodes = maintenanceCodes;
      mergedChunk.maintenanceLexicon = [...(first.maintenanceLexicon ?? [])];
    }
    if (maintenanceDerived) mergedChunk.maintenanceDerived = maintenanceDerived;
    merged.push(mergedChunk);
  }
  return { chunks: merged, warnings };
}
