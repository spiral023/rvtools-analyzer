# Design: Ein RVTools-Export pro vCenter

**Datum:** 2026-07-09
**Status:** Freigegeben

## Ziel

Pro vCenter wird nach einem neuen RVTools-Import nur noch dessen neuer Export gespeichert. Exporte anderer vCenter bleiben erhalten. Der Austausch darf in IndexedDB keine zweite vollständige Kopie desselben vCenters erzeugen.

## Entscheidungen

- Die Datei wird vollständig gelesen, gehasht und im Worker geparst, bevor bestehende Daten gelöscht werden.
- Nach der Validierung löscht der Import alle vorhandenen Snapshots des erkannten vCenters und schreibt anschließend den neuen Export.
- Bereits vorhandene Mehrfach-Exporte werden beim App-Start oder Update nicht automatisch bereinigt. Erst ein erneuter Import dieses vCenters ersetzt dessen alte Exporte.
- Der neue Snapshot wird erst nach erfolgreichen Rohdaten- und Entitätswrites als Metadatum gespeichert.
- Schlägt der neue Schreibvorgang fehl, löscht die Anwendung dessen Teilreste. Der vorherige Export ist dann wegen der Speicherbegrenzung nicht wiederherstellbar.
- Gespeicherte Snapshot- und vCenter-Filter werden gegen die aktuelle Snapshot-Liste validiert, damit entfernte IDs keine leeren Analysen verursachen.

## Ablauf

1. Datei lesen, Prüfsumme bilden und parsen.
2. Prüfsummen-Duplikate weiterhin ablehnen.
3. vCenter-ID bestimmen und die vorhandenen Snapshots dieses vCenters über den IndexedDB-Index ermitteln.
4. Alte Snapshots sequenziell mit den bestehenden Chunk-Löschhelfern löschen.
5. Rohdaten und normalisierte Entitäten des neuen Snapshots speichern.
6. Snapshot-Metadaten mit Importdauer schreiben.
7. Bei einem Fehler Teilreste des neuen Snapshot-IDs löschen und den Fehler an die Oberfläche zurückgeben.
8. TanStack-Query-Cache invalidieren und Filter gegen die neue Snapshot-Menge bereinigen.

## Fortschritt und Fehler

Die Importanzeige zeigt zusätzlich den vCenter-Namen, die Anzahl ersetzter Exporte, den laufenden Löschschritt mit Datensatzanzahl sowie den aktuellen Rohdaten- oder Entitätsfortschritt. Ein Fehler enthält den vCenter und den Hinweis, dass bereits entfernte Vorgänger nicht wiederhergestellt werden können.

## Nicht-Ziele

- Keine globale oder automatische Bereinigung bestehender Mehrfach-Exporte.
- Keine Snapshot-Historie oder Cross-Snapshot-Vergleiche.
- Kein Backend oder serverseitiger Speicher.

## Tests

- Gleicher vCenter: alter Export und seine Rohdaten werden beim erfolgreichen Neuimport entfernt.
- Unterschiedliche vCenter: beide Exporte bleiben vorhanden.
- Bestehende Mehrfach-Exporte bleiben ohne erneuten Import unverändert.
- Fehler beim Schreiben räumt Daten des neuen Snapshot-IDs auf.
- Verwaiste gespeicherte Filter fallen auf gültige aktuelle Snapshots zurück.
