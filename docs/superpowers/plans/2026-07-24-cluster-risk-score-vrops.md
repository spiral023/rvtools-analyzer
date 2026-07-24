# Cluster-Risiko-Score: vROps-Ausfallskonzept-Faktoren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the vROps failover-concept metrics (HIGH-RP RAM/CPU usage, CPU overcommit, and the remaining vROps panels) into the cluster capacity risk score (`ClusterMetrics.riskScore`/`risk`), with a hard override to `"hoch"` when the site-failover risk is critical, and surface a "vROps fehlt" hint wherever the score is displayed without vROps data.

**Architecture:** `metricsFromAggregate` (the single function that computes `riskScore`/`risk` for all three call sites — Cluster Overview, Cluster Capacity, and What-If) gains an optional `vrops` input. Each call site is updated to look up its vROps entry *before* calling `metricsFromAggregate` (today two of the three look it up after) and pass the values through. No new score-computation logic is duplicated outside this one function.

**Tech Stack:** TypeScript, Vitest, React (function components), Tailwind (shadcn-style utility classes, no new UI library).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-24-cluster-risk-score-vrops-design.md` — every weight/threshold below is copied verbatim from it. Do not re-derive or "improve" them during implementation.
- Existing callers of `metricsFromAggregate` that omit `opts.vrops` must behave byte-for-byte identically to today (backward compatible — `vrops` is optional and defaults to no extra points, no override).
- The existing overall thresholds (`riskScore >= 60` → `"hoch"`, `>= 30` → `"mittel"`) do NOT change.
- Do not touch `FleetCompare.tsx`'s unrelated `riskScore` (a different, fleet-wide health metric — out of scope per the design doc).
- Run `npm run test`, `npm run typecheck`, and `npm run lint` after each task; all three must be clean before moving to the next task.

---

### Task 1: Weighted vROps scoring in `clusterCapacityEngine.ts`

**Files:**
- Modify: `src/domain/services/clusterCapacityEngine.ts:41-96` (add constant + type, extend `metricsFromAggregate`)
- Test: `src/test/clusterCapacityEngine.test.ts`

**Interfaces:**
- Produces: `export interface VropsRiskInput { ramAssignedHighPct: number | null; ramUsageHighPct: number | null; cpuUsageHighPct: number | null; clusterRamAssignedPct: number | null; clusterCpuUsagePct: number | null; avgVmsPerHost: number | null; cpuOvercommitRatio: number | null; }`
- Produces: `export const VROPS_RISK_THRESHOLDS = { ramAssignedHigh: { warn: 45, danger: 50 }, cpuOvercommit: { warn: 4, danger: 5 }, cpuUsageHigh: { warn: 40, danger: 50 }, ramUsageHigh: { warn: 80, danger: 90 }, clusterRamAssigned: { warn: 80, danger: 90 }, clusterCpuUsage: { warn: 75, danger: 85 }, avgVmsPerHost: { warn: 25, danger: 40 } } as const;`
- Produces: `metricsFromAggregate(agg, opts)` where `opts` gains `vrops?: VropsRiskInput | null`.
- Consumes: existing `computeSiteFailoverRisk` (same file, already defined above `metricsFromAggregate`).

- [ ] **Step 1: Write the failing tests**

Append to `src/test/clusterCapacityEngine.test.ts` (add `VropsRiskInput`, `VROPS_RISK_THRESHOLDS` to the existing import from `@/domain/services/clusterCapacityEngine` at the top of the file):

```ts
import {
  aggregateCluster,
  applyVmMoves,
  classifyVmFailoverGroup,
  computeSiteFailoverRisk,
  estimateVmLoad,
  emptyAggregate,
  groupVHostRowsByCluster,
  metricsFromAggregate,
  VROPS_RISK_THRESHOLDS,
  type VropsRiskInput,
} from "@/domain/services/clusterCapacityEngine";
```

Add at the end of the file:

```ts
function vropsRisk(overrides: Partial<VropsRiskInput> = {}): VropsRiskInput {
  return {
    ramAssignedHighPct: null, ramUsageHighPct: null, cpuUsageHighPct: null,
    clusterRamAssignedPct: null, clusterCpuUsagePct: null, avgVmsPerHost: null,
    cpuOvercommitRatio: null,
    ...overrides,
  };
}

describe("metricsFromAggregate – vROps-Gewichtung", () => {
  // 2 Hosts, CPU 50 %, RAM 60 % → Basis-riskScore 0, risk "niedrig" (siehe erste describe-Gruppe oben).
  function lowRiskAgg() {
    const rows: SheetRow[] = [hostRow({ Host: "esx-1" }), hostRow({ Host: "esx-2" })];
    return aggregateCluster("A", rows);
  }

  it("verhält sich ohne vrops-Feld exakt wie bisher (kein Breaking Change)", () => {
    const m = metricsFromAggregate(lowRiskAgg(), { clusterName: "A", projected: false });
    expect(m.riskScore).toBe(0);
    expect(m.risk).toBe("niedrig");
  });

  it("ignoriert ein vrops-Objekt, in dem alle Felder null sind", () => {
    const m = metricsFromAggregate(lowRiskAgg(), { clusterName: "A", projected: false, vrops: vropsRisk() });
    expect(m.riskScore).toBe(0);
    expect(m.risk).toBe("niedrig");
  });

  it("HIGH-RP RAM %: warn +18, danger +35, danger erzwingt zusätzlich risk=hoch (Hard-Override)", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1 }),
    });
    expect(warn.riskScore).toBe(18);
    expect(warn.risk).toBe("niedrig");

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.danger + 1 }),
    });
    expect(danger.riskScore).toBe(35);
    // Score allein (35) läge unter der 60er-Schwelle — die Hard-Override-Regel erzwingt "hoch" trotzdem.
    expect(danger.risk).toBe("hoch");
  });

  it("CPU-Overcommit Ist: warn +10, danger +20", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.warn + 0.5 }),
    });
    expect(warn.riskScore).toBe(10);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.danger + 0.5 }),
    });
    expect(danger.riskScore).toBe(20);
    expect(danger.risk).toBe("niedrig");
  });

  it("HIGH-RP CPU %: warn +9, danger +18", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.warn + 5 }),
    });
    expect(warn.riskScore).toBe(9);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.danger + 5 }),
    });
    expect(danger.riskScore).toBe(18);
  });

  it("HIGH-RP RAM-Nutzung im eigenen RP: warn +5, danger +10", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.warn + 5 }),
    });
    expect(warn.riskScore).toBe(5);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.danger + 5 }),
    });
    expect(danger.riskScore).toBe(10);
  });

  it("Cluster-RAM-Zuweisung gesamt: warn +4, danger +8", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.warn + 5 }),
    });
    expect(warn.riskScore).toBe(4);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.danger + 5 }),
    });
    expect(danger.riskScore).toBe(8);
  });

  it("Cluster-CPU-Nutzung gesamt: warn +4, danger +8", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.warn + 5 }),
    });
    expect(warn.riskScore).toBe(4);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.danger + 5 }),
    });
    expect(danger.riskScore).toBe(8);
  });

  it("Ø VMs/Host Ist: warn +2, danger +5", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.warn + 5 }),
    });
    expect(warn.riskScore).toBe(2);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.danger + 5 }),
    });
    expect(danger.riskScore).toBe(5);
  });

  it("summiert mehrere Danger-Faktoren zu risk=hoch über die normale 60er-Schwelle, auch ohne HIGH-RP-RAM-Override", () => {
    // 20 (CPU-Overcommit) + 18 (HIGH-RP CPU) + 10 (HIGH-RP RAM-Nutzung) + 8 (Cluster-RAM) + 8 (Cluster-CPU) + 5 (VMs/Host) = 69
    const m = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({
        ramAssignedHighPct: null,
        cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.danger + 1,
        cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.danger + 1,
        ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.danger + 1,
        clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.danger + 1,
        clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.danger + 1,
        avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.danger + 1,
      }),
    });
    expect(m.riskScore).toBe(69);
    expect(m.risk).toBe("hoch");
  });

  it("erzwingt risk=hoch NICHT bei Site-Failover-Warn (nur bei crit)", () => {
    const m = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1 }),
    });
    expect(computeSiteFailoverRisk(VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1)).toBe("warn");
    expect(m.risk).toBe("niedrig");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- clusterCapacityEngine`
Expected: FAIL — `VROPS_RISK_THRESHOLDS`/`VropsRiskInput` not exported, `opts.vrops` not recognized, or riskScore mismatches (all new assertions fail; existing tests above them still pass).

- [ ] **Step 3: Implement the weighting**

In `src/domain/services/clusterCapacityEngine.ts`, add the new type and constant right after `SITE_FAILOVER_THRESHOLDS` (after line 43):

```ts
/** Vom vROps-Ausfallskonzept-Export abgeleitete Risiko-Eingaben, siehe {@link VROPS_RISK_THRESHOLDS}. */
export interface VropsRiskInput {
  ramAssignedHighPct: number | null;
  ramUsageHighPct: number | null;
  cpuUsageHighPct: number | null;
  clusterRamAssignedPct: number | null;
  clusterCpuUsagePct: number | null;
  avgVmsPerHost: number | null;
  cpuOvercommitRatio: number | null;
}

/**
 * Schwellenwerte für die vROps-gewichteten Risiko-Faktoren (Ausfallskonzept-Panels).
 * Priorisiert nach Business-Relevanz: HIGH-RP RAM (Standortausfall-Tragfähigkeit) > CPU-
 * Overcommit (Ist) > HIGH-RP CPU > restliche Panels als Ist-Cross-Check/Dichte-Signal.
 * Siehe docs/superpowers/specs/2026-07-24-cluster-risk-score-vrops-design.md.
 */
export const VROPS_RISK_THRESHOLDS = {
  ramAssignedHigh: SITE_FAILOVER_THRESHOLDS.ramAssignedHigh,
  cpuOvercommit: { warn: 4, danger: 5 },
  cpuUsageHigh: { warn: 40, danger: 50 },
  ramUsageHigh: { warn: 80, danger: 90 },
  clusterRamAssigned: { warn: 80, danger: 90 },
  clusterCpuUsage: { warn: 75, danger: 85 },
  avgVmsPerHost: { warn: 25, danger: 40 },
} as const;
```

Change the `metricsFromAggregate` signature (find `export function metricsFromAggregate(`) to add `vrops` to `opts`:

```ts
export function metricsFromAggregate(
  agg: ClusterAggregate,
  opts: {
    clusterName: string;
    clusterRef?: NormalizedCluster | null;
    projected: boolean;
    incompleteVmCount?: number;
    /** vROps-Ausfallskonzept-Werte, `null`/weggelassen ohne vROps-Import für den Cluster. */
    vrops?: VropsRiskInput | null;
  },
): ClusterMetrics {
```

Inside the function body, replace:

```ts
  const risk: ClusterMetrics["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";
```

with:

```ts
  const vrops = opts.vrops ?? null;
  if (vrops) {
    const t = VROPS_RISK_THRESHOLDS;
    if (vrops.ramAssignedHighPct !== null) {
      if (vrops.ramAssignedHighPct > t.ramAssignedHigh.danger) riskScore += 35;
      else if (vrops.ramAssignedHighPct > t.ramAssignedHigh.warn) riskScore += 18;
    }
    if (vrops.cpuOvercommitRatio !== null) {
      if (vrops.cpuOvercommitRatio > t.cpuOvercommit.danger) riskScore += 20;
      else if (vrops.cpuOvercommitRatio > t.cpuOvercommit.warn) riskScore += 10;
    }
    if (vrops.cpuUsageHighPct !== null) {
      if (vrops.cpuUsageHighPct > t.cpuUsageHigh.danger) riskScore += 18;
      else if (vrops.cpuUsageHighPct > t.cpuUsageHigh.warn) riskScore += 9;
    }
    if (vrops.ramUsageHighPct !== null) {
      if (vrops.ramUsageHighPct > t.ramUsageHigh.danger) riskScore += 10;
      else if (vrops.ramUsageHighPct > t.ramUsageHigh.warn) riskScore += 5;
    }
    if (vrops.clusterRamAssignedPct !== null) {
      if (vrops.clusterRamAssignedPct > t.clusterRamAssigned.danger) riskScore += 8;
      else if (vrops.clusterRamAssignedPct > t.clusterRamAssigned.warn) riskScore += 4;
    }
    if (vrops.clusterCpuUsagePct !== null) {
      if (vrops.clusterCpuUsagePct > t.clusterCpuUsage.danger) riskScore += 8;
      else if (vrops.clusterCpuUsagePct > t.clusterCpuUsage.warn) riskScore += 4;
    }
    if (vrops.avgVmsPerHost !== null) {
      if (vrops.avgVmsPerHost > t.avgVmsPerHost.danger) riskScore += 5;
      else if (vrops.avgVmsPerHost > t.avgVmsPerHost.warn) riskScore += 2;
    }
  }

  let risk: ClusterMetrics["risk"] = riskScore >= 60 ? "hoch" : riskScore >= 30 ? "mittel" : "niedrig";
  // Site-Failover-Risiko ist binär, kein Gradient: reicht die HIGH-RP-RAM-Zuweisung im
  // Standortausfall nicht, können HIGH-RP-VMs nicht starten — das erzwingt "hoch" unabhängig
  // vom Summen-Score (siehe Design-Spec).
  if (computeSiteFailoverRisk(vrops?.ramAssignedHighPct ?? null) === "crit") risk = "hoch";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- clusterCapacityEngine`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/clusterCapacityEngine.ts src/test/clusterCapacityEngine.test.ts
git commit -m "feat: weight vROps failover metrics into cluster risk score"
```

---

### Task 2: Wire vROps into the Capacity-Health table (`clusterCapacityWorkspace.ts`)

**Files:**
- Modify: `src/lib/clusterCapacityWorkspace.ts:6-34` (interface), `:146-182` (loop body)
- Test: `src/test/clusterWorkspace.test.ts`

**Interfaces:**
- Consumes: `metricsFromAggregate(agg, opts)` with `opts.vrops?: VropsRiskInput | null` from Task 1.
- Produces: `ClusterCapacityRow.vropsMissing: boolean` — later tasks (5) read this field.

- [ ] **Step 1: Write the failing test**

In `src/test/clusterWorkspace.test.ts`, add `VropsLatest` to the existing type import from `@/domain/models/types` at the top of the file:

```ts
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
  SnapshotMeta,
  VropsLatest,
} from "@/domain/models/types";
```

Then add this test at the end of the `describe("clusterWorkspace", ...)` block, right before its closing `});`:

```ts
  it("gewichtet vROps-Ausfallskonzept-Werte in den Capacity-Risk-Score ein und markiert Cluster ohne vROps-Import", () => {
    const vropsLatest: VropsLatest[] = [
      {
        clusterNorm: "production", clusterName: "Production", importedAt: "2026-07-24T00:00:00.000Z",
        vropsImportId: "vrops-1", capturedAt: null,
        ramUsageHighPct: null, ramAssignedHighPct: 51, clusterRamAssignedPct: null,
        cpuUsageHighPct: null, clusterCpuUsagePct: null, avgVmsPerHost: null, cpuOvercommitRatio: null,
      },
    ];

    const withVrops = buildClusterCapacityWorkspace({
      clusters: [cluster()], hosts: [host(), host({ hostKey: "host-2", host: "esx-02" })],
      vms: Array.from({ length: 10 }, (_, index) => vm({ vmKey: `vm-${index}` })),
      rawVHostRows: [rawHost(), rawHost({ Host: "esx-02" })],
      snapshots, vropsLatest,
    });
    const withoutVrops = buildClusterCapacityWorkspace({
      clusters: [cluster()], hosts: [host(), host({ hostKey: "host-2", host: "esx-02" })],
      vms: Array.from({ length: 10 }, (_, index) => vm({ vmKey: `vm-${index}` })),
      rawVHostRows: [rawHost(), rawHost({ Host: "esx-02" })],
      snapshots,
    });

    expect(withVrops.capacityRows[0]).toMatchObject({ risk: "hoch", vropsMissing: false });
    expect(withoutVrops.capacityRows[0]).toMatchObject({ risk: "niedrig", vropsMissing: true });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- clusterWorkspace`
Expected: FAIL — `vropsMissing` is `undefined` (not `false`/`true`) and/or `risk` is still `"niedrig"` for `withVrops` because the workspace doesn't pass `vrops` into `metricsFromAggregate` yet.

- [ ] **Step 3: Implement**

In `src/lib/clusterCapacityWorkspace.ts`, add to the `ClusterCapacityRow` interface (right after `siteFailoverRisk: SiteFailoverRisk | null;` at line 33):

```ts
  /** `true`, wenn kein vROps-Import für diesen Cluster vorliegt — die vROps-gewichteten Risiko-Faktoren wurden dann nicht bewertet. */
  vropsMissing: boolean;
```

Then, in `buildClusterCapacityWorkspace`, replace the loop body's start (lines 149-153):

```ts
  for (const [clusterKey, cluster] of clustersByKey) {
    const identity = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    const rawRows = rawByCluster.get(clusterKey) ?? [];
    const aggregate = aggregateCluster(identity, rawRows, vcenterBySnapshot);
    const metrics = metricsFromAggregate(aggregate, { clusterName: cluster.name, clusterRef: cluster, projected: false });
```

with:

```ts
  for (const [clusterKey, cluster] of clustersByKey) {
    const identity = resolveIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name });
    const rawRows = rawByCluster.get(clusterKey) ?? [];
    const aggregate = aggregateCluster(identity, rawRows, vcenterBySnapshot);
    const vrops = vropsByClusterNorm.get(normalizeVmNameForMatch(cluster.name)) ?? null;
    const metrics = metricsFromAggregate(aggregate, {
      clusterName: cluster.name,
      clusterRef: cluster,
      projected: false,
      vrops: vrops ? {
        ramAssignedHighPct: vrops.ramAssignedHighPct,
        ramUsageHighPct: vrops.ramUsageHighPct,
        cpuUsageHighPct: vrops.cpuUsageHighPct,
        clusterRamAssignedPct: vrops.clusterRamAssignedPct,
        clusterCpuUsagePct: vrops.clusterCpuUsagePct,
        avgVmsPerHost: vrops.avgVmsPerHost,
        cpuOvercommitRatio: vrops.cpuOvercommitRatio,
      } : null,
    });
```

Then remove the now-duplicate lookup a few lines further down — delete this line (currently right before the `capacityRows.push(...)` call):

```ts
    const vrops = vropsByClusterNorm.get(normalizeVmNameForMatch(cluster.name)) ?? null;
```

And add `vropsMissing: vrops === null,` to the `capacityRows.push({...})` object, right after the existing `siteFailoverRisk: computeSiteFailoverRisk(vrops?.ramAssignedHighPct ?? null),` line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- clusterWorkspace`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/clusterCapacityWorkspace.ts src/test/clusterWorkspace.test.ts
git commit -m "feat: feed vROps failover metrics into the capacity-health risk score"
```

---

### Task 3: Wire vROps into the Cluster-Overview tab (`clusterWorkspace.ts` + `Clusters.tsx`)

**Files:**
- Modify: `src/lib/clusterWorkspace.ts:1-21` (imports/interface), `:180-191` (metrics call)
- Modify: `src/pages/Clusters.tsx:52-60` (pass `vropsLatest` through)
- Test: `src/test/clusterWorkspace.test.ts`

**Interfaces:**
- Consumes: `metricsFromAggregate(agg, opts)` with `opts.vrops` from Task 1.
- Produces: `ClusterWorkspaceInput.vropsLatest?: VropsLatest[]` — the Cluster-Overview KPI ("Cluster Risiken hoch") and risk chart (`buildRiskChart`) now reflect the same score as the Capacity tab for the same cluster.

**Why this task:** `buildClusterOverviewRows` (used by the "Übersicht" tab) calls the same `metricsFromAggregate` but currently never receives vROps data at all — without this task, the Übersicht tab and the Kapazität tab would show two different risk scores for the same cluster, which would be confusing and contradicts the design goal of a single unified score.

- [ ] **Step 1: Write the failing test**

Add to `src/test/clusterWorkspace.test.ts`, right after the test added in Task 2 (`VropsLatest` is already imported at the top of the file from Task 2 — reuse the same fixture shape):

```ts
  it("gewichtet vROps-Ausfallskonzept-Werte auch in den Cluster-Übersicht-Score ein (konsistent mit der Capacity-Tabelle)", () => {
    const vropsLatest: VropsLatest[] = [
      {
        clusterNorm: "production", clusterName: "Production", importedAt: "2026-07-24T00:00:00.000Z",
        vropsImportId: "vrops-1", capturedAt: null,
        ramUsageHighPct: null, ramAssignedHighPct: 51, clusterRamAssignedPct: null,
        cpuUsageHighPct: null, clusterCpuUsagePct: null, avgVmsPerHost: null, cpuOvercommitRatio: null,
      },
    ];

    const rows = buildClusterOverviewRows({
      clusters: [cluster()],
      hosts: [host(), host({ hostKey: "host-2", host: "esx-02" })],
      vms: Array.from({ length: 10 }, (_, index) => vm({ vmKey: `vm-${index}` })),
      rawVHostRows: [rawHost(), rawHost({ Host: "esx-02" })],
      snapshots,
      vropsLatest,
    });

    expect(rows[0]).toMatchObject({ risk: "hoch" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- clusterWorkspace`
Expected: FAIL — `ClusterWorkspaceInput` has no `vropsLatest` property (TS error) and/or `risk` stays `"niedrig"`.

- [ ] **Step 3: Implement**

In `src/lib/clusterWorkspace.ts`:

Add `VropsLatest` to the type import at the top:

```ts
import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
  SnapshotMeta,
  VropsLatest,
} from "@/domain/models/types";
```

Add `normalizeVmNameForMatch` import (already used the same way in `clusterCapacityWorkspace.ts`):

```ts
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
```

Add `vropsLatest` to `ClusterWorkspaceInput` (after `snapshots: SnapshotMeta[];`):

```ts
  /** Optional: vROps-Kapazitätsmetriken je Cluster (Ausfallskonzept HIGH_RP/STD). */
  vropsLatest?: VropsLatest[];
```

In `buildClusterOverviewRows`, add the lookup map right after the existing `vcenterBySnapshot` map:

```ts
  const vropsByClusterNorm = new Map((input.vropsLatest ?? []).map((entry) => [entry.clusterNorm, entry]));
```

Then replace the `metricsFromAggregate` call:

```ts
    const metrics = metricsFromAggregate(aggregate, {
      clusterName: cluster.name,
      clusterRef: cluster,
      projected: false,
    });
```

with:

```ts
    const vrops = vropsByClusterNorm.get(normalizeVmNameForMatch(cluster.name)) ?? null;
    const metrics = metricsFromAggregate(aggregate, {
      clusterName: cluster.name,
      clusterRef: cluster,
      projected: false,
      vrops: vrops ? {
        ramAssignedHighPct: vrops.ramAssignedHighPct,
        ramUsageHighPct: vrops.ramUsageHighPct,
        cpuUsageHighPct: vrops.cpuUsageHighPct,
        clusterRamAssignedPct: vrops.clusterRamAssignedPct,
        clusterCpuUsagePct: vrops.clusterCpuUsagePct,
        avgVmsPerHost: vrops.avgVmsPerHost,
        cpuOvercommitRatio: vrops.cpuOvercommitRatio,
      } : null,
    });
```

In `src/pages/Clusters.tsx`, update the `buildClusterOverviewRows` call (line 53) and its `useMemo` dependency array (line 60):

```ts
    const allRows = buildClusterOverviewRows({ clusters, hosts, vms, rawVHostRows, snapshots: scopedSnapshots, vropsLatest });
```

```ts
  }, [clusters, filters.clusters, filters.search, hosts, rawVHostRows, scopedSnapshots, vms, vropsLatest]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- clusterWorkspace`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/clusterWorkspace.ts src/pages/Clusters.tsx src/test/clusterWorkspace.test.ts
git commit -m "feat: keep cluster-overview risk score consistent with capacity-health score"
```

---

### Task 4: Wire vROps before/after into the What-If comparison (`planningHelpers.ts`)

**Files:**
- Modify: `src/domain/services/planningHelpers.ts:18-30` (interface), `:137-193` (loop body)
- Test: `src/test/planningHelpers.test.ts`

**Interfaces:**
- Consumes: `metricsFromAggregate(agg, opts)` with `opts.vrops` from Task 1.
- Produces: `WhatIfClusterResult.vropsMissing: boolean` — Task 6 reads this field.

- [ ] **Step 1: Write the failing test**

Add to `src/test/planningHelpers.test.ts`, inside the `describe("computeWhatIf", ...)` block, right before its closing `});`:

```ts
  it("gewichtet die HIGH-RP-RAM-Projektion in Vorher-/Nachher-Risk-Score und erzwingt hoch bei kritischem Site-Failover-Risiko", () => {
    const targetKey = clusterScopeKey("vc-b", "DC1", "Beta");
    const scenario: Scenario = {
      id: "scn-6", name: "Move High Critical", type: "cluster-migration",
      createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z",
      vcenterScope: ["vc-a", "vc-b"],
      groups: [{ id: "grp-1", label: null, targetClusterKey: targetKey, vmKeys: ["vm-1"] }],
      notes: null,
    };
    const highVm = vm({
      cluster: "Alpha", vcenterId: "vc-a", memoryMiB: 20000,
      resourcePool: "/LNZ9910/CL_Alpha/Resources/HIGH",
    });

    const result = computeWhatIf(
      scenario,
      [highVm],
      [hostRow("snap-a", "esx-a", 5, "Alpha"), hostRow("snap-b", "esx-b", 7, "Beta")],
      [cluster("vc-a", "Alpha"), cluster("vc-b", "Beta")],
      new Map([["snap-a", "vc-a"], ["snap-b", "vc-b"]]),
      [
        vropsLatest({ clusterNorm: "alpha", clusterName: "Alpha", ramAssignedHighPct: 40 }),
        vropsLatest({ clusterNorm: "beta", clusterName: "Beta", ramAssignedHighPct: 38 }),
      ],
    );

    const alpha = result.clusters.find((entry) => entry.clusterName === "Alpha");
    const beta = result.clusters.find((entry) => entry.clusterName === "Beta");

    // Beta: 38 % + 20000 MiB HIGH-RP-Zuzug auf 100000 MiB Gesamt-RAM → 58 % (> 50 % danger) → siteFailoverRiskAfter "crit".
    expect(beta?.siteFailoverRiskAfter).toBe("crit");
    expect(beta?.after.risk).toBe("hoch");
    expect(beta?.vropsMissing).toBe(false);
    expect(alpha?.after.risk).toBe("niedrig");
  });

  it("markiert Cluster ohne vROps-Import als vropsMissing", () => {
    const targetKey = clusterScopeKey("vc-b", "DC1", "Beta");
    const scenario: Scenario = {
      id: "scn-7", name: "Move ohne vROps", type: "cluster-migration",
      createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z",
      vcenterScope: ["vc-a", "vc-b"],
      groups: [{ id: "grp-1", label: null, targetClusterKey: targetKey, vmKeys: ["vm-1"] }],
      notes: null,
    };

    const result = computeWhatIf(
      scenario,
      [vm({ cluster: "Alpha", vcenterId: "vc-a" })],
      [hostRow("snap-a", "esx-a", 5, "Alpha"), hostRow("snap-b", "esx-b", 7, "Beta")],
      [cluster("vc-a", "Alpha"), cluster("vc-b", "Beta")],
      new Map([["snap-a", "vc-a"], ["snap-b", "vc-b"]]),
    );

    expect(result.clusters.every((entry) => entry.vropsMissing)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- planningHelpers`
Expected: FAIL — `vropsMissing` is `undefined` and/or `after.risk` for Beta stays `"niedrig"`/`"mittel"` because the vrops values aren't fed into `metricsFromAggregate` yet.

- [ ] **Step 3: Implement**

In `src/domain/services/planningHelpers.ts`, add to the `WhatIfClusterResult` interface (right after `siteFailoverRiskAfter: SiteFailoverRisk | null;`):

```ts
  /** `true`, wenn kein vROps-Import für diesen Cluster vorliegt — Vorher/Nachher-Score enthält dann keine vROps-Faktoren. */
  vropsMissing: boolean;
```

Replace the loop body (from `const beforeAgg = getBeforeAggregate(clusterKey);` through the end of the `results.push({...})` call) with:

```ts
    const beforeAgg = getBeforeAggregate(clusterKey);
    const moves = movesByCluster.get(clusterKey) ?? { incoming: [], outgoing: [] };

    const withLoad = (vm: NormalizedVm) => {
      const sourceIdentity = resolveIdentity(vmClusterIdentity(vm));
      const sourceKey = clusterScopeKey(sourceIdentity.vcenterId, sourceIdentity.datacenter, sourceIdentity.clusterName);
      return { vm, load: estimateVmLoad(getBeforeAggregate(sourceKey), vm) };
    };
    const afterAgg = applyVmMoves(beforeAgg, {
      incoming: moves.incoming.map(withLoad),
      outgoing: moves.outgoing.map(withLoad),
    });

    // Ausfallskonzept-Projektion: HIGH-RP-VMs, die in diesen Cluster wechseln bzw. ihn
    // verlassen, verschieben die HIGH-RP-RAM-Zuweisung additiv — analog zum Prinzip der
    // übrigen What-If-Metriken (proportionale/additive Fortschreibung des Ist-Zustands).
    const vropsEntry = vropsByClusterNorm.get(normalizeVmNameForMatch(clusterName)) ?? null;
    // vCluster-Import (clusterRef.totalMemoryMiB) kann fehlen; das vHost-Aggregat ist
    // dieselbe Kapazitätsbasis, die RAM-Commit & Co. bereits erfolgreich nutzen.
    const totalMemoryMiB = beforeAgg.totalMemoryMiB || clusterRef?.totalMemoryMiB || null;
    const baselineHighPct = vropsEntry?.ramAssignedHighPct ?? null;
    const baselineHighMiB = baselineHighPct !== null && totalMemoryMiB ? (baselineHighPct / 100) * totalMemoryMiB : null;

    let highDeltaMiB = 0;
    for (const vm of moves.incoming) {
      if (classifyVmFailoverGroup(vm.resourcePool) === "high") highDeltaMiB += vm.memoryMiB ?? 0;
    }
    for (const vm of moves.outgoing) {
      if (classifyVmFailoverGroup(vm.resourcePool) === "high") highDeltaMiB -= vm.memoryMiB ?? 0;
    }

    const afterHighMiB = baselineHighMiB !== null ? Math.max(0, baselineHighMiB + highDeltaMiB) : null;
    const afterHighPct = afterHighMiB !== null && totalMemoryMiB ? (afterHighMiB / totalMemoryMiB) * 100 : null;

    // Die übrigen vROps-Faktoren (CPU-Overcommit, HIGH-RP-CPU, ...) haben kein Projektionsmodell
    // für VM-Verschiebungen und fließen daher mit demselben statischen Ist-Wert in Vorher- und
    // Nachher-Score ein (siehe Design-Spec, Abschnitt "Integration").
    const staticVropsFactors = {
      ramUsageHighPct: vropsEntry?.ramUsageHighPct ?? null,
      cpuUsageHighPct: vropsEntry?.cpuUsageHighPct ?? null,
      clusterRamAssignedPct: vropsEntry?.clusterRamAssignedPct ?? null,
      clusterCpuUsagePct: vropsEntry?.clusterCpuUsagePct ?? null,
      avgVmsPerHost: vropsEntry?.avgVmsPerHost ?? null,
      cpuOvercommitRatio: vropsEntry?.cpuOvercommitRatio ?? null,
    };

    const before = metricsFromAggregate(beforeAgg, {
      clusterName, clusterRef, projected: false,
      vrops: { ramAssignedHighPct: baselineHighPct, ...staticVropsFactors },
    });
    const after = metricsFromAggregate(afterAgg, {
      clusterName, clusterRef, projected: true,
      vrops: { ramAssignedHighPct: afterHighPct, ...staticVropsFactors },
    });

    totalMovedVms += moves.incoming.length;
    results.push({
      clusterKey,
      clusterName,
      before,
      after,
      incomingVmCount: moves.incoming.length,
      outgoingVmCount: moves.outgoing.length,
      vropsRamAssignedHighPctBefore: baselineHighPct !== null ? round1(baselineHighPct) : null,
      vropsRamAssignedHighPctAfter: afterHighPct !== null ? round1(afterHighPct) : null,
      siteFailoverRiskBefore: computeSiteFailoverRisk(baselineHighPct),
      siteFailoverRiskAfter: computeSiteFailoverRisk(afterHighPct),
      vropsMissing: vropsEntry === null,
    });
```

(Note: this removes the old separately-computed `before`/`after` lines that used to appear directly after `const moves = ...` — they are now computed later in the block, after the vROps values are known.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- planningHelpers`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/planningHelpers.ts src/test/planningHelpers.test.ts
git commit -m "feat: weight vROps failover metrics into what-if before/after risk score"
```

---

### Task 5: Capacity-Health UI — "vROps fehlt" badge, two new columns, glossary

**Files:**
- Modify: `src/lib/metricColor.tsx` (new `vropsMissingBadge` helper)
- Modify: `src/components/cluster/ClusterCapacityPanel.tsx:15,34,51-53` (badge + 2 columns)
- Modify: `src/lib/glossaries/capacity.ts:304-309,391-403` (glossary text)

**Interfaces:**
- Produces: `export function vropsMissingBadge(missing: boolean): JSX.Element | null` — reused by Task 6.
- Consumes: `ClusterCapacityRow.vropsMissing`, `vropsCpuUsageHighPct`, `vropsRamUsageHighPct` (already present as data fields since before this plan; only rendering is new).

This task has no dedicated unit test (pure JSX rendering wiring, covered by existing `ClusterCapacityPanel.test.tsx`'s unrelated `HostDensityTooltip` test and by manual verification in Step 3). Follow the steps in order; there is no separate red/green cycle here since no new computational logic is introduced.

- [ ] **Step 1: Add the shared badge helper**

In `src/lib/metricColor.tsx`, add at the end of the file:

```ts
/** Kleiner Hinweis-Badge, wenn kein vROps-Import für den Cluster vorliegt — verhindert, dass ein niedriger Risiko-Score als "Standortausfall sicher" missverstanden wird. */
export function vropsMissingBadge(missing: boolean): JSX.Element | null {
  if (!missing) return null;
  return (
    <span
      className="text-xs text-muted-foreground"
      title="Kein vROps-Import für diesen Cluster — Ausfallskonzept-Faktoren (HIGH-RP RAM/CPU, Overcommit) wurden nicht bewertet."
    >
      vROps fehlt
    </span>
  );
}
```

- [ ] **Step 2: Update `ClusterCapacityPanel.tsx`**

Add `vropsMissingBadge` to the existing import from `@/lib/metricColor` (line 15):

```ts
import { boolCell, coloredNum, coloredPct, coloredRatio, severityBadge, siteFailoverBadge, vropsMissingBadge } from "@/lib/metricColor";
```

Replace the `risk` column (line 34):

```ts
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_HEALTH_COLUMNS.risk }, cell: ({ row }) => severityBadge(`${row.original.risk} (${row.original.riskScore})`, row.original.risk === "hoch" ? "crit" : row.original.risk === "mittel" ? "warn" : "ok") },
```

with:

```ts
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_HEALTH_COLUMNS.risk }, cell: ({ row }) => (
    <span className="inline-flex items-center gap-1.5">
      {severityBadge(`${row.original.risk} (${row.original.riskScore})`, row.original.risk === "hoch" ? "crit" : row.original.risk === "mittel" ? "warn" : "ok")}
      {vropsMissingBadge(row.original.vropsMissing)}
    </span>
  ) },
```

Add two new columns right after the `siteFailoverRisk` column (line 52):

```ts
  { accessorKey: "vropsCpuUsageHighPct", header: "HIGH-RP CPU %", meta: { info: CAPACITY_HEALTH_COLUMNS.vropsCpuUsageHighPct }, cell: ({ getValue }) => coloredPct(getValue() as number | null, 40, 50, 0) },
  { accessorKey: "vropsRamUsageHighPct", header: "HIGH-RP RAM-Nutzung %", meta: { info: CAPACITY_HEALTH_COLUMNS.vropsRamUsageHighPct }, cell: ({ getValue }) => coloredPct(getValue() as number | null, 80, 90, 0) },
```

- [ ] **Step 3: Update the glossary**

In `src/lib/glossaries/capacity.ts`, replace the `risk` entry's `description` (inside `CAPACITY_HEALTH_COLUMNS`, around line 304-309):

```ts
  risk: {
    term: "Risiko",
    description:
      "Gesamteinstufung (hoch/mittel/niedrig) mit Score in Klammern. Fasst CPU-/RAM-Auslastung, Overcommit, Swap/Balloon und HA-Reserve zu einer Ampel zusammen. Bei vorhandenem vROps-Import fließen zusätzlich HIGH-RP-RAM/-CPU-Nutzung, CPU-Overcommit (Ist) und weitere Ausfallskonzept-Werte gewichtet ein; ein kritisches Site-Failover-Risiko erzwingt „hoch“. „vROps fehlt“ markiert Cluster, für die diese Faktoren nicht bewertet werden konnten.",
    source: "berechnet · vHost + vCluster + vROps-Dashboard-Export",
  },
```

Add two new entries to `CAPACITY_HEALTH_COLUMNS`, right after the existing `siteFailoverRisk` entry (end of that object, before its closing `};`):

```ts
  vropsCpuUsageHighPct: {
    term: "HIGH-RP CPU %",
    description:
      "CPU-Nutzung der HIGH-RP-VMs relativ zur Gesamt-Cluster-CPU-Kapazität. Analog zu HIGH-RP RAM %: da bei Standortausfall nur ~50 % der Hosts überleben, wird es ab 40 % (gelb) bzw. 50 % (rot) eng für den Weiterbetrieb der HIGH-RP-VMs.",
    source: "vROps-Dashboard-Export · Panel 4",
  },
  vropsRamUsageHighPct: {
    term: "HIGH-RP RAM-Nutzung %",
    description:
      "RAM-Nutzung der HIGH-RP-VMs relativ zu ihrem eigenen Resource-Pool-Kontingent. Ab 80 % (gelb) bzw. 90 % (rot) ist der HIGH-Pool selbst unter Druck — unabhängig vom Standort-Ausfallszenario.",
    source: "vROps-Dashboard-Export · Panel 1",
  },
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev` and open the Cluster-Seite → Tab "Kapazität". Confirm:
- The "Risiko" column shows the existing badge, plus a small "vROps fehlt" hint for clusters without a vROps import.
- Two new columns "HIGH-RP CPU %" and "HIGH-RP RAM-Nutzung %" appear and show "—" for clusters without vROps data.
- Hovering the column header info icons shows the updated glossary text.

Stop the dev server when done.

- [ ] **Step 5: Run full test suite + typecheck + lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/metricColor.tsx src/components/cluster/ClusterCapacityPanel.tsx src/lib/glossaries/capacity.ts
git commit -m "feat: surface vROps risk factors and missing-data hint in capacity table"
```

---

### Task 6: What-If dialog — "vROps fehlt" badge

**Files:**
- Modify: `src/components/planning/WhatIfCompareDialog.tsx:5,17-18`

**Interfaces:**
- Consumes: `vropsMissingBadge` from Task 5, `WhatIfClusterResult.vropsMissing` from Task 4.

- [ ] **Step 1: Update imports and risk columns**

In `src/components/planning/WhatIfCompareDialog.tsx`, update the import (line 5):

```ts
import { coloredNum, coloredPct, severityBadge, siteFailoverBadge, vropsMissingBadge } from "@/lib/metricColor";
```

Replace the two risk columns (lines 17-18):

```ts
  { accessorKey: "before.riskScore", header: "Risk (Vorher)", cell: ({ row }) => severityBadge(String(row.original.before.riskScore), riskSeverity(row.original.before.risk)) },
  { accessorKey: "after.riskScore", header: "Risk (Nachher)", cell: ({ row }) => severityBadge(String(row.original.after.riskScore), riskSeverity(row.original.after.risk)) },
```

with:

```ts
  { accessorKey: "before.riskScore", header: "Risk (Vorher)", cell: ({ row }) => (
    <span className="inline-flex items-center gap-1.5">
      {severityBadge(String(row.original.before.riskScore), riskSeverity(row.original.before.risk))}
      {vropsMissingBadge(row.original.vropsMissing)}
    </span>
  ) },
  { accessorKey: "after.riskScore", header: "Risk (Nachher)", cell: ({ row }) => severityBadge(String(row.original.after.riskScore), riskSeverity(row.original.after.risk)) },
```

(The badge is shown once, on the "Vorher" column, since `vropsMissing` is the same for both before/after — showing it twice would be redundant.)

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open Cluster-Seite → Tab "Planung" → create a scenario with a VM move → click "What-If". Confirm the "Risk (Vorher)" column shows the "vROps fehlt" hint for clusters without a vROps import, and not for ones with an import.

Stop the dev server when done.

- [ ] **Step 3: Run full test suite + typecheck + lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/WhatIfCompareDialog.tsx
git commit -m "feat: show vROps missing-data hint in what-if risk comparison"
```

---

### Task 7: Final full-repo verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all tests pass, no skipped/failing tests

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 4: Review the design spec against the implementation**

Re-read `docs/superpowers/specs/2026-07-24-cluster-risk-score-vrops-design.md` section by section and confirm each point maps to a completed task:
- Score model / weights table → Task 1
- Hard-override rule → Task 1
- Integration (capacity workspace, what-if, cluster overview) → Tasks 2-4
- UI (badge, new columns, glossary) → Tasks 5-6
- Out of scope items → confirm none were accidentally implemented (no score-breakdown tooltip, no FleetCompare changes, no 60/30 threshold changes)

No commit for this task — it's a verification gate only.
