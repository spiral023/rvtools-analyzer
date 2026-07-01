# Design: Cluster-Planung & What-if-Szenarien

**Datum:** 2026-07-01
**Status:** Entwurf zur Freigabe
**Autor:** Philipp Asanger (mit Claude)

## 1. Ziel & Kontext

Der RVTools Analyzer soll um eine **Kapazitätsplanungs-Funktion** erweitert werden, mit der
VMs für ein What-if-Szenario ausgewählt und einem Zielcluster zugewiesen werden können. Der
konkrete Anlass: Ein neuer Cluster mit neuer Hardware (4 Hosts) wurde gebaut, und es soll
geplant werden, welche VMs dorthin verschoben werden, um die resultierende Auslastung
(Overcommit, RAM, CPU, Storage) von Quell- und Zielclustern vor der eigentlichen Migration
zu bewerten.

Die Lösung muss **modular** sein, sodass später weitere What-if-Vergleichstypen (z.B.
Cluster-Konsolidierung, Host-Ausfall-Simulation) auf demselben Rahmen aufbauen können, und
sich in das bestehende Design (shadcn/ui, Tailwind, Radix-Dialoge) einfügen.

### Nicht-Ziele (v1)
- Keine echte Migration/Änderung an vCenter — reine Planung/Simulation.
- Keine hypothetischen (nicht importierten) Cluster/Hosts. Zielcluster müssen real im
  aktuellen RVTools-Import existieren.
- Kein HA Admission Control / N+1-Redundanzrechnen (im Betrieb kaum genutzt).
- Keine Versionierung/Historie von Szenarien, kein "Duplizieren".
- Keine EVC-/CPU-Kompatibilitätsprüfung.

## 2. Fachliche Entscheidungen (aus dem Brainstorming)

| Thema | Entscheidung |
|-------|-------------|
| Selektions-Scope | Global über alle Seiten (App-weiter State) |
| Workflow-Ort | Neue eigene Seite `/planning` |
| Kapazitätsbasis | Echte/aktive Auslastung (`CPU/Memory usage %` aus vHost-Sheet), nicht nur konfigurierte vCPU/RAM |
| Storage | Datastore-Kapazität wird einbezogen (provisioned **und** in-use getrennt) |
| Multi-Cluster | Mehrere Quell- **und** Ziel-Cluster über VM-Gruppen |
| Gruppierung | Zwei-Schritt: Auswählen → Gruppe zuweisen |
| Editierbarkeit | Szenarien bearbeitbar (öffnen, ändern, überschreiben) |
| Zielcluster | Existiert real im Import (echte Host-Daten) |
| Snapshots | **Nur ein Stand pro vCenter** — keine Snapshot-Historie, kein Cross-Snapshot-Abgleich |
| Tabellen-Reichweite | Selektion überall, wo eine VM-Tabelle (`NormalizedVm`) vorkommt |
| Szenario-Verwaltung | Kartenliste direkt auf `/planning` |
| Zukunftstyp | Cluster-Konsolidierung / Host-Ausfall als nächster geplanter Typ |

## 3. Architektur-Überblick

Vier neue Bausteine plus eine Refaktorierung, lose gekoppelt:

```
SelectionProvider (Context, global, IndexedDB-persistiert)
   └─ Set<vmKey> Arbeitsauswahl
        │
        ▼
Checkbox-Spalte in VirtualTable (opt-in, Klick/Strg/Shift)
        │
        ▼
/planning-Seite ──────────────► clusterCapacityEngine.ts (pur, UI-frei)
   - Gruppen bilden                   ▲
   - Schwebende Leiste (live)          │ nutzt auch
   - Vergleichsdialog                  │
   - Szenario-Liste            Capacity.tsx (refaktoriert, Verhalten unverändert)
        │
        ▼
IndexedDB Store "scenarios"
```

**Kernprinzip:** Die `clusterCapacityEngine` kennt weder "Szenario" noch "Selektion". Sie
nimmt eine Menge Hosts/VMs/Datastores und liefert Kennzahlen. Das Planungs-Feature ruft sie
zweimal auf — einmal für den *Vorher*-Zustand (aktueller Cluster-Inhalt), einmal für den
*Nachher*-Zustand (Inhalt nach Anwendung aller Gruppen). Dadurch bleibt die Engine
wiederverwendbar für zukünftige What-if-Typen und die Zahlen sind per Konstruktion konsistent
mit der bestehenden `Capacity`-Seite.

## 4. Komponenten im Detail

### 4.1 SelectionProvider (`src/hooks/useSelectionState.tsx`)

Analog zum bestehenden `FilterProvider` (`src/hooks/useFilterState.tsx`).

- Hält `Set<vmKey>` als **Arbeitsauswahl** (VMs, die noch keiner Gruppe zugewiesen sind).
- Persistiert in IndexedDB `ui_state` (neues optionales Feld `selectionVmKeys?: string[]` in
  `UiState`), damit ein Reload die Auswahl nicht verwirft. Hydration-Pattern wie in
  `FilterProvider` (hydratedRef, load-then-persist).
- Öffentliche API:
  - `toggle(vmKey: string): void`
  - `setRange(vmKeys: string[], selected: boolean): void` — für Shift-Bereich und Select-All
  - `clear(): void`
  - `isSelected(vmKey: string): boolean`
  - `selectedKeys: Set<string>`
  - `selectedCount: number`
- Provider wird in `App.tsx` **innerhalb** von `FilterProvider` gemountet.

### 4.2 Checkbox-Spalte in VirtualTable (`src/components/tables/VirtualTable.tsx`)

- Neue optionale Props: `enableSelection?: boolean`, `getRowId?: (row: T) => string`.
  Bestehende Aufrufer ohne diese Props bleiben unverändert (opt-in).
- Wenn `enableSelection`, wird eine zusätzliche erste Spalte gerendert (Checkbox), plus
  eine Header-Checkbox (Select-All über die **aktuell gefilterten** Zeilen, mit
  Indeterminate-Zustand bei Teilauswahl).
- Auswahlmenge kommt aus `useSelectionState()`; die Tabelle hält nur den **Anker-Index**
  (letzte angeklickte Zeile) lokal für Shift-Bereiche.
- Klick-Verhalten (Konvention wie Datei-Explorer/Gmail):
  - **Klick** auf Checkbox/Zeile → `toggle(vmKey)`.
  - **Strg+Klick** → einzeln togglen, ohne andere zu verlieren.
  - **Shift+Klick** → Bereich vom Anker bis zur geklickten Zeile, basierend auf
    `table.getRowModel().rows` (also der **gefilterten + sortierten** sichtbaren
    Reihenfolge, nicht den Rohdaten). Setzt alle Zeilen im Bereich auf den Zielzustand.
  - **Header-Checkbox** → Select-All / Deselect-All über alle gefilterten Zeilen.
- `colSpan`-Werte der Padding-Zeilen (Virtualizer) müssen die Selektionsspalte
  mitzählen (`columns.length + 1`).
- Der bestehende `onRowClick` bleibt erhalten; bei aktiver Selektion darf ein Klick auf die
  Checkbox-Zelle `onRowClick` **nicht** auslösen (stopPropagation).

### 4.3 clusterCapacityEngine (`src/domain/services/clusterCapacityEngine.ts`)

Extraktion der bestehenden Berechnungslogik aus `Capacity.tsx` (aktuell die
`clusterCapacity`-`useMemo`-Berechnung, ~Zeile 460–590, die gewichtete Ist-Auslastung aus
dem `vHost`-Sheet aggregiert und `riskScore` bildet).

**Signatur (grob):**

```ts
export interface ClusterMetricsInput {
  clusterName: string;
  hosts: NormalizedHost[];         // Hosts dieses Clusters
  vms: NormalizedVm[];             // VMs, die (im Szenario) diesem Cluster zugeordnet sind
  rawVHostRows: SheetRow[];        // vHost-Rohzeilen für Ist-Auslastung (nur Vorher)
  datastores: NormalizedDatastore[];
  clusterRef?: NormalizedCluster;  // für haEnabled/drsEnabled/numHosts-Deltas
}

export interface ClusterMetrics {
  clusterName: string;
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  totalVcpus: number;
  cpuUsagePct: number;      // Ist (Vorher) oder projiziert (Nachher)
  memoryUsagePct: number;
  vcpuPerCore: number;
  ramCommitPct: number;
  ramActivePct: number;
  swapBalloonPct: number;
  storageProvisionedMiB: number;
  storageInUseMiB: number;
  storageFreeMiB: number;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
  projected: boolean;       // true = Nachher-Wert aus Schätzung
  incompleteVmCount: number; // VMs mit fehlenden CPU/RAM-Werten
}

export function computeClusterMetrics(input: ClusterMetricsInput): ClusterMetrics;
```

**Schwellen/Formeln** werden 1:1 aus `Capacity.tsx` übernommen (vCPU/Core >4 gelb / >6 rot;
RAM Commit >140/>180 %; RAM Active >80/>90 %; Swap+Balloon >2/>5 %; CPU% >75/>85; RAM% >80/>90;
riskScore-Gewichtung wie bestehend). Konstanten werden als benannte Exporte definiert, damit
UI-Ampeln und Engine dieselben Werte nutzen.

**Datenlage (wichtig):** Ist-Auslastung (`CPU usage %`, `Memory usage %`, `VM Used memory`,
`VM Memory Swapped/Ballooned`) liegt im `vHost`-Sheet **nur pro Host** vor. Es gibt **keine**
gemessene Ist-Last pro einzelner VM — weder im `vHost`-Sheet noch in `NormalizedVm`. Pro VM
sind nur die **konfigurierten/allokierten** Größen bekannt (`cpuCount`, `memoryMiB`,
`provisionedMiB`, `inUseMiB` = Disk-in-use).

**Vorher vs. Nachher — Umgang mit Auslastung:**
- **Vorher:** `cpuUsagePct`/`memoryUsagePct`/`ramActivePct`/`swapBalloonPct` kommen aus den
  gewichteten `vHost`-Ist-Werten (wie heute in `Capacity.tsx`, exakt/gemessen).
- **Exakte Nachher-Metriken (Allokation):** `vcpuPerCore` und `ramCommitPct` beruhen nur auf
  konfigurierten VM-Größen und den Zielcluster-Ressourcen → für den Nachher-Zustand **exakt**
  berechenbar. Das sind die primären, verlässlichen Planungskennzahlen.
- **Projizierte Nachher-Metriken (Ist-basiert):** `cpuUsagePct`, `memoryUsagePct`,
  `ramActivePct`, `swapBalloonPct` können für den Nachher-Zustand **nicht gemessen** werden.
  Sie werden per **proportionaler Aufteilung** geschätzt: Die gemessene aktive Last des
  Quell-Clusters wird den VMs anteilig nach ihrer konfigurierten Größe zugewiesen
  (RAM-basierte Metriken gewichtet nach `memoryMiB`, CPU-basierte nach `cpuCount`). Beispiel
  aktiver RAM einer VM ≈ `clusterVmUsedMiB × (vm.memoryMiB / Σ memoryMiB aller Cluster-VMs)`.
  Diese geschätzte Last wird beim Verschieben vom Quell- abgezogen und dem Ziel-Cluster
  additiv zugerechnet. Alle so berechneten Werte tragen `projected: true` und werden in Leiste
  und Dialog klar als "geschätzt/projiziert (proportional)" gekennzeichnet.
- **Annahme & Grenze:** Die Aufteilung nimmt an, dass Last grob proportional zur Konfiguration
  skaliert — eine bewusste Vereinfachung. Sie ist für die Kapazitätsplanung ausreichend, aber
  keine exakte Prognose (idle große VMs bzw. lastintensive kleine VMs verzerren die
  Schätzung). Deshalb bleiben die exakten Allokationsmetriken (vCPU/Core, RAM Commit %) die
  Leitgrößen; die projizierten Ist-Werte sind ergänzende Indikatoren.

**Architektur der Projektion:** Da die anteilige Ist-Last einer verschobenen VM vom
**Quell**-Cluster abhängt (dort wurde sie gemessen), erfolgt die Schätzung in zwei Schritten:
1. Eine reine Hilfsfunktion `estimateVmLoads(sourceClusterMetrics, sourceVms)` berechnet je VM
   einen `VmLoadEstimate` (anteiliger aktiver RAM, Swap/Balloon, CPU-Anteil).
2. `computeClusterMetrics` akzeptiert optional vorab berechnete `VmLoadEstimate`-Werte je VM
   (`vmLoadEstimates?: Map<vmKey, VmLoadEstimate>`); fehlen sie (reiner Vorher-Zustand aus
   `vHost`), werden die gemessenen Host-Aggregate verwendet.
So bleibt die Engine mengenbasiert und pur; die Planungs-Seite orchestriert Quelle→Ziel.

`Capacity.tsx` wird refaktoriert, um `computeClusterMetrics` zu nutzen; das sichtbare
Verhalten der Seite bleibt identisch (Regressionstest sichert das ab).

### 4.4 Szenario-Datenmodell & Persistenz

Neuer IndexedDB-Store `scenarios` (DB-Version-Bump von 14 → 15 in
`src/data/db/index.ts`; Store-Definition + `StoreName`-Union + `ALL_STORES` erweitern).

```ts
// in src/domain/models/types.ts
export type ScenarioType = "cluster-migration"; // später: | "host-failure" | "consolidation"

export interface ScenarioGroup {
  id: string;
  label: string | null;
  targetClusterKey: string;   // Zielcluster (real im Import)
  vmKeys: string[];           // zugewiesene VMs
}

export interface Scenario {
  id: string;                 // uuid (via crypto.randomUUID im UI-Layer erzeugt)
  name: string;
  type: ScenarioType;
  createdAt: string;          // ISO, im UI-Layer gesetzt
  updatedAt: string;          // ISO, im UI-Layer gesetzt
  vcenterScope: string[];     // betroffene vCenter-IDs
  groups: ScenarioGroup[];
  notes: string | null;
}
```

- Store `scenarios`: `keyPath: "id"`, Index auf nichts Zwingendes nötig (wenige Datensätze);
  optional Index `updatedAt` für Sortierung der Liste.
- Neue DB-Helper in `src/data/db/index.ts`: `getScenarios()`, `putScenario()`,
  `deleteScenario(id)`.
- **Betroffene Cluster werden abgeleitet, nicht gespeichert:** Aus den `vmKeys` einer Gruppe
  ermittelt die Engine die Quell-Cluster (aktuelle `cluster`-Zuordnung der VM). Damit gibt es
  keine Inkonsistenz zwischen gespeicherter und tatsächlicher Zugehörigkeit.
- **`type`-Diskriminator** hält den Store zukunftssicher: Ein `host-failure`-Szenario würde
  z.B. statt/zusätzlich zu `groups` ein Feld für entfernte Hosts tragen, teilt sich aber
  Store, Liste und Vergleichsdialog-Rahmen.

### 4.5 Planungs-Seite (`src/pages/Planning.tsx`, Route `/planning`)

- Neue lazy-geladene Route in `App.tsx`; Nav-Eintrag in `src/app/layout/AppSidebar.tsx`.
- Aufbau:
  1. **Szenario-Liste** (oben): Karten pro gespeichertem Szenario (Name, Datum, betroffene
     Cluster, VM-Gesamtzahl). Aktionen: Öffnen / Umbenennen / Löschen. Plus "Neues Szenario".
  2. **VM-Tabelle** mit Filter-Bar (bestehende `FilterBar` + `GlobalFilterControl`
     wiederverwenden) und aktivierter Selektion (`enableSelection`).
- Der Planungs-State (aktuell geladenes/neues Szenario mit seinen Gruppen) lebt lokal auf der
  Seite; die **Arbeitsauswahl** kommt aus dem globalen `SelectionProvider`.

### 4.6 Schwebende Leiste (`src/components/planning/PlanningBar.tsx`)

- Fixiert am unteren Rand, gerendert in `AppLayout`, sodass sie auf allen Seiten mit
  VM-Tabellen sichtbar ist. Erscheint, sobald `selectedCount > 0` **oder** ein Szenario mit
  ≥1 Gruppe aktiv ist.
- Inhalt:
  - Zusammenfassung der Arbeitsauswahl: `N VMs · Σ vCPU · Σ RAM`.
  - Dropdown **Zielcluster wählen** + Button **+ Gruppe** (weist die Arbeitsauswahl der
    gewählten Zielgruppe zu, leert danach die Arbeitsauswahl).
  - Chips der bereits erstellten **Gruppen** (`Label: N VMs → Zielcluster ✕`).
  - Kompakte Live-Vorschau pro betroffenem Cluster: `CPU vorher→nachher`, `RAM vorher→nachher`,
    `vCPU/Core vorher→nachher`, mit Ampelfarbe an den Nachher-Werten.
  - Buttons **Vergleich öffnen** und **Szenario speichern** (bzw. **Aktualisieren**).
- Kollabierbar (nur Zusammenfassung ↔ ausgeklappt mit Cluster-Zeilen).

### 4.7 Vergleichsdialog (`src/components/planning/ScenarioCompareDialog.tsx`)

- Radix Dialog (`src/components/ui/dialog.tsx`), Muster wie `ClusterDetailDialog`.
- Pro betroffenem Cluster (Quelle **und** Ziel) eine Karte mit Tabelle
  **Metrik | Vorher | Nachher | Δ**:
  CPU %, RAM %, vCPU/Core, RAM Commit %, RAM Active %, Swap+Balloon %, VM-Anzahl,
  Storage belegt/frei (provisioned + in-use), Risk-Score.
- Δ farbcodiert (Verbesserung grün, Verschlechterung rot).
- **Warnbanner** bei Schwellenverletzung im Nachher-Zustand (z.B. "vCPU/Core > 6:1",
  "Ziel-Datastore-Platz reicht nicht für provisionierte Größe").
- Kennzeichnung "projizierte Werte".
- Footer: Name-Eingabe + **Szenario speichern** / **Aktualisieren**.

## 5. Datenfluss (Cluster-Migration)

1. Nutzer filtert VM-Tabelle (bestehende Filter-Engine), markiert VMs (Klick/Strg/Shift).
2. Arbeitsauswahl landet global im `SelectionProvider`.
3. Nutzer wählt Zielcluster + "Gruppe erstellen" → `ScenarioGroup` wird zum Planungs-State
   hinzugefügt, Arbeitsauswahl geleert. Wiederholung für weitere Gruppen.
4. Bei jeder Änderung: Planungs-Seite berechnet die betroffenen Cluster (Quellcluster der
   VMs + Zielcluster der Gruppen), ruft `computeClusterMetrics` je Cluster für Vorher/Nachher
   auf → speist Leiste & Dialog.
5. "Szenario speichern" → `Scenario` (mit `groups`) via `putScenario` in IndexedDB.
6. Öffnen eines gespeicherten Szenarios lädt `groups` zurück in den Planungs-State.

## 6. Fehlerbehandlung & Randfälle

- **VM in mehreren Gruppen:** verhindert — eine VM kann nur einer Gruppe angehören; erneutes
  Zuweisen verschiebt sie (Hinweis-Toast via `sonner`).
- **VM → eigener aktueller Cluster:** erlaubt, als "no-op" markiert (kein Delta), damit
  versehentliche Selbst-Zuweisung sichtbar bleibt.
- **Zielcluster ohne Host-Daten:** Engine liefert null-sichere Fallbacks; UI zeigt "—" statt
  NaN.
- **Fehlende Werte** (`cpuCount`/`memoryMiB` null): fließen als 0 in Summen; im Dialog als
  "unvollständige Daten: N VMs" ausgewiesen (`incompleteVmCount`).
- **Verwaistes Szenario** (Zielcluster/VM nicht mehr im Import): beim Öffnen Warnung +
  Auflistung fehlender Referenzen; Rest bleibt nutzbar.

## 7. Teststrategie (Vitest)

Muster wie bestehende Tests (`src/test/maintenance.test.ts`, `detailMarkdown.test.ts`).

- **Engine-Unit-Tests** (`src/test/clusterCapacityEngine.test.ts`):
  - Bekannte Eingabe → erwartete Kennzahlen.
  - Vorher/Nachher-Delta (VMs verschieben → Quelle sinkt, Ziel steigt).
  - Null-/leere Felder (kein NaN, `incompleteVmCount` korrekt).
  - Storage-Summen (provisioned vs. in-use getrennt).
  - riskScore-Schwellen an den Grenzen.
- **Selektions-Logik** (`src/test/selection.test.ts`): Shift-Range auf gefilterter/sortierter
  Ansicht, Strg-Toggle, Header-Select-All, Indeterminate.
- **Szenario-Persistenz** (`src/test/scenarioPersistence.test.ts`): speichern → laden →
  identische Gruppen (Round-Trip; ggf. fake-indexeddb).
- **Regression `Capacity.tsx`:** Nach Engine-Extraktion liefern die berechneten Cluster-Rows
  identische Werte wie zuvor (Referenzwert-Test auf `computeClusterMetrics`).

## 8. Modularität für zukünftige What-if-Typen

- Der `scenarios`-Store und der Vergleichsdialog sind über `ScenarioType` diskriminiert und
  damit für weitere Typen wiederverwendbar.
- Die Engine ist rein mengenbasiert ("welche Hosts/VMs gehören zum Cluster"), sodass:
  - **Host-Ausfall:** Hosts-Liste eines Clusters verkleinern, VMs bleiben → Nachher-Metriken.
  - **Konsolidierung:** VM-/Host-Mengen zweier Cluster zusammenführen.
  ohne Änderung der Grundstruktur abbildbar sind.
- Leiste und Dialog arbeiten gegen die generische "betroffene Cluster: Vorher/Nachher"-Liste,
  nicht gegen ein migrationsspezifisches Modell.
