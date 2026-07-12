# Varianten-Übersichtstabelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortierbare Übersichtstabelle aller Hardware-Varianten im Hardware-Tab mit Pro-Host- und Gesamtwerten sowie einem Detail-Dialog je Variante.

**Architecture:** Eine neue reine Aggregationsfunktion `buildVariantSummary` in `src/lib/hardwareVariants.ts` liefert Cluster-Aufschlüsselung und Gesamtwerte je `HardwareModelGroup`. Die UI (Tabelle + Dialog) lebt in `src/pages/Hardware.tsx` und nutzt die bestehenden `modelGroups`, sodass FilterBar und der RAM-Switch automatisch wirken.

**Tech Stack:** React 18 + TypeScript, shadcn/ui (Card, Dialog, Badge), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-12-hardware-variant-summary-table-design.md`

## Global Constraints

- Implementierung direkt auf `main` (Nutzer-Vorgabe, kein Worktree).
- UI-Texte auf Deutsch, konsistent zur bestehenden Seite.
- Sortierungen mit `localeCompare(..., "de-DE", { numeric: true, sensitivity: "base" })` wie im Bestand.
- Hosts ohne Cluster laufen unter dem Label `Ohne Cluster`.
- Verifikation je Task: `npx vitest run src/test/hardwareVariants.test.ts` bzw. `npm run typecheck` und `npm run lint`.

---

### Task 1: `buildVariantSummary` in hardwareVariants.ts

**Files:**
- Modify: `src/lib/hardwareVariants.ts` (ans Dateiende anfügen)
- Test: `src/test/hardwareVariants.test.ts` (neuen `describe`-Block anfügen)

**Interfaces:**
- Consumes: `HardwareModelGroup`, `HostDetail` (bestehend).
- Produces: `buildVariantSummary(group: HardwareModelGroup): VariantSummary`, Typen `VariantSummary`, `VariantClusterBreakdown`, Konstante `NO_CLUSTER_LABEL = "Ohne Cluster"`. Task 2 und 3 importieren `buildVariantSummary` und `VariantSummary` aus `@/lib/hardwareVariants`.

- [ ] **Step 1: Failing Tests schreiben**

In `src/test/hardwareVariants.test.ts` den Import erweitern:

```ts
import { buildHardwareModelGroups, buildVariantSummary, NO_CLUSTER_LABEL } from "@/lib/hardwareVariants";
```

Am Dateiende anfügen:

```ts
describe("buildVariantSummary", () => {
  it("aggregates totals across hosts with differing RAM", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", memoryMiB: 524288, vmCount: 40, cluster: "cluster-a" }),
      host({ host: "esx02", memoryMiB: 786432, vmCount: 25, cluster: "cluster-b" }),
    ]);
    expect(groups).toHaveLength(1);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.totalCores).toBe(128); // 64 Cores × 2 Hosts
    expect(summary.totalGhz).toBe(256); // 128 Cores × 2000 MHz / 1000
    expect(summary.totalRamMiB).toBe(524288 + 786432);
    expect(summary.totalVms).toBe(65);
    expect(summary.clusterNames).toEqual(["cluster-a", "cluster-b"]);
  });

  it("breaks totals down per cluster and labels hosts without cluster", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", cluster: "cluster-a", vmCount: 10 }),
      host({ host: "esx02", cluster: "cluster-a", vmCount: 20 }),
      host({ host: "esx03", cluster: null, vmCount: 5 }),
    ]);
    expect(groups).toHaveLength(1);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.clusterBreakdown).toEqual([
      { cluster: "cluster-a", hosts: 2, cores: 128, ramMiB: 2 * 524288, vms: 30 },
      { cluster: NO_CLUSTER_LABEL, hosts: 1, cores: 64, ramMiB: 524288, vms: 5 },
    ]);
  });

  it("handles a single-host group", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", vmCount: 12 }),
    ]);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.totalCores).toBe(64);
    expect(summary.totalGhz).toBe(128);
    expect(summary.totalRamMiB).toBe(524288);
    expect(summary.totalVms).toBe(12);
    expect(summary.clusterBreakdown).toEqual([
      { cluster: "cluster-a", hosts: 1, cores: 64, ramMiB: 524288, vms: 12 },
    ]);
  });
});
```

Hinweis: `clusterBreakdown` ist alphabetisch nach Clusternamen sortiert; `Ohne Cluster` sortiert unter „O" hinter „cluster-a" (localeCompare, case-insensitiv).

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npx vitest run src/test/hardwareVariants.test.ts`
Expected: FAIL — `buildVariantSummary` und `NO_CLUSTER_LABEL` werden nicht exportiert.

- [ ] **Step 3: Implementierung**

Ans Ende von `src/lib/hardwareVariants.ts` anfügen:

```ts
export const NO_CLUSTER_LABEL = "Ohne Cluster";

export interface VariantClusterBreakdown {
  cluster: string;
  hosts: number;
  cores: number;
  ramMiB: number;
  vms: number;
}

export interface VariantSummary {
  clusterBreakdown: VariantClusterBreakdown[];
  clusterNames: string[];
  totalCores: number;
  totalGhz: number;
  totalRamMiB: number;
  totalVms: number;
}

export function buildVariantSummary(group: HardwareModelGroup): VariantSummary {
  const byCluster = new Map<string, VariantClusterBreakdown>();
  let totalRamMiB = 0;
  let totalVms = 0;

  for (const host of group.hosts) {
    const cluster = host.cluster || NO_CLUSTER_LABEL;
    let entry = byCluster.get(cluster);
    if (!entry) {
      entry = { cluster, hosts: 0, cores: 0, ramMiB: 0, vms: 0 };
      byCluster.set(cluster, entry);
    }
    entry.hosts += 1;
    entry.cores += host.totalCores || 0;
    entry.ramMiB += host.memoryMiB || 0;
    entry.vms += host.vmCount || 0;
    totalRamMiB += host.memoryMiB || 0;
    totalVms += host.vmCount || 0;
  }

  const clusterBreakdown = [...byCluster.values()].sort((a, b) =>
    a.cluster.localeCompare(b.cluster, "de-DE", { numeric: true, sensitivity: "base" }),
  );
  const totalCores = (group.totalCores || 0) * group.count;
  const totalGhz = Math.round((totalCores * (group.speedMHz || 0)) / 100) / 10;

  return {
    clusterBreakdown,
    clusterNames: clusterBreakdown.map((c) => c.cluster),
    totalCores,
    totalGhz,
    totalRamMiB,
    totalVms,
  };
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npx vitest run src/test/hardwareVariants.test.ts`
Expected: PASS (alle 6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hardwareVariants.ts src/test/hardwareVariants.test.ts
git commit -m "feat: add per-variant summary aggregation"
```

---

### Task 2: Glossar-Eintrag und Varianten-Übersichtstabelle

**Files:**
- Modify: `src/lib/glossaries/hardware.ts` (Eintrag in `HARDWARE_SECTIONS`)
- Modify: `src/pages/Hardware.tsx` (neue Komponente `VariantSummaryTable` + Einbindung)

**Interfaces:**
- Consumes: `buildVariantSummary`, `VariantSummary` aus Task 1; bestehende Helfer `formatMemory`, `formatMemorySummary`, `formatCpuClock`, `HardwareModelGroup`.
- Produces: Komponente `VariantSummaryTable({ groups, onSelect })` — `onSelect(group: HardwareModelGroup)` wird in Task 3 mit dem Varianten-Dialog verdrahtet. In diesem Task wird `onSelect` bereits aufgerufen, aber noch mit einem No-op verbunden.

- [ ] **Step 1: Glossar-Eintrag anfügen**

In `src/lib/glossaries/hardware.ts` innerhalb von `HARDWARE_SECTIONS` nach `vendorDistribution` einfügen:

```ts
  variantSummary: {
    term: "Varianten-Übersicht",
    description:
      "Sortierbare Tabelle aller Hardware-Varianten mit Werten je Host (Cores, Takt, RAM) und Gesamtwerten je Variante (Cores, GHz, RAM, VMs). GHz gesamt = Cores gesamt × CPU-Takt, als grobe Rechenkapazität. Klicke eine Zeile für die Detailansicht der Variante.",
  },
```

- [ ] **Step 2: Imports und Sortierlogik in Hardware.tsx ergänzen**

Import aus `@/lib/hardwareVariants` erweitern:

```ts
import {
  buildHardwareModelGroups,
  buildVariantSummary,
  DEFAULT_RAM_VARIANT_TOLERANCE_PERCENT,
  type HardwareModelGroup,
  type VariantSummary,
} from "@/lib/hardwareVariants";
```

Icon-Import um `ArrowUpDown` ergänzen (Zeile mit `Server, Cpu, ...` aus `lucide-react`).

- [ ] **Step 3: Komponente `VariantSummaryTable` einfügen**

In `src/pages/Hardware.tsx` im Abschnitt „Sub-Components" (nach `ModelCard`) einfügen:

```tsx
interface VariantRow {
  group: HardwareModelGroup;
  summary: VariantSummary;
}

type VariantSortKey =
  | "model" | "vendor" | "hosts" | "clusters"
  | "coresPerHost" | "ghzPerHost" | "ramPerHost"
  | "totalCores" | "totalGhz" | "totalRam" | "totalVms";

const VARIANT_SORT_VALUES: Record<VariantSortKey, (row: VariantRow) => string | number> = {
  model: (r) => r.group.modelLabel,
  vendor: (r) => r.group.vendor,
  hosts: (r) => r.group.count,
  clusters: (r) => r.summary.clusterNames.length,
  coresPerHost: (r) => r.group.totalCores,
  ghzPerHost: (r) => r.group.speedMHz,
  ramPerHost: (r) => r.group.memoryMiB,
  totalCores: (r) => r.summary.totalCores,
  totalGhz: (r) => r.summary.totalGhz,
  totalRam: (r) => r.summary.totalRamMiB,
  totalVms: (r) => r.summary.totalVms,
};

const VARIANT_COLUMNS: Array<{ key: VariantSortKey; label: string; numeric: boolean }> = [
  { key: "model", label: "Variante", numeric: false },
  { key: "vendor", label: "Hersteller", numeric: false },
  { key: "hosts", label: "Hosts", numeric: true },
  { key: "clusters", label: "Cluster", numeric: true },
  { key: "coresPerHost", label: "Cores/Host", numeric: true },
  { key: "ghzPerHost", label: "GHz/Host", numeric: true },
  { key: "ramPerHost", label: "RAM/Host", numeric: true },
  { key: "totalCores", label: "Cores Σ", numeric: true },
  { key: "totalGhz", label: "GHz Σ", numeric: true },
  { key: "totalRam", label: "RAM Σ", numeric: true },
  { key: "totalVms", label: "VMs Σ", numeric: true },
];

function formatGhzCapacity(ghz: number): string {
  if (!ghz) return "—";
  return `${ghz.toLocaleString("de-DE", { maximumFractionDigits: 1 })} GHz`;
}

function VariantSummaryTable({
  groups,
  onSelect,
}: {
  groups: HardwareModelGroup[];
  onSelect: (group: HardwareModelGroup) => void;
}) {
  const [sortKey, setSortKey] = useState<VariantSortKey>("hosts");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo<VariantRow[]>(
    () => groups.map((group) => ({ group, summary: buildVariantSummary(group) })),
    [groups],
  );

  const sortedRows = useMemo(() => {
    const getValue = VARIANT_SORT_VALUES[sortKey];
    return [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "de-DE", { numeric: true, sensitivity: "base" });
      return sortDesc ? -cmp : cmp;
    });
  }, [rows, sortKey, sortDesc]);

  const totals = useMemo(
    () => rows.reduce(
      (acc, r) => ({
        hosts: acc.hosts + r.group.count,
        cores: acc.cores + r.summary.totalCores,
        ghz: acc.ghz + r.summary.totalGhz,
        ramMiB: acc.ramMiB + r.summary.totalRamMiB,
        vms: acc.vms + r.summary.totalVms,
      }),
      { hosts: 0, cores: 0, ghz: 0, ramMiB: 0, vms: 0 },
    ),
    [rows],
  );

  const toggleSort = (key: VariantSortKey) => {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(VARIANT_COLUMNS.find((c) => c.key === key)?.numeric ?? true);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
            {VARIANT_COLUMNS.map((col) => (
              <th key={col.key} className={`py-2 pr-3 ${col.numeric ? "text-right" : "text-left"}`}>
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === col.key ? "text-foreground" : ""}`}
                >
                  {col.label}
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ group, summary }) => (
            <tr
              key={group.signature}
              onClick={() => onSelect(group)}
              className="cursor-pointer border-b border-border/40 hover:bg-muted/30 transition-colors"
            >
              <td className="py-2 pr-3">
                <p className="font-mono-data font-semibold">{group.modelLabel || "Unknown"}</p>
                <p className="text-[10px] text-muted-foreground">{group.cpuModel}</p>
              </td>
              <td className="py-2 pr-3">{shortenVendor(group.vendor)}</td>
              <td className="py-2 pr-3 text-right font-mono-data">{group.count}</td>
              <td
                className="py-2 pr-3 text-right font-mono-data"
                title={summary.clusterNames.join(", ")}
              >
                {summary.clusterNames.length}
              </td>
              <td className="py-2 pr-3 text-right font-mono-data">{group.totalCores || "—"}</td>
              <td className="py-2 pr-3 text-right font-mono-data">{formatCpuClock(group.speedMHz)}</td>
              <td className="py-2 pr-3 text-right font-mono-data">
                {formatMemorySummary(group.memoryValuesMiB, group.memoryMiB)}
              </td>
              <td className="py-2 pr-3 text-right font-mono-data">{summary.totalCores || "—"}</td>
              <td className="py-2 pr-3 text-right font-mono-data">{formatGhzCapacity(summary.totalGhz)}</td>
              <td className="py-2 pr-3 text-right font-mono-data">{formatMemory(summary.totalRamMiB)}</td>
              <td className="py-2 pr-3 text-right font-mono-data">{summary.totalVms}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="py-2 pr-3">Gesamt ({rows.length} Varianten)</td>
            <td className="py-2 pr-3" />
            <td className="py-2 pr-3 text-right font-mono-data">{totals.hosts}</td>
            <td className="py-2 pr-3" />
            <td className="py-2 pr-3" />
            <td className="py-2 pr-3" />
            <td className="py-2 pr-3" />
            <td className="py-2 pr-3 text-right font-mono-data">{totals.cores}</td>
            <td className="py-2 pr-3 text-right font-mono-data">{formatGhzCapacity(totals.ghz)}</td>
            <td className="py-2 pr-3 text-right font-mono-data">{formatMemory(totals.ramMiB)}</td>
            <td className="py-2 pr-3 text-right font-mono-data">{totals.vms}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Tabelle in die Seite einbinden**

In `Hardware()` zwischen dem Charts-Grid (`</div>` nach dem Vendor-Pie) und dem Kommentar `{/* Model cards grid */}` einfügen:

```tsx
      {/* Variant summary table */}
      <Card>
        <CardHeader className="pb-2">
          <InfoTooltip entry={HARDWARE_SECTIONS.variantSummary} side="bottom">
            <CardTitle className="w-fit cursor-help text-sm font-semibold">Varianten-Übersicht</CardTitle>
          </InfoTooltip>
        </CardHeader>
        <CardContent>
          <VariantSummaryTable groups={modelGroups} onSelect={() => {}} />
        </CardContent>
      </Card>
```

- [ ] **Step 5: Verifikation**

Run: `npm run typecheck && npm run lint && npx vitest run src/test/hardwareVariants.test.ts`
Expected: alles grün (Lint darf keine neuen Fehler zeigen).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Hardware.tsx src/lib/glossaries/hardware.ts
git commit -m "feat: add hardware variant summary table"
```

---

### Task 3: Varianten-Detail-Dialog und Verdrahtung

**Files:**
- Modify: `src/pages/Hardware.tsx` (neue Komponente `VariantDetailDialog`, State `selectedVariant`, `onSelect`-Verdrahtung)

**Interfaces:**
- Consumes: `VariantSummaryTable` (Task 2), `buildVariantSummary`, `HostDetailDialog` (bestehend), `formatMemory`, `formatCpuClock`, `shortenVendor`.
- Produces: abgeschlossenes Feature; keine weiteren Tasks.

- [ ] **Step 1: Komponente `VariantDetailDialog` einfügen**

In `src/pages/Hardware.tsx` nach `VariantSummaryTable` einfügen:

```tsx
function VariantDetailDialog({
  group,
  open,
  onClose,
  onSelectHost,
}: {
  group: HardwareModelGroup | null;
  open: boolean;
  onClose: () => void;
  onSelectHost: (h: HostDetail) => void;
}) {
  if (!group) return null;

  const summary = buildVariantSummary(group);
  const sortedHosts = [...group.hosts].sort((a, b) =>
    a.host.localeCompare(b.host, "de-DE", { numeric: true, sensitivity: "base" }),
  );

  const kpis: Array<[string, string]> = [
    ["Hosts", String(group.count)],
    ["Cores Σ", String(summary.totalCores)],
    ["GHz Σ", formatGhzCapacity(summary.totalGhz)],
    ["RAM Σ", formatMemory(summary.totalRamMiB)],
    ["VMs Σ", String(summary.totalVms)],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">{group.modelLabel || "Unknown"}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {group.vendor} · {group.cpuModel} · {group.cpuSockets || "?"} Sockel ·{" "}
                {group.totalCores || "?"} Cores · {formatCpuClock(group.speedMHz)}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="p-6 space-y-6">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {kpis.map(([label, val]) => (
                <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                  <p className="text-lg font-bold font-mono-data">{val}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <Separator />

            {/* Cluster breakdown */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" /> Cluster ({summary.clusterBreakdown.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Cluster</th>
                      <th className="py-2 pr-3 text-right">Hosts</th>
                      <th className="py-2 pr-3 text-right">Cores</th>
                      <th className="py-2 pr-3 text-right">RAM</th>
                      <th className="py-2 pr-3 text-right">VMs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.clusterBreakdown.map((c) => (
                      <tr key={c.cluster} className="border-b border-border/40">
                        <td className="py-2 pr-3">{c.cluster}</td>
                        <td className="py-2 pr-3 text-right font-mono-data">{c.hosts}</td>
                        <td className="py-2 pr-3 text-right font-mono-data">{c.cores}</td>
                        <td className="py-2 pr-3 text-right font-mono-data">{formatMemory(c.ramMiB)}</td>
                        <td className="py-2 pr-3 text-right font-mono-data">{c.vms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <Separator />

            {/* Hosts */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Server className="h-3.5 w-3.5" /> Hosts ({sortedHosts.length})
              </h4>
              <div className="space-y-1">
                {sortedHosts.map((h) => (
                  <button
                    type="button"
                    key={h.host}
                    onClick={() => onSelectHost(h)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60 transition-colors group/row"
                  >
                    <span className="font-mono-data text-xs truncate">{h.host}</span>
                    <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{h.cluster || NO_CLUSTER_LABEL}</span>
                      <span className="font-mono-data">{formatMemory(h.memoryMiB)}</span>
                      <span className="font-mono-data">{h.vmCount} VMs</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

Dazu den Import aus `@/lib/hardwareVariants` um `NO_CLUSTER_LABEL` erweitern.

- [ ] **Step 2: State und Verdrahtung in `Hardware()`**

Nach `const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);` einfügen:

```tsx
const [selectedVariant, setSelectedVariant] = useState<HardwareModelGroup | null>(null);
```

In der Tabellen-Einbindung aus Task 2 das No-op ersetzen:

```tsx
<VariantSummaryTable groups={modelGroups} onSelect={setSelectedVariant} />
```

Vor `<HostDetailDialog ...>` den Varianten-Dialog einfügen; Host-Klick schließt den Varianten-Dialog und öffnet den Host-Dialog:

```tsx
      {/* Variant detail dialog */}
      <VariantDetailDialog
        group={selectedVariant}
        open={!!selectedVariant}
        onClose={() => setSelectedVariant(null)}
        onSelectHost={(h) => {
          setSelectedVariant(null);
          setSelectedHost(h);
        }}
      />
```

- [ ] **Step 3: Verifikation**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: alles grün.

Zusätzlich manuell im Dev-Server (`npm run dev`, Port 8080, Testdaten laut Memory): Tabelle sortieren, Zeile klicken → Varianten-Dialog, Host klicken → Host-Dialog.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Hardware.tsx
git commit -m "feat: add variant detail dialog"
```
