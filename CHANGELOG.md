# Changelog

## Änderungen seit 28.07.2026

Die Planung enthält jetzt eine lokale Fill-Up- und Cluster-Kapazitätsanalyse. Sie importiert getrennte stündliche vROps-CSV-Dateisätze für VMs, Cluster und Hosts, prüft deren Schema, Einheiten, Zeitzonen und Datenqualität und speichert sie kompakt im Browser.

Zeitreihen-CSVs, die über den allgemeinen Upload abgelegt werden, werden nun anhand ihres Headers erkannt, automatisch dem passenden VM-, Cluster- oder Host-Slot zugeordnet und im Dateisatz-Import geöffnet.

Der vROps-Dateisatzdialog protokolliert jeden Import-Schritt, Warnungen und Fehler vollständig. Eine explizite Speicherbestätigung und der Fill-up-Auswahlhinweis machen sichtbar, ob ein Dateisatz tatsächlich lokal verfügbar ist.

Große vROps-CSV-Dateisätze werden beim Worker-Parsing nun zeilenweise fortschrittsfähig verarbeitet; wiederkehrende Vienna-Zeitstempel werden gecacht. Mehrere RVTools-Snapshots können gemeinsam als vCenter-Scope gewählt werden.

Kurzlebige vROps-Objekte mit einem Teilzeitraum (etwa Hotclones) blockieren den kompletten Dateisatz nicht mehr; ihre fehlenden Stunden werden als Missing Values gespeichert und in der Datenqualität gekennzeichnet.

Fehlschläge bei der Stundenrasterprüfung erläutern nun direkt im Importdialog die konkrete Abweichung: Zeitpunkte und Zeitraum je VM-, Cluster- und Host-CSV, Rasterlücken sowie fehlende oder zusätzliche Stunden gegenüber der VM-Referenz einschließlich Beispielzeitpunkten.

Die Fill-up-Auswertung großer Zeitreihen läuft nun in einem eigenen Browser-Worker. Dadurch bleibt die Planungsseite während der lokalen Szenarioanalyse bedienbar; übergeben werden anschließend nur kompakte Ergebnis- und Chartdaten statt vollständiger VM-/Host-Stundenmatrizen.

Für jeden verbundenen RVTools-Cluster werden Normalbetrieb, N-1, optional N-2 sowie HIGH-Site-Failover berechnet. Versionierte Kapazitätspolicies, CPU-/RAM- und Platzierungs-Guardrails, HIGH-/STD-Workloadprofile und eine nachvollziehbare Fill-Up-Empfehlung sind im Planungstab verfügbar.

Analyzer-Runs lassen sich lokal speichern, duplizieren, umbenennen, löschen und als Markdown kopieren. Sie behalten ihre import-, policy- und ergebnisbezogenen Snapshots unveränderlich bei. Die fachliche Gegenrechnung mit einem vollständigen Realcluster und der Skalierungstest folgen weiterhin nachgelagert.

## Änderungen seit 20.07.2026

RVTools Analyzer bietet jetzt eine deutlich übersichtlichere Analyseoberfläche: Kapazitäts-, Planungs-, VM-, Host-, Storage- und Cluster-Auswertungen wurden neu gruppiert. Detailansichten lassen sich gezielter öffnen, etwa für vCenter, Hosts und virtuelle Maschinen. Die erkannte vCenter-Version ist zudem in der Flottenübersicht sichtbar.

Die Kapazitätsplanung wurde erweitert. Risikoanzeigen berücksichtigen nun zusätzliche vROps- und HIGH-RP-Werte, einschließlich Site-Failover und Host-Ausfallkapazität. In What-If-Vergleichen werden diese Faktoren vor und nach einer Planung transparenter dargestellt; Kennzahlen, Schwellenwerte und Hilfetexte wurden präzisiert. Auch Thin-Disk-Migrationen und Auslastungsdetails lassen sich besser bewerten.

Für Netzwerkprüfungen steht eine geführte Kontrolle mit direkt verlinkbaren Ansichten, klareren Leerzuständen und zusätzlichen Port- sowie MAC-Audits bereit. CSV-Daten aus eRamon (Switch-Ports und MAC-Tabellen) können importiert und in die Prüfung einbezogen werden.

Uploads unterstützen nun Drag-and-drop und laden importierte Daten automatisch vor, wodurch die Navigation schneller reagiert. Die App ist außerdem als installierbare PWA verfügbar und weist sichtbar auf Updates hin.
