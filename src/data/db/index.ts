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
} from "@/domain/models/types";
import { isTechInfoNewerOrEqual, mapTechInfoDisplayFields, toStr } from "@/lib/xlsx/parseHelpers";

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
}

export type StoreName = "snapshots" | "rawSheets" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest";

const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 13;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheets", "entities_vm", "entities_host",
  "entities_cluster", "entities_datastore", "entities_snapshot",
  "entities_health", "metrics_cache", "ui_state",
  "techinfo_imports", "techinfo_rows", "techinfo_latest",
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

export async function getUiState(id: string): Promise<UiState | undefined> {
  const db = await getDb();
  return db.get("ui_state", id);
}

export async function putUiState(state: UiState): Promise<void> {
  const db = await getDb();
  await db.put("ui_state", state);
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

export async function getAllTechInfoLatest(): Promise<TechInfoLatest[]> {
  const db = await getDb();
  const values = await db.getAll("techinfo_latest");
  return Promise.all(values.map((value) => hydrateTechInfoLatest(db, value)));
}

export async function getTechInfoLatestByVmNames(vmNames: string[]): Promise<TechInfoLatest[]> {
  if (vmNames.length === 0) return [];
  const db = await getDb();
  const uniqueNorm = [...new Set(vmNames.map((name) => name.trim().toLowerCase()).filter(Boolean))];
  const values = await Promise.all(uniqueNorm.map((vmNameNorm) => db.get("techinfo_latest", vmNameNorm)));
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
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const tx = db.transaction(storeName, "readwrite");
    for (const item of batch) {
      tx.store.put(item);
    }
    await tx.done;
  }
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
        const sampleBytes = sample.reduce((sum, value) => sum + JSON.stringify(value).length, 0);
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

async function deleteBySnapshotId(storeName: StoreName, snapshotId: string): Promise<void> {
  if (storeName === "snapshots" || storeName === "ui_state") return;
  const db = await getDb();
  const tx = db.transaction(storeName, "readwrite");
  const index = tx.store.index("snapshotId");
  let cursor = await index.openCursor(snapshotId);
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(ALL_STORES, "readwrite");
  for (const s of ALL_STORES) {
    tx.objectStore(s).clear();
  }
  await tx.done;
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const db = await getDb();
  await db.delete("snapshots", snapshotId);
  const entityStores: StoreName[] = [
    "rawSheets", "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
  ];
  await Promise.all(entityStores.map((store) => deleteBySnapshotId(store, snapshotId)));
}

async function deleteTechInfoRowsByImportId(techInfoImportId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("techinfo_rows", "readwrite");
  const index = tx.store.index("techInfoImportId");
  let cursor = await index.openCursor(techInfoImportId);
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
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
  const affectedVmNames = [...new Set(rows.map((row) => row.vmNameNorm).filter(Boolean))];

  await db.delete("techinfo_imports", techInfoImportId);
  await deleteTechInfoRowsByImportId(techInfoImportId);
  await Promise.all(affectedVmNames.map((vmNameNorm) => rebuildTechInfoLatestForVm(vmNameNorm)));
}
