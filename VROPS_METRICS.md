# vROps-Metriken und Exportkonfiguration

## Zweck

Dieses Dokument beschreibt, welche Views und Reports in VMware Aria
Operations beziehungsweise vRealize Operations Manager 8.18.7 für den
RVTools Analyzer erstellt werden sollen.

Die Exporte bilden die Grundlage für:

- Fill-Up-Kapazitätsplanung,
- CPU- und RAM-Profile,
- HIGH-/STD-Auswertungen,
- N-1-, optionale N-2- und Site-Failover-Analysen,
- Peak-Contributor- und Ursachenanalysen,
- VM-Verhaltensklassen und Workload-Korrelation,
- CPU-Rightsizing-Kandidaten,
- Wartungsfensterempfehlungen,
- Importvergleiche, Policy-Compliance und Cluster Reviews.

Der Analyzer importiert die geprüften Anzeigenamen über ein versioniertes
Spaltenschema. Interne Metric Keys werden, sofern verfügbar, ergänzend
dokumentiert, sind aber kein Implementierungsblocker.

## Aktueller Validierungsstatus

Die aktualisierten pseudonymisierten Exporte wurden erfolgreich geprüft:

- getrennte VM-, Cluster- und Hostdatei,
- exakt 168 lückenlose Stunden je enthaltenem Objekt,
- keine doppelten Objekt-/Zeitpunkt-Kombinationen,
- VM CPU Demand `Avg` und VM CPU Ready `Max`,
- plausible unterschiedliche Cluster- und Hostwerte für `Avg` und `Max`,
- Cluster Memory Utilization vorhanden,
- Cluster CPU Overhead aus dem Pflichtreport entfernt,
- Host-Maintenance-Spalte korrekt benannt.

Die wenigen enthaltenen Objekte reichen für Schema- und Parserentwicklung.
Ein vollständiger Cluster und der Skalierungstest mit ungefähr 5.000 VMs
werden nach der Implementierung nachgeholt.

Broadcom dokumentiert ein bekanntes Problem bei Views mit mehreren
Objektarten und gleichnamigen Metriken. Als Workaround werden getrennte Views
pro Objektart empfohlen:

- [Broadcom KB 385173 – Reports mit mehreren Objektarten](https://knowledge.broadcom.com/external/article/385173)

## Zielstruktur

Es werden drei getrennte Views und drei getrennte Reports angelegt:

| View | Subject | Report | Inhalt |
|---|---|---|---|
| `RVTA_VM_HOURLY` | ausschließlich Virtual Machine | `RVTA_VM_HOURLY_7D` | VM CPU Demand und CPU Ready |
| `RVTA_CLUSTER_HOURLY` | ausschließlich vSphere Cluster Compute Resource | `RVTA_CLUSTER_HOURLY_7D` | Cluster Demand, Memory Utilization und Contention |
| `RVTA_HOST_HOURLY` | ausschließlich vSphere Host System | `RVTA_HOST_HOURLY_7D` | Host Demand, Usage, Memory, Contention, Kapazität und Maintenance |

Die Bezeichnungen können an lokale Namenskonventionen angepasst werden. Pro
View darf jedoch nur die angegebene Objektart als Subject vorkommen.

Ein Report kann technisch mehrere bereits getrennte Views enthalten. Für die
erste Validierung und den späteren Import werden trotzdem drei getrennte
Reportdateien empfohlen. Dadurch bleiben Objektart, Spalten und Fehler
eindeutig.

## Gemeinsame View-Einstellungen

### Presentation

- View-Typ: **List**
- genau ein Subject pro View
- Interval Breakdown aktivieren
- Interval Breakdown: **Per Hour**
- Summary Row: **deaktiviert**
- keine Vermischung von VM-, Cluster- und Host-Subjects

### Time Settings

Für den ersten vollständigen Import:

| Einstellung | Auswahl |
|---|---|
| Date Range | **Absolute Date Range** |
| Zeitraum | sieben vollständig abgeschlossene Tage |
| Start | erster Tag `00:00:00` |
| Ende | siebter Tag `23:59:59` oder Folgetag `00:00` exklusiv |
| Interval Breakdown | **Per Hour** |
| Business Hours | deaktiviert |
| Wochentage | alle sieben Tage |
| Dashboard Time übernehmen | nein |
| aktuelle unvollständige Stunde | ausschließen |
| Zeitzone | Europe/Vienna oder die dokumentierte vROps-Zeitzone |

Erwartet werden normalerweise:

```text
7 Tage × 24 Stunden = 168 Intervalle je Objekt
```

Bei einer Zeitumstellung können in lokaler Zeit 167 oder 169 Intervalle
entstehen. Deshalb muss die Zeitzone dokumentiert und jeder Zeitstempel
eindeutig interpretierbar sein. Intern wird der Analyzer Zeitpunkte später in
UTC normalisieren.

### Transformation und Rollup

Aktuelle Testkonfiguration:

| Einstellung | Auswahl |
|---|---|
| Transformation für normale Last | `avg` und `max` |
| Transformation für Zustände/Kapazität | `last` |
| Rollup Interval | **None**, mit den Beispieldaten bestätigt |
| Interval Breakdown | **Per Hour** |
| Timestamp bei `max` | **No Timestamp** |

Cluster- und Host-Lastmetriken werden jeweils als `avg` und `max`
aufgenommen. Die VM-View enthält nur CPU Demand `avg` und CPU Ready `max`.
Kapazitäten und Zustände verwenden `last`.

Die gewünschte Semantik ist:

```text
Avg einer Stunde = Durchschnitt der gespeicherten Messpunkte dieser Stunde
Max einer Stunde = höchster gespeicherter Messpunkt dieser Stunde
Last einer Stunde = letzter vorhandener Messpunkt dieser Stunde
```

Aria Operations speichert vCenter-Daten normalerweise in einem
Fünf-Minuten-Zyklus. View-Transformationen arbeiten auf diesen gespeicherten
Punkten und nicht auf den ursprünglichen 20-Sekunden-Samples:

- [Broadcom KB 315941 – Aria Operations Data Collection](https://knowledge.broadcom.com/external/article?articleNumber=315941)

### Warum `Rollup Interval = None`?

`Interval Breakdown = Per Hour` erzeugt das gewünschte Stundenraster.
`Rollup Interval = None` lässt `avg` und `max` auf die darunterliegenden
gespeicherten Messpunkte wirken. Die neuen Cluster- und Hostbeispiele zeigen
plausible Unterschiede zwischen beiden Transformationen. Ein vollständiger
Fünf-Minuten-Import ist daher nicht erforderlich.

## View 1: VM-Zeitreihen

### Subject

Nur:

```text
Virtual Machine
```

In dieser View dürfen keine Cluster- oder Hostmetriken vorkommen.

### Pflichtmetriken

| Fachliche Metrik | Transformation | Ziel-Einheit | Pflicht | Zweck |
|---|---|---|---|---|
| VM CPU Demand | `avg` | MHz | ja | zeitgleiche normale Last und P95-Planung |
| VM CPU Ready | `max` | % | ja | kurzzeitige Ready-Probleme |

Beispielnamen aus dem geprüften Export:

```text
VM|CPU|Demand (MHz)|Avg
VM|CPU|Ready (%)|Max
```

Die Spaltennamen bilden den verbindlichen Importvertrag. Interne Metric Keys
können im Metric Dictionary ergänzt werden.

### Metriken für das CPU-Rightsizing

Optional im Sinne des Imports — fehlt eine Spalte, bleibt die Reihe leer und der
Import läuft unverändert durch. Fachlich tragen sie das Rightsizing in beide
Richtungen; ohne sie ist nur eine Verkleinerung beurteilbar.

| Fachliche Metrik | Transformation | Einheit | Zweck |
|---|---|---|---|
| VM CPU Demand | `max` | MHz | echte Spitze innerhalb der Stunde; der Mittelwert glättet kurze Lastspitzen vollständig weg |
| VM CPU Total Capacity | `last` | MHz | exakte VM-Kapazität statt Schätzung aus `hostCpuTotalMHz / hostCpuCores`, die Turbo-Boost und Power-Management ignoriert |
| VM vCPU Usage Disparity | `avg` | % | Abstand zwischen höchster und niedrigster vCPU-Auslastung; trennt „Anwendung skaliert“ von „ein Kern trägt alles“ |
| VM Peak vCPU Ready within collection cycle | `max` | % | schlechteste einzelne vCPU; der reguläre Ready-Wert ist über die vCPU gemittelt und verdeckt Contention bei breiten VMs |
| VM Peak vCPU Co-Stop within collection cycle | `max` | % | Co-Scheduling-Verzögerung; der einzige direkte Nachweis, dass die vCPU-Anzahl selbst schadet |
| Config Number of CPUs | `last` | Anzahl | erkennt vCPU-Änderungen im Messfenster, die sonst ein Mischprofil aus zwei Konfigurationen erzeugen |

Erwartete Spaltennamen (weitere Schreibweisen sind als Alias hinterlegt, siehe
`vropsTimeSeriesSchema.ts`):

```text
VM|CPU|Demand (MHz)|Max
VM|CPU|Total Capacity (MHz)|Last
VM|CPU|vCPU Usage Disparity (%)|Avg
VM|CPU|Peak vCPU Ready within collection cycle (%)|Max
VM|CPU|Peak vCPU Co-Stop within collection cycle (%)|Max
VM|Config|Number of CPUs|Last
```

`CPU|Peak vCPU Usage` wäre die direkteste Kennzahl für „heißester Kern am
Limit“, ist in der eingesetzten Version aber nicht sammelbar. Sie wird ersatzweise
aus Disparity, Auslastung und vCPU-Anzahl rekonstruiert:

```text
Peak vCPU Usage ≈ Auslastung + Disparity × (vCPU − 1) / vCPU
```

### Nicht benötigte VM-Metriken

Nicht importiert werden:

- VM Memory Utilization, Active, Consumed und Guest Needed Memory,
- VM Ballooned und Swapped,
- VM Memory Contention,
- VM Peak vCPU Overlap (misst Hypervisor-Systemdienste, kein Rightsizing-Signal),
- VM Peak Other Wait (I/O-Wartezeit belegt keine CPU-Zeit),
- VM CPU Contention (redundant, solange Ready und Co-Stop einzeln vorliegen),
- Minimum, Summe, Standardabweichung oder Forecast.

Die harte RAM-Planung verwendet den konfigurierten RAM aus RVTools. Das
Laufzeit-RAM-Profil wird zunächst auf Clusterebene importiert.

### Gewünschte VM-Ausgabespalten

Minimal:

```text
Name
Interval Breakdown
VM CPU Demand Avg
VM CPU Ready Max
```

Für das Rightsizing zusätzlich die sechs Spalten aus dem Abschnitt oben.

Optional zusätzlich:

```text
vCenter
stabile vROps-Objekt-ID
```

Normiertes Zielschema im Analyzer:

```text
vcenter_id
object_id
vm_name
interval_start
cpu_demand_avg_mhz
cpu_demand_max_mhz
cpu_ready_max_pct
cpu_peak_vcpu_ready_max_pct
cpu_peak_vcpu_costop_max_pct
cpu_vcpu_usage_disparity_avg_pct
cpu_total_capacity_last_mhz
configured_vcpu_last
```

## View 2: Cluster-Zeitreihen

### Subject

Nur:

```text
vSphere Cluster Compute Resource
```

In dieser View dürfen keine VM- oder Hostmetriken vorkommen.

### Pflicht- und optionale Metriken

| Fachliche Metrik | Transformation | Ziel-Einheit | Pflicht | Zweck |
|---|---|---|---|---|
| Cluster CPU Demand | `avg` | MHz | ja | autoritativer Cross-Check der zeitgleichen VM-Summe |
| Cluster CPU Demand | `max` | MHz | ja | Cluster-Spitzen und Vollständigkeitsprüfung |
| Cluster Memory Utilization | `avg` | bevorzugt MiB | ja | normales RAM-Laufzeitprofil |
| Cluster Memory Utilization | `max` | bevorzugt MiB | ja | RAM-Spitzen |
| Cluster CPU Contention | `avg` | % | ja | anhaltender Scheduling-Druck |
| Cluster CPU Contention | `max` | % | ja | kurzzeitige Scheduling-Probleme |

Beispielnamen aus dem geprüften Export:

```text
Cluster|CPU|Demand|Avg
Cluster|CPU|Demand|Max
Cluster|Memory|Utilization (MB)|Avg
Cluster|Memory|Utilization (MB)|Max
Cluster|CPU|Contention (%)|Avg
Cluster|CPU|Contention (%)|Max
```

Cluster Memory Utilization ist im geprüften Export vorhanden.

### Anforderungen an Cluster Memory Utilization

Bevorzugt wird ein absoluter Wert:

```text
MiB oder GiB
```

Falls nur Prozent verfügbar ist, muss zusätzlich der zugehörige
Kapazitätsnenner bekannt sein. Das ist besonders während Maintenance oder bei
historisch unterschiedlicher Hostverfügbarkeit wichtig.

### Behandlung von Cluster CPU Overhead

Cluster CPU Overhead gehört nicht mehr zum Pflichtreport. Die
Fill-Up-Kapazität basiert auf `Host CPU Capacity Available to VMs`; der
Overhead darf davon nicht nochmals abgezogen und auch nicht auf Cluster CPU
Demand addiert werden. Eine spätere diagnostische Anzeige bleibt möglich.

### Gewünschte Cluster-Ausgabespalten

```text
vCenter
stabile vROps-Objekt-ID
Name
Interval Breakdown
Cluster CPU Demand Avg
Cluster CPU Demand Max
Cluster Memory Utilization Avg
Cluster Memory Utilization Max
Cluster CPU Contention Avg
Cluster CPU Contention Max
```

Normiertes Zielschema im Analyzer:

```text
vcenter_id
object_id
cluster_name
interval_start
cpu_demand_avg_mhz
cpu_demand_max_mhz
memory_utilization_avg_mib
memory_utilization_max_mib
cpu_contention_avg_pct
cpu_contention_max_pct
```

## View 3: ESXi-Host-Zeitreihen

### Subject

Nur:

```text
vSphere Host System
```

In dieser View dürfen keine VM- oder Clustermetriken vorkommen.

### Pflicht- und optionale Metriken

| Fachliche Metrik | Transformation | Ziel-Einheit | Priorität | Zweck |
|---|---|---|---|---|
| Host CPU Demand | `avg` | MHz | empfohlen | Host-Hotspots und DRS-Balance |
| Host CPU Demand | `max` | MHz | empfohlen | kurzfristige Hostspitzen |
| Host CPU Usage | `avg` | MHz | optional | Demand-/Usage-Cross-Check |
| Host CPU Usage | `max` | MHz | optional | Usage-Spitzen |
| Host Memory Utilization | `avg` | MiB | empfohlen | RAM-Verteilung und Hotspots |
| Host Memory Utilization | `max` | MiB | empfohlen | RAM-Spitzen |
| Host CPU Contention | `avg` | % | empfohlen | anhaltender lokaler Scheduling-Druck |
| Host CPU Contention | `max` | % | empfohlen | lokale Contention-Spitzen |
| Host CPU Capacity Available to VMs | `last` | MHz | empfohlen | historisch verfügbare CPU-Kapazität |
| Host Memory Capacity Available to VMs | `last` | MiB | empfohlen | historisch verfügbare RAM-Kapazität |
| Host Maintenance State | `last` | Zustand | ja | historische Maintenance-Erkennung |

Beispielnamen aus dem geprüften Export:

```text
Host|CPU|Demand|Avg
Host|CPU|Demand|Max
Host|CPU|Usage|Avg
Host|CPU|Usage|Max
Host|Memory|Utilization|Avg
Host|Memory|Utilization|Max
Host|CPU|Contention (%)|Avg
Host|CPU|Contention (%)|Max
Host|CPU|Capacity Available to VMs|Last
Host|Memory|Capacity Available to VMs|Last
Host|Runtime|Maintenance State|Last
```

Erwartete Maintenance-Werte müssen anhand der Echtdaten dokumentiert werden,
beispielsweise:

```text
notInMaintenance
inMaintenance
enteringMaintenance
```

Falls weitere Zustände oder leere Werte vorkommen, müssen sie vor einer
automatischen Bewertung fachlich zugeordnet werden.

### Gewünschte Host-Ausgabespalten

```text
vCenter
stabile vROps-Objekt-ID
Name
Interval Breakdown
Host CPU Demand Avg
Host CPU Demand Max
Host CPU Usage Avg
Host CPU Usage Max
Host Memory Utilization Avg
Host Memory Utilization Max
Host CPU Contention Avg
Host CPU Contention Max
Host CPU Capacity Available to VMs Last
Host Memory Capacity Available to VMs Last
Host Maintenance State Last
```

Normiertes Zielschema im Analyzer:

```text
vcenter_id
object_id
host_name
interval_start
cpu_demand_avg_mhz
cpu_demand_max_mhz
cpu_usage_avg_mhz
cpu_usage_max_mhz
memory_utilization_avg_mib
memory_utilization_max_mib
cpu_contention_avg_pct
cpu_contention_max_pct
cpu_capacity_available_last_mhz
memory_capacity_available_last_mib
maintenance_state_last
```

## Beziehungen und Inventardaten

Die Zeitreihen allein reichen für HIGH-/STD-, Site- und Failover-Analysen
nicht aus. Zusätzlich werden folgende Beziehungen benötigt:

### Pro VM

- vCenter,
- stabile VM-ID, sofern verfügbar,
- VM-Name,
- Power State,
- Cluster,
- ESXi-Host,
- Resource-Pool-Pfad oder mindestens das letzte Segment `HIGH`/`STD`,
- konfigurierter vCPU-Wert,
- konfigurierter RAM.

### Pro Host

- vCenter,
- stabile Host-ID, sofern verfügbar,
- Hostname,
- Cluster,
- physische CPU-Cores,
- CPU-Kapazität in MHz,
- physischer RAM,
- Hardwaremodell,
- Verbindungs-, Power- und Maintenance-Zustand.

### Herkunft

Konfiguration und aktuelle Beziehungen werden primär aus RVTools übernommen.
Für eine historisch genaue Zuordnung sind ergänzende vROps-Beziehungen
wünschenswert:

```text
VM → Cluster
VM → Host
VM → Resource Pool
Host → Cluster
```

Die Beziehungen müssen nicht für jede Stunde wiederholt werden. Eine
platzsparende Änderungsdarstellung ist ausreichend:

```text
object_id
relationship_type
target_id
valid_from
valid_to
```

Falls für die ersten sieben Tage nur der aktuelle RVTools-Snapshot verwendet
wird, friert der Import diese Beziehung für den Analyzer-Run ein. Mögliche
VM-Migrationen oder Resource-Pool-Wechsel innerhalb des Zeitfensters können
damit zunächst nicht rekonstruiert werden und senken das Vertrauensniveau der
historischen HIGH-/STD-Auswertung. Das blockiert die erste Implementierung
nicht.

## Metric Dictionary

Zusätzlich zu den drei Messdateien kann eine kleine Metrikdefinitionsdatei
beigelegt werden. Sie verbessert Nachvollziehbarkeit und Versionssicherheit,
ist für den bestätigten Header-basierten Import aber nicht verpflichtend.

Empfohlene Spalten:

```text
object_type
display_name
internal_metric_key
unit
transformation
rollup_interval
interval_breakdown
description
sample_count_available
notes
```

Wenn ein Dictionary geliefert wird, soll es je Metrik dokumentieren:

- interner Metric Key, sofern verfügbar,
- Anzeigename,
- gültige Objektart,
- Basiseinheit,
- Bedeutung von Prozentwerten,
- Transformationsart,
- erwartetes Collection-Intervall,
- Umgang mit fehlenden Samples,
- bei Capacity-Metriken die genaue fachliche Definition.

## Einheiten und Zahlenformat

### Ziel

Einheiten sollen nach Möglichkeit im Export fest und nicht dynamisch skaliert
sein:

| Ressource | Bevorzugte Einheit |
|---|---|
| CPU Demand, Usage und Capacity | MHz |
| Memory Utilization und Capacity | MiB |
| Ready und Contention | % |

### Dynamisch skalierte Einheiten

Der Beispielreport enthielt gemischte Darstellungen:

```text
161.98
161.98 MHz
34.89 GHz
321.49 GB
1.47 TB
```

Wenn vROps keine festen Einheiten erlaubt, muss jede Zelle oder
Spaltendefinition die Einheit zuverlässig enthalten. Der Analyzer wird dann
normalisieren:

```text
GHz → MHz
GB/TB → MiB
```

Für vSphere-Memory-Counter bezeichnet Broadcom `kiloBytes` beziehungsweise
`KB` ausdrücklich als fachlich genauere KiB. Der Analyzer interpretiert diese
Memory-Werte und daraus formatierte MB-/GB-/TB-Angaben deshalb binär und
normalisiert sie auf MiB. Der unformatierte Basiswert bleibt bevorzugt.

### Zahlenformat

Bevorzugt:

- Dezimalpunkt innerhalb der CSV-Werte,
- keine Tausendertrennzeichen,
- `-` als dokumentierter Missing Value,
- keine lokalisierten Einheiten im Zahlenfeld,
- UTF-8 als Dateikodierung.

## Zeitformat

Bevorzugtes Format:

```text
2026-06-28T00:00:00+02:00
```

Das Beispiel:

```text
12:00 AM 28 June 2026
```

ist grundsätzlich parsebar, enthält jedoch keine Zeitzone. Wenn sich das
Format nicht konfigurieren lässt, muss im Report beziehungsweise Metric
Dictionary verbindlich stehen:

```text
timezone = Europe/Vienna
```

`Relative Timestamp` darf nicht verwendet werden. Der Wert würde sich in
Abhängigkeit vom Exportzeitpunkt verändern.

Bei `max` wird `No Timestamp` gewählt. Der Zeitpunkt des konkreten
5-Minuten-Maximums innerhalb einer Stunde ist für die erste Ausbaustufe nicht
erforderlich. Maßgeblich ist der Zeitstempel des Stundenintervalls.

## Nicht verwendete Transformationen

| Transformation | Entscheidung | Begründung |
|---|---|---|
| `min` | nicht verwenden | für die aktuelle Kapazitätsplanung nicht erforderlich |
| `sum` | nicht verwenden | bei MHz und Prozentwerten sample- und intervallabhängig sowie fachlich irreführend |
| `first` | nicht verwenden | kein Nutzen für Performancezeitreihen |
| `current` | nicht verwenden | für aktuelle Anzeigen, nicht für reproduzierbare Historie |
| `standard deviation` | nicht exportieren | kann bei Bedarf aus den Stundenwerten berechnet werden |
| `metric correlation` | nicht exportieren | wird im Analyzer zeitgleich und nachvollziehbar berechnet |
| `forecast` | nicht exportieren | spätere Prognosefunktion, keine Eingangsmessung |
| `percentile` | nicht exportieren | P50/P95 werden aus den importierten Stundenwerten berechnet |
| `expression` | vorerst nicht verwenden | nur falls eine Pflichtmetrik nicht direkt verfügbar ist |
| `timestamp` | nicht als Metriktransformation | Zeit kommt aus dem Interval Breakdown |

Ein bereits von vROps berechnetes Sieben-Tage-P95 würde den Stundenverlauf
entfernen und damit Failover-Replay, Peak Contributors, Korrelation und
Ursachenanalyse verhindern.

## Summary Row

Die Summary Row bleibt in allen drei Views deaktiviert.

Der Analyzer berechnet selbst:

- P50,
- P95,
- Maximum,
- Durchschnitt,
- zeitgleiche VM-Summen,
- HIGH-/STD-Aggregate,
- Erfüllungsquoten und Datenabdeckung.

Eine Summary Row könnte wie ein zusätzliches Objekt eingelesen werden oder
unklar über Objekte beziehungsweise Zeitpunkte aggregieren. `sum` ist bei
Prozentwerten insbesondere unzulässig.

## Report- und Dateiformat

Bevorzugt:

```text
CSV, UTF-8, eine Datei pro Objektart
```

Empfohlene Dateinamen:

```text
vrops_vm_hourly_2026-06-28_2026-07-04.csv
vrops_cluster_hourly_2026-06-28_2026-07-04.csv
vrops_host_hourly_2026-06-28_2026-07-04.csv
vrops_metric_dictionary.csv
vrops_relationships.csv
```

Hostnamen müssen als Klartext und nicht als Hyperlink oder Markdown-Ausdruck
exportiert werden.

Bei ungefähr 5.000 Server-VMs entstehen:

```text
5.000 × 168 = 840.000 VM-Stunden
```

Das passt knapp in ein Excel-Arbeitsblatt, bleibt als CSV aber einfacher zu
erzeugen, zu streamen und im Web Worker zu importieren. Cluster- und
Hostdateien sind wesentlich kleiner.

Die ungefähr 14.000 VDI-VMs werden zunächst nicht in denselben Export
aufgenommen. Dafür wird später ein eigener Import-Scope vorgesehen.

## Validierungsstatus und nachgelagerte Abnahme

Bestanden:

- [x] Jede View enthält genau eine Objektart.
- [x] Jedes enthaltene Objekt besitzt 168 lückenlose Stundenzeilen.
- [x] Zeitstempel sind vorhanden und mit `Europe/Vienna` interpretierbar.
- [x] Cluster- und Host-`avg`/`max` unterscheiden sich plausibel.
- [x] Cluster-, Host- und VM-Werte erscheinen nur in der passenden Datei.
- [x] Cluster Memory Utilization ist vorhanden.
- [x] Missing Values werden als `-` dargestellt.
- [x] Host-Maintenance-Spalte ist korrekt benannt.
- [x] Cluster CPU Overhead ist kein Pflichtimport mehr.

Nachgelagert:

- [ ] vollständige VM-Summe gegen Cluster CPU Demand prüfen,
- [ ] Beziehungen eines vollständigen Clusters prüfen,
- [ ] echten Maintenance-Wechsel prüfen,
- [ ] vollständigen Cluster manuell gegenrechnen,
- [ ] Import mit ungefähr 5.000 Server-VMs messen.

Diese Punkte sind Abnahmekriterien, aber kein Start-Gate für die
Implementierung.

## Gesamtexport und Länge des Messfensters

Der Analyzer ist nicht auf sieben Tage festgelegt; Zeitraum und Rasterlänge
kommen aus dem Import. Für das CPU-Rightsizing sind längere Fenster deutlich
belastbarer, weil sich die Muster `bursty` und `irregular` in einer einzelnen
Woche nicht verlässlich von einmaligen Ausschlägen unterscheiden lassen.

Empfohlen sind **28 Tage ab einem Montag**, nicht 30 oder 31:

- Bei 28 Tagen kommt jeder Wochentag exakt viermal vor. Bei 31 Tagen erscheinen
  drei Wochentage fünfmal und vier nur viermal. Fallen dabei Samstag und Sonntag
  auf die fünffache Seite, steigt die Wochenendkonzentration rein rechnerisch um
  rund 11 % — genug, um bei einem Schwellwert von 1,35 die Klasse zu kippen.
- Vier vollständige, gleich lange Wochen erlauben zusätzlich einen Vergleich der
  Wochen untereinander. Genau das trennt planbare monatliche Lastspitzen von
  unvorhersehbaren Ausschlägen.

Längere Fenster funktionieren, erfordern aber eine Gewichtung der Wochentage in
der Auswertung. Ein Fenster über die Zeitumstellung ist zu vermeiden.

Für den Gesamtexport:

1. absoluten Zeitraum mit vollständigen Tagen festlegen, bevorzugt 28 ab Montag,
2. denselben Start, dasselbe Ende und dieselbe Zeitzone in allen Reports
   verwenden,
3. VM-Report für die ungefähr 5.000 Server-VMs ausführen,
4. Cluster-Report für die zugehörigen Servercluster ausführen,
5. Host-Report für die zugehörigen ESXi-Hosts ausführen,
6. Metric Dictionary und Beziehungen beilegen,
7. Dateien pseudonymisieren, ohne Beziehungen, Site-Namensschema oder stabile
   IDs inkonsistent zu verändern,
8. Dateigrößen, Zeilenzahlen und Laufzeit dokumentieren.

## Pseudonymisierung

Die Pseudonymisierung muss innerhalb und zwischen allen Dateien stabil sein:

```text
dieselbe VM       → immer dasselbe Pseudonym
derselbe Host     → immer dasselbe Pseudonym
derselbe Cluster  → immer dasselbe Pseudonym
dieselbe ID       → immer dieselbe pseudonymisierte ID
```

Für Hosts muss die Site-Zuordnung weiterhin ableitbar bleiben, beispielsweise
durch ein neutrales Schema:

```text
site1-host-001
site2-host-001
```

Personen-, Domain-, vCenter-, Cluster- und VM-Namen dürfen pseudonymisiert
werden. Kapazitäten, Zeitverläufe, Resource-Pool-Zuordnungen und Beziehungen
müssen fachlich unverändert bleiben.

## Datenqualitätsprüfungen im Analyzer

Der spätere Import prüft mindestens:

- erwartete gegen vorhandene Stunden,
- doppelte Objekt-/Zeitpunkt-Kombinationen,
- fehlende Werte und Sample-Abdeckung,
- negative oder nicht endliche Zahlen,
- unbekannte Einheiten,
- unrealistische Einheitensprünge,
- VM CPU Demand gegen Cluster CPU Demand,
- fehlende VM-/Cluster-/Host-/Resource-Pool-Beziehungen,
- unbekannte HIGH-/STD-Zuordnungen,
- Hostnamen ohne Site-Zuordnung,
- Maintenance- und Ausfallstunden,
- VM-Namenskollisionen zwischen vCentern,
- zeitlichen Abstand zwischen RVTools- und vROps-Datenstand.

Fehlende oder unklare Pflichtdaten dürfen nicht zu einem grünen
Kapazitätsergebnis führen.

## Quellen

- [Broadcom KB 315941 – Aria Operations Data Collection](https://knowledge.broadcom.com/external/article?articleNumber=315941)
- [Broadcom KB 385173 – Reports mit mehreren Objektarten](https://knowledge.broadcom.com/external/article/385173)
- [Broadcom vRealize Operations API – Stat Query](https://developer.broadcom.com/xapis/vmware-vrealize-operations-api/latest/data-structures/stat-query/)
- [Fill-Up-Konzept](docs/superpowers/specs/2026-07-28-fill-up-cluster-capacity-planning-design.md)
