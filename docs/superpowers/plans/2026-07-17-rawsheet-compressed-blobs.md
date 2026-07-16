# Rohdaten-Speicherung: komprimierte Sheet-Blobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-row `rawSheets`/`rawSheetHeaders` IndexedDB stores with one gzip-compressed blob per snapshot+sheet, cutting IndexedDB storage from ~3.4x raw XLSX size down to roughly raw size, and speeding up import, page switches, and snapshot deletion.

**Architecture:** A new `rawSheetBlobs` store holds one record per (snapshotId, sheetName): unconpressed `headers` + `rowCount` + a gzip-compressed `data: ArrayBuffer` containing `JSON.stringify(values: cell[][])`. A new `src/lib/compression.ts` module wraps the native `CompressionStream`/`DecompressionStream` APIs. The public read API (`getRawSheetRows`, `getRawSheetFieldNames`) keeps its exact signature, so none of the 26 existing `useRawSheet` call sites change. Because this is a storage-format swap with no user-facing behavior change, existing tests are adapted in place rather than duplicated — there's no parallel "old vs new" behavior to keep.

**Tech Stack:** TypeScript, `idb` (IndexedDB wrapper), Vitest + `fake-indexeddb`, native Web Streams (`CompressionStream`/`DecompressionStream`).

## Global Constraints

- No migration code for existing snapshots. On DB upgrade to v19, all RVTools snapshot data (`snapshots`, `entities_*`, `metrics_cache`, old raw stores) is cleared. Tech-Info, Tech-Info-Client, CDP, maintenance settings, and scenarios are untouched. (Design decision, confirmed with user.)
- `getRawSheetRows(snapshotIds, sheetName): Promise<SheetRow[]>` and `getRawSheetFieldNames(snapshotIds, sheetName): Promise<string[]>` must keep their exact signatures — 26 call sites across `src/pages/*`, `src/hooks/*` depend on them unchanged.
- Drop only these columns on import: `"VI SDK UUID"`, `"VI SDK Server type"`, `"VI SDK API Version"`. Keep `"VI SDK Server"` (used for vCenter display, e.g. `src/pages/ComplianceLifecycle.tsx:527`).
- `CompressionStream`/`DecompressionStream` are used natively — no new npm dependency. Verified available under both Node 24 (test runner) and the project's `jsdom` Vitest environment.
- **jsdom/Node realm gotcha (verified during planning):** in this project's Vitest environment, an `ArrayBuffer` produced via `new Response(stream).arrayBuffer()` fails `instanceof ArrayBuffer` checks against jsdom's global `ArrayBuffer` (cross-realm identity mismatch), even though the buffer's actual bytes and `byteLength` are correct and roundtrip through `fake-indexeddb` correctly. **Never assert `toBeInstanceOf(ArrayBuffer)` in tests in this codebase** — assert `byteLength` or the decompressed content instead. Do not use `new Blob([bytes]).stream()` either — jsdom's `Blob` has no `.stream()` method; build the source `ReadableStream` manually instead (see Task 1).

---

## Task 1: Compression helper module

**Files:**
- Create: `src/lib/compression.ts`
- Test: `src/test/compression.test.ts`

**Interfaces:**
- Produces: `gzipJson(value: unknown): Promise<ArrayBuffer>`, `gunzipJson<T>(buffer: ArrayBuffer): Promise<T>` — used by Task 2 (`src/data/db/index.ts`) and Task 3 (`src/domain/services/importService.ts`).

- [x] **Step 1: Write the failing test**

Create `src/test/compression.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gzipJson, gunzipJson } from "@/lib/compression";

describe("gzipJson/gunzipJson", () => {
  it("round-trips arrays of primitive values", async () => {
    const values = [
      ["APP01", 4, true, null],
      ["APP02", 2, false, null],
    ];
    const compressed = await gzipJson(values);
    expect(compressed.byteLength).toBeGreaterThan(0);
    const restored = await gunzipJson<typeof values>(compressed);
    expect(restored).toEqual(values);
  });

  it("compresses repetitive row data to well below its raw JSON size", async () => {
    const values = Array.from({ length: 200 }, (_, i) => [`vm-${i}`, "poweredOn", 4096]);
    const rawSize = JSON.stringify(values).length;
    const compressed = await gzipJson(values);
    expect(compressed.byteLength).toBeLessThan(rawSize / 2);
  });

  it("round-trips an empty array", async () => {
    const compressed = await gzipJson([]);
    await expect(gunzipJson<unknown[]>(compressed)).resolves.toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/compression.test.ts`
Expected: FAIL — cannot resolve module `@/lib/compression` (file doesn't exist yet).

- [x] **Step 3: Write minimal implementation**

Create `src/lib/compression.ts`:

```ts
function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * gzip-Kompression für JSON-serialisierbare Werte, genutzt zur kompakten
 * IndexedDB-Ablage roher RVTools-Sheet-Daten (siehe `RawSheetBlob`).
 */
export async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const stream = bytesToStream(bytes).pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function gunzipJson<T>(buffer: ArrayBuffer): Promise<T> {
  const stream = bytesToStream(new Uint8Array(buffer)).pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(stream).text();
  return JSON.parse(json) as T;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/compression.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/compression.ts src/test/compression.test.ts
git commit -m "feat: add gzip JSON compression helper for IndexedDB blobs"
```

---

## Task 2: DB schema v19 — compressed raw-sheet blob store

**Files:**
- Modify: `src/domain/models/types.ts`
- Modify: `src/data/db/index.ts`
- Modify: `src/data/db/index.test.ts`
- Modify: `src/hooks/useActiveSnapshots.test.tsx`

**Interfaces:**
- Consumes: `gzipJson`, `gunzipJson` from `@/lib/compression` (Task 1).
- Produces: `RawSheetBlob` type; `putRawSheetBlob(blob: RawSheetBlob): Promise<void>`; `getRawSheetRows(snapshotIds: string[], sheetName: string): Promise<SheetRow[]>` (signature unchanged); `getRawSheetFieldNames(snapshotIds: string[], sheetName: string): Promise<string[]>` (signature unchanged) — all consumed by Task 3 and by the 26 existing `useRawSheet`/page call sites (untouched).

### Step 1: Update tests to the target (blob-based) API — TDD red step

- [x] **1a. Rewrite `getRawSheetFieldNames` test and `deleteSnapshot`/`estimateSnapshotSizesBytes` tests in `src/data/db/index.test.ts`**

Replace the `getRawSheetFieldNames` describe block:

```ts
describe("getRawSheetFieldNames", () => {
  it("returns raw sheet field names without reading full sheet rows", async () => {
    const { getDb, getRawSheetFieldNames } = await import("./index");
    const { gzipJson } = await import("@/lib/compression");
    const db = await getDb();

    await db.put("rawSheetBlobs", {
      snapshotId: "snap-1",
      sheetName: "vDisk",
      headers: ["VM", "Disk", "Capacity MiB"],
      rowCount: 2,
      codec: "gzip-json-v1",
      data: await gzipJson([
        ["APP01", "Hard disk 1", 1024],
        ["APP02", "Hard disk 1", 2048],
      ]),
    });
    await db.put("rawSheetBlobs", {
      snapshotId: "snap-2",
      sheetName: "vDisk",
      headers: ["VM", "Datastore"],
      rowCount: 1,
      codec: "gzip-json-v1",
      data: await gzipJson([["APP03", "DS01"]]),
    });

    await expect(getRawSheetFieldNames(["snap-1", "snap-2"], "vDisk")).resolves.toEqual([
      "Capacity MiB",
      "Datastore",
      "Disk",
      "VM",
    ]);
  });
});
```

Replace the `deleteSnapshot` describe block's `seedSnapshot` helper and its two tests:

```ts
describe("deleteSnapshot", () => {
  const seedSnapshot = async (dbModule: typeof import("./index"), snapshotId: string, rowCount: number) => {
    const { putSnapshot, batchPut, getDb } = dbModule;
    const { gzipJson } = await import("@/lib/compression");
    await putSnapshot({
      snapshotId,
      vcenterId: `vc-${snapshotId}`,
      vcenterDisplayName: "Test vCenter",
      exportTs: "2026-01-01T00:00:00.000Z",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: `${snapshotId}.xlsx`,
      fileChecksum: `chk-${snapshotId}`,
      sheetStats: { vInfo: { rowCount, columnCount: 2 } },
    });
    const db = await getDb();
    const values = Array.from({ length: rowCount }, (_, i) => [`vm-${i}`, "poweredOn"]);
    await db.put("rawSheetBlobs", {
      snapshotId,
      sheetName: "vInfo",
      headers: ["VM", "Powerstate"],
      rowCount,
      codec: "gzip-json-v1",
      data: await gzipJson(values),
    });
    await batchPut("entities_vm", Array.from({ length: 5 }, (_, i) => ({
      vmKey: `vm-${i}::vc-${snapshotId}`,
      snapshotId,
      vmName: `vm-${i}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testdaten benötigen nicht alle NormalizedVm-Felder
    })) as any);
  };

  it("deletes the raw sheet blob and entities of one snapshot, keeps others, and reports monotonic progress up to 100", async () => {
    const dbModule = await import("./index");
    const { deleteSnapshot, getSnapshots, getRawSheetRows, getBySnapshotIds } = dbModule;
    // Zeilenreiche Sheets, um zu bestätigen, dass Kompression/Dekompression auch bei
    // realistischer Größe funktioniert — die Löschung selbst ist unabhängig von rowCount,
    // da ein Blob immer ein einziger Record ist.
    await seedSnapshot(dbModule, "snap-del", 6001);
    await seedSnapshot(dbModule, "snap-keep", 10);

    const percents: number[] = [];
    await deleteSnapshot("snap-del", (p) => percents.push(p.percent));

    expect(percents.length).toBeGreaterThan(1);
    expect(percents.at(-1)).toBe(100);
    expect([...percents]).toEqual([...percents].sort((a, b) => a - b));

    const snapshots = await getSnapshots();
    expect(snapshots.map((s) => s.snapshotId)).toEqual(["snap-keep"]);
    await expect(getRawSheetRows(["snap-del"], "vInfo")).resolves.toHaveLength(0);
    await expect(getRawSheetRows(["snap-keep"], "vInfo")).resolves.toHaveLength(10);
    await expect(getBySnapshotIds("entities_vm", ["snap-del"])).resolves.toHaveLength(0);
    await expect(getBySnapshotIds("entities_vm", ["snap-keep"])).resolves.toHaveLength(5);
  }, 20000);

  it("estimates a plausible, compressed per-snapshot size and clears everything via deleteAllData with progress", async () => {
    const dbModule = await import("./index");
    const { deleteAllData, estimateSnapshotSizesBytes, getSnapshots, getRawSheetRows } = dbModule;
    await seedSnapshot(dbModule, "snap-1", 500);

    const sizes = await estimateSnapshotSizesBytes(["snap-1", "snap-unbekannt"]);
    // Verifiziert gegen echte gzip-Kompression dieser Testdaten (~1.2-1.7 KB) —
    // deutlich unter dem, was 500 unkomprimierte Zeilen bräuchten (>5000 Bytes).
    expect(sizes["snap-1"]).toBeGreaterThan(500);
    expect(sizes["snap-1"]).toBeLessThan(5000);
    expect(sizes["snap-unbekannt"]).toBe(0);

    const percents: number[] = [];
    await deleteAllData((p) => percents.push(p.percent));
    expect(percents.at(-1)).toBe(100);

    await expect(getSnapshots()).resolves.toHaveLength(0);
    await expect(getRawSheetRows(["snap-1"], "vInfo")).resolves.toHaveLength(0);
  });
});
```

- [x] **1b. Rewrite the raw-sheet seeding in `src/hooks/useActiveSnapshots.test.tsx`**

Change the import line (around line 5):

```ts
import { batchPut, deleteAllData, getDb, putSnapshot } from "@/data/db";
```

Replace the seeding block inside `describe("useRawSheet", ...)`:

```ts
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    const { gzipJson } = await import("@/lib/compression");
    const db = await getDb();
    await db.put("rawSheetBlobs", {
      snapshotId: "snap-1",
      sheetName: "vCPU",
      headers: ["VM", "CPUs"],
      rowCount: 2,
      codec: "gzip-json-v1",
      data: await gzipJson([
        ["APP-01", 2],
        ["DB-02", 4],
      ]),
    });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/db/index.test.ts src/hooks/useActiveSnapshots.test.tsx`
Expected: FAIL — `rawSheetBlobs` is not a known object store yet (IndexedDB throws `NotFoundError: One of the specified object stores was not found`), and `putRawSheetBlob`/`getRawSheetFieldNames` still read from the old `rawSheets`/`rawSheetHeaders` stores.

### Step 3: Implement the schema and CRUD changes

- [x] **3a. Update `src/domain/models/types.ts`**

Replace the `StoredSheetRow`/`RawSheetHeader` block (currently right after the `SheetRow` interface):

```ts
export interface StoredSheetRow {
  snapshotId: SnapshotId;
  sheetName: string;
  rowIndex: number;
  values: (string | number | boolean | null)[];
}

export interface RawSheetHeader {
  snapshotId: SnapshotId;
  sheetName: string;
  headers: string[];
}
```

with:

```ts
/**
 * Komprimierter Rohdaten-Blob eines Snapshot+Sheets (ab v19): ein Record statt einer
 * Zeile pro Record. `headers` bleibt unkomprimiert für Feldnamen-Abfragen ohne
 * Dekompression; `data` ist `gzipJson(values)` (siehe `src/lib/compression.ts`).
 */
export interface RawSheetBlob {
  snapshotId: SnapshotId;
  sheetName: string;
  headers: string[];
  rowCount: number;
  codec: "gzip-json-v1";
  data: ArrayBuffer;
}
```

- [x] **3b. Update imports in `src/data/db/index.ts`**

Replace:

```ts
import type {
  SnapshotMeta,
  SheetRow,
  StoredSheetRow,
  RawSheetHeader,
  NormalizedVm,
```

with:

```ts
import type {
  SnapshotMeta,
  SheetRow,
  RawSheetBlob,
  NormalizedVm,
```

Add after the existing `parseHelpers` import:

```ts
import { gunzipJson } from "@/lib/compression";
```

- [x] **3c. Update the schema interface**

Replace:

```ts
  rawSheets: {
    key: [string, string, number];
    // StoredSheetRow = kompaktes Format (ab DB v17). SheetRow = Alt-Format mit `data`-Record,
    // das für vor v17 importierte Snapshots weiterhin gelesen werden muss.
    value: StoredSheetRow | SheetRow;
    indexes: { snapshotId: string; sheetName: string; "snapshotId_sheetName": [string, string] };
  };
  rawSheetHeaders: {
    key: [string, string];
    value: RawSheetHeader;
    indexes: { snapshotId: string };
  };
```

with:

```ts
  rawSheetBlobs: {
    key: [string, string];
    // Ein gzip-komprimierter Blob pro Snapshot+Sheet (ab v19) statt einer Zeile pro Record —
    // siehe docs/superpowers/specs/2026-07-17-rawsheet-compressed-blobs-design.md.
    value: RawSheetBlob;
    indexes: { snapshotId: string };
  };
```

- [x] **3d. Update `StoreName` and `SnapshotScopedStoreName`**

Replace:

```ts
export type StoreName = "snapshots" | "rawSheets" | "rawSheetHeaders" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest"
  | "techinfo_client_imports" | "techinfo_client_rows" | "techinfo_client_latest"
  | "cdp_imports" | "cdp_rows" | "cdp_latest"
  | "maintenance_settings"
  | "maintenance_cluster_assignments" | "scenarios";
type SnapshotScopedStoreName = "rawSheets" | "rawSheetHeaders" | "entities_vm" | "entities_host" | "entities_cluster"
  | "entities_datastore" | "entities_snapshot" | "entities_health" | "metrics_cache";
```

with:

```ts
export type StoreName = "snapshots" | "rawSheetBlobs" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest"
  | "techinfo_client_imports" | "techinfo_client_rows" | "techinfo_client_latest"
  | "cdp_imports" | "cdp_rows" | "cdp_latest"
  | "maintenance_settings"
  | "maintenance_cluster_assignments" | "scenarios";
type SnapshotScopedStoreName = "rawSheetBlobs" | "entities_vm" | "entities_host" | "entities_cluster"
  | "entities_datastore" | "entities_snapshot" | "entities_health" | "metrics_cache";
```

- [x] **3e. Bump `DB_VERSION` and update `ALL_STORES`**

Replace:

```ts
const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 18;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheets", "rawSheetHeaders", "entities_vm", "entities_host",
```

with:

```ts
const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 19;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheetBlobs", "entities_vm", "entities_host",
```

(the rest of the `ALL_STORES` array is unchanged)

- [x] **3f. Update the `upgrade()` handler**

Replace:

```ts
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
        // v17: Spaltenüberschriften der Rohdaten werden einmal pro Snapshot+Sheet abgelegt,
        // damit die Zeilen kompakt als Wert-Arrays gespeichert werden können.
        if (!db.objectStoreNames.contains("rawSheetHeaders")) {
          const headers = db.createObjectStore("rawSheetHeaders", { keyPath: ["snapshotId", "sheetName"] });
          headers.createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_vm")) {
```

with:

```ts
    dbPromise = openDB<RVToolsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // Clean slate migration from old Dexie or older idb versions
        if (oldVersion < 12) {
          const existing = Array.from(db.objectStoreNames);
          for (const name of existing) db.deleteObjectStore(name);
        }

        // v19: rawSheets/rawSheetHeaders (eine Zeile pro Record) weichen komprimierten
        // Sheet-Blobs (rawSheetBlobs, ein Record pro Snapshot+Sheet). Migrationscode lohnt
        // sich für dieses interne Tool nicht — bestehende RVTools-Snapshots werden geleert,
        // Tech-Info/CDP/Wartung/Szenarien bleiben erhalten. Nutzer importieren neu.
        if (oldVersion > 0 && oldVersion < 19) {
          const storesToClear = [
            "snapshots", "entities_vm", "entities_host", "entities_cluster",
            "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
          ] as const;
          for (const storeName of storesToClear) {
            if (db.objectStoreNames.contains(storeName)) {
              transaction.objectStore(storeName).clear();
            }
          }
          if (db.objectStoreNames.contains("rawSheets")) db.deleteObjectStore("rawSheets");
          if (db.objectStoreNames.contains("rawSheetHeaders")) db.deleteObjectStore("rawSheetHeaders");
        }

        if (!db.objectStoreNames.contains("snapshots")) {
          const snap = db.createObjectStore("snapshots", { keyPath: "snapshotId" });
          snap.createIndex("vcenterId", "vcenterId");
          snap.createIndex("exportTs", "exportTs");
          snap.createIndex("fileChecksum", "fileChecksum");
        }
        if (!db.objectStoreNames.contains("rawSheetBlobs")) {
          const blobs = db.createObjectStore("rawSheetBlobs", { keyPath: ["snapshotId", "sheetName"] });
          blobs.createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_vm")) {
```

- [x] **3g. Replace `hydrateSheetRow` and the raw-sheet read/write functions**

Replace:

```ts
/**
 * Führt eine gespeicherte Zeile in die hydratisierte {@link SheetRow}-Form zurück.
 * Kompaktes Format (ab v17): Werte werden per `headers` auf Spaltennamen abgebildet.
 * Alt-Format (vor v17): der `data`-Record wird unverändert übernommen.
 */
function hydrateSheetRow(row: StoredSheetRow | SheetRow, headers: readonly string[] | undefined): SheetRow {
  if ("data" in row) return row;
  const data: SheetRow["data"] = {};
  const cols = headers ?? [];
  for (let i = 0; i < cols.length; i++) {
    data[cols[i]] = row.values[i] ?? null;
  }
  return { snapshotId: row.snapshotId, sheetName: row.sheetName, rowIndex: row.rowIndex, data };
}

/** Get raw sheet rows for specific snapshot+sheet combinations */
export async function getRawSheetRows(
  snapshotIds: string[],
  sheetName: string,
): Promise<SheetRow[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map(async (sid) => {
      const [rows, header] = await Promise.all([
        db.getAllFromIndex("rawSheets", "snapshotId_sheetName", [sid, sheetName]),
        db.get("rawSheetHeaders", [sid, sheetName]),
      ]);
      return rows.map((row) => hydrateSheetRow(row, header?.headers));
    }),
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
      const header = await db.get("rawSheetHeaders", [sid, sheetName]);
      if (header) {
        for (const key of header.headers) keys.add(key);
        return;
      }
      // Alt-Format (vor v17): Spalten aus der ersten Zeile ableiten.
      const row = await db.get("rawSheets", [sid, sheetName, 0]);
      if (row && "data" in row) {
        for (const key of Object.keys(row.data)) keys.add(key);
      }
    }),
  );

  return [...keys].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }));
}
```

with:

```ts
/** Bildet die entkomprimierten Werte-Zeilen eines Blobs auf die hydratisierte {@link SheetRow}-Form ab. */
function hydrateSheetRows(
  snapshotId: string,
  sheetName: string,
  headers: readonly string[],
  values: readonly (string | number | boolean | null)[][],
): SheetRow[] {
  return values.map((rowValues, rowIndex) => {
    const data: SheetRow["data"] = {};
    for (let i = 0; i < headers.length; i++) {
      data[headers[i]] = rowValues[i] ?? null;
    }
    return { snapshotId, sheetName, rowIndex, data };
  });
}

export async function putRawSheetBlob(blob: RawSheetBlob): Promise<void> {
  const db = await getDb();
  await db.put("rawSheetBlobs", blob);
}

/** Get raw sheet rows for specific snapshot+sheet combinations */
export async function getRawSheetRows(
  snapshotIds: string[],
  sheetName: string,
): Promise<SheetRow[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map(async (sid) => {
      const blob = await db.get("rawSheetBlobs", [sid, sheetName]);
      if (!blob) return [];
      const values = await gunzipJson<(string | number | boolean | null)[][]>(blob.data);
      return hydrateSheetRows(sid, sheetName, blob.headers, values);
    }),
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
      const blob = await db.get("rawSheetBlobs", [sid, sheetName]);
      if (!blob) return;
      for (const key of blob.headers) keys.add(key);
    }),
  );

  return [...keys].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }));
}
```

- [x] **3h. Remove the now-unused `batchPutRawSheetHeaders` export**

Delete this function entirely (it sat right after `batchPut`):

```ts
export async function batchPutRawSheetHeaders(items: RawSheetHeader[], batchSize = 500): Promise<void> {
  await batchPut("rawSheetHeaders", items, batchSize);
}
```

- [x] **3i. Add a byte-size helper and use it in diagnostics**

Replace:

```ts
export interface StoreDiagnostics {
  storeName: StoreName;
  count: number;
  /** Hochgerechnete Schätzung basierend auf einer Stichprobe — kein exakter Byte-Wert. */
  estimatedSizeBytes: number;
}

export async function getStoreDiagnostics(sampleSize = 50): Promise<StoreDiagnostics[]> {
```

with:

```ts
/**
 * Byte-Schätzung eines Store-Eintrags. `rawSheetBlobs` enthält ein `ArrayBuffer` in `data`,
 * das `JSON.stringify` nicht sinnvoll erfasst (ergibt `"{}"`) — dafür wird `byteLength` direkt
 * verwendet, was hier sogar einen exakten statt geschätzten Wert liefert.
 */
function estimateEntryBytes(storeName: StoreName, value: unknown): number {
  if (storeName === "rawSheetBlobs") {
    const blob = value as RawSheetBlob;
    return blob.data.byteLength + JSON.stringify(blob.headers).length + 64;
  }
  return JSON.stringify(value).length;
}

export interface StoreDiagnostics {
  storeName: StoreName;
  count: number;
  /** Hochgerechnete Schätzung basierend auf einer Stichprobe — kein exakter Byte-Wert (Ausnahme: `rawSheetBlobs`, dort exakt). */
  estimatedSizeBytes: number;
}

export async function getStoreDiagnostics(sampleSize = 50): Promise<StoreDiagnostics[]> {
```

Within the same function, replace:

```ts
        const sampleBytes = sample.reduce<number>((sum, value) => sum + JSON.stringify(value).length, 0);
        const avgBytesPerEntry = sampleBytes / sample.length;
```

with:

```ts
        const sampleBytes = sample.reduce<number>((sum, value) => sum + estimateEntryBytes(storeName, value), 0);
        const avgBytesPerEntry = sampleBytes / sample.length;
```

- [x] **3j. Use the same helper in `estimateSizeByIndex`**

Replace:

```ts
  const sample: unknown[] = await anyDb.getAllFromIndex(storeName, indexName, key, SIZE_SAMPLE_COUNT);
  if (sample.length === 0) return 0;
  const sampleBytes = sample.reduce<number>((sum, value) => sum + JSON.stringify(value).length, 0);
  return Math.round((sampleBytes / sample.length) * count);
```

with:

```ts
  const sample: unknown[] = await anyDb.getAllFromIndex(storeName, indexName, key, SIZE_SAMPLE_COUNT);
  if (sample.length === 0) return 0;
  const sampleBytes = sample.reduce<number>((sum, value) => sum + estimateEntryBytes(storeName, value), 0);
  return Math.round((sampleBytes / sample.length) * count);
```

- [x] **3k. Update `estimateSnapshotSizesBytes`'s scoped store list**

Replace:

```ts
  const scopedStores: SnapshotScopedStoreName[] = [
    "rawSheets", "rawSheetHeaders", "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
  ];
```

with:

```ts
  const scopedStores: SnapshotScopedStoreName[] = [
    "rawSheetBlobs", "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
  ];
```

- [x] **3l. Update `STORE_DELETE_LABELS`**

Replace:

```ts
const STORE_DELETE_LABELS: Record<StoreName, string> = {
  snapshots: "Snapshot-Metadaten",
  rawSheets: "Rohdaten (Sheets)",
  rawSheetHeaders: "Rohdaten-Spalten",
  entities_vm: "VMs",
```

with:

```ts
const STORE_DELETE_LABELS: Record<StoreName, string> = {
  snapshots: "Snapshot-Metadaten",
  rawSheetBlobs: "Rohdaten (Sheets)",
  entities_vm: "VMs",
```

- [x] **3m. Update `deleteByKeyPrefix`'s type signature**

Replace:

```ts
async function deleteByKeyPrefix(
  storeName: "rawSheets" | "rawSheetHeaders" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows",
```

with:

```ts
async function deleteByKeyPrefix(
  storeName: "rawSheetBlobs" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows",
```

- [x] **3n. Update `deleteSnapshot`'s store lists**

Replace:

```ts
  const prefixStores = ["rawSheets", "rawSheetHeaders", "metrics_cache"] as const;
```

with:

```ts
  const prefixStores = ["rawSheetBlobs", "metrics_cache"] as const;
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/db/index.test.ts src/hooks/useActiveSnapshots.test.tsx`
Expected: PASS (all tests in both files)

- [x] **Step 5: Run the full test suite and typecheck to catch any other reference to removed names**

Run: `npx vitest run && npm run typecheck`
Expected: FAIL at this point — `src/domain/services/importService.ts` and `src/test/importService.test.ts` still reference `persistAllowedRawSheetRows`, `batchPutRawSheetHeaders`, `StoredSheetRow`, `RawSheetHeader`. This is expected; Task 3 fixes it. Confirm the *only* failures are in those two files before proceeding.

- [x] **Step 6: Commit**

```bash
git add src/domain/models/types.ts src/data/db/index.ts src/data/db/index.test.ts src/hooks/useActiveSnapshots.test.tsx
git commit -m "feat: store raw RVTools sheets as compressed blobs (DB v19)"
```

---

## Task 3: Import pipeline — persist compressed blobs, drop VI SDK noise columns

**Files:**
- Modify: `src/domain/services/importService.ts`
- Modify: `src/test/importService.test.ts`

**Interfaces:**
- Consumes: `putRawSheetBlob`, `RawSheetBlob` (Task 2); `gzipJson`, `gunzipJson` (Task 1).
- Produces: `persistRawSheetBlobs(options): Promise<number>` (replaces `persistAllowedRawSheetRows`), used by `importRvtoolsParsed`.

### Step 1: Update the test file to the target API — TDD red step

- [x] **1a. Update imports in `src/test/importService.test.ts`**

Replace:

```ts
import { persistAllowedRawSheetRows, normalizeSnapshots } from "@/domain/services/importService";
```

with:

```ts
import { persistRawSheetBlobs, normalizeSnapshots } from "@/domain/services/importService";
import { gunzipJson } from "@/lib/compression";
import type { RawSheetBlob } from "@/domain/models/types";
```

- [x] **1b. Replace the `persistAllowedRawSheetRows` describe block**

Replace the entire `describe("persistAllowedRawSheetRows", ...)` block with:

```ts
describe("persistRawSheetBlobs", () => {
  it("persists only allow-listed sheets as one compressed blob per sheet, dropping denylisted columns", async () => {
    const sheets: ParsedSheetData[] = [
      {
        sheetName: "vInfo",
        headers: ["VM", "VI SDK UUID"],
        rows: [
          { VM: "APP01", "VI SDK UUID": "uuid-a" },
          { VM: "APP02", "VI SDK UUID": "uuid-b" },
        ],
      },
      {
        sheetName: "vUnknown",
        headers: ["Ignored"],
        rows: [{ Ignored: "x" }],
      },
    ];
    const putBlobs: RawSheetBlob[] = [];

    const persisted = await persistRawSheetBlobs({
      sheets,
      snapshotId: "snap-1",
      putBlob: async (blob) => {
        putBlobs.push(blob);
      },
    });

    expect(persisted).toBe(2);
    expect(putBlobs).toHaveLength(1);
    expect(putBlobs[0].sheetName).toBe("vInfo");
    expect(putBlobs[0].headers).toEqual(["VM"]);
    expect(putBlobs[0].rowCount).toBe(2);
    expect(putBlobs[0].codec).toBe("gzip-json-v1");

    const values = await gunzipJson<unknown[][]>(putBlobs[0].data);
    expect(values).toEqual([["APP01"], ["APP02"]]);
  });

  it("stores each sheet as a single compressed blob and rehydrates every column, including ones only present in later rows", async () => {
    const { persistRawSheetBlobs } = await import("@/domain/services/importService");
    const { getRawSheetRows, getRawSheetFieldNames, getDb } = await import("@/data/db");
    const sheets: ParsedSheetData[] = [
      {
        sheetName: "vInfo",
        // headers stammt (wie im Parser) nur aus Zeile 0 – "Notes" fehlt hier bewusst.
        headers: ["VM", "CPUs"],
        rows: [
          { VM: "APP01", CPUs: 4 },
          { VM: "APP02", CPUs: 2, Notes: "extra" },
        ],
      },
    ];

    await persistRawSheetBlobs({ sheets, snapshotId: "snap-compact" });

    const db = await getDb();
    const blob = await db.get("rawSheetBlobs", ["snap-compact", "vInfo"]);
    expect(blob?.headers).toEqual(["VM", "CPUs", "Notes"]);
    expect(blob?.rowCount).toBe(2);

    const rows = await getRawSheetRows(["snap-compact"], "vInfo");
    expect(rows).toHaveLength(2);
    expect(rows[0].data).toEqual({ VM: "APP01", CPUs: 4, Notes: null });
    expect(rows[1].data).toEqual({ VM: "APP02", CPUs: 2, Notes: "extra" });

    await expect(getRawSheetFieldNames(["snap-compact"], "vInfo")).resolves.toEqual([
      "CPUs",
      "Notes",
      "VM",
    ]);
  });
});
```

- [x] **1c. Update the "reports detailed progress" assertion**

In `describe("importRvtoolsXlsx", ...)`, replace:

```ts
    expect(progress).toContainEqual(expect.objectContaining({
      step: "Rohdaten speichern",
      detail: expect.stringContaining("Zeilen"),
    }));
```

with:

```ts
    expect(progress).toContainEqual(expect.objectContaining({
      step: "Rohdaten speichern",
      detail: expect.stringContaining("Sheets"),
    }));
```

- [x] **1d. Update the "removes partial raw data when entity persistence fails" test**

Replace:

```ts
  it("removes partial raw data when entity persistence fails", async () => {
    installParserWorkerStub();
    const db = await import("@/data/db");
    const originalBatchPut = db.batchPut;
    let batchPutCalls = 0;
    vi.spyOn(db, "batchPut").mockImplementation(async (...args) => {
      batchPutCalls += 1;
      if (batchPutCalls === 2) throw new Error("IndexedDB quota exceeded");
      await originalBatchPut(...args);
    });
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");

    const result = await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    ));

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Import für vcsa01.lab.local fehlgeschlagen"));
    expect(result.errors).toContainEqual(expect.stringContaining("IndexedDB quota exceeded"));
    expect(await db.getSnapshots()).toEqual([]);
    expect(await (await db.getDb()).getAll("rawSheets")).toEqual([]);
  });
```

with:

```ts
  it("removes the persisted raw sheet blob when entity persistence fails", async () => {
    installParserWorkerStub();
    const db = await import("@/data/db");
    const originalBatchPut = db.batchPut;
    let batchPutCalls = 0;
    // Rohdaten-Persistenz läuft nicht mehr über batchPut (siehe persistRawSheetBlobs),
    // daher ist der erste batchPut-Aufruf bereits die erste Entitäten-Batch (entities_vm).
    // Das Blob wurde zu diesem Zeitpunkt schon erfolgreich geschrieben — der Test prüft,
    // dass der Rollback es trotzdem wieder entfernt.
    vi.spyOn(db, "batchPut").mockImplementation(async (...args) => {
      batchPutCalls += 1;
      if (batchPutCalls === 1) throw new Error("IndexedDB quota exceeded");
      await originalBatchPut(...args);
    });
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");

    const result = await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    ));

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Import für vcsa01.lab.local fehlgeschlagen"));
    expect(result.errors).toContainEqual(expect.stringContaining("IndexedDB quota exceeded"));
    expect(await db.getSnapshots()).toEqual([]);
    expect(await (await db.getDb()).getAll("rawSheetBlobs")).toEqual([]);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/importService.test.ts`
Expected: FAIL — `persistRawSheetBlobs` is not exported yet; the "VI SDK UUID" column isn't dropped yet; `db.get("rawSheetBlobs", ...)` errors because the store isn't populated (import service still writes to the old shape internally, if it compiles at all).

### Step 3: Implement the import-side changes

- [x] **3a. Update imports at the top of `src/domain/services/importService.ts`**

Replace:

```ts
import {
  getSnapshotsByChecksum,
  getSnapshotsByVcenterId,
  putSnapshot,
  batchPut,
  batchPutRawSheetHeaders,
  deleteSnapshot,
```

with:

```ts
import {
  getSnapshotsByChecksum,
  getSnapshotsByVcenterId,
  putSnapshot,
  batchPut,
  putRawSheetBlob,
  deleteSnapshot,
```

Add right after the `parseHelpers` import:

```ts
import { gzipJson } from "@/lib/compression";
```

Replace the `StoredSheetRow, RawSheetHeader,` line in the `types` import block with `RawSheetBlob,`.

- [x] **3b. Add the column denylist right after `RAW_SHEET_ALLOWLIST`**

Add after the `RAW_SHEET_ALLOWLIST` constant:

```ts

/**
 * Spalten, die pro vCenter konstant und in jeder Zeile jedes Sheets vorhanden, aber ohne
 * Analysewert sind — reiner Speicher-Overhead. `VI SDK Server` bleibt (wird für die
 * vCenter-Anzeige gebraucht, z. B. `src/pages/ComplianceLifecycle.tsx`).
 */
const RAW_SHEET_COLUMN_DENYLIST: ReadonlySet<string> = new Set([
  "VI SDK UUID",
  "VI SDK Server type",
  "VI SDK API Version",
]);
```

- [x] **3c. Apply the denylist in `buildRawHeaderUnion`**

Replace:

```ts
  const add = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    headers.push(key);
  };
```

with:

```ts
  const add = (key: string) => {
    if (seen.has(key) || RAW_SHEET_COLUMN_DENYLIST.has(key)) return;
    seen.add(key);
    headers.push(key);
  };
```

- [x] **3d. Replace the options interface**

Replace:

```ts
interface PersistRawSheetRowsOptions {
  sheets: ParsedSheetData[];
  snapshotId: string;
  batchSize?: number;
  putBatch?: (rows: StoredSheetRow[]) => Promise<void>;
  putHeaders?: (headers: RawSheetHeader[]) => Promise<void>;
  onBatchPersisted?: (persistedRows: number) => void;
}
```

with:

```ts
interface PersistRawSheetBlobsOptions {
  sheets: ParsedSheetData[];
  snapshotId: string;
  putBlob?: (blob: RawSheetBlob) => Promise<void>;
  onSheetPersisted?: (sheetName: string, sheetIndex: number, totalSheets: number) => void;
}
```

- [x] **3e. Replace `persistAllowedRawSheetRows` with `persistRawSheetBlobs`**

Replace the whole function body:

```ts
export async function persistAllowedRawSheetRows({
  sheets,
  snapshotId,
  batchSize = 5000,
  putBatch = (rows) => batchPut("rawSheets", rows, batchSize),
  putHeaders = (headers) => batchPutRawSheetHeaders(headers),
  onBatchPersisted,
}: PersistRawSheetRowsOptions): Promise<number> {
  const headerRecords: RawSheetHeader[] = [];
  let batch: StoredSheetRow[] = [];
  const batches: StoredSheetRow[][] = [];
  let persistedRows = 0;

  const queueBatch = () => {
    if (batch.length === 0) return;
    const currentBatch = batch;
    batch = [];
    batches.push(currentBatch);
  };

  for (const sheet of sheets) {
    if (!RAW_SHEET_ALLOWLIST.has(sheet.sheetName)) continue;
    const headers = buildRawHeaderUnion(sheet);
    headerRecords.push({ snapshotId, sheetName: sheet.sheetName, headers });
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      batch.push({
        snapshotId,
        sheetName: sheet.sheetName,
        rowIndex: i,
        values: headers.map((header) => toRawCellValue(row[header])),
      });
      if (batch.length >= batchSize) queueBatch();
    }
  }

  queueBatch();
  // Header zuerst persistieren: ohne sie lassen sich die kompakten Wert-Arrays nicht lesen.
  if (headerRecords.length > 0) await putHeaders(headerRecords);
  await runSequential(batches, async (currentBatch) => {
    await putBatch(currentBatch);
    persistedRows += currentBatch.length;
    onBatchPersisted?.(persistedRows);
  });
  return persistedRows;
}
```

with:

```ts
export async function persistRawSheetBlobs({
  sheets,
  snapshotId,
  putBlob = (blob) => putRawSheetBlob(blob),
  onSheetPersisted,
}: PersistRawSheetBlobsOptions): Promise<number> {
  const allowedSheets = sheets.filter((sheet) => RAW_SHEET_ALLOWLIST.has(sheet.sheetName));
  let persistedRows = 0;

  await runSequential(allowedSheets, async (sheet, index) => {
    const headers = buildRawHeaderUnion(sheet);
    const values = sheet.rows.map((row) => headers.map((header) => toRawCellValue(row[header])));
    const data = await gzipJson(values);
    await putBlob({
      snapshotId,
      sheetName: sheet.sheetName,
      headers,
      rowCount: sheet.rows.length,
      codec: "gzip-json-v1",
      data,
    });
    persistedRows += sheet.rows.length;
    onSheetPersisted?.(sheet.sheetName, index + 1, allowedSheets.length);
  });

  return persistedRows;
}
```

- [x] **3f. Update the call site in `importRvtoolsParsed`**

Replace:

```ts
  const rawRowsTotal = parsed.sheets.reduce(
    (sum, sheet) => sum + (RAW_SHEET_ALLOWLIST.has(sheet.sheetName) ? sheet.rows.length : 0),
    0,
  );
  try {
    report("Rohdaten speichern", 45, `${vcenterDisplayName}: ${rawRowsTotal.toLocaleString("de-DE")} von ${totalRows.toLocaleString("de-DE")} Zeilen...`);
    await persistAllowedRawSheetRows({
      sheets: parsed.sheets,
      snapshotId,
      onBatchPersisted: (persistedRows) => {
        const pct = 45 + Math.round((persistedRows / Math.max(rawRowsTotal, 1)) * 25);
        report(
          "Rohdaten speichern",
          Math.min(pct, 69),
          `${vcenterDisplayName}: ${persistedRows.toLocaleString("de-DE")} / ${rawRowsTotal.toLocaleString("de-DE")} Zeilen`,
        );
      },
    });
```

with:

```ts
  const rawSheetsTotal = parsed.sheets.filter((sheet) => RAW_SHEET_ALLOWLIST.has(sheet.sheetName)).length;
  try {
    report("Rohdaten speichern", 45, `${vcenterDisplayName}: ${rawSheetsTotal} Sheets...`);
    await persistRawSheetBlobs({
      sheets: parsed.sheets,
      snapshotId,
      onSheetPersisted: (sheetName, sheetIndex, totalSheets) => {
        const pct = 45 + Math.round((sheetIndex / Math.max(totalSheets, 1)) * 25);
        report(
          "Rohdaten speichern",
          Math.min(pct, 69),
          `${vcenterDisplayName}: ${sheetName} (${sheetIndex}/${totalSheets})`,
        );
      },
    });
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/importService.test.ts`
Expected: PASS (all tests)

- [x] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS — no remaining references to `StoredSheetRow`, `RawSheetHeader`, `persistAllowedRawSheetRows`, `batchPutRawSheetHeaders`, `"rawSheets"`, or `"rawSheetHeaders"` anywhere in `src/`.

- [x] **Step 6: Commit**

```bash
git add src/domain/services/importService.ts src/test/importService.test.ts
git commit -m "feat: persist raw RVTools sheets as compressed blobs, drop VI SDK noise columns"
```

---

## Task 4: End-to-end verification with real RVTools exports

**Files:** none (manual verification only)

**Interfaces:**
- Consumes: the full import pipeline from Tasks 1-3.

- [x] **Step 1: Run the full automated check**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all three pass cleanly.

- [x] **Step 2: Manually verify storage in the browser**

```bash
npm run dev
```

Open the app (default Vite port, or the project's documented dev port — see project memory: port 8080), open DevTools → Application → Storage, note the current usage (likely 0 or stale from before this change since IndexedDB persists across dev reloads — if an old DB exists, the v19 upgrade will clear RVTools data automatically on first load).

Import the same 10 RVTools export files (34.9 MB total) that originally showed 119 MB usage. Confirm:
- Import completes without errors for all 10 files.
- DevTools → Application → IndexedDB → `rvtools-analyzer` → `rawSheetBlobs` shows one row per (snapshot, allow-listed sheet) — not thousands of rows.
- DevTools → Application → Storage usage is now well under the old 119 MB (target: roughly 25-45 MB, in the neighborhood of the 34.9 MB raw input).
- Every page that reads raw sheets still renders correctly (spot-check at least: Overview, Hardware, StorageBackup, NetworkSecurity, Capacity — these cover the widest variety of `useRawSheet` sources).
- Switching between pages remains fast (no regression vs. before).
- Delete one snapshot (Einstellungen/Verwaltung, wherever `deleteSnapshot` is triggered from the UI) and confirm it completes quickly and the snapshot disappears from all pages.

- [ ] **Step 3: Report findings to the user**

Summarize the before/after storage numbers and confirm the app behaves correctly with real data. If actual compression ratio differs meaningfully from the ~25-45 MB estimate, report the real number — RVTools data with highly variable string content (VM names, comments) compresses less predictably than the synthetic test fixtures used in Tasks 1-3.

---

## Self-Review Notes

- **Spec coverage:** schema replacement (Task 2), column denylist (Task 3), compression module (Task 1), read-API stability (verified — no changes to `getRawSheetRows`/`getRawSheetFieldNames` signatures, so all 26 `useRawSheet` call sites are untouched), migration-by-clearing (Task 2, step 3f), diagnostics exactness (Task 2, steps 3i-3k) are all covered. End-to-end verification with real data (Task 4) covers the user's original motivating concern (storage bloat + slowness with large data).
- **Placeholder scan:** none found — every step has complete, concrete code.
- **Type consistency:** `RawSheetBlob` fields (`snapshotId`, `sheetName`, `headers`, `rowCount`, `codec`, `data`) are used identically across Task 2 (schema, CRUD) and Task 3 (import). `persistRawSheetBlobs`'s `onSheetPersisted(sheetName, sheetIndex, totalSheets)` signature matches its one call site in Task 3, step 3f.
- **jsdom realm gotcha:** called out explicitly in Global Constraints and avoided in every test (no `toBeInstanceOf(ArrayBuffer)`; `byteLength`/content assertions used instead), since this was empirically verified to fail during planning.
