# Dashboard-Konsolidierung – Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-27-dashboard-consolidation-design.md`

**Ziel:** Daily Ops, Performance und Compliance / Lifecycle als eigenständige
Seiten entfernen und ihre relevanten Inhalte in Overview, VMs, Hosts und
VMware Versions integrieren.

**Rahmen:** Maximal vier Tasks. Keine URL-Weiterleitungen und keine
Persistenz-/Importänderungen.

## Task 1: VM- und Overview-Panels aus den drei Seiten extrahieren

**Dateien:**

- Create: `src/components/dashboard/HealthEventsPanel.tsx`
- Create: `src/components/vm/VmOperationsPanel.tsx`
- Create: `src/components/vm/VmPerformancePanel.tsx`
- Create: `src/components/vm/VmComplianceLifecyclePanel.tsx`
- Modify: `src/pages/Overview.tsx`
- Modify: `src/pages/Vms.tsx`
- Test: neue komponentennahe Tests unter `src/components/dashboard/` und
  `src/components/vm/`

- [ ] Health-Typen-Chart und Health-Event-Tabelle aus Daily Ops als
  `HealthEventsPanel` extrahieren und auf Overview unter der KPI-Leiste
  einhängen.
- [ ] `VmOperationsPanel` erstellen: Consolidation, Disconnected, Tools
  Issues und CD/USB als KPIs; Config-Issues- und Snapshot-Tabellen sowie
  `VmToolsWavePlan` übernehmen. Power-State-Chart nicht übernehmen.
- [ ] `VmPerformancePanel` erstellen: Performance-KPIs, Top-CPU-Ready-Chart,
  CPU-Ready-, Memory-, Entitlement-, VM-Netz- und FT-Latenz-Tabellen sowie
  Latency-Sensitivity-Sonderfälle. Multipath nicht übernehmen.
- [ ] `VmComplianceLifecyclePanel` erstellen: Compliance-KPIs,
  VM-Compliance-Tabelle, HW-Version-Chart und HW-Upgrade-Backlog.
- [ ] `Vms.tsx` auf vier Tabs umstellen und die Panels einhängen. Der
  Inventar-Tab enthält die bestehende Inventartabelle; die anderen drei Tabs
  enthalten jeweils genau einen neuen Panel.
- [ ] Tests schreiben, die mindestens FT-Latenz im Performance-Panel,
  Snapshot/Config in Betrieb und HW-Upgrade-Backlog in Compliance absichern.

**Erfolg:** VMs und Overview enthalten alle VM-/Health-Inhalte ohne Imports
aus `src/pages/DailyOps.tsx`, `PerformancePage.tsx` oder
`ComplianceLifecycle.tsx`.

## Task 2: Host-Hygiene und VMware Versions vervollständigen

**Dateien:**

- Create: `src/components/hosts/HostHygienePanel.tsx`
- Create: optional `src/components/vmware-versions/VCenterVersionInventory.tsx`
- Modify: `src/pages/Hosts.tsx`
- Modify: `src/pages/VmwareVersions.tsx`
- Test: `src/components/hosts/HostHygienePanel.test.tsx`,
  `src/pages/VmwareVersions.test.tsx`

- [ ] NTP-/NTPD-/DNS-/DHCP-Prüfung aus Compliance in `HostHygienePanel`
  überführen; KPI und Tabelle auf Hosts zwischen Inventar und
  ESXi-Release-Tabelle platzieren.
- [ ] `VmwareVersions.tsx` um eine Default-Page mit `PageHeader`, Empty- und
  Loading-State ergänzen.
- [ ] Den bisherigen vCenter-Versionsstand (Name, Fullname, Version, Build,
  API-Version) in diese Seite übernehmen; die Release-Nutzungs-KPIs, Charts
  und Tabellen bleiben erhalten.
- [ ] Tests für Host-Hygiene sowie vCenter-Inventory/Release-Seite ergänzen.

**Erfolg:** Kein Compliance-Inhalt bleibt außerhalb von VMs, Hosts oder
VMware Versions; die ESXi-Build-Tortengrafik wird nicht ersetzt.

## Task 3: Alte Seiten, Navigation und Routing entfernen

**Dateien:**

- Delete: `src/pages/DailyOps.tsx`
- Delete: `src/pages/PerformancePage.tsx`
- Delete: `src/pages/ComplianceLifecycle.tsx`
- Delete/Replace: zugehörige Seitentests
- Modify: `src/App.tsx`
- Modify: `src/app/layout/AppSidebar.tsx`
- Modify: `src/lib/glossary.ts` und betroffene Glossar-Module
- Modify: `src/pages/Vms.test.tsx`

- [ ] Alle verbleibenden Importe der drei Seitendateien mit `rg` ermitteln
  und auf die neuen Komponenten umstellen.
- [ ] Lazy-Imports und Routen für `/daily-ops`, `/performance` und
  `/compliance` löschen.
- [ ] `/vmware-versions` direkt auf die neue Default-Page routen.
- [ ] Die drei Sidebar-Einträge entfernen und **VMware Versions** ergänzen.
- [ ] Nicht mehr referenzierte Daily-Ops-, Performance- und Compliance-
  Glossar-Einträge entfernen oder in die neuen Komponenten-Glossare
  überführen; fachliche Tooltip-Texte bleiben erhalten.
- [ ] Die drei Seitendateien und überholte Seitentests löschen; Tests auf
  Komponenten- und Zielseiten umstellen.

**Erfolg:** Die drei Seiten sind physisch entfernt, der Build enthält keine
Route und keine Navigation zu ihnen, und keine Seite importiert eine andere
Seite als Wiederverwendungsmechanismus.

## Task 4: Dokumentation bereinigen und vollständig verifizieren

**Dateien:**

- Modify: `README.md`
- Modify: eventuell betroffene Onboarding-/Hilfetexte mit den entfernten
  Seitennamen
- Modify: diese Plan-Datei (Checkboxen/Ergebnis dokumentieren)

- [ ] README-Fragen, Dashboard-Tabelle und Bedienhinweise auf die neue
  Informationsarchitektur umstellen; die drei entfernten Routen streichen.
- [ ] Veraltete Nutzertexte mit Daily Ops, Performance oder Compliance /
  Lifecycle als eigenständige Navigation entfernen oder auf VMs, Hosts und
  VMware Versions umformulieren.
- [ ] `npm run test` ausführen.
- [ ] `npm run lint` ausführen.
- [ ] `npm run build` ausführen.
- [ ] Manuell prüfen: Overview-Health, alle vier VM-Tabs, Host-Hygiene,
  VMware Versions, Storage-Multipath sowie fehlende Sidebar-Einträge.

**Erfolg:** Dokumentation stimmt mit der Navigation überein; Test, Lint und
Production-Build sind grün.

## Abschlussprüfung

- [ ] Alle Abnahmekriterien der Spec einmal gegen die fertige Anwendung
  prüfen.
- [ ] `rg -n 'DailyOps|PerformancePage|ComplianceLifecycle|daily-ops|/performance|/compliance' src README.md` ausführen
  und ausschließlich bewusst historische oder dokumentierte Treffer bewerten.
- [ ] Änderungen als einen zusammenhängenden Konsolidierungs-Commit abgeben.

## Umsetzungsergebnis

- [x] VM-/Overview-Inhalte in neutrale Komponenten extrahiert und VMs auf die Tabs Inventar, Betrieb, Performance und Compliance umgestellt.
- [x] Health-Events auf Overview, Host-Hygiene auf Hosts sowie vCenter-Inventar und Release-Abdeckung auf VMware Versions integriert.
- [x] Alte Seiten, Routen und Sidebar-Einträge entfernt; Multipath bleibt ausschließlich unter Storage / Backup.
- [x] `npm run test` (99 Testdateien, 698 Tests), `npm run lint`, `npm run typecheck` und `npm run build` erfolgreich ausgeführt.
