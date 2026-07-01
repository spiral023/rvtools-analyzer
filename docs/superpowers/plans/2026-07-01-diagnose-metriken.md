# Diagnose-Metriken (Uploads & Snapshots) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue Diagnose-Seite (`/upload/diagnostics`) hinzufügen, die Datei-/Datenvolumen pro Snapshot, IndexedDB-Auslastung und Browser-Laufzeit-Metriken anzeigt, damit nachvollziehbar wird, wo die wahrgenommene Trägheit nach dem Import großer RVTools-Exporte herkommt.

**Architektur:** Drei neue, unabhängig testbare Bausteine: (1) Erfassung von Dateigröße/Importdauer im bestehenden Import-Flow und Persistierung in `SnapshotMeta`, (2) reine DB-Diagnosefunktionen in `src/data/db/index.ts`, die Counts/Größenschätzungen pro Object Store sowie eine Timing-Beispielabfrage liefern, (3) ein React-Query-Hook `useDiagnostics()` plus eine neue Seite `Diagnostics.tsx`, die alles on-demand zusammenführt und anzeigt. Kein Hintergrund-Polling.

**Tech Stack:** React 18 + TypeScript, Vite, `idb` (IndexedDB), TanStack React Query, React Router, Vitest + Testing Library + jsdom, `fake-indexeddb` (neu, nur für Tests).

## Global Constraints

- Manuelle Aktualisierung der Diagnose-Werte (Mount + Button), kein automatisches Polling-Intervall.
- `navigator.storage.estimate()` und `performance.memory` sind nicht überall verfügbar — bei Nichtverfügbarkeit "nicht verfügbar in diesem Browser" anzeigen statt zu crashen.
- Bestehende Snapshots ohne `fileSizeBytes`/`importDurationMs` zeigen "k. A." an, nicht 0 oder einen Fehler.
- Store-Größen sind Schätzungen (Stichprobe hochgerechnet) und müssen in der UI als solche gekennzeichnet sein.
- Keine IndexedDB-Schema-Versions-Migration nötig — neue `SnapshotMeta`-Felder sind optional und erfordern keine `DB_VERSION`-Erhöhung in `src/data/db/index.ts`.
- Alle UI-Texte auf Deutsch, konsistent mit bestehender App (`src/pages/UploadSnapshots.tsx`).

---

## Datei-Übersicht

| Datei | Aktion | Zweck |
|---|---|---|
| `src/domain/models/types.ts` | Ändern | `SnapshotMeta` um `fileSizeBytes?`, `importDurationMs?` erweitern; neue `DiagnosticsSnapshot`-Typen |
| `src/domain/services/importService.ts` | Ändern | Dateigröße + Importdauer messen und an `putSnapshot` übergeben |
| `src/data/db/index.ts` | Ändern | Neue Funktionen `getStoreDiagnostics()`, `getStorageEstimate()`, `timeSampleQuery()` |
| `src/data/db/index.test.ts` | Erstellen | Tests für die neuen DB-Diagnosefunktionen (mit `fake-indexeddb`) |
| `src/hooks/useDiagnostics.ts` | Erstellen | React-Query-Hook, der alle Diagnosewerte on-demand sammelt |
| `src/hooks/useDiagnostics.test.ts` | Erstellen | Tests für die exportierte Helper-Funktion `getMemoryDiagnostics` (Verfügbarkeit von `performance.memory`) |
| `src/pages/Diagnostics.tsx` | Erstellen | Neue Diagnose-Seite mit drei Abschnitten |
| `src/App.tsx` | Ändern | Neue Route `/upload/diagnostics` registrieren |
| `src/pages/UploadSnapshots.tsx` | Ändern | Link/Button zur Diagnose-Seite hinzufügen |
| `src/test/setup.ts` | Prüfen/Ändern | `fake-indexeddb/auto` ggf. global registrieren, falls für DB-Tests nötig |
| `package.json` | Ändern | `fake-indexeddb` als devDependency hinzufügen |

---

### Task 1: `fake-indexeddb` als Test-Dependency einrichten

**Files:**
- Modify: `package.json`
- Modify: `src/test/setup.ts`

**Interfaces:**
- Produces: globales `indexedDB`-Polyfill in allen Vitest-Tests, sodass `src/data/db/index.ts` (welches `idb`/`openDB` nutzt) in Tests ohne echten Browser funktioniert.

- [ ] **Step 1: `fake-indexeddb` installieren**

```bash
npm install --save-dev fake-indexeddb
```

- [ ] **Step 2: Polyfill-Import an den Anfang von `src/test/setup.ts` hinzufügen**

Die Datei beginnt aktuell mit `import "@testing-library/jest-dom";`. Ersetze diese erste Zeile durch:

```typescript
import "fake-indexeddb/auto";
import "@testing-library/jest-dom";
```

Der Rest der Datei (das `matchMedia`-Mock ab `Object.defineProperty(window, "matchMedia", ...)`) bleibt unverändert.

- [ ] **Step 3: Smoke-Test schreiben, dass IndexedDB in Tests verfügbar ist**

Erstelle `src/test/indexeddb-smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("fake-indexeddb setup", () => {
  it("provides a global indexedDB object", () => {
    expect(typeof indexedDB).toBe("object");
    expect(indexedDB).not.toBeNull();
  });
});
```

- [ ] **Step 4: Test ausführen**

Run: `npm test -- src/test/indexeddb-smoke.test.ts`
Expected: PASS (1 Test grün)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/test/setup.ts src/test/indexeddb-smoke.test.ts
git commit -m "test: add fake-indexeddb for IndexedDB-backed unit tests"
```

---

### Task 2: `SnapshotMeta` um Dateigröße und Importdauer erweitern

**Files:**
- Modify: `src/domain/models/types.ts:32-41`

**Interfaces:**
- Produces: `SnapshotMeta.fileSizeBytes?: number`, `SnapshotMeta.importDurationMs?: number` — von Task 3 (Erfassung) geschrieben und von Task 6 (Anzeige) gelesen.

- [ ] **Step 1: Felder zu `SnapshotMeta` hinzufügen**

In `src/domain/models/types.ts`, ersetze:

```typescript
export interface SnapshotMeta {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  vcenterDisplayName: string;
  exportTs: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  sheetStats: Record<string, SheetStats>;
}
```

durch:

```typescript
export interface SnapshotMeta {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  vcenterDisplayName: string;
  exportTs: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  sheetStats: Record<string, SheetStats>;
  /** Größe der importierten Datei in Bytes. Fehlt bei Snapshots, die vor Einführung dieses Felds importiert wurden. */
  fileSizeBytes?: number;
  /** Gesamtdauer des Imports in Millisekunden (Start bis "Abgeschlossen"). Fehlt bei älteren Snapshots. */
  importDurationMs?: number;
}
```

- [ ] **Step 2: TypeScript-Compiler prüfen**

Run: `npx tsc --noEmit`
Expected: Keine neuen Fehler (optionale Felder brechen keine bestehenden Objektliterale).

- [ ] **Step 3: Commit**

```bash
git add src/domain/models/types.ts
git commit -m "feat: add optional fileSizeBytes/importDurationMs to SnapshotMeta"
```

---

### Task 3: Dateigröße und Importdauer beim Import erfassen

**Files:**
- Modify: `src/domain/services/importService.ts:23-37` (Type-Import), `:281-356`, `:417-421`

**Interfaces:**
- Consumes: `SnapshotMeta.fileSizeBytes`, `SnapshotMeta.importDurationMs` aus Task 2.
- Produces: In `importRvtoolsParsed` wird `fileSizeBytes` beim ersten `putSnapshot` geschrieben; `importDurationMs` wird am Ende des Imports (nach allen Schreibvorgängen) per zweitem `putSnapshot`-Upsert nachgetragen, sodass es die **gesamte** Importdauer abbildet.

**Begründung:** `putSnapshot` ist ein Upsert auf den Keypath `snapshotId` (`db.put` in `src/data/db/index.ts:150-153`). Ein zweiter Aufruf mit demselben Objekt + `importDurationMs` am Ende überschreibt den Eintrag sauber. Die Dauer wird damit erst gemessen, wenn Rohdaten **und** Entities geschrieben sind — also inkl. der schwergewichtigen IndexedDB-Schreibphase, die für die Performance-Analyse gerade interessant ist. Ein einzelner zusätzlicher Single-Row-Write ist vernachlässigbar.

- [ ] **Step 1: Startzeit in `importRvtoolsXlsx` erfassen**

In `src/domain/services/importService.ts`, finde:

```typescript
export async function importRvtoolsXlsx(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const report = (step: string, percent: number, detail?: string) =>
    onProgress?.({ step, percent, detail });

  try {
    report("Datei lesen", 5, `${(file.size / 1024 / 1024).toFixed(1)} MB`);
    const buffer = await file.arrayBuffer();

    report("Prüfsumme berechnen", 10);
    const checksum = await computeChecksum(buffer);

    report("XLSX parsen", 15, "Web Worker aktiv...");
    const parsed = await workerParse(buffer);
    warnings.push(...parsed.warnings);
    errors.push(...parsed.errors);

    if (parsed.fileKind === "tech-info") {
      return importTechInfoXlsx(file, checksum, parsed, warnings, errors, report);
    }

    return importRvtoolsParsed(file, checksum, parsed, warnings, errors, report);
  } catch (err) {
    return { success: false, warnings, errors: [...errors, err instanceof Error ? err.message : String(err)] };
  }
}
```

ersetze durch:

```typescript
export async function importRvtoolsXlsx(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const report = (step: string, percent: number, detail?: string) =>
    onProgress?.({ step, percent, detail });
  const importStartedAt = performance.now();

  try {
    report("Datei lesen", 5, `${(file.size / 1024 / 1024).toFixed(1)} MB`);
    const buffer = await file.arrayBuffer();

    report("Prüfsumme berechnen", 10);
    const checksum = await computeChecksum(buffer);

    report("XLSX parsen", 15, "Web Worker aktiv...");
    const parsed = await workerParse(buffer);
    warnings.push(...parsed.warnings);
    errors.push(...parsed.errors);

    if (parsed.fileKind === "tech-info") {
      return importTechInfoXlsx(file, checksum, parsed, warnings, errors, report);
    }

    return importRvtoolsParsed(file, checksum, parsed, warnings, errors, report, importStartedAt);
  } catch (err) {
    return { success: false, warnings, errors: [...errors, err instanceof Error ? err.message : String(err)] };
  }
}
```

- [ ] **Step 2: `SnapshotMeta` zum Type-Import hinzufügen**

In `src/domain/services/importService.ts` importiert der `import type { ... }`-Block aus `@/domain/models/types` aktuell u. a. `ImportResult`, `NormalizedVm`, … `WorkerParseResult`, aber **nicht** `SnapshotMeta`. Ergänze `SnapshotMeta` in dieser Importliste (z. B. direkt nach `ImportResult,`):

```typescript
import type {
  ImportResult,
  SnapshotMeta,
  NormalizedVm,
  // ... übrige bestehende Einträge unverändert
```

- [ ] **Step 3: `importRvtoolsParsed`-Signatur um `importStartedAt` erweitern**

Finde die Funktionssignatur:

```typescript
async function importRvtoolsParsed(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
```

ersetze durch:

```typescript
async function importRvtoolsParsed(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
  importStartedAt: number,
): Promise<ImportResult> {
```

- [ ] **Step 4: Snapshot-Meta in eine Konstante hoisten und `fileSizeBytes` beim ersten Schreiben setzen**

Finde den `putSnapshot`-Aufruf:

```typescript
  report("Metadaten speichern", 35);
  await putSnapshot({
    snapshotId,
    vcenterId,
    vcenterDisplayName,
    exportTs,
    importedAt: new Date().toISOString(),
    fileName: file.name,
    fileChecksum: checksum,
    sheetStats,
  });
```

ersetze durch:

```typescript
  const snapshotMeta: SnapshotMeta = {
    snapshotId,
    vcenterId,
    vcenterDisplayName,
    exportTs,
    importedAt: new Date().toISOString(),
    fileName: file.name,
    fileChecksum: checksum,
    sheetStats,
    fileSizeBytes: file.size,
  };

  report("Metadaten speichern", 35);
  await putSnapshot(snapshotMeta);
```

- [ ] **Step 5: Am Ende des Imports die volle Dauer per zweitem Upsert nachtragen**

Finde das Ende von `importRvtoolsParsed`:

```typescript
  report("Abgeschlossen", 100, `${vms.length.toLocaleString("de-DE")} VMs, ${hosts.length} Hosts`);

  return { success: true, fileKind: "rvtools", snapshotId, warnings, errors, sheetStats };
}
```

ersetze durch:

```typescript
  await putSnapshot({
    ...snapshotMeta,
    importDurationMs: Math.round(performance.now() - importStartedAt),
  });

  report("Abgeschlossen", 100, `${vms.length.toLocaleString("de-DE")} VMs, ${hosts.length} Hosts`);

  return { success: true, fileKind: "rvtools", snapshotId, warnings, errors, sheetStats };
}
```

- [ ] **Step 6: TypeScript-Compiler prüfen**

Run: `npx tsc --noEmit`
Expected: Keine Fehler.

- [ ] **Step 7: Bestehende Tests laufen lassen**

Run: `npm test`
Expected: Alle bisherigen Tests weiterhin grün (es gibt aktuell keine Tests für `importService.ts`, daher keine Regressions-Tests nötig — Verhalten wird in Task 6 indirekt über die Diagnoseseite sichtbar).

- [ ] **Step 8: Commit**

```bash
git add src/domain/services/importService.ts
git commit -m "feat: record file size and import duration on snapshot metadata"
```

---

### Task 4: DB-Diagnosefunktionen (`getStoreDiagnostics`, `getStorageEstimate`, `timeSampleQuery`)

**Files:**
- Modify: `src/data/db/index.ts`
- Test: `src/data/db/index.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `StoreName`, `ALL_STORES` (bereits in `src/data/db/index.ts` vorhanden), `getBySnapshotIds()`, `getSnapshots()`.
- Produces:
  - `export interface StoreDiagnostics { storeName: StoreName; count: number; estimatedSizeBytes: number }`
  - `export async function getStoreDiagnostics(sampleSize?: number): Promise<StoreDiagnostics[]>`
  - `export interface StorageEstimateResult { supported: boolean; usageBytes: number | null; quotaBytes: number | null }`
  - `export async function getStorageEstimate(): Promise<StorageEstimateResult>`
  - `export interface SampleQueryTiming { store: "entities_vm"; snapshotCount: number; durationMs: number; rowCount: number }`
  - `export async function timeSampleVmQuery(): Promise<SampleQueryTiming>`

- [ ] **Step 1: Test-Datei mit deterministischem DB-Reset und erstem (fehlschlagendem) Test anlegen**

Wichtig zur Isolation: `src/data/db/index.ts:70` cached die DB-Verbindung in einem modul-globalen `dbPromise`. Damit jeder Test auf einer frischen, leeren IndexedDB läuft, setzen wir vor jedem Test (a) eine **neue** `IDBFactory` als globales `indexedDB` (frisches, leeres IndexedDB-Universum, kein `deleteDatabase`-Blocking) und (b) den Modul-Cache via `vi.resetModules()` zurück. Die getesteten Funktionen werden deshalb **pro Test dynamisch** importiert (`await import("./index")`), damit das frische `dbPromise=null` greift.

Erstelle `src/data/db/index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

beforeEach(() => {
  vi.resetModules();
  // Frische Factory => leere DB pro Test. Cast, falls die TS-Lib-Typen abweichen.
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

describe("getStoreDiagnostics", () => {
  it("returns zero counts for all stores on an empty database", async () => {
    const { getStoreDiagnostics } = await import("./index");
    const result = await getStoreDiagnostics();
    expect(result.length).toBeGreaterThan(0);
    for (const store of result) {
      expect(store.count).toBe(0);
      expect(store.estimatedSizeBytes).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Test ausführen, erwarteter Fehlschlag**

Run: `npm test -- src/data/db/index.test.ts`
Expected: FAIL — `getStoreDiagnostics is not a function` (oder Importfehler), da die Funktion noch nicht existiert.

- [ ] **Step 3: `getStoreDiagnostics` implementieren**

In `src/data/db/index.ts`, füge nach der bestehenden `batchPut`-Funktion (vor dem `/* ---------- delete helpers ---------- */`-Kommentar) ein:

```typescript
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
```

- [ ] **Step 4: Test erneut ausführen**

Run: `npm test -- src/data/db/index.test.ts`
Expected: PASS

- [ ] **Step 5: Tests für nicht-leere Store-Diagnose, Storage-Estimate und Query-Timing hinzufügen**

Ergänze in `src/data/db/index.test.ts` (jeder Test importiert dank `beforeEach`-Reset seine Funktionen frisch und läuft auf einer eigenen leeren DB):

```typescript
describe("getStoreDiagnostics with data", () => {
  it("counts entries and estimates a non-zero size after inserting snapshots", async () => {
    const { putSnapshot, getStoreDiagnostics } = await import("./index");
    await putSnapshot({
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      vcenterDisplayName: "Test vCenter",
      exportTs: "2026-01-01T00:00:00.000Z",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "test.xlsx",
      fileChecksum: "abc123",
      sheetStats: {},
      fileSizeBytes: 1024,
      importDurationMs: 500,
    });

    const result = await getStoreDiagnostics();
    const snapshotsStore = result.find((r) => r.storeName === "snapshots");
    expect(snapshotsStore?.count).toBe(1);
    expect(snapshotsStore?.estimatedSizeBytes).toBeGreaterThan(0);
  });
});

describe("getStorageEstimate", () => {
  it("returns a result shape indicating support or graceful fallback", async () => {
    const { getStorageEstimate } = await import("./index");
    const result = await getStorageEstimate();
    expect(typeof result.supported).toBe("boolean");
    if (!result.supported) {
      expect(result.usageBytes).toBeNull();
      expect(result.quotaBytes).toBeNull();
    }
  });
});

describe("timeSampleVmQuery", () => {
  it("returns zero rows and a duration-safe result on an empty database", async () => {
    const { timeSampleVmQuery } = await import("./index");
    const result = await timeSampleVmQuery();
    expect(result.store).toBe("entities_vm");
    expect(result.rowCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 6: Alle DB-Tests ausführen**

Run: `npm test -- src/data/db/index.test.ts`
Expected: PASS (alle Tests grün)

- [ ] **Step 7: Commit**

```bash
git add src/data/db/index.ts src/data/db/index.test.ts
git commit -m "feat: add IndexedDB diagnostics helpers (store counts, size estimate, sample query timing)"
```

---

### Task 5: `useDiagnostics()` Hook

**Files:**
- Create: `src/hooks/useDiagnostics.ts`
- Test: `src/hooks/useDiagnostics.test.ts`

**Interfaces:**
- Consumes: `getStoreDiagnostics()`, `getStorageEstimate()`, `timeSampleVmQuery()` aus `src/data/db/index.ts` (Task 4); `getSnapshots()` (bestehend); `useQuery`, `useQueryClient` aus `@tanstack/react-query`.
- Produces:
  ```typescript
  export interface MemoryDiagnostics {
    supported: boolean;
    usedJSHeapSizeBytes: number | null;
    totalJSHeapSizeBytes: number | null;
  }
  export interface CacheDiagnostics {
    queryKey: string;
    entryCount: number;
  }
  export interface DiagnosticsResult {
    snapshots: SnapshotMeta[];
    stores: StoreDiagnostics[];
    storage: StorageEstimateResult;
    sampleQuery: SampleQueryTiming;
    memory: MemoryDiagnostics;
    cache: CacheDiagnostics[];
  }
  export function useDiagnostics(enabled: boolean): { data: DiagnosticsResult | undefined; isFetching: boolean; refetch: () => void }
  ```

- [ ] **Step 1: Test für `getMemoryDiagnostics`-Verhalten schreiben (Helper-Funktion, exportiert für Testbarkeit)**

Erstelle `src/hooks/useDiagnostics.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getMemoryDiagnostics } from "./useDiagnostics";

describe("getMemoryDiagnostics", () => {
  it("returns unsupported when performance.memory is not present", () => {
    const result = getMemoryDiagnostics({} as Performance);
    expect(result.supported).toBe(false);
    expect(result.usedJSHeapSizeBytes).toBeNull();
    expect(result.totalJSHeapSizeBytes).toBeNull();
  });

  it("reads heap sizes when performance.memory is present", () => {
    const fakePerformance = {
      memory: { usedJSHeapSize: 1000, totalJSHeapSize: 2000 },
    } as unknown as Performance;
    const result = getMemoryDiagnostics(fakePerformance);
    expect(result.supported).toBe(true);
    expect(result.usedJSHeapSizeBytes).toBe(1000);
    expect(result.totalJSHeapSizeBytes).toBe(2000);
  });
});
```

- [ ] **Step 2: Test ausführen, erwarteter Fehlschlag**

Run: `npm test -- src/hooks/useDiagnostics.test.ts`
Expected: FAIL — Modul `./useDiagnostics` existiert nicht.

- [ ] **Step 3: `src/hooks/useDiagnostics.ts` implementieren**

```typescript
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSnapshots,
  getStoreDiagnostics,
  getStorageEstimate,
  timeSampleVmQuery,
  type StoreDiagnostics,
  type StorageEstimateResult,
  type SampleQueryTiming,
} from "@/data/db";
import type { SnapshotMeta } from "@/domain/models/types";

export interface MemoryDiagnostics {
  supported: boolean;
  usedJSHeapSizeBytes: number | null;
  totalJSHeapSizeBytes: number | null;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

export function getMemoryDiagnostics(perf: Performance): MemoryDiagnostics {
  const memory = (perf as Performance & { memory?: PerformanceMemory }).memory;
  if (!memory) {
    return { supported: false, usedJSHeapSizeBytes: null, totalJSHeapSizeBytes: null };
  }
  return {
    supported: true,
    usedJSHeapSizeBytes: memory.usedJSHeapSize,
    totalJSHeapSizeBytes: memory.totalJSHeapSize,
  };
}

export interface CacheDiagnostics {
  queryKey: string;
  entryCount: number;
}

const TRACKED_QUERY_KEYS = ["vms", "hosts", "clusters", "datastores", "vmSnapshots", "health", "techInfoLatestByVmNames"];

export interface DiagnosticsResult {
  snapshots: SnapshotMeta[];
  stores: StoreDiagnostics[];
  storage: StorageEstimateResult;
  sampleQuery: SampleQueryTiming;
  memory: MemoryDiagnostics;
  cache: CacheDiagnostics[];
}

export function useDiagnostics(enabled: boolean) {
  const queryClient = useQueryClient();
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const collect = useCallback(async (): Promise<DiagnosticsResult> => {
    const [snapshots, stores, storage, sampleQuery] = await Promise.all([
      getSnapshots(),
      getStoreDiagnostics(),
      getStorageEstimate(),
      timeSampleVmQuery(),
    ]);
    const memory = getMemoryDiagnostics(performance);
    const cache: CacheDiagnostics[] = TRACKED_QUERY_KEYS.map((key) => {
      const queries = queryClient.getQueryCache().findAll({ queryKey: [key] });
      const entryCount = queries.reduce((sum, q) => {
        const data = q.state.data;
        return sum + (Array.isArray(data) ? data.length : data ? 1 : 0);
      }, 0);
      return { queryKey: key, entryCount };
    });

    return { snapshots, stores, storage, sampleQuery, memory, cache };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["diagnostics", fetchTrigger],
    queryFn: collect,
    enabled,
    staleTime: Infinity,
    gcTime: 0,
  });

  const refetchManually = useCallback(() => {
    setFetchTrigger((n) => n + 1);
  }, []);

  return { data: query.data, isFetching: query.isFetching, refetch: refetchManually };
}
```

- [ ] **Step 4: Test ausführen**

Run: `npm test -- src/hooks/useDiagnostics.test.ts`
Expected: PASS (beide `getMemoryDiagnostics`-Tests grün)

- [ ] **Step 5: TypeScript-Compiler prüfen**

Run: `npx tsc --noEmit`
Expected: Keine Fehler. Falls `StoreDiagnostics`, `StorageEstimateResult`, `SampleQueryTiming` nicht aus `@/data/db` re-exportiert werden, prüfe, dass `src/data/db/index.ts` diese Typen mit `export interface` deklariert (siehe Task 4, Step 3 — bereits der Fall) und dass `@/data/db` auf `src/data/db/index.ts` auflöst.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDiagnostics.ts src/hooks/useDiagnostics.test.ts
git commit -m "feat: add useDiagnostics hook aggregating DB, storage, and memory metrics"
```

---

### Task 6: Diagnose-Seite (`Diagnostics.tsx`) und Routing

**Files:**
- Create: `src/pages/Diagnostics.tsx`
- Modify: `src/App.tsx:14,59` (neuer Lazy-Import + neue Route)
- Modify: `src/pages/UploadSnapshots.tsx` (Link zur Diagnose-Seite)

**Interfaces:**
- Consumes: `useDiagnostics(enabled)` aus Task 5; `SnapshotMeta`, `StoreDiagnostics`, `StorageEstimateResult`, `SampleQueryTiming`, `MemoryDiagnostics`, `CacheDiagnostics` Typen.
- Produces: Route `/upload/diagnostics`, sichtbar verlinkt von `/upload`.

- [ ] **Step 1: Neue Seite `src/pages/Diagnostics.tsx` erstellen**

```typescript
import { Link } from "react-router-dom";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "k. A.";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function Diagnostics() {
  const { data, isFetching, refetch } = useDiagnostics(true);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/upload">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">Diagnose</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Aktualisieren
        </Button>
      </div>

      {!data && isFetching && (
        <p className="text-sm text-muted-foreground">Lade Diagnosedaten…</p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Datei- &amp; Datenvolumen pro Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.snapshots.length === 0 && <p className="text-sm text-muted-foreground">Keine Snapshots vorhanden.</p>}
                {data.snapshots.map((s) => {
                  const totalRows = Object.values(s.sheetStats).reduce((sum, v) => sum + v.rowCount, 0);
                  return (
                    <div key={s.snapshotId} className="flex items-center justify-between text-sm border-b border-border/40 py-2 last:border-0">
                      <span className="font-medium">{s.fileName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.fileSizeBytes !== undefined ? formatBytes(s.fileSizeBytes) : "k. A."}
                        {" · "}{totalRows.toLocaleString("de-DE")} Zeilen
                        {" · "}{s.importDurationMs !== undefined ? `${(s.importDurationMs / 1000).toFixed(1)} s Import` : "k. A."}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">IndexedDB-Auslastung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                Browser-Speicher gesamt: {data.storage.supported
                  ? `${formatBytes(data.storage.usageBytes)} von ${formatBytes(data.storage.quotaBytes)} Kontingent`
                  : "nicht verfügbar in diesem Browser"}
              </p>
              <div className="space-y-1">
                {data.stores.map((store) => (
                  <div key={store.storeName} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                    <span>{store.storeName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {store.count.toLocaleString("de-DE")} Einträge · ~{formatBytes(store.estimatedSizeBytes)} (geschätzt)
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Beispiel-Abfrage (alle VMs über alle Snapshots): {data.sampleQuery.rowCount.toLocaleString("de-DE")} Zeilen in {data.sampleQuery.durationMs} ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Browser-Laufzeit</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                JS-Heap: {data.memory.supported
                  ? `${formatBytes(data.memory.usedJSHeapSizeBytes)} von ${formatBytes(data.memory.totalJSHeapSizeBytes)} belegt`
                  : "nicht verfügbar in diesem Browser"}
              </p>
              <div className="space-y-1">
                {data.cache.map((c) => (
                  <div key={c.queryKey} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                    <span>{c.queryKey}</span>
                    <span className="text-muted-foreground tabular-nums">{c.entryCount.toLocaleString("de-DE")} Datensätze im Cache</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Route in `src/App.tsx` registrieren**

Finde:

```typescript
const UploadSnapshots = lazy(() => import("@/pages/UploadSnapshots"));
```

ergänze direkt danach:

```typescript
const Diagnostics = lazy(() => import("@/pages/Diagnostics"));
```

Finde:

```typescript
                  <Route path="/upload" element={<UploadSnapshots />} />
```

ergänze direkt danach:

```typescript
                  <Route path="/upload/diagnostics" element={<Diagnostics />} />
```

- [ ] **Step 3: Link auf der Uploads-Seite ergänzen**

In `src/pages/UploadSnapshots.tsx`, finde den Import-Block am Dateianfang und ergänze `Link` aus `react-router-dom` sowie ein passendes Icon:

Finde:

```typescript
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
```

ersetze durch:

```typescript
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, AlertTriangle, Activity } from "lucide-react";
import { Link } from "react-router-dom";
```

Ersetze den **kompletten** Header-Block in einem Zug. Finde exakt (entspricht `UploadSnapshots.tsx:108-127`):

```typescript
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Uploads & Snapshots</h1>
        <Dialog open={deleteAllOpen} onOpenChange={(open) => dispatch({ type: "set-delete-all-open", value: open })}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />Alle Daten löschen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alle lokalen Daten löschen?</DialogTitle>
              <DialogDescription>Dies löscht alle importierten Snapshots, Analysedaten und gespeicherten Einstellungen unwiderruflich aus Ihrem Browser.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => dispatch({ type: "set-delete-all-open", value: false })}>Abbrechen</Button>
              <Button variant="destructive" onClick={handleDeleteAll}>Endgültig löschen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
```

ersetze durch (ein zusätzlicher Wrapper-`<div>` gruppiert den neuen Diagnose-Link und den bestehenden Dialog — Einrückung des Dialogs entsprechend angepasst):

```typescript
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Uploads & Snapshots</h1>
        <div className="flex items-center gap-2">
          <Link to="/upload/diagnostics">
            <Button variant="ghost" size="sm">
              <Activity className="mr-1 h-4 w-4" />Diagnose
            </Button>
          </Link>
          <Dialog open={deleteAllOpen} onOpenChange={(open) => dispatch({ type: "set-delete-all-open", value: open })}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1 h-4 w-4" />Alle Daten löschen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alle lokalen Daten löschen?</DialogTitle>
                <DialogDescription>Dies löscht alle importierten Snapshots, Analysedaten und gespeicherten Einstellungen unwiderruflich aus Ihrem Browser.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => dispatch({ type: "set-delete-all-open", value: false })}>Abbrechen</Button>
                <Button variant="destructive" onClick={handleDeleteAll}>Endgültig löschen</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
```

- [ ] **Step 4: TypeScript-Compiler prüfen**

Run: `npx tsc --noEmit`
Expected: Keine Fehler (insbesondere keine JSX-Tag-Mismatch-Fehler durch das neu eingefügte `div`).

- [ ] **Step 5: Dev-Server starten und Seite manuell prüfen**

Run: `npm run dev`

Im Browser:
1. Öffne `http://localhost:5173/upload` (Port ggf. der Konsolen-Ausgabe entnehmen).
2. Prüfe, dass der neue "Diagnose"-Button sichtbar ist und zur Route `/upload/diagnostics` navigiert.
3. Auf der Diagnose-Seite: prüfe, dass alle drei Karten ("Datei- & Datenvolumen", "IndexedDB-Auslastung", "Browser-Laufzeit") ohne Fehler rendern — auch wenn noch keine Snapshots importiert sind (sollte "Keine Snapshots vorhanden." anzeigen und Stores mit 0 Einträgen).
4. Importiere eine kleine Test-XLSX-Datei (falls vorhanden) oder navigiere zurück zu `/upload` und importiere eine vorhandene RVTools-Datei.
5. Zurück auf `/upload/diagnostics`, klicke "Aktualisieren" und prüfe, dass Dateigröße, Zeilenzahl, Importdauer und Store-Counts jetzt befüllt sind.
6. Browser-Konsole auf Fehler prüfen (keine `TypeError`/`undefined`-Zugriffe).

- [ ] **Step 6: Production-Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich, kein TypeScript- oder Bundling-Fehler für die neue lazy-geladene Route.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Diagnostics.tsx src/App.tsx src/pages/UploadSnapshots.tsx
git commit -m "feat: add diagnostics page showing snapshot, IndexedDB, and memory metrics"
```

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:**
- Datei-/Datenvolumen pro Snapshot → Task 2, 3, 6 ✅
- IndexedDB-Auslastung (gesamt + pro Store, Schätzung, Beispiel-Query-Timing) → Task 4, 6 ✅
- Browser-Laufzeit (JS-Heap, Cache-Größen) → Task 5, 6 ✅
- Separate Route `/upload/diagnostics`, verlinkt von Uploads-Seite → Task 6 ✅
- Manuelle Aktualisierung, kein Polling → Task 5 (`enabled`/`refetch`-Pattern ohne `refetchInterval`), Task 6 (Button) ✅
- Fehlerbehandlung bei fehlenden Browser-APIs → Task 4 (`getStorageEstimate`), Task 5 (`getMemoryDiagnostics`) ✅
- "k. A." für ältere Snapshots ohne neue Felder → Task 6 (`s.fileSizeBytes !== undefined ? ... : "k. A."`) ✅

**Platzhalter-Scan:** Keine "TBD"/"TODO"-Stellen; alle Code-Blöcke sind vollständig.

**Typkonsistenz:** `StoreDiagnostics`, `StorageEstimateResult`, `SampleQueryTiming` werden in Task 4 in `src/data/db/index.ts` definiert und in Task 5 (`useDiagnostics.ts`) sowie Task 6 (`Diagnostics.tsx`, über `DiagnosticsResult`) mit identischen Feldnamen wiederverwendet. `getMemoryDiagnostics` wird in Task 5 definiert und exportiert, in Task 6 indirekt über `useDiagnostics()` konsumiert (nicht direkt importiert) — konsistent.

---

## Hinweis zur Ausführung

Die Tasks bauen sequenziell aufeinander auf (Task 2 → 3 → 4 → 5 → 6), Task 1 ist eine Voraussetzung für Task 4. Subagent-driven execution sollte daher die Reihenfolge 1, 2, 3, 4, 5, 6 einhalten.
