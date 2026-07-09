# Ein RVTools-Export pro vCenter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Neuimport ersetzt automatisiert nur die Daten desselben vCenters, ohne temporär eine zweite vollständige IndexedDB-Kopie zu speichern, und hält die UI-Filter gültig.

**Architecture:** Der Importdienst parst zuerst, liest dann Snapshots über den bestehenden `vcenterId`-Index und löscht sie sequenziell. Er schreibt Metadaten erst nach allen Roh- und Entitätsdaten und räumt Teilreste bei Fehlern auf. Der Filter-State leitet nur gültige Snapshot-IDs aus der Query-Menge ab.

**Tech Stack:** TypeScript, React 18, TanStack Query, `idb`, Vitest, fake-indexeddb, Testing Library.

---

### Task 1: Snapshot-Abfrage und Austausch testen

**Files:**
- Modify: `src/test/importService.test.ts`
- Modify: `src/data/db/index.ts`

- [x] **Step 1: Tests für gleichen und unterschiedlichen vCenter schreiben.** Zwei Workbooks importieren; bei gleichem vCenter muss nur der zweite Snapshot inklusive neuer Rohdaten vorhanden sein, bei verschiedenen vCentern müssen zwei Snapshots bleiben.
- [x] **Step 2: Die neuen Tests mit `npm run test -- src/test/importService.test.ts` ausführen.** Erwartet: Fail, weil der erste Snapshot aktuell erhalten bleibt.
- [x] **Step 3: `getSnapshotsByVcenterId(vcenterId)` über den vorhandenen Index ergänzen und die Tests erneut ausführen.** Erwartet: Die Verhaltens-Tests bleiben rot, da noch kein Austausch erfolgt.

### Task 2: Speichersparenden Importaustausch implementieren

**Files:**
- Modify: `src/domain/services/importService.ts`
- Modify: `src/data/db/index.ts`
- Test: `src/test/importService.test.ts`

- [x] **Step 1: Test für Fortschrittsdetails und Teilreste bei einem Schreibfehler schreiben.** Der Test erwartet einen Austausch-Fortschritt mit vCenter/Anzahl und keine Zeilen des fehlgeschlagenen neuen Snapshot-IDs.
- [x] **Step 2: Test ausführen.** Erwartet: Fail, weil Metadaten derzeit vor Rohdaten gespeichert werden und kein Austausch-Schritt existiert.
- [x] **Step 3: Importfluss ändern.** Nach Parsing und Prüfsummencheck alte Snapshots desselben vCenters sequenziell per `deleteSnapshot` löschen; neue Rohdaten/Entitäten schreiben; `putSnapshot` ausschließlich nach Erfolg aufrufen; im Catch Teilreste per `deleteSnapshot(snapshotId)` entfernen.
- [x] **Step 4: Fortschritt mappen.** Die Löschcallbacks liefern Details wie `vCenter: N Exporte ersetzen` und den jeweiligen Store; Rohdaten- und Entitätsfortschritt bleiben sichtbar.
- [x] **Step 5: Zieltest ausführen.** Erwartet: Pass.

### Task 3: Verwaiste Filter verhindern

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts`
- Modify: `src/hooks/useActiveSnapshots.test.tsx`

- [x] **Step 1: Test mit gespeicherter, nicht mehr vorhandener `snapshotId` schreiben.** Der Hook muss statt einer leeren Datenabfrage die neuesten gültigen Snapshots liefern.
- [x] **Step 2: Test ausführen.** Erwartet: Fail, weil `filters.snapshotIds` derzeit unverändert zurückgegeben wird.
- [x] **Step 3: Gültige IDs aus `snapshots` mit einem Set ableiten.** Nur gültige gewählte Snapshot-IDs verwenden; sind keine davon gültig, auf die pro vCenter neuesten Snapshots zurückfallen.
- [x] **Step 4: Test ausführen.** Erwartet: Pass.

### Task 4: Upload-Oberfläche und Gesamtprüfung

**Files:**
- Modify: `src/pages/UploadSnapshots.tsx`
- Test: `src/test/importService.test.ts`

- [x] **Step 1: Upload-Hinweis auf automatisches Ersetzen pro vCenter ändern.** Der Text darf nicht mehr wiederholte Uploads desselben vCenters ankündigen.
- [x] **Step 2: `npm run test`, `npm run lint` und `npm run build` ausführen.** Erwartet: alle Befehle mit Exit-Code 0.
- [x] **Step 3: `npx -y react-doctor@latest . --verbose --diff` ausführen und relevante neue Befunde beheben.**
- [x] **Step 4: Änderungen und neue Tests prüfen, dann committen.**
