# SysV-Modus: Spezifikation und Umsetzungsplan

**Datum:** 2026-08-03  
**Status:** Fachlich abgestimmt, bereit zur Umsetzung

## Ziel

Der RVTools Analyzer erhält anpassbare App-Modi für unterschiedliche
Benutzergruppen. Der bestehende Funktionsumfang bleibt als Standard im
**VM-Admin-Modus** vollständig erhalten. Ein neuer **SysV-Modus** optimiert die
App für Systemverantwortliche:

- ausgewählte Sidebar-Einträge werden ausgeblendet,
- nach dem Import kann eine Person oder Abteilung gewählt werden,
- aus dieser Auswahl wird ein normaler globaler Systemfilter erzeugt,
- die Auswahl ist freiwillig und der Filter kann jederzeit wieder entfernt
  werden,
- persönliche Einstellungen und Tabellenkonfigurationen bleiben exportierbar.

Der SysV-Modus ist eine lokale Komfort- und Personalisierungsfunktion. Er ist
ausdrücklich **kein Berechtigungs- oder Sicherheitsmechanismus**. Direkte URLs,
lokale Rohdaten und Exporte werden nicht technisch gegen den Benutzer
abgeschottet.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| VM-Admin-Modus | Standardmodus mit unveränderter Navigation und vollem Funktionsumfang |
| SysV-Modus | reduzierte Navigation und optionaler personenbezogener Systemfilter |
| SysV | primär systemverantwortliche Person aus dem Tech-Info-Feld `SysV` |
| SysVStv | stellvertretende Person aus dem Tech-Info-Feld `SysVStv` |
| persönlicher Scope | Person, Abteilung oder „Alle Systeme“ als Auswahl nach dem Import |
| Modusdatei | `modus.json` innerhalb oder außerhalb eines hochgeladenen ZIP-Pakets |

## Fachliche Entscheidungen

### Modus

- Ohne gespeicherten Zustand startet die App im Modus `vm-admin`.
- Ein Moduswechsel ist ausschließlich durch den Import einer gültigen
  `modus.json` möglich.
- Es gibt keinen einfachen Modus-Umschalter in der Oberfläche.
- Fehlt `modus.json` in einem späteren Upload, bleibt der zuletzt aktivierte
  Modus erhalten.
- Nach einem Reload bleibt der aktive Modus lokal gespeichert.

### SysV-Aktivierung

Eine `modus.json` mit `mode: "sysv"` wird zunächst nur als gewünschter Modus
vorgemerkt. Der Modus wird erst nach Abschluss des gesamten Upload-Batches
aktiviert, wenn im selben Batch mindestens

1. ein RVTools-Import und
2. ein Tech-Info-Server-Import

erfolgreich waren. Die Reihenfolge der Dateien im ZIP ist dabei unerheblich.
Andere mitgelieferte Datenquellen dürfen unabhängig davon erfolgreich oder
fehlerhaft sein.

Bereits früher importierte RVTools- oder Tech-Info-Daten erfüllen diese
Voraussetzung nicht. Dadurch bildet das hochgeladene Paket einen
nachvollziehbaren, in sich vollständigen SysV-Arbeitsstand.

Wird dagegen **ausschließlich** eine gültige `modus.json` hochgeladen, wechselt
die App unmittelbar in den darin angegebenen Modus. Für `mode: "sysv"` öffnet
sich anschließend immer die Auswahl des persönlichen Systemkontexts – auch
wenn der SysV-Modus bereits aktiv war. So kann der Modus unabhängig von einem
erneuten Datenimport gezielt eingestellt werden.

Eine `modus.json` mit `mode: "vm-admin"` benötigt keine RVTools- oder
Tech-Info-Dateien. Sie wird nach erfolgreicher Validierung am Ende des Batches
angewendet.

### Auswahl und Filter

Nach jeder erfolgreichen Aktivierung eines SysV-Pakets öffnet sich ein Dialog
mit genau drei Auswahlmöglichkeiten:

1. **Person**
2. **Abteilung**
3. **Alle Systeme**

Die Auswahl ist optional. Wird sie übersprungen oder „Alle Systeme“ gewählt,
wird kein globaler Systemfilter gesetzt und alle Systeme bleiben sichtbar.

Eine zuvor gespeicherte Person oder Abteilung wird im Dialog vorausgewählt,
wenn sie in den neu importierten Tech-Info-Daten eindeutig wiedergefunden wird.
Der Dialog erscheint trotzdem, damit die Auswahl bestätigt oder geändert
werden kann. Ist der gespeicherte Wert nicht mehr vorhanden oder mehrdeutig,
wird „Alle Systeme“ vorausgewählt.

Der erzeugte Filter ist ein gewöhnlicher globaler Filter:

- Er kann im vorhandenen Filterdialog bearbeitet oder vollständig entfernt
  werden.
- Er begrenzt Exporte nicht dauerhaft. Exporte folgen dem jeweils aktuell
  aktiven Filterzustand.
- Wird der Filter entfernt, werden wieder alle Systeme angezeigt.
- Es gibt keinen versteckten oder erzwungenen Basis-Scope.

Die Auswahl nach einem SysV-Import ersetzt eine eventuell zuvor vorhandene
Definition in `filters.globalFilter`. Die übrigen Filterbestandteile wie
vCenter, Cluster, Host, Datastore, Suche und VM-Power-Scope bleiben
unverändert.

## Zuordnungsregeln

### Person

Eine gewählte Person sieht alle VMs, bei denen ihr Name in mindestens einer
der beiden Rollen vorkommt:

```text
Tech-Info.SysV = gewählte Person
ODER
Tech-Info.SysVStv = gewählte Person
```

Personen, die ausschließlich als Stellvertretung vorkommen, müssen ebenfalls
in der Auswahlliste erscheinen. Eine VM, auf der dieselbe Person sowohl als
SysV als auch als SysVStv eingetragen ist, erscheint im Ergebnis nur einmal.

Der Namensvergleich ignoriert Groß-/Kleinschreibung, führende und nachfolgende
Leerzeichen sowie mehrfach aufeinanderfolgende Leerzeichen.

### Abteilung

Bei einer Abteilung wird analog über beide Rollen gefiltert:

```text
Tech-Info.SysV Abteilung = gewählte Abteilung
ODER
Tech-Info.SysVStv Abteilung = gewählte Abteilung
```

Eine Abteilung wird anhand ihres vollständigen normalisierten Pfads
identifiziert, zum Beispiel `FIRMA/BEREICH-ABTEILUNG`. Nur der kurze
Abteilungscode reicht nicht aus, weil derselbe Code in mehreren Organisationen
oder Bereichen vorkommen kann.

Für den Vergleich werden Groß-/Kleinschreibung und umgebende Leerzeichen
ignoriert. Die fachliche Zerlegung folgt dem bestehenden Format:

```text
<Organisation>/<Bereich>-<Abteilung>
```

### Personenname und Kontaktfelder

Tech-Info liefert Namen im Format:

```text
NACHNAME Vorname
```

Für die Kontaktvorgaben gilt:

- Der erste durch Leerraum getrennte Bestandteil wird als Nachname übernommen.
- Alle folgenden Bestandteile werden gemeinsam als Vorname übernommen.
- Der sichtbare Originalname bleibt zusätzlich als Anzeigename erhalten.
- Kann der Wert nicht eindeutig zerlegt werden, bleibt der vollständige
  Anzeigename erhalten und leere Teilfelder werden nicht künstlich ergänzt.
- Eine E-Mail-Adresse wird für den SysV-Modus nicht benötigt und darf leer
  bleiben.

Beispiele:

| Tech-Info-Wert | Nachname | Vorname |
|---|---|---|
| `MUSTERMANN Max` | `MUSTERMANN` | `Max` |
| `MUSTERMANN Max Peter` | `MUSTERMANN` | `Max Peter` |
| `MUSTERMANN` | `MUSTERMANN` | leer |

Diese Regel setzt den vereinbarten Tech-Info-Datenvertrag voraus. Eine
allgemeine Erkennung mehrteiliger Nachnamen ist nicht Bestandteil dieses
Features.

## Modusdatei

### Dateiname und Erkennung

- Der Dateiname lautet `modus.json`; die Erkennung erfolgt ohne Beachtung der
  Groß-/Kleinschreibung.
- Die Datei darf direkt hochgeladen oder in einem ZIP enthalten sein.
- ZIP-Unterordner sind für die Erkennung unerheblich; maßgeblich ist der
  Basisdateiname.
- Die Datei wird vor der bisherigen generischen JSON-Backup-Erkennung
  klassifiziert.
- Eine normale Userdaten-Backup-Datei bleibt weiterhin über ihr bestehendes
  `kind`-Feld erkennbar und importierbar.

### Format Version 1

SysV-Modus:

```json
{
  "kind": "rvtools-analyzer-mode",
  "version": 1,
  "mode": "sysv"
}
```

VM-Admin-Modus:

```json
{
  "kind": "rvtools-analyzer-mode",
  "version": 1,
  "mode": "vm-admin"
}
```

Zusätzliche unbekannte Felder dürfen für Vorwärtskompatibilität ignoriert
werden. `kind`, `version` und `mode` müssen dagegen strikt validiert werden.

### Fehlerfälle

- Eine ungültige `modus.json` ändert den aktiven Modus nicht.
- Die übrigen Dateien des Batches dürfen trotzdem importiert werden.
- Der Upload zeigt für die Modusdatei einen klaren Fehler mit Ursache.
- Mehrere `modus.json`-Dateien in einem Batch sind mehrdeutig und werden als
  Fehler behandelt; der aktive Modus bleibt unverändert.
- Sind die Voraussetzungen für den SysV-Modus nicht erfüllt, bleibt der
  aktuelle Modus unverändert und der Upload erklärt, ob RVTools oder
  Tech-Info Server gefehlt beziehungsweise fehlgeschlagen ist.

## Navigation

Im VM-Admin-Modus bleibt die bestehende Sidebar unverändert.

Im SysV-Modus werden ausschließlich folgende Einträge ausgeblendet:

- **Netzwerk-Kontrolle** (`/network-audit`)
- **Wartung** (`/wartungsankuendigung`)
- **Hardware** (`/hardware`)

Alle anderen Sidebar-Einträge bleiben erhalten, insbesondere
**Wartungsfenster**. Die Routen bleiben registriert und können über eine direkte
URL weiterhin geöffnet werden. Es werden bewusst keine Route Guards oder
Weiterleitungen eingeführt.

## Dialog und Settings

### Einrichtungsdialog nach dem Import

Der Dialog öffnet sich erst, nachdem der Batch beendet, der SysV-Modus
erfolgreich aktiviert und die betroffenen Queries invalidiert wurden. Dadurch
stehen die neu importierten Tech-Info-Daten für die Auswahl bereit.

Der Dialog enthält:

- eine gut sichtbare Option „Alle Systeme“,
- eine hierarchische Auswahl
  `Organisation → Bereich → Abteilung → Person`,
- auswählbare Abteilungsknoten,
- auswählbare Personenknoten,
- Personen aus Primär- und Stellvertretungsrollen,
- die Anzahl der jeweils zugeordneten, deduplizierten Systeme,
- „Übernehmen“ und „Überspringen“.

Organisationen und Bereiche dienen der Navigation und sind in Version 1 nicht
selbst als Scope auswählbar. „Überspringen“ entspricht „Alle Systeme“.

Die vorhandene Tech-Info-Organisationslogik und deren Normalisierung sollen
wiederverwendet beziehungsweise in eine gemeinsam nutzbare reine Hilfsfunktion
extrahiert werden. Die bestehende Analysebaum-Darstellung muss nicht
unverändert in den kompakteren Dialog eingebettet werden.

### Settings

Sobald Tech-Info-Daten vorhanden sind, erhalten die Settings einen Abschnitt
**Persönlicher Systemkontext**. Dort kann der Benutzer unabhängig vom
Importdialog

- „Alle Systeme“,
- eine Abteilung oder
- eine Person

aus derselben Hierarchie wählen. Die Übernahme erzeugt denselben globalen
Filter wie der Importdialog.

Bei Auswahl einer Person werden Vor- und Nachname gemäß dem vereinbarten
`NACHNAME Vorname`-Format in die bestehenden Kontaktvorgaben übernommen. Die
E-Mail-Adresse bleibt unverändert beziehungsweise leer. Eine Abteilungsauswahl
ändert die persönlichen Kontaktfelder nicht.

Der aktive App-Modus wird in den Settings nur angezeigt, nicht umgeschaltet.
Ein kurzer Hinweis erklärt, dass der Modus ausschließlich über `modus.json`
geändert wird.

## Persistenz und Backup

### Lokaler Zustand

Folgende Werte werden lokal gespeichert:

- aktiver App-Modus,
- zuletzt gewählte Scope-Art (`all`, `person`, `department`),
- Anzeigename und normalisierter Schlüssel der Person beziehungsweise der
  vollständige Abteilungspfad,
- Zeitpunkt der letzten Änderung.

Der App-Modus und die persönliche Auswahl werden im zentralen Domain-Modell
typisiert. Für die Persistenz kann ein eigener Datensatz im bestehenden
`ui_state`-Store verwendet werden. Dadurch ist kein neuer IndexedDB-Store und
keine Erhöhung von `DB_VERSION` erforderlich. Schreiber anderer
`ui_state`-Datensätze dürfen den Modusdatensatz nicht überschreiben.

Während der asynchronen Hydrierung darf die Sidebar nicht kurz die falschen
modusabhängigen Einträge anzeigen. Der Mode-Provider stellt deshalb einen
Hydrierungsstatus bereit oder hält die modusabhängigen Einträge bis zum
Abschluss der Hydrierung zurück.

### Userdaten-Backup

Das bestehende Backup-Format wird auf Version 8 erhöht. Zusätzlich exportiert
werden:

- die zuletzt gewählte persönliche Scope-Art,
- Personen-Anzeigename und normalisierter Personenschlüssel oder
- der vollständige Abteilungspfad.

Nicht exportiert wird der aktive App-Modus. Dieser wird ausschließlich durch
`modus.json` bestimmt. Bestehende Backups der Versionen 1 bis 7 bleiben
importierbar. Ein Backup-Import darf den aktuellen App-Modus nicht verändern.

Tabellenansichten, Spaltenkonfigurationen und alle bisher enthaltenen
Benutzerdaten werden unverändert weiter exportiert und importiert.

## Technischer Entwurf

### Domain-Typen

In `src/domain/models/types.ts` werden mindestens folgende Typen ergänzt:

```ts
export type AppMode = "vm-admin" | "sysv";

export type SysvScopePreference =
  | { kind: "all" }
  | { kind: "person"; displayName: string; normalizedName: string }
  | { kind: "department"; displayName: string; normalizedPath: string };

export interface AppModeState {
  mode: AppMode;
  lastSysvScope: SysvScopePreference;
  updatedAt: string;
}
```

Die exakte Persistenzhülle kann an den bestehenden `UiState` angepasst werden.
`ImportFileKind` erhält einen eindeutigen Typ für die Modusdatei, damit die
Upload-Liste einen verständlichen Status anzeigen kann.

### Neue beziehungsweise angepasste Bausteine

Vorgesehene Verantwortlichkeiten:

| Datei/Bereich | Änderung |
|---|---|
| `src/domain/models/types.ts` | Modus-, Scope- und Importtypen ergänzen |
| `src/lib/appMode.ts` | `modus.json` strikt parsen, validieren und serialisierbare Zustände normalisieren |
| `src/lib/sysvScope.ts` | Personen-/Abteilungsverzeichnis, Namenszerlegung und globale Filterdefinitionen als reine Funktionen |
| `src/hooks/useAppMode.tsx` | Modus laden, persistieren und Aktivierungsereignis für den Dialog bereitstellen |
| `src/hooks/useImportController.tsx` | Modusdatei vorab klassifizieren, Batch-Erfolg auswerten und Modus erst anschließend übernehmen |
| `src/components/sysv/SysvScopeDialog.tsx` | Auswahl nach erfolgreichem SysV-Import |
| `src/components/sysv/SysvScopeTree.tsx` | kompakte hierarchische Personen-/Abteilungsauswahl |
| `src/app/layout/AppSidebar.tsx` | drei Einträge abhängig vom Modus filtern |
| `src/pages/Settings.tsx` | aktiven Modus anzeigen und persönliche Auswahl anbieten |
| `src/lib/backup/userDataBackup.ts` | Backup-Version 8 und Scope-Präferenz |
| `src/domain/services/backupService.ts` | Scope-Präferenz sammeln und anwenden, Modus bewusst auslassen |

### Provider- und Ereignisfluss

Der Modus muss für Import, Sidebar, Settings und Dialog zentral verfügbar sein.
Ein `AppModeProvider` wird deshalb oberhalb dieser Verbraucher eingebunden.
Der SysV-Auswahldialog wird innerhalb des `FilterProvider` gerendert, damit er
den bestehenden globalen Filter über `setFilters` setzen kann.

Vereinfachter Ablauf:

```text
ZIP auswählen
  → Dateien entpacken
  → modus.json erkennen und validieren
  → übrige Dateien importieren
  → Batch-Ergebnisse auswerten
  → Modus atomar übernehmen oder unverändert lassen
  → Queries invalidieren
  → bei erfolgreichem SysV-Modus Auswahldialog öffnen
  → Auswahl in filters.globalFilter schreiben
```

### Filterstruktur

Der Personenfilter wird mit den vorhandenen `GlobalFilterGroup`- und
`GlobalFilterRule`-Typen aufgebaut. Fachlich entspricht er einer Root-ODER-
Gruppe mit zwei Tech-Info-Regeln:

```text
root (OR)
├── techInfo: sysv eq <Person>
└── techInfo: sysvDeputy eq <Person>
```

Der Abteilungsfilter verwendet dieselbe Struktur mit `sysvDepartment` und
`sysvDeputyDepartment`. Die bestehende globale Filter-Engine bleibt die
einzige Quelle für die tatsächliche VM-Selektion.

## Umsetzungsschritte

### Phase 1: Reine Domain- und Parserlogik

1. Domain-Typen für App-Modus, Scope-Präferenz und Modus-Import ergänzen.
2. Parser und Validator für `modus.json` implementieren.
3. Normalisierung für Personen und Abteilungspfade festlegen.
4. `NACHNAME Vorname` in Kontaktfelder zerlegen.
5. Personen- und Abteilungsverzeichnis aus Primär- und Stellvertretungsdaten
   dedupliziert aufbauen.
6. Globale Personen- und Abteilungsfilter als reine Funktionen erzeugen.

### Phase 2: Persistenz und Provider

1. separaten App-Modus-Zustand im vorhandenen `ui_state`-Store speichern,
2. `AppModeProvider` mit Hydrierungsstatus einführen,
3. Standardwert `vm-admin` und Wiederherstellung nach Reload testen,
4. App-Modus und Scope-Präferenz voneinander getrennt behandelbar machen.

### Phase 3: Importintegration

1. `modus.json` beim direkten Upload und nach ZIP-Expansion erkennen,
2. Kollision mit dem Userdaten-Backup-Import verhindern,
3. mehrere oder ungültige Modusdateien als eigenen Importfehler darstellen,
4. erfolgreiche RVTools- und Tech-Info-Server-Ergebnisse pro Batch erfassen,
5. SysV-Modus nur bei erfüllten Voraussetzungen übernehmen,
6. VM-Admin-Modus über eine gültige Modusdatei wiederherstellen,
7. Dialogereignis erst nach Query-Invalidierung auslösen.

### Phase 4: UI

1. Sidebar-Einträge anhand des aktiven Modus filtern,
2. hierarchischen Scope-Dialog implementieren,
3. gespeicherte Auswahl vorauswählen und „Alle Systeme“ anbieten,
4. Auswahl in einen entfernbaren globalen Filter übersetzen,
5. Settings um Modusanzeige und persönliche Tech-Info-Auswahl erweitern,
6. Personenauswahl mit Kontaktvorgaben synchronisieren.

### Phase 5: Backup und Kompatibilität

1. Userdaten-Backup auf Version 8 erhöhen,
2. persönliche Scope-Präferenz exportieren und importieren,
3. App-Modus bewusst nicht in das Backup aufnehmen,
4. Rückwärtskompatibilität für Version 1 bis 7 testen,
5. bestehende Tabellenpräferenzen unverändert erhalten.

### Phase 6: Qualitätssicherung

Mindestens folgende automatisierte Tests werden ergänzt:

#### Modusdatei

- gültiger SysV-Modus,
- gültiger VM-Admin-Modus,
- falsches `kind`, unbekannte Version und unbekannter Modus,
- ungültiges JSON,
- mehrere `modus.json`-Dateien,
- direkte Datei und Datei aus einem ZIP,
- normale Userdaten-Backups bleiben korrekt klassifiziert.

#### Batch-Aktivierung

- SysV + erfolgreicher RVTools- und Tech-Info-Import aktiviert den Modus,
- fehlender oder fehlgeschlagener RVTools-Import aktiviert ihn nicht,
- fehlender oder fehlgeschlagener Tech-Info-Import aktiviert ihn nicht,
- andere fehlgeschlagene Dateitypen blockieren die Aktivierung nicht,
- VM-Admin-Datei beendet den SysV-Modus,
- Upload ohne Modusdatei verändert den aktuellen Modus nicht,
- ungültige Modusdatei verändert den aktuellen Modus nicht.

#### Zuordnung und Filter

- Person matcht `SysV`, `SysVStv` und beide Rollen,
- eine VM wird bei doppelter Rolle nur einmal geliefert,
- reine Stellvertretungen erscheinen in der Personenauswahl,
- Groß-/Kleinschreibung und zusätzliche Leerzeichen werden ignoriert,
- Abteilungen matchen Primär- und Stellvertretungsabteilung,
- identische Abteilungscodes in verschiedenen Pfaden bleiben getrennt,
- „Alle Systeme“ und „Überspringen“ entfernen den globalen Filter,
- ein gesetzter Filter kann über die bestehende UI entfernt werden.

#### Name und Settings

- `MUSTERMANN Max` wird korrekt zerlegt,
- mehrere Vornamen bleiben gemeinsam erhalten,
- ein einzelner Namensbestandteil wird sicher behandelt,
- Personenauswahl füllt Vor- und Nachname,
- Abteilungsauswahl verändert Kontaktfelder nicht,
- fehlende E-Mail blockiert weder Auswahl noch Speichern.

#### Navigation

- VM-Admin sieht alle bisherigen Einträge,
- SysV sieht Netzwerk-Kontrolle, Wartung und Hardware nicht,
- Wartungsfenster bleibt sichtbar,
- direkte Routen bleiben registriert und aufrufbar,
- während der Modushydrierung entsteht kein sichtbarer Navigationswechsel.

#### Backup

- Version 8 enthält die persönliche Scope-Präferenz,
- Version 8 enthält nicht den aktiven App-Modus,
- Backups der Versionen 1 bis 7 bleiben importierbar,
- Scope-Import verändert den Modus nicht,
- Tabellen- und Spaltenkonfigurationen bleiben vollständig erhalten.

Abschließend werden gemäß Repository-Regeln ausgeführt:

```text
npm run test
npm run lint
npm run build
```

## Abnahmekriterien

- Eine frische App läuft ohne `modus.json` unverändert im VM-Admin-Modus.
- Eine gültige SysV-Modusdatei aktiviert den Modus nur nach erfolgreichem
  RVTools- und Tech-Info-Server-Import desselben Batches.
- Nach der Aktivierung erscheint der Auswahldialog mit Person, Abteilung und
  „Alle Systeme“.
- Eine Person sieht über den automatisch erzeugten Filter alle Systeme, auf
  denen sie SysV oder SysVStv ist.
- Eine Abteilung sieht über den Filter alle Systeme aus primärer oder
  stellvertretender Abteilungszuordnung.
- Der Benutzer kann den Filter vollständig entfernen und danach alle Systeme
  sowie ungefilterte Exporte verwenden.
- Im SysV-Modus fehlen ausschließlich Netzwerk-Kontrolle, Wartung und Hardware
  in der Sidebar; direkte URLs bleiben unverändert.
- Eine gültige `modus.json` mit `vm-admin` stellt die vollständige Navigation
  wieder her.
- Die Settings erlauben bei vorhandenen Tech-Info-Daten die hierarchische
  Auswahl einer Person oder Abteilung.
- Die Personenauswahl übernimmt Namen im Format `NACHNAME Vorname`; eine
  E-Mail-Adresse ist nicht erforderlich.
- Der Userdaten-Export enthält weiterhin alle bisherigen Einstellungen und
  Tabellenkonfigurationen sowie die letzte persönliche Scope-Auswahl, aber
  nicht den App-Modus.
- Fehlerhafte oder mehrdeutige Modusdateien verändern den bestehenden Modus
  nicht und verhindern nicht den Import unabhängiger Datendateien.

## Nicht-Ziele

- keine Authentifizierung oder Benutzerverwaltung,
- keine technische Zugriffskontrolle auf Seiten, direkte URLs oder lokale
  Daten,
- keine erzwungene Begrenzung von Exporten,
- keine serverseitige Persistenz und kein Backend,
- keine auswählbaren Organisations- oder Bereichs-Scope-Knoten in Version 1,
- keine automatische Ermittlung einer E-Mail-Adresse,
- keine allgemeine Namensanalyse außerhalb des vereinbarten Formats
  `NACHNAME Vorname`,
- keine Änderung der bestehenden globalen Filter-Engine über die benötigten
  wiederverwendbaren Filterdefinitionen hinaus.
