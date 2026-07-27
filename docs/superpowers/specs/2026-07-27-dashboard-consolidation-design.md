# Design: Schlanke Analyse-Navigation durch Konsolidierung der VM- und Host-Sichten

**Datum:** 2026-07-27
**Status:** Entwurf zur Umsetzung

## Ziel

Die eigenständigen Seiten **Daily Ops**, **Performance** und **Compliance /
Lifecycle** werden entfernt. Ihre fachlich relevanten Inhalte bleiben erhalten,
werden aber bei dem Objekt platziert, zu dem sie gehören:

- VM-bezogene Arbeitsschritte in **VMs**,
- Host-Grundhygiene in **Hosts**,
- Release- und Patch-Analysen in **VMware Versions**,
- Multipath ausschließlich in **Storage / Backup**,
- Health-Events als zentrale Arbeitsliste im **Overview**.

Ziel ist eine kürzere Navigation ohne Informationsverlust. Alte URLs werden
bewusst nicht weitergeleitet und dürfen nach der Änderung auf die Not-Found-
Seite führen: Es gibt noch keine Nutzer oder Bookmarks, die geschützt werden
müssen.

## Ziel-Informationsarchitektur

| Zielseite | Bereich | Übernommene Inhalte |
|---|---|---|
| Overview | Health Events | KPI bleibt bestehen; zusätzlich Health-Typen und vollständige Health-Event-Liste als kompakte Arbeitsliste |
| VMs | Inventar | Bestehende VM-KPIs und VM-Inventar |
| VMs | Betrieb | Consolidation Needed, getrennte VMs, Tools Issues, verbundene CD/USB-Medien, Config-Issues, Snapshots und VMTools-Wellenplanung |
| VMs | Performance | CPU Ready, Memory Pressure, Entitlement Gaps, FT-Latenz, VM-Netzanomalien und Latency-Sensitivity-Sonderfälle |
| VMs | Compliance | Secure Boot, Firmware, CBT, OS Drift, UUID, Annotation, VM-HW-Versionen und HW-Upgrade-Backlog |
| Hosts | Host-Hygiene | NTP/DNS/DHCP-Auffälligkeiten |
| Hosts | Release-Stand | Bestehende ESXi-Release-Tabelle |
| VMware Versions | Plattform-Releases | vCenter-Version-Inventar sowie vCenter-/ESXi-Release-Nutzung und -Abdeckung |
| Storage / Backup | Multipath | Unverändert einzige Quelle für Multipath Issues und Dead Paths |

`VMs` erhält nach der KPI-Leiste Tabs **Inventar**, **Betrieb**,
**Performance** und **Compliance**. Der Standard-Tab ist Inventar. Die Tabs
werden nicht über die URL gespeichert; sie strukturieren ausschließlich die
aktuelle Sitzung.

## Inhaltliche Regeln

### Daily Ops

Folgende Kennzahlen und Tabellen werden in den VM-Tab **Betrieb** übernommen:

- Consolidation Needed, disconnected VMs, Tools Issues und verbundene CD/USB-
  Medien als KPI-Leiste.
- VMs mit Konfigurationsproblemen und offene Snapshots als `VirtualTable`.
- Bestehende VMTools-Wellenplanung bleibt unterhalb der Betriebslisten.

Die Power-State-Verteilung wird entfernt. Sie ist durch die bestehenden
Powered-On-/Powered-Off-KPIs auf Overview und VMs abgedeckt.

Health Events werden nicht im VM-Tab dupliziert: Overview zeigt die
Typverteilung und die vollständige Eventliste, weil Events auch Hosts und
Cluster betreffen können.

### Performance

Der VM-Tab **Performance** enthält sowohl die bisherigen Detailtabellen als
auch die bisher nur auf der eigenständigen Seite sichtbaren Zusammenfassungen:

- KPI-Leiste für CPU Ready Hotspots, Memory Pressure, Entitlement Gaps, FT
  VMs und VM-Netzanomalien.
- Top-15-CPU-Ready-Balkendiagramm.
- Tabellen für CPU Ready, Memory Pressure, Entitlement Gaps,
  VM-Netzanomalien und **FT-Latenz**. Die FT-Tabelle muss ergänzt werden,
  weil sie bisher nur auf der eigenständigen Seite gerendert wird.
- Tabelle oder hervorgehobene Liste für VMs mit nicht normaler
  Latency-Sensitivity.

`Multipath Issues` wird aus dieser Sicht entfernt. Die identische, aber
ausführlichere Auswertung mit KPI, Dead-Path-Aggregation und Detailtabelle
bleibt auf Storage / Backup.

### Compliance / Lifecycle

Der VM-Tab **Compliance** übernimmt die Compliance-KPI-Leiste, die
VM-Compliance-Tabelle, die HW-Version-Verteilung und den HW-Upgrade-Backlog.
Die Tools-Upgrade-Zahl wird im Betriebskontext zusammen mit der vorhandenen
Wellenplanung geführt.

Die Host-Hygiene (NTP, NTPD, DNS, DHCP) wird als eigener Abschnitt auf Hosts
eingehängt. Ein Klick auf eine Host-Zeile nutzt weiterhin die vorhandene
Host-Detailansicht, soweit die Tabelle sie bereits unterstützt.

VMware Versions wird eine vollständige eigenständige Seite: Sie erhält einen
PageHeader, die bestehende Release-Abdeckung und zusätzlich den bisherigen
vCenter-Versionsstand (Name, Fullname, Version, Build, API-Version). Die
ESXi-Version/Build-Tortengrafik aus Compliance wird nicht übernommen; der
Host-Inventar- und Release-Stand liefert dieselbe fachliche Aussage besser
durchsuchbar und mit Drill-down.

## Komponentengrenzen

Seiten importieren keine anderen Seiten. Die bisher aus Seiten exportierten
Detailansichten werden in neutrale Komponenten überführt:

- `src/components/dashboard/HealthEventsPanel.tsx`
- `src/components/vm/VmOperationsPanel.tsx`
- `src/components/vm/VmPerformancePanel.tsx`
- `src/components/vm/VmComplianceLifecyclePanel.tsx`
- `src/components/hosts/HostHygienePanel.tsx`
- bei Bedarf `src/components/vmware-versions/VCenterVersionInventory.tsx`

Die Komponenten verwenden weiter die bestehenden Hooks (`useVms`, `useHosts`,
`useRawSheet`, `useHealthEvents`, `useVmSnapshots`) sowie den globalen Filter.
Es gibt keine Änderungen am Domänenmodell, IndexedDB-Schema oder Import.

## Navigation und Routing

- Entfernen: Lazy-Imports und Routen `/daily-ops`, `/performance` und
  `/compliance`.
- Entfernen: die drei entsprechenden Sidebar-Einträge und nicht mehr genutzte
  Glossar-Einträge.
- Erhalten und direkt rendern: `/vmware-versions` mit einer Default-Page aus
  `src/pages/VmwareVersions.tsx`.
- Hinzufügen: Sidebar-Eintrag **VMware Versions**, damit die vormals im
  Compliance-Tab sichtbare Release-Analyse weiterhin auffindbar ist.

## Nicht-Ziele

- Keine URL-Weiterleitungen oder Kompatibilität für alte Bookmarks.
- Keine neuen Datenquellen, Schwellenwerte oder automatischen Maßnahmen.
- Keine Änderung der globalen Filtersemantik.
- Keine Übernahme von Multipath in VMs oder Performance.
- Keine Re-Integration der bereits in den Cluster-Arbeitsbereich verschobenen
  Infrastruktur-Inhalte.

## Abnahmekriterien

- Daily Ops, Performance und Compliance / Lifecycle erscheinen weder in
  Sidebar noch Routing; ihre drei Seitendateien existieren nicht mehr.
- Alle in der Tabelle „Ziel-Informationsarchitektur“ genannten Inhalte sind
  auf ihrer Zielseite sichtbar und verwenden den globalen Filter.
- Der Performance-Tab zeigt zusätzlich zur bisherigen VM-Detailansicht die
  FT-Latenz-Tabelle und den CPU-Ready-Chart.
- Overview zeigt Health-Typen und Health-Events; VMs zeigt diese Daten nicht
  ein zweites Mal.
- Hosts zeigt NTP/DNS/DHCP-Auffälligkeiten; VMware Versions zeigt vCenter-
  Versionen und Release-Abdeckung.
- Multipath wird nur auf Storage / Backup dargestellt.
- `npm run test`, `npm run lint` und `npm run build` laufen erfolgreich.
