# Rohdaten-Speicherung: komprimierte Sheet-Blobs statt Zeilen-Store — Design

**Datum:** 2026-07-17
**Status:** Freigegeben

## Ziel

Bei 10 RVTools-Exporten (34,9 MB XLSX gesamt) zeigt der Browser 119 MB IndexedDB-Nutzung
(~3,4x). Ursache: jedes Sheet wird zeilenweise in `rawSheets` gespeichert (ein Structured-Clone-
Objekt + 3 Indexeinträge pro Zeile) und zusätzlich normalisiert in `entities_*` dupliziert.
Das macht große Imports auch spürbar zäh (Seitenwechsel, Import, Löschen). Ziel: Storage auf
~XLSX-Rohgröße bringen und Lese-/Schreib-/Löschperformance verbessern, ohne die 26 bestehenden
`useRawSheet`-Konsumenten anzufassen.

## Nicht-Ziel

- Die `entities_*`-Normalisierung (VM/Host/Cluster/Datastore/Snapshot/Health) bleibt unverändert —
  sie ist bereits kompakt (Teilmenge der Spalten) und wird für Analyse-Queries gebraucht.
- Migration bestehender Snapshots: **kein Migrationscode**. Beim DB-Upgrade auf v19 werden alle
  RVTools-Snapshot-Daten geleert; Nutzer importieren die Dateien neu (einmaliger Vorgang,
  dauert wenige Minuten). Tech-Info-, TechInfo-Client-, CDP-, Wartungs- und Szenario-Daten sind
  von der Löschung nicht betroffen.

## Aktueller Zustand (zum Vergleich)

- `rawSheets`: ein `StoredSheetRow` (`{snapshotId, sheetName, rowIndex, values[]}`) pro Zeile,
  Key `[snapshotId, sheetName, rowIndex]`, 3 Indexe (`snapshotId`, `sheetName`,
  `snapshotId_sheetName`).
- `rawSheetHeaders`: ein `RawSheetHeader` (`{snapshotId, sheetName, headers[]}`) pro Snapshot+Sheet.
- `RAW_SHEET_ALLOWLIST` (`importService.ts:115-120`) bestimmt, welche der ~20 RVTools-Sheets
  überhaupt roh gespeichert werden (Konsumenten-getrieben).
- Lesen: `getRawSheetRows` holt Zeilen per Index + Header, hydriert zu `SheetRow[]`
  (`db/index.ts:396-413`).

## Neues Format: komprimierte Blobs (DB v19)

### Schema

Ersetzt `rawSheets` + `rawSheetHeaders` durch einen einzigen Store:

```ts
interface RawSheetBlob {
  snapshotId: SnapshotId;
  sheetName: string;
  headers: string[];      // unkomprimiert — Feldnamen-Abfragen ohne Dekompression
  rowCount: number;
  codec: "gzip-json-v1";  // Format-Marker für künftige Evolution (z. B. Chunking)
  data: ArrayBuffer;      // gzip(JSON.stringify(values: (string|number|boolean|null)[][]))
}
```

- Key: `[snapshotId, sheetName]` (keyPath), **kein Zusatzindex** — Löschen läuft über
  `IDBKeyRange.bound([snapshotId], [snapshotId, []])` auf dem Primärschlüssel, genau wie
  heute schon für `rawSheets`/`metrics_cache` implementiert (`deleteByKeyPrefix`).
- `headers` bleibt unkomprimiert, damit `getRawSheetFieldNames` ohne Dekompression auskommt.

### Spalten-Denylist beim Import

Neue Konstante `RAW_SHEET_COLUMN_DENYLIST = ["VI SDK UUID", "VI SDK Server type", "VI SDK API Version"]`
in `importService.ts`. Diese Spalten werden aus `buildRawHeaderUnion` gefiltert, bevor die
Header-Liste gebaut wird (sie sind pro vCenter konstant und in jeder Zeile jedes Sheets
vorhanden — reiner Overhead ohne Analysewert). `VI SDK Server` bleibt (wird für die
vCenter-Erkennung/Anzeige gebraucht, z. B. `ComplianceLifecycle.tsx:527`).

### Kompressions-Modul

Neu: `src/lib/compression.ts`

```ts
export async function gzipJson(value: unknown): Promise<ArrayBuffer>
export async function gunzipJson<T>(buffer: ArrayBuffer): Promise<T>
```

Implementiert über die native `CompressionStream`/`DecompressionStream` ("gzip") — keine neue
Dependency. Mindestversionen: Chrome/Edge 80+, Firefox 113+, Safari 16.4+ (alle seit 2023
Standard, für ein internes Tool unkritisch). In Vitest/Node ≥18 sind beide Klassen global
verfügbar, keine Test-Polyfills nötig.

### Import-Pfad

`persistAllowedRawSheetRows` wird zu `persistRawSheetBlobs`:

1. Pro Sheet aus der Allowlist: Header-Union bilden (Denylist anwenden), `values[][]` aus allen
   Zeilen bauen (gleiche `toRawCellValue`-Normalisierung wie heute).
2. `gzipJson(values)` → `data`.
3. Ein `db.put("rawSheetBlobs", {snapshotId, sheetName, headers, rowCount, codec, data})` pro
   Sheet (keine 5.000er-Batches mehr nötig — ein Sheet ist ein Record).
4. Progress-Callback meldet Fortschritt pro Sheet statt pro Zeilen-Batch.

### Lese-Pfad (API-Kompatibilität)

`getRawSheetRows(snapshotIds, sheetName)` und `getRawSheetFieldNames(snapshotIds, sheetName)`
behalten Signatur und Rückgabetyp exakt bei:

```ts
export async function getRawSheetRows(snapshotIds: string[], sheetName: string): Promise<SheetRow[]> {
  // pro snapshotId: db.get("rawSheetBlobs", [sid, sheetName]) → gunzipJson → zu SheetRow[] hydrieren
}
```

Damit bleiben alle 26 Aufrufstellen (`useRawSheet` in `useActiveSnapshots.ts` + alle Seiten/Dialoge)
unverändert.

### Löschen

`deleteSnapshot`: `rawSheetBlobs` wird wie `rawSheets` per Prefix-Range gelöscht, aber es sind
nur ~20 Records statt zehntausender Zeilen — der Chunk-Loop entfällt für diesen Store faktisch
(ein Chunk reicht immer).

### Diagnose

`getStoreDiagnostics`/`estimateSnapshotSizesBytes`: für `rawSheetBlobs` wird `data.byteLength +
JSON.stringify(headers).length` als **exakte** Größe verwendet statt Stichproben-Hochrechnung
(bisher `JSON.stringify(value).length` als Schätzer).

## Migration (DB v19)

Im `upgrade()`-Handler von `getDb()`:
- `rawSheets`, `rawSheetHeaders` löschen, `rawSheetBlobs` anlegen.
- Da damit vorhandene Snapshots ohne Rohdaten inkonsistent wären: `snapshots`, `entities_vm`,
  `entities_host`, `entities_cluster`, `entities_datastore`, `entities_snapshot`,
  `entities_health`, `metrics_cache` ebenfalls leeren (`db.clear`, kein `deleteObjectStore` —
  Struktur bleibt, nur Inhalt weg).
- Tech-Info-, TechInfo-Client-, CDP-, Wartungs- und Szenario-Stores bleiben unangetastet.
- App zeigt danach den normalen Leerzustand (First-Run-Onboarding / "bitte importieren").

## Betroffene Dateien

- `src/data/db/index.ts` — Schema, `getDb`, `getRawSheetRows`, `getRawSheetFieldNames`,
  `deleteSnapshot`, `deleteByKeyPrefix`-Aufruf, `getStoreDiagnostics`, `estimateSnapshotSizesBytes`
- `src/domain/services/importService.ts` — `persistAllowedRawSheetRows` → `persistRawSheetBlobs`,
  `RAW_SHEET_COLUMN_DENYLIST`, Aufruf in `importRvtoolsParsed`
- `src/domain/models/types.ts` — `RawSheetBlob`-Typ, `StoredSheetRow`/`RawSheetHeader` entfernen
- `src/lib/compression.ts` — neu
- `src/data/db/index.test.ts`, `src/test/importService.test.ts` — Anpassung auf Blob-Format,
  Alt-Format-Testfälle (v17-Fallback) entfallen
- `src/lib/compression.test.ts` — neu (Roundtrip-Test)

## Erwartetes Ergebnis

- Storage sinkt von ~119 MB auf grob 25–35 MB bei den 10 Testdateien (≈ XLSX-Rohgröße, gzip auf
  JSON-Zahlenwerten/Strings komprimiert typischerweise 5-10x).
- Seitenwechsel schneller: 1 Record + `JSON.parse` pro Sheet statt tausender Structured-Clone-
  Reads über einen Index.
- Import schneller: keine 5.000er-Batch-Transaktionen mehr für Rohdaten, ein Put pro Sheet.
- Snapshot-Löschen nahezu sofort für den Rohdaten-Anteil.

## Bekannte Trade-offs (siehe Diskussion)

- Peak-RAM pro Sheet steigt punktuell (ganzes Sheet als ein JSON-String/Blob statt Batches) —
  bei sehr großen Einzelsheets (mehrere 100k Zeilen) müsste bei Bedarf nachträglich Chunking
  ergänzt werden (`codec`-Feld ist dafür vorbereitet).
- IndexedDB-Inhalt ist im DevTools-Viewer nicht mehr zeilenweise lesbar (nur Binärblob) —
  Inspektion muss über die App/Diagnostics laufen.
- VI-SDK-UUID/Server-Type/API-Version verschwinden als Filterquelle im globalen VM-Filter
  (bewusst, siehe Denylist-Begründung oben).
