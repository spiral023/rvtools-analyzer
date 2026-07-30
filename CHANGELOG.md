# Changelog

## 30.07.2026

- Die Fill-Up-Planung wurde um einen konfigurierbaren CPU-Gleichzeitigkeitsfaktor erweitert. Dieser bewertet die CPU-Anforderung zusätzlicher VMs zwischen beobachtetem Durchschnitt und P95; Referenzprofile behalten dabei ihre präzisen Werte. Der historische Verlauf kann zusätzlich relativ zur normalen Cluster-Kapazität in Prozent statt nur in GHz/GiB angezeigt werden. Eine KPI-Leiste fasst bewertete Cluster und Hosts, zusätzliche VMs sowie N-1-Guardrail-Verstöße zusammen.
- Kapazitätspolicies sind als eigener Planungsbereich mit Katalog, Zuordnungstabelle und Bearbeitung verfügbar. Cluster-Exporte enthalten nun auch die Kennzahlen zur Kapazitätsgesundheit.
- Die VM-Analyse enthält die neuen Tabs **VM-Profile** und **Rightsizing**. Zeitreihen klassifizieren Lastform und Auslastungsintensität getrennt, einschließlich der zusätzlichen Form „Grundlast mit Lastfenster“. Die Analyse zeigt Datenabdeckung und Konfidenz und speist gemessene HIGH-/STD-Standardprofile in Fill Up ein.
- Rightsizing-Empfehlungen wurden deutlich konservativer: Sie berücksichtigen P95 und Spitzenlast, erfolgen nur in geraden vCPU-Schritten und höchstens um ein Viertel der aktuellen vCPU. Bei zu geringer Datenqualität oder unregelmäßigen bzw. burstigen Lastmustern wird keine Empfehlung ausgegeben; der messbasierte Zielwert und der konkrete Zurückhaltungsgrund bleiben sichtbar.
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
