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
} from "@/domain/models/types";

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
}

type StoreName = "snapshots" | "rawSheets" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state";

const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 12;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheets", "entities_vm", "entities_host",
  "entities_cluster", "entities_datastore", "entities_snapshot",
  "entities_health", "metrics_cache", "ui_state",
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

export async function getBySnapshotIds<T>(
  store: "entities_vm" | "entities_host" | "entities_cluster" | "entities_datastore" | "entities_snapshot" | "entities_health",
  snapshotIds: string[],
): Promise<T[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const results: T[] = [];
  for (const sid of snapshotIds) {
    const items = await db.getAllFromIndex(store, "snapshotId", sid);
    results.push(...(items as unknown as T[]));
  }
  return results;
}

/** Get raw sheet rows for specific snapshot+sheet combinations */
export async function getRawSheetRows(
  snapshotIds: string[],
  sheetName: string,
): Promise<SheetRow[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const results: SheetRow[] = [];
  for (const sid of snapshotIds) {
    const items = await db.getAllFromIndex("rawSheets", "snapshotId_sheetName", [sid, sheetName]);
    results.push(...items);
  }
  return results;
}

export async function batchPut<S extends StoreName>(
  storeName: S,
  items: RVToolsDBSchema[S]["value"][],
  batchSize = 2000,
): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const tx = db.transaction(storeName, "readwrite");
    for (const item of batch) {
      tx.store.put(item as any);
    }
    await tx.done;
  }
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
  for (const store of entityStores) {
    await deleteBySnapshotId(store, snapshotId);
  }
}
