# Implementierungsplan: Fill-Up- und Cluster-Kapazitätsplanung

**Datum:** 2026-07-28  
**Status:** Bereit zur Umsetzung  
**Zugehörige Spezifikation:** [Fill-Up- und Cluster-Kapazitätsplanung](../specs/2026-07-28-fill-up-cluster-capacity-planning-design.md)  
**Datenvertrag:** [vROps-Metriken und Exportkonfiguration](../../../VROPS_METRICS.md)

## 1. Ziel

Der bestehende leere Tab **Planung → Fill Up** wird zu einer lokalen,
reproduzierbaren Kapazitätsplanung ausgebaut. Die Funktion importiert
stündliche vROps-Zeitreihen, verbindet sie mit dem aktiven RVTools-Snapshot
und berechnet je Cluster:

- unabhängigen zusätzlichen vCPU- und RAM-Headroom,
- gemeinsam realisierbare VM-Anzahlen anhand von Workloadprofilen,
- getrennte Auswirkungen zusätzlicher HIGH- und STD-Workloads,
- Normalbetrieb, verpflichtendes N-1, optionales N-2 und beide
  Site-Ausfallrichtungen,
- CPU-Demand-, vCPU/Core-, RAM-, Ready-, Contention- und
  Platzierungsgrenzen,
- limitierende Guardrails und nachvollziehbare gelbe beziehungsweise rote
  Ursachen,
- versionierte, gespeicherte Analyzer-Runs.

Die Entwicklung beginnt mit den geprüften kleinen Beispieldateien. Ein
vollständiger Testcluster und der Skalierungstest mit ungefähr 840.000
VM-Stunden sind nachgelagerte Abnahmen und blockieren die Implementierung
nicht.

## 2. Verbindliche technische Entscheidungen

### 2.1 Bestehende Funktionen erhalten

Der bisherige panelbasierte vROps-Import für das Ausfallskonzept bleibt
kompatibel. Der neue Zeitreihenimport erhält eigene Typen und IndexedDB-Stores.
Bestehende `VropsImportMeta`, `VropsRow` und `VropsLatest` werden nicht
zweckentfremdet.

### 2.2 Ein Import besteht aus einem Dateisatz

Ein vROps-Zeitreihenimport umfasst:

```text
VM CSV
Cluster CSV
Host CSV
zugeordnete aktive RVTools-Snapshots
```

Alle drei Dateien müssen denselben Zeitraum und dieselbe Zeitzone besitzen.
Der Import darf einzelne optionale Host-Diagnosemetriken vermissen, aber keine
Pflichtspalten.

### 2.3 Identität und Beziehungen

Die CSV-Dateien identifizieren Objekte über Namen. Die Verbindung erfolgt
innerhalb des ausgewählten RVTools-vCenter-Scopes:

```text
VM-Name      → NormalizedVm
Host-Name    → NormalizedHost
Clustername  → NormalizedCluster
```

Mehrdeutige oder fehlende Treffer werden nicht automatisch geraten. Sie
erzeugen Datenqualitätsfindings und werden aus belastbaren Empfehlungen
ausgeschlossen. Der Import speichert die beim Import verwendete Zuordnung,
damit spätere Änderungen am aktiven Snapshot alte Runs nicht verändern.

### 2.4 Kapazitätsbasis

```text
CPU = Σ Host CPU Capacity Available to VMs
RAM = Σ Host Memory Capacity Available to VMs
```

CPU Overhead wird nicht nochmals addiert oder abgezogen. Fehlt eine
historische Hostkapazität, darf die Engine auf RVTools-Bruttokapazität minus
Policy-Puffer zurückfallen, muss diesen Fallback aber kennzeichnen.

### 2.5 Einheiten

Intern gelten ausschließlich:

```text
CPU: MHz
Memory: MiB
Zeit: UTC epoch milliseconds
Prozent: reale Prozentwerte, 1 = 1 %
```

VMware-`KB` wird als KiB interpretiert. Dynamische GHz-/GB-/TB-Werte werden
beim Import normalisiert. Eingabewert und erkannte Quelleneinheit werden im
Importbericht nachvollziehbar gehalten.

### 2.6 Kleine Datenbasis

Solange keine vollständige Echtdatenabnahme erfolgt ist:

- werden vollständige synthetische Cluster-Fixtures als Referenz verwendet,
- zeigt jeder Import einen Datenqualitätsbericht,
- tragen nicht vollständig belegbare Ergebnisse ein Vertrauensniveau,
- wird fehlende Evidenz nie als grüner Status interpretiert.

## 3. Ziel-Datenmodell

Alle Modelländerungen beginnen in `src/domain/models/types.ts`.

### 3.1 Importmetadaten

Vorgesehene Typen:

```ts
type VropsTimeSeriesObjectType = "vm" | "cluster" | "host";
type VropsTimeSeriesValidationStatus =
  | "schema-valid"
  | "relationships-partial"
  | "relationships-valid"
  | "manually-verified";

interface VropsTimeSeriesImport {
  id: string;
  importedAt: string;
  timezone: "Europe/Vienna";
  intervalMinutes: 60;
  rangeStartUtc: number;
  rangeEndUtc: number;
  expectedSlots: number;
  rvtoolsSnapshotIds: string[];
  files: VropsTimeSeriesSourceFile[];
  schemaVersion: number;
  validationStatus: VropsTimeSeriesValidationStatus;
  qualitySummary: VropsTimeSeriesQualitySummary;
}
```

Jede Quelldatei speichert mindestens Dateiname, Größe, Prüfsumme, Objektart,
Zeilenanzahl, erkannte Spalten und Importstatus.

### 3.2 Objektverzeichnis und eingefrorene Beziehungen

Pro importiertem Objekt werden gespeichert:

- kanonischer Objekt-Key,
- vROps-Name,
- Objektart,
- vCenter-ID,
- RVTools-Snapshot-ID,
- Cluster-Key,
- Host-Key bei VMs,
- HIGH/STD aus dem letzten Resource-Pool-Pfadsegment,
- Power State zum RVTools-Zeitpunkt,
- Site-ID bei Hosts,
- Matchstatus und Matchmethode.

### 3.3 Kompakte Zeitreihen

Messpunkte werden nicht als einzelne IndexedDB-Objekte gespeichert. Ein Chunk
enthält:

- Import-ID,
- Objektart,
- Cluster-Key,
- UTC-Start,
- Slotanzahl,
- geordnete Objekt-Keys,
- eine `Float32Array`-Reihe je Metrik,
- Missing Values als `NaN`,
- optional eine kompakte Zustandsreihe für Maintenance.

VM-Chunks enthalten:

```text
cpuDemandAvgMHz
cpuReadyMaxPct
```

Cluster-Chunks enthalten:

```text
cpuDemandAvgMHz
cpuDemandMaxMHz
memoryUtilizationAvgMiB
memoryUtilizationMaxMiB
cpuContentionAvgPct
cpuContentionMaxPct
```

Host-Chunks enthalten verpflichtend:

```text
cpuCapacityAvailableLastMHz
memoryCapacityAvailableLastMiB
```

Diagnosereihen werden nur gespeichert, wenn sie im Import vorhanden sind.

### 3.4 Summaries

Pro VM, Cluster und Resource-Pool-Scope werden kompakte Summaries gespeichert:

- vorhandene und erwartete Slots,
- Datenabdeckung,
- P50, P95, Maximum und Durchschnitt der relevanten Metriken,
- Zeitpunkt des Maximums,
- Anzahl Missing Values,
- Match- und Vertrauensstatus.

### 3.5 Policies und Runs

Neue persistente Typen:

- `CapacityPolicy`,
- `CapacityPolicyVersion`,
- `ClusterCapacityPolicyAssignment`,
- `FillUpWorkloadProfile`,
- `FillUpAnalysisRun`,
- `FillUpClusterResult`,
- `CapacityFinding`.

Ein Run enthält unveränderliche Kopien der Policy-Werte, Eingaben,
Importreferenzen, Snapshotreferenzen, Site-Regeln, Workloadprofile,
Berechnungsversion und Ergebnisse.

## 4. IndexedDB-Erweiterung

`DB_VERSION` wird erhöht und `src/data/db/index.ts` erhält Migrationen und
Helper für:

```text
vrops_timeseries_imports
vrops_timeseries_objects
vrops_timeseries_chunks
vrops_timeseries_summaries
capacity_policies
capacity_policy_assignments
fillup_workload_profiles
fillup_analysis_runs
```

Wichtige Indizes:

- Import-ID,
- Objektart,
- Cluster-Key,
- vCenter-ID,
- Startzeit,
- Policy-ID und Version,
- Erstellungszeit eines Runs.

Löschen eines Zeitreihenimports muss zugehörige Objekte, Chunks und Summaries
transaktional entfernen. Gespeicherte Runs behalten ihre eingefrorenen
Ergebnisse, zeigen aber an, wenn die ursprünglichen Zeitreihen nicht mehr
verfügbar sind.

Backup, Restore und Speichergrößenanzeige werden um die neuen Stores ergänzt.

## 5. Phase 1 – CSV-Verträge und Parser

### Aufgaben

1. Versionierte Header-Schemata für VM, Cluster und Host definieren.
2. Aliaslisten für bekannte vROps-Anzeigenamen anlegen.
3. Objektart ausschließlich über eindeutige Pflichtheader erkennen.
4. RFC-4180-konformes CSV-Parsing mit gequoteten Feldern und
   Tausendertrennzeichen implementieren.
5. `-` und leere Felder als Missing Value behandeln.
6. englische Zahlen mit Dezimalpunkt invariant parsen.
7. `Europe/Vienna` inklusive Sommerzeit nach UTC umrechnen.
8. exakt eine Zeile pro Objekt und Stunde erzwingen.
9. Einheiten in MHz und MiB normalisieren.
10. Schema-, Bereichs- und Plausibilitätsfehler sammeln, nicht nur beim ersten
    Fehler abbrechen.

### Voraussichtliche Dateien

- `src/domain/models/types.ts`
- `src/domain/services/vropsTimeSeriesSchema.ts`
- `src/domain/services/vropsTimeSeriesParser.ts`
- `src/workers/vrops-timeseries.worker.ts`
- `src/domain/services/vropsTimeSeriesParser.test.ts`

### Tests

- die drei geprüften CSV-Beispiele,
- fehlende Pflichtspalte,
- doppelter Header,
- falsche Objektart,
- gequotete Tausendertrennzeichen,
- `-`, leer, `NaN`, negative Werte,
- doppelte Stunde und Stundenlücke,
- 167/169 Stunden bei Zeitumstellung,
- unbekannte Einheit,
- Maintenance-Zustand mit Forward-Fill-Markierung.

## 6. Phase 2 – Importworkflow und Persistenz

### Aufgaben

1. Auswahl der drei CSV-Dateien als gemeinsamen Import ermöglichen.
2. aktiven RVTools-Snapshot beziehungsweise vCenter-Scope anzeigen.
3. Prüfsummen bilden und doppelte Dateisätze erkennen.
4. Zeitraum und Stundenraster der Dateien gegeneinander prüfen.
5. RVTools-Objektverzeichnisse kompakt an den Worker übergeben.
6. Objekte eindeutig matchen und Beziehungen für den Import einfrieren.
7. Zeitreihen clusterweise in binäre Chunks schreiben.
8. Summaries und Qualitätsbericht im Worker berechnen.
9. Chunks transaktional persistieren.
10. Fortschritt, Warnungen, Abbruch und Rollback im vorhandenen Importstil
    anzeigen.
11. Importliste, Größe und Löschfunktion in der bestehenden Importverwaltung
    ergänzen.

### Umsetzungsentscheidung (2026-07-28)

Der Worker übernimmt das CSV-Parsing. Das Laden und Matching der relevanten
RVTools-Objekte sowie die Verdichtung zu Chunks und Summaries erfolgen danach
im UI- und IndexedDB-unabhängigen Importservice. So müssen keine vollständigen
RVTools-Objektverzeichnisse zwischen Main-Thread und Worker serialisiert
werden; die persistierten Daten werden weiterhin erst nach vollständiger
Validierung in einer Transaktion geschrieben.

### Voraussichtliche Dateien

- `src/domain/services/vropsTimeSeriesImportService.ts`
- `src/workers/vrops-timeseries.worker.ts`
- `src/data/db/index.ts`
- `src/hooks/useActiveSnapshots.ts`
- `src/pages/UploadSnapshots.tsx`
- `src/components/import/VropsTimeSeriesImportDialog.tsx`

### Abnahme

- alle drei Beispieldateien werden als ein Import gespeichert,
- erneuter Import desselben Dateisatzes wird erkannt,
- UI bleibt während Parsing und Aggregation bedienbar,
- Teilfehler hinterlassen keine halben Importe,
- Löschen entfernt alle abhängigen Zeitreihendaten.

## 7. Phase 3 – Datenqualität und Beziehungsschicht

### Aufgaben

1. Matchstatus je Objekt bestimmen.
2. Namenskollisionen je vCenter und über vCenter hinweg melden.
3. VM-Power-State und HIGH/STD aus RVTools einfrieren.
4. Site über konfigurierbare Hostnamensregeln bestimmen.
5. Datenabdeckung je Objekt und Metrik berechnen.
6. VM-Summe und direkte Clusterserie vergleichen, wenn ausreichend
   vollständige VM-Daten vorhanden sind.
7. vROps- und RVTools-Zeitabstand bewerten.
8. Vertrauensniveau und blockierende Findings erzeugen.

### Qualitätsregeln

- fehlende Pflichtkapazität: nicht berechenbar,
- unbekannter Resource Pool: HIGH-/STD-Ergebnis blockiert,
- unbekannte Site: Site-Failover blockiert,
- unvollständige VM-Abdeckung: VM-basierte HIGH-/STD-Serie herabstufen,
- direkte Clusterzeitreihe darf weiterhin für Gesamt-Demand verwendet werden,
- fehlende optionale Hostdiagnose: Warnung, kein genereller Blocker.

### Voraussichtliche Dateien

- `src/domain/services/vropsDataQualityService.ts`
- `src/domain/services/vropsRelationshipService.ts`
- `src/domain/services/vropsDataQualityService.test.ts`

## 8. Phase 4 – Policy- und Finding-Engine

### Aufgaben

1. `CapacityPolicy` und Versionierung implementieren.
2. initiale Profile aus der Spezifikation anlegen.
3. Profilzuweisung je Cluster und einzelne Overrides ermöglichen.
4. bestehende Capacity-Schwellenwerte inventarisieren und in eine gemeinsame
   Quelle überführen oder fachlich getrennt benennen.
5. einheitliche Statusfunktion für Grün, Gelb und Rot implementieren.
6. Findings mit Ist-Wert, Grenzwert, Szenario, Datenquelle, betroffenen
   Objekten und Vertrauensniveau erzeugen.

### Initial konfigurierbare Werte

- vCPU/Core Normal, N-1 und optional N-2,
- CPU-Demand Warn/Danger je Szenario,
- CPU Ready Warn/Danger,
- CPU Contention Warn/Danger,
- Gesamt-RAM Warn/Danger,
- HIGH-RAM Warn/Danger,
- Memory-Utilization Warn/Danger,
- HIGH-Site-CPU 80/100 als initialer Vorschlag,
- CPU-/RAM-Sicherheitspuffer,
- N-2 informativ oder hart,
- maximale Einzel-VM-Anteile je Host.

### Voraussichtliche Dateien

- `src/domain/services/capacityPolicyService.ts`
- `src/domain/services/capacityFindingEngine.ts`
- `src/domain/services/capacityPolicyService.test.ts`
- `src/components/planning/fill-up/CapacityPolicyEditor.tsx`

## 9. Phase 5 – Kapazitäts- und Szenario-Engine

### Aufgaben

1. bestehende Logik in `clusterCapacityEngine.ts` wiederverwenden und
   widersprüchliche Parallelberechnungen vermeiden.
2. verfügbare CPU- und RAM-Kapazität pro Host und Stunde bestimmen.
3. Normalbetrieb berechnen.
4. N-1 durch Entfernung jedes einzelnen Hosts simulieren.
5. N-2 durch vollständige Hostpaare oder nachweisbar konservative
   Optimierung simulieren.
6. beide Site-Ausfallrichtungen simulieren.
7. Gesamtworkload sowie HIGH und STD getrennt bewerten.
8. große VMs gegen die verbleibende Einzelhostkapazität prüfen.
9. direkte Cluster-Demand-Serie und zeitgleiche VM-Aggregate fachgerecht
   verwenden.
10. bereits rote Ausgangslagen gesondert behandeln.

### Reine Engine-Schnittstelle

Die Engine erhält ausschließlich normalisierte Domänenobjekte und liefert
deterministische Ergebnisse. Sie kennt weder React noch IndexedDB.

### Voraussichtliche Dateien

- `src/domain/services/fillUpCapacityEngine.ts`
- `src/domain/services/fillUpScenarioEngine.ts`
- `src/domain/services/fillUpCapacityEngine.test.ts`
- gegebenenfalls gezielte Erweiterungen in
  `src/domain/services/clusterCapacityEngine.ts`

### Umsetzungsentscheidung (2026-07-28)

`computeHostFailureCapacity` aus `clusterCapacityEngine.ts` wird nicht direkt
für Fill Up verwendet: Die bestehende Funktion modelliert homogene Hosts mit
statischen Capacity-Health-Schwellen. Die Fill-Up-Engine rechnet stattdessen
mit stündlichen, hostindividuellen vROps-Kapazitäten und der versionierten
`CapacityPolicy`. Die bestehenden Schwellen bleiben als eigener
Betriebskontext explizit abgegrenzt und werden nicht widersprüchlich
wiederverwendet.

### Synthetische Referenzfälle

- homogener 32-Host-Cluster über zwei Sites,
- heterogene Hostgenerationen,
- N-1 genau an und knapp unter der Grenze,
- N-2 informativ und hart,
- Site 1 kleiner als Site 2,
- HIGH passt, STD nicht,
- HIGH CPU bei 79,9 %, 80 %, 99,9 % und 100 %,
- HIGH RAM bei 44,9 %, 45 %, 49,9 % und 50 %,
- große VM passt nur auf einen Host,
- fehlende Site oder unbekannter Resource Pool,
- Hostkapazität fehlt und RVTools-Fallback greift.

## 10. Phase 6 – Fill-Up-Berechnung

### Aufgaben

1. unabhängigen vCPU-Headroom aus vCPU/Core berechnen.
2. CPU-Demand-Headroom anhand eines Demand-je-vCPU-Profils berechnen.
3. unabhängigen RAM-Headroom berechnen.
4. typische VM-Profile mit vCPU, RAM, P95 Demand und HIGH/STD unterstützen.
5. maximale ganzzahlige VM-Anzahl je Profil bestimmen.
6. HIGH-/STD-Slider auf gemeinsame Workloadmengen anwenden.
7. kleinsten Headroom aller aktiven Guardrails als Empfehlung verwenden.
8. limitierende Metrik und nächstkritische Guardrails ausgeben.
9. CPU- und RAM-Maxima ausdrücklich als unabhängig kennzeichnen.
10. größere Cluster bei gleicher Eignung über geringeren relativen
    N-1-Verlust bevorzugen.

### Wichtige Regel

Eine freie vCPU-Zahl ohne Demandprofil darf nur gegen vCPU/Core bewertet
werden. Eine vollständige CPU-Empfehlung benötigt einen expliziten oder aus
Referenzworkloads abgeleiteten Demand-je-vCPU-Wert.

## 11. Phase 7 – Oberfläche

### Hauptbereich

Der vorhandene Tab in `src/pages/Planning.tsx` erhält
`FillUpPlanningPanel`.

### Geplante Teilkomponenten

- `FillUpPlanningPanel.tsx`
- `FillUpInputControls.tsx`
- `FillUpClusterTable.tsx`
- `FillUpClusterDetails.tsx`
- `FillUpGuardrailList.tsx`
- `FillUpWorkloadProfileEditor.tsx`
- `CapacityPolicyEditor.tsx`
- `VropsDataQualityCard.tsx`
- `FillUpRunHistory.tsx`

### Bedienablauf

1. vROps-Import und RVTools-Snapshot auswählen,
2. Clusterprofil beziehungsweise Policy wählen,
3. Normal/N-1/N-2/Site-Szenarien konfigurieren,
4. unabhängige Maxima oder Workloadprofil wählen,
5. HIGH-/STD-Anteil einstellen,
6. Clusterergebnisse vergleichen,
7. Limiter und Zeitreihen im Detail öffnen,
8. Run speichern oder duplizieren.

### Darstellung

Pro Cluster mindestens:

- Datenqualität,
- CPU- und RAM-Ausgangskapazität,
- `+vCPU` und `+GiB RAM`,
- Anzahl typischer VMs,
- HIGH-/STD-Ergebnis,
- N-1, N-2 und Site-Failover,
- limitierende Metrik,
- große-VM-Warnung,
- bereits rote Ausgangslage.

Tabellen mit vielen Clustern verwenden `VirtualTable`. Zahlen werden mit
de-DE, tabellarischen Ziffern und konsistenten GiB-/MHz-Einheiten angezeigt.

## 12. Phase 8 – Analyzer-Runs

### Aufgaben

1. Run vor Speicherung vollständig berechnen.
2. Inputs, Policy-Snapshot, Datenreferenzen und Ergebnisse unveränderlich
   speichern.
3. Runs laden, duplizieren, umbenennen und löschen.
4. zwei Runs vergleichen.
5. mit neuem Import oder neuer Policy einen neuen Run erzeugen.
6. Markdown-Export des Ergebnisses vorbereiten.

Alte Runs dürfen sich durch neue Imports, aktive Snapshots oder
Policyänderungen nicht verändern.

## 13. Phase 9 – Tests und Qualitätssicherung

### Pflichtprüfungen je produktiver Phase

```text
npm run test
npm run lint
npm run typecheck
npm run build
```

### Testebenen

- Parser-Unit-Tests,
- IndexedDB-Tests mit `fake-indexeddb`,
- Engine-Unit- und Property-Grenztests,
- Hook-Tests,
- UI-Interaktionstests,
- Importabbruch und Rollback,
- Run-Reproduzierbarkeit,
- Backup-/Restore-Roundtrip.

### Nachgelagerte Echtdatenabnahme

Sobald Daten verfügbar sind:

1. einen vollständigen Cluster importieren,
2. VM-Summe, Cluster-Demand und Beziehungen prüfen,
3. Normal, N-1, N-2 und beide Sites manuell gegenrechnen,
4. einen Maintenance-Wechsel prüfen,
5. Abweichungen dokumentieren und Regeln korrigieren,
6. Import mit ungefähr 5.000 VMs ausführen,
7. Laufzeit, Peak-Memory und IndexedDB-Größe messen,
8. Grenzwerte für Warnung oder Importabbruch festlegen.

## 14. Reihenfolge der Umsetzung

Die Arbeit wird in folgenden vertikalen Schnitten umgesetzt:

1. **Datenvertrag:** Typen, Schemaerkennung, Parser und Tests.
2. **Importierbarer Dateisatz:** Worker, IndexedDB und Importbericht.
3. **Lesbarer Verlauf:** Hooks, VM-/Cluster-/Host-Zeitreihen und
   Datenqualitätsanzeige.
4. **Berechenbarer Baseline-Cluster:** Policy, Normalbetrieb und N-1.
5. **Resilienz:** N-2, beide Sites, HIGH/STD und große VMs.
6. **Fill Up:** unabhängige Maxima, Workloadprofile und Slider.
7. **Reproduzierbarkeit:** Policies, gespeicherte Runs und Vergleich.
8. **Abnahme:** vollständiger Cluster und Produktionsgröße nach
   Datenverfügbarkeit.

Jeder Schnitt endet mit ausführbaren Tests und einer in der Oberfläche
sichtbaren, nutzbaren Erweiterung.

## 15. Definition of Done

Die erste Fill-Up-Version ist technisch fertig, wenn:

- die drei geprüften vROps-Dateien gemeinsam importiert werden,
- der Import im Worker läuft und transaktional persistiert,
- fehlerhafte oder mehrdeutige Daten sichtbar ausgewiesen werden,
- Policies pro Profil und Cluster konfigurierbar sind,
- Normal, N-1, optional N-2 und beide Site-Ausfälle berechnet werden,
- HIGH verpflichtend und STD informativ im Site-Ausfall bewertet wird,
- CPU-, RAM- und Platzierungslimiter nachvollziehbar sind,
- unabhängige Maxima und typische VM-Profile funktionieren,
- Analyzer-Runs reproduzierbar gespeichert werden,
- synthetische vollständige Clusterfälle alle Grenztests bestehen,
- Test, Lint, Typecheck und Production-Build erfolgreich sind.

Die fachliche Produktionsabnahme bleibt bis zur Gegenrechnung eines
vollständigen realen Clusters und zum Skalierungstest ausdrücklich
`ausstehend`. Dieser Status blockiert nicht die Entwicklung, wird aber in
Dokumentation und Datenqualitätsanzeige transparent geführt.
