# Cluster-Planung & What-if-Szenarien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VMs per Mehrfachselektion in Tabellen auswählen, Zielclustern zuweisen und die resultierende Auslastung (Overcommit, RAM, CPU, Storage) von Quell- und Zielclustern als speicherbares What-if-Szenario vergleichen.

**Architecture:** Ein globaler `SelectionProvider` (React Context, IndexedDB-persistiert) sammelt VM-Keys; eine pure `clusterCapacityEngine` (aus `Capacity.tsx` extrahiert) berechnet Kennzahlen mengenbasiert für Vorher/Nachher; eine neue `/planning`-Seite orchestriert Gruppen, eine schwebende Leiste zeigt Live-Metriken, ein Radix-Dialog vergleicht Alt/Neu, Szenarien liegen in einem neuen IndexedDB-Store.

**Tech Stack:** React 18 + TypeScript, Vite, TanStack React Table/Virtual, shadcn/ui + Radix, `idb` (IndexedDB), Vitest + fake-indexeddb + @testing-library.

## Global Constraints

- **Sprache:** Alle UI-Texte, Kommentare und Commit-Messages auf Deutsch; Umlaute korrekt (ä/ö/ü/ß, nie ASCII-Ersatz).
- **Nur ein Snapshot pro vCenter** — kein Cross-Snapshot-Abgleich, keine Snapshot-Historie-Logik.
- **Zielcluster existieren real** im aktuellen Import (keine hypothetischen Hosts/Cluster).
- **Kein HA Admission Control / N+1** in der Berechnung.
- **Keine Szenario-Versionierung, kein Duplizieren.**
- **Exakte vs. projizierte Metriken:** `vcpuPerCore` und `ramCommitPct` sind für den Nachher-Zustand exakt; `cpuUsagePct`, `memoryUsagePct`, `ramActivePct`, `swapBalloonPct` werden für den Nachher-Zustand per proportionaler Aufteilung geschätzt (`projected: true`) und in der UI als „geschätzt/projiziert" gekennzeichnet.
- **Schwellenwerte 1:1 aus `Capacity.tsx`:** vCPU/Core >4 gelb / >6 rot; RAM Commit >140/>180 %; RAM Active >80/>90 %; Swap+Balloon >2/>5 %; CPU% >75/>85; RAM% >80/>90.
- **Tests:** `npm test` (= `vitest run`). Testdateien unter `src/test/` oder neben der Quelle als `*.test.ts`.
- **Commits:** häufig, ein Commit pro abgeschlossenem Task-Schritt-Block; Message endet mit `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Pfad-Alias:** `@/` → `src/`.

---

## File Structure

**Neu:**
- `src/domain/services/clusterCapacityEngine.ts` — pure Kapazitäts-Engine (Aggregate, Projektion, Metriken, Schwellen).
- `src/domain/services/scenarioPlanning.ts` — pure Planungs-Helfer (Gruppen-Zuweisung, betroffene Cluster, Vorher/Nachher, Ziel-Storage).
- `src/hooks/useSelectionState.tsx` — globaler Auswahl-Context + `computeRangeSelection`-Helfer.
- `src/hooks/useScenarioPlanning.ts` — Orchestrierung des Planungs-State (Gruppen, Metriken, Speichern/Laden).
- `src/components/planning/PlanningBar.tsx` — schwebende Leiste.
- `src/components/planning/ScenarioCompareDialog.tsx` — Vergleichsdialog.
- `src/components/planning/ScenarioList.tsx` — Kartenliste gespeicherter Szenarien.
- `src/pages/Planning.tsx` — Planungs-Seite.
- Tests: `src/test/clusterCapacityEngine.test.ts`, `src/test/scenarioPlanning.test.ts`, `src/test/selectionState.test.ts`, `src/test/scenarioPersistence.test.ts`.

**Geändert:**
- `src/domain/models/types.ts` — Szenario-Typen, `VmLoadEstimate`, `UiState.selectionVmKeys`.
- `src/data/db/index.ts` — DB-Version 14→15, Store `scenarios`, Helfer.
- `src/components/tables/VirtualTable.tsx` — Selektions-Spalte (opt-in).
- `src/pages/Capacity.tsx` — Refactor auf `clusterCapacityEngine`.
- `src/App.tsx` — Route `/planning`, `SelectionProvider` einhängen.
- `src/app/layout/AppSidebar.tsx` — Nav-Eintrag „Planung".
- `src/app/layout/AppLayout.tsx` — `PlanningBar` global mounten.

---

## Task 1: Szenario-Typen & IndexedDB-Store

**Files:**
- Modify: `src/domain/models/types.ts` (nach `UiState`, ~Zeile 349)
- Modify: `src/data/db/index.ts` (Schema, `StoreName`, `ALL_STORES`, `DB_VERSION`, Upgrade, Helfer)
- Test: `src/test/scenarioPersistence.test.ts`

**Interfaces:**
- Produces:
  - `type ScenarioType = "cluster-migration"`
  - `interface ScenarioGroup { id: string; label: string | null; targetClusterKey: string; vmKeys: string[] }`
  - `interface Scenario { id: string; name: string; type: ScenarioType; createdAt: string; updatedAt: string; vcenterScope: string[]; groups: ScenarioGroup[]; notes: string | null }`
  - `interface VmLoadEstimate { activeMiB: number; consumedMiB: number; swapBalloonMiB: number; usedCoreEquiv: number }`
  - `UiState.selectionVmKeys?: string[]`
  - `getScenarios(): Promise<Scenario[]>`, `putScenario(s: Scenario): Promise<void>`, `deleteScenario(id: string): Promise<void>`

- [ ] **Step 1: Typen ergänzen**

In `src/domain/models/types.ts` direkt nach dem `UiState`-Interface einfügen:

```ts
export type ScenarioType = "cluster-migration";

export interface ScenarioGroup {
  id: string;
  label: string | null;
  targetClusterKey: string;
  vmKeys: string[];
}

export interface Scenario {
  id: string;
  name: string;
  type: ScenarioType;
  createdAt: string;
  updatedAt: string;
  vcenterScope: string[];
  groups: ScenarioGroup[];
  notes: string | null;
}

/** Anteilig geschätzte Ist-Last einer einzelnen VM (proportional zur Konfiguration). */
export interface VmLoadEstimate {
  activeMiB: number;
  consumedMiB: number;
  swapBalloonMiB: number;
  usedCoreEquiv: number;
}
```

Und das bestehende `UiState`-Interface um ein Feld erweitern:

```ts
export interface UiState {
  id: string;
  theme: "dark" | "light";
  lastFilter?: FilterState;
  presets?: FilterPreset[];
  selectionVmKeys?: string[];
}
```

- [ ] **Step 2: Failing test schreiben**

`src/test/scenarioPersistence.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { Scenario } from "@/domain/models/types";

beforeEach(() => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

function makeScenario(): Scenario {
  return {
    id: "scn-1",
    name: "Migration Welle 1",
    type: "cluster-migration",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    vcenterScope: ["vc-1"],
    groups: [
      { id: "grp-1", label: null, targetClusterKey: "cl-new-04", vmKeys: ["vm-1", "vm-2"] },
    ],
    notes: null,
  };
}

describe("scenario persistence", () => {
  it("speichert, liest und löscht ein Szenario (Round-Trip)", async () => {
    const { putScenario, getScenarios, deleteScenario } = await import("@/data/db");
    const scenario = makeScenario();

    await putScenario(scenario);
    const afterPut = await getScenarios();
    expect(afterPut).toHaveLength(1);
    expect(afterPut[0]).toEqual(scenario);

    await deleteScenario("scn-1");
    const afterDelete = await getScenarios();
    expect(afterDelete).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Test ausführen (muss fehlschlagen)**

Run: `npm test -- scenarioPersistence`
Expected: FAIL — `putScenario` / `getScenarios` / `deleteScenario` sind kein Export von `@/data/db`.

- [ ] **Step 4: Store & Helfer implementieren**

In `src/data/db/index.ts`:

(a) `import`-Block um `Scenario` erweitern:

```ts
import type {
  SnapshotMeta,
  SheetRow,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  AnalysisMetric,
  UiState,
  TechInfoImportMeta,
  TechInfoRow,
  TechInfoLatest,
  MaintenanceSettings,
  MaintenanceClusterAssignment,
  Scenario,
} from "@/domain/models/types";
```

(b) Im `RVToolsDBSchema`-Interface nach `maintenance_cluster_assignments` ergänzen:

```ts
  scenarios: {
    key: string;
    value: Scenario;
    indexes: { updatedAt: string };
  };
```

(c) `StoreName`-Union und `ALL_STORES` um `"scenarios"` erweitern:

```ts
export type StoreName = "snapshots" | "rawSheets" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest" | "maintenance_settings"
  | "maintenance_cluster_assignments" | "scenarios";
```

```ts
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheets", "entities_vm", "entities_host",
  "entities_cluster", "entities_datastore", "entities_snapshot",
  "entities_health", "metrics_cache", "ui_state",
  "techinfo_imports", "techinfo_rows", "techinfo_latest",
  "maintenance_settings", "maintenance_cluster_assignments", "scenarios",
];
```

(d) `DB_VERSION` erhöhen:

```ts
const DB_VERSION = 15;
```

(e) Im `upgrade`-Callback am Ende (vor der schließenden `}` des Callbacks) einfügen:

```ts
        if (!db.objectStoreNames.contains("scenarios")) {
          const scenarios = db.createObjectStore("scenarios", { keyPath: "id" });
          scenarios.createIndex("updatedAt", "updatedAt");
        }
```

(f) Helfer im Bereich der übrigen query helpers ergänzen:

```ts
export async function getScenarios(): Promise<Scenario[]> {
  const db = await getDb();
  const all = await db.getAll("scenarios");
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putScenario(scenario: Scenario): Promise<void> {
  const db = await getDb();
  await db.put("scenarios", scenario);
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("scenarios", id);
}
```

- [ ] **Step 5: Test ausführen (muss bestehen)**

Run: `npm test -- scenarioPersistence`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/models/types.ts src/data/db/index.ts src/test/scenarioPersistence.test.ts
git commit -m "feat: add scenario types and IndexedDB store"
```

---

## Task 2: Kapazitäts-Engine — Aggregat & Metriken (Vorher)

**Files:**
- Create: `src/domain/services/clusterCapacityEngine.ts`
- Test: `src/test/clusterCapacityEngine.test.ts`

**Interfaces:**
- Consumes: `SheetRow`, `NormalizedCluster` aus `@/domain/models/types`; `toNumLoose`, `toBoolLoose` aus `@/lib/conversion`.
- Produces:
  - `CAPACITY_THRESHOLDS` (benannte Konstanten)
  - `interface ClusterAggregate { hosts; totalCores; totalMemoryMiB; totalVms; vcpus; vRamMiB; vmActiveMiB; swapBalloonMiB; cpuUsedCoreEquiv; memConsumedMiB; hotHosts; htInactiveHosts; cpuMin; cpuMax; memMin; memMax }` (alle `number`)
  - `emptyAggregate(): ClusterAggregate`
  - `aggregateCluster(clusterName: string, rawVHostRows: SheetRow[]): ClusterAggregate`
  - `interface ClusterMetrics { clusterName: string; hosts: number; totalCores: number; totalMemoryMiB: number; totalVms: number; totalVcpus: number; cpuUsagePct: number; memoryUsagePct: number; vcpuPerCore: number; ramCommitPct: number; ramActivePct: number; swapBalloonPct: number; riskScore: number; risk: "hoch" | "mittel" | "niedrig"; projected: boolean; incompleteVmCount: number }`
  - `metricsFromAggregate(agg: ClusterAggregate, opts: { clusterName: string; clusterRef?: NormalizedCluster | null; projected: boolean; incompleteVmCount?: number }): ClusterMetrics`

- [ ] **Step 1: Failing test schreiben**

`src/test/clusterCapacityEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateCluster, metricsFromAggregate } from "@/domain/services/clusterCapacityEngine";
import type { SheetRow } from "@/domain/models/types";

function hostRow(overrides: Record<string, unknown>): SheetRow {
  return {
    snapshotId: "snap-1",
    sheetName: "vHost",
    rowIndex: 0,
    data: {
      Cluster: "A",
      Host: "esx-1",
      Datacenter: "DC1",
      "# Cores": 10,
      "# Memory": 100000,
      "CPU usage %": 50,
      "Memory usage %": 60,
      "# VMs": 5,
      "# vCPUs": 20,
      vRAM: 80000,
      "VM Used memory": 50000,
      "VM Memory Swapped": 0,
      "VM Memory Ballooned": 0,
      "HT Available": true,
      "HT Active": true,
      ...overrides,
    },
  };
}

describe("clusterCapacityEngine – aggregate & metrics (Vorher)", () => {
  const rows: SheetRow[] = [
    hostRow({ Host: "esx-1" }),
    hostRow({ Host: "esx-2" }),
  ];

  it("aggregiert Host-Zeilen korrekt", () => {
    const agg = aggregateCluster("A", rows);
    expect(agg.hosts).toBe(2);
    expect(agg.totalCores).toBe(20);
    expect(agg.totalMemoryMiB).toBe(200000);
    expect(agg.vcpus).toBe(40);
    expect(agg.vRamMiB).toBe(160000);
    expect(agg.vmActiveMiB).toBe(100000);
    expect(agg.cpuUsedCoreEquiv).toBeCloseTo(10, 6); // 2 × (0.5 × 10)
    expect(agg.memConsumedMiB).toBeCloseTo(120000, 3); // 2 × (0.6 × 100000)
  });

  it("berechnet Vorher-Metriken", () => {
    const agg = aggregateCluster("A", rows);
    const m = metricsFromAggregate(agg, { clusterName: "A", projected: false });
    expect(m.cpuUsagePct).toBeCloseTo(50, 3);
    expect(m.memoryUsagePct).toBeCloseTo(60, 3);
    expect(m.vcpuPerCore).toBeCloseTo(2, 3);
    expect(m.ramCommitPct).toBeCloseTo(80, 3);
    expect(m.ramActivePct).toBeCloseTo(50, 3);
    expect(m.swapBalloonPct).toBeCloseTo(0, 3);
    expect(m.risk).toBe("niedrig");
    expect(m.projected).toBe(false);
  });

  it("ignoriert Zeilen fremder Cluster", () => {
    const mixed = [...rows, hostRow({ Cluster: "B", Host: "esx-9" })];
    const agg = aggregateCluster("A", mixed);
    expect(agg.hosts).toBe(2);
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `npm test -- clusterCapacityEngine`
Expected: FAIL — Modul/Funktionen existieren nicht.

- [ ] **Step 3: Engine implementieren**

`src/domain/services/clusterCapacityEngine.ts`:

```ts
import type { NormalizedCluster, SheetRow } from "@/domain/models/types";
import { toBoolLoose, toNumLoose } from "@/lib/conversion";

/** Schwellenwerte für Ampeln und Risk-Score — 1:1 aus der Capacity-Seite. */
export const CAPACITY_THRESHOLDS = {
  cpuUsage: { warn: 75, danger: 85 },
  memoryUsage: { warn: 80, danger: 90 },
  vcpuPerCore: { warn: 4, danger: 6 },
  ramCommit: { warn: 140, danger: 180 },
  ramActive: { warn: 80, danger: 90 },
  swapBalloon: { warn: 2, danger: 5 },
} as const;

export interface ClusterAggregate {
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  vcpus: number;
  vRamMiB: number;
  vmActiveMiB: number;
  swapBalloonMiB: number;
  cpuUsedCoreEquiv: number;
  memConsumedMiB: number;
  hotHosts: number;
  htInactiveHosts: number;
  cpuMin: number;
  cpuMax: number;
  memMin: number;
  memMax: number;
}

export interface ClusterMetrics {
  clusterName: string;
  hosts: number;
  totalCores: number;
  totalMemoryMiB: number;
  totalVms: number;
  totalVcpus: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vcpuPerCore: number;
  ramCommitPct: number;
  ramActivePct: number;
  swapBalloonPct: number;
  riskScore: number;
  risk: "hoch" | "mittel" | "niedrig";
  projected: boolean;
  incompleteVmCount: number;
}

export function emptyAggregate(): ClusterAggregate {
  return {
    hosts: 0, totalCores: 0, totalMemoryMiB: 0, totalVms: 0, vcpus: 0,
    vRamMiB: 0, vmActiveMiB: 0, swapBalloonMiB: 0, cpuUsedCoreEquiv: 0,
    memConsumedMiB: 0, hotHosts: 0, htInactiveHosts: 0,
    cpuMin: Number.POSITIVE_INFINITY, cpuMax: Number.NEGATIVE_INFINITY,
    memMin: Number.POSITIVE_INFINITY, memMax: Number.NEGATIVE_INFINITY,
  };
}

/** Baut das gemessene Ist-Aggregat eines Clusters aus den vHost-Rohzeilen. */
export function aggregateCluster(clusterName: string, rawVHostRows: SheetRow[]): ClusterAggregate {
  const agg = emptyAggregate();
  const target = clusterName.trim();
  for (const r of rawVHostRows) {
    const d = r.data;
    const rowCluster = String(d["Cluster"] ?? "").trim();
    const hostName = String(d["Host"] ?? "").trim();
    if (!rowCluster || !hostName || rowCluster !== target) continue;

    const cpuCores = toNumLoose(d["# Cores"]);
    const memMiB = toNumLoose(d["# Memory"]);
    const cpuUsagePct = toNumLoose(d["CPU usage %"]);
    const memUsagePct = toNumLoose(d["Memory usage %"]);
    const htAvailable = toBoolLoose(d["HT Available"]);
    const htActive = toBoolLoose(d["HT Active"]);

    agg.hosts += 1;
    agg.totalCores += cpuCores;
    agg.totalMemoryMiB += memMiB;
    agg.totalVms += toNumLoose(d["# VMs"]);
    agg.vcpus += toNumLoose(d["# vCPUs"]);
    agg.vRamMiB += toNumLoose(d["vRAM"]);
    agg.vmActiveMiB += toNumLoose(d["VM Used memory"]);
    agg.swapBalloonMiB += toNumLoose(d["VM Memory Swapped"]) + toNumLoose(d["VM Memory Ballooned"]);
    // Absolute Kern-/Speicher-Äquivalente, damit VM-Verschiebungen additiv wirken.
    agg.cpuUsedCoreEquiv += (cpuUsagePct / 100) * cpuCores;
    agg.memConsumedMiB += (memUsagePct / 100) * memMiB;

    if (cpuUsagePct > 60 || memUsagePct > 75) agg.hotHosts += 1;
    if (htAvailable && !htActive) agg.htInactiveHosts += 1;
    agg.cpuMin = Math.min(agg.cpuMin, cpuUsagePct);
    agg.cpuMax = Math.max(agg.cpuMax, cpuUsagePct);
    agg.memMin = Math.min(agg.memMin, memUsagePct);
    agg.memMax = Math.max(agg.memMax, memUsagePct);
  }
  return agg;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function metricsFromAggregate(
  agg: ClusterAggregate,
  opts: { clusterName: string; clusterRef?: NormalizedCluster | null; projected: boolean; incompleteVmCount?: number },
): ClusterMetrics {
  const cpuUsagePct = pct(agg.cpuUsedCoreEquiv, agg.totalCores);
  const memoryUsagePct = pct(agg.memConsumedMiB, agg.totalMemoryMiB);
  const vcpuPerCore = agg.totalCores > 0 ? agg.vcpus / agg.totalCores : 0;
  const ramCommitPct = pct(agg.vRamMiB, agg.totalMemoryMiB);
  const ramActivePct = pct(agg.vmActiveMiB, agg.totalMemoryMiB);
  const swapBalloonPct = pct(agg.swapBalloonMiB, agg.totalMemoryMiB);

  const cpuSpread = Number.isFinite(agg.cpuMin) && Number.isFinite(agg.cpuMax) ? agg.cpuMax - agg.cpuMin : 0;
  const memSpread = Number.isFinite(agg.memMin) && Number.isFinite(agg.memMax) ? agg.memMax - agg.memMin : 0;
  const clusterHostDelta = opts.clusterRef?.numHosts != null ? agg.hosts - opts.clusterRef.numHosts : null;
  const clusterMemoryDeltaPct = opts.clusterRef?.totalMemoryMiB
    ? ((agg.totalMemoryMiB - opts.clusterRef.totalMemoryMiB) / opts.clusterRef.totalMemoryMiB) * 100
    : null;

  let riskScore = 0;
  if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.danger) riskScore += 25;
  else if (cpuUsagePct > CAPACITY_THRESHOLDS.cpuUsage.warn) riskScore += 12;
  if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.danger) riskScore += 25;
  else if (memoryUsagePct > CAPACITY_THRESHOLDS.memoryUsage.warn) riskScore += 12;
  if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.danger) riskScore += 20;
  else if (vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.warn) riskScore += 10;
  if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.danger) riskScore += 15;
  else if (ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.warn) riskScore += 8;
  if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.danger) riskScore += 20;
  else if (swapBalloonPct > CAPACITY_THRESHOLDS.swapBalloon.warn) riskScore += 10;
  const hotRatio = agg.hosts > 0 ? agg.hotHosts / agg.hosts : 0;
  if (hotRatio > 0.5) riskScore += 10;
  else if (hotRatio > 0.3) riskScore += 5;
  if (opts.clusterRef?.drsEnabled === false && (cpuSpread > 30 || memSpread > 30)) riskScore += 8;
  if (agg.htInactiveHosts > 0) riskScore += 5;
  if (clusterHostDelta !== null && clusterHostDelta !== 0) riskScore += 3;
  if (clusterMemoryDeltaPct !== null && Math.abs(clusterMemoryDeltaPct) > 5) riskScore += 3;

  const risk: ClusterMetrics["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";

  return {
    clusterName: opts.clusterName,
    hosts: agg.hosts,
    totalCores: agg.totalCores,
    totalMemoryMiB: agg.totalMemoryMiB,
    totalVms: agg.totalVms,
    totalVcpus: agg.vcpus,
    cpuUsagePct: round(cpuUsagePct, 1),
    memoryUsagePct: round(memoryUsagePct, 1),
    vcpuPerCore: round(vcpuPerCore, 2),
    ramCommitPct: round(ramCommitPct, 1),
    ramActivePct: round(ramActivePct, 1),
    swapBalloonPct: round(swapBalloonPct, 2),
    riskScore,
    risk,
    projected: opts.projected,
    incompleteVmCount: opts.incompleteVmCount ?? 0,
  };
}
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `npm test -- clusterCapacityEngine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/clusterCapacityEngine.ts src/test/clusterCapacityEngine.test.ts
git commit -m "feat: add cluster capacity engine (aggregate & metrics)"
```

---

## Task 3: Kapazitäts-Engine — VM-Lastschätzung & Verschiebung (Nachher)

**Files:**
- Modify: `src/domain/services/clusterCapacityEngine.ts`
- Test: `src/test/clusterCapacityEngine.test.ts` (neue describe-Gruppe)

**Interfaces:**
- Consumes: `ClusterAggregate` (Task 2), `NormalizedVm`, `VmLoadEstimate` (Task 1).
- Produces:
  - `estimateVmLoad(agg: ClusterAggregate, vm: NormalizedVm): VmLoadEstimate`
  - `interface VmMove { vm: NormalizedVm; load: VmLoadEstimate }`
  - `applyVmMoves(agg: ClusterAggregate, moves: { incoming: VmMove[]; outgoing: VmMove[] }): ClusterAggregate`

- [ ] **Step 1: Failing test schreiben**

An `src/test/clusterCapacityEngine.test.ts` anhängen:

```ts
import { applyVmMoves, estimateVmLoad, emptyAggregate } from "@/domain/services/clusterCapacityEngine";
import type { NormalizedVm } from "@/domain/models/types";

function vm(overrides: Partial<NormalizedVm>): NormalizedVm {
  return {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-x", vmUuid: null,
    vmName: "VM-X", cluster: "A", host: "esx-1", powerState: "poweredOn",
    cpuCount: 4, memoryMiB: 16000, provisionedMiB: 40000, inUseMiB: 20000,
    configStatus: null, connectionState: null, consolidationNeeded: null,
    osConfig: null, osTools: null, hwVersion: null, toolsStatus: null,
    toolsVersion: null, datacenter: null, folder: null, resourcePool: null,
    annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
    ...overrides,
  };
}

describe("clusterCapacityEngine – Lastschätzung & Verschiebung (Nachher)", () => {
  // Quell-Aggregat A: 2 Hosts, cpuUsedCoreEquiv=10, vmActiveMiB=100000, vRamMiB=160000, vcpus=40
  const sourceAgg = {
    hosts: 2, totalCores: 20, totalMemoryMiB: 200000, totalVms: 10, vcpus: 40,
    vRamMiB: 160000, vmActiveMiB: 100000, swapBalloonMiB: 0, cpuUsedCoreEquiv: 10,
    memConsumedMiB: 120000, hotHosts: 0, htInactiveHosts: 0,
    cpuMin: 50, cpuMax: 50, memMin: 60, memMax: 60,
  };

  it("schätzt VM-Last proportional zur Konfiguration", () => {
    const load = estimateVmLoad(sourceAgg, vm({ cpuCount: 4, memoryMiB: 16000 }));
    // Anteil RAM: 16000/160000 = 0.1
    expect(load.activeMiB).toBeCloseTo(10000, 3);   // 100000 × 0.1
    expect(load.consumedMiB).toBeCloseTo(12000, 3); // 120000 × 0.1
    expect(load.swapBalloonMiB).toBeCloseTo(0, 3);
    // Anteil CPU: 4/40 = 0.1 → 10 × 0.1
    expect(load.usedCoreEquiv).toBeCloseTo(1, 3);
  });

  it("gibt Nulllast zurück, wenn Bezugsgrößen 0 sind", () => {
    const empty = emptyAggregate();
    const load = estimateVmLoad(empty, vm({}));
    expect(load).toEqual({ activeMiB: 0, consumedMiB: 0, swapBalloonMiB: 0, usedCoreEquiv: 0 });
  });

  it("zieht ausgehende VMs ab und addiert eingehende", () => {
    const movedVm = vm({ vmKey: "vm-1", cpuCount: 4, memoryMiB: 16000 });
    const load = estimateVmLoad(sourceAgg, movedVm);

    const sourceAfter = applyVmMoves(sourceAgg, { incoming: [], outgoing: [{ vm: movedVm, load }] });
    expect(sourceAfter.vcpus).toBe(36);
    expect(sourceAfter.vRamMiB).toBe(144000);
    expect(sourceAfter.vmActiveMiB).toBeCloseTo(90000, 3);
    expect(sourceAfter.cpuUsedCoreEquiv).toBeCloseTo(9, 3);
    expect(sourceAfter.totalVms).toBe(9);
    // Denominatoren unverändert (Hosts bleiben)
    expect(sourceAfter.totalCores).toBe(20);

    const emptyTarget = { ...emptyAggregate(), hosts: 1, totalCores: 10, totalMemoryMiB: 100000 };
    const targetAfter = applyVmMoves(emptyTarget, { incoming: [{ vm: movedVm, load }], outgoing: [] });
    expect(targetAfter.vcpus).toBe(4);
    expect(targetAfter.vRamMiB).toBe(16000);
    expect(targetAfter.vmActiveMiB).toBeCloseTo(10000, 3);
    expect(targetAfter.cpuUsedCoreEquiv).toBeCloseTo(1, 3);
    expect(targetAfter.totalVms).toBe(1);
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `npm test -- clusterCapacityEngine`
Expected: FAIL — `estimateVmLoad` / `applyVmMoves` nicht exportiert.

- [ ] **Step 3: Implementierung ergänzen**

An `src/domain/services/clusterCapacityEngine.ts` anhängen (Import um `NormalizedVm`, `VmLoadEstimate` erweitern):

```ts
import type { NormalizedCluster, NormalizedVm, SheetRow, VmLoadEstimate } from "@/domain/models/types";
```

```ts
export interface VmMove {
  vm: NormalizedVm;
  load: VmLoadEstimate;
}

/** Teilt die gemessene Cluster-Ist-Last proportional zur VM-Konfiguration auf. */
export function estimateVmLoad(agg: ClusterAggregate, vm: NormalizedVm): VmLoadEstimate {
  const ramShare = agg.vRamMiB > 0 ? (vm.memoryMiB ?? 0) / agg.vRamMiB : 0;
  const cpuShare = agg.vcpus > 0 ? (vm.cpuCount ?? 0) / agg.vcpus : 0;
  return {
    activeMiB: agg.vmActiveMiB * ramShare,
    consumedMiB: agg.memConsumedMiB * ramShare,
    swapBalloonMiB: agg.swapBalloonMiB * ramShare,
    usedCoreEquiv: agg.cpuUsedCoreEquiv * cpuShare,
  };
}

/** Wendet ein-/ausgehende VM-Verschiebungen additiv auf ein Aggregat an. Denominatoren (Hosts/Cores/RAM) bleiben unverändert. */
export function applyVmMoves(
  agg: ClusterAggregate,
  moves: { incoming: VmMove[]; outgoing: VmMove[] },
): ClusterAggregate {
  const next: ClusterAggregate = { ...agg };
  for (const { vm, load } of moves.incoming) {
    next.totalVms += 1;
    next.vcpus += vm.cpuCount ?? 0;
    next.vRamMiB += vm.memoryMiB ?? 0;
    next.vmActiveMiB += load.activeMiB;
    next.memConsumedMiB += load.consumedMiB;
    next.swapBalloonMiB += load.swapBalloonMiB;
    next.cpuUsedCoreEquiv += load.usedCoreEquiv;
  }
  for (const { vm, load } of moves.outgoing) {
    next.totalVms -= 1;
    next.vcpus -= vm.cpuCount ?? 0;
    next.vRamMiB -= vm.memoryMiB ?? 0;
    next.vmActiveMiB -= load.activeMiB;
    next.memConsumedMiB -= load.consumedMiB;
    next.swapBalloonMiB -= load.swapBalloonMiB;
    next.cpuUsedCoreEquiv -= load.usedCoreEquiv;
  }
  // Keine negativen Restwerte durch Rundungsdrift.
  next.totalVms = Math.max(0, next.totalVms);
  next.vcpus = Math.max(0, next.vcpus);
  next.vRamMiB = Math.max(0, next.vRamMiB);
  next.vmActiveMiB = Math.max(0, next.vmActiveMiB);
  next.memConsumedMiB = Math.max(0, next.memConsumedMiB);
  next.swapBalloonMiB = Math.max(0, next.swapBalloonMiB);
  next.cpuUsedCoreEquiv = Math.max(0, next.cpuUsedCoreEquiv);
  return next;
}
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `npm test -- clusterCapacityEngine`
Expected: PASS (alle describe-Gruppen).

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/clusterCapacityEngine.ts src/test/clusterCapacityEngine.test.ts
git commit -m "feat: add VM load estimation and move application to capacity engine"
```

---

## Task 4: Capacity-Seite auf Engine umstellen (Refactor, Regression)

**Files:**
- Modify: `src/pages/Capacity.tsx` (Berechnung `clusterCapacity`, ~Zeile 445–590)

**Interfaces:**
- Consumes: `aggregateCluster`, `metricsFromAggregate` (Task 2).

Ziel: Die inline-Cluster-Berechnung nutzt die Engine; sichtbares Verhalten bleibt identisch. Die vorhandenen Felder `hotHosts`, `cpuSpread`, `memorySpread`, `clusterHostDelta`, `clusterMemoryDeltaPct`, die die Tabelle zusätzlich anzeigt, bleiben erhalten (aus dem Aggregat bzw. wie bisher berechnet).

- [ ] **Step 1: Bestandstest als Sicherung ausführen**

Run: `npm test`
Expected: PASS (Ausgangszustand grün, damit spätere Abweichungen zuordenbar sind).

- [ ] **Step 2: Engine importieren**

In `src/pages/Capacity.tsx` oben ergänzen:

```ts
import { aggregateCluster, metricsFromAggregate } from "@/domain/services/clusterCapacityEngine";
```

- [ ] **Step 3: `clusterCapacity`-Berechnung ersetzen**

Die Cluster-Namen kommen weiterhin aus den `rawVHost`-Zeilen. Ersetze den Kern der `clusterCapacity`-`useMemo`-Berechnung so, dass pro Cluster `aggregateCluster` + `metricsFromAggregate` genutzt wird und die Engine-Metriken in die bestehende `ClusterCapacityRow` gemappt werden. Konkret:

```ts
  const clusterCapacity = useMemo<ClusterCapacityRow[]>(() => {
    const clusterNames = new Set<string>();
    for (const r of rawVHost) {
      const name = String(r.data["Cluster"] ?? "").trim();
      if (name) clusterNames.add(name);
    }
    const clusterMap = new Map(clusters.map((c) => [c.name, c]));

    return [...clusterNames].map((name) => {
      const agg = aggregateCluster(name, rawVHost);
      const clusterRef = clusterMap.get(name) ?? null;
      const m = metricsFromAggregate(agg, { clusterName: name, clusterRef, projected: false });
      const datacenter = (() => {
        const row = rawVHost.find((r) => String(r.data["Cluster"] ?? "").trim() === name);
        return row ? String(row.data["Datacenter"] ?? "").trim() || "—" : "—";
      })();
      const cpuSpread = Number.isFinite(agg.cpuMin) && Number.isFinite(agg.cpuMax) ? Math.round((agg.cpuMax - agg.cpuMin) * 10) / 10 : 0;
      const memorySpread = Number.isFinite(agg.memMin) && Number.isFinite(agg.memMax) ? Math.round((agg.memMax - agg.memMin) * 10) / 10 : 0;
      const clusterHostDelta = clusterRef?.numHosts != null ? agg.hosts - clusterRef.numHosts : null;
      const clusterMemoryDeltaPct = clusterRef?.totalMemoryMiB
        ? Math.round(((agg.totalMemoryMiB - clusterRef.totalMemoryMiB) / clusterRef.totalMemoryMiB) * 1000) / 10
        : null;

      return {
        cluster: name,
        datacenter,
        hosts: m.hosts,
        totalCores: m.totalCores,
        totalMemoryMiB: m.totalMemoryMiB,
        totalVms: m.totalVms,
        totalVcpus: m.totalVcpus,
        cpuUsagePct: m.cpuUsagePct,
        memoryUsagePct: m.memoryUsagePct,
        vcpuPerCore: m.vcpuPerCore,
        ramCommitPct: m.ramCommitPct,
        ramActivePct: m.ramActivePct,
        swapBalloonPct: m.swapBalloonPct,
        hotHosts: agg.hotHosts,
        cpuSpread,
        memorySpread,
        drsEnabled: clusterRef?.drsEnabled ?? null,
        haEnabled: clusterRef?.haEnabled ?? null,
        clusterHostDelta,
        clusterMemoryDeltaPct,
        riskScore: m.riskScore,
        risk: m.risk,
      } satisfies ClusterCapacityRow;
    }).sort((a, b) => b.riskScore - a.riskScore || b.vcpuPerCore - a.vcpuPerCore);
  }, [rawVHost, clusters]);
```

Entferne die dadurch überflüssig gewordene manuelle `grouped`-Map-Logik im selben `useMemo`.

- [ ] **Step 4: Typprüfung & Tests**

Run: `npm run build`
Expected: erfolgreicher TypeScript-Build (keine Typfehler).

Run: `npm test`
Expected: PASS (unverändert grün).

- [ ] **Step 5: Sichtprüfung**

Run: `npm run dev`, öffne `/capacity`, vergleiche die Cluster-Tabelle (CPU %, RAM %, vCPU/Core, RAM Commit %, RAM Active %, Swap+Balloon %, Risiko) mit dem vorherigen Stand.
Expected: Werte unverändert; Ampelfarben und Sortierung identisch.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Capacity.tsx
git commit -m "refactor: use cluster capacity engine in Capacity page"
```

---

## Task 5: SelectionProvider (globaler Auswahl-State) + Range-Helfer

**Files:**
- Create: `src/hooks/useSelectionState.tsx`
- Test: `src/test/selectionState.test.ts`

**Interfaces:**
- Consumes: `getUiState`, `putUiState` aus `@/data/db`.
- Produces:
  - `computeRangeSelection(orderedKeys: string[], anchorKey: string | null, targetKey: string): string[]` — die Keys im Bereich Anker→Ziel (inklusiv) in sichtbarer Reihenfolge.
  - `SelectionProvider` (React-Komponente)
  - `useSelectionState(): { selectedKeys: Set<string>; selectedCount: number; isSelected(k: string): boolean; toggle(k: string): void; setMany(keys: string[], selected: boolean): void; clear(): void }`

- [ ] **Step 1: Failing test für Range-Helfer schreiben**

`src/test/selectionState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRangeSelection } from "@/hooks/useSelectionState";

describe("computeRangeSelection", () => {
  const ordered = ["a", "b", "c", "d", "e"];

  it("liefert den inklusiven Bereich vom Anker zum Ziel (vorwärts)", () => {
    expect(computeRangeSelection(ordered, "b", "d")).toEqual(["b", "c", "d"]);
  });

  it("funktioniert rückwärts", () => {
    expect(computeRangeSelection(ordered, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("fällt ohne Anker auf nur das Ziel zurück", () => {
    expect(computeRangeSelection(ordered, null, "c")).toEqual(["c"]);
  });

  it("fällt auf das Ziel zurück, wenn der Anker nicht mehr sichtbar ist", () => {
    expect(computeRangeSelection(ordered, "z", "c")).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `npm test -- selectionState`
Expected: FAIL — Modul/Funktion fehlt.

- [ ] **Step 3: Provider + Helfer implementieren**

`src/hooks/useSelectionState.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getUiState, putUiState } from "@/data/db";

const UI_STATE_ID = "app";

/** Keys zwischen Anker und Ziel (inklusiv) in der übergebenen sichtbaren Reihenfolge. */
export function computeRangeSelection(
  orderedKeys: string[],
  anchorKey: string | null,
  targetKey: string,
): string[] {
  const targetIdx = orderedKeys.indexOf(targetKey);
  if (targetIdx === -1) return [];
  const anchorIdx = anchorKey === null ? -1 : orderedKeys.indexOf(anchorKey);
  if (anchorIdx === -1) return [targetKey];
  const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return orderedKeys.slice(from, to + 1);
}

interface SelectionContextValue {
  selectedKeys: Set<string>;
  selectedCount: number;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  setMany: (keys: string[], selected: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue>({
  selectedKeys: new Set(),
  selectedCount: 0,
  isSelected: () => false,
  toggle: () => {},
  setMany: () => {},
  clear: () => {},
});

export const useSelectionState = () => useContext(SelectionContext);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setMany = useCallback((keys: string[], selected: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (selected) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedKeys(new Set()), []);

  const isSelected = useCallback((key: string) => selectedKeys.has(key), [selectedKeys]);

  // Hydration aus IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getUiState(UI_STATE_ID);
        if (!cancelled && stored?.selectionVmKeys?.length) {
          setSelectedKeys(new Set(stored.selectionVmKeys));
        }
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persistenz bei Änderung
  useEffect(() => {
    if (!hydratedRef.current) return;
    void (async () => {
      const existing = await getUiState(UI_STATE_ID);
      await putUiState({
        id: UI_STATE_ID,
        theme: existing?.theme ?? "dark",
        presets: existing?.presets,
        lastFilter: existing?.lastFilter,
        selectionVmKeys: [...selectedKeys],
      });
    })();
  }, [selectedKeys]);

  const value = useMemo<SelectionContextValue>(() => ({
    selectedKeys,
    selectedCount: selectedKeys.size,
    isSelected,
    toggle,
    setMany,
    clear,
  }), [selectedKeys, isSelected, toggle, setMany, clear]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `npm test -- selectionState`
Expected: PASS.

- [ ] **Step 5: Provider in App einhängen**

In `src/App.tsx`: Import ergänzen und `SelectionProvider` innerhalb von `FilterProvider` um `AppLayout` legen:

```tsx
import { SelectionProvider } from "@/hooks/useSelectionState";
```

```tsx
          <FilterProvider>
            <SelectionProvider>
              <AppLayout>
                {/* ... unverändert ... */}
              </AppLayout>
            </SelectionProvider>
          </FilterProvider>
```

- [ ] **Step 6: Build & Commit**

Run: `npm run build`
Expected: erfolgreicher Build.

```bash
git add src/hooks/useSelectionState.tsx src/test/selectionState.test.ts src/App.tsx
git commit -m "feat: add global selection provider with range helper"
```

---

## Task 6: Selektions-Spalte in VirtualTable (opt-in, Klick/Strg/Shift)

**Files:**
- Modify: `src/components/tables/VirtualTable.tsx`

**Interfaces:**
- Consumes: `useSelectionState`, `computeRangeSelection` (Task 5); `Checkbox` aus `@/components/ui/checkbox`.
- Produces: erweiterte `VirtualTableProps<T>` um `enableSelection?: boolean` und `getRowId?: (row: T) => string`.

- [ ] **Step 1: Prüfen, dass die Checkbox-UI-Komponente existiert**

Run: `ls src/components/ui/checkbox.tsx`
Expected: Datei existiert (shadcn Radix-Checkbox; `@radix-ui/react-checkbox` ist in `package.json`). Falls nicht vorhanden, mit `npx shadcn@latest add checkbox` erzeugen und committen, bevor es weitergeht.

- [ ] **Step 2: Props & Selektionslogik ergänzen**

In `src/components/tables/VirtualTable.tsx`:

(a) Imports ergänzen:

```ts
import { useSelectionState, computeRangeSelection } from "@/hooks/useSelectionState";
import { Checkbox } from "@/components/ui/checkbox";
```

(b) `VirtualTableProps<T>` erweitern:

```ts
interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  globalFilter?: string;
  height?: number;
  className?: string;
  onRowClick?: (row: T) => void;
  exportFileName?: string;
  enableSelection?: boolean;
  getRowId?: (row: T) => string;
}
```

(c) In der Funktionssignatur `enableSelection = false` und `getRowId` destrukturieren. Nach `const { rows } = table.getRowModel();` einfügen:

```ts
  const selection = useSelectionState();
  const anchorRef = useRef<string | null>(null);

  const orderedKeys = useMemo(
    () => (enableSelection && getRowId ? rows.map((r) => getRowId(r.original)) : []),
    [enableSelection, getRowId, rows],
  );

  const allSelected = enableSelection && orderedKeys.length > 0 && orderedKeys.every((k) => selection.isSelected(k));
  const someSelected = enableSelection && orderedKeys.some((k) => selection.isSelected(k));

  const handleSelectionClick = (rowId: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      const range = computeRangeSelection(orderedKeys, anchorRef.current, rowId);
      selection.setMany(range, true);
    } else {
      selection.toggle(rowId);
    }
    anchorRef.current = rowId;
  };
```

`useMemo` und `type React`/`MouseEvent` müssen importiert sein — `import { useMemo, useRef, useState } from "react";` erweitern und `import type { MouseEvent } from "react";` ergänzen (oder `React.MouseEvent` wie oben; dann `import type React from "react"`). Verwende `MouseEvent<HTMLElement>` konsistent.

- [ ] **Step 3: Header-Checkbox rendern**

Im `<thead>`-`<tr>` vor dem `headerGroup.headers.map(...)` eine Selektions-Kopfzelle einfügen (nur wenn `enableSelection`):

```tsx
                {enableSelection && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => selection.setMany(orderedKeys, checked === true)}
                      aria-label="Alle sichtbaren Zeilen auswählen"
                    />
                  </th>
                )}
```

- [ ] **Step 4: Zeilen-Checkbox rendern & Klickkonflikt vermeiden**

In der Zeilen-`map` vor `row.getVisibleCells().map(...)` einfügen:

```tsx
                  {enableSelection && getRowId && (
                    <td className="w-10 px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.isSelected(getRowId(row.original))}
                        onClick={(e) => handleSelectionClick(getRowId(row.original), e)}
                        aria-label="Zeile auswählen"
                      />
                    </td>
                  )}
```

Das `onClick={(e) => e.stopPropagation()}` an der `<td>` verhindert, dass `onRowClick` beim Selektieren feuert.

- [ ] **Step 5: colSpan der Padding-Zeilen korrigieren**

Die beiden Virtualizer-Padding-`<td>` nutzen `colSpan={columns.length}`. Ersetze beide durch:

```tsx
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
```

- [ ] **Step 6: Build & manuelle Prüfung**

Run: `npm run build`
Expected: erfolgreicher Build.

Vorläufige Sichtprüfung erfolgt in Task 10 (wenn die Planning-Seite die Tabelle mit `enableSelection` nutzt). Hier genügt der grüne Build.

- [ ] **Step 7: Commit**

```bash
git add src/components/tables/VirtualTable.tsx
git commit -m "feat: add opt-in selection column with ctrl/shift to VirtualTable"
```

---

## Task 7: Planungs-Helfer (Gruppen, betroffene Cluster, Vorher/Nachher, Ziel-Storage)

**Files:**
- Create: `src/domain/services/scenarioPlanning.ts`
- Test: `src/test/scenarioPlanning.test.ts`

**Interfaces:**
- Consumes: `NormalizedVm`, `NormalizedHost`, `NormalizedCluster`, `NormalizedDatastore`, `SheetRow`, `ScenarioGroup` (Task 1); Engine-Funktionen `aggregateCluster`, `estimateVmLoad`, `applyVmMoves`, `metricsFromAggregate`, `ClusterMetrics`, `VmMove` (Tasks 2–3).
- Produces:
  - `assignVmsToGroup(groups: ScenarioGroup[], workingKeys: string[], targetClusterKey: string, makeId: () => string): ScenarioGroup[]` — verschiebt Keys aus anderen Gruppen weg (VM nur in einer Gruppe) und legt/erweitert die Zielgruppe an.
  - `interface AffectedCluster { clusterName: string; before: ClusterMetrics; after: ClusterMetrics }`
  - `interface TargetStorage { clusterKey: string; movedProvisionedMiB: number; movedInUseMiB: number; freeMiB: number; fitsProvisioned: boolean; fitsInUse: boolean }`
  - `computeAffectedClusters(input: { groups: ScenarioGroup[]; vms: NormalizedVm[]; clusters: NormalizedCluster[]; rawVHost: SheetRow[] }): AffectedCluster[]`
  - `computeTargetStorage(input: { groups: ScenarioGroup[]; vms: NormalizedVm[]; clusters: NormalizedCluster[]; datastores: NormalizedDatastore[] }): TargetStorage[]`

- [ ] **Step 1: Failing test schreiben**

`src/test/scenarioPlanning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignVmsToGroup, computeAffectedClusters, computeTargetStorage } from "@/domain/services/scenarioPlanning";
import type { NormalizedCluster, NormalizedDatastore, NormalizedVm, ScenarioGroup, SheetRow } from "@/domain/models/types";

let idCounter = 0;
const makeId = () => `grp-${++idCounter}`;

function vm(o: Partial<NormalizedVm>): NormalizedVm {
  return {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-x", vmUuid: null,
    vmName: "VM-X", cluster: "A", host: "esx-1", powerState: "poweredOn",
    cpuCount: 4, memoryMiB: 16000, provisionedMiB: 40000, inUseMiB: 20000,
    configStatus: null, connectionState: null, consolidationNeeded: null,
    osConfig: null, osTools: null, hwVersion: null, toolsStatus: null,
    toolsVersion: null, datacenter: null, folder: null, resourcePool: null,
    annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null, ...o,
  };
}

describe("assignVmsToGroup", () => {
  it("legt eine neue Gruppe an und stellt sicher, dass eine VM nur in einer Gruppe ist", () => {
    let groups: ScenarioGroup[] = [];
    groups = assignVmsToGroup(groups, ["vm-1", "vm-2"], "cl-target", makeId);
    expect(groups).toHaveLength(1);
    expect(groups[0].vmKeys).toEqual(["vm-1", "vm-2"]);

    // vm-2 einer anderen Zielgruppe zuweisen → wird aus erster Gruppe entfernt
    groups = assignVmsToGroup(groups, ["vm-2"], "cl-other", makeId);
    const target = groups.find((g) => g.targetClusterKey === "cl-target")!;
    const other = groups.find((g) => g.targetClusterKey === "cl-other")!;
    expect(target.vmKeys).toEqual(["vm-1"]);
    expect(other.vmKeys).toEqual(["vm-2"]);
  });
});

describe("computeAffectedClusters", () => {
  const clusters: NormalizedCluster[] = [
    { snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cl-A", name: "A", datacenter: "DC1", haEnabled: true, drsEnabled: true, numHosts: 2, numCpuCores: 20, numCpuThreads: 40, totalMemoryMiB: 200000, totalCpuMHz: 50000, numEffectiveHosts: 2 },
    { snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cl-T", name: "T", datacenter: "DC1", haEnabled: true, drsEnabled: true, numHosts: 1, numCpuCores: 10, numCpuThreads: 20, totalMemoryMiB: 100000, totalCpuMHz: 25000, numEffectiveHosts: 1 },
  ];
  function hostRow(cluster: string, host: string): SheetRow {
    return { snapshotId: "snap-1", sheetName: "vHost", rowIndex: 0, data: {
      Cluster: cluster, Host: host, Datacenter: "DC1", "# Cores": 10, "# Memory": 100000,
      "CPU usage %": 50, "Memory usage %": 60, "# VMs": 5, "# vCPUs": 20, vRAM: 80000,
      "VM Used memory": 50000, "VM Memory Swapped": 0, "VM Memory Ballooned": 0,
      "HT Available": true, "HT Active": true } };
  }
  const rawVHost = [hostRow("A", "esx-1"), hostRow("A", "esx-2"), hostRow("T", "esx-t1")];
  const vms = [vm({ vmKey: "vm-1", cluster: "A", cpuCount: 4, memoryMiB: 16000 })];

  it("liefert Vorher/Nachher für Quell- und Zielcluster", () => {
    const groups: ScenarioGroup[] = [{ id: "g1", label: null, targetClusterKey: "cl-T", vmKeys: ["vm-1"] }];
    const affected = computeAffectedClusters({ groups, vms, clusters, rawVHost });
    const source = affected.find((a) => a.clusterName === "A")!;
    const target = affected.find((a) => a.clusterName === "T")!;

    // Quelle: vCPU/Core sinkt von 2 auf 1.8; Ziel: exakt 0.4
    expect(source.before.vcpuPerCore).toBeCloseTo(2, 2);
    expect(source.after.vcpuPerCore).toBeCloseTo(1.8, 2);
    expect(source.after.projected).toBe(true);
    expect(target.before.vcpuPerCore).toBeCloseTo(0, 2);
    expect(target.after.vcpuPerCore).toBeCloseTo(0.4, 2);
    expect(target.after.ramCommitPct).toBeCloseTo(16, 1); // 16000/100000
  });
});

describe("computeTargetStorage", () => {
  const clusters: NormalizedCluster[] = [
    { snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cl-T", name: "T", datacenter: "DC1", haEnabled: true, drsEnabled: true, numHosts: 1, numCpuCores: 10, numCpuThreads: 20, totalMemoryMiB: 100000, totalCpuMHz: 25000, numEffectiveHosts: 1 },
  ];
  const datastores: NormalizedDatastore[] = [
    { snapshotId: "snap-1", vcenterId: "vc-1", dsKey: "ds-1", name: "DS-T", clusterName: "T", type: "VMFS", capacityMiB: 100000, inUseMiB: 40000, freeMiB: 60000, freePct: 60, version: null, siocEnabled: null },
  ];
  const vms = [vm({ vmKey: "vm-1", provisionedMiB: 40000, inUseMiB: 20000 })];

  it("summiert verschobene Größe und prüft Passung gegen freien Ziel-Speicher", () => {
    const groups: ScenarioGroup[] = [{ id: "g1", label: null, targetClusterKey: "cl-T", vmKeys: ["vm-1"] }];
    const storage = computeTargetStorage({ groups, vms, clusters, datastores });
    expect(storage).toHaveLength(1);
    expect(storage[0].movedProvisionedMiB).toBe(40000);
    expect(storage[0].movedInUseMiB).toBe(20000);
    expect(storage[0].freeMiB).toBe(60000);
    expect(storage[0].fitsProvisioned).toBe(true);  // 40000 <= 60000
    expect(storage[0].fitsInUse).toBe(true);         // 20000 <= 60000
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `npm test -- scenarioPlanning`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementierung schreiben**

`src/domain/services/scenarioPlanning.ts`:

```ts
import type {
  NormalizedCluster, NormalizedDatastore, NormalizedVm, ScenarioGroup, SheetRow,
} from "@/domain/models/types";
import {
  aggregateCluster, applyVmMoves, estimateVmLoad, metricsFromAggregate,
  type ClusterMetrics, type VmMove,
} from "@/domain/services/clusterCapacityEngine";

/** Weist Arbeitsauswahl-Keys einer Zielgruppe zu. Eine VM ist immer nur in einer Gruppe. */
export function assignVmsToGroup(
  groups: ScenarioGroup[],
  workingKeys: string[],
  targetClusterKey: string,
  makeId: () => string,
): ScenarioGroup[] {
  const keySet = new Set(workingKeys);
  // Aus allen anderen Gruppen entfernen
  const cleaned = groups.map((g) => ({ ...g, vmKeys: g.vmKeys.filter((k) => !keySet.has(k)) }));
  const existing = cleaned.find((g) => g.targetClusterKey === targetClusterKey);
  if (existing) {
    const merged = [...existing.vmKeys];
    for (const k of workingKeys) if (!merged.includes(k)) merged.push(k);
    existing.vmKeys = merged;
  } else {
    cleaned.push({ id: makeId(), label: null, targetClusterKey, vmKeys: [...workingKeys] });
  }
  // Leere Gruppen verwerfen
  return cleaned.filter((g) => g.vmKeys.length > 0);
}

export interface AffectedCluster {
  clusterName: string;
  before: ClusterMetrics;
  after: ClusterMetrics;
}

export interface TargetStorage {
  clusterKey: string;
  clusterName: string;
  movedProvisionedMiB: number;
  movedInUseMiB: number;
  freeMiB: number;
  fitsProvisioned: boolean;
  fitsInUse: boolean;
}

function isIncomplete(vm: NormalizedVm): boolean {
  return vm.cpuCount == null || vm.memoryMiB == null;
}

export function computeAffectedClusters(input: {
  groups: ScenarioGroup[];
  vms: NormalizedVm[];
  clusters: NormalizedCluster[];
  rawVHost: SheetRow[];
}): AffectedCluster[] {
  const { groups, vms, clusters, rawVHost } = input;
  const vmByKey = new Map(vms.map((v) => [v.vmKey, v]));
  const clusterByKey = new Map(clusters.map((c) => [c.clusterKey, c]));
  const clusterByName = new Map(clusters.map((c) => [c.name, c]));

  // Ausgehend je Quellcluster (Name), eingehend je Zielcluster (Name)
  const outgoing = new Map<string, VmMove[]>();
  const incoming = new Map<string, VmMove[]>();
  const affectedNames = new Set<string>();

  // Aggregate der Quellcluster einmalig, um die Lastschätzung zu speisen
  const aggCache = new Map<string, ReturnType<typeof aggregateCluster>>();
  const aggFor = (name: string) => {
    let a = aggCache.get(name);
    if (!a) { a = aggregateCluster(name, rawVHost); aggCache.set(name, a); }
    return a;
  };

  for (const group of groups) {
    const targetCluster = clusterByKey.get(group.targetClusterKey);
    if (!targetCluster) continue;
    const targetName = targetCluster.name;
    affectedNames.add(targetName);
    for (const vmKey of group.vmKeys) {
      const vm = vmByKey.get(vmKey);
      if (!vm || !vm.cluster) continue;
      if (vm.cluster === targetName) continue; // no-op: VM bleibt im eigenen Cluster
      affectedNames.add(vm.cluster);
      const load = estimateVmLoad(aggFor(vm.cluster), vm);
      const move: VmMove = { vm, load };
      (outgoing.get(vm.cluster) ?? outgoing.set(vm.cluster, []).get(vm.cluster)!).push(move);
      (incoming.get(targetName) ?? incoming.set(targetName, []).get(targetName)!).push(move);
    }
  }

  const incompleteByName = new Map<string, number>();
  for (const [name, moves] of outgoing) {
    incompleteByName.set(name, moves.filter((m) => isIncomplete(m.vm)).length);
  }
  for (const [name, moves] of incoming) {
    incompleteByName.set(name, (incompleteByName.get(name) ?? 0) + moves.filter((m) => isIncomplete(m.vm)).length);
  }

  const result: AffectedCluster[] = [];
  for (const name of affectedNames) {
    const base = aggFor(name);
    const ref = clusterByName.get(name) ?? null;
    const before = metricsFromAggregate(base, { clusterName: name, clusterRef: ref, projected: false });
    const after = metricsFromAggregate(
      applyVmMoves(base, { incoming: incoming.get(name) ?? [], outgoing: outgoing.get(name) ?? [] }),
      { clusterName: name, clusterRef: ref, projected: true, incompleteVmCount: incompleteByName.get(name) ?? 0 },
    );
    result.push({ clusterName: name, before, after });
  }
  return result.sort((a, b) => b.after.riskScore - a.after.riskScore);
}

export function computeTargetStorage(input: {
  groups: ScenarioGroup[];
  vms: NormalizedVm[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
}): TargetStorage[] {
  const { groups, vms, clusters, datastores } = input;
  const vmByKey = new Map(vms.map((v) => [v.vmKey, v]));
  const clusterByKey = new Map(clusters.map((c) => [c.clusterKey, c]));

  return groups.map((group) => {
    const cluster = clusterByKey.get(group.targetClusterKey);
    const clusterName = cluster?.name ?? group.targetClusterKey;
    let movedProvisionedMiB = 0;
    let movedInUseMiB = 0;
    for (const vmKey of group.vmKeys) {
      const vm = vmByKey.get(vmKey);
      if (!vm) continue;
      movedProvisionedMiB += vm.provisionedMiB ?? 0;
      movedInUseMiB += vm.inUseMiB ?? 0;
    }
    const freeMiB = datastores
      .filter((d) => d.clusterName === clusterName)
      .reduce((s, d) => s + (d.freeMiB ?? 0), 0);
    return {
      clusterKey: group.targetClusterKey,
      clusterName,
      movedProvisionedMiB,
      movedInUseMiB,
      freeMiB,
      fitsProvisioned: movedProvisionedMiB <= freeMiB,
      fitsInUse: movedInUseMiB <= freeMiB,
    };
  });
}
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `npm test -- scenarioPlanning`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/scenarioPlanning.ts src/test/scenarioPlanning.test.ts
git commit -m "feat: add scenario planning helpers (groups, affected clusters, storage)"
```

---

## Task 8: Planungs-Orchestrierungs-Hook

**Files:**
- Create: `src/hooks/useScenarioPlanning.ts`

**Interfaces:**
- Consumes: `useVms`/`useClusters`/`useDatastores`/`useRawSheet`/`useActiveSnapshotIds` aus `@/hooks/useActiveSnapshots`; `useSelectionState` (Task 5); `assignVmsToGroup`/`computeAffectedClusters`/`computeTargetStorage` (Task 7); `getScenarios`/`putScenario`/`deleteScenario` (Task 1); `Scenario`/`ScenarioGroup` (Task 1).
- Produces:
  - `useScenarioPlanning()` mit: `groups`, `assignSelectionTo(targetClusterKey)`, `removeGroup(groupId)`, `renameGroup(groupId, label)`, `resetGroups()`, `affectedClusters`, `targetStorage`, `saveScenario(name)`, `loadScenario(id)`, `deleteScenarioById(id)`, `scenarios`, `refreshScenarios()`, `activeScenarioId`, `orphanWarnings: string[]`.

- [ ] **Step 1: Hook implementieren**

`src/hooks/useScenarioPlanning.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { useVms, useClusters, useDatastores, useRawSheet, useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { useSelectionState } from "@/hooks/useSelectionState";
import {
  assignVmsToGroup, computeAffectedClusters, computeTargetStorage,
} from "@/domain/services/scenarioPlanning";
import { getScenarios, putScenario, deleteScenario } from "@/data/db";
import type { Scenario, ScenarioGroup } from "@/domain/models/types";

function newId(prefix: string): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${prefix}-${rnd}`;
}

export function useScenarioPlanning() {
  const { allVms: vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: datastores = [] } = useDatastores();
  const { data: rawVHost = [] } = useRawSheet("vHost");
  const { activeSnapshotIds, snapshots } = useActiveSnapshotIds();
  const selection = useSelectionState();

  const [groups, setGroups] = useState<ScenarioGroup[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const refreshScenarios = useCallback(async () => {
    setScenarios(await getScenarios());
  }, []);

  useEffect(() => { void refreshScenarios(); }, [refreshScenarios]);

  const assignSelectionTo = useCallback((targetClusterKey: string) => {
    const workingKeys = [...selection.selectedKeys];
    if (workingKeys.length === 0) return;
    setGroups((prev) => assignVmsToGroup(prev, workingKeys, targetClusterKey, () => newId("grp")));
    selection.clear();
  }, [selection]);

  const removeGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const renameGroup = useCallback((groupId: string, label: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, label: label || null } : g)));
  }, []);

  const resetGroups = useCallback(() => {
    setGroups([]);
    setActiveScenarioId(null);
  }, []);

  const affectedClusters = useMemo(
    () => computeAffectedClusters({ groups, vms, clusters, rawVHost }),
    [groups, vms, clusters, rawVHost],
  );

  const targetStorage = useMemo(
    () => computeTargetStorage({ groups, vms, clusters, datastores }),
    [groups, vms, clusters, datastores],
  );

  const vmKeySet = useMemo(() => new Set(vms.map((v) => v.vmKey)), [vms]);
  const clusterKeySet = useMemo(() => new Set(clusters.map((c) => c.clusterKey)), [clusters]);

  const orphanWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const g of groups) {
      if (!clusterKeySet.has(g.targetClusterKey)) warnings.push(`Zielcluster nicht im Import: ${g.targetClusterKey}`);
      const missing = g.vmKeys.filter((k) => !vmKeySet.has(k));
      if (missing.length) warnings.push(`${missing.length} VM(s) einer Gruppe nicht mehr im Import`);
    }
    return warnings;
  }, [groups, clusterKeySet, vmKeySet]);

  const saveScenario = useCallback(async (name: string) => {
    const now = new Date().toISOString();
    const vcenterScope = [...new Set(snapshots
      .filter((s) => activeSnapshotIds.includes(s.snapshotId))
      .map((s) => s.vcenterId))];
    const existing = activeScenarioId ? scenarios.find((s) => s.id === activeScenarioId) : null;
    const scenario: Scenario = {
      id: activeScenarioId ?? newId("scn"),
      name,
      type: "cluster-migration",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      vcenterScope,
      groups,
      notes: existing?.notes ?? null,
    };
    await putScenario(scenario);
    setActiveScenarioId(scenario.id);
    await refreshScenarios();
  }, [activeScenarioId, scenarios, groups, snapshots, activeSnapshotIds, refreshScenarios]);

  const loadScenario = useCallback((id: string) => {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    setGroups(scenario.groups);
    setActiveScenarioId(scenario.id);
    selection.clear();
  }, [scenarios, selection]);

  const deleteScenarioById = useCallback(async (id: string) => {
    await deleteScenario(id);
    if (activeScenarioId === id) resetGroups();
    await refreshScenarios();
  }, [activeScenarioId, resetGroups, refreshScenarios]);

  return {
    groups, assignSelectionTo, removeGroup, renameGroup, resetGroups,
    affectedClusters, targetStorage, orphanWarnings,
    saveScenario, loadScenario, deleteScenarioById,
    scenarios, refreshScenarios, activeScenarioId,
  };
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: erfolgreicher Build (Typprüfung deckt Signatur-Fehler ab). Die Logikbausteine sind bereits über Task 7 getestet.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScenarioPlanning.ts
git commit -m "feat: add scenario planning orchestration hook"
```

---

## Task 9: Vergleichsdialog

**Files:**
- Create: `src/components/planning/ScenarioCompareDialog.tsx`

**Interfaces:**
- Consumes: `Dialog`-Primitive aus `@/components/ui/dialog`; `Button`; `AffectedCluster`, `TargetStorage` (Task 7); `CAPACITY_THRESHOLDS` (Task 2); `formatBytes` aus `@/lib/xlsx/parseHelpers`.
- Produces: `ScenarioCompareDialog`-Komponente mit Props `{ open, onOpenChange, affected: AffectedCluster[], storage: TargetStorage[], onSave: (name: string) => void, defaultName: string, isUpdate: boolean }`.

- [ ] **Step 1: Komponente implementieren**

`src/components/planning/ScenarioCompareDialog.tsx`:

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { CAPACITY_THRESHOLDS } from "@/domain/services/clusterCapacityEngine";
import type { AffectedCluster, TargetStorage } from "@/domain/services/scenarioPlanning";

interface MetricRow {
  label: string;
  before: number;
  after: number;
  unit: string;
  higherIsWorse: boolean;
  danger?: number;
}

function buildRows(a: AffectedCluster): MetricRow[] {
  return [
    { label: "CPU %", before: a.before.cpuUsagePct, after: a.after.cpuUsagePct, unit: "%", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.cpuUsage.danger },
    { label: "RAM %", before: a.before.memoryUsagePct, after: a.after.memoryUsagePct, unit: "%", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.memoryUsage.danger },
    { label: "vCPU/Core", before: a.before.vcpuPerCore, after: a.after.vcpuPerCore, unit: "", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.vcpuPerCore.danger },
    { label: "RAM Commit %", before: a.before.ramCommitPct, after: a.after.ramCommitPct, unit: "%", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.ramCommit.danger },
    { label: "RAM Active %", before: a.before.ramActivePct, after: a.after.ramActivePct, unit: "%", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.ramActive.danger },
    { label: "Swap+Balloon %", before: a.before.swapBalloonPct, after: a.after.swapBalloonPct, unit: "%", higherIsWorse: true, danger: CAPACITY_THRESHOLDS.swapBalloon.danger },
    { label: "VMs", before: a.before.totalVms, after: a.after.totalVms, unit: "", higherIsWorse: false },
    { label: "Risk-Score", before: a.before.riskScore, after: a.after.riskScore, unit: "", higherIsWorse: true },
  ];
}

function deltaClass(row: MetricRow): string {
  const delta = row.after - row.before;
  if (Math.abs(delta) < 0.05) return "text-muted-foreground";
  const worse = row.higherIsWorse ? delta > 0 : delta < 0;
  return worse ? "text-destructive" : "text-success";
}

export function ScenarioCompareDialog({
  open, onOpenChange, affected, storage, onSave, defaultName, isUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affected: AffectedCluster[];
  storage: TargetStorage[];
  onSave: (name: string) => void;
  defaultName: string;
  isUpdate: boolean;
}) {
  const [name, setName] = useState(defaultName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Szenario-Vergleich (Vorher → Nachher)</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Ist-basierte Werte (CPU %, RAM %, RAM Active %, Swap+Balloon %) im Nachher-Zustand sind
          <strong> geschätzt/projiziert</strong> (proportional zur VM-Größe). vCPU/Core und RAM Commit % sind exakt.
        </p>

        <div className="space-y-4">
          {affected.map((a) => {
            const rows = buildRows(a);
            const store = storage.find((s) => s.clusterName === a.clusterName);
            const warnings: string[] = [];
            if (a.after.vcpuPerCore > CAPACITY_THRESHOLDS.vcpuPerCore.danger) warnings.push(`vCPU/Core überschreitet ${CAPACITY_THRESHOLDS.vcpuPerCore.danger}:1`);
            if (a.after.ramCommitPct > CAPACITY_THRESHOLDS.ramCommit.danger) warnings.push(`RAM Commit überschreitet ${CAPACITY_THRESHOLDS.ramCommit.danger}%`);
            if (store && !store.fitsProvisioned) warnings.push("Ziel-Datastore-Platz reicht nicht für provisionierte Größe");
            if (a.after.incompleteVmCount > 0) warnings.push(`${a.after.incompleteVmCount} VM(s) mit unvollständigen Daten (konservativ gerechnet)`);

            return (
              <div key={a.clusterName} className="rounded-md border border-border/50 p-4">
                <h3 className="mb-2 text-sm font-semibold">{a.clusterName}</h3>
                {warnings.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1 rounded bg-destructive/10 p-2 text-xs text-destructive">
                    {warnings.map((w) => (
                      <span key={w} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{w}</span>
                    ))}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground">
                      <th className="text-left font-medium">Metrik</th>
                      <th className="text-right font-medium">Vorher</th>
                      <th className="text-right font-medium">Nachher</th>
                      <th className="text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const delta = row.after - row.before;
                      return (
                        <tr key={row.label} className="border-t border-border/30">
                          <td className="py-1">{row.label}</td>
                          <td className="py-1 text-right tabular-nums">{row.before.toFixed(row.unit === "" && row.label !== "vCPU/Core" ? 0 : 2)}{row.unit}</td>
                          <td className="py-1 text-right tabular-nums">{row.after.toFixed(row.unit === "" && row.label !== "vCPU/Core" ? 0 : 2)}{row.unit}</td>
                          <td className={`py-1 text-right tabular-nums ${deltaClass(row)}`}>{delta > 0 ? "+" : ""}{delta.toFixed(row.unit === "" && row.label !== "vCPU/Core" ? 0 : 2)}{row.unit}</td>
                        </tr>
                      );
                    })}
                    {store && (
                      <tr className="border-t border-border/30">
                        <td className="py-1">Storage verschoben (prov. / belegt)</td>
                        <td className="py-1 text-right" colSpan={2}>{formatBytes(store.movedProvisionedMiB)} / {formatBytes(store.movedInUseMiB)}</td>
                        <td className={`py-1 text-right ${store.fitsProvisioned ? "text-success" : "text-destructive"}`}>frei: {formatBytes(store.freeMiB)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Szenario-Name"
            className="max-w-xs"
          />
          <Button onClick={() => onSave(name)} disabled={!name.trim()}>
            {isUpdate ? "Aktualisieren" : "Szenario speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: erfolgreicher Build. Prüfe, dass `DialogFooter` aus `@/components/ui/dialog` exportiert wird; falls nicht, den vorhandenen Footer-Bereich analog `ClusterDetailDialog` verwenden (dort nachsehen, welche Dialog-Teile importiert werden) und anpassen.

- [ ] **Step 3: Commit**

```bash
git add src/components/planning/ScenarioCompareDialog.tsx
git commit -m "feat: add scenario comparison dialog"
```

---

## Task 10: Schwebende Leiste, Szenario-Liste, Planning-Seite & Verdrahtung

**Files:**
- Create: `src/components/planning/PlanningBar.tsx`
- Create: `src/components/planning/ScenarioList.tsx`
- Create: `src/pages/Planning.tsx`
- Modify: `src/app/layout/AppLayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/layout/AppSidebar.tsx`

**Interfaces:**
- Consumes: `useScenarioPlanning` (Task 8), `useSelectionState` (Task 5), `useClusters`/`useVms`/`useVmsWithTechInfo` (bestehend), `VirtualTable` mit `enableSelection`/`getRowId` (Task 6), `ScenarioCompareDialog` (Task 9), `FilterBar` (bestehend).

- [ ] **Step 1: Schwebende Leiste implementieren**

`src/components/planning/PlanningBar.tsx`:

```tsx
import { useState } from "react";
import { useSelectionState } from "@/hooks/useSelectionState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import type { NormalizedCluster } from "@/domain/models/types";
import type { AffectedCluster } from "@/domain/services/scenarioPlanning";
import type { ScenarioGroup } from "@/domain/models/types";

export function PlanningBar({
  clusters, groups, affected, onAssign, onRemoveGroup, onOpenCompare, onSave, hasScenario,
}: {
  clusters: NormalizedCluster[];
  groups: ScenarioGroup[];
  affected: AffectedCluster[];
  onAssign: (targetClusterKey: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onOpenCompare: () => void;
  onSave: () => void;
  hasScenario: boolean;
}) {
  const selection = useSelectionState();
  const [target, setTarget] = useState<string>("");
  const [expanded, setExpanded] = useState(true);

  if (selection.selectedCount === 0 && groups.length === 0) return null;

  const clusterName = (key: string) => clusters.find((c) => c.clusterKey === key)?.name ?? key;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Arbeitsauswahl: {selection.selectedCount} VMs</span>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Zielcluster wählen" /></SelectTrigger>
            <SelectContent>
              {clusters.map((c) => <SelectItem key={c.clusterKey} value={c.clusterKey}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!target || selection.selectedCount === 0} onClick={() => { onAssign(target); }}>
            + Gruppe
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={groups.length === 0} onClick={onOpenCompare}>Vergleich öffnen</Button>
            <Button size="sm" disabled={groups.length === 0} onClick={onSave}>{hasScenario ? "Aktualisieren" : "Szenario speichern"}</Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded((v) => !v)} aria-label="Leiste ein-/ausklappen">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Badge key={g.id} variant="outline" className="gap-1">
                {g.label ?? clusterName(g.targetClusterKey)}: {g.vmKeys.length} VMs
                <button onClick={() => onRemoveGroup(g.id)} aria-label="Gruppe entfernen"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}

        {expanded && affected.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {affected.map((a) => (
              <span key={a.clusterName} className="whitespace-nowrap">
                <strong>{a.clusterName}</strong>{" "}
                CPU {a.before.cpuUsagePct.toFixed(0)}→<span className={a.after.cpuUsagePct > 85 ? "text-destructive" : a.after.cpuUsagePct > 75 ? "text-warning" : "text-success"}>{a.after.cpuUsagePct.toFixed(0)}%</span>{" · "}
                RAM {a.before.memoryUsagePct.toFixed(0)}→<span className={a.after.memoryUsagePct > 90 ? "text-destructive" : a.after.memoryUsagePct > 80 ? "text-warning" : "text-success"}>{a.after.memoryUsagePct.toFixed(0)}%</span>{" · "}
                vCPU/Core {a.before.vcpuPerCore.toFixed(2)}→<span className={a.after.vcpuPerCore > 6 ? "text-destructive" : a.after.vcpuPerCore > 4 ? "text-warning" : ""}>{a.after.vcpuPerCore.toFixed(2)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

Prüfe die Select-Komponenten-Exporte in `src/components/ui/select.tsx` (shadcn-Standard: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`). Bei Abweichung anpassen.

- [ ] **Step 2: Szenario-Liste implementieren**

`src/components/planning/ScenarioList.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, FolderOpen } from "lucide-react";
import type { Scenario } from "@/domain/models/types";

export function ScenarioList({
  scenarios, activeScenarioId, onLoad, onDelete,
}: {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine gespeicherten Szenarien.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scenarios.map((s) => {
        const vmCount = s.groups.reduce((n, g) => n + g.vmKeys.length, 0);
        const clusterCount = new Set(s.groups.map((g) => g.targetClusterKey)).size;
        return (
          <Card key={s.id} className={`p-3 ${s.id === activeScenarioId ? "border-primary" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">{s.name}</h4>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.updatedAt).toLocaleDateString("de-DE")} · {vmCount} VMs · {clusterCount} Zielcluster
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onLoad(s.id)}><FolderOpen className="mr-1 h-3 w-3" />Öffnen</Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)} aria-label="Szenario löschen"><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Planning-Seite implementieren**

`src/pages/Planning.tsx`:

```tsx
import { useMemo, useState } from "react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { ScenarioList } from "@/components/planning/ScenarioList";
import { ScenarioCompareDialog } from "@/components/planning/ScenarioCompareDialog";
import { useVms, useClusters } from "@/hooks/useActiveSnapshots";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { useScenarioPlanning } from "@/hooks/useScenarioPlanning";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedVm } from "@/domain/models/types";

const vmColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cpuCount", header: "vCPU" },
  { accessorKey: "memoryMiB", header: "RAM (MiB)" },
  { accessorKey: "powerState", header: "Power" },
];

export default function Planning() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const planning = useScenarioPlanning();
  const [compareOpen, setCompareOpen] = useState(false);

  const getRowId = useMemo(() => (row: NormalizedVm) => row.vmKey, []);

  if (activeSnapshotIds.length === 0) {
    return <EmptyState title="Keine Daten" description="Bitte zuerst einen RVTools-Export importieren." />;
  }

  const defaultName = planning.activeScenarioId
    ? planning.scenarios.find((s) => s.id === planning.activeScenarioId)?.name ?? "Szenario"
    : "Neues Szenario";

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="text-xl font-semibold">Cluster-Planung</h1>
        <p className="text-sm text-muted-foreground">VMs auswählen, Zielclustern zuweisen und Auslastung vergleichen.</p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Gespeicherte Szenarien</h2>
          <button className="text-xs text-primary underline" onClick={planning.resetGroups}>Neues Szenario</button>
        </div>
        <ScenarioList
          scenarios={planning.scenarios}
          activeScenarioId={planning.activeScenarioId}
          onLoad={planning.loadScenario}
          onDelete={(id) => { void planning.deleteScenarioById(id); }}
        />
      </section>

      {planning.orphanWarnings.length > 0 && (
        <div className="rounded bg-warning/10 p-2 text-xs text-warning">
          {planning.orphanWarnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}

      <section className="space-y-2">
        <FilterBar />
        <VirtualTable
          data={vms}
          columns={vmColumns}
          enableSelection
          getRowId={getRowId}
          exportFileName="rvtools-planning-vms"
        />
      </section>

      <ScenarioCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        affected={planning.affectedClusters}
        storage={planning.targetStorage}
        defaultName={defaultName}
        isUpdate={planning.activeScenarioId !== null}
        onSave={(name) => {
          void planning.saveScenario(name).then(() => {
            toast.success("Szenario gespeichert.");
            setCompareOpen(false);
          });
        }}
      />

      {/* PlanningBar wird global in AppLayout gerendert */}
    </div>
  );
}
```

Hinweis: Die `PlanningBar` benötigt Zugriff auf denselben `useScenarioPlanning`-State wie die Seite. Da der Planungs-State seitenlokal ist, die Leiste aber global sichtbar sein soll, wird die Leiste **auf der Planning-Seite** gerendert (nicht in AppLayout), und der globale Selektions-Hinweis auf anderen Seiten beschränkt sich auf einen schlanken „X VMs ausgewählt → zur Planung"-Hinweis. Passe daher Step 4 an: In AppLayout wird nur ein **minimaler globaler Selektions-Hinweis** gerendert; die volle Leiste lebt auf `/planning`.

Ergänze am Ende der Planning-Seite (vor dem letzten schließenden `</div>`) die volle Leiste:

```tsx
      <PlanningBar
        clusters={clusters}
        groups={planning.groups}
        affected={planning.affectedClusters}
        onAssign={planning.assignSelectionTo}
        onRemoveGroup={planning.removeGroup}
        onOpenCompare={() => setCompareOpen(true)}
        onSave={() => setCompareOpen(true)}
        hasScenario={planning.activeScenarioId !== null}
      />
```

und den Import `import { PlanningBar } from "@/components/planning/PlanningBar";`.

- [ ] **Step 4: Globaler Selektions-Hinweis in AppLayout**

In `src/app/layout/AppLayout.tsx` einen schlanken Hinweis rendern, der nur erscheint, wenn außerhalb von `/planning` etwas ausgewählt ist. Import ergänzen:

```tsx
import { useSelectionState } from "@/hooks/useSelectionState";
import { Link, useLocation } from "react-router-dom";
```

Im Komponentenkörper vor dem `return`:

```tsx
  const selection = useSelectionState();
  const location = useLocation();
  const showSelectionHint = selection.selectedCount > 0 && location.pathname !== "/planning";
```

Direkt vor dem schließenden `</div>` der äußeren Flex-Container einen fixierten Hinweis einfügen:

```tsx
        {showSelectionHint && (
          <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-3 border-t border-border bg-background/95 py-2 text-sm backdrop-blur-sm">
            <span>{selection.selectedCount} VMs ausgewählt</span>
            <Link to="/planning" className="text-primary underline">Zur Planung</Link>
          </div>
        )}
```

- [ ] **Step 5: Route & Nav ergänzen**

In `src/App.tsx`:

```tsx
const Planning = lazy(() => import("@/pages/Planning"));
```

```tsx
                  <Route path="/planning" element={<Planning />} />
```

In `src/app/layout/AppSidebar.tsx` im `analysisNav`-Array einen Eintrag ergänzen (Icon `ClipboardList` ist bereits importiert; nutze ein passendes vorhandenes Icon wie `Layers` — dafür `Layers` aus `lucide-react` importieren):

```ts
  { title: "Planung", url: "/planning", icon: Layers },
```

Den Import in `AppSidebar.tsx` um `Layers` erweitern.

- [ ] **Step 6: Build & Tests**

Run: `npm run build`
Expected: erfolgreicher Build.

Run: `npm test`
Expected: PASS (alle Tests grün).

- [ ] **Step 7: End-to-End-Sichtprüfung**

Run: `npm run dev`. Ablauf:
1. `/planning` öffnen (nach Import). VM-Tabelle zeigt Checkbox-Spalte.
2. Einzelklick, Strg+Klick, Shift+Klick prüfen (Bereich in gefilterter/sortierter Ansicht).
3. Filter setzen, weitere VMs auswählen; Zielcluster wählen + „+ Gruppe" → Chip erscheint, Arbeitsauswahl geleert.
4. Schwebende Leiste zeigt Quelle→Ziel-Livewerte.
5. „Vergleich öffnen" → Dialog mit Vorher/Nachher/Δ, Warnbannern, „projiziert"-Hinweis.
6. Speichern mit Namen → Karte in „Gespeicherte Szenarien".
7. Neu laden der Seite → Auswahl/Szenarien via IndexedDB erhalten.
8. Szenario öffnen (Gruppen zurückgeladen), ändern, „Aktualisieren".
9. Auf `/overview` (falls dort später `enableSelection` aktiviert) bzw. während Auswahl aktiv → globaler „X VMs ausgewählt → Zur Planung"-Hinweis.

Expected: Alle Schritte funktionieren; keine Konsolenfehler.

- [ ] **Step 8: Commit**

```bash
git add src/components/planning/PlanningBar.tsx src/components/planning/ScenarioList.tsx src/pages/Planning.tsx src/app/layout/AppLayout.tsx src/App.tsx src/app/layout/AppSidebar.tsx
git commit -m "feat: add planning page with floating bar, scenario list and routing"
```

---

## Self-Review-Ergebnis (vom Plan-Autor)

- **Spec-Abdeckung:** Selektion global (Task 5/6), auf VM-Tabellen (Task 6, aktiviert in Task 10), Engine-Extraktion + Konsistenz zu Capacity (Tasks 2–4), echte/aktive Auslastung + proportionale Projektion (Tasks 2–3), Storage prov.+in-use (Task 7/9), Multi-Quelle→Multi-Ziel via Gruppen (Task 7/8), Zwei-Schritt-Zuweisung (Task 8/10), schwebende Leiste (Task 10), Vergleichsdialog Vorher|Nachher|Δ + Warnbanner (Task 9), Szenario-Persistenz + Liste + bearbeitbar (Tasks 1/8/10), Randfälle (VM nur in einer Gruppe, no-op Selbst-Zuweisung, unvollständige Daten, verwaiste Referenzen — Tasks 7/8/9), `type`-Diskriminator für zukünftige Typen (Task 1). Alle Spec-Abschnitte haben zugeordnete Tasks.
- **Platzhalter:** keine „TBD"/„TODO"; alle Code- und Testblöcke ausformuliert.
- **Typkonsistenz:** `Scenario`/`ScenarioGroup`/`VmLoadEstimate` (Task 1) konsistent in Tasks 7/8/9; Engine-Typen `ClusterAggregate`/`ClusterMetrics`/`VmMove` konsistent zwischen Tasks 2/3/7; `computeRangeSelection`-Signatur identisch in Task 5/6.
- **Bewusste Abweichung von der Spec:** Die schwebende Leiste ist **nicht** in `AppLayout` global gemountet, sondern lebt auf `/planning` (weil der Planungs-State seitenlokal ist); auf anderen Seiten erscheint stattdessen ein schlanker „X VMs ausgewählt → Zur Planung"-Hinweis. Das erfüllt die Absicht (überall auswählen, Auswahl bleibt global) ohne den Planungs-State in einen globalen Provider zu heben. Bei Bedarf kann der Planungs-State später in einen Provider gehoben werden, um die volle Leiste global zu zeigen.
