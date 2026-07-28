# TODO

- [ ] **Nächste Umsetzung: Fill-Up- und Cluster-Kapazitätsplanung.** Der
  vROps-Zeitreihenimport, die gemeinsame Policy-/Finding-Engine und Fill Up
  werden als nächstes größeres Arbeitspaket umgesetzt. Die kleinen
  pseudonymisierten Sieben-Tage-Beispiele sind für Schema und Import
  freigegeben. Ein vollständiger realer Testcluster und der Skalierungstest
  mit ungefähr 5.000 Server-VMs folgen nachgelagert und blockieren die
  Entwicklung nicht. Grundlage:
  [Spezifikation](docs/superpowers/specs/2026-07-28-fill-up-cluster-capacity-planning-design.md)
  und
  [Implementierungsplan](docs/superpowers/plans/2026-07-28-fill-up-cluster-capacity-planning.md).
- [ ] **Sheet-Builder Feature**: Eine selbst konfigurierbare Tabelle der gefilterten/ungefilterten Objekte als Excel oder Markdown exportieren können. Die Spalten sollen dabei aus den verfügbaren Daten gewählt werden können, ähnlich wie beim globalen Systemfilter. Vor dem Export soll optional eine Anonymisierung/Pseudonymisierung konfigurierbar sein, etwa für vCenter-, Cluster- und Systemnamen sowie Namen von Systemverantwortlichen.
- [ ] **Zentrale Export-Seite**: Eine eigene Seite in der Sidebar schaffen, auf der alle Funktionen rund um den Export von Tabellen gebündelt werden. Die möglichen Funktionen und der genaue Umfang werden später gemeinsam gebrainstormt.
- [ ] **KI-Prompt-Builder**: Einen Baukasten für Analyse-Prompts bauen. Prompts sollen aus wiederverwendbaren Bausteinen erstellt, lokal gespeichert, bearbeitet und gelöscht werden können. Für eine Analyse wählt der Nutzer gezielt Daten und Kennzahlen aus der Webapp als Kontext aus; daraus entsteht ein vollständiger Prompt, der zum manuellen Einfügen in ChatGPT kopiert oder dort geöffnet werden kann. Vor der Übergabe soll optional eine Anonymisierung/Pseudonymisierung konfigurierbar sein, etwa für vCenter-, Cluster- und Systemnamen sowie Namen von Systemverantwortlichen. Der ausgewählte Datenumfang muss vor der Übergabe transparent sein; keine automatische Datenübertragung und keine Backend-Abhängigkeit.

## Funktionslandkarte, Kombinationen und Priorisierung

Dieser Abschnitt ordnet alle derzeit in dieser Datei beschriebenen Ideen einer
gemeinsamen Produktstruktur zu. Die ausführlichen fachlichen Anforderungen in
den nachfolgenden Abschnitten bleiben bestehen.

### Bewertungsmaßstab

Der Aufwand ist relativ zur bestehenden Frontend-only-Architektur zu
verstehen und enthält Datenmodell, IndexedDB, Berechnungslogik, Oberfläche und
Tests:

- **S:** überwiegend bestehende Daten und Komponenten, wenig neue Fachlogik.
- **M:** neue Oberfläche oder überschaubare Analyse- beziehungsweise Persistenzlogik.
- **L:** neues größeres Datenmodell, historische Berechnung oder anspruchsvolle Simulation.
- **XL:** mehrere Engines, komplexe Optimierung oder ein umfangreicher persistenter Workflow.

Der Nutzen bewertet den erwarteten praktischen Mehrwert für VMware-Betrieb,
Kapazitätsplanung, Risikoreduktion und wiederkehrende Cluster Reviews:
**mittel**, **hoch** oder **sehr hoch**.

### Empfohlene Funktionspakete

**Aktiver nächster Umsetzungsschritt:** Der erste vertikale Schnitt des
Funktionspakets **Cluster Digital Twin** ist Fill Up inklusive
vROps-Zeitreihenimport, Datenqualität, Policies, Normalbetrieb und N-1.
N-2, Site-Failover, HIGH/STD, Workloadprofile und gespeicherte Runs folgen in
demselben Implementierungspaket. Ein vollständiger Echtdatencluster wird
nachgereicht und dient der fachlichen Abnahme, nicht mehr als Start-Gate.

1. **Export Studio:** Zentrale Export-Seite, Sheet Builder und
   KI-Prompt-Builder verwenden eine gemeinsame Auswahl-, Spalten-,
   Pseudonymisierungs- und Exportpipeline.
2. **Netzwerk-Datenkontrolle:** VM- und ESXi-Abgleich bleiben zwei Sichten
   derselben Netzwerk-Kontrollseite und teilen Matching, Findings und Filter.
3. **Cluster Review & Maßnahmen:** Review-Wizard und automatische Evidenz
   verwenden Findings, Bewertungen, Ausnahmen und Maßnahmen aus den anderen
   Analysen, berechnen diese aber nicht erneut.
4. **Cluster Digital Twin:** What-if, Fill Up, Placement, Hardwareänderungen,
   Evakuierung, Konsolidierung und Maßnahmen-Simulation verwenden dieselbe
   Szenario- und Policy-Engine. Reservierungen ergänzen das Modell um eine
   zeitliche Dimension.
5. **Historie & Ursachenanalyse:** Failover-Replay, Peak Contributors,
   Importvergleich und „Warum wurde es rot?“ verwenden dieselbe historische
   Zeitachse und denselben Drilldown.
6. **Workload Intelligence:** VM-Profile, Verhaltensklassen, Korrelation und
   Rightsizing werden gemeinsam berechnet und sowohl in der VM-Analyse als
   auch in Placement und Fill Up verwendet.
7. **Cluster Resilienz & Governance:** Policy-Compliance, vorhandener Risk
   Score und Resilience Score basieren auf einer gemeinsamen Finding- und
   Bewertungsengine. Der Maßnahmen-Simulator konsumiert deren Ergebnisse.
8. **Wartungsintelligenz:** Die Erkennung geeigneter Wartungszeiten erweitert
   die bestehende Wartungsfenster-Seite und nutzt historische Last- und
   Failover-Berechnungen.
9. **Tech-Info Organisationsanalyse:** Die vorhandene Zuordnung von
   Server-VMs zu Organisation, Bereich, Abteilung und Systemverantwortlichen
   wird als gemeinsame hierarchische Auswertung und nicht als mehrere
   unabhängige Diagramme umgesetzt.

### Ideenmatrix

| Idee | Kombination und Abgrenzung | Bereich / Seite / Tab | Aufwand | Nutzen |
|---|---|---|---:|---:|
| Zentrale Export-Seite | Gemeinsamer Rahmen für Sheet Builder, Berichte, Review-Exporte und KI-Prompts; keine eigene Exportlogik je Fachseite. | Neuer Sidebar-Bereich **Export & Berichte**, Starttab **Übersicht** | M | hoch |
| Sheet Builder | Verwendet globale Objektselektion, einheitliche Spaltenmetadaten und dieselbe Pseudonymisierung wie Prompt- und Berichtsexport. | **Export & Berichte** → **Datenexport** | M | hoch |
| KI-Prompt-Builder | Mit dem Export Studio kombinieren, aber wegen Promptvorlagen und Kontextvorschau als eigener Workflow führen. | **Export & Berichte** → **KI-Prompt** | M | hoch |
| VM-IPAM-Kontrolle | Mit der bestehenden ESXi-Kontrolle über gemeinsame Namens-, IPAM-, Tech-Info- und Finding-Logik kombinieren. | Bestehende **Netzwerk-Kontrolle** → **VM-Daten** | L | hoch |
| ESXi-Kontrolle | Bestehende Funktion im gemeinsamen Kontrollbereich behalten; Matching-Komponenten auch für VM-Kontrolle wiederverwenden. | Bestehende **Netzwerk-Kontrolle** → **Host-Daten** | S | hoch |
| Tech-Info Organisationsanalyse | Bereich, Abteilung und Person als eine drillbare Hierarchie auswerten; bestehende VM-/Tech-Info-Zuordnung und globale Filter wiederverwenden. | Bestehende **Tech-Info** → neuer Tab **Organisation** | M | hoch |
| Cluster-Review-Wizard | Eigener persistenter Workflow; bindet Analysen nur als Evidenz ein und bleibt von deren Berechnungslogik getrennt. | Neuer Sidebar-Bereich **Cluster Review** → **Reviews** und **Review-Wizard** | XL | sehr hoch |
| Fill-Up- und Cluster-Kapazitätsplanung | Aktiver erster Kern des Cluster Digital Twin; schafft vROps-Zeitreihen, Policies, Finding- und Szenariologik als Basis für mehrere spätere Ideen. | Bestehende **Planung** → **Fill Up** | XL | sehr hoch |
| Neuer-Workload-/Placement-Assistent | Szenariotyp des Cluster Digital Twin; teilt Ranking, Policy-Prüfung und Ergebnisvergleich mit Evakuierung und Optimierung. | Bestehende **Planung** → **What-if** → Modus **Workload platzieren** | L | sehr hoch |
| Host hinzufügen, ersetzen oder entfernen | Kein separates Werkzeug, sondern Hardware-Szenariotyp der vorhandenen What-if-Planung. | **Planung** → **What-if** → Modus **Hardware ändern** | L | sehr hoch |
| Geplante Kapazitätsreservierungen | Nutzt dieselben Workloadprofile und Policies, benötigt wegen Zeitraum, Status und Konflikten aber einen eigenen Tab. | **Planung** → neuer Tab **Reservierungen** | L | hoch |
| Cluster-Evakuierungsplaner | Mit Placement und Konsolidierung über dieselbe Platzierungsengine kombinieren; Evakuierung ist ein Szenariomodus mit leerem Quellcluster. | **Planung** → **What-if** → Modus **Evakuierung** | XL | sehr hoch |
| Cluster-Zusammenlegung und -Aufteilung | Mit Evakuierungs- und Placement-Engine kombinieren; eigener Szenariomodus für mehrere Quell- und Zieltopologien. | **Planung** → **What-if** → Modus **Topologie** | XL | hoch |
| Historischer Failover-Replay | Grundlage der historischen Resilienzanalyse; Zeitachse und Ausfallsimulation mit Ursachenanalyse teilen. | **Cluster** → neuer Tab **Historie** → **Failover-Replay** | L | sehr hoch |
| Peak-Contributor-Analyse | Kein eigenes Hauptmodul; gemeinsamer Drilldown aus Peakstunden, roten Ereignissen und VM-Performance. | **Cluster** → **Historie** → Detailansicht **Peak Contributors** | M | hoch |
| VM-Auslastungsprofile und Verhaltensklassen | Gemeinsame Basis für Korrelation, Rightsizing, Placement und Wartungsfenster; einmal zentral berechnen. | Bestehende **VMs** → **Performance** → Bereich **Profile** | L | hoch |
| CPU-Rightsizing-Kandidaten | Auf den VM-Profilen aufbauen und als prüfpflichtige Empfehlung darstellen; keine zweite Profillogik. | **VMs** → **Performance** → Bereich **Rightsizing** | M | hoch |
| Optimale Wartungszeit erkennen | Historische Last- und Failover-Engine wiederverwenden; bestehende Vorgaben und analysierte Empfehlungen nebeneinanderstellen. | Bestehende **Wartungsfenster** → neuer Tab **Empfehlungen** | M–L | hoch |
| Import-zu-Import-Vergleich | Gemeinsame Cluster-Zeitachse nutzen; kompakte Langzeitaggregate statt einer separaten Snapshot-Historie je Analyse. | **Cluster** → **Historie** → **Veränderungen** | M | hoch |
| Policy-Compliance | Zentrale Finding-Engine für Fill Up, Resilienz, Reviews und Maßnahmen; keine eigenen Grenzwerte in den einzelnen Oberflächen. | **Cluster** → neuer Tab **Resilienz** → **Compliance** | L | sehr hoch |
| Automatische Cluster-Review-Evidenz | Kein eigenes Analysemodul; übernimmt versionierte Findings und positive Entwicklungen in einen Review-Entwurf. | **Cluster Review** → **Review-Wizard** → Schritt **Evidenz** | M nach Fertigstellung der Finding-Engine | sehr hoch |
| Workload-Korrelationsanalyse | Mit VM-Profilen kombinieren; Ergebnisse zusätzlich in Placement und Fill Up einspeisen. | **VMs** → **Performance** → Bereich **Korrelation**; Drilldown auch in **Planung** | L | hoch |
| Resilience Score mit Maßnahmenplan | Ausbau des vorhandenen Risk Scores und gemeinsame Darstellung der Policy-Findings; kein zweiter konkurrierender Score. | **Cluster** → **Resilienz** → **Score & Maßnahmen** | M–L | sehr hoch |
| Automatischer Maßnahmen-Simulator | Verbindet Findings mit den vorhandenen What-if-Szenariotypen; keine eigene Simulationsengine und keine automatische vCenter-Änderung. | **Planung** → neuer Tab **Optimierung** | XL | sehr hoch |
| „Warum wurde es rot?“-Zeitreise | Kombiniert Failover-Replay, Peak Contributors, Hostzustände und Policy-Versionen in einem historischen Ereignis-Drilldown. | **Cluster** → **Historie** → **Ereignisse** | L | sehr hoch |

### Vorgeschlagene Navigation

- **Cluster:** `Übersicht`, `Kapazität`, neu `Historie`, neu `Resilienz`.
- **Planung:** `What-if`, `Fill Up`, neu `Reservierungen`, neu `Optimierung`.
  Die unterschiedlichen Planungsfälle werden als Szenariomodi innerhalb von
  `What-if` angeboten und nicht als zusätzliche Haupttabs.
- **VMs:** Der bestehende Tab `Performance` erhält die Bereiche `Profile`,
  `Korrelation` und `Rightsizing`.
- **Wartungsfenster:** `Vorgaben` und neu `Empfehlungen`.
- **Netzwerk-Kontrolle:** Die bestehende Host-Datenkontrolle wird um die
  gleichrangige Sicht `VM-Daten` ergänzt.
- **Tech-Info:** Der bestehende Inhalt wird als Tab `Systeme` geführt und um
  den neuen Tab `Organisation` ergänzt.
- Neu in der Sidebar: **Cluster Review** sowie **Export & Berichte**.

### Gemeinsame technische Bausteine

Damit kombinierte Funktionen nicht dieselben Kennzahlen unterschiedlich
berechnen, sollten folgende Bausteine jeweils nur einmal implementiert werden:

- **Policy- und Finding-Engine:** Status, Grenzwert, Ursache, betroffene
  Objekte, Datenqualität und Policy-Version.
- **Historische Analyse-Engine:** stündliche Zeitachse, Perzentile,
  Peak-Erkennung, Failover-Replay und Importvergleich.
- **Workload-Intelligence-Engine:** Profile, Klassen, Korrelation,
  Rightsizing-Signale und Vertrauensniveau.
- **Szenario-Engine:** VM-, Host-, Site- und Topologieänderungen,
  Reservierungen sowie Vorher-/Nachher-Vergleich.
- **Maßnahmen- und Ausnahme-Modell:** Empfehlung, Entscheidung,
  Verantwortlicher, Termin, Status, akzeptiertes Risiko und Wirksamkeitskontrolle.
- **Export- und Pseudonymisierungs-Pipeline:** Tabellen, Markdown,
  Review-Berichte und KI-Kontext.

Der Cluster Review, der Resilience Score und der Maßnahmen-Simulator sind
damit vor allem unterschiedliche Sichten und Workflows auf denselben Findings
und Szenarien. Sie dürfen keine voneinander abweichenden Parallelberechnungen
entwickeln.

## Tech-Info Organisationsanalyse

### Idee und Ziel

- [ ] Die vorhandene Zuordnung von Server-VMs zu Systemverantwortlichen und deren Organisationseinheit auf der Seite **Tech-Info** aggregiert darstellen.
- [ ] Die Organisationshierarchie von oben nach unten auswerten: Organisation beziehungsweise Unternehmen → Bereich → Abteilung → Systemverantwortlicher → Server-VM.
- [ ] Organisationskennungen wie `RAITEC/IN-VIA` nachvollziehbar in Organisation `RAITEC`, Bereich `IN` und Abteilung `VIA` zerlegen.
- [ ] Neben Kürzeln optional gepflegte Anzeigenamen verwenden, beispielsweise Bereich `IN` als `Infrastruktur` und Abteilung `VIA` als `Virtualisierung`.
- [ ] Die bestehende Tech-Info-Tabelle als Tab **Systeme** erhalten und die neue Darstellung im Tab **Organisation** ergänzen.

### Darstellung und Navigation

- [ ] KPI-Karten für zugeordnete Server-VMs, Bereiche, Abteilungen, Systemverantwortliche und fehlende beziehungsweise ungültige Zuordnungen anzeigen.
- [ ] Eine hierarchische Tabelle bereitstellen, in der Bereich, Abteilung und Person auf- und zugeklappt werden können.
- [ ] VM-Anzahl je Bereich, Abteilung und Person als sortierbares Balkendiagramm oder Treemap darstellen.
- [ ] Beim Klick auf einen Bereich, eine Abteilung oder eine Person direkt die zugehörigen VMs anzeigen beziehungsweise die bestehende VM-Tabelle entsprechend filtern.
- [ ] Neben der VM-Anzahl auch eingeschaltete und ausgeschaltete VMs, konfigurierte vCPU, konfigurierten RAM und später optional vROps-Auslastung aggregieren.
- [ ] Globale Filter, vCenter-Auswahl und Suchfunktion auf die Organisationsauswertung anwenden.
- [ ] Ergebnisse über den gemeinsamen Sheet Builder beziehungsweise als Markdown exportieren und dabei die vorhandene Pseudonymisierung für Personen- und Systemnamen verwenden.

### Verantwortlichkeiten und Datenqualität

- [ ] Primären Systemverantwortlichen und Stellvertretung getrennt ausweisen, damit VMs bei kombinierten Auswertungen nicht unbemerkt doppelt gezählt werden.
- [ ] Eine umschaltbare Auswertung für `primär`, `Stellvertretung` oder `beide Rollen` anbieten.
- [ ] Fehlende Verantwortliche, unbekannte Organisationskürzel, nicht interpretierbare Pfade und widersprüchliche Abteilungszuordnungen als eigene Datenqualitätsgruppe anzeigen.
- [ ] Die Rohangabe aus Tech-Info unverändert aufbewahren; abgeleitete Bereiche und Abteilungen dürfen die Quelldaten nicht überschreiben.
- [ ] Eine lokal konfigurierbare Kürzel- und Anzeigenamen-Zuordnung vorsehen, damit organisatorische Änderungen ohne Codeänderung gepflegt werden können.

### Aufwand und Nutzen

- **Vorgesehener Bereich:** bestehende Seite **Tech-Info**.
- **Vorgesehene Tabs:** **Systeme** für die heutige Ansicht und neu **Organisation** für Hierarchie, Diagramme und Drilldown.
- **Aufwand:** **M**, da die VM-/Tech-Info-Zuordnung bereits vorhanden ist, aber Parser, konfigurierbares Organisationsmapping, Aggregate und Visualisierungen ergänzt werden müssen.
- **Nutzen:** **hoch**, weil Verantwortungsumfang, organisatorische Konzentrationen, Datenlücken und Ansprechpartner für Betrieb, Planung und Cluster Reviews unmittelbar sichtbar werden.

## VM-IPAM-Kontrolle

### Ausgangslage

Im Netzwerk-Tab **Kontrolle** besteht bereits ein ESXi-Host-Datenabgleich:

- RVTools-Hosts werden per Hostname mit Tech-Info und IPAM abgeglichen.
- IPAM-Treffer zeigen IP-Adressen sowie daraus abgeleitete Netze.

Ein entsprechender Abgleich für virtuelle Maschinen existiert noch nicht.

### Datenquellen

- **RVTools:** Tabellenblatt `vNetwork`, Spalte `IPv4 Address`.
  - Eine VM kann mehrere Netzwerkadapter besitzen.
  - Pro Adapter können keine, eine oder mehrere IPv4-Adressen vorkommen.
  - Mehrere Adressen werden kommagetrennt geliefert, beispielsweise `10.1.1.1, 10.2.2.2`.
- **IPAM:** Importierte `ipam.csv`, insbesondere die Spalten `IP Address` und `Name`.
- **Tech-Info:** Soll zusätzlich zum RVTools- und IPAM-Abgleich berücksichtigt werden.

### Gewünschte Erweiterung

Den bisherigen Bereich „Host-Datenabgleich“ im Netzwerk-Tab **Kontrolle** in zwei getrennte Tabs aufteilen:

1. **VM Kontrolle**
   - Aggregiert alle Adapter und IPv4-Adressen je VM aus `vNetwork`.
   - Gleichen jede extrahierte IPv4-Adresse mit IPAM ab.
   - Zeigt auch VMs ohne IP-Adresse, ohne IPAM-Treffer oder mit mehreren Adressen/Adaptern nachvollziehbar an.
   - Gleicht die VM zusätzlich mit Tech-Info ab.
   - Enthält zusätzlich eine Tech-Info-Startansicht, analog zur heutigen Tabelle „Objekte aus Tech-Info“, aber mit VM-Bezug:
     - Spalte `VM (RVTools)` statt `ESXi-Host (RVTools)`.
     - Cluster der gefundenen VM aus RVTools anzeigen.
     - RVTools-IP-Adressen und IPAM-Treffer der primären IP darstellen.
   - Beim Namensabgleich aus Tech-Info nicht nur exakt suchen, sondern auch VM-Namen mit dem dokumentierten Namen als Präfix zulassen (`servername*`). Damit werden beispielsweise `servername_wirdabgebaut` und `servername_wird_aufgehoben` gefunden.
   - Mehrere passende VMs nicht stillschweigend auf einen Treffer reduzieren, sondern als Mehrdeutigkeit ausweisen.

2. **ESXi Kontrolle**
   - Übernimmt den bestehenden RVTools-Host-, Tech-Info- und IPAM-Abgleich unverändert in einen eigenen Tab.

### Noch zu entscheiden

- Welche Detailinformationen die VM-Tabelle pro Adapter ausweist (Adaptername, Portgruppe, MAC-Adresse usw.).
- Welche Abweichungen als „Auffälligkeit“ gelten sollen, etwa fehlende RVTools-IP, fehlender IPAM-Eintrag oder fehlender Tech-Info-Eintrag.
- Ob mehrere gleichlautende IPAM-Einträge oder mehrfach verwendete IP-Adressen explizit hervorgehoben werden sollen.
- Wie die „primäre IP“ einer VM verbindlich bestimmt wird, insbesondere wenn RVTools mehrere Adapter oder mehrere IPv4-Adressen pro Adapter liefert.

## Cluster-Review-Wizard

### Idee und Ziel

- [ ] Einen eigenen Menüpunkt **Cluster Review** ergänzen, der die ein- bis zweimal jährlich gemeinsam mit den jeweiligen Cluster-Ansprechpartnern durchgeführten Reviews unterstützt.
- [ ] Bestehende Daten und Analysen je Cluster zu einem geführten, wiederholbaren Review-Bericht zusammenführen.
- [ ] Im Review die aktuelle Konfiguration, Auslastung, Ausfallfähigkeit, Hardware, VM-Landschaft und Wartungsvorgaben auf Aktualität, Risiken und Verbesserungsmöglichkeiten prüfen.
- [ ] Reviews langfristig vergleichbar machen, damit sich die technische und organisatorische Entwicklung eines Clusters über mehrere Jahre messen lässt.

### Geführter Ablauf

Der Review soll als Wizard gemeinsam mit den Cluster-Ansprechpartnern
durchgearbeitet werden. Ein möglicher Ablauf:

1. **Review anlegen**
   - Cluster und Datenstand auswählen.
   - Review-Datum, Teilnehmer, Ansprechpartner und Moderator erfassen.
   - Optional einen früheren Review als Vergleichsbasis auswählen.
   - Status `Entwurf`, `in Bearbeitung` oder `abgeschlossen` führen.

2. **Stammdaten und Verantwortlichkeiten**
   - vCenter, Datacenter, Sites, Clusterprofil und Zweck des Clusters zeigen.
   - Ansprechpartner, Betriebsverantwortung und Wartungskontakte prüfen.
   - Aktuelle Wartungsfenster, Sonderregelungen und Freigabevorgaben bestätigen oder als Änderungsbedarf markieren.

3. **Konfiguration und Verfügbarkeit**
   - HA-/DRS-Konfiguration und auffällige Cluster- oder VM-Regeln zeigen.
   - Host- und Site-Verteilung prüfen.
   - N-1-, optional N-2- und Site-Ausfallkapazität präsentieren.
   - HIGH-/STD-Resource-Pool-Konfiguration, Shares und Zuordnungsqualität prüfen.
   - Große oder nach einem Ausfall schwer platzierbare VMs hervorheben.

4. **Kapazität und Auslastung**
   - CPU-, RAM-, vCPU/Core- und Fill-Up-Kennzahlen anzeigen.
   - Historische vROps-Auslastungsprofile einbeziehen, sobald verfügbar.
   - CPU Ready, CPU Contention, Memory Utilization und limitierende Metriken erläutern.
   - Aktuelle Kapazitätsrisiken und erwarteten Erweiterungsbedarf dokumentieren.

5. **Hardware und Lifecycle**
   - Hostanzahl, Modelle, CPU-Generationen, RAM-Ausbau und Hardwarevarianten zeigen.
   - Abweichungen innerhalb des Clusters, Firmware-/BIOS-Stand und ESXi-Versionen prüfen.
   - Support-, Release- und geplante Erneuerungsthemen festhalten.
   - Wartungs- und Patchfähigkeit des Clusters bewerten.

6. **VM-Landschaft**
   - Anzahl eingeschalteter und ausgeschalteter VMs sowie HIGH-/STD-Verteilung zeigen.
   - Große VMs, CPU-Ready-Hotspots, Memory Pressure, Snapshots, Tools-/Hardware-Versionen und Konfigurationsprobleme zusammenfassen.
   - Abbaukandidaten, unklare Zuordnungen und auffällige Sonderkonfigurationen prüfen.

7. **Health Events und weitere Analysen**
   - Aktuelle beziehungsweise relevante historische Health Events aggregieren.
   - Je nach Datenlage Storage-, Netzwerk-, Backup-, Compliance- und Maintenance-Auffälligkeiten des Clusters einbeziehen.
   - Analysen nicht nur als Ampel zeigen, sondern mit Datenquelle, Grenzwert und konkreter betroffener Objektliste nachvollziehbar machen.

8. **Maßnahmen und Entscheidungen**
   - Feststellungen, Entscheidungen und empfohlene Maßnahmen erfassen.
   - Maßnahme mit Priorität, Verantwortlichem, Zieltermin und Status versehen.
   - Abweichungen bewusst akzeptieren und mit Begründung dokumentieren können.
   - Offene Punkte aus dem vorherigen Review übernehmen und ihren Fortschritt bewerten.

9. **Bewertung und Abschluss**
   - Mehrere Review-Bereiche jeweils von 1 bis 10 bewerten.
   - Gesamtbewertung, Zusammenfassung, wichtigste Risiken und positive Entwicklungen festhalten.
   - Review abschließen, unveränderlich speichern und exportieren.

### Bewertungsmodell

Bewertungen von 1 bis 10 sollen mindestens für folgende Bereiche möglich
sein:

- Konfiguration und Standardkonformität
- Verfügbarkeit und Ausfallfähigkeit
- CPU-Kapazität und Performance
- RAM-Kapazität
- Hardware-Homogenität und Lifecycle
- VM-Hygiene und technische Schulden
- Wartungs- und Patchfähigkeit
- Monitoring und Health
- Dokumentation und Verantwortlichkeiten
- Gesamtzustand des Clusters

Für jede Bewertung sollen gespeichert werden:

- manuell vergebene Punktzahl,
- optional automatisch vorgeschlagene Punktzahl aus vorhandenen Analysen,
- Begründung und Kommentar,
- verwendete Daten und relevante Befunde,
- Abweichung zum vorherigen Review.

Automatische Vorschläge dürfen die gemeinsame fachliche Bewertung nicht
ersetzen. Der Reviewer kann sie anpassen, muss bei größeren Abweichungen aber
optional eine Begründung hinterlegen können.

### Historie und Vergleich

- [ ] Alle abgeschlossenen Reviews je Cluster chronologisch anzeigen.
- [ ] Bewertungen und zentrale Kennzahlen über mehrere Jahre als Verlauf darstellen.
- [ ] Unterschiede zum vorherigen Review hervorheben: verbessert, unverändert oder verschlechtert.
- [ ] Erledigte, offene und überfällige Maßnahmen vergleichen.
- [ ] Alte Reviews unverändert lassen, auch wenn Grenzwerte, Daten oder Bewertungslogik später geändert werden.
- [ ] Die damaligen Datenstände, Regeln und automatischen Bewertungsvorschläge als Snapshot im Review speichern.

### Speicherung und Export

- [ ] Reviews lokal in IndexedDB speichern und in Backup/Restore aufnehmen.
- [ ] Entwürfe fortsetzen, duplizieren und kontrolliert löschen können.
- [ ] Abgeschlossene Reviews vor nachträglichen unbeabsichtigten Änderungen schützen; Korrekturen als neue Revision dokumentieren.
- [ ] Einen vollständigen Markdown-Export bereitstellen, beispielsweise mit:
  - Metadaten und Teilnehmern,
  - Executive Summary,
  - Bewertungen und Vorjahresvergleich,
  - analysierten Kennzahlen und Auffälligkeiten,
  - Entscheidungen und akzeptierten Risiken,
  - Maßnahmenliste mit Verantwortlichen und Terminen,
  - Datenständen und verwendeten Bewertungsregeln.
- [ ] Später optional weitere Exportformate wie PDF oder DOCX prüfen.

### Noch zu entscheiden

- Welche Analysen verpflichtende Wizard-Schritte und welche optionale Vertiefungen sind.
- Ob ein Review mehrere Cluster gemeinsam abdecken darf oder immer genau einem Cluster zugeordnet ist.
- Welche Bewertungskategorien verpflichtend sind und ob sie unterschiedlich gewichtet werden.
- Wie automatische Bewertungsvorschläge aus Grenzwerten abgeleitet werden.
- Ob abgeschlossene Reviews technisch gesperrt oder über versionierte Revisionen korrigierbar sein sollen.
- Wie Maßnahmen zwischen Reviews weitergeführt werden und ob Erinnerungen oder Fälligkeitshinweise benötigt werden.
- Welche sensiblen Inhalte vor einem Export pseudonymisiert werden können.

## Planung – spätere Ausbauphase

Die folgenden Ideen sollen nach der grundlegenden Fill-Up-, Policy- und
Analyzer-Run-Engine geprüft werden. Sie sollen möglichst dieselben
Clusterprofile, Ausfallszenarien, vROps-Zeitreihen und gespeicherten
Planungsläufe wiederverwenden.

Die bestehende What-if-Planung bildet zusammen mit Fill Up, gespeicherten
Szenarien, Hoständerungen und Ausfallsimulationen bereits die Grundlage eines
**Cluster Digital Twin**. Dafür wird vorerst kein konkurrierendes separates
Feature geplant; die nachfolgenden Funktionen sollen dieses gemeinsame
Szenariomodell schrittweise erweitern.

### Neuer-Workload-/Placement-Assistent

- [ ] Einen geplanten Workload über Anzahl, VM-Profil, vCPU, RAM, CPU Demand und HIGH-/STD-Anteil beschreiben können.
- [ ] Alle geeigneten Zielcluster anhand ihrer Policies, des normalen Headrooms sowie N-1-, optional N-2- und Site-Failover-Fähigkeit bewerten.
- [ ] Zielcluster als nachvollziehbares Ranking mit verbleibender Reserve, limitierender Metrik und Ausschlussgründen ausgeben.
- [ ] Große VMs und eingeschränkte Einzelhost-Platzierbarkeit berücksichtigen.
- [ ] Das gewählte Placement als gespeicherten Analyzer-Run oder geplante Kapazitätsreservierung übernehmen können.

### Host hinzufügen, ersetzen oder entfernen

- [ ] Hardware-What-if-Szenarien für zusätzliche, entfernte oder ersetzte ESXi-Hosts ermöglichen.
- [ ] CPU-MHz, Cores, RAM, Site-Zuordnung und Hostmodell des geplanten Hosts frei wählen oder aus einem lokalen Hardwaremodell-Katalog übernehmen.
- [ ] Gemischte Hardwaregenerationen und unterschiedlich große Hosts korrekt pro Host simulieren.
- [ ] Auswirkungen auf Fill Up, N-1, N-2, Site-Failover und große VM-Platzierbarkeit zeigen.
- [ ] Fragen beantworten wie „Wie viele Hosts brauchen wir für den geplanten Workload?“ oder „Können zwei alte Hosts durch einen neuen ersetzt werden?“.

### Geplante Kapazitätsreservierungen

- [ ] Zukünftige Projekte mit Name, Start-/Enddatum, Status, Wahrscheinlichkeit, VM-Profil, vCPU, RAM und HIGH-/STD-Anteil vormerken können.
- [ ] Zwischen technisch freier, bereits vorgemerkter und tatsächlich unverplanter Kapazität unterscheiden.
- [ ] Verhindern, dass derselbe Headroom mehreren Projekten gleichzeitig zugesagt wird.
- [ ] Zeitabhängige Kapazitätsansichten und Konflikte zwischen geplanten Projekten darstellen.
- [ ] Reservierungen versionieren, einem Verantwortlichen zuordnen und in Fill-Up- beziehungsweise Placement-Szenarien einbeziehen.

### Cluster-Evakuierungsplaner

- [ ] Die vollständige Evakuierung eines Clusters auf andere Zielcluster simulieren.
- [ ] VMs unter Beachtung von Clusterprofilen, HIGH/STD, N-1/N-2, Site-Failover und großer VM-Platzierbarkeit verteilen.
- [ ] Geeignete Zielcluster, notwendige Zielkapazität und nicht platzierbare VMs ausweisen.
- [ ] Eine empfohlene Migrationsreihenfolge beziehungsweise mehrere Migrationswellen erzeugen.
- [ ] Für Hardwaretausch, Clusterabbau, vCenter-Migration und größere Wartungsszenarien wiederverwendbar sein.

### Cluster-Zusammenlegung und -Aufteilung

- [ ] Prüfen, ob kleine Cluster unter Einhaltung ihrer Policies zusammengelegt werden können.
- [ ] Simulieren, ob ein gemischter Cluster fachlich sinnvoll in Realtime-, Standard-, VDI- oder andere Workloadklassen aufgeteilt werden sollte.
- [ ] Auswirkungen auf Hostanzahl, relativen N-1-Verlust, Site-Verteilung, Fill-Up-Headroom und Hardwarehomogenität vergleichen.
- [ ] Unterschiedliche Zieltopologien als gespeicherte Szenarien gegenüberstellen.
- [ ] Eine Empfehlung mit Vorteilen, Risiken, benötigten Migrationen und verbleibenden Kapazitätsreserven erzeugen.

## vROps-gestützte Analyseideen – spätere Ausbauphase

Die folgenden Funktionen sollen auf den für Fill Up importierten kompakten
VM- und Cluster-Zeitreihen aufbauen. Zusätzlich können vROps-Zeitreihen für
ESXi-Hosts verwendet werden. Die Hostmetriken für Demand, Usage, Memory,
Contention, verfügbare CPU-/RAM-Kapazität und Maintenance sind anhand der
pseudonymisierten Beispieldaten festgelegt. Interne Metric Keys bleiben
optionale Metadaten; der Import verwendet versionierte Spaltenschemata.

### Historischer Failover-Replay

- [ ] Für jede importierte Stunde Normalbetrieb, N-1, optional N-2 sowie den Ausfall beider Sites rückwirkend simulieren.
- [ ] Zeigen, in wie vielen Stunden die Cluster-Policy vollständig erfüllt, knapp oder verletzt gewesen wäre.
- [ ] Kritischste Zeitpunkte, betroffene Metriken und limitierende Hosts beziehungsweise Sites ausweisen.
- [ ] HIGH-Failover verpflichtend und STD-Verhalten im Site-Ausfall informativ bewerten.
- [ ] Mit ESXi-Host-Zeitreihen historische Maintenance-, Ausfall- und Host-Hotspot-Zustände präziser rekonstruieren.

### Peak-Contributor-Analyse

- [ ] Für einen tatsächlichen Clusterpeak genau die VMs anzeigen, die zu diesem Zeitpunkt den höchsten zeitgleichen Beitrag geleistet haben.
- [ ] HIGH-/STD-Anteil, VM CPU Demand, CPU Ready und Anteil am gesamten Clusterpeak darstellen.
- [ ] Zwischen einem einzelnen dominanten Verursacher und einem breiten gleichzeitigen Lastanstieg unterscheiden.
- [ ] Stündliche VM-Maxima nicht fälschlich als gleichzeitig behandeln; direkte Cluster-Maxima als Cross-Check verwenden.
- [ ] Optional den damaligen ESXi-Host und dessen CPU-/RAM-Zustand einbeziehen.

### VM-Auslastungsprofile und Verhaltensklassen

- [ ] Für jede VM ein kompaktes Sieben-Tage-Profil mit CPU Demand und CPU Ready anzeigen.
- [ ] VMs automatisch in nachvollziehbare Klassen einordnen, beispielsweise Dauerlast, Business-Hours, nächtlicher Batch, Wochenendlast, bursty, gering genutzt oder unregelmäßig.
- [ ] Klassifikation mit Datenabdeckung und Vertrauensniveau versehen.
- [ ] Verhaltensklassen für Fill Up, Placement, Cluster Review und spätere Konsolidierungsanalysen wiederverwenden.
- [ ] Manuelle Korrektur oder Kennzeichnung von fachlich bekannten Sonderfällen ermöglichen.

### CPU-Rightsizing-Kandidaten

- [ ] Konfigurierte vCPU mit P50/P95/Maximum CPU Demand und CPU Ready vergleichen.
- [ ] Kandidaten mit vielen vCPU, geringem Demand oder auffälligem Ready-Verhalten hervorheben.
- [ ] Breite VMs mit möglichem Co-Scheduling- oder Platzierungsproblem gesondert kennzeichnen.
- [ ] Empfehlungen nur als prüfpflichtige Kandidaten ausgeben und niemals automatisch VM-Ressourcen ändern.
- [ ] Potenziell rückgewinnbare vCPU-Kapazität je VM, Cluster und Profil zusammenfassen.

### Optimale Wartungszeit erkennen

- [ ] Aus den historischen Stundenprofilen regelmäßig lastarme Wartungsfenster je Cluster vorschlagen.
- [ ] CPU Demand, Memory Utilization, N-1/N-2 und HIGH-Site-Failover während möglicher Zeitfenster berücksichtigen.
- [ ] Vorschläge mit den aktuell hinterlegten Wartungsvorgaben vergleichen und Abweichungen begründen.
- [ ] Wiederkehrende Batch-, VDI-, SAP- oder OpenShift-Spitzen erkennen und als ungeeignete Fenster markieren.
- [ ] Mit Host-Zeitreihen prüfen, ob historische Patch- oder Maintenance-Zustände die Messwerte beeinflusst haben.

### Import-zu-Import-Vergleich

- [ ] Neue vROps-Imports mit dem vorherigen Datenstand desselben Clusters vergleichen.
- [ ] Änderungen bei P95/Maximum CPU Demand, CPU Ready, CPU Contention, Memory Utilization, HIGH-Site-Headroom und Fill-Up-Kapazität zeigen.
- [ ] Kompakte Langzeitkennzahlen dauerhaft behalten, auch wenn detaillierte Sieben-Tage-Rohprofile später gelöscht werden.
- [ ] Verbesserungen, Verschlechterungen und strukturelle Änderungen wie neue Hosts, VMs oder Clusterprofile hervorheben.
- [ ] Vergleichsergebnisse als Analyzer-Run speichern und exportieren können.

### Policy-Compliance

- [ ] Je Cluster automatisch prüfen, ob die aktuell zugewiesene Capacity Policy eingehalten wird.
- [ ] Normalbetrieb, N-1, optional N-2, HIGH-Site-Failover, vCPU/Core, CPU Demand, CPU Ready, CPU Contention, RAM-Puffer und große Ausnahme-VMs berücksichtigen.
- [ ] Abweichungen mit Ist-Wert, Zielwert, Datenquelle, Zeitpunkt und betroffenen Objekten erklären.
- [ ] Zwischen harter Verletzung, Warnung, akzeptierter Ausnahme und unzureichender Datenqualität unterscheiden.
- [ ] Findings direkt in Maßnahmen, Cluster Reviews oder gespeicherte Analyzer-Runs übernehmen können.

### Automatische Cluster-Review-Evidenz

- [ ] Den Cluster-Review-Wizard automatisch mit relevanten Erkenntnissen aus dem aktuellen vROps- und RVTools-Datenstand vorbereiten.
- [ ] Kritischste Stunden, Failover-Erfüllungsquote, Peak Contributors, Auslastungsprofile, Rightsizing-Kandidaten, Policy-Abweichungen und Veränderungen seit dem letzten Review zusammenstellen.
- [ ] Positive Entwicklungen ebenso sichtbar machen wie neue Risiken.
- [ ] Jede Evidenz mit Datenstand, Zeitraum, Policy-Version und nachvollziehbarer Quelle speichern.
- [ ] Reviewer entscheiden lassen, welche Befunde in Bewertung, Zusammenfassung, Maßnahmenliste und Markdown-Export übernommen werden.

### Workload-Korrelationsanalyse

- [ ] Zeitgleiche Lastverläufe von VMs und Verhaltensklassen vergleichen, statt voneinander unabhängige Einzelmaxima zu addieren.
- [ ] Positiv korrelierte Workloads mit gemeinsamen Peaks sowie gegenläufige Workloads mit gut ergänzenden Tagesprofilen erkennen.
- [ ] Einen nachvollziehbaren Workload-Diversitätswert pro Cluster ausweisen und mit Datenabdeckung sowie Vertrauensniveau versehen.
- [ ] Kritische Korrelationsgruppen mit HIGH-/STD-Zuordnung, Peak-Zeitpunkten und ihrem Anteil am Cluster Demand anzeigen.
- [ ] Ergebnisse im Placement-Assistenten verwenden, damit Zielcluster nicht nur nach freier Kapazität, sondern auch nach zeitlicher Ergänzung bewertet werden.
- [ ] In What-if- und Fill-Up-Szenarien die historischen Stunden gemeinsam erneut berechnen und keine Sicherheit allein aus statistischer Gegenläufigkeit ableiten.

### Resilience Score mit konkretem Maßnahmenplan

- [ ] Den vorhandenen Cluster Risk Score zu einer erklärbaren Resilience-Sicht erweitern, statt einen zweiten konkurrierenden Gesamtscore einzuführen.
- [ ] N-1, optional N-2, HIGH-Site-Failover, Host-/Site-Balance, große VM-Platzierbarkeit, CPU Ready, CPU Contention und Datenqualität bewerten.
- [ ] Score, Teilbewertungen und Entwicklung seit dem letzten Import beziehungsweise Cluster Review auf einer einheitlichen Skala darstellen.
- [ ] Für jeden Abzug den konkreten Befund, betroffene Objekte, Policy-Ziel und Datenzeitraum nennen.
- [ ] Verbesserungsmaßnahmen mit erwarteter Score-Wirkung, Kapazitätsgewinn, Aufwand, Risiko und Priorität vorschlagen.
- [ ] Manuell akzeptierte Risiken und Ausnahmen dokumentieren, ohne sie als behoben darzustellen.

### Automatischer Maßnahmen-Simulator

- [ ] Aus erkannten Limitern automatisch mehrere reversible What-if-Maßnahmen erzeugen und mit der gemeinsamen Szenario-Engine durchrechnen.
- [ ] Unter anderem Host hinzufügen oder ersetzen, ausgewählte VMs verschieben, Cluster zusammenlegen, große VMs rightsizen und Site-Verteilungen verbessern simulieren.
- [ ] Einzelmaßnahmen und sinnvolle Maßnahmenpakete nach Policy-Erfüllung, Resilience-Verbesserung, Fill-Up-Gewinn, Aufwand und Risiko vergleichen.
- [ ] Nicht nur das beste Ergebnis, sondern auch Zielkonflikte wie mehr Headroom bei höherem Betriebsaufwand erklären.
- [ ] Keine Änderung an vCenter oder VMs automatisch ausführen; Ergebnisse bleiben prüfbare Planungsvorschläge.
- [ ] Gewählte Vorschläge als gespeichertes Szenario, Cluster-Review-Maßnahme oder Kapazitätsplanung übernehmen können.

### „Warum wurde es rot?“-Zeitreise

- [ ] Für jede gelbe oder rote Stunde eine rekonstruierte, verständliche Ursachenanalyse bereitstellen.
- [ ] Metrikänderungen gegenüber den vorherigen Stunden, Peak Contributors, HIGH-/STD-Anteile, Hostzustände, Maintenance und das aktive Ausfallszenario zusammenführen.
- [ ] Zwischen clusterweiter Sättigung, einzelnen Host-Hotspots, ungünstiger VM-Verteilung, großen Einzelverursachern und Policy-Änderungen unterscheiden.
- [ ] In einer Zeitachse zeigen, welche Metrik zuerst auffällig wurde und welche weitere Grenzwertverletzungen daraus folgten.
- [ ] Direkte Sprünge zu den beteiligten VMs, Hosts, Sites und historischen Detailprofilen ermöglichen.
- [ ] Die Erklärung mit Datenstand, Policy-Version und Datenqualität speichern und als Evidenz in Cluster Reviews übernehmen können.
