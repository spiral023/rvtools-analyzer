# Design: Cluster-Arbeitsbereich

**Datum:** 2026-07-22  
**Status:** Entwurf zur Freigabe

## Ziel

Ein neuer Menüpunkt **Cluster** bündelt alle clusterbezogenen Auswertungen und Arbeitsabläufe. Er zeigt stets alle Cluster im aktuellen globalen Scope: ausgewählte vCenter, optionaler Cluster-Filter und Suche der bestehenden Filterleiste gelten ohne zusätzliche Filterlogik.

Die Seite ist eine operative Übersicht mit Drill-down. Sie ersetzt keine vCenter-Änderungen und speichert keine zusätzliche Snapshot-Historie: Pro vCenter wird weiterhin genau der aktuelle RVTools-Export ausgewertet.

## Informationsarchitektur

Neue Route: `/clusters`. Der Sidebar-Eintrag steht in **Analyse**.

| Tab | Zweck | Übernommene Funktionen |
|---|---|---|
| Übersicht | Schneller Überblick über alle Cluster und deren Ausreißer | Neue Clusterübersicht; OS je Cluster und Host-Verteilung aus Overview; Cluster-Detaildialog |
| Kapazität | Dichte, Auslastung, Risiken und Überbuchung | Cluster Capacity Health, Cluster Overcommit, Risikoscore und Host-Dichte aus Capacity; Cluster-Dichte aus Licensing |
| Wartung | Cluster-Zuweisungen und Ankündigungen | Vollständige Wartungsankündigung einschließlich Empfänger, Fenster, Mail-Vorschau und Sammelaktion |
| Planung | VM-Migrationen als What-if | Vollständige bestehende Planungsfunktion einschließlich Szenarien und Vergleichsdialog |
| Infrastruktur | Hardware- und Lifecycle-Sicht pro Cluster | CPU-Mix, Host-/ESXi-Inventar sowie HBA-/NIC-Treiberinventar aus Compliance/Lifecycle |

Die bisherigen Seiten **Wartungsankündigung** und **Planung** werden in diese Tabs überführt. Ihre alten URLs bleiben als Weiterleitung auf den passenden Cluster-Tab erhalten, damit Bookmarks nicht brechen. Capacity, Overview, Licensing und Compliance behalten nur ihre nicht-clusterbezogenen Inhalte; die jeweils übernommenen Bereiche werden dort nicht dupliziert.

## Tab „Übersicht“

### KPI-Leiste

- Cluster im aktuellen Scope
- Hosts
- Laufende VMs
- Cluster mit hohem Capacity-Risiko
- Maximum VMs/Host, mit Cluster und Host als Untertitel
- HA/DRS-Auffälligkeiten: Anzahl der Cluster, bei denen HA oder DRS deaktiviert bzw. nicht ermittelbar ist

### Visualisierungen

- **Cluster-Dichtekarte:** Jeder Punkt ist ein Cluster; X-Achse Ø VMs/Host, Y-Achse vCPU/Core, Punktgröße laufende VMs, Farbe Capacity-Risiko.
- **Kapazitätsrisiken je Cluster:** horizontale Rangliste der auffälligsten Cluster nach bestehendem Risikoscore.
- **VM-Verteilung je Host:** je Cluster Ø VMs/Host mit Marker für das Maximum. Diese Darstellung macht Dichte und ungleichmäßige Verteilung sichtbar.

### Zentrale Cluster-Tabelle

Die exportierbare, sortierbare Tabelle bildet die Arbeitsgrundlage. Mindestens enthalten sind:

`vCenter · Datacenter · Cluster · HA · DRS · Hosts · laufende VMs · Ø VMs/Host · Max. VMs/Host · vCPU/Core · RAM Commit · Risiko`

Ein Klick öffnet den bestehenden Cluster-Steckbrief. Dieser wird um vCenter-Name, maximale Host-Dichte und die eindeutige Clusterzuordnung ergänzt. Wie alle `VirtualTable`-Ansichten bietet die Tabelle Excel- und Markdown-Export; der Steckbrief bleibt als Markdown kopierbar.

### Betriebssysteme

Die bestehende Tabelle „Betriebssysteme je Cluster“ wird aus Overview übernommen. Der OS-Mix bleibt in diesem ersten Ausbauschritt eine Tabelle; später kann sie durch eine 100-%-gestapelte Balkengrafik für Windows, Linux, Sonstige und Unbekannt ergänzt werden.

## Tab „Kapazität“

Der Tab übernimmt die clusterbezogenen Bestandteile der Capacity-Seite:

- Cluster Capacity Health
- Cluster Overcommit
- Cluster Capacity Risk Score
- Host-Dichte (VMs versus vCPU/Core)
- Cluster-Dichte-Tabelle aus Licensing

Der Datastore-Headroom, Resource-Pools und Thin-Provisioning bleiben auf Capacity, weil sie nicht zuverlässig einem einzelnen Cluster zugeordnet sind oder primär Storage-Themen sind.

Die Werte beruhen auf den vorhandenen `vHost`-, `vCluster`-, `vInfo`- und `vDatastore`-Daten: CPU-/RAM-Auslastung, vCPU/Core, RAM Commit, aktive RAM-Nutzung, Swap/Balloon, Hot Hosts und der bestehende Risikoscore. Eine HA-Reserve wird ausschließlich als Indikator aus `NumEffectiveHosts` gegenüber der Host-Anzahl gezeigt; keine Anzeige darf eine garantierte Admission-Control- oder N+1-Fähigkeit behaupten.

## Tab „Wartung“

Die bestehende Wartungsankündigung wird unverändert funktional in den Cluster-Arbeitsbereich integriert:

- Cluster-Typ, Verantwortliche und zusätzliche Empfänger
- manuell gepflegte Cluster-Wartungsfenster
- HA-/DRS-Status als zusätzliche Readiness-Information
- Mail-Vorschau, Kopieren und Sammelankündigungen

Verantwortliche, Empfänger, Cluster-Typ und Clusterfenster stammen aus den lokalen `MaintenanceClusterAssignment`-Daten, nicht aus RVTools. Tech-Info liefert aktuell Vorschläge für SysV und Stellvertretung. Das in Tech-Info vorhandene VM-Wartungsfenster wird vorerst nicht als Clusterfenster ausgegeben; eine spätere Aggregation muss separat fachlich definiert werden.

## Tab „Planung“

Die bestehende Planung wird ohne Funktionsverlust integriert:

- Szenarien verwalten
- VMs auswählen und Zielcluster zuweisen
- Vorher-/Nachher-Werte für vCPU, RAM, Last und Risiko anzeigen
- What-if-Vergleich öffnen und Szenarien lokal speichern

Die Berechnung bleibt eine proportionale Kapazitätsschätzung aus aktuellen Host- und VM-Werten. Sie ist keine DRS-Simulation und bewertet weder Affinity-/Anti-Affinity-Regeln noch Netzwerk-, Datastore-, Lizenz- oder EVC-Kompatibilität.

## Tab „Infrastruktur“

Der Tab konzentriert die vorhandenen Clusterinformationen aus Compliance/Lifecycle:

- CPU-Modelle und CPU-Mix je Cluster
- Host-Inventar mit ESXi-Version, Build, Hersteller und Modell
- HBA-/NIC-Treiberinventar

Die Seite darf Unterschiede und auffällige Mischungen sichtbar machen. CPU-Generationen benötigen eine separate, gepflegte Zuordnungstabelle; eine Hersteller- oder VMware-Kompatibilitätsaussage ist ohne externen Referenzkatalog nicht zulässig.

## Daten- und Identitätsregeln

Alle neuen und überführten Berechnungen verwenden einen **vCenter-sicheren Cluster-Schlüssel**. Der bisherige Name allein reicht nicht aus, weil mehrere ausgewählte vCenter gleichnamige Cluster enthalten können.

Als Schlüssel wird mindestens `vcenterId + clusterName` verwendet. Wo Datacenter in den Rohdaten verfügbar ist, wird es für die Zuordnung zusätzlich berücksichtigt. Rohzeilen ohne `vcenterId` werden über ihre `snapshotId` dem vCenter zugeordnet. Diese Regel gilt insbesondere für:

- Cluster-, VM-, Host- und Datastore-Joins
- vHost-Aggregationen und Risikoscore
- OS-Verteilung, CPU-Mix und Treiberinventar
- Cluster-Dialog, What-if-Planung und Wartungszuweisungen

Die bestehende, nur namensbasierte Gruppierung wird nicht unverändert wiederverwendet. Vor der Übernahme wird sie auf den eindeutigen Schlüssel umgestellt und mit Fällen gleicher Clusternamen in unterschiedlichen vCentern getestet.

## Grenzen und Nicht-Ziele

- Keine Snapshot-Historie oder Zeitreihen; ein neuer Export ersetzt den alten Export desselben vCenters.
- Keine automatische Freigabe zur Cluster-Konsolidierung. Später mögliche Konsolidierungskandidaten sind nur Hinweise und benötigen u. a. Prüfung von DRS-Regeln, EVC, Netzwerk, Datastores, Lizenzen und Applikationsvorgaben.
- „Alte Betriebssysteme“ wird zunächst nicht als Support-Aussage bewertet. Zulässig sind Verteilung, seltene OS-Labels und regelbasierte Kandidaten, sobald ein gepflegter OS-Katalog beschlossen ist.
- Keine zusätzlichen Backend- oder Serverabhängigkeiten; Persistenz bleibt lokal im Browser.

## Umsetzung und Qualität

1. Route, Sidebar-Eintrag und Cluster-Seitengerüst mit Tabs erstellen.
2. Eindeutige Clusteridentität als gemeinsame, getestete Domänenhilfe einführen und die übernommenen Aggregationen darauf umstellen.
3. Übersicht mit KPI-Leiste, den drei Visualisierungen, zentraler Tabelle, OS-Tabelle und Detaildialog umsetzen.
4. Capacity-, Wartungs-, Planungs- und Infrastrukturbereiche in wiederverwendbare Panel-Komponenten extrahieren und in die jeweiligen Tabs einhängen; alte Routen weiterleiten bzw. nicht-clusterbezogene Restseiten bereinigen.
5. Unit-Tests für Schlüsselbildung, Aggregationen und neue Kennzahlen ergänzen; betroffene Seiten-Tests anpassen.
6. `npm run test`, `npm run lint` und `npm run build` ausführen.

## Abnahmekriterien

- Die globale Filterleiste begrenzt alle Cluster-Tabs konsistent auf die gewählten vCenter, Cluster und Suchbegriffe.
- Gleichnamige Cluster unterschiedlicher vCenter werden getrennt angezeigt, berechnet, exportiert und geplant.
- Die Übersicht zeigt alle vereinbarten KPIs, drei Visualisierungen, die Cluster-Tabelle und die OS-Tabelle.
- Die übernommenen Wartungs- und Planungsabläufe bleiben vollständig nutzbar; bisherige URLs führen dorthin weiter.
- Jede Tabelle im neuen Bereich lässt sich als Excel und Markdown exportieren; der Cluster-Steckbrief lässt sich als Markdown kopieren.
- Test, Lint und Production-Build laufen erfolgreich.
