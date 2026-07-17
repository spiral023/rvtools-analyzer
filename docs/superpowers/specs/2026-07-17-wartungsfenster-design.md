# Wartungsfenster-Katalog – Design

## Ziel

RVTools Analyzer erhält unter `/wartungsfenster` eine lokale Verwaltung für Wartungsfenster. Anwender können Definitionen manuell erstellen und komfortabel bearbeiten oder aus dem vorhandenen textbasierten Format importieren. Die Seite verknüpft die Definitionen unmittelbar mit dem Feld `maintenanceWindow` der zuletzt importierten TechInfo-Systeme und zeigt bekannte sowie unbekannte Zuordnungen.

Der Katalog startet leer. Die vom Anwender bereitgestellten Beispieldaten werden weder als Seed noch als Konstante in den Anwendungscode übernommen.

## Umfang

Die erste Version umfasst:

- neue Sidebar-Navigation und Route `Wartungsfenster`
- lokalen Wartungsfenster-Katalog in IndexedDB
- manuelles Erstellen, Bearbeiten, Duplizieren und Löschen
- Wochenplanung mit 30-Minuten-Auflösung
- Zeitfenster über Mitternacht
- besondere Behandlung für „jederzeit“, „nur nach Rücksprache“ und „extern definiert“
- optionale monatliche Regeln wie „1. und 3. Sonntag im Monat“
- Import des textbasierten 0/1-Formats mit Vorschau, Validierung und Upsert
- Zuordnung zu TechInfo-Systemen über die Abkürzung
- Anzeige unbekannter TechInfo-Werte samt Systemanzahl und Systemnamen
- lesbare und rohe Darstellung der Wochenmasken

Ein zeitlicher Summengraph über alle zugeordneten Systeme ist ein späteres Feature. Datenmodell und Zuordnungslogik werden so aufgebaut, dass der Graph ohne erneutes Parsen des Importtexts auf der kanonischen Wochenmaske aufsetzen kann.

## Fachliches Modell

### Wartungsfenster

Eine Definition enthält:

- `id`: stabile, generierte ID
- `abbreviation`: sichtbare und fachlich eindeutige Abkürzung
- `description`: freie Detailbeschreibung
- `handling`: `regular`, `always`, `approval-required` oder `external`
- `weeklySlots`: sieben Tagesmasken für Montag bis Sonntag mit jeweils 48 booleschen Halb-Stunden-Slots
- `calendarRules`: optionale monatliche Einschränkungen
- `createdAt` und `updatedAt`: ISO-Zeitstempel

In der kanonischen internen Darstellung bedeutet `true`, dass Wartung erlaubt ist. Nur das Austauschformat verwendet die invertierte historische Codierung:

- `0` = Wartung erlaubt
- `1` = Wartung gesperrt

Damit bleibt die Geschäftslogik lesbar, während Import und Rohmaskenansicht vollständig kompatibel bleiben.

### Behandlungsarten

- `regular`: Die Wochenmaske bestimmt die erlaubten Zeiträume.
- `always`: Alle 336 Halb-Stunden-Slots sind erlaubt.
- `approval-required`: Kein automatisch nutzbares Zeitfenster; die Beschreibung erklärt die notwendige Rücksprache.
- `external`: Kein automatisch nutzbares Zeitfenster; die konkrete Freigabe wird außerhalb der Anwendung bestimmt.

Bei `approval-required` und `external` bleibt die importierte Rohmaske erhalten, falls sie vollständig gesperrt ist. Der Status transportiert die fachliche Bedeutung, die aus 48 Einsen allein nicht ableitbar wäre.

### Kalenderregeln

Die Wochenmaske beschreibt das grundsätzlich mögliche Wochenfenster. Eine Kalenderregel schränkt es zusätzlich auf bestimmte Vorkommen eines Wochentags im Monat ein, beispielsweise den ersten und dritten Sonntag. Unterstützt werden erster bis fünfter sowie letzter Wochentag eines Monats. Die erste Version kombiniert Regeln als Vereinigung der ausgewählten Monatsvorkommen und anschließend als Schnittmenge mit der Wochenmaske.

### Eindeutigkeit und Normalisierung

Abkürzungen sind nach `trim()` und Unicode-fähiger Kleinschreibung eindeutig. Die ursprüngliche Schreibweise bleibt erhalten. Leere Abkürzungen sind ungültig.

TechInfo-Zuordnungen verwenden dieselbe Normalisierung für `TechInfoLatest.maintenanceWindow`. Ein leerer TechInfo-Wert zählt nicht als unbekanntes Wartungsfenster. Jeder nicht leere, nicht zuordenbare Wert erscheint gruppiert im Bereich „Unbekannte Wartungsfenster“.

## Persistenz und Datenfluss

Änderungen am Domain-Modell beginnen in `src/domain/models/types.ts`. IndexedDB erhält einen eigenen Store für Wartungsfenster; dafür wird `DB_VERSION` erhöht und eine additive Migration ergänzt. Bestehende Wartungsankündigungs-Stores bleiben unverändert.

CRUD-Zugriffe erfolgen über zentrale Helper in `src/data/db/index.ts`. Ein eigener TanStack-Query-Hook stellt Katalog, Mutationen und Invalidierung bereit. TechInfo-Systeme werden über den bestehenden datengetriebenen Zugriff geladen. Die Zuordnungslogik ist eine reine, separat getestete Funktion und liefert:

- Definitionen mit Systemanzahl und Systemliste
- Definitionen ohne zugeordnete Systeme
- unbekannte normalisierte Werte mit angezeigtem Originalwert, Anzahl und Systemliste

Die spätere Graphfunktion kann je System die zugeordnete Definition auflösen und die 336 Slots summieren.

## Benutzeroberfläche

### Informationsarchitektur

Die neue Route wird lazy in `src/App.tsx` eingebunden und im Bereich „Tools“ der Sidebar mit einem Kalender-/Zeitplan-Icon ergänzt. Sie ist von der bestehenden Seite „Wartungsankündigung“ getrennt: Dort werden konkrete Maßnahmen vorbereitet, hier werden wiederverwendbare Zeitdefinitionen gepflegt.

Die Seite besteht aus:

1. Kopfbereich mit Titel, kurzer Erklärung und Kennzahlen
2. Aktionsleiste mit Suche, „Neues Wartungsfenster“ und „Aus Text importieren“
3. Wartungsfenster-Katalog
4. fokussiertem Detail-Editor
5. Zuordnungsbereich für bekannte und unbekannte TechInfo-Werte

### Visuelle Richtung

Die `frontend-design`-Arbeitsweise wird bei der Implementierung ausdrücklich verwendet. Die Oberfläche erhält einen technisch-operativen, präzisen Charakter und integriert sich in die vorhandenen RVTools-Tokens für Hell-/Dunkelmodus. Das prägende Element ist ein klar ablesbarer „Wochenfahrplan“ statt einer generischen Formularsammlung. Primärfarbe, Erfolg, Warnung, Karten, Grenzen und Typografie stammen aus den bestehenden Design-Tokens.

Informationen werden nie ausschließlich durch Farbe vermittelt. Erlaubte und gesperrte Slots erhalten zusätzlich Symbole, Textlegende, zugängliche Namen und eindeutige Fokuszustände. Animationen bleiben kurz, funktional und beachten `prefers-reduced-motion`.

### Katalog

Jeder Eintrag zeigt Abkürzung, Beschreibung, Behandlungsart, zugeordnete Systemanzahl und eine kompakte Wochenvorschau. Die Liste ist suchbar und nach Abkürzung sortiert. Definitionen ohne Systeme werden nicht ausgeblendet.

Bei leerem Katalog erklärt ein Empty State beide Einstiege: manuell anlegen oder Text importieren. Es gibt keine Beispieldaten-Schaltfläche und keine automatisch angelegten Einträge.

### Editor

Der Editor bietet:

- Abkürzung und Beschreibung
- Auswahl der Behandlungsart
- Schnellauswahl „jederzeit“, „alles sperren“, „Werktage“ und „Wochenende“
- Regelzeile mit Wochentagen, Startzeit und Endzeit
- Unterstützung von Zeiträumen über Mitternacht
- optionalen Monatsregel-Editor
- direkt bearbeitbares Raster mit 7 Zeilen und 48 Halb-Stunden-Slots
- Werkzeugmodus „Erlaubt einzeichnen“ oder „Sperren“
- lesbare Zusammenfassung der resultierenden Regeln
- ein-/ausklappbare Rohmaskenansicht für Montag bis Sonntag
- Aktionen „Speichern“, „Duplizieren“ und „Löschen“

Änderungen werden zunächst als lokaler Entwurf gehalten. Ein Dirty-Indikator kennzeichnet ungespeicherte Änderungen. Das Wechseln zu einem anderen Eintrag bei ungespeicherten Änderungen erfordert eine Bestätigung. Löschen erfordert ebenfalls eine Bestätigung.

Das Wochenraster ist horizontal scrollbar, Tagesnamen und Zeitachse bleiben sichtbar. Auf schmalen Bildschirmen stehen Katalog und Editor untereinander, auf breiten Bildschirmen nebeneinander.

### Zuordnungen

Der Zuordnungsbereich zeigt bekannte Definitionen und unbekannte TechInfo-Werte. Gruppen lassen sich aufklappen, um Systemnamen zu sehen. Der Abgleich bezieht sich auf die neuesten TechInfo-Daten. Kennzahlen im Kopf zeigen mindestens:

- Anzahl definierter Wartungsfenster
- Anzahl zugeordneter Systeme
- Anzahl unterschiedlicher unbekannter Werte
- Anzahl Systeme mit unbekanntem Wert

## Textimport

### Eingabeformat

Der Dialog akzeptiert eingefügten Text mit optionaler Kopfzeile und beliebigen Leerzeilen. Ein Block besteht aus:

1. Abkürzung
2. Detailbeschreibung
3. Montagmaske
4. Dienstagmaske
5. Mittwochmaske
6. Donnerstagmaske
7. Freitagmaske
8. Samstagmaske
9. Sonntagmaske

Jede Maske enthält exakt 48 Zeichen aus `0` und `1`. Der Parser toleriert Zeilenenden aus Windows, Unix und kopierten Tabellen. Eine beschädigt dargestellte Kopfzeile wie `AbkÃ¼rzung` wird als Kopfzeile erkannt und ignoriert; fachliche Inhalte werden nicht pauschal umcodiert.

### Vorschau und Upsert

Der Parser verändert die Datenbank nicht. Er erzeugt eine Vorschau mit den Kategorien:

- neu
- Aktualisierung
- unverändert
- Warnung
- Fehler

Der Vergleich vorhandener Definitionen erfolgt über die normalisierte Abkürzung. Bei Bestätigung werden neue Einträge ergänzt und vorhandene Einträge aktualisiert. Nicht im Import vorkommende Definitionen bleiben unverändert. Alle gültigen Einträge werden in einer gemeinsamen Transaktion gespeichert; enthält die Auswahl Fehler, wird Speichern verhindert, bis die fehlerhaften Blöcke abgewählt oder korrigiert wurden.

### Erkennung aus Beschreibungen

Die Bitmasken sind die maßgebliche wöchentliche Zeitdefinition. Aus der Beschreibung werden unterstützte Zusatzinformationen vorgeschlagen:

- Zeitangaben und Wochentage für eine Plausibilitätsprüfung
- erster bis fünfter beziehungsweise letzter Wochentag im Monat
- „nur nach Rücksprache“ als `approval-required`
- Hinweise auf externe Festlegung als `external`
- ganztägige Verfügbarkeit als `always`

Erkannte Sonderregeln werden in der Vorschau sichtbar und können vor dem Import geändert werden. Eine nicht sicher interpretierbare Beschreibung bleibt vollständig erhalten und erzeugt höchstens eine Warnung. Widersprüche zwischen Text und Maske sind Warnungen, keine automatische Überschreibung der Maske.

### Validierung und Fehler

Validiert werden Blockstruktur, nicht leere Abkürzung, sieben Masken, Maskenlänge, erlaubte Zeichen und doppelte normalisierte Abkürzungen innerhalb eines Imports. Fehlermeldungen nennen Block, Feld und konkrete Ursache.

Parsing- und Validierungsfehler erscheinen im Dialog am Eintrag. Persistenzfehler erscheinen am Formular und als Toast. Erfolgreiche Mutationen invalidieren Katalog- und Zuordnungsqueries.

## Barrierefreiheit und Bedienung

- Alle Eingaben besitzen sichtbare Labels.
- Rasterzellen sind per Tastatur erreichbar und haben Namen mit Wochentag, Zeit und Zustand.
- Fokus lässt sich mit Pfeiltasten innerhalb des Rasters bewegen; Leertaste schaltet den Slot.
- Schaltflächen und Statusmeldungen besitzen verständliche Texte.
- Zustände werden durch Text/Symbol und nicht nur durch Farbe unterschieden.
- Dialoge halten Fokus und geben ihn nach dem Schließen an den Auslöser zurück.
- Die Oberfläche funktioniert in Hell- und Dunkelmodus sowie bei reduzierter Bewegung.

## Teststrategie

Die Implementierung folgt TDD. Tests werden vor dem jeweiligen Produktionscode geschrieben und zunächst mit der erwarteten Ursache rot ausgeführt.

### Reine Logik

- Umwandlung zwischen externer 0/1-Maske und internen booleschen Slots
- exakt 48 Halb-Stunden-Slots pro Tag
- Regelanwendung für einzelne Tage, Tagesgruppen und Zeiträume über Mitternacht
- Monatsregeln wie erster/dritter und letzter Sonntag
- lesbare Zusammenfassungen
- Parser mit Kopfzeilen, Leerzeilen und verschiedenen Zeilenenden
- Parserfehler für fehlende Tage, falsche Länge und ungültige Zeichen
- Beschreibungserkennung und Konfliktwarnungen
- normalisierte Zuordnung, unbekannte Werte und leere TechInfo-Werte

### Persistenz

- additive IndexedDB-Migration
- Erstellen, Lesen, Aktualisieren, Löschen und transaktionaler Upsert
- bestehende Daten bleiben bei Migration erhalten
- Wartungsfenster werden von „Alle Daten löschen“ und der Nutzerdaten-Sicherung konsistent berücksichtigt

### React-Oberfläche

- Empty State ohne Seed-Daten
- Route und Sidebar-Eintrag
- Erstellen und Bearbeiten über den Editor
- Rasterinteraktion und Tastaturbedienung
- Importvorschau und blockiertes Speichern bei Fehlern
- Upsert-Bestätigung
- bekannte und unbekannte TechInfo-Zuordnungen
- Schutz vor Verlust ungespeicherter Änderungen

Nach der Implementierung werden mindestens `npm run test`, `npm run lint`, `npm run typecheck` und `npm run build` ausgeführt.

## Abgrenzungen

- Kein Backend und keine serverseitige Persistenz
- Keine vorinstallierten Wartungsfenster
- Kein automatischer zeitlicher Summengraph in dieser Version
- Keine automatische Änderung von TechInfo-Daten
- Keine beliebige Freitext-Kalendersprache außerhalb der ausdrücklich unterstützten Regeln
- Keine Änderung der vorhandenen Wartungsankündigungslogik, außer einer möglichen späteren Nutzung des Katalogs

## Erfolgskriterien

Die Funktion ist erfolgreich, wenn ein leerer Katalog angezeigt wird, Anwender alle im Beispiel vorkommenden fachlichen Varianten manuell definieren können, der Beispieltext mit verständlicher Vorschau importierbar ist, bestehende Abkürzungen dabei aktualisiert und andere Definitionen beibehalten werden, TechInfo-Systeme sofort den Definitionen zugeordnet werden und unbekannte Werte nachvollziehbar sichtbar sind.
