# Design: Diagnose-Metriken für Uploads & Snapshots

**Datum:** 2026-07-01
**Status:** Entwurf, vom Nutzer freigegeben

## Problem

Der Import eines ca. 11 MB großen RVTools-Excel-Exports fühlt sich akzeptabel an, aber **danach**, beim normalen Bedienen der Anwendung (Seitenwechsel, Filtern, Klicken), wirkt das Frontend zäh. Aktuell gibt es keinerlei Instrumentierung, um zu sehen, wo die Zeit/der Speicher hingeht — es gibt nur den Import-Fortschrittsbalken (`ImportProgress` in `src/domain/services/importService.ts`), aber keine persistierten Metriken und keine Sicht auf IndexedDB-Auslastung oder Laufzeit-Speicherverbrauch.

Ziel dieser Änderung ist **nicht**, das Problem direkt zu beheben, sondern **Sichtbarkeit** zu schaffen, damit zukünftig gezielt optimiert werden kann.

## Vorab-Recherche (Befunde)

- Excel-Parsing läuft bereits in einem Web Worker (`src/workers/parser.worker.ts`) — blockiert den Main Thread nicht.
- Normalisierung der Entities (VMs, Hosts, Cluster, Datastores, Snapshots, Health) läuft synchron im Main Thread (`src/domain/services/importService.ts`), aber nur einmal pro Import.
- IndexedDB-Layer nutzt `idb` mit 13 Object Stores (`src/data/db/index.ts`), u. a. `rawSheets` (Rohzeilen) und mehrere `entities_*` Stores.
- Jeder Seitenwechsel lädt über `getBySnapshotIds()` erneut alle Entities für die aktiven Snapshot-IDs aus IndexedDB (React Query mit 5 Minuten `staleTime`, siehe `src/hooks/useActiveSnapshots.ts`).
- Große Tabellen sind in **59 Stellen über fast alle Seiten hinweg bereits virtualisiert** (`@tanstack/react-virtual` in `src/components/tables/VirtualTable.tsx`). React-Rendering von großen Listen ist daher wahrscheinlich **nicht** die Hauptursache für die wahrgenommene Trägheit.
- Es besteht der Verdacht, dass die Ursache eher in der **Menge der in IndexedDB gehaltenen/wiederholt geladenen Daten** und im **Speicherverbrauch des Browser-Tabs** liegt — das soll mit den neuen Metriken überprüfbar werden.

## Lösungsansatz

Eine neue, separate Diagnose-Seite unter der Route `/upload/diagnostics`, verlinkt von der bestehenden "Uploads & Snapshots"-Seite (`src/pages/UploadSnapshots.tsx`). Die Seite zeigt drei Kategorien von Metriken, die **on-demand** (beim Betreten der Seite sowie über einen "Aktualisieren"-Button) berechnet werden — kein Hintergrund-Polling.

### Kategorie 1: Datei- & Datenvolumen pro Snapshot

- Erweiterung von `SnapshotMeta` (`src/domain/models/types.ts`) um:
  - `fileSizeBytes: number` — Größe der importierten Datei
  - `importDurationMs: number` — Gesamtdauer des Imports (Start bis "Abgeschlossen")
- Diese Werte werden in `importRvtoolsXlsx` (`src/domain/services/importService.ts`) erfasst (Zeitmessung via `performance.now()` um den gesamten Importvorgang) und beim Schreiben des Snapshots (`putSnapshot`) mitgespeichert.
- Bereits vorhandene `sheetStats` (Zeilen/Spalten pro Sheet) werden für die Anzeige wiederverwendet.
- Anzeige: Tabelle mit einer Zeile pro Snapshot — Dateiname, Dateigröße, Gesamtzeilen, Importdauer, Anzahl Sheets.

### Kategorie 2: IndexedDB-Auslastung

- Gesamtgröße/Kontingent des Browser-Speichers über `navigator.storage.estimate()` (liefert `usage` und `quota` in Bytes), mit Hinweis, falls die API nicht verfügbar ist.
- Pro Object Store (alle 13 Stores aus `RVToolsDBSchema`): Anzahl Einträge via `count()`.
- Geschätzte Größe pro Store: Stichprobe von z. B. 50 zufälligen/ersten Einträgen, deren `JSON.stringify(...).length` gemessen und auf die Gesamtzahl Einträge hochgerechnet wird. Diese Zahl wird in der UI explizit als **Schätzung** gekennzeichnet (kein exakter Byte-Wert, da IndexedDB das nicht direkt liefert).
- Eine Beispielmessung der tatsächlichen Ladezeit: Zeitmessung einer realen `getBySnapshotIds()`-Abfrage (z. B. für `entities_vm` über alle vorhandenen Snapshot-IDs), um zu zeigen, wie viel reine DB-Zeit ein typischer Seitenwechsel kostet.

### Kategorie 3: Browser-Laufzeit

- JS-Heap-Nutzung über `performance.memory` (`usedJSHeapSize`, `totalJSHeapSize`), falls verfügbar (nur Chromium-Browser) — sonst Hinweis "in diesem Browser nicht verfügbar".
- Anzahl aktuell im React-Query-Cache gehaltener Datensätze (VMs, Hosts, Cluster, Datastores, Snapshots, Health, Tech-Info) als Proxy dafür, wie viele Objekte gerade im Speicher des Tabs gehalten werden — ausgelesen über `queryClient.getQueryCache()`.

## Architektur / Datenfluss

- Neuer Hook `useDiagnostics()` (z. B. `src/hooks/useDiagnostics.ts`), der beim Mount der Diagnose-Seite und bei Klick auf "Aktualisieren" alle Werte asynchron sammelt (DB-Counts/Größenschätzung, `storage.estimate()`, `performance.memory`, Cache-Größen) und ein zusammengefasstes Ergebnisobjekt zurückgibt. Implementiert als `useQuery` mit `enabled` nur bei aktivem Trigger, kein automatisches Refetch-Intervall.
- Neue, reine DB-Hilfsfunktionen in `src/data/db/index.ts` (z. B. `getStoreDiagnostics()`), die für jeden Store Anzahl + Größenschätzung liefern, sowie eine Funktion, die eine Beispiel-Query timt.
- `SnapshotMeta` und `putSnapshot`-Aufruf in `importRvtoolsXlsx` werden um `fileSizeBytes`/`importDurationMs` ergänzt (zusätzliches Schema-Feld, keine DB-Versions-Migration nötig, da bestehende Felder nicht verändert werden — ältere Snapshots ohne diese Felder zeigen einfach "k. A." an).
- Neue Seite `src/pages/Diagnostics.tsx` und Route `/upload/diagnostics` in `src/App.tsx`. Link/Button auf `UploadSnapshots.tsx`, der zur Diagnose-Seite führt.

## Fehlerbehandlung

- `performance.memory` und `navigator.storage.estimate()` sind nicht überall verfügbar (z. B. Firefox, Safari) → jeweils einzeln auf Verfügbarkeit prüfen und "nicht verfügbar in diesem Browser" anzeigen, statt zu crashen.
- Snapshots, die vor dieser Änderung importiert wurden, haben keine `fileSizeBytes`/`importDurationMs` → als "k. A." darstellen statt 0 oder Fehler.

## Out of Scope

- Keine automatische Behebung der Performance-Probleme (z. B. Daten-Pruning, Lazy-Loading-Änderungen) — das ist ein möglicher Folgeschritt, nachdem die Metriken Klarheit gebracht haben.
- Kein Live-Polling/Hintergrund-Refresh der Metriken.
- Keine tiefgehende React-Profiler-Instrumentierung einzelner Komponenten (bewusst nicht gewählt, da Tabellen bereits virtualisiert sind).
