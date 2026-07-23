# Vollständiges Importdaten-Preloading — Design

**Datum:** 2026-07-23
**Status:** Zur Freigabe dokumentiert

## Ziel

Die App hält große, aus IndexedDB geladene Analyse-Datensätze künftig eine Stunde im
TanStack-Query-Arbeitsspeicher. Zusätzlich erhält der globale Header eine Aktion, die auf
Wunsch sämtliche importierten Dateien und Daten unabhängig vom aktuellen vCenter-Filter
vorlädt. Nach erfolgreichem Vorladen sollen Seitenwechsel deutlich weniger Skeleton-Zustände
zeigen, weil die von den Seiten verwendeten Query-Keys bereits befüllt sind.

## Verbindliche Bedeutung von „alle importierten Daten“

Das Preloading umfasst alle im Browser vorhandenen Importarten und alle importierten
RVTools-Snapshots, nicht nur den momentan gefilterten Snapshot-Scope:

- Snapshot-Metadaten und alle normalisierten VM-, Host-, Cluster-, Datastore-, Snapshot- und
  Health-Datensätze aller vCenter.
- Alle in `rawSheetBlobs` persistierten RVTools-Rohdaten-Sheets aller Snapshots. Die bestehende
  Import-Allowlist bleibt maßgeblich; Daten, die beim Import absichtlich nicht persistiert
  werden, können nachträglich nicht vorgeladen werden.
- Import-Metadaten und gespeicherte Zeilen für Tech-Info, Tech-Info-Client, CDP, IPAM,
  Eramon-Interface und Eramon-L2 sowie deren zusammengeführte `latest`-Sichten.

Konfigurationsdaten wie Theme, Filterzustand, Szenarien oder Wartungsfenster sind keine
Importdaten und werden nicht als Teil des langen Daten-Preloads gezählt. Ihre normalen Queries
bleiben unverändert.

## Cache-Verhalten

- Eine gemeinsame Konstante `QUERY_CACHE_DURATION_MS = 60 * 60 * 1000` ersetzt die verstreuten
  5-Minuten-Werte in `App.tsx`, `useActiveSnapshots.ts`, `useGlobalVmFilter.ts` und
  `useFilterState.tsx`.
- `staleTime` und das `gcTime` der großen Raw-Sheet-Queries betragen jeweils eine Stunde.
  Eine unbenutzte Query bleibt damit ab ihrem letzten aktiven Observer bis zu einer Stunde im
  Speicher; innerhalb der Frischezeit löst ein Seitenwechsel keinen IndexedDB-Refetch aus.
- Import- und Löschvorgänge invalidieren die betroffenen Queries weiterhin. Neue Daten werden
  daher nicht durch die längere Frischezeit verdeckt.
- „Eine Stunde“ ist keine persistente Browser-Garantie: Reload, Tab-Schließen, Browser-
  Speicherdruck oder ein Import/Löschvorgang können den schnellen Arbeitsspeicher früher leeren.
  Die dauerhaften Daten bleiben unverändert in IndexedDB.

## Preload-Architektur

Ein fokussierter Preload-Service definiert einen expliziten Katalog aus Schritten. Jeder Schritt
besitzt einen verständlichen Namen, einen TanStack-Query-Key und eine Ladefunktion. Der Service
lädt in kontrollierter Reihenfolge, damit gleichzeitiges Dekomprimieren vieler großer
Raw-Sheet-Blobs den Main Thread und Heap nicht unnötig belastet.

1. Import-Metadaten und Snapshot-Liste lesen.
2. Alle normalisierten Snapshot-Entitäten mit der vollständigen Snapshot-ID-Liste laden.
3. Die vorhandenen Raw-Sheet-Namen je Snapshot ermitteln und jedes gespeicherte Sheet für alle
   Snapshots laden und dekomprimieren.
4. Sämtliche Zeilen und `latest`-Sichten der zusätzlichen Importarten laden.
5. Die Query-Daten unter den kanonischen Keys ablegen, die Analyseseiten verwenden.

Damit Filterwechsel nicht wieder neue IndexedDB-Lesevorgänge erzeugen, greifen die zentralen
Hooks auf kanonische All-Snapshot-Queries zu und schneiden den aktuell sichtbaren Snapshot-Scope
im Speicher zu. Seiten-spezifische Fleet-Keys werden auf dieselben kanonischen Daten
ausgerichtet. Es werden keine versteckten Seiten gerendert und keine Navigation simuliert.

Der Preload-Service akzeptiert einen Fortschritts-Callback und liefert pro abgeschlossenem
Schritt die Zahl geladener Records. Ein einzelner fehlgeschlagener Schritt beendet den Vorgang
mit einer verständlichen Fehlermeldung; bereits erfolgreich geladene Queries bleiben erhalten.
Ein erneuter Klick kann den Vorgang neu starten.

## Benutzeroberfläche

Rechts im globalen Header erscheint ein Icon-Button mit Datenbank-/Beschleunigungsmetapher,
Tooltip, zugänglichem Namen und deaktiviertem Zustand, falls keine Importdaten vorhanden sind.

Nach dem Klick liegt ein modales Vollseiten-Overlay über der App. Der Hintergrund wird unscharf
und ist weder per Maus noch Tastatur bedienbar. Das Overlay zeigt:

- Titel „Importierte Daten werden vorgeladen“.
- Erklärung, dass Daten aus der dauerhaften IndexedDB in den schnellen Arbeitsspeicher gelesen
  werden, um Skeleton-Ladeanzeigen und Wartezeiten bei Seitenwechseln zu reduzieren.
- Hinweis auf eine typische Dauer von etwa 1–3 Minuten abhängig von Datenmenge und Gerät.
- Hinweis auf die Cache-Dauer von bis zu einer Stunde und die oben genannten Browser-Grenzen.
- Einen determinierten Fortschrittsbalken nach abgeschlossenen Preload-Schritten.
- Den aktuell geladenen Bereich, Anzahl abgeschlossener Bereiche und die kumulativ verarbeiteten
  Records.

Während des Vorgangs gibt es bewusst keinen Abbrechen-Button: Ein Abbruch mitten in großen
IndexedDB-/Dekompressionsoperationen wäre nicht zuverlässig und könnte einen missverständlichen
Teilzustand erzeugen. Nach Erfolg schließt sich das Overlay und ein Toast bestätigt Record-Zahl
und Cache-Dauer. Bei einem Fehler bleibt eine Fehlermeldung mit Schließen-/Erneut-versuchen-
Möglichkeit sichtbar.

## Komponenten und Dateien

- `src/lib/queryCache.ts` — gemeinsame Ein-Stunden-Konstanten und kanonische Query-Key-Helfer.
- `src/lib/preloadImportedData.ts` — Preload-Katalog, Orchestrierung und Fortschrittstypen.
- `src/hooks/useImportedDataPreload.ts` — UI-Zustand und Anbindung an den QueryClient.
- `src/components/layout/ImportedDataPreloadControl.tsx` — Header-Button und blockierendes Overlay.
- `src/app/layout/AppLayout.tsx` — Einhängen der globalen Aktion.
- `src/App.tsx`, `src/hooks/useActiveSnapshots.ts`, `src/hooks/useGlobalVmFilter.ts`,
  `src/hooks/useFilterState.tsx`, `src/pages/FleetCompare.tsx` — gemeinsame Cache-Dauer und
  kanonische All-Snapshot-Datenverwendung.
- `src/data/db/index.ts` — fokussierte read-only Helfer für vorhandene Raw-Sheet-Namen und
  vollständige importbezogene Stores; keine Schema- oder `DB_VERSION`-Änderung.
- Zugehörige Vitest-Tests für Cache-Konfiguration, Katalog/Progress, Fehlerzustand und UI.

## Fehler- und Speicherschutz

- Kein paralleles Voll-Laden aller großen Sheets; große Schritte laufen nacheinander.
- Fortschrittsupdates erfolgen nur zwischen Datensätzen/Sheets, nicht pro Zeile, um unnötige
  React-Renders zu vermeiden.
- Fehlermeldungen nennen den betroffenen Bereich, ohne IndexedDB-Inhalte zu verändern.
- Der Button startet nicht mehrfach parallel.
- Beim nächsten Import oder Löschen werden die betroffenen Cache-Einträge invalidiert.
- Da der Auftrag ausdrücklich alle importierten Daten umfasst, kann der Heap deutlich wachsen.
  Das Overlay erklärt deshalb, dass Browser-Speicherdruck die zugesagte Stunde verkürzen kann.

## Tests und Abnahme

- Cache-Konstanten entsprechen exakt einer Stunde und werden von allen relevanten Queries
  verwendet.
- Der Preload-Katalog umfasst alle Snapshot-Entitäten, alle tatsächlich gespeicherten Raw-Sheets
  und alle zusätzlichen Import-Stores unabhängig vom aktiven Filter.
- Query-Keys stimmen mit den Seiten-Hooks überein; ein Seitenwechsel nach Preload verursacht
  keinen erneuten IndexedDB-Aufruf.
- Fortschritt ist monoton, endet bei 100 Prozent und summiert die Record-Zahlen korrekt.
- Während des Ladens ist die App blockiert; Erklärung, 1–3-Minuten-Hinweis, aktueller Bereich,
  Fortschritt und Record-Zahl sind sichtbar.
- Fehler und Wiederholung sind bedienbar und zugänglich.
- Vollständige Projekt-Tests, ESLint, React Doctor und Production-Build laufen vor Push/Deploy.

## Nicht-Ziele

- Keine persistente Cache-Kopie außerhalb von IndexedDB.
- Kein Service Worker und kein Backend.
- Kein Vorladen beim normalen App-Start; die speicherintensive Aktion bleibt ausdrücklich
  nutzergesteuert.
- Keine Änderung daran, welche RVTools-Sheets beim Import überhaupt gespeichert werden.
