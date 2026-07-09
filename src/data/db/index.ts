import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type {
  SnapshotMeta,
  SheetRow,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  AnalysisMetric,
  UiState,
  TechInfoImportMeta,
  TechInfoRow,
  TechInfoLatest,
  TechInfoClientImportMeta,
  TechInfoClientRow,
  TechInfoClientLatest,
  MaintenanceSettings,
  MaintenanceClusterAssignment,
  Scenario,
} from "@/domain/models/types";
import { isTechInfoNewerOrEqual, mapTechInfoDisplayFields, mapTechInfoClientDisplayFields, toStr } from "@/lib/xlsx/parseHelpers";

/* ---------- schema ---------- */
interface RVToolsDBSchema extends DBSchema {
  snapshots: {
    key: string;
    value: SnapshotMeta;
    indexes: { vcenterId: string; exportTs: string; fileChecksum: string };
  };
  rawSheets: {
    key: [string, string, number];
    value: SheetRow;
    indexes: { snapshotId: string; sheetName: string; "snapshotId_sheetName": [string, string] };
  };
  entities_vm: { key: string; value: NormalizedVm; indexes: { snapshotId: string } };
  entities_host: { key: string; value: NormalizedHost; indexes: { snapshotId: string } };
  entities_cluster: { key: string; value: NormalizedCluster; indexes: { snapshotId: string } };
  entities_datastore: { key: string; value: NormalizedDatastore; indexes: { snapshotId: string } };
  entities_snapshot: { key: number; value: NormalizedSnapshot & { id?: number }; indexes: { snapshotId: string } };
  entities_health: { key: number; value: NormalizedHealth & { id?: number }; indexes: { snapshotId: string } };
  metrics_cache: { key: [string, string]; value: AnalysisMetric; indexes: { snapshotId: string } };
  ui_state: { key: string; value: UiState };
  techinfo_imports: {
    key: string;
    value: TechInfoImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  techinfo_rows: {
    key: [string, number];
    value: TechInfoRow;
    indexes: { techInfoImportId: string; vmNameNorm: string };
  };
  techinfo_latest: {
    key: string;
    value: TechInfoLatest;
    indexes: { importedAt: string };
  };
  techinfo_client_imports: {
    key: string;
    value: TechInfoClientImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  techinfo_client_rows: {
    key: [string, number];
    value: TechInfoClientRow;
    indexes: { techInfoClientImportId: string; clientNameNorm: string };
  };
  techinfo_client_latest: {
    key: string;
    value: TechInfoClientLatest;
    indexes: { importedAt: string };
  };
  maintenance_settings: {
    key: string;
    value: MaintenanceSettings;
  };
  maintenance_cluster_assignments: {
    key: [string, string];
    value: MaintenanceClusterAssignment;
    indexes: { vcenterId: string; clusterName: string };
  };
  scenarios: {
    key: string;
    value: Scenario;
    indexes: { updatedAt: string };
  };
}

export type StoreName = "snapshots" | "rawSheets" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest"
  | "techinfo_client_imports" | "techinfo_client_rows" | "techinfo_client_latest"
  | "maintenance_settings"
  | "maintenance_cluster_assignments" | "scenarios";
type SnapshotScopedStoreName = "rawSheets" | "entities_vm" | "entities_host" | "entities_cluster"
  | "entities_datastore" | "entities_snapshot" | "entities_health" | "metrics_cache";

const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 16;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheets", "entities_vm", "entities_host",
  "entities_cluster", "entities_datastore", "entities_snapshot",
  "entities_health", "metrics_cache", "ui_state",
  "techinfo_imports", "techinfo_rows", "techinfo_latest",
  "techinfo_client_imports", "techinfo_client_rows", "techinfo_client_latest",
  "maintenance_settings", "maintenance_cluster_assignments", "scenarios",
];

let dbPromise: Promise<IDBPDatabase<RVToolsDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<RVToolsDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RVToolsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Clean slate migration from old Dexie or older idb versions
        if (oldVersion < 12) {
          const existing = Array.from(db.objectStoreNames);
          for (const name of existing) db.deleteObjectStore(name);
        }

        if (!db.objectStoreNames.contains("snapshots")) {
          const snap = db.createObjectStore("snapshots", { keyPath: "snapshotId" });
          snap.createIndex("vcenterId", "vcenterId");
          snap.createIndex("exportTs", "exportTs");
          snap.createIndex("fileChecksum", "fileChecksum");
        }
        if (!db.objectStoreNames.contains("rawSheets")) {
          const raw = db.createObjectStore("rawSheets", { keyPath: ["snapshotId", "sheetName", "rowIndex"] });
          raw.createIndex("snapshotId", "snapshotId");
          raw.createIndex("sheetName", "sheetName");
          raw.createIndex("snapshotId_sheetName", ["snapshotId", "sheetName"]);
        }
        if (!db.objectStoreNames.contains("entities_vm")) {
          db.createObjectStore("entities_vm", { keyPath: "vmKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_host")) {
          db.createObjectStore("entities_host", { keyPath: "hostKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_cluster")) {
          db.createObjectStore("entities_cluster", { keyPath: "clusterKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_datastore")) {
          db.createObjectStore("entities_datastore", { keyPath: "dsKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_snapshot")) {
          db.createObjectStore("entities_snapshot", { keyPath: "id", autoIncrement: true }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_health")) {
          db.createObjectStore("entities_health", { keyPath: "id", autoIncrement: true }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("metrics_cache")) {
          db.createObjectStore("metrics_cache", { keyPath: ["snapshotId", "id"] }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("ui_state")) {
          db.createObjectStore("ui_state", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("techinfo_imports")) {
          const imports = db.createObjectStore("techinfo_imports", { keyPath: "techInfoImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_rows")) {
          const rows = db.createObjectStore("techinfo_rows", { keyPath: ["techInfoImportId", "rowIndex"] });
          rows.createIndex("techInfoImportId", "techInfoImportId");
          rows.createIndex("vmNameNorm", "vmNameNorm");
        }
        if (!db.objectStoreNames.contains("techinfo_latest")) {
          const latest = db.createObjectStore("techinfo_latest", { keyPath: "vmNameNorm" });
          latest.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_client_imports")) {
          const imports = db.createObjectStore("techinfo_client_imports", { keyPath: "techInfoClientImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_client_rows")) {
          const rows = db.createObjectStore("techinfo_client_rows", { keyPath: ["techInfoClientImportId", "rowIndex"] });
          rows.createIndex("techInfoClientImportId", "techInfoClientImportId");
          rows.createIndex("clientNameNorm", "clientNameNorm");
        }
        if (!db.objectStoreNames.contains("techinfo_client_latest")) {
          const latest = db.createObjectStore("techinfo_client_latest", { keyPath: "clientNameNorm" });
          latest.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("maintenance_settings")) {
          db.createObjectStore("maintenance_settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("maintenance_cluster_assignments")) {
          const assignments = db.createObjectStore("maintenance_cluster_assignments", { keyPath: ["vcenterId", "clusterName"] });
          assignments.createIndex("vcenterId", "vcenterId");
          assignments.createIndex("clusterName", "clusterName");
        }
        if (!db.objectStoreNames.contains("scenarios")) {
          const scenarios = db.createObjectStore("scenarios", { keyPath: "id" });
          scenarios.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- query helpers ---------- */

export async function getSnapshots(): Promise<SnapshotMeta[]> {
  const db = await getDb();
  return db.getAll("snapshots");
}

export async function getSnapshotsByChecksum(checksum: string): Promise<SnapshotMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("snapshots", "fileChecksum", checksum);
}

export async function getSnapshotsByVcenterId(vcenterId: string): Promise<SnapshotMeta[]> {
  const db = await getDb();
  return db.getAllFromIndex("snapshots", "vcenterId", vcenterId);
}

export async function putSnapshot(snap: SnapshotMeta): Promise<void> {
  const db = await getDb();
  await db.put("snapshots", snap);
}

export async function getTechInfoImportByChecksum(checksum: string): Promise<TechInfoImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("techinfo_imports", "fileChecksum", checksum);
}

export async function getTechInfoImports(): Promise<TechInfoImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("techinfo_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putTechInfoImport(meta: TechInfoImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("techinfo_imports", meta);
}

export async function getTechInfoClientImportByChecksum(checksum: string): Promise<TechInfoClientImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("techinfo_client_imports", "fileChecksum", checksum);
}

export async function getTechInfoClientImports(): Promise<TechInfoClientImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("techinfo_client_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putTechInfoClientImport(meta: TechInfoClientImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("techinfo_client_imports", meta);
}

export async function getUiState(id: string): Promise<UiState | undefined> {
  const db = await getDb();
  return db.get("ui_state", id);
}

export async function putUiState(state: UiState): Promise<void> {
  const db = await getDb();
  await db.put("ui_state", state);
}

export async function getScenarios(): Promise<Scenario[]> {
  const db = await getDb();
  const all = await db.getAll("scenarios");
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putScenario(scenario: Scenario): Promise<void> {
  const db = await getDb();
  await db.put("scenarios", scenario);
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("scenarios", id);
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings | undefined> {
  const db = await getDb();
  return db.get("maintenance_settings", "default");
}

export async function putMaintenanceSettings(settings: MaintenanceSettings): Promise<void> {
  const db = await getDb();
  await db.put("maintenance_settings", settings);
}

export async function getMaintenanceAssignments(): Promise<MaintenanceClusterAssignment[]> {
  const db = await getDb();
  return db.getAll("maintenance_cluster_assignments");
}

export async function getMaintenanceAssignmentsByVcenterIds(vcenterIds: string[]): Promise<MaintenanceClusterAssignment[]> {
  if (vcenterIds.length === 0) return [];
  const db = await getDb();
  const uniqueIds = [...new Set(vcenterIds)];
  const perVcenter = await Promise.all(
    uniqueIds.map((vcenterId) => db.getAllFromIndex("maintenance_cluster_assignments", "vcenterId", vcenterId)),
  );
  return perVcenter.flat();
}

export async function putMaintenanceAssignment(assignment: MaintenanceClusterAssignment): Promise<void> {
  const db = await getDb();
  await db.put("maintenance_cluster_assignments", {
    ...assignment,
    id: assignment.id ?? `${assignment.vcenterId}::${assignment.clusterName}`,
  });
}

export async function getBySnapshotIds<T>(
  store: "entities_vm" | "entities_host" | "entities_cluster" | "entities_datastore" | "entities_snapshot" | "entities_health",
  snapshotIds: string[],
): Promise<T[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map((sid) => db.getAllFromIndex(store, "snapshotId", sid)),
  );
  return perId.flat() as unknown as T[];
}

/** Get raw sheet rows for specific snapshot+sheet combinations */
export async function getRawSheetRows(
  snapshotIds: string[],
  sheetName: string,
): Promise<SheetRow[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map((sid) => db.getAllFromIndex("rawSheets", "snapshotId_sheetName", [sid, sheetName])),
  );
  return perId.flat();
}

export async function getRawSheetFieldNames(
  snapshotIds: string[],
  sheetName: string,
): Promise<string[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const keys = new Set<string>();

  await Promise.all(
    snapshotIds.map(async (sid) => {
      const row = await db.get("rawSheets", [sid, sheetName, 0]);
      if (row) {
        for (const key of Object.keys(row.data)) keys.add(key);
      }
    }),
  );

  return [...keys].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }));
}

export async function getAllTechInfoLatest(): Promise<TechInfoLatest[]> {
  const db = await getDb();
  const values = await db.getAll("techinfo_latest");
  return Promise.all(values.map((value) => hydrateTechInfoLatest(db, value)));
}

export async function getTechInfoLatestByVmNames(vmNames: string[]): Promise<TechInfoLatest[]> {
  if (vmNames.length === 0) return [];
  const db = await getDb();
  const uniqueNorm = new Set<string>();
  for (const name of vmNames) {
    const normalized = name.trim().toLowerCase();
    if (normalized) uniqueNorm.add(normalized);
  }
  const values = await Promise.all([...uniqueNorm].map((vmNameNorm) => db.get("techinfo_latest", vmNameNorm)));
  const presentValues = values.filter((v): v is TechInfoLatest => Boolean(v));
  return Promise.all(presentValues.map((value) => hydrateTechInfoLatest(db, value)));
}

async function hydrateTechInfoLatest(
  db: IDBPDatabase<RVToolsDBSchema>,
  value: TechInfoLatest,
): Promise<TechInfoLatest> {
  if (value.serverType !== undefined) {
    return { ...value, serverType: value.serverType ?? null };
  }

  const rawRow = await db.get("techinfo_rows", [value.techInfoImportId, value.rowIndex]);
  return {
    ...value,
    serverType: toStr(rawRow?.rawData?.["Servertyp"]),
  };
}

export async function batchPut<S extends StoreName>(
  storeName: S,
  items: RVToolsDBSchema[S]["value"][],
  batchSize = 5000,
): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  const batches: RVToolsDBSchema[S]["value"][][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  await runSequential(batches, async (batch) => {
    const tx = db.transaction(storeName, "readwrite");
    for (const item of batch) {
      tx.store.put(item);
    }
    await tx.done;
  });
}

export async function batchPutTechInfoImports(items: TechInfoImportMeta[], batchSize = 1000): Promise<void> {
  await batchPut("techinfo_imports", items, batchSize);
}

export async function batchPutTechInfoRows(items: TechInfoRow[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_rows", items, batchSize);
}

export async function batchPutTechInfoLatest(items: TechInfoLatest[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_latest", items, batchSize);
}

export async function getAllTechInfoClientLatest(): Promise<TechInfoClientLatest[]> {
  const db = await getDb();
  return db.getAll("techinfo_client_latest");
}

export async function getTechInfoClientLatestByClientNames(clientNames: string[]): Promise<TechInfoClientLatest[]> {
  if (clientNames.length === 0) return [];
  const db = await getDb();
  const uniqueNorm = new Set<string>();
  for (const name of clientNames) {
    const normalized = name.trim().toLowerCase();
    if (normalized) uniqueNorm.add(normalized);
  }
  const values = await Promise.all([...uniqueNorm].map((clientNameNorm) => db.get("techinfo_client_latest", clientNameNorm)));
  return values.filter((v): v is TechInfoClientLatest => Boolean(v));
}

export async function batchPutTechInfoClientRows(items: TechInfoClientRow[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_client_rows", items, batchSize);
}

export async function batchPutTechInfoClientLatest(items: TechInfoClientLatest[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_client_latest", items, batchSize);
}

/* ---------- diagnostics ---------- */

export interface StoreDiagnostics {
  storeName: StoreName;
  count: number;
  /** Hochgerechnete Schätzung basierend auf einer Stichprobe — kein exakter Byte-Wert. */
  estimatedSizeBytes: number;
}

export async function getStoreDiagnostics(sampleSize = 50): Promise<StoreDiagnostics[]> {
  const db = await getDb();
  const results: StoreDiagnostics[] = [];

  for (const storeName of ALL_STORES) {
    const count = await db.count(storeName);
    let estimatedSizeBytes = 0;

    if (count > 0) {
      const tx = db.transaction(storeName, "readonly");
      const sample: unknown[] = [];
      let cursor = await tx.store.openCursor();
      while (cursor && sample.length < sampleSize) {
        sample.push(cursor.value);
        cursor = await cursor.continue();
      }
      await tx.done;

      if (sample.length > 0) {
        const sampleBytes = sample.reduce<number>((sum, value) => sum + JSON.stringify(value).length, 0);
        const avgBytesPerEntry = sampleBytes / sample.length;
        estimatedSizeBytes = Math.round(avgBytesPerEntry * count);
      }
    }

    results.push({ storeName, count, estimatedSizeBytes });
  }

  return results;
}

export interface StorageEstimateResult {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
    return { supported: false, usageBytes: null, quotaBytes: null };
  }
  const estimate = await navigator.storage.estimate();
  return {
    supported: true,
    usageBytes: estimate.usage ?? null,
    quotaBytes: estimate.quota ?? null,
  };
}

const SIZE_SAMPLE_COUNT = 40;

/**
 * Hochgerechnete Größenschätzung pro Gruppe (z. B. Snapshot oder Tech-Info-Import):
 * Stichprobe der ersten Einträge × Gesamtanzahl im Index — kein exakter Byte-Wert.
 */
async function estimateSizeByIndex(
  db: IDBPDatabase<RVToolsDBSchema>,
  storeName: SnapshotScopedStoreName | "techinfo_rows" | "techinfo_client_rows",
  indexName: "snapshotId" | "techInfoImportId" | "techInfoClientImportId",
  key: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Store/Index-Kombination ist zur Laufzeit gültig, idb-Typen können die Union nicht abbilden
  const anyDb = db as any;
  const count: number = await anyDb.countFromIndex(storeName, indexName, key);
  if (count === 0) return 0;
  const sample: unknown[] = await anyDb.getAllFromIndex(storeName, indexName, key, SIZE_SAMPLE_COUNT);
  if (sample.length === 0) return 0;
  const sampleBytes = sample.reduce<number>((sum, value) => sum + JSON.stringify(value).length, 0);
  return Math.round((sampleBytes / sample.length) * count);
}

/** Geschätzte IndexedDB-Größe je RVTools-Snapshot über alle snapshot-bezogenen Stores. */
export async function estimateSnapshotSizesBytes(snapshotIds: string[]): Promise<Record<string, number>> {
  if (snapshotIds.length === 0) return {};
  const db = await getDb();
  const scopedStores: SnapshotScopedStoreName[] = [
    "rawSheets", "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
  ];
  const entries = await Promise.all(snapshotIds.map(async (snapshotId) => {
    const perStore = await Promise.all(
      scopedStores.map((store) => estimateSizeByIndex(db, store, "snapshotId", snapshotId)),
    );
    return [snapshotId, perStore.reduce((sum, bytes) => sum + bytes, 0)] as const;
  }));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je Tech-Info-Import (Server). */
export async function estimateTechInfoImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "techinfo_rows", "techInfoImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je Tech-Info-Client-Import. */
export async function estimateTechInfoClientImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "techinfo_client_rows", "techInfoClientImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

export interface SampleQueryTiming {
  store: "entities_vm";
  snapshotCount: number;
  durationMs: number;
  rowCount: number;
}

export async function timeSampleVmQuery(): Promise<SampleQueryTiming> {
  const snapshots = await getSnapshots();
  const snapshotIds = snapshots.map((s) => s.snapshotId);
  const start = performance.now();
  const rows = await getBySnapshotIds<unknown>("entities_vm", snapshotIds);
  const durationMs = Math.round(performance.now() - start);
  return { store: "entities_vm", snapshotCount: snapshotIds.length, durationMs, rowCount: rows.length };
}

/* ---------- delete helpers ---------- */

export interface DeleteProgress {
  step: string;
  percent: number;
  detail?: string;
}

export type DeleteProgressCallback = (progress: DeleteProgress) => void;

const DELETE_CHUNK_SIZE = 5000;

const STORE_DELETE_LABELS: Record<StoreName, string> = {
  snapshots: "Snapshot-Metadaten",
  rawSheets: "Rohdaten (Sheets)",
  entities_vm: "VMs",
  entities_host: "Hosts",
  entities_cluster: "Cluster",
  entities_datastore: "Datastores",
  entities_snapshot: "VM-Snapshots",
  entities_health: "Health-Einträge",
  metrics_cache: "Metrik-Cache",
  ui_state: "UI-Einstellungen",
  techinfo_imports: "Tech-Info Importe",
  techinfo_rows: "Tech-Info Zeilen",
  techinfo_latest: "Tech-Info Latest",
  techinfo_client_imports: "Tech-Info Client Importe",
  techinfo_client_rows: "Tech-Info Client Zeilen",
  techinfo_client_latest: "Tech-Info Client Latest",
  maintenance_settings: "Wartungseinstellungen",
  maintenance_cluster_assignments: "Cluster-Zuordnungen",
  scenarios: "Szenarien",
};

async function runSequential<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  if (index >= items.length) return;
  await task(items[index], index);
  await runSequential(items, task, index + 1);
}

/**
 * Löscht alle Einträge, deren Array-Primärschlüssel mit `prefix` beginnt, in Chunks.
 * Deutlich schneller als zeilenweises Cursor-Löschen: pro Chunk werden nur die Keys
 * gelesen und der Bereich mit einem einzigen delete(range) entfernt (~6× schneller
 * bei 60k+ Zeilen). `[prefix, []]` ist die exklusive Obergrenze, weil Arrays in der
 * IndexedDB-Sortierung hinter allen Strings und Zahlen liegen.
 */
async function deleteByKeyPrefix(
  storeName: "rawSheets" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows",
  prefix: string,
  onChunkDeleted?: (deletedCount: number) => void,
): Promise<void> {
  const db = await getDb();
  const fullRange = IDBKeyRange.bound([prefix], [prefix, []], false, true);
  for (;;) {
    const tx = db.transaction(storeName, "readwrite");
    const keys = await tx.store.getAllKeys(fullRange, DELETE_CHUNK_SIZE);
    if (keys.length > 0) {
      await tx.store.delete(IDBKeyRange.bound(keys[0], keys[keys.length - 1]));
    }
    await tx.done;
    if (keys.length > 0) onChunkDeleted?.(keys.length);
    if (keys.length < DELETE_CHUNK_SIZE) return;
  }
}

/**
 * Löscht alle Einträge eines Stores, deren `snapshotId`-Index auf `snapshotId` zeigt,
 * in Chunks über die Primärschlüssel (für Stores ohne snapshotId-Präfix im Key).
 */
async function deleteBySnapshotIdIndex(
  storeName: Exclude<SnapshotScopedStoreName, "rawSheets" | "metrics_cache">,
  snapshotId: string,
  onChunkDeleted?: (deletedCount: number) => void,
): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex(storeName, "snapshotId", snapshotId) as Array<string | number>;
  const chunks: Array<Array<string | number>> = [];
  for (let i = 0; i < keys.length; i += DELETE_CHUNK_SIZE) {
    chunks.push(keys.slice(i, i + DELETE_CHUNK_SIZE));
  }
  await runSequential(chunks, async (chunk) => {
    const tx = db.transaction(storeName, "readwrite");
    for (const key of chunk) tx.store.delete(key);
    await tx.done;
    onChunkDeleted?.(chunk.length);
  });
}

export async function deleteAllData(onProgress?: DeleteProgressCallback): Promise<void> {
  const db = await getDb();
  const counts = await Promise.all(ALL_STORES.map((s) => db.count(s)));
  const totalRows = counts.reduce((sum, c) => sum + c, 0);
  let clearedRows = 0;

  await runSequential(ALL_STORES, async (storeName, i) => {
    onProgress?.({
      step: "Alle Daten löschen",
      percent: totalRows === 0 ? 0 : Math.min(99, Math.round((clearedRows / totalRows) * 100)),
      detail: `${STORE_DELETE_LABELS[storeName]} (${counts[i].toLocaleString("de-DE")} Einträge)`,
    });
    await db.clear(storeName);
    clearedRows += counts[i];
  });
  onProgress?.({ step: "Alle Daten löschen", percent: 100, detail: "Abgeschlossen" });
}

export async function deleteSnapshot(snapshotId: string, onProgress?: DeleteProgressCallback): Promise<void> {
  const db = await getDb();
  const prefixStores = ["rawSheets", "metrics_cache"] as const;
  const indexStores = [
    "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health",
  ] as const;
  const scopedStores: readonly SnapshotScopedStoreName[] = [...prefixStores, ...indexStores];

  const counts = await Promise.all(
    scopedStores.map((store) => db.countFromIndex(store, "snapshotId", snapshotId)),
  );
  const totalRows = counts.reduce((sum, c) => sum + c, 0);
  let deletedRows = 0;
  const report = (detail: string) => {
    onProgress?.({
      step: "Snapshot löschen",
      percent: totalRows === 0 ? 99 : Math.min(99, Math.round((deletedRows / totalRows) * 100)),
      detail,
    });
  };
  report(`${totalRows.toLocaleString("de-DE")} Einträge gefunden`);

  await runSequential(prefixStores, async (store) => {
    await deleteByKeyPrefix(store, snapshotId, (n) => {
      deletedRows += n;
      report(STORE_DELETE_LABELS[store]);
    });
  });
  await runSequential(indexStores, async (store) => {
    await deleteBySnapshotIdIndex(store, snapshotId, (n) => {
      deletedRows += n;
      report(STORE_DELETE_LABELS[store]);
    });
  });

  // Metadaten zuletzt löschen: bricht der Vorgang ab, bleibt der Snapshot in der
  // Liste sichtbar und das Löschen kann erneut angestoßen werden.
  await db.delete("snapshots", snapshotId);
  onProgress?.({ step: "Snapshot löschen", percent: 100, detail: "Abgeschlossen" });
}

async function deleteTechInfoRowsByImportId(techInfoImportId: string): Promise<void> {
  await deleteByKeyPrefix("techinfo_rows", techInfoImportId);
}

function buildTechInfoLatestFromRow(row: TechInfoRow): TechInfoLatest {
  return {
    vmNameNorm: row.vmNameNorm,
    vmName: row.vmName,
    importedAt: row.importedAt,
    techInfoImportId: row.techInfoImportId,
    rowIndex: row.rowIndex,
    ...mapTechInfoDisplayFields(row.rawData),
  };
}

async function rebuildTechInfoLatestForVm(vmNameNorm: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_rows", "vmNameNorm", vmNameNorm);
  const latestRow = rows.reduce<TechInfoRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("techinfo_latest", vmNameNorm);
    return;
  }

  await db.put("techinfo_latest", buildTechInfoLatestFromRow(latestRow));
}

export async function deleteTechInfoImport(techInfoImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_rows", "techInfoImportId", techInfoImportId);
  const affectedVmNames = new Set<string>();
  for (const row of rows) {
    if (row.vmNameNorm) affectedVmNames.add(row.vmNameNorm);
  }

  await db.delete("techinfo_imports", techInfoImportId);
  await deleteTechInfoRowsByImportId(techInfoImportId);
  await Promise.all([...affectedVmNames].map((vmNameNorm) => rebuildTechInfoLatestForVm(vmNameNorm)));
}

async function deleteTechInfoClientRowsByImportId(techInfoClientImportId: string): Promise<void> {
  await deleteByKeyPrefix("techinfo_client_rows", techInfoClientImportId);
}

function buildTechInfoClientLatestFromRow(row: TechInfoClientRow): TechInfoClientLatest {
  return {
    clientNameNorm: row.clientNameNorm,
    clientName: row.clientName,
    importedAt: row.importedAt,
    techInfoClientImportId: row.techInfoClientImportId,
    rowIndex: row.rowIndex,
    ...mapTechInfoClientDisplayFields(row.rawData),
  };
}

async function rebuildTechInfoClientLatestForClient(clientNameNorm: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_client_rows", "clientNameNorm", clientNameNorm);
  const latestRow = rows.reduce<TechInfoClientRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("techinfo_client_latest", clientNameNorm);
    return;
  }

  await db.put("techinfo_client_latest", buildTechInfoClientLatestFromRow(latestRow));
}

export async function deleteTechInfoClientImport(techInfoClientImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_client_rows", "techInfoClientImportId", techInfoClientImportId);
  const affectedClientNames = new Set<string>();
  for (const row of rows) {
    if (row.clientNameNorm) affectedClientNames.add(row.clientNameNorm);
  }

  await db.delete("techinfo_client_imports", techInfoClientImportId);
  await deleteTechInfoClientRowsByImportId(techInfoClientImportId);
  await Promise.all([...affectedClientNames].map((clientNameNorm) => rebuildTechInfoClientLatestForClient(clientNameNorm)));
}
