# Cluster-Arbeitsbereich Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen vCenter-sicheren Cluster-Arbeitsbereich mit Übersicht, Kapazität, Wartung, Planung und Infrastruktur schaffen und bestehende Clusterfunktionen dorthin überführen.

**Architecture:** Zuerst wird eine gemeinsame Clusteridentität eingeführt, damit gleichnamige Cluster verschiedener vCenter in keiner Auswertung vermischt werden. Reine Datenaufbereitung bleibt in kleinen Funktionen unter `src/lib` bzw. `src/domain/services`; die neue Seite setzt diese Ergebnisse mit vorhandenen shadcn-, Recharts- und VirtualTable-Bausteinen zusammen. Bestehende Wartungs- und Planungsseiten werden als wiederverwendbare Tab-Inhalte extrahiert und über Weiterleitungen kompatibel gehalten.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query/Table, Recharts, Tailwind CSS, shadcn/ui, Vitest.

---

## Reihenfolge und unabhängige Lieferpakete

Das Vorhaben enthält mehrere eigenständige Bereiche. Es wird deshalb in fünf testbare Lieferpakete zerlegt und jeweils erst nach erfolgreicher Prüfung fortgesetzt:

1. vCenter-sichere Clusteridentität und reine Kennzahlen.
2. Neue Clusterroute mit Übersicht, Tabellen, Export und Detaildialog.
3. Übernahme der clusterbezogenen Capacity- und Licensing-Bereiche.
4. Übernahme von Wartung und Planung mit kompatiblen Alt-URLs.
5. Übernahme der Infrastrukturansicht, Bereinigung der Quellseiten und Gesamttest.

## Zieldateien

| Datei | Verantwortung |
|---|---|
| `src/lib/clusterIdentity.ts` | Eindeutiger Schlüssel und Vergleiche für Cluster, vCenter und Datacenter |
| `src/lib/clusterWorkspace.ts` | Reine Builder für Clusterübersicht, KPIs, Dichte und Charts |
| `src/lib/vmOsDistribution.ts` | OS-Verteilung mit vCenter-sicherer Clusterkennung |
| `src/domain/services/clusterCapacityEngine.ts` | vCenter-sichere vHost-Aggregation und Risikokennzahlen |
| `src/components/cluster/ClusterOverviewPanel.tsx` | KPI-Leiste, Charts, Cluster- und OS-Tabelle |
| `src/components/cluster/ClusterCapacityPanel.tsx` | Übernommene Capacity- und Density-Bereiche |
| `src/components/cluster/ClusterInfrastructurePanel.tsx` | CPU-, ESXi- und Treiberinventar pro Cluster |
| `src/components/cluster/ClusterDetailDialog.tsx` | Eindeutig ausgewählter, exportierbarer Cluster-Steckbrief |
| `src/components/cluster/ClusterMaintenancePanel.tsx` | Wiederverwendbarer Inhalt der Wartungsankündigung |
| `src/components/cluster/ClusterPlanningPanel.tsx` | Wiederverwendbarer Inhalt der Planung |
| `src/pages/Clusters.tsx` | Route, Scope, Tabs und Zusammenbau aller Cluster-Panels |
| `src/pages/Wartungsankuendigung.tsx`, `src/pages/Planning.tsx` | Kompatible Redirect-Wrapper oder entfernte Duplikate |
| `src/pages/Overview.tsx`, `src/pages/Capacity.tsx`, `src/pages/Licensing.tsx`, `src/pages/ComplianceLifecycle.tsx` | Nur die in der Spec festgelegten Clusterbereiche herauslösen |
| `src/App.tsx`, `src/app/layout/AppSidebar.tsx` | Route, Redirects und Navigation |
| `src/test/clusterIdentity.test.ts`, `src/test/clusterWorkspace.test.ts` | Reine Daten- und Identitätsregeln |
| `src/pages/Clusters.test.tsx` | Route, Scope, Tabs und zentrale Tabelle |

### Task 1: Eindeutige Clusteridentität als getestete Domänenhilfe

**Files:**
- Create: `src/lib/clusterIdentity.ts`
- Create: `src/test/clusterIdentity.test.ts`
- Modify: `src/domain/services/importService.ts`
- Modify: `src/domain/services/clusterCapacityEngine.ts`
- Modify: `src/test/clusterCapacityEngine.test.ts`

- [ ] **Step 1: Schreibende Tests für identische Clusternamen in zwei vCentern anlegen.**

  ```ts
  import { describe, expect, it } from "vitest";
  import { clusterScopeKey, isSameCluster } from "@/lib/clusterIdentity";

  describe("clusterIdentity", () => {
    it("trennt gleichnamige Cluster verschiedener vCenter", () => {
      expect(clusterScopeKey("vc-a", "DC1", "Production")).not.toBe(
        clusterScopeKey("vc-b", "DC1", "Production"),
      );
      expect(isSameCluster(
        { vcenterId: "vc-a", datacenter: "DC1", clusterName: "Production" },
        { vcenterId: "vc-b", datacenter: "DC1", clusterName: "Production" },
      )).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Test ausführen und das erwartete Fehlschlagen bestätigen.**

  Run: `npm run test -- src/test/clusterIdentity.test.ts`  
  Expected: FAIL, weil `@/lib/clusterIdentity` noch nicht existiert.

- [ ] **Step 3: Minimalen Identitätshelfer implementieren.**

  ```ts
  export interface ClusterIdentity {
    vcenterId: string;
    datacenter: string | null | undefined;
    clusterName: string | null | undefined;
  }

  const normalized = (value: string | null | undefined) => (value ?? "").trim();

  export function clusterScopeKey(vcenterId: string, datacenter: string | null | undefined, clusterName: string | null | undefined): string {
    return `${normalized(vcenterId)}\u0000${normalized(datacenter)}\u0000${normalized(clusterName)}`;
  }

  export function isSameCluster(left: ClusterIdentity, right: ClusterIdentity): boolean {
    return clusterScopeKey(left.vcenterId, left.datacenter, left.clusterName)
      === clusterScopeKey(right.vcenterId, right.datacenter, right.clusterName);
  }
  ```

- [ ] **Step 4: Den kanonischen Schlüssel beim Normalisieren erzeugen.**

  Importiere `clusterScopeKey` in `src/domain/services/importService.ts` und ersetze die bisherige Schlüsselbildung der Cluster durch:

  ```ts
  const datacenter = toStr(row["Datacenter"]);
  return {
    // übrige Felder unverändert
    datacenter,
    clusterKey: clusterScopeKey(vcenterId, datacenter, name),
  };
  ```

  Dadurch ist `NormalizedCluster.clusterKey` der kanonische Schlüssel für neue Imports und für `ScenarioGroup.targetClusterKey`. Bestehende, lokal gespeicherte Szenarien mit dem alten Wert `${name}::${vcenterId}` werden beim Laden einmalig auf den passenden aktuellen `NormalizedCluster.clusterKey` abgebildet; existiert keine eindeutige Zuordnung, zeigt die Planung die vorhandene Warnung für verwaiste Ziele.

- [ ] **Step 5: vHost-Aggregation auf einen Schlüssel statt auf den Namen allein umstellen.**

  `aggregateCluster` und `groupVHostRowsByCluster` erhalten einen `ClusterIdentity`-Parameter bzw. eine `snapshotId → vcenterId`-Zuordnung. Eine Rohzeile darf nur aggregiert werden, wenn vCenter, Datacenter und Clustername übereinstimmen. Der Rückgabewert von `groupVHostRowsByCluster` verwendet `clusterScopeKey`.

  Ergänze den bestehenden Engine-Test um zwei `vHost`-Zeilen mit `Cluster: "A"`, aber unterschiedlichen `snapshotId`-Werten; die Aggregation für `vc-1` muss exakt eine Host-Zeile liefern.

- [ ] **Step 6: Fokustests ausführen.**

  Run: `npm run test -- src/test/clusterIdentity.test.ts src/test/clusterCapacityEngine.test.ts`  
  Expected: PASS.

- [ ] **Step 7: Commit erstellen.**

  ```powershell
  git add src/lib/clusterIdentity.ts src/test/clusterIdentity.test.ts src/domain/services/clusterCapacityEngine.ts src/test/clusterCapacityEngine.test.ts
  git commit -m "feat: use vcenter-safe cluster identities"
  ```

### Task 2: OS- und Capacity-Daten auf die neue Identität umstellen

**Files:**
- Modify: `src/lib/vmOsDistribution.ts`
- Modify: `src/test/vmOsDistribution.test.ts`
- Modify: `src/domain/services/planningHelpers.ts`
- Modify: `src/test/scenarioPersistence.test.ts`

- [ ] **Step 1: Einen fehlschlagenden OS-Verteilungstest für gleichnamige Cluster ergänzen.**

  ```ts
  it("trennt Betriebssysteme gleichnamiger Cluster nach vCenter", () => {
    const rows = buildClusterOsDistributionRows([
      makeVm({ vcenterId: "vc-a", cluster: "Production", osTools: "Windows Server 2022" }),
      makeVm({ vcenterId: "vc-b", cluster: "Production", osTools: "Ubuntu Linux" }),
    ], "tools");

    expect(rows.map((row) => [row.vcenterId, row.operatingSystem, row.vmCount])).toEqual([
      ["vc-a", "Windows Server 2022", 1],
      ["vc-b", "Ubuntu Linux", 1],
    ]);
  });
  ```

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/test/vmOsDistribution.test.ts`  
  Expected: FAIL, weil `ClusterOsDistributionRow` noch kein `vcenterId` enthält.

- [ ] **Step 3: OS-Zeile und Gruppierung erweitern.**

  `ClusterOsDistributionRow` erhält `vcenterId`, `datacenter` und `clusterKey`. Der Gruppierungsschlüssel entsteht mit `clusterScopeKey(vm.vcenterId, vm.datacenter, vm.cluster)`. Die Tabelle zeigt später zusätzlich die aufgelöste vCenter-Anzeige.

- [ ] **Step 4: What-if-Lookups auf denselben Schlüssel umstellen.**

  In `computeWhatIf` werden `clusterRefMap`, `rowsByCluster`, `affectedClusters` und Szenario-Ziele nicht länger per Clustername indiziert. `ScenarioGroup.targetClusterKey` enthält den bereits normalisierten `NormalizedCluster.clusterKey`; die Quellzuordnung wird über `clusterScopeKey(vm.vcenterId, vm.datacenter, vm.cluster)` ermittelt.

- [ ] **Step 5: Tests ausführen.**

  Run: `npm run test -- src/test/vmOsDistribution.test.ts src/test/clusterCapacityEngine.test.ts src/test/scenarioPersistence.test.ts`  
  Expected: PASS.

- [ ] **Step 6: Commit erstellen.**

  ```powershell
  git add src/lib/vmOsDistribution.ts src/test/vmOsDistribution.test.ts src/domain/services/planningHelpers.ts src/test/scenarioPersistence.test.ts
  git commit -m "fix: scope cluster calculations by vcenter"
  ```

### Task 3: Pure Builder für die Clusterübersicht entwickeln

**Files:**
- Create: `src/lib/clusterWorkspace.ts`
- Create: `src/test/clusterWorkspace.test.ts`

- [ ] **Step 1: Failing Test für eine vollständige Übersichtszeile schreiben.**

  ```ts
  it("builds a row with density, risk and maximum host load", () => {
    const [row] = buildClusterOverviewRows({ clusters, hosts, vms, rawVHostRows, snapshots });
    expect(row).toMatchObject({
      vcenterDisplayName: "vcsa-a",
      cluster: "Production",
      hosts: 2,
      runningVms: 10,
      avgVmsPerHost: 5,
      maxVmsPerHost: 7,
      maxVmsHost: "esx-02",
      haEnabled: true,
      drsEnabled: true,
    });
  });
  ```

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/test/clusterWorkspace.test.ts`  
  Expected: FAIL, weil `clusterWorkspace.ts` noch nicht existiert.

- [ ] **Step 3: Die öffentlichen Builder implementieren.**

  ```ts
  export interface ClusterOverviewRow {
    clusterKey: string;
    vcenterId: string;
    vcenterDisplayName: string;
    datacenter: string;
    cluster: string;
    haEnabled: boolean | null;
    drsEnabled: boolean | null;
    hosts: number;
    runningVms: number;
    avgVmsPerHost: number | null;
    maxVmsPerHost: number | null;
    maxVmsHost: string | null;
    vcpuPerCore: number;
    ramCommitPct: number;
    riskScore: number;
    risk: "hoch" | "mittel" | "niedrig";
  }

  export function buildClusterOverviewRows(input: ClusterWorkspaceInput): ClusterOverviewRow[];
  export function buildClusterOverviewKpis(rows: ClusterOverviewRow[]): ClusterOverviewKpis;
  export function buildClusterDensityChart(rows: ClusterOverviewRow[]): ClusterDensityPoint[];
  export function buildRiskChart(rows: ClusterOverviewRow[]): ClusterRiskPoint[];
  export function buildVmDistributionChart(rows: ClusterOverviewRow[]): VmDistributionPoint[];
  ```

  Die Builder verwenden `metricsFromAggregate` für Risiko, `powerState === "poweredOn"` für laufende VMs und die Spalte `# VMs` aus `vHost` für Maximum und Hostname. Fehlende Hostdaten liefern `null`, nie `NaN` oder erfundene Nullwerte.

- [ ] **Step 4: KPI- und Randfalltests ergänzen.**

  Prüfe: keine Cluster liefert `maxVmsPerHost: null`; deaktiviertes oder fehlendes HA/DRS wird in `haDrsIssues` gezählt; zwei gleichnamige Cluster erzeugen zwei Zeilen; ein Host ohne `# VMs` beeinflusst den Maximalwert nicht.

- [ ] **Step 5: Fokustest ausführen.**

  Run: `npm run test -- src/test/clusterWorkspace.test.ts`  
  Expected: PASS.

- [ ] **Step 6: Commit erstellen.**

  ```powershell
  git add src/lib/clusterWorkspace.ts src/test/clusterWorkspace.test.ts
  git commit -m "feat: add cluster workspace metrics"
  ```

### Task 4: Cluster-Detaildialog vCenter-sicher machen

**Files:**
- Modify: `src/components/cluster/ClusterDetailDialog.tsx`
- Modify: `src/lib/detailMarkdown.ts`
- Modify: `src/test/detailMarkdown.test.ts`

- [ ] **Step 1: Test für vCenter im Steckbrief schreiben.**

  Der Markdown-Test erwartet mindestens folgende Zeilen:

  ```ts
  expect(markdown).toContain("| vCenter | vcsa-a |");
  expect(markdown).toContain("Max. VMs/Host");
  expect(markdown).not.toContain("vcsa-b");
  ```

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/test/detailMarkdown.test.ts`  
  Expected: FAIL, weil das Markdown den vCenter noch nicht ausgibt.

- [ ] **Step 3: Dialog-API auf den eindeutigen Schlüssel umstellen.**

  `ClusterDetailDialogProps` erhält `clusterKey: string | null` statt `clusterName`. Alle `scopedClusters`, `scopedHosts`, `scopedVms`, `scopedDatastores` und `rawVHostRows` werden über die neue Identität gefiltert. Der Header zeigt `vCenter · Datacenter`; die Ressourcenkarte zeigt zusätzlich `Max. VMs/Host` mit Hostnamen.

- [ ] **Step 4: Markdown-Datenvertrag erweitern.**

  `buildClusterDetailMarkdown` erhält `vcenterDisplayName` und die maximale Hostdichte als explizite Daten. Die Ausgabe enthält beide Werte in der Übersicht und behält die bisherige Host-, Datastore- und VM-Tabelle bei.

- [ ] **Step 5: Test ausführen und committen.**

  Run: `npm run test -- src/test/detailMarkdown.test.ts`  
  Expected: PASS.

  ```powershell
  git add src/components/cluster/ClusterDetailDialog.tsx src/lib/detailMarkdown.ts src/test/detailMarkdown.test.ts
  git commit -m "feat: scope cluster details by vcenter"
  ```

### Task 5: Neue Clusterroute und Übersichtspanel erstellen

**Files:**
- Create: `src/components/cluster/ClusterOverviewPanel.tsx`
- Create: `src/pages/Clusters.tsx`
- Create: `src/pages/Clusters.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/layout/AppSidebar.tsx`

- [ ] **Step 1: Route- und Panel-Test schreiben.**

  ```tsx
  it("renders the filtered cluster overview and opens a detail row", async () => {
    render(<Clusters />);
    expect(await screen.findByRole("heading", { name: "Cluster" })).toBeInTheDocument();
    expect(screen.getByText("Clusterübersicht")).toBeInTheDocument();
    expect(screen.getByText("Betriebssysteme je Cluster")).toBeInTheDocument();
  });
  ```

  Die Testmocks liefern zwei vCenter und zwei gleichnamige Cluster; die erwartete Tabelle enthält zwei unterschiedliche vCenter-Zellen.

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: FAIL, weil `Clusters.tsx` nicht existiert.

- [ ] **Step 3: `ClusterOverviewPanel` implementieren.**

  Das Panel erhält `rows`, `osRows`, `onOpenCluster` und `search`. Es rendert:

  - `KpiGrid` mit den sechs spezifizierten KPIs;
  - einen Recharts-Scatter für die Dichtekarte;
  - einen horizontalen Recharts-BarChart für Risikoscores;
  - einen BarChart für Ø/Maximum VMs je Host;
  - `VirtualTable` für die zentrale Clusterübersicht und die OS-Verteilung.

  Beide Tabellen erhalten eindeutige Excel-Dateinamen `rvtools-cluster-uebersicht` und `rvtools-os-je-cluster`.

- [ ] **Step 4: `Clusters.tsx` implementieren.**

  Die Seite lädt `useActiveSnapshotIds`, `useVms`, `useClusters`, `useHosts`, `useDatastores` und `useRawSheet("vHost")`, baut aus `snapshots` eine `snapshotId → vcenterDisplayName`-Map und übergibt nur Daten des aktuellen globalen Scopes an die Builder. Clusterzeilen werden zusätzlich auf `filters.clusters` und `filters.search` gefiltert; die Suche prüft mindestens vCenter-Anzeige, Datacenter und Clustername. Sie verwendet `Tabs` mit den Werten `overview`, `capacity`, `maintenance`, `planning`, `infrastructure`; zunächst wird nur `overview` befüllt, die anderen Tabs zeigen keinen Platzhalter, sondern werden erst mit den folgenden Tasks eingebunden.

- [ ] **Step 5: Route und Navigation einhängen.**

  In `App.tsx` wird `Clusters` lazy geladen und als `{ path: "clusters", element: <Clusters /> }` registriert. In `AppSidebar.tsx` wird `{ title: "Cluster", url: "/clusters", icon: Server }` vor Capacity ergänzt.

- [ ] **Step 6: Test, Lint und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: PASS.

  Run: `npm run lint`  
  Expected: Exit code 0.

  ```powershell
  git add src/components/cluster/ClusterOverviewPanel.tsx src/pages/Clusters.tsx src/pages/Clusters.test.tsx src/App.tsx src/app/layout/AppSidebar.tsx
  git commit -m "feat: add cluster overview workspace"
  ```

### Task 6: Overview von den übernommenen Clusterbereichen bereinigen

**Files:**
- Modify: `src/pages/Overview.tsx`
- Modify: `src/pages/Overview.test.tsx`

- [ ] **Step 1: Regressionstest für die neue Zuständigkeit schreiben.**

  Der Overview-Test bestätigt, dass die Überschrift „Betriebssysteme je Cluster“ und die Host-Verteilungsüberschrift nicht mehr gerendert werden, während VM-KPIs und VM-Tabelle weiter vorhanden sind.

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Overview.test.tsx`  
  Expected: FAIL, weil die Bereiche noch in Overview liegen.

- [ ] **Step 3: Nur die Clusterbereiche entfernen.**

  Entferne `buildClusterOsDistributionRows`, `buildHostClusterDistribution`, die OS-Quellenumschaltung und die zugehörigen Charts/Tabellen aus `Overview.tsx`. Behalte die allgemeine VM-, Datastore-, Health- und Average-VM-Funktion unverändert.

- [ ] **Step 4: Test und Commit ausführen.**

  Run: `npm run test -- src/pages/Overview.test.tsx src/pages/Clusters.test.tsx`  
  Expected: PASS.

  ```powershell
  git add src/pages/Overview.tsx src/pages/Overview.test.tsx
  git commit -m "refactor: move cluster overview content"
  ```

### Task 7: Capacity- und Licensing-Bereiche als Cluster-Tab übernehmen

**Files:**
- Create: `src/components/cluster/ClusterCapacityPanel.tsx`
- Modify: `src/pages/Clusters.tsx`
- Modify: `src/pages/Capacity.tsx`
- Modify: `src/pages/Licensing.tsx`
- Modify: `src/pages/Clusters.test.tsx`

- [ ] **Step 1: Tab-Test schreiben.**

  ```tsx
  await user.click(screen.getByRole("tab", { name: "Kapazität" }));
  expect(screen.getByText("Cluster Capacity Health")).toBeInTheDocument();
  expect(screen.getByText("Cluster Overcommit")).toBeInTheDocument();
  expect(screen.getByText("Host Dichte")).toBeInTheDocument();
  ```

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: FAIL, weil der Kapazitätstab noch leer ist.

- [ ] **Step 3: `ClusterCapacityPanel` aus bestehenden kleineren Teilkomponenten zusammensetzen.**

  Extrahiere aus `Capacity.tsx` nur die vier clusterbezogenen Darstellungen: Health-Tabelle, Overcommit-Tabelle, Risikoscore und Host-Dichte. Ergänze die Cluster-Dichte-Tabelle aus `Licensing.tsx`. Alle Props sind fertig berechnete, vCenter-sichere Zeilen; das Panel liest keine IndexedDB-Daten direkt.

- [ ] **Step 4: Quellseiten auf Restverantwortung reduzieren.**

  `Capacity.tsx` behält Datastore-Headroom, Resource-Pools und Thin-Provisioning. `Licensing.tsx` behält Lizenz- und VM-spezifische Themen. Entferne jeweils nur die in den Cluster-Tab überführten Komponenten, Imports und Kennzahlen.

- [ ] **Step 5: Tests, Lint und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx src/test/clusterCapacityEngine.test.ts`  
  Expected: PASS.

  Run: `npm run lint`  
  Expected: Exit code 0.

  ```powershell
  git add src/components/cluster/ClusterCapacityPanel.tsx src/pages/Clusters.tsx src/pages/Capacity.tsx src/pages/Licensing.tsx src/pages/Clusters.test.tsx
  git commit -m "feat: move cluster capacity analysis to workspace"
  ```

### Task 8: Wartungsankündigung in einen Cluster-Tab extrahieren

**Files:**
- Create: `src/components/cluster/ClusterMaintenancePanel.tsx`
- Modify: `src/pages/Wartungsankuendigung.tsx`
- Modify: `src/pages/Clusters.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Clusters.test.tsx`

- [ ] **Step 1: Tab- und Alt-URL-Test schreiben.**

  Der Tab-Test klickt auf „Wartung“ und erwartet „Cluster-Zuweisungen“ sowie die Aktion „Mail erstellen“. Ein Router-Test öffnet `/wartungsankuendigung` und erwartet anschließend `/clusters?tab=maintenance`.

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: FAIL, weil Wartung noch eine eigenständige Seite ist.

- [ ] **Step 3: Wiederverwendbares Wartungspanel extrahieren.**

  Verschiebe den Inhalt von `Wartungsankuendigung` ohne `PageHeader` und Empty-State in `ClusterMaintenancePanel`. Die Komponente behält `useMaintenanceAssignments`, lokale Bearbeitung, Tech-Info-Kontaktvorschläge, Auswahl, Mail-Dialog und Speicherung unverändert bei. `Clusters.tsx` rendert das Panel im Wert `maintenance`.

- [ ] **Step 4: Alte Route kompatibel weiterleiten.**

  `Wartungsankuendigung.tsx` exportiert nur noch `<Navigate to="/clusters?tab=maintenance" replace />`. Die Route bleibt in `App.tsx` bestehen, damit gespeicherte Links funktionieren.

- [ ] **Step 5: Test und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: PASS.

  ```powershell
  git add src/components/cluster/ClusterMaintenancePanel.tsx src/pages/Wartungsankuendigung.tsx src/pages/Clusters.tsx src/App.tsx src/pages/Clusters.test.tsx
  git commit -m "feat: move maintenance announcements to clusters"
  ```

### Task 9: Planung in einen Cluster-Tab extrahieren

**Files:**
- Create: `src/components/cluster/ClusterPlanningPanel.tsx`
- Modify: `src/pages/Planning.tsx`
- Modify: `src/pages/Clusters.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Clusters.test.tsx`

- [ ] **Step 1: Tab- und Weiterleitungstest schreiben.**

  Der Tab-Test klickt „Planung“ und erwartet die Szenarioverwaltung sowie den Button „What-If“. Ein Router-Test erwartet für `/planning` die Weiterleitung nach `/clusters?tab=planning`.

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: FAIL, weil Planung noch nicht im Tab liegt.

- [ ] **Step 3: Planungsinhalt extrahieren und die Zielcluster-ID prüfen.**

  Verschiebe die bestehende Planungsoberfläche ohne `PageHeader` und Empty-State nach `ClusterPlanningPanel`. Der Zielcluster-Select verwendet `cluster.clusterKey` als `SelectItem.value`; die Beschriftung zeigt `vCenter · Datacenter · Cluster`. So bleiben What-if-Szenarien eindeutig, wenn Namen mehrfach vorkommen.

- [ ] **Step 4: Alte Seite als Redirect belassen.**

  `Planning.tsx` wird `<Navigate to="/clusters?tab=planning" replace />`; die bisherige Route bleibt registriert.

- [ ] **Step 5: Test und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx src/test/scenarioPersistence.test.ts src/test/clusterCapacityEngine.test.ts`  
  Expected: PASS.

  ```powershell
  git add src/components/cluster/ClusterPlanningPanel.tsx src/pages/Planning.tsx src/pages/Clusters.tsx src/App.tsx src/pages/Clusters.test.tsx src/domain/services/planningHelpers.ts
  git commit -m "feat: move migration planning to clusters"
  ```

### Task 10: Infrastrukturansicht als Cluster-Tab extrahieren

**Files:**
- Create: `src/components/cluster/ClusterInfrastructurePanel.tsx`
- Modify: `src/pages/Clusters.tsx`
- Modify: `src/pages/ComplianceLifecycle.tsx`
- Modify: `src/pages/ComplianceLifecycle.test.tsx`
- Modify: `src/pages/Clusters.test.tsx`

- [ ] **Step 1: Panel-Test schreiben.**

  Der Test öffnet „Infrastruktur“ und erwartet die Bereiche „CPU-Generationen Mix je Cluster“, „Host Inventar“ und „HBA/NIC Treiberinventar“. Bei zwei vCentern mit gleichem Clusternamen darf keine CPU- oder Treiberzeile verschwinden oder zusammengeführt werden.

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx src/pages/ComplianceLifecycle.test.tsx`  
  Expected: FAIL, weil die Bereiche noch in Compliance liegen.

- [ ] **Step 3: Reine Infrastruktur-Datenaufbereitung kapseln.**

  `ClusterInfrastructurePanel` erhält Hosts, Cluster, `vHBA`- und `vNIC`-Rohzeilen sowie den globalen Suchtext. CPU-Mix, Hostinventar und Treiberzeilen werden mit dem gemeinsamen Cluster-Schlüssel aufgebaut. Zeige nur Daten des aktuellen vCenter-/Cluster-Scopes.

- [ ] **Step 4: Compliance/Lifecycle bereinigen.**

  Entferne dort ausschließlich den CPU-Mix, Hostinventar und Treiberinventar. VM-Compliance, Tools-Wellen, Hardware-Upgrades und Versionsansichten bleiben bestehen.

- [ ] **Step 5: Tests und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx src/pages/ComplianceLifecycle.test.tsx`  
  Expected: PASS.

  ```powershell
  git add src/components/cluster/ClusterInfrastructurePanel.tsx src/pages/Clusters.tsx src/pages/ComplianceLifecycle.tsx src/pages/ComplianceLifecycle.test.tsx src/pages/Clusters.test.tsx
  git commit -m "feat: add cluster infrastructure workspace tab"
  ```

### Task 11: URL-Tabs, Scope-Hinweise und Glossar fertigstellen

**Files:**
- Modify: `src/pages/Clusters.tsx`
- Modify: `src/lib/glossary.ts`
- Create: `src/lib/glossaries/clusters.ts`
- Modify: `src/pages/Clusters.test.tsx`

- [ ] **Step 1: Failing Tests für Tab-URLs schreiben.**

  ```tsx
  it("opens capacity from the query tab", () => {
    renderAt("/clusters?tab=capacity");
    expect(screen.getByRole("tab", { name: "Kapazität" })).toHaveAttribute("data-state", "active");
  });
  ```

- [ ] **Step 2: Test ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: FAIL, wenn die Tabs noch keinen `useSearchParams`-State verwenden.

- [ ] **Step 3: Query-Parameter und Beschreibungen implementieren.**

  `Clusters.tsx` liest und schreibt ausschließlich die erlaubten Werte `overview`, `capacity`, `maintenance`, `planning`, `infrastructure`; ein ungültiger oder fehlender Wert fällt auf `overview` zurück. Ergänze `GlobalFilterScopeHint` mit dem Hinweis, dass vCenter-, Cluster- und Sucheingrenzung für die gesamte Seite gilt. Lege Glossareinträge für KPIs, Tabellen, Charts und Tabs in `clusters.ts` an und verknüpfe den Sidebar-Eintrag in `glossary.ts`.

- [ ] **Step 4: Fokustest und Commit ausführen.**

  Run: `npm run test -- src/pages/Clusters.test.tsx`  
  Expected: PASS.

  ```powershell
  git add src/pages/Clusters.tsx src/lib/glossary.ts src/lib/glossaries/clusters.ts src/pages/Clusters.test.tsx
  git commit -m "feat: add cluster tab deep links and glossary"
  ```

### Task 12: Gesamtabnahme

**Files:**
- Modify: nur Dateien, die durch die folgenden Checks einen durch diese Änderung verursachten Fehler zeigen

- [ ] **Step 1: Gesamte Testsuite ausführen.**

  Run: `npm run test`  
  Expected: alle Vitest-Tests PASS.

- [ ] **Step 2: Typecheck und Lint ausführen.**

  Run: `npm run typecheck`  
  Expected: Exit code 0.

  Run: `npm run lint`  
  Expected: Exit code 0; bereits bestehende, nicht betroffene Warnungen nur dokumentieren, nicht beiläufig umbauen.

- [ ] **Step 3: Production-Build ausführen.**

  Run: `npm run build`  
  Expected: Vite-Build erfolgreich, neuer Cluster-Chunk wird erzeugt.

- [ ] **Step 4: Manuelle Smoke-Checks im Browser durchführen.**

  Prüfe mit mindestens zwei importierten vCentern und bewusst gleichem Clusternamen:

  1. Der vCenter-Filter zeigt beide bzw. nur den gewählten Clusterbestand.
  2. Übersicht, Kapazität, Wartung, Planung und Infrastruktur öffnen über Tabs und über URL.
  3. Detaildialog und Excel-/Markdown-Export enthalten den korrekten vCenter.
  4. Die Alt-URLs `/wartungsankuendigung` und `/planning` leiten auf den richtigen Tab.
  5. Ein What-if-Zielcluster bleibt eindeutig und vermischt keine vCenter.

- [ ] **Step 5: Abschlusscommit erstellen.**

  ```powershell
  git add src/App.tsx src/app/layout/AppSidebar.tsx src/components/cluster src/domain/services/clusterCapacityEngine.ts src/domain/services/importService.ts src/domain/services/planningHelpers.ts src/lib/clusterIdentity.ts src/lib/clusterWorkspace.ts src/lib/vmOsDistribution.ts src/lib/detailMarkdown.ts src/lib/glossary.ts src/lib/glossaries/clusters.ts src/pages/Clusters.tsx src/pages/Clusters.test.tsx src/pages/Overview.tsx src/pages/Overview.test.tsx src/pages/Capacity.tsx src/pages/Licensing.tsx src/pages/Wartungsankuendigung.tsx src/pages/Planning.tsx src/pages/ComplianceLifecycle.tsx src/pages/ComplianceLifecycle.test.tsx src/test/clusterIdentity.test.ts src/test/clusterWorkspace.test.ts src/test/clusterCapacityEngine.test.ts src/test/vmOsDistribution.test.ts src/test/detailMarkdown.test.ts src/test/scenarioPersistence.test.ts
  git commit -m "test: verify cluster workspace integration"
  ```

  Vor dem Stagen `git status --short` prüfen. Keine fremden oder unversionierten Nutzerdateien in den Commit aufnehmen.

## Plan-Selbstprüfung

- **Spec coverage:** Die fünf Tabs, KPI-Leiste, drei Charts, zentrale Tabelle, Exporte, Detaildialog, vCenter-sichere Berechnungen, Weiterleitungen, Datenlimits und Qualitätschecks sind jeweils einem Task zugeordnet.
- **Nicht enthaltene Zukunftsthemen:** OS-Supportkatalog, echte HA-Admission-Control-Bewertung, automatische Konsolidierungsfreigabe und Herstellerkompatibilität werden nicht implementiert, da sie in der freigegebenen Spec ausdrücklich ausgeschlossen sind.
- **Typkonsistenz:** `clusterScopeKey` ist die einzige neue Schlüsselbildung; `NormalizedCluster.clusterKey` bleibt für gespeicherte Szenarioziele maßgeblich. Alle Tabellenzeilen führen `clusterKey` und `vcenterId` explizit.
- **Risiko:** Die vorhandenen Planungs- und Capacity-Funktionen gruppieren teils nur nach Name. Tasks 1 und 2 müssen vor jeder UI-Übernahme abgeschlossen sein.
