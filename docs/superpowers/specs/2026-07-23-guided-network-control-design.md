# Geführte Netzwerk-Kontrolle — Design

**Datum:** 2026-07-23  
**Status:** Fachlich und technisch freigegeben  
**Bereich:** Netzwerk → Kontrolle

## Ausgangslage

Der Tab „Kontrolle“ bündelt aktuell mehrere fachlich unterschiedliche Prüfungen
auf einer langen Seite:

1. Switch-Port-Abgleich
2. Host-Datenqualität
3. ESXi-MAC-Abgleich
4. Netz-Discovery

Die Berechnungen und Tabellen liefern die benötigten Informationen, die
Oberfläche vermittelt aber keinen klaren Einstieg und keine empfohlene
Prüfreihenfolge. Sechs gleichwertige KPI-Karten, fünf Tabellen und mehrere
standardmäßig aktive Filter zwingen Nutzer:innen dazu, die Bedeutung und
Reihenfolge selbst herzuleiten.

Die Überarbeitung macht aus der bestehenden Ergebnissammlung ein geführtes
Prüfzentrum. Neue Nutzer:innen erhalten Orientierung und Erklärung. Erfahrene
Administrator:innen behalten schnellen Direktzugriff auf jede Detailprüfung.

## Ziele

- Beim Öffnen ist sofort erkennbar, was geprüft wird und womit begonnen werden
  sollte.
- Fehlende oder nur teilweise vorhandene Datenquellen werden verständlich und
  prüfbereichsbezogen erklärt.
- Kritische Abweichungen, zu prüfende Befunde und bestandene Prüfungen sind
  visuell und sprachlich eindeutig getrennt.
- Alle Detailprüfungen bleiben ohne Wizard-Zwang direkt erreichbar.
- Bestehende Audit-Berechnungen und `VirtualTable`-Funktionen werden
  weiterverwendet.
- Der aktive Prüfbereich und Ergebnisfilter sind über die URL verlinkbar.
- Dark Mode, Light Mode, deutsche Zahlenformate, Tastaturbedienung und große
  Datenmengen bleiben vollständig unterstützt.

## Nicht-Ziele

- Kein persistentes Bestätigen, Ausblenden oder Erledigen einzelner Befunde.
- Keine Historisierung von Prüfständen.
- Keine Änderung der Audit-Algorithmen oder fachlichen Match-Regeln.
- Keine IndexedDB-Schemaänderung.
- Kein Redesign der übrigen Netzwerk-Tabs.
- Keine neue Design-Sprache außerhalb der vorhandenen App-Tokens.

## Nutzergruppen und gemeinsames Bedienmodell

### Geführte Nutzung

Die Übersicht zeigt eine empfohlene Reihenfolge und eine Primäraktion
„Nächsten Befund prüfen“. Jede Prüfung wird als verständliche Frage formuliert,
nennt den Handlungsbedarf und erklärt fehlende Voraussetzungen.

### Direkte Expertennutzung

Eine dauerhaft sichtbare Bereichsnavigation erlaubt den direkten Wechsel zu
„Switch-Ports“, „Host-Daten“, „MAC-Abgleich“ und „Netz-Discovery“. Jede Ansicht
ist per URL adressierbar und öffnet direkt die passende, bereits gefilterte
Tabelle.

Beide Modi verwenden dieselben Daten und Ansichten. Es gibt keinen separaten
Einsteiger- oder Expertenmodus.

## Visuelle Richtung

Die Oberfläche folgt einer **präzisen, industriellen Kontrollkonsole**:
funktional, dicht und ruhig, mit klarer Statuscodierung. Sie bleibt vollständig
im allgemeinen Design des RVTools Analyzers.

### Bestehende Gestaltung wird beibehalten

- Farben ausschließlich über die Tokens aus `src/index.css`:
  `background`, `card`, `muted`, `border`, `primary`, `success`, `warning`,
  `destructive` und `info`.
- Bestehende Typografie aus der App; technische Werte weiterhin mit
  `font-mono-data`.
- Bestehende Radien, Abstände, `Card`, `Badge`, `Button`, `Tabs`,
  `InfoTooltip`, `EmptyState` und `VirtualTable`.
- Dark und Light Mode werden gleichwertig behandelt.
- Keine neue Schrift, keine dekorativen Farbverläufe und keine isolierte
  Sonderästhetik.

### Prägendes Gestaltungselement

Die vier Prüfbereiche bilden einen sichtbaren **Prüfpfad**. Auf Desktop sind
die nummerierten Karten `01` bis `04` durch eine zurückhaltende Linie verbunden;
auf kleinen Viewports stehen sie untereinander. Der Pfad vermittelt Reihenfolge,
ohne die Karten zu einem verpflichtenden Wizard zu machen.

Statusfarben werden nicht als großflächige Hintergründe eingesetzt. Eine
schmale linke Kante, ein Icon, ein Badge und ein klarer Text transportieren den
Zustand:

- `destructive`: kritisch
- `warning`: prüfen
- `success`: bestanden
- `muted`: nicht ausführbar

Farbe ist nie der einzige Informationsträger.

## Informationsarchitektur

Der Netzwerk-Tab „Kontrolle“ erhält fünf interne Ansichten:

1. Übersicht
2. Switch-Ports
3. Host-Daten
4. MAC-Abgleich
5. Netz-Discovery

Die Übersicht ist der Standard. Die bisherigen Tabellen erscheinen nur in der
jeweiligen Detailansicht.

### URL-Zustand

Der bestehende Pfad bleibt `/network-security`. Relevanter Zustand wird über
Query-Parameter abgebildet:

```text
/network-security?tab=audit
/network-security?tab=audit&check=ports&scope=attention
/network-security?tab=audit&check=hosts&scope=all
/network-security?tab=audit&check=mac&scope=passed
/network-security?tab=audit&check=discovery&scope=attention
```

Parameter:

- `tab=audit`: aktiviert den übergeordneten Netzwerk-Tab.
- `check=overview|ports|hosts|mac|discovery`: aktive Kontrollansicht.
- `scope=attention|passed|all`: Ergebnisfilter.

Fehlende oder ungültige Werte fallen auf `overview` beziehungsweise
`attention` zurück. Das Öffnen bestehender URLs ohne Query-Parameter verhält
sich unverändert.

## Seitenaufbau

### 1. Kopfbereich

Innerhalb des bestehenden `PageHeader`:

- Seitentitel bleibt „Netzwerk“.
- Die bestehende Netzwerk-Tab-Leiste bleibt erhalten.
- Im aktiven Kontrolle-Panel folgt die Überschrift „Netzwerk-Kontrolle“.
- Unterzeile:
  „Prüfen Sie Datenqualität, physische Zuordnungen und unbekannte Geräte.“

Darunter liegt die interne Bereichsnavigation:

- Übersicht
- Switch-Ports
- Host-Daten
- MAC-Abgleich
- Netz-Discovery

Auf Desktop erscheint sie als kompakte Tabs-/Segmentnavigation. Auf schmalen
Viewports ist sie horizontal scrollbar; Labels werden nicht abgeschnitten.

### 2. Quellenstatus

Eine kompakte Leiste zeigt je Quelle:

- Name
- Zustand „Bereit“, „Eingeschränkt“ oder „Fehlt“
- Datensatzanzahl
- letzter Importzeitpunkt aus dem jeweils neuesten `importedAt`-Wert

Quellen:

- RVTools
- CDP
- Eramon Interface
- Eramon L2
- IPAM
- Tech-Info

Die Leiste verwendet semantische Links. Ein fehlender Bestand führt mit einer
spezifischen Aktion zur Upload-Seite. Das Importdatum informiert über die
Aktualität, ohne einen fachlich nicht definierten Veraltungsgrenzwert
vorzugeben.
Auf mobilen Viewports wird die Leiste zu einem zweispaltigen Raster.

### 3. Zusammenfassung

Statt sechs gleichgewichteter Fach-KPIs zeigt die Übersicht drei
handlungsorientierte Werte:

- Kritisch
- Prüfen
- Bestanden

Darunter steht der Satz:

> 4 kritische Konflikte sollten zuerst geprüft werden. 241 Prüfungen sind
> bestanden.

Die Primäraktion heißt „Nächsten Befund prüfen“. Sie öffnet den Bereich mit der
höchsten vorhandenen Priorität. Sind keine offenen Befunde vorhanden, entfällt
die Primäraktion und die Übersicht zeigt den Erfolgszustand
„Keine offenen Netzwerkbefunde“.

### 4. Prüfpfad

Vier `AuditCheckCard`-Karten:

#### 01 — Switch-Port-Zuordnungen

- Frage: „Stimmen Portbeschriftung, Link-Status und CDP-Nachbar überein?“
- Befunde: Status-, Beschriftungs- und Quellenkonflikte; unbekannte
  Portzuordnungen.
- Aktion: „{n} Port-Befunde prüfen“ oder „Alle Port-Prüfungen anzeigen“.

#### 02 — Host-Datenqualität

- Frage: „Sind alle ESXi-Hosts in Tech-Info und IPAM dokumentiert?“
- Befunde: fehlende oder widersprüchliche Hostzuordnungen.
- Aktion: „{n} Datenlücken prüfen“ oder „Alle Host-Prüfungen anzeigen“.

#### 03 — ESXi-MAC-Abgleich

- Frage: „Werden die Host-Adapter am erwarteten Switch-Port gesehen?“
- Befunde: fehlende MACs und Topologieabweichungen.
- Aktion: „{n} MAC-Befunde prüfen“ oder „Alle MAC-Prüfungen anzeigen“.

#### 04 — Unbekannte Geräte

- Frage: „Welche Geräte lassen sich weder CDP noch IPAM zuordnen?“
- Befunde: unbekannte beziehungsweise fremde L2-MACs.
- Aktion: „{n} unbekannte Geräte prüfen“ oder „Netz-Discovery anzeigen“.

Jede Karte enthält:

- laufende Nummer
- Icon
- Frage als Überschrift
- einen erklärenden Satz
- Statusbadge
- Befundzahl
- genau eine spezifische Primäraktion

Die gesamte Karte erhält keinen versteckten Klickbereich. Navigation erfolgt
über einen sichtbaren Link im Stil des bestehenden `Button`.

## Detailansichten

Alle Detailansichten verwenden denselben `AuditDetailView`-Rahmen:

1. Link „Zur Übersicht“
2. Prüffrage als `h2`
3. kurze Erklärung und Datenbasis
4. Statuszusammenfassung
5. Ergebnisfilter
6. Tabelle

### Ergebnisfilter

Die bisherigen Switches werden durch eine eindeutige Segmentauswahl ersetzt:

- Handlungsbedarf
- Bestanden
- Alle

Der aktive Wert wird in `scope` gespeichert. Die Ergebniszahl steht direkt am
Filter im Format „{sichtbar} von {gesamt} Einträgen“.

### Suche

Die bestehende globale Suche bleibt in der App-Kopfzeile. Da jeweils nur die
aktive Detailtabelle sichtbar ist, wirkt sie für Nutzer:innen wie eine Suche im
aktuellen Prüfbereich. Ein sichtbarer Hinweis über der Tabelle zeigt bei
aktivem Suchtext:

> Ergebnisse zusätzlich gefiltert nach „esx-01“.

Die Übersicht selbst wird nicht durch den globalen Suchtext reduziert.

### Switch-Ports

Verwendet die bestehende Port-Audit-Tabelle. Positive und auffällige Zeilen
werden über `scope` getrennt. Die bisherigen Statusbadges bleiben erhalten.

### Host-Daten

Die beiden Perspektiven „Aus RVTools“ und „Aus Tech-Info“ bleiben erhalten,
werden aber als lokale Segmentauswahl innerhalb derselben Detailansicht
angeboten. Es ist jeweils nur eine Tabelle sichtbar.

### MAC-Abgleich

Verwendet die bestehende Tabelle „ESXi-Adapter in L2“. `attention` umfasst
fehlende L2-Treffer und Topologieabweichungen.

### Netz-Discovery

Verwendet die bestehende Discovery-Tabelle. `attention` umfasst die
Klassifikation `unknown`.

## Datenbasis und Verfügbarkeit

Jeder Prüfbereich bewertet seine Quellen unabhängig.

| Prüfung | Erforderlich | Ergänzend |
|---|---|---|
| Switch-Ports | Eramon Interface | CDP, RVTools, Tech-Info, IPAM |
| Host-Daten | RVTools | Tech-Info, IPAM |
| MAC-Abgleich | CDP und Eramon L2 | keine |
| Netz-Discovery | Eramon L2 | CDP und IPAM |

Definitionen:

- **Bereit:** alle erforderlichen Quellen vorhanden.
- **Eingeschränkt:** erforderliche Quelle vorhanden, mindestens eine
  ergänzende Quelle fehlt.
- **Fehlt:** mindestens eine erforderliche Quelle fehlt.

Ein eingeschränkter Bereich bleibt vollständig bedienbar und zeigt einen
Hinweis auf die reduzierte Aussagekraft.

### Globale RVTools-Sperre

`Networking` darf den Kontrolle-Tab nicht mehr pauschal blockieren, wenn kein
aktiver RVTools-Snapshot vorhanden ist. Der Tab bleibt mit Eramon-, CDP- oder
IPAM-Daten erreichbar. Die Verfügbarkeit wird innerhalb jedes Prüfbereichs
entschieden.

RVTools-abhängige Netzwerk-Tabs behalten ihren bisherigen Empty State.

## Prioritätsmodell

Die Priorität wird ausschließlich aus bestehenden Audit-Ergebnissen abgeleitet:

### Kritisch

- Statuskonflikt
- Beschriftungskonflikt
- MAC-Topologieabweichung

### Prüfen

- unbekannte Portzuordnung
- nur dokumentierter Host
- Host-Datenlücke
- MAC fehlt in der L2-Tabelle
- unbekannte L2-MAC

### Bestanden

- CDP-bestätigte Portzuordnung ohne Konflikt
- vollständige Hostzuordnung
- ESXi-MAC am erwarteten L2-Ort
- als ESXi oder IPAM-bekannt klassifizierte L2-MAC

### Nicht ausführbar

- erforderliche Quelle des Prüfbereichs fehlt

„Nächsten Befund prüfen“ wählt den ersten Bereich mit kritischen Befunden.
Existieren keine kritischen Befunde, wird der erste Bereich mit
„Prüfen“-Befunden geöffnet. Bei gleicher Priorität gilt die Reihenfolge des
Prüfpfads.

## Zustände und Fehlermeldungen

### Prüfung bestanden

Erforderliche Daten sind vorhanden, aber `attention` liefert keine Zeilen:

> Keine offenen Befunde  
> Alle 146 auswertbaren Portzuordnungen sind bestätigt.

Sekundäraktion: „Alle Prüfungen anzeigen“.

### Filter ohne Treffer

Die Prüfung enthält Daten, der gewählte Filter oder Suchtext liefert aber keine
Zeilen:

> Keine passenden Einträge  
> Ändern Sie den Ergebnisfilter oder entfernen Sie den Suchbegriff.

### Prüfung nicht möglich

Eine erforderliche Quelle fehlt:

> MAC-Abgleich noch nicht möglich  
> Eramon-L2-Daten sind vorhanden, aber CDP-Daten fehlen.

Aktion: „CDP-Daten importieren“.

### Eingeschränkte Prüfung

Erforderliche Quellen sind vorhanden, ergänzende Quellen fehlen:

> Eingeschränkte Prüfung – IPAM fehlt  
> Unbekannte Geräte können nicht gegen das IP-Adressinventar abgeglichen werden.

### Ladefehler

Query-Fehler werden nicht als leerer Datenbestand dargestellt:

> Netzwerkdaten konnten nicht geladen werden.  
> Versuchen Sie es erneut. Ihre importierten Daten bleiben erhalten.

Aktion: „Erneut versuchen“.

## Komponenten und Verantwortlichkeiten

### `NetworkAuditPanel`

- liest und validiert URL-Zustand
- verbindet den bestehenden Audit-Hook mit dem View-Model
- schaltet zwischen Übersicht und Detailansichten

### `NetworkAuditOverview`

- rendert Quellenstatus, Zusammenfassung und Prüfpfad
- löst die Navigation zum höchstpriorisierten Befund aus

### `AuditSourceStatus`

- stellt Verfügbarkeit, Umfang und Aktualität der Quellen dar
- verlinkt fehlende Quellen zur Upload-Seite

### `AuditCheckCard`

- rendert genau einen Prüfbereich
- besitzt keine eigene Datenlogik
- erhält Status, Befundzahl, Beschreibung und Ziel-URL als Props

### `AuditDetailView`

- gemeinsamer semantischer Rahmen aller Detailprüfungen
- rendert Bereichsnavigation, Kontext, Filter, Zustände und Tabellen-Slot

### Fachpanels

- `PortAuditDetail`
- `HostDataAuditDetail`
- `MacAuditDetail`
- `NetworkDiscoveryDetail`

Sie kapseln Spalten, Zeilenfilter und fachliche Empty States. Die bestehende
`VirtualTable` bleibt die einzige Tabellendarstellung.

### View-Model

Die reine Funktion `buildNetworkAuditViewModel` berechnet:

- Quellenstatus je Prüfung
- kritische, zu prüfende und bestandene Anzahl
- Status jeder Prüfkarte
- nächstes Prüfziel

Sie verändert keine bestehenden Audit-Zeilen und führt keine Seiteneffekte aus.

## Datenfluss

```text
Bestehende Daten-Hooks
        ↓
useNetworkAudit
        ↓
bestehende Audit-Zeilen
        ↓
buildNetworkAuditViewModel
        ↓
Übersicht / Prüfkarte / aktive Detailansicht
        ↓
URL-Zustand (check + scope)
```

Alle Berechnungen bleiben clientseitig und werden per `useMemo` aus den
vorhandenen Daten abgeleitet.

## Responsive Verhalten

- Ab `xl`: Quellenstatus in einer Zeile, Prüfpfad als vierteilige Reihe.
- Ab `md`: Prüfpfad als 2×2-Raster.
- Mobil: Prüfpfad einspaltig; interne Navigation horizontal scrollbar.
- Tabellen behalten ihre vorhandene horizontale und virtuelle Darstellung.
- Aktionszeilen dürfen umbrechen; kein Label wird abgeschnitten.
- Touch-Ziele mindestens 44 × 44 CSS-Pixel.

## Animation

Nur zurückhaltende Übergänge:

- aktive Navigation: Farbe, Rahmen und Hintergrund
- Karten-Hover: vorhandenes `shadow-md`-Muster ohne Verschiebung
- Ansichtswechsel: bestehendes `animate-fade-in`

Keine neuen dauerhaft laufenden Animationen. `prefers-reduced-motion` wird
respektiert.

## Barrierefreiheit

- Hierarchie: `h1` Netzwerk, `h2` Netzwerk-Kontrolle beziehungsweise
  Detailfrage, `h3` Karten und Tabellenbereiche.
- Status wird immer durch Text und Icon zusätzlich zur Farbe vermittelt.
- Interne Navigation verwendet die bestehenden Radix-Tabs und synchronisiert
  deren Zustand mit der URL.
- Die aktive Ansicht erhält den korrekten Radix-Tab-Zustand.
- Icon-only-Aktionen erhalten `aria-label`; dekorative Icons
  `aria-hidden="true"`.
- Fokuszustände verwenden die vorhandenen `focus-visible`-Ringe.
- Ergebnisänderungen nach einem Filterwechsel werden über einen kompakten
  `aria-live="polite"`-Text angekündigt.
- Warnungen nennen immer die nächste mögliche Aktion.

## Tests

### Reine Funktionen

- Quellenstatus für vollständige, eingeschränkte und fehlende Datenbasis
- Aggregation der drei Ergebnisgruppen
- Prioritätsreihenfolge
- nächstes Prüfziel
- ungültige und leere Eingangsdaten

### Komponenten

- Übersicht zeigt vier Prüfkarten in richtiger Reihenfolge
- spezifische Aktionslabels und Zahlen
- Erfolgszustand ohne Primäraktion
- fehlende Quelle mit passendem Upload-Link
- eingeschränkter Zustand mit Erklärung
- Detailansicht zeigt genau eine fachliche Tabelle
- Segmentfilter ändert `scope` und Ergebnisanzahl
- Host-Perspektive zeigt jeweils nur eine Tabelle

### Routing

- direkte URLs öffnen den erwarteten Bereich und Filter
- Zurück-/Vorwärts-Navigation stellt den Zustand wieder her
- ungültige Query-Werte fallen auf sichere Defaults zurück
- bestehende `/network-security`- und `/host-network`-Aufrufe funktionieren
  weiter

### Regression

- bestehende `networkAudit`-Tests bleiben unverändert grün
- bestehende Spaltendefinitionen, Exporte und globale Suche funktionieren
- Kontrolle ist ohne RVTools-Snapshot erreichbar, wenn andere Kontrolldaten
  vorhanden sind
- übrige Netzwerk-Tabs behalten ihren RVTools-Empty-State

### Qualitätssicherung

Nach produktiven Änderungen:

```text
npm run test
npm run lint
npm run build
```

Zusätzlich visuelle Prüfung in Dark und Light Mode sowie bei Desktop-, Tablet-
und Mobilbreite.

## Akzeptanzkriterien

- Die Kontrolle öffnet standardmäßig mit einer verständlichen Übersicht.
- Innerhalb von fünf Sekunden ist erkennbar, welche Prüfung zuerst empfohlen
  wird.
- Jede Prüfkarte beantwortet Zweck, Zustand, Befundzahl und nächste Aktion.
- Expert:innen erreichen jede Detailprüfung mit einem Klick.
- Jede Detailansicht ist direkt verlinkbar.
- Fehlende Quellen werden prüfbereichsbezogen statt als allgemeiner
  „Keine Daten“-Zustand erklärt.
- Zu jedem leeren oder fehlerhaften Zustand existiert eine konkrete nächste
  Aktion.
- Es werden nie mehr als die aktuell relevante Tabelle beziehungsweise
  Host-Perspektive gleichzeitig angezeigt.
- Die visuelle Gestaltung verwendet ausschließlich bestehende Tokens und
  Komponenten.
- Kein bestehender Audit-Algorithmus und kein IndexedDB-Schema wird geändert.

## Voraussichtlich betroffene Dateien

- `src/pages/Networking.tsx`
- `src/pages/NetworkAuditPanel.tsx`
- neue fokussierte Komponenten unter `src/components/network/`
- `src/hooks/useActiveSnapshots.ts` für Quellenanzahlen und den jeweils neuesten
  `importedAt`-Wert
- `src/lib/networkAudit.ts` nur für das reine View-Model, nicht für bestehende
  Match-Regeln
- `src/lib/glossaries/networking.ts`
- bestehende und neue Tests unter `src/pages/` und `src/test/`
