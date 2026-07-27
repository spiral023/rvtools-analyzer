# Design: Fill-Up- und Cluster-Kapazitätsplanung mit RVTools und vROps

**Datum:** 2026-07-28  
**Status:** Fachliches Konzept – Implementierung nach Echtdatenvalidierung  
**Produkt:** RVTools Analyzer  
**Architektur:** Frontend-only, local-first, keine Serverpersistenz

## 1. Zweck

Der Planungsbereich erhält eine neue Funktion **Fill Up**. Sie beantwortet je
Cluster, wie viele zusätzliche virtuelle CPU- und RAM-Ressourcen aufgenommen
werden können, bevor eine konfigurierbare Kapazitäts- oder
Ausfallanforderung verletzt wird.

Beispiele für gewünschte Antworten:

- `+123 vCPU` als unabhängiges CPU-Maximum,
- `+356 GiB RAM` als unabhängiges RAM-Maximum,
- `+24 typische Server-VMs mit je 4 vCPU und 16 GiB`,
- unterschiedliche Ergebnisse für HIGH- und STD-Resource-Pools,
- eine gemeinsame Projektion mit frei wählbarem HIGH-/STD-Anteil,
- nachvollziehbare Angabe der limitierenden Metrik und des betrachteten
  Ausfallszenarios.

Fill Up ist kein einfacher Dreisatz auf Basis der physischen Kapazität. Das
Modell muss gleichzeitig berücksichtigen:

- tatsächlichen CPU-Bedarf aus vROps,
- konfigurierte vCPU- und RAM-Zuweisung aus RVTools,
- CPU-Überbuchung und clusterabhängige Zielwerte,
- mindestens einen verkraftbaren Hostausfall,
- optional zwei gleichzeitige Hostausfälle,
- den Ausfall einer von zwei Sites,
- die Priorisierung von HIGH gegenüber STD durch Resource-Pool-Shares,
- große VMs, die trotz ausreichender Summenkapazität nicht auf jeden Host
  passen,
- unterschiedliche Clusterklassen wie Realtime, Standard Server, VDI, SAP
  oder OpenShift,
- zeitlich veränderbare Planungsrichtlinien und reproduzierbare,
  gespeicherte Analyseläufe.

## 2. Verbindliches Implementierungs-Gate

Vor der Erzeugung von produktivem Code werden pseudonymisierte Echtdaten
geprüft. Diese Spezifikation beschreibt das Zielmodell, legt aber noch keine
unbestätigten vROps-Metric-Keys oder Importspalten fest.

### 2.1 Vom VMware-Administrator nachzuliefern

- interne vROps-/Aria-Operations-Metric-Keys,
- Einheiten und Objektarten der ausgewählten Metriken,
- genaue Definition von `Cluster CPU Overhead`,
- anonymisierte Spaltenüberschriften des geplanten Exports,
- mehrere pseudonymisierte Beispielzeilen,
- Aggregationssemantik von Average, Maximum und gegebenenfalls Last,
- Zeitzone und Zeitstempelformat,
- Information, ob Sample Count oder Datenabdeckung exportiert werden kann,
- Information, wie ausgeschaltete VMs und Messlücken unterschieden werden,
- Information, ob stabile VM-, Host- und Cluster-IDs verfügbar sind.

### 2.2 Prüfschritte mit den Beispieldaten

1. Metric-Key und Anzeigename eindeutig zuordnen.
2. Einheit, Skalierung und Aggregationsintervall verifizieren.
3. Bestätigen, dass das stündliche Maximum dem Maximum der zwölf
   5-Minuten-Messungen entspricht.
4. VM-, Host-, Cluster- und Resource-Pool-Beziehungen prüfen.
5. CPU Demand auf VM- und Clusterebene für identische Zeitpunkte
   gegeneinander plausibilisieren.
6. Prüfen, ob Cluster CPU Demand den CPU Overhead bereits enthält.
7. Memory Utilization auf absolute MiB und verwendeten Nenner prüfen.
8. Verhalten bei ausgeschalteten, migrierten, neu angelegten und gelöschten
   VMs untersuchen.
9. Datenlücken, doppelte Zeilen und inkonsistente Zeitstempel simulieren.
10. Speicherbedarf und Importdauer anhand einer realistischen Dateigröße
    messen.
11. Pseudonymisierung auf erhaltene referenzielle Integrität prüfen.
12. Ergebnisse für mindestens einen bekannten Cluster manuell mit vROps
    beziehungsweise vorhandenen Betriebsberechnungen vergleichen.

### 2.3 Freigabekriterien

Erst wenn alle folgenden Punkte erfüllt sind, darf ein separater
Implementierungsplan erstellt werden:

- alle benötigten Metric-Keys sind bestätigt,
- CPU Overhead ist semantisch geklärt,
- Maximum/Average sind fachlich verstanden,
- Identitäten und Beziehungen sind eindeutig genug,
- die gewählte Dateistruktur ist importierbar,
- der Speicherbedarf für sieben Tage ist akzeptabel,
- mindestens ein bekannter Cluster kann reproduzierbar nachgerechnet werden,
- offene Datenqualitätsfälle besitzen definierte UI- und Rechenregeln.

## 3. Ausgangslage und Größenordnung

Die Umgebung umfasst ungefähr:

- 10 vCenter,
- vROps/Aria Operations 8.18.7,
- 450 bis 500 ESXi-Hosts,
- 58 Cluster,
- rund 19.000 VMs,
- davon rund 5.000 Server-VMs,
- übrige VMs überwiegend VDI-Clients,
- etwa 30 Cluster im zunächst relevanten Server-Scope,
- circa 95 % der Cluster über zwei Sites mit ungefähr hälftiger
  Hostverteilung.

Hosts eines Clusters besitzen derzeit identische CPU- und meist identische
RAM-Ausstattung. Das Modell darf diese Homogenität nicht voraussetzen, da
zukünftige Cluster gemischte Hostgenerationen enthalten können.

Der aktuelle Fill-Up-Tab ist lediglich als leerer Platzhalter in
`src/pages/Planning.tsx` vorhanden. Die vorhandene
`clusterCapacityEngine.ts` liefert bereits Aggregate, What-if-Projektionen
und Hostausfallsimulationen, verwendet aber mehrere hardcodierte und teilweise
unterschiedliche Schwellenwert-Sätze. Fill Up benötigt deshalb ein
zentralisiertes, konfigurierbares Policy-Modell.

## 4. Begriffe und Einheiten

### 4.1 vCPU statt Cores

Eine hinzukommende VM bringt virtuelle CPUs in den Cluster. Die Ausgabe
verwendet deshalb **vCPU**. **Cores** bezeichnet ausschließlich physische
Host-Cores.

### 4.2 CPU-Kapazität

Für Hardwarevergleiche und Ausfallsimulationen wird CPU-Kapazität in MHz
verwendet:

```text
Host CPU Capacity MHz = Summe der nutzbaren CPU-Leistung des Hosts
Cluster CPU Capacity MHz = Summe der verfügbaren Hostkapazitäten
```

Zusätzlich bleibt `vCPU/Core` eine unabhängige Konfigurations- und
Überbuchungsgrenze.

### 4.3 RAM-Kapazität

```text
Brutto-RAM = Summe des physischen RAMs der betrachteten Hosts
Nutzbarer RAM = Brutto-RAM − System-/ESXi-Puffer
```

Der Puffer ist Bestandteil der Cluster-Policy. Er kann als Prozentsatz,
absoluter Betrag pro Host oder später aus einer bestätigten Datenquelle
berechnet werden.

### 4.4 HIGH und STD

Der letzte Abschnitt des VMware-Resource-Pool-Pfads ist verbindlich:

- `HIGH` → geschäftskritischer Workload,
- `STD` → im Site-Ausfall nachrangiger Workload.

Für das Modell wird angenommen, dass jede relevante VM genau einem dieser
beiden Pools zugeordnet ist. Sollte die Datenprüfung dennoch unbekannte
Zuordnungen finden, werden sie als Datenqualitätsfehler ausgewiesen und nicht
stillschweigend STD zugerechnet.

## 5. Betriebs- und Ausfallkonzept

### 5.1 Normalbetrieb

Alle eingeschalteten HIGH- und STD-VMs müssen laufen. Ausgeschaltete VMs
werden nicht berücksichtigt, da sie als Abbaukandidaten gelten.

### 5.2 N-1

Ein beliebiger einzelner Host darf ausfallen. Alle eingeschalteten HIGH- und
STD-VMs müssen auf den verbleibenden Hosts weiterlaufen beziehungsweise per
HA neu gestartet werden können.

N-1 ist eine verpflichtende Fill-Up-Grenze.

### 5.3 N-2

Zwei Hosts dürfen gleichzeitig fehlen, beispielsweise ein Host im
Maintenance Mode und ein zusätzlicher ungeplanter Ausfall.

N-2 ist ein optionaler Analyse- und Fill-Up-Schalter. Die UI muss klar
anzeigen, ob N-2 nur informativ berechnet oder als harte Fill-Up-Grenze
verwendet wurde.

Bei größeren Clustern kann eine vollständige Simulation aller Hostpaare
erfolgen. Alternativ darf eine fachlich nachweisbar äquivalente konservative
Optimierung verwendet werden, zum Beispiel das Entfernen der für die jeweilige
Metrik ungünstigsten beiden Hosts.

### 5.4 Site-Ausfall

Hosts werden über das Namensschema einer Site zugeordnet:

```text
^esxsrv1 → Site 1
^esxsrv2 → Site 2
```

Die Regeln werden konfigurierbar gespeichert, obwohl derzeit keine Ausnahmen
bekannt sind.

Beide Ausfallrichtungen werden geprüft:

1. Site 1 fällt aus, Site 2 bleibt,
2. Site 2 fällt aus, Site 1 bleibt.

Das schlechtere Ergebnis ist maßgeblich. Eine pauschale Halbierung der
Hostzahl ist nicht ausreichend, da zukünftige Sites trotz gleicher Hostzahl
unterschiedliche CPU- oder RAM-Kapazitäten besitzen können.

Im Site-Ausfall gilt:

- HIGH muss starten und laufen können,
- STD besitzt keine Weiterlaufgarantie,
- STD bleibt zunächst eingeschaltet und wird durch LOW-Shares benachteiligt,
- ein VMware-Administrator kann STD-VMs bei Bedarf manuell abschalten,
- die erwartete außergewöhnliche Betriebsdauer beträgt meist 30 bis
  90 Minuten,
- Site-Ausfälle sind selten und treten nur im Abstand mehrerer Jahre auf.

RDW-Sondercluster mit nur einer Site und zwei Hosts sind zunächst nicht Teil
der Site-Failover-Bewertung. Sie erhalten einen sichtbaren Status
`nicht anwendbar` statt eines fälschlich grünen Ergebnisses.

## 6. Resource-Pool-Modell

Die Cluster verwenden keine harten CPU-/RAM-Limits und keine festen
Reservations. Die Reservation ist als `expandable` konfiguriert. DRS und HA
sind standardmäßig aktiv. Admission Control wird als deaktiviert angenommen.

Scalable Shares sind auf Clusterebene aktiviert.

Beispielhafte effektive Shares:

```text
HIGH CPU Shares: 8.000
STD CPU Shares:  2.000

HIGH RAM Shares: 327.680
STD RAM Shares:   81.920
```

Das Verhältnis liegt ungefähr bei 80:20. Shares priorisieren Ressourcen bei
Contention, reservieren aber keine absolute Kapazität. Deshalb wird zwischen
drei CPU-Zuständen im Site-Ausfall unterschieden:

| HIGH P95 CPU Demand relativ zur Restkapazität | Status | Interpretation |
|---|---|---|
| unter 80 % | grün | HIGH liegt ungefähr innerhalb des priorisierten Share-Anteils |
| 80 % bis unter 100 % | gelb | HIGH passt insgesamt, kann aber das Abschalten von STD erfordern |
| ab 100 % | rot | HIGH passt selbst ohne STD nicht in die Restkapazität |

Die 80-%- und 100-%-Grenzen sind Policy-Werte. Die UI kann aus den aktuellen
Shares einen Vorschlag ableiten, verwendet aber nie ungeprüft ein
Share-Verhältnis als garantierte Kapazität.

## 7. RAM-Modell

### 7.1 Grundsatz

RAM wird nicht als klassischer Overcommit geplant. Maßgeblich ist der
konfigurierte RAM eingeschalteter VMs.

Im Normalbetrieb liegt die Summe des konfigurierten VM-RAMs typischerweise bei
ungefähr 70 % des verfügbaren Cluster-RAMs.

Für HIGH liegen derzeit ungefähr folgende Größen vor:

- etwa 45 % des gesamten Cluster-RAMs konfiguriert,
- etwa 35 % tatsächlich genutzt.

### 7.2 Startfähigkeit

N-1 für alle Workloads:

```text
Σ konfigurierter RAM aller eingeschalteten HIGH- und STD-VMs
≤ nutzbarer RAM nach Ausfall des betrachteten Hosts
```

Optional N-2:

```text
Σ konfigurierter RAM aller eingeschalteten HIGH- und STD-VMs
≤ nutzbarer RAM nach Ausfall des betrachteten Hostpaars
```

Site-Ausfall für HIGH:

```text
Σ konfigurierter RAM aller eingeschalteten HIGH-VMs
≤ nutzbarer RAM der verbleibenden Site
```

### 7.3 HIGH-RAM-Ampel

Initiale Standardwerte:

- gelb ab 45 %,
- rot ab 50 %.

Der analysierte Prozentsatz verwendet eine klar bezeichnete Kapazitätsbasis.
Die UI darf den originalen vROps-Wert relativ zur Bruttokapazität zusätzlich
anzeigen, muss ihn aber von der eigenen Fill-Up-Berechnung relativ zur
nutzbaren Kapazität unterscheiden.

Die reale Site-Restkapazität bleibt immer eine zusätzliche harte Grenze. Bei
unterschiedlich großen Sites oder Systempuffern kann sie vor der nominellen
50-%-Grenze limitieren.

### 7.4 Cluster Memory Utilization

Obwohl die RAM-Zuweisung nicht überbucht werden soll, bleibt die zeitliche
Cluster Memory Utilization relevant. Sie schwankt innerhalb eines Tages um
bis zu ungefähr 20 Prozentpunkte und beschreibt Laufzeitverhalten, nicht
Startfähigkeit.

Die Metrik wird als sekundäre Policy-Grenze verwendet:

```text
P95 Cluster Memory Utilization
+ prognostizierte Nutzung des neuen Workloads
< verbleibender nutzbarer RAM × Profilziel
```

Bevorzugt wird ein absoluter Wert in MiB. Ein reiner Prozentwert benötigt den
zugehörigen Kapazitätsnenner des Zeitpunkts und ist während Maintenance
schwerer interpretierbar.

VM-spezifische Memory-Utilization-Zeitreihen werden zunächst nicht importiert.
Die Projektion zusätzlicher normaler Workloads darf aus dem Verhältnis von
Cluster-P95-Nutzung zu aktuell konfiguriertem Cluster-RAM abgeleitet werden.
Für HIGH-Failover bleibt der konfigurierte RAM die konservative harte Grenze.

## 8. CPU-Modell

### 8.1 Konfigurationsgrenze

```text
vCPU/Core =
Σ vCPU aller eingeschalteten VMs / Σ physische Cores
```

Maximalwerte sind clusterprofilabhängig. Realtime-Cluster können eine geringe
oder keine CPU-Überbuchung verlangen, während VDI-Cluster höhere Verhältnisse
zulassen.

### 8.2 Laufzeitbedarf

Die zentrale Planungsmetrik ist CPU Demand in MHz. Sie wird zeitgleich je
Cluster sowie getrennt nach HIGH und STD aggregiert.

```text
Cluster CPU Demand(t) =
Σ VM CPU Demand(t) aller eingeschalteten VMs des Clusters
```

```text
HIGH CPU Demand(t) =
Σ VM CPU Demand(t) aller eingeschalteten HIGH-VMs
```

Für Fill Up wird standardmäßig das konfigurierbare Planungsperzentil,
initial P95, über den ausgewählten Zeitraum verwendet.

VM-Maxima dürfen nicht addiert werden, als wären sie gleichzeitig
aufgetreten:

```text
falsch:
Cluster-Spitze = Σ Maximum jeder VM im gesamten Zeitraum
```

Die primäre Clusterserie entsteht aus zeitgleichen Werten:

```text
Cluster-Demand(t) = Σ VM-Demand-Average(t)
Planungswert = P95 der resultierenden Cluster-Demand-Zeitreihe
```

Das direkte stündliche Cluster-Maximum aus vROps bleibt ein wichtiger
Spike- und Vollständigkeits-Cross-Check. Stündliche VM-Maxima dienen der
Einzel-VM-Analyse und dem Erkennen kurzzeitiger VM-Spitzen, werden aber nicht
blind als gleichzeitige Clusterlast summiert.

### 8.3 CPU Ready und CPU Contention

VM CPU Ready und Cluster CPU Contention sind Kontroll- und
Qualitätsmetriken:

- CPU Ready zeigt, ob einzelne VMs trotz scheinbar ausreichender
  Summenkapazität bereits warten.
- Cluster CPU Contention zeigt aggregierten Scheduling-Druck.
- Realtime-/Telefonieprofile verwenden strengere Grenzwerte.
- VDI-Profile können höhere Überbuchung erlauben, solange Demand, Ready und
  Contention innerhalb der Profilwerte bleiben.

Wenn Ready oder Contention bereits vor dem Fill Up rot sind, darf die Engine
keine scheinbar sichere zusätzliche Kapazität ausgeben. Das Ergebnis wird als
`bereits außerhalb der Policy` markiert. Optional kann weiterhin ein rein
rechnerischer Headroom als Information angezeigt werden, jedoch nicht als
Empfehlung.

### 8.4 CPU Overhead

Für einen Beispielcluster wurden ungefähr 315 GHz CPU Overhead bei
4.300 GHz Clusterkapazität beobachtet, also rund 7,3 %. Dieser Anteil ist
potenziell relevant.

Vor der Implementierung muss geklärt werden, ob Cluster CPU Demand den
Overhead bereits enthält.

Falls der Overhead getrennt ist:

```text
Planbare CPU-Kapazität =
physische CPU-Kapazität
− P95 CPU Overhead
− Policy-Sicherheitspuffer
```

Falls Cluster CPU Demand den Overhead bereits enthält, darf er nicht erneut
abgezogen werden. Der Analyzer speichert in jedem Lauf, welcher
Overhead-Modus verwendet wurde:

- `included-in-demand`,
- `subtract-explicitly`,
- `ignored-by-policy`,
- `unknown` – blockiert eine belastbare Empfehlung.

## 9. Ausgewählte vROps-Metriken

Die endgültigen Metric-Keys werden erst nach der Echtdatenprüfung eingetragen.

### 9.1 Pro VM und Stunde

| Fachliche Metrik | Benötigte Statistik | Einheit | Zweck |
|---|---|---|---|
| VM CPU Demand | Average, Maximum | MHz | tatsächlicher CPU-Bedarf und Zeitprofil |
| VM CPU Ready | Maximum, Average optional | % | VM-spezifische Contention-Kontrolle |

### 9.2 Pro Cluster und Stunde

| Fachliche Metrik | Benötigte Statistik | Einheit | Zweck |
|---|---|---|---|
| Cluster CPU Demand | Average, Maximum | MHz | autoritativer Cluster-Cross-Check |
| Cluster Memory Utilization | Average, Maximum | bevorzugt MiB | Laufzeit-RAM-Profil |
| Cluster CPU Contention | Maximum, Average optional | % | aggregierter Scheduling-Druck |
| Cluster CPU Overhead | Average, Maximum | MHz | optionaler Kapazitätsabzug nach Semantikprüfung |

`Last` wird für diese Zeitreihen zunächst nicht gespeichert. Zustands- und
Konfigurationsdaten kommen aus RVTools beziehungsweise aus kompakten
Beziehungsinformationen des vROps-Exports.

## 10. RVTools-Daten

Weiterverwendet werden insbesondere:

- VM-Name und stabile VM-ID, sofern vorhanden,
- Power State,
- konfigurierte vCPU,
- konfigurierter RAM,
- Cluster,
- Host,
- Resource-Pool-Pfad,
- physische Host-Cores,
- Host-CPU-Kapazität in MHz,
- Host-RAM,
- Host-Verbindungs-, Power- und Maintenance-Zustand,
- DRS- und HA-Status,
- Resource-Pool-Shares, Share-Level, Scalable Shares,
- Reservations, Limits und Expandable Reservation.

Nur eingeschaltete VMs fließen in Fill Up ein.

RVTools ist ein Snapshot. Historische vROps-Werte werden deshalb bevorzugt
mit einer kompakten historischen Beziehung VM → Cluster/Host/RP geliefert.
Falls die Echtdatenprüfung zeigt, dass diese Beziehungen im siebentägigen
Fenster ausreichend stabil sind, dürfen sie platzsparend als
`gültig-ab`-Segmente statt pro Stunde gespeichert werden.

## 11. Datenmenge und Speicherstrategie

### 11.1 Größenordnung

| Scope | Zeitraum | VM-Stunden |
|---|---:|---:|
| 5.000 Server-VMs | 7 Tage | 840.000 |
| 5.000 Server-VMs | 30 Tage | 3.600.000 |
| 19.000 alle VMs | 7 Tage | 3.192.000 |
| 19.000 alle VMs | 30 Tage | 13.680.000 |

Für 30 Servercluster entstehen bei sieben Tagen lediglich:

```text
30 × 168 = 5.040 Cluster-Zeitpunkte
```

Die Clusterzeitreihen sind damit vernachlässigbar klein. Die VM-Zeitreihen
bestimmen den Speicherbedarf.

Für sieben Tage Serverdaten mit drei numerischen Reihen:

- CPU Demand Average,
- CPU Demand Maximum,
- CPU Ready Maximum

ergibt sich bei `Float32`:

```text
840.000 × 3 × 4 Byte ≈ 10 MB reine Messwerte
```

Mit Dictionaries, Missing-Value-Masken und Indizes wird grob mit
15 bis 30 MB unkomprimiert gerechnet. Diese Annahme wird mit Echtdaten
gemessen und nicht nur theoretisch übernommen.

Die erste Datenprüfung und Implementierungsstufe darf auf die ungefähr
5.000 Server-VMs begrenzt werden. VDI wird fachlich bereits als Profil
vorgesehen, kann wegen des deutlich größeren Datenvolumens aber als eigener
Import-Scope oder in einer späteren Ausbaustufe aktiviert werden.

### 11.2 Keine Einzelobjekte pro Messpunkt

840.000 VM-Stunden dürfen nicht als 840.000 umfangreiche JavaScript- oder
IndexedDB-Objekte gespeichert werden. Objekt-, Property- und Index-Overhead
würden den Speicherbedarf vervielfachen.

Stattdessen:

- VM-, Host-, Cluster- und RP-IDs dictionary-codieren,
- gemeinsame stündliche Zeitachse verwenden,
- Messwerte in `Float32Array` speichern,
- fehlende Werte mit `NaN` oder kompakter Bitmaske markieren,
- Daten nach Cluster und Tag oder Import und Cluster chunken,
- binäre `ArrayBuffer` in IndexedDB ablegen,
- optional zusätzlich komprimieren, wenn Messungen dies rechtfertigen.

### 11.3 Importverarbeitung

Der Import läuft in einem Web Worker:

1. Datei blockweise lesen und parsen.
2. Metric-Keys auf bestätigte fachliche Metriken abbilden.
3. Identitäten dictionary-codieren.
4. Messwerte in kompakte Arrays schreiben.
5. Cluster-, HIGH- und STD-Zeitreihen zeitgleich aggregieren.
6. VM-Summaries berechnen.
7. Datenabdeckung und Fehlerstatistik erzeugen.
8. Chunks transaktional in IndexedDB speichern.
9. Rohdatei nach erfolgreicher Verarbeitung nicht persistieren.

Der UI-Thread darf während des Imports nicht blockieren. Fortschritt und
Fehler müssen wie im bestehenden RVTools-Import sichtbar sein.

### 11.4 Gespeicherte Ableitungen

Pro VM:

- P50/P95/Maximum CPU Demand,
- Maximum und optional P95 CPU Ready,
- Anzahl erwarteter und vorhandener Messpunkte,
- Datenabdeckung,
- sieben Tage Stundenprofil für die Detailansicht.

Pro Cluster sowie HIGH und STD:

- stündlicher CPU Demand Average/Maximum,
- P50/P95/Maximum,
- stündliche Cluster Memory Utilization,
- CPU Contention,
- CPU Overhead nach Verfügbarkeit,
- Datenabdeckung und Anzahl beitragender VMs.

Die abgeleiteten Aggregate beschleunigen Fill-Up-Runs. Die kompakten
VM-Zeitreihen bleiben für VM-Drill-down und What-if-Planung erhalten.

## 12. Clusterprofile und Policies

### 12.1 Vordefinierte Profilarten

- Realtime/Telefonie
- Standard Server Windows
- Standard Server Linux
- VDI
- Vorzone/Test
- Spezial
- SAP
- PaaS/OpenShift
- RDW/Data Warehouse
- VMware Management

Ein Cluster erhält genau ein Basisprofil und kann einzelne Overrides besitzen.
Profile werden nicht anhand des Clusternamens erzwungen. Eine automatische
Vorschlagslogik darf später ergänzt werden, die endgültige Zuordnung bleibt
explizit.

### 12.2 Policy-Felder

Ein späteres Domänenmodell soll mindestens folgende fachliche Felder
abbilden:

```ts
interface CapacityPolicy {
  id: string;
  name: string;

  lookbackDays: number;
  planningPercentile: number;

  maxVcpuPerCoreNormal: number;
  maxVcpuPerCoreN1: number;
  maxVcpuPerCoreN2: number | null;

  cpuDemandWarnPctNormal: number;
  cpuDemandDangerPctNormal: number;
  cpuDemandDangerPctN1: number;
  cpuDemandDangerPctN2: number | null;

  cpuReadyWarnPct: number;
  cpuReadyDangerPct: number;
  cpuContentionWarnPct: number;
  cpuContentionDangerPct: number;

  totalRamAssignedWarnPct: number;
  totalRamAssignedDangerPct: number;
  memoryUtilizationWarnPct: number;
  memoryUtilizationDangerPct: number;

  highRamAssignedWarnPct: number;
  highRamAssignedDangerPct: number;
  highCpuSiteWarnPct: number;
  highCpuSiteDangerPct: number;

  cpuSafetyBufferPct: number;
  ramSafetyBufferPct: number;
  ramSystemReserveMiBPerHost: number;

  requireN1: boolean;
  useN2AsHardLimit: boolean;
  requireHighSiteFailover: boolean;

  maxSingleVmHostCpuPct: number;
  maxSingleVmHostRamPct: number;

  cpuOverheadMode:
    | "included-in-demand"
    | "subtract-explicitly"
    | "ignored-by-policy";
}
```

Das ist eine fachliche Skizze, kein bereits freigegebener TypeScript-Vertrag.
Die tatsächlichen Typen werden bei der Implementierung zuerst in
`src/domain/models/types.ts` eingeführt.

### 12.3 Warn- und Maximalwerte

Die UI konfiguriert fachliche Ziel- und Maximalwerte, nicht bloß Farben.

- Grün: innerhalb des Zielbereichs,
- Gelb: zwischen Ziel- und Maximalwert,
- Rot: Maximalwert erreicht oder überschritten.

Einige Profile dürfen explizite Warn- und Danger-Werte setzen. Für weniger
komplexe Policies kann Gelb aus einem konfigurierbaren Anteil des Maximums
abgeleitet werden. Berechnung, Tabellenfarbe, Tooltips und Risk-Bewertung
müssen dieselbe Policy-Quelle verwenden.

### 12.4 Versionierung

Policies sind versioniert. Eine Änderung erzeugt eine neue Version oder eine
unveränderliche Policy-Kopie im Analyzer-Run. Alte Runs dürfen sich durch
spätere Änderungen niemals rückwirkend verändern.

## 13. Fill-Up-Berechnung

### 13.1 Allgemeines Prinzip

Für jede Dimension wird die maximal mögliche Zugabe je Guardrail berechnet.
Der kleinste nichtnegative Wert ist der Headroom. Die limitierende Metrik wird
gespeichert und angezeigt.

```text
CPU Headroom =
min(
  vCPU/Core Headroom,
  CPU Demand Normalbetrieb,
  CPU Demand N-1,
  optional CPU Demand N-2,
  HIGH CPU Site-Failover,
  Ready-/Contention-Policy
)
```

```text
RAM Headroom =
min(
  gesamte konfigurierte RAM-Grenze,
  RAM N-1,
  optional RAM N-2,
  HIGH RAM Site-Failover,
  Memory-Utilization-Policy,
  Einzelhost-Platzierbarkeit
)
```

Rote Grenzwerte sind inklusive: `Wert >= Danger` ist rot. Der maximal
empfohlene Fill-Up-Wert muss strikt unter der Danger-Grenze liegen.

### 13.2 Unabhängige Maxima

CPU und RAM werden zunächst unabhängig maximiert:

```text
+123 vCPU
+356 GiB RAM
```

Die UI kennzeichnet ausdrücklich, dass beide unabhängigen Maxima nicht
automatisch gemeinsam realisierbar sein müssen.

### 13.3 Typische VM-Profile

Aus RVTools-Konfiguration und vROps-Demand können repräsentative VM-Profile
gebildet oder manuell eingegeben werden:

```text
Profil "Standard Linux":
4 vCPU
16 GiB RAM
P95 CPU Demand 2.100 MHz
RP HIGH oder STD
```

Die Engine berechnet die maximale ganzzahlige Anzahl solcher VMs, die alle
aktivierten Guardrails gleichzeitig erfüllt.

### 13.4 HIGH-/STD-Slider

Der Nutzer wählt einen Anteil:

```text
70 % HIGH / 30 % STD
```

Für RAM und CPU werden die zusätzlichen Profile entsprechend aufgeteilt.

- Cluster-, N-1- und N-2-Grenzen sehen HIGH und STD gemeinsam.
- Site-Failover-Grenzen sind für HIGH verpflichtend.
- STD-Site-Failover wird informativ berechnet.
- Die tatsächlichen Share-Verhältnisse können als Orientierung eingeblendet
  werden.

### 13.5 Projektion zusätzlicher CPU-Last

Für ein definiertes VM-Profil wird dessen P95-Demand verwendet.

Für eine freie vCPU-Eingabe kann ein konfigurierbares oder aus dem Cluster/RP
abgeleitetes Demand-je-vCPU-Profil verwendet werden:

```text
prognostizierter zusätzlicher Demand =
zusätzliche vCPU × P95 Demand je vCPU des gewählten Profils
```

Die UI muss die Quelle nennen:

- manuelles Profil,
- Durchschnitt/P95 des Zielclusters,
- HIGH- oder STD-spezifisches Clusterprofil,
- ausgewählte Referenz-VM-Gruppe.

Eine vCPU-Zahl ohne Lastprofil darf nur gegen vCPU/Core gerechnet und nicht
als vollständige CPU-Fill-Up-Empfehlung ausgegeben werden.

### 13.6 Projektion zusätzlicher RAM-Nutzung

Die harte Zuweisungsgrenze verwendet immer den konfigurierten zusätzlichen
RAM.

Die optionale Laufzeitprojektion verwendet ein Profil:

```text
prognostizierte zusätzliche RAM-Nutzung =
zusätzlicher konfigurierter RAM
× historisches P95-Nutzungsverhältnis
```

Für HIGH-Site-Failover bleibt unabhängig davon der vollständig konfigurierte
RAM maßgeblich.

### 13.7 Präferenz für größere Cluster

Größere Cluster werden bei ansonsten vergleichbarer Eignung bevorzugt. Diese
Präferenz entsteht bereits sachlich durch den geringeren relativen Verlust
bei N-1:

```text
relativer N-1-CPU-Verlust =
CPU-Kapazität des ungünstigsten Hosts / Cluster-CPU-Kapazität
```

```text
relativer N-1-RAM-Verlust =
RAM des ungünstigsten Hosts / Cluster-RAM
```

Die UI zeigt diese Prozentsätze. Für Rankings gilt:

1. alle harten Policies müssen erfüllt sein,
2. höherer gemeinsamer Fill-Up-Headroom ist besser,
3. kleinerer relativer N-1-Verlust ist besser,
4. größere Hostzahl dient nur noch als nachgelagerter Tie-Breaker.

Damit werden größere Cluster bevorzugt, ohne einen kleinen, aber fachlich
besser geeigneten Spezialcluster allein aufgrund seiner Hostzahl
auszuschließen.

## 14. Host-, Site- und Platzierungssimulation

### 14.1 N-1

Jeder Host wird einzeln entfernt. Für jeden Zustand werden CPU, RAM,
vCPU/Core und Platzierbarkeit geprüft. Das schlechteste Ergebnis bestimmt
den N-1-Headroom.

### 14.2 N-2

Bei aktivierter N-2-Simulation werden Hostpaare geprüft. Da maximal ungefähr
32 Hosts je großem Cluster erwartet werden, ist eine vollständige
Paarprüfung rechnerisch überschaubar. Die konkrete Laufzeit wird dennoch in
einem Worker gemessen.

### 14.3 Site-Ausfall

Die Site-Zuordnung wird aus den konfigurierten Hostnamensregeln abgeleitet.
Beide Sites werden separat entfernt. Die HIGH-VMs werden auf den jeweils
verbleibenden Hosts geprüft.

### 14.4 Große VMs

Ziel ist, dass eine einzelne VM maximal ungefähr 50 % eines Hosts beansprucht.
Es existieren jedoch etwa 5 bis 20 bekannte Ausnahmen unter rund
5.000 Server-VMs.

Eine Überschreitung blockiert Fill Up nicht automatisch. Sie erzeugt eine
rote Warnung.

Zusätzlich wird eine Platzierungssimulation ausgeführt:

1. relevante VMs absteigend nach RAM, CPU-Größe und Demand sortieren,
2. verbleibende Hosts mit ihrer individuellen Restkapazität modellieren,
3. VMs konservativ verteilen, zum Beispiel per First-Fit Decreasing,
4. nicht platzierbare VMs ausdrücklich ausweisen.

Eine spätere exakte Optimierung ist nicht erforderlich, solange der
heuristische Test konservativ ist und keine garantierte Platzierbarkeit
behauptet.

## 15. Gespeicherte Analyzer-Runs

### 15.1 Ziel

Ein Nutzer soll mit denselben oder neuen vROps-Daten unterschiedliche
Policies und Szenarien rechnen und die Resultate später vergleichen können.

### 15.2 Unveränderlicher Run

Jeder Run speichert mindestens:

- Run-ID und Name,
- Erstellungszeit,
- verwendete RVTools-Snapshot-IDs und Prüfsummen,
- verwendete vROps-Import-ID und Prüfsumme,
- Analysezeitraum,
- Datenabdeckung,
- Engine-Version,
- vollständige Kopie der verwendeten Policy-Versionen,
- Clusterprofil-Zuweisungen und Overrides,
- Site-Zuordnungsregeln,
- N-2-Einstellung,
- HIGH-/STD-Slider beziehungsweise Workloadprofil,
- verwendetes Perzentil,
- CPU-Overhead-Modus,
- Ergebnisse pro Cluster,
- limitierende Metriken,
- Warnungen und Datenqualitätsbefunde.

Ein alter Run bleibt unverändert, auch wenn später:

- Profile geändert werden,
- neue vROps-Daten importiert werden,
- ein neuer RVTools-Snapshot aktiv wird,
- die Berechnungsengine weiterentwickelt wird.

### 15.3 Aktionen

- Run speichern,
- Run umbenennen,
- Run öffnen,
- Run duplizieren,
- mit neuer Policy neu berechnen,
- mit neuem vROps-Import neu berechnen,
- zwei Runs vergleichen,
- Run löschen,
- Runs gemeinsam mit Backup/Restore exportieren.

Zeitreihendaten werden pro Import einmal gespeichert und von Runs
referenziert. Ein Run dupliziert keine sieben Tage VM-Messwerte. Damit ein
Run auch nach dem Löschen seiner Quelldaten nachvollziehbar bleibt, speichert
er seine Ergebniswerte, Policy-Snapshots und Datenqualitätszusammenfassung
vollständig.

## 16. UI-Konzept

### 16.1 Planungsseite

Der bestehende Bereich `Planung` behält:

- `What-if`,
- `Fill up`.

Fill Up erhält folgende Bereiche:

1. Datenstand und Datenqualität,
2. Policy-/Profilverwaltung,
3. Clusterprofil-Zuordnung,
4. Szenarioeinstellungen,
5. Clusterergebnisse,
6. Detailansicht eines Clusters,
7. gespeicherte Analyzer-Runs und Vergleich.

### 16.2 Clusterergebnis

Mindestens:

| Feld | Bedeutung |
|---|---|
| Cluster | eindeutiger Cluster inklusive vCenter |
| Profil | verwendete Capacity Policy |
| Hosts/Sites | Ausgangskapazität und Verteilung |
| STD +vCPU/+RAM | maximaler STD-Headroom |
| HIGH +vCPU/+RAM | maximaler HIGH-Headroom |
| Mix-Ergebnis | Ergebnis des Sliders/VM-Profils |
| N-1 | erfüllt, knapp oder verletzt |
| N-2 | deaktiviert, erfüllt, knapp oder verletzt |
| HIGH Site-Failover | schlechteste Site-Richtung |
| Limiter CPU | konkrete Metrik und Szenario |
| Limiter RAM | konkrete Metrik und Szenario |
| Datenqualität | Abdeckung, Missing Values, unbekannte Zuordnungen |
| Warnungen | große VMs, bereits rote Ausgangslage, Overhead unbekannt |

### 16.3 Detailansicht

- sieben Tage CPU-Demand-Profil,
- sieben Tage Memory-Utilization-Profil,
- VM CPU Ready und Cluster CPU Contention,
- HIGH-/STD-Anteile,
- Vorher-/Nachher-Werte aller Guardrails,
- N-1-, N-2- und Site-Ausfallzustände,
- verbleibende Kapazität pro Host/Site,
- große und nicht sicher platzierbare VMs,
- Erklärung der limitierenden Formel.

### 16.4 Konfigurationsoberfläche

- Profil erstellen, duplizieren, bearbeiten und löschen,
- Cluster einem Profil zuweisen,
- einzelne Clusterwerte überschreiben,
- Defaults wiederherstellen,
- Warn-/Danger-Werte mit Einheit und Beschreibung anzeigen,
- ungültige Kombinationen verhindern,
- Änderungen zunächst als Entwurf halten,
- gespeicherte Runs nie rückwirkend verändern.

## 17. Umgang mit Störungen und Wartung

Hardwareausfälle treten bei ungefähr 500 Hosts nur rund 10 bis 15 Mal pro
Jahr auf. Eine probabilistische Monte-Carlo-Simulation ist deshalb nicht Teil
der ersten Version.

Die erste Version verwendet verständliche deterministische Szenarien:

- Normalbetrieb,
- N-1,
- optional N-2,
- Site 1 ausgefallen,
- Site 2 ausgefallen.

Historische Patch- oder Ausfallstunden werden nicht automatisch aus dem
P95-Zeitraum entfernt. Die Datenprüfung muss zeigen, ob sie anhand der
vorhandenen Merkmale erkannt werden können. Später sind zwei parallele
Auswertungen denkbar:

- repräsentatives Betriebsprofil ohne markierte Wartungsfenster,
- Stressprofil inklusive Wartung und Störungen.

Monte Carlo kann später als informative Erweiterung folgen, wenn
Ausfallraten, Reparaturzeiten und Abhängigkeiten belastbar modelliert sind.
Sie darf keine deterministische N-1-/Site-Failover-Grenze ersetzen.

## 18. Datenqualität und Vertrauensniveau

Jedes Ergebnis erhält ein Vertrauensniveau:

- **hoch:** vollständige Datenabdeckung, eindeutige Beziehungen, bestätigter
  Overhead, keine unbekannten RPs,
- **mittel:** kleinere Messlücken oder statische Beziehung über sieben Tage,
- **niedrig:** größere Lücken, unbestätigte Einheit, Overhead unbekannt,
  Cluster/RP-Zuordnung unsicher,
- **nicht berechenbar:** Pflichtmetrik oder Kapazitätsbasis fehlt.

Pflichtprüfungen:

- erwartete gegen vorhandene Stunden,
- doppelte Zeitpunkte,
- nicht endliche oder negative Werte,
- unrealistische Einheitensprünge,
- Cluster CPU Demand gegen Summe der VM-Demands,
- VM ohne aktiven Cluster/Host/RP,
- Host ohne Site-Zuordnung,
- vROps- und RVTools-Datenstände zu weit auseinander,
- VM-Namenskollisionen über vCenter hinweg,
- Cluster-Namenskollisionen über vCenter hinweg.

Ein niedriger Datenqualitätsstatus darf nicht als grüner Kapazitätsstatus
erscheinen.

## 19. Architektur und Integration

### 19.1 Domänenlogik

Die Berechnung wird als reine, UI-unabhängige Engine umgesetzt. Mögliche
zukünftige Grenzen:

- `src/domain/services/fillUpCapacityEngine.ts`
- `src/domain/services/capacityPolicyService.ts`
- `src/domain/services/vropsTimeSeriesImportService.ts`

Die bestehenden Funktionen aus `clusterCapacityEngine.ts` sollen
wiederverwendet oder konsolidiert werden. Parallele, widersprüchliche
Schwellenwertdefinitionen sind nicht zulässig.

### 19.2 Datenzugriff

Neue Seiten- und Komponentenlogik greift über Hooks in
`src/hooks/useActiveSnapshots.ts` beziehungsweise spezialisierte
Planungshooks zu. Ad-hoc-Zugriffe direkt aus Tabellenkomponenten auf IndexedDB
werden vermieden.

### 19.3 IndexedDB

Erforderliche neue Datenarten sind voraussichtlich:

- vROps-Zeitreihen-Importmetadaten,
- dictionary-codierte Zeitreihen-Chunks,
- VM- und Cluster-Summaries,
- Capacity Policies und Versionen,
- Clusterprofil-Zuweisungen,
- Analyzer-Runs und Ergebnisse.

Bei der späteren Implementierung beginnt jede Modelländerung in
`src/domain/models/types.ts`. Die IndexedDB-`DB_VERSION` wird erhöht und eine
Migration in `src/data/db/index.ts` ergänzt.

### 19.4 Frontend-only

- kein Backend,
- keine serverseitige Berechnung,
- Import und Aggregation im Web Worker,
- Persistenz ausschließlich lokal in IndexedDB,
- statisches Deployment bleibt erhalten.

## 20. Verhältnis zu bestehenden Metriken

Die aktuelle Capacity-Seite besitzt mehrere Schwellenwert-Sätze:

- `CAPACITY_THRESHOLDS`,
- `HEALTH_COLUMN_THRESHOLDS`,
- `VROPS_RISK_THRESHOLDS`,
- zusätzliche direkt in UI-Komponenten übergebene Werte.

Vor Fill Up werden diese in eine gemeinsame Policy-Quelle überführt oder
explizit als unterschiedliche fachliche Kontexte benannt. Insbesondere darf
eine Metrik in Fill Up nicht gelb sein, während dieselbe Metrik in der
Capacity-Tabelle bereits rot dargestellt wird.

Der bestehende Risk-Score ist eine aggregierte Priorisierung und enthält auch
Faktoren, die Fill Up nicht direkt verändert. Er wird daher nicht ungeprüft
als alleinige harte Kapazitätsgrenze verwendet. Fill Up zeigt stattdessen
direkte Guardrails und deren konkrete Limiter. Ein bereits roter Risk-Score
wird als Warnung und Ausgangslage dargestellt.

Das aktuell ignorierte vROps-Panel 8 `Free vCPU` kann nach der
Echtdatenprüfung als Cross-Check importiert werden. Es ersetzt nicht die
eigene transparente Fill-Up-Berechnung, solange seine Formel nicht eindeutig
bekannt und reproduziert ist.

## 21. Nicht-Ziele der ersten Version

- keine automatische Abschaltung von STD-VMs,
- keine Änderung an vCenter, DRS, HA oder Resource Pools,
- keine Serverkomponente,
- keine automatische Migration von VMs,
- keine Garantie einer exakten zukünftigen Performance,
- keine Monte-Carlo-Simulation als Kapazitätsentscheidung,
- keine vollständige Modellierung seltener einseitiger RDW-Cluster,
- keine VM-Memory-Zeitreihen für alle VMs,
- keine 30- oder 90-Tage-Pflichtaufbewahrung,
- keine Verwendung unbestätigter Metric-Keys,
- keine produktive Implementierung vor Freigabe der Beispieldaten.

## 22. Teststrategie

### 22.1 Import

- Metric-Key-Mapping,
- Einheitenkonvertierung,
- Average/Maximum-Zuordnung,
- Zeitstempel und Zeitzone,
- Missing Values,
- doppelte Werte,
- ausgeschaltete VMs,
- Objektumbenennung und Migration,
- große Dateien und Abbruch,
- transaktionale Speicherung,
- Wiederaufnahme beziehungsweise sauberes Rollback.

### 22.2 Verdichtung

- exakt 168 Stunden für sieben volle Tage,
- korrekte P50/P95/Maximum-Berechnung,
- zeitgleiche Cluster-, HIGH- und STD-Aggregation,
- Summe VM Demand gegen Cluster Demand,
- Datenabdeckung,
- dictionary-codierte Roundtrips,
- identische Resultate vor und nach Binärpersistenz.

### 22.3 Szenarien

- homogene und heterogene Hosts,
- N-1 jedes einzelnen Hosts,
- N-2 mehrerer Hostpaare,
- Ausfall beider Sites,
- ungleich große Sites,
- HIGH passt, STD nicht,
- HIGH liegt zwischen 80 und 100 % CPU-Restkapazität,
- HIGH überschreitet 100 %,
- RAM exakt unter und exakt an der Danger-Grenze,
- große VM passt nur auf einzelne Hosts,
- VM ist nach Ausfall nicht platzierbar,
- Cluster mit nur einer Site,
- DRS/HA fehlen,
- bereits rote Ausgangslage.

### 22.4 Policies und Runs

- Profilvererbung und Cluster-Override,
- Grenzwertänderung erzeugt neue Resultate,
- alte Runs bleiben unverändert,
- Run-Duplikation,
- Vergleich zweier Imports,
- Vergleich zweier Policies,
- gelöschte Quelldaten verändern gespeicherte Run-Ergebnisse nicht,
- Backup und Restore.

### 22.5 Performance

- realistische 840.000 VM-Stunden,
- Import im Worker ohne UI-Blockade,
- Speicherverbrauch vor, während und nach dem Import,
- Laden eines einzelnen VM-Profils,
- Laden eines Clusters,
- Fill-Up aller rund 58 Cluster,
- N-2- und Platzierungssimulation,
- wiederholte Runs ohne Duplikation der Zeitreihen.

## 23. Abnahmekriterien für die spätere Implementierung

- Sieben Tage pseudonymisierte Echtdaten können lokal importiert werden.
- Die Anwendung bleibt während des Imports bedienbar.
- Der Speicherbedarf entspricht der gemessenen und dokumentierten Zielgröße.
- VM- und Clusterprofile zeigen den siebentägigen Verlauf.
- Policies sind pro Profil und Cluster konfigurierbar.
- N-1 ist immer Bestandteil der Empfehlung.
- N-2 kann optional als harte Grenze aktiviert werden.
- HIGH wird gegen beide Site-Ausfallrichtungen geprüft.
- STD-Site-Failover wird informativ, nicht verpflichtend bewertet.
- CPU-, RAM- und Platzierungslimiter sind nachvollziehbar.
- Große Ausnahme-VMs erzeugen rote Warnungen, blockieren aber nicht pauschal.
- HIGH-/STD-Slider und typische VM-Profile liefern gemeinsame Ergebnisse.
- Unabhängige vCPU- und RAM-Maxima werden als solche gekennzeichnet.
- Analyzer-Runs sind reproduzierbar, versioniert und vergleichbar.
- Alte Runs ändern sich nicht durch neue Policies oder Imports.
- Fehlende oder unklare Daten führen nicht zu einem grünen Ergebnis.
- Test, Lint und Production-Build laufen erfolgreich.

## 24. Nächster Schritt

Der nächste Schritt ist ausschließlich die **Echtdatenvalidierung**:

1. pseudonymisierten vROps-Beispielexport bereitstellen,
2. Metric Keys und Semantik dokumentieren,
3. Importform und Datenvolumen messen,
4. bekannte Cluster manuell gegenrechnen,
5. diese Spezifikation mit den bestätigten Erkenntnissen aktualisieren,
6. fachliche Freigabe einholen,
7. erst danach einen detaillierten Implementierungsplan erstellen.
