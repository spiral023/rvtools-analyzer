# Changelog

## 01.08.2026

- Die Diagnose bietet einen **Analyse-Export**: Inventar, berechnete Profilkennzahlen und die stündlichen vROps-Rohreihen als ZIP für die externe Auswertung. Die Messreihen werden als Differenzwerte gespeichert statt mit einem wiederholten Zeitstempel je Messpunkt — im bisherigen Export machte allein das Datum 91 % der Dateigröße aus. Ein Bestand aus 5.000 VMs über einen Monat bleibt damit bei rund 17 MB statt mehreren hundert. Wahlweise auch ohne Rohreihen, dann unter einem MB. Die Kürzel der Pseudonymisierung sind über mehrere Exporte hinweg stabil, sodass sich zwei Stände direkt vergleichen lassen.
- Der vROps-Import verarbeitet sechs zusätzliche VM-CPU-Metriken, sofern die Export-View sie liefert: CPU Demand Max, CPU Total Capacity, vCPU Usage Disparity, Peak vCPU Ready, Peak vCPU Co-Stop und die konfigurierte vCPU-Anzahl. Sie sind die Grundlage dafür, unterdimensionierte VMs zu erkennen — bisher war ausschließlich eine Verkleinerung beurteilbar. Bestehende Importe und Exporte ohne diese Spalten bleiben unverändert gültig.
- Die Auslastungsdiagramme in den Detailansichten sind nicht mehr auf sieben Tage festgelegt. Der Zeitraum kommt aus dem Import und steht in der Überschrift. Längere Zeiträume werden zu Zeitfenstern verdichtet, weil ein Monat mit 744 Stundenwerten sonst weniger als ein Pixel je Wert hätte. Verdichtet wird nicht durch Mittelung: Ein Band um die Linie zeigt die Spanne im Fenster, sodass Lastspitzen sichtbar bleiben statt weggemittelt zu werden. Liegt CPU Demand Max vor, geht das Stundenmaximum in das Band ein.
- Österreichische Feiertage werden lokal berechnet und dem Analyse-Export beigelegt. An Feiertagen fehlt die Bürolast, was die Bewertung des Tagesmusters einer VM sonst verzerrt.
- vROps-Zeitreihen über einen vollen Monat sind jetzt importierbar. Ein Satz aus 5.000 VMs über 30 Tage – 3,6 Millionen Messzeilen und rund 240 MB CSV – benötigt beim Import noch etwa 290 MB Arbeitsspeicher statt zuvor über 2,6 GB. Bisher scheiterten solche Dateisätze im Browser am Speicherlimit; praktikabel waren nur rund sieben Tage. Die Dateien werden dafür im Hintergrund gestreamt und direkt in die kompakte Stunden-Matrix geschrieben, statt zunächst jede Zeile als Einzelobjekt aufzubauen. Die Importdauer bleibt unverändert, die gespeicherten Werte sind identisch.
- Der Importfortschritt zeigt jetzt den gelesenen Anteil je Datei und Durchgang statt einer Zeilenzählung.
- Meldungen zur Datenqualität werden je Fehlerart auf 50 Beispiele begrenzt; die vollständige Anzahl bleibt in der Auswertung erhalten. Ein systematischer Fehler in einer grossen Datei erzeugt damit keine unbegrenzte Meldungsliste mehr.
- Wartungszustände von Hosts werden platzsparender abgelegt. Bereits importierte Zeitreihen bleiben unverändert nutzbar, ein Neuimport ist nicht nötig.

## 30.07.2026

- Die Fill-Up-Kapazität erscheint nach dem Vorladen ohne Wartezeit. Das Vorladen berechnet die Auswertung jetzt mit genau den Werten, mit denen die Seite startet – dem CPU-Gleichzeitigkeitsfaktor der Oberfläche und der typischen zusätzlichen VM aus den gemessenen HIGH-/STD-Durchschnitten. Zuvor verfehlte das vorberechnete Ergebnis die Anfrage der Oberfläche, weshalb trotz Vorladen rund zehn Sekunden neu gerechnet wurde. Läuft eine Neuberechnung nach einer Wertänderung, weist ein gelber Hinweis darauf hin, dass Kennzahlen, Clustervergleich und Details noch den vorherigen Stand zeigen; er verschwindet automatisch, sobald die Berechnung fertig ist.
- Die Wartungsfenster-Seite ist für große Umgebungen mit rund 70 Definitionen und 5.000 Systemen optimiert: Der Katalog verzichtet auf tausende Mini-Zeitplanfelder, die Systemzuordnungen und Detailtabellen sind virtualisiert, die Suche berücksichtigt Fenster und Systeme, und sechs KPIs zeigen Definitionen, Abdeckung, ungenutzte Fenster sowie Zuordnungslücken.
- Die Organisationshierarchie ergänzt je Organisation, Bereich, Abteilung und verantwortlicher Person den mittleren CPU Demand, die CPU-Intensität und das prüfpflichtige Rightsizing-Potenzial als Anteil der gesamten vCPU. Fehlende oder mehrdeutige vROps-Daten werden sicher als nicht verfügbar dargestellt.
- Das Rightsizing-Dichteraster **Konfigurierte vCPU vs. CPU Demand P95 %** ist interaktiv. Ein Klick auf eine belegte Kachel öffnet die enthaltenen VMs mit den wichtigsten Demand-, Ready-, Ziel-vCPU-, Rückgabe- und Konfidenzmetriken; von dort lässt sich direkt die VM-Detailansicht öffnen.
- Datastore-Details zeigen die Anzahl der zugeordneten Compute-Cluster und unterstützen Datastores, die in mehreren Clustern verfügbar sind. Zusätzlich wird der Datastore-Cluster aus dem exakten RVTools-Feld **Datastore cluster name** zuverlässig übernommen.
- Die Fill-Up-Planung wurde um einen konfigurierbaren CPU-Gleichzeitigkeitsfaktor erweitert. Dieser bewertet die CPU-Anforderung zusätzlicher VMs zwischen beobachtetem Durchschnitt und P95; Referenzprofile behalten dabei ihre präzisen Werte. Der historische Verlauf kann zusätzlich relativ zur normalen Cluster-Kapazität in Prozent statt nur in GHz/GiB angezeigt werden. Eine KPI-Leiste fasst bewertete Cluster und Hosts, zusätzliche VMs sowie N-1-Guardrail-Verstöße zusammen.
- Kapazitätspolicies sind als eigener Planungsbereich mit Katalog, Zuordnungstabelle und Bearbeitung verfügbar. Cluster-Exporte enthalten nun auch die Kennzahlen zur Kapazitätsgesundheit.
- Die VM-Analyse enthält die neuen Tabs **VM-Profile** und **Rightsizing**. Zeitreihen klassifizieren Lastform und Auslastungsintensität getrennt, einschließlich der zusätzlichen Form „Grundlast mit Lastfenster“. Die Analyse zeigt Datenabdeckung und Konfidenz und speist gemessene HIGH-/STD-Standardprofile in Fill Up ein.
- Rightsizing-Empfehlungen wurden deutlich konservativer: Sie berücksichtigen P95 und Spitzenlast, erfolgen nur in geraden vCPU-Schritten und höchstens um ein Viertel der aktuellen vCPU – mindestens jedoch um ein vCPU-Paar, sofern der gemessene Bedarf es zulässt. Ohne diese Untergrenze rundete die Schrittweitenbegrenzung jede Empfehlung unterhalb von acht konfigurierten vCPU auf null ab, sodass „Rückgewinnbar“ für die Mehrzahl der VMs leer blieb. Bei zu geringer Datenqualität oder unregelmäßigen bzw. burstigen Lastmustern wird keine Empfehlung ausgegeben; der messbasierte Zielwert und der konkrete Zurückhaltungsgrund bleiben sichtbar.
- Die Textsuche der Filterleiste berücksichtigt zusätzlich die SysV-Abteilung aus der Tech-Info. Eine Suche nach Abteilung, Bereich oder vollständigem Pfad (z.B. `VIA`, `IN-`, `RAITEC/BS-DBA`) filtert Inventar, Übersicht, VM-Profile und Rightsizing auf die VMs dieser Abteilung – einschließlich KPI-Kacheln und Diagrammen. Die betroffenen Tabellen zeigen die Abteilung als eigene Spalte.
- Benutzerdaten-Backups speichern Wochenpläne von Wartungsfenstern als Zeitbereiche je Wochentag statt als Matrix aus 336 Wahrheitswerten. Ein Bestand von 70 Fenstern schrumpft damit von rund 26.000 auf etwa 700 Zeilen und wird lesbar prüfbar. Ältere Backups mit der bisherigen Matrix werden unverändert eingelesen.
- Uploads erkennen vollständige vROps-Zeitreihensätze automatisch und importieren sie direkt, auch wenn sie zusammen mit anderen Dateien abgelegt werden. ZIP-Archive können lokal entpackt werden; enthaltene RVTools-Exporte werden dabei vor abhängigen Zeitreihen verarbeitet. Nach einem RVTools-Reimport werden bestehende vROps-Zeitreihen wieder mit den neuen Snapshot-IDs verknüpft.
- Das Export Studio bietet für VM-Exporte zusätzliche, kategorisierte Spalten für Inventar, Tech-Info, Lastprofile, CPU-Kennzahlen und Rightsizing. Auch Hostprofile stehen im Export bereit.
- Cluster-, Host- und VM-Details zeigen direkt vROps-Trenddiagramme. Die Wochenansicht nutzt Wochentag und Uhrzeit, markiert den aktuellen Zeitpunkt und verwendet bei der Heatmap eine medianbasierte Skala für besser erkennbare Lastspitzen.
- Die Übersichts-Kachel für durchschnittliche VMs wurde neu gestaltet: Konfigurierte Ressourcen und beobachtete Auslastung sind klar getrennt, CPU-Demand wird zusätzlich relativ zur durchschnittlich bereitgestellten CPU-Kapazität dargestellt.
- In den VM-Panels ergänzen KPIs für Snapshots, veraltete Snapshots und Latenzempfindlichkeit die Betriebs- und Performance-Sicht. Tabellen zeigen CPU-Demand zusätzlich in Prozent, zählen gefilterte Treffer korrekt und können Systemverantwortliche aus Tech-Info ausgeben.
- Die VMware-Release-Kataloge enthalten vCenter Server und ESXi 8.0 Update 3k. Netzwerk-Audits wurden um kontextbezogene Erklärungen, farbige Portstatus und kompaktere Switchnamen ergänzt. Die Datenverwaltung kann RVTools-Systemdaten und gesicherte Benutzerdaten getrennt löschen.

## 28.07.2026

- Fill Up leitet nun je Cluster sowie je Resource Pool typische VM-Referenzprofile aus RVTools und VM-Zeitreihen ab: Ø vCPU, konfigurierter RAM, CPU-Demand Ø/P95 und CPU-Ready P95. Ein Referenzprofil kann direkt als editierbare typische zusätzliche HIGH- oder STD-VM übernommen werden.
- Neues lokales **Export Studio** mit frei wählbaren, per Drag & Drop sortierbaren Spalten für VM-, Host-, Cluster- und gespeicherte Fill-Up-Ergebnisse.
- Exporte übernehmen den aktiven Daten-Scope und stehen als XLSX, CSV sowie Markdown-Management-Report bereit.
- Optionale, konsistente Pseudonymisierung und lokal gespeicherte Exportvorlagen ergänzt.
- **Tech-Info** erhält einen neuen Tab **Organisation**: Server-VMs werden anhand der SysV-Abteilung (z.B. `RAITEC/IN-VIA`) zu einer auf-/zuklappbaren Hierarchie Organisation → Bereich → Abteilung → Systemverantwortliche:r aggregiert, mit KPI-Karten, Balkendiagramm je Bereich (VM-Anzahl, vCPU, RAM), Klick-Drilldown auf die betroffenen VMs, umschaltbarer Auswertung nach primärer Verantwortung, Stellvertretung oder beiden Rollen sowie einer eigenen Datenqualitätsübersicht für fehlende, nicht interpretierbare oder widersprüchliche Zuordnungen. Die VM-Liste lässt sich optional mit pseudonymisierten Namen als Excel/Markdown exportieren.
- Tab-Leisten nehmen jetzt app-weit einheitlich die volle verfügbare Breite ein (Standard der `TabsList`-Komponente).

## Änderungen seit 28.07.2026

Die Planung enthält jetzt eine lokale Fill-Up- und Cluster-Kapazitätsanalyse. Sie importiert getrennte stündliche vROps-CSV-Dateisätze für VMs, Cluster und Hosts, prüft deren Schema, Einheiten, Zeitzonen und Datenqualität und speichert sie kompakt im Browser.

Zeitreihen-CSVs, die über den allgemeinen Upload abgelegt werden, werden nun anhand ihres Headers erkannt, automatisch dem passenden VM-, Cluster- oder Host-Slot zugeordnet und im Dateisatz-Import geöffnet.

Der vROps-Dateisatzdialog protokolliert jeden Import-Schritt, Warnungen und Fehler vollständig. Eine explizite Speicherbestätigung und der Fill-up-Auswahlhinweis machen sichtbar, ob ein Dateisatz tatsächlich lokal verfügbar ist.

Große vROps-CSV-Dateisätze werden beim Worker-Parsing nun zeilenweise fortschrittsfähig verarbeitet; wiederkehrende Vienna-Zeitstempel werden gecacht. Mehrere RVTools-Snapshots können gemeinsam als vCenter-Scope gewählt werden.

Kurzlebige vROps-Objekte mit einem Teilzeitraum (etwa Hotclones) blockieren den kompletten Dateisatz nicht mehr; ihre fehlenden Stunden werden als Missing Values gespeichert und in der Datenqualität gekennzeichnet.

Fehlschläge bei der Stundenrasterprüfung erläutern nun direkt im Importdialog die konkrete Abweichung: Zeitpunkte und Zeitraum je VM-, Cluster- und Host-CSV, Rasterlücken sowie fehlende oder zusätzliche Stunden gegenüber der VM-Referenz einschließlich Beispielzeitpunkten.

Die Fill-up-Auswertung großer Zeitreihen läuft nun in einem eigenen Browser-Worker. Dadurch bleibt die Planungsseite während der lokalen Szenarioanalyse bedienbar; übergeben werden anschließend nur kompakte Ergebnis- und Chartdaten statt vollständiger VM-/Host-Stundenmatrizen.

Fehler beim Start, der Datenübergabe oder der Rückgabe der Fill-up-Worker-Auswertung werden mit einem eindeutigen Titel und einem belastbaren Browser-Fallback angezeigt.

Große Zeitreihenpuffer werden aus IndexedDB ohne zusätzliche Kopie an den Fill-up-Worker übertragen; die Rückgabe lässt Objektlisten aus Szenarien weg, die in der Oberfläche nicht benötigt werden.

Auf der Seite Wartung lässt sich das Fill-Up-Basisprofil jetzt direkt je Cluster zuweisen, etwa VDI, SAP oder Standard Server Windows. Jede Auswahl bleibt lokal vCenter- und clusterbezogen gespeichert, bewahrt vorhandene Einzel-Overrides und ist von Wartungsfenstern sowie Empfängern getrennt.

Mehrere markierte Cluster können ihr Fill-Up-Basisprofil jetzt gesammelt erhalten. Die Cluster-Tabelle nutzt dabei die volle Seitenbreite mit kompakter Höhe; die Bulk- und Detailbearbeitung liegt direkt darunter.

Der Fill-Up-Clustervergleich erklärt nun seine Ergebniswerte direkt per Tooltip – einschließlich tatsächlichem Mix, Limitierung, Szenariozeitpunkt sowie CPU- und RAM-Basis. Alle Policy-Felder besitzen fachliche Hilfen. Fill-Up-Kapazitätswerte und Eingaben werden durchgängig in GHz und GiB mit zwei Nachkommastellen angezeigt; intern bleiben die Originaleinheiten MHz und MiB erhalten.

Der vROps-Dateisatzimport verwendet jetzt eine gemeinsame Dropzone für VM-, Cluster- und Host-CSV. Die Zuordnung erfolgt über den Typ im Dateinamen, zeigt alle erkannten Slots unmittelbar an und meldet unklare oder doppelte Dateien. RVTools-vCenter-Scopes sind alphabetisch sortiert.

Fill Up erklärt nun Eingaben, Datenqualität, Ergebnisbereiche und alle Spalten des Clustervergleichs direkt per Tooltip.

Für jeden verbundenen RVTools-Cluster werden Normalbetrieb, N-1, optional N-2 sowie HIGH-Site-Failover berechnet. Versionierte Kapazitätspolicies, CPU-/RAM- und Platzierungs-Guardrails, HIGH-/STD-Workloadprofile und eine nachvollziehbare Fill-Up-Empfehlung sind im Planungstab verfügbar.

Analyzer-Runs lassen sich lokal speichern, duplizieren, umbenennen, löschen und als Markdown kopieren. Sie behalten ihre import-, policy- und ergebnisbezogenen Snapshots unveränderlich bei. Die fachliche Gegenrechnung mit einem vollständigen Realcluster und der Skalierungstest folgen weiterhin nachgelagert.

## Änderungen seit 20.07.2026

RVTools Analyzer bietet jetzt eine deutlich übersichtlichere Analyseoberfläche: Kapazitäts-, Planungs-, VM-, Host-, Storage- und Cluster-Auswertungen wurden neu gruppiert. Detailansichten lassen sich gezielter öffnen, etwa für vCenter, Hosts und virtuelle Maschinen. Die erkannte vCenter-Version ist zudem in der Flottenübersicht sichtbar.

Die Kapazitätsplanung wurde erweitert. Risikoanzeigen berücksichtigen nun zusätzliche vROps- und HIGH-RP-Werte, einschließlich Site-Failover und Host-Ausfallkapazität. In What-If-Vergleichen werden diese Faktoren vor und nach einer Planung transparenter dargestellt; Kennzahlen, Schwellenwerte und Hilfetexte wurden präzisiert. Auch Thin-Disk-Migrationen und Auslastungsdetails lassen sich besser bewerten.

Für Netzwerkprüfungen steht eine geführte Kontrolle mit direkt verlinkbaren Ansichten, klareren Leerzuständen und zusätzlichen Port- sowie MAC-Audits bereit. CSV-Daten aus eRamon (Switch-Ports und MAC-Tabellen) können importiert und in die Prüfung einbezogen werden.

Uploads unterstützen nun Drag-and-drop und laden importierte Daten automatisch vor, wodurch die Navigation schneller reagiert. Die App ist außerdem als installierbare PWA verfügbar und weist sichtbar auf Updates hin.
