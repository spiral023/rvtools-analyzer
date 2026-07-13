# VLAN-Nutzung pro Cluster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Netzwerk-Ansicht, die pro Cluster die aktiv genutzten VLANs (VM-Adapter mit `Connected = true`) samt VM- und Host-Anzahl auflistet.

**Architecture:** Reine Aggregationsfunktion (`src/lib/vlanUsage.ts`) joint `vNetwork` über den Portgruppen-Namen mit `vPort`/`dvPort` (→ VLAN-ID) und leitet den Cluster aus `vNetwork.Cluster` (Fallback `vInfo`) ab. Ein Präsentations-Panel (`src/pages/VlanUsage.tsx`) rendert KPIs + Tabelle und wird als dritter Tab in `Networking.tsx` eingehängt. Muster analog `src/lib/averageVm.ts` + `HostNetworkPanel`.

**Tech Stack:** TypeScript, React, TanStack Table (`ColumnDef`), Vitest, Vite.

## Global Constraints

- UI-Sprache Deutsch; technische Bezeichner/Spaltennamen aus RVTools bleiben im Original.
- Aktiv-Kriterium ausschließlich `Connected === true` (Boolean oder String `"true"`), Power-State irrelevant.
- Row-Typ ist `SheetRow` aus `src/domain/models/types.ts` mit `.data: Record<string, string | number | boolean | null>`.
- Join-Key ist der Portgruppen-Name (`vNetwork.Network` == `vPort."Port Group"` bzw. `dvPort.Port`).
- Bestehende Panel-Muster einhalten: `useRawSheet(...)`, `useActiveSnapshotIds()`, `VirtualTable` mit `globalFilter={filters.search}`, `KpiCard`/`KpiGrid`, `InfoTooltip` mit `GlossaryEntry`.

---

## File Structure

- **Create** `src/lib/vlanUsage.ts` — reine Funktion `buildVlanUsage` + Typ `VlanUsageRow`.
- **Create** `src/test/vlanUsage.test.ts` — Vitest für den Join und alle Edge-Cases.
- **Modify** `src/lib/glossaries/networking.ts` — neue Exporte `NET_VLANUSAGE_KPI`, `NET_VLANUSAGE_COLUMNS`, `NET_VLANUSAGE_SECTIONS`.
- **Create** `src/pages/VlanUsage.tsx` — `VlanUsagePanel`.
- **Modify** `src/pages/Networking.tsx` — dritter Tab „VLAN-Nutzung".

---

## Task 1: Aggregationsfunktion `buildVlanUsage`

**Files:**
- Create: `src/lib/vlanUsage.ts`
- Test: `src/test/vlanUsage.test.ts`

**Interfaces:**
- Consumes: `SheetRow` aus `@/domain/models/types`.
- Produces:
  - `interface VlanUsageRow { cluster: string; vlan: string; portgroups: string; vmCount: number; hostCount: number; }`
  - `function buildVlanUsage(vNetwork: SheetRow[], vPort: SheetRow[], dvPort: SheetRow[], vInfo: SheetRow[]): VlanUsageRow[]`

- [ ] **Step 1: Write the failing test**

Create `src/test/vlanUsage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/domain/models/types";
import { buildVlanUsage } from "@/lib/vlanUsage";

function row(data: Record<string, string | number | boolean | null>): SheetRow {
  return { snapshotId: "snap-1", sheetName: "sheet", rowIndex: 0, data };
}

describe("buildVlanUsage", () => {
  it("returns empty array without data", () => {
    expect(buildVlanUsage([], [], [], [])).toEqual([]);
  });

  it("joins standard vSwitch portgroups to VLAN and counts distinct VMs/hosts", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
      row({ VM: "APP02", Network: "PG-Web", Connected: "true", Cluster: "Prod-01", Host: "esx2" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cluster: "Prod-01", vlan: "100", portgroups: "PG-Web", vmCount: 2, hostCount: 2 });
  });

  it("joins distributed vSwitch ports to VLAN", () => {
    const dvPort = [row({ Port: "DPG-DB", VLAN: "200" })];
    const vNetwork = [row({ VM: "DB01", Network: "DPG-DB", Connected: true, Cluster: "Prod-01", Host: "esx1" })];
    const rows = buildVlanUsage(vNetwork, [], dvPort, []);
    expect(rows[0]).toMatchObject({ vlan: "200", portgroups: "DPG-DB", vmCount: 1 });
  });

  it("ignores adapters that are not connected", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: false, Cluster: "Prod-01", Host: "esx1" })];
    expect(buildVlanUsage(vNetwork, vPort, [], [])).toEqual([]);
  });

  it("labels empty or zero VLAN as untagged", () => {
    const vPort = [row({ "Port Group": "PG-Mgmt", VLAN: "0" }), row({ "Port Group": "PG-Raw", VLAN: "" })];
    const vNetwork = [
      row({ VM: "M1", Network: "PG-Mgmt", Connected: true, Cluster: "C1", Host: "h1" }),
      row({ VM: "M2", Network: "PG-Raw", Connected: true, Cluster: "C1", Host: "h1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows.every((r) => r.vlan === "0 (untagged)")).toBe(true);
  });

  it("marks portgroups without a VLAN match as '?'", () => {
    const vNetwork = [row({ VM: "X1", Network: "PG-Unknown", Connected: true, Cluster: "C1", Host: "h1" })];
    const rows = buildVlanUsage(vNetwork, [], [], []);
    expect(rows[0]).toMatchObject({ vlan: "?", portgroups: "PG-Unknown", vmCount: 1 });
  });

  it("counts a VM with two adapters in the same VLAN only once", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows[0].vmCount).toBe(1);
    expect(rows[0].hostCount).toBe(1);
  });

  it("derives cluster from vInfo when vNetwork has none", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vInfo = [row({ VM: "APP01", Cluster: "Prod-99" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: true, Host: "esx1" })];
    const rows = buildVlanUsage(vNetwork, vPort, [], vInfo);
    expect(rows[0].cluster).toBe("Prod-99");
  });

  it("falls back to 'Unbekannt' when no cluster is available", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: true, Host: "esx1" })];
    expect(buildVlanUsage(vNetwork, vPort, [], [])[0].cluster).toBe("Unbekannt");
  });

  it("sorts by cluster ascending, then vmCount descending", () => {
    const vPort = [row({ "Port Group": "A", VLAN: "10" }), row({ "Port Group": "B", VLAN: "20" })];
    const vNetwork = [
      row({ VM: "v1", Network: "A", Connected: true, Cluster: "Beta", Host: "h1" }),
      row({ VM: "v2", Network: "B", Connected: true, Cluster: "Alpha", Host: "h1" }),
      row({ VM: "v3", Network: "B", Connected: true, Cluster: "Alpha", Host: "h2" }),
      row({ VM: "v4", Network: "A", Connected: true, Cluster: "Alpha", Host: "h1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows.map((r) => `${r.cluster}/${r.vlan}`)).toEqual(["Alpha/20", "Alpha/10", "Beta/10"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- vlanUsage`
Expected: FAIL — `Failed to resolve import "@/lib/vlanUsage"` / `buildVlanUsage is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/vlanUsage.ts`:

```ts
import type { SheetRow } from "@/domain/models/types";

/** Eine Zeile der VLAN-Nutzungstabelle: aktives VLAN innerhalb eines Clusters. */
export interface VlanUsageRow {
  cluster: string;
  /** VLAN-ID; "0 (untagged)" bei 0/leer, "?" wenn die Portgruppe kein VLAN-Match hat. */
  vlan: string;
  /** Kommaseparierte, deduplizierte Portgruppen-Namen. */
  portgroups: string;
  /** Anzahl distinct VMs mit verbundenem Adapter in diesem (Cluster, VLAN). */
  vmCount: number;
  /** Anzahl distinct Hosts dieser VMs. */
  hostCount: number;
}

const s = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** `Connected` kann Boolean oder String sein (vgl. src/pages/DailyOps.tsx). */
const isConnected = (v: unknown): boolean => v === true || s(v).toLowerCase() === "true";

/** Leere oder 0-VLAN als "untagged" kennzeichnen. */
const normalizeVlan = (raw: string): string => (raw === "" || raw === "0" ? "0 (untagged)" : raw);

interface Acc {
  portgroups: Set<string>;
  vms: Set<string>;
  hosts: Set<string>;
}

/**
 * Aggregiert die aktiv genutzten VLANs je Cluster.
 * Join: vNetwork.Network → vPort."Port Group" / dvPort.Port → VLAN-ID.
 * Cluster: vNetwork.Cluster, sonst Fallback über vInfo (VM → Cluster).
 */
export function buildVlanUsage(
  vNetwork: SheetRow[],
  vPort: SheetRow[],
  dvPort: SheetRow[],
  vInfo: SheetRow[],
): VlanUsageRow[] {
  const pgToVlan = new Map<string, string>();
  for (const r of vPort) {
    const name = s(r.data["Port Group"]);
    if (name) pgToVlan.set(name, s(r.data["VLAN"]));
  }
  for (const r of dvPort) {
    const name = s(r.data["Port"]);
    if (name) pgToVlan.set(name, s(r.data["VLAN"]));
  }

  const vmToCluster = new Map<string, string>();
  for (const r of vInfo) {
    const vm = s(r.data["VM"]);
    if (vm) vmToCluster.set(vm, s(r.data["Cluster"]));
  }

  const groups = new Map<string, Acc>();
  for (const r of vNetwork) {
    if (!isConnected(r.data["Connected"])) continue;
    const pg = s(r.data["Network"]);
    const vlan = pgToVlan.has(pg) ? normalizeVlan(pgToVlan.get(pg)!) : "?";
    const vm = s(r.data["VM"]);
    let cluster = s(r.data["Cluster"]);
    if (!cluster && vm) cluster = vmToCluster.get(vm) ?? "";
    if (!cluster) cluster = "Unbekannt";
    const host = s(r.data["Host"]);

    const key = `${cluster} ${vlan}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = { portgroups: new Set(), vms: new Set(), hosts: new Set() };
      groups.set(key, acc);
    }
    if (pg) acc.portgroups.add(pg);
    if (vm) acc.vms.add(vm);
    if (host) acc.hosts.add(host);
  }

  const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
  return [...groups.entries()]
    .map(([key, acc]) => {
      const [cluster, vlan] = key.split(" ");
      return {
        cluster,
        vlan,
        portgroups: [...acc.portgroups].sort((a, b) => collator.compare(a, b)).join(", "),
        vmCount: acc.vms.size,
        hostCount: acc.hosts.size,
      };
    })
    .sort((a, b) => collator.compare(a.cluster, b.cluster) || b.vmCount - a.vmCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- vlanUsage`
Expected: PASS — alle 10 Testfälle grün.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vlanUsage.ts src/test/vlanUsage.test.ts
git commit -m "feat: aggregate active VLANs per cluster (vNetwork join)"
```

---

## Task 2: Glossar + Panel-Komponente

**Files:**
- Modify: `src/lib/glossaries/networking.ts` (Exporte anhängen)
- Create: `src/pages/VlanUsage.tsx`

**Interfaces:**
- Consumes: `buildVlanUsage`, `VlanUsageRow` (Task 1); `NET_VLANUSAGE_KPI`, `NET_VLANUSAGE_COLUMNS`, `NET_VLANUSAGE_SECTIONS` (dieser Task); `SheetRow`.
- Produces: `export function VlanUsagePanel(): JSX.Element` (von Task 3 konsumiert).

- [ ] **Step 1: Glossar-Einträge anhängen**

Am Ende von `src/lib/glossaries/networking.ts` anfügen (nutzt die bereits dort deklarierte Konstante `RV` und den Import `GlossaryEntry`):

```ts
/* ================================================================== */
/*  Tab „VLAN-Nutzung“ (VlanUsagePanel)                               */
/* ================================================================== */

export const NET_VLANUSAGE_KPI: Record<string, GlossaryEntry> = {
  activeVlans: {
    term: "Aktive VLANs",
    description:
      "Anzahl unterschiedlicher VLAN-IDs, an denen mindestens ein VM-Adapter verbunden ist (Connected = true). Portgruppen ohne VLAN-Match sind nicht mitgezählt.",
    source: `${RV} · vNetwork · „Connected“/„Network“ · join vPort/dvPort`,
  },
  clusters: {
    term: "Cluster",
    description: "Anzahl der Cluster, in denen aktiv genutzte VLANs gefunden wurden.",
    source: `${RV} · vNetwork · „Cluster“ (Fallback vInfo)`,
  },
  connectedVms: {
    term: "Verbundene VMs",
    description:
      "Anzahl unterschiedlicher VMs mit mindestens einem verbundenen Netzwerkadapter (Connected = true).",
    source: `${RV} · vNetwork · „VM“/„Connected“`,
  },
  unmatched: {
    term: "Ohne Portgruppen-Match",
    description:
      "VMs, deren verbundene Portgruppe in vPort/dvPort keiner VLAN-ID zugeordnet werden konnte (VLAN „?“). Hinweis auf fehlende/uneinheitliche Portgruppen-Daten.",
    source: `${RV} · vNetwork · „Network“ ohne Treffer in vPort/dvPort`,
  },
};

export const NET_VLANUSAGE_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "Cluster, in dem das VLAN aktiv genutzt wird. „Unbekannt“, wenn keine Cluster-Angabe vorliegt.",
    source: `${RV} · vNetwork · „Cluster“ (Fallback vInfo · „Cluster“)`,
  },
  vlan: {
    term: "VLAN",
    description: "VLAN-ID der genutzten Portgruppe. „0 (untagged)“ = kein Tagging, „?“ = kein Portgruppen-Match.",
    source: `${RV} · vPort · „VLAN“ / dvPort · „VLAN“`,
  },
  portgroups: {
    term: "Portgruppe(n)",
    description: "Alle verbundenen Portgruppen dieses VLANs im Cluster.",
    source: `${RV} · vNetwork · „Network“`,
  },
  vmCount: {
    term: "# VMs",
    description: "Anzahl unterschiedlicher VMs mit verbundenem Adapter in diesem VLAN und Cluster.",
    source: `${RV} · vNetwork · „VM“`,
  },
  hostCount: {
    term: "# Hosts",
    description: "Anzahl unterschiedlicher ESXi-Hosts, auf denen diese VMs laufen.",
    source: `${RV} · vNetwork · „Host“`,
  },
};

export const NET_VLANUSAGE_SECTIONS: Record<string, GlossaryEntry> = {
  table: {
    term: "VLAN-Nutzung pro Cluster",
    description:
      "Welche VLANs innerhalb eines Clusters tatsächlich von VMs genutzt werden (verbundene Adapter). Ergänzt die konfigurationsbasierte VLAN-Verteilung um die reale Nutzung. Join: vNetwork → vPort/dvPort über den Portgruppen-Namen.",
    source: `${RV} · vNetwork · join vPort/dvPort`,
  },
};
```

- [ ] **Step 2: Panel-Komponente erstellen**

Create `src/pages/VlanUsage.tsx`:

```tsx
import { useMemo } from "react";
import { Network, Layers, Server, HelpCircle } from "lucide-react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { buildVlanUsage, type VlanUsageRow } from "@/lib/vlanUsage";
import { NET_VLANUSAGE_KPI, NET_VLANUSAGE_COLUMNS, NET_VLANUSAGE_SECTIONS } from "@/lib/glossaries/networking";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<VlanUsageRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_VLANUSAGE_COLUMNS.cluster } },
  {
    accessorKey: "vlan",
    header: "VLAN",
    meta: { info: NET_VLANUSAGE_COLUMNS.vlan },
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return <span className={v === "?" ? "text-warning font-semibold" : "font-mono-data"}>{v}</span>;
    },
  },
  {
    accessorKey: "portgroups",
    header: "Portgruppe(n)",
    meta: { info: NET_VLANUSAGE_COLUMNS.portgroups },
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return <div className="max-w-[320px] truncate" title={v}>{v || "—"}</div>;
    },
  },
  { accessorKey: "vmCount", header: "# VMs", meta: { info: NET_VLANUSAGE_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "hostCount", header: "# Hosts", meta: { info: NET_VLANUSAGE_COLUMNS.hostCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
];

export function VlanUsagePanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rawVNetwork = [] } = useRawSheet("vNetwork");
  const { data: rawVPort = [] } = useRawSheet("vPort");
  const { data: rawDvPort = [] } = useRawSheet("dvPort");
  const { data: rawVInfo = [] } = useRawSheet("vInfo");

  const rows = useMemo(
    () => buildVlanUsage(rawVNetwork, rawVPort, rawDvPort, rawVInfo),
    [rawVNetwork, rawVPort, rawDvPort, rawVInfo],
  );

  const activeVlans = useMemo(() => new Set(rows.filter((r) => r.vlan !== "?").map((r) => r.vlan)).size, [rows]);
  const clusterCount = useMemo(() => new Set(rows.map((r) => r.cluster)).size, [rows]);
  const unmatchedVms = useMemo(
    () => rows.filter((r) => r.vlan === "?").reduce((sum, r) => sum + r.vmCount, 0),
    [rows],
  );
  const connectedVms = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawVNetwork) {
      if (r.data["Connected"] === true || String(r.data["Connected"] ?? "").toLowerCase() === "true") {
        const vm = String(r.data["VM"] ?? "").trim();
        if (vm) set.add(vm);
      }
    }
    return set.size;
  }, [rawVNetwork]);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Aktive VLANs" value={formatNum(activeVlans)} icon={<Layers className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.activeVlans} />
        <KpiCard title="Cluster" value={formatNum(clusterCount)} icon={<Network className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.clusters} />
        <KpiCard title="Verbundene VMs" value={formatNum(connectedVms)} icon={<Server className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.connectedVms} />
        <KpiCard title="Ohne Portgruppen-Match" value={formatNum(unmatchedVms)} severity={unmatchedVms > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.unmatched} />
      </KpiGrid>

      <div>
        <InfoTooltip entry={NET_VLANUSAGE_SECTIONS.table} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VLAN-Nutzung pro Cluster ({rows.length})</h3>
        </InfoTooltip>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — keine Fehler in `vlanUsage.ts`, `networking.ts`, `VlanUsage.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/glossaries/networking.ts src/pages/VlanUsage.tsx
git commit -m "feat: add VLAN usage panel with KPIs and table"
```

---

## Task 3: Tab in `Networking.tsx` einhängen

**Files:**
- Modify: `src/pages/Networking.tsx`

**Interfaces:**
- Consumes: `VlanUsagePanel` (Task 2).

- [ ] **Step 1: Import ergänzen**

In `src/pages/Networking.tsx` nach der Zeile `import { HostNetworkPanel } from "@/pages/HostNetwork";` einfügen:

```tsx
import { VlanUsagePanel } from "@/pages/VlanUsage";
```

- [ ] **Step 2: Tab-Typ erweitern**

`type NetworkTab = "security" | "host";` ersetzen durch:

```tsx
type NetworkTab = "security" | "host" | "vlan";
```

- [ ] **Step 3: TabsTrigger ergänzen**

Innerhalb `<TabsList ...>` nach `<TabsTrigger value="host">Host-Netzwerk</TabsTrigger>` einfügen:

```tsx
          <TabsTrigger value="vlan">VLAN-Nutzung</TabsTrigger>
```

- [ ] **Step 4: TabsContent ergänzen**

Nach dem schließenden `</TabsContent>` des `value="host"`-Blocks einfügen:

```tsx
        <TabsContent value="vlan" className="space-y-4">
          <VlanUsagePanel />
        </TabsContent>
```

- [ ] **Step 5: Verifizieren (Typecheck + Test + Build)**

Run: `npm run typecheck && npm test -- vlanUsage && npm run build`
Expected: typecheck PASS, vlanUsage-Tests PASS, build ohne Fehler.

- [ ] **Step 6: Manuelle Sichtprüfung (optional, mit Testdaten)**

Run: `npm run dev` (Dev-Server auf Port 8080), im Browser Netzwerk öffnen → Tab „VLAN-Nutzung".
Expected: KPI-Zeile (Aktive VLANs / Cluster / Verbundene VMs / Ohne Portgruppen-Match) und die Tabelle Cluster | VLAN | Portgruppe(n) | # VMs | # Hosts; Suche im FilterBar filtert die Tabelle.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Networking.tsx
git commit -m "feat: wire VLAN usage tab into networking page"
```

---

## Self-Review

- **Spec coverage:** Datenquellen/Join → Task 1; Aktiv-Kriterium `Connected=true` → Task 1 (`isConnected`); reine Funktion + Panel + Tab + Glossar + Test → Tasks 1–3; alle Edge-Cases (Portgruppe ohne Match, untagged, fehlender Cluster, distinct VM, vNetwork ohne Cluster→vInfo-Fallback, distinct Host) → Task-1-Tests; KPI „Ohne Portgruppen-Match" → Task 2. Keine Lücke.
- **Placeholder scan:** Keine TBD/TODO; jeder Code-Step enthält vollständigen Code und exakte Befehle mit erwarteter Ausgabe.
- **Type consistency:** `VlanUsageRow`-Felder (`cluster`, `vlan`, `portgroups`, `vmCount`, `hostCount`) identisch in Funktion, Tests, Spalten-`accessorKey` und Glossar-Keys. `buildVlanUsage`-Signatur überall gleich.
