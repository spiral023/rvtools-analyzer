# Geführte Netzwerk-Kontrolle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den bestehenden Tab „Kontrolle“ in ein geführtes, direkt verlinkbares Netzwerk-Prüfzentrum mit Quellenstatus, priorisierter Übersicht und fokussierten Detailprüfungen umbauen.

**Architecture:** Die bestehenden Audit-Berechnungen bleiben unverändert. Eine neue reine View-Model-Schicht aggregiert Quellenbereitschaft, Befundzahlen und Prioritäten; URL-Helfer kapseln `tab`, `check` und `scope`. Kleine React-Komponenten rendern Übersicht und Detailrahmen, während die vorhandenen Tabellen in vier fachlich getrennte Detailpanels verschoben werden.

**Tech Stack:** React 18, TypeScript, React Router 6, TanStack Query/Table/Virtual, Tailwind CSS, shadcn/ui, Vitest, Testing Library.

---

## Global Constraints

- Umsetzung in einem isolierten Git-Worktree beginnen.
- Vor Task 1 den Skill `superpowers:test-driven-development` aktivieren.
- Für die React-Oberfläche den vom Nutzer verlangten Skill `frontend-design`
  verwenden und ausschließlich bestehende Tokens aus `src/index.css` nutzen.
- Nach den React-Änderungen den Skill `react-doctor` ausführen.
- Keine Änderung an `DB_VERSION`, IndexedDB-Stores oder bestehenden
  Match-Regeln in `src/lib/networkAudit.ts`.
- `VirtualTable` bleibt für alle Audit-Tabellen erhalten.
- Umlaute und UI-Texte als UTF-8 schreiben.
- Nicht zum Scope gehörende vorhandene Änderungen im Worktree nicht anfassen.

## File Map

### Neu

- `src/lib/networkAuditViewModel.ts`  
  Reine Typen und Aggregation für Quellenstatus, Prioritäten und Prüfkarten.
- `src/test/networkAuditViewModel.test.ts`  
  Unit-Tests für das View-Model.
- `src/lib/networkAuditNavigation.ts`  
  Validierung und Aktualisierung der Query-Parameter.
- `src/test/networkAuditNavigation.test.ts`  
  Unit-Tests für URL-Zustand.
- `src/components/network/AuditSourceStatus.tsx`  
  Quellenleiste mit Anzahl, Importdatum und Upload-Link.
- `src/components/network/AuditCheckCard.tsx`  
  Wiederverwendbare nummerierte Prüfkarte.
- `src/components/network/AuditDetailView.tsx`  
  Gemeinsamer Detailrahmen mit Bereichskontext und Ergebnisfilter.
- `src/components/network/NetworkAuditOverview.tsx`  
  Zusammenfassung und vierteiliger Prüfpfad.
- `src/components/network/NetworkAuditUi.test.tsx`  
  Komponententests für Quellen, Prüfkarten, Übersicht und Detailrahmen.
- `src/components/network/NetworkAuditDetails.tsx`  
  Die vier fachlichen Tabellenpanels; übernimmt die vorhandenen
  Spaltendefinitionen aus `NetworkAuditPanel.tsx`.

### Ändern

- `src/hooks/useActiveSnapshots.ts`  
  Liefert Quellenmetadaten, Query-Fehler und gemeinsamen Retry.
- `src/components/tables/VirtualTable.tsx`  
  Zeigt einen expliziten Zustand für leere beziehungsweise weggefilterte
  Ergebnisse.
- `src/components/tables/VirtualTable.test.tsx`  
  Testet den neuen leeren Zustand.
- `src/pages/NetworkAuditPanel.tsx`  
  Wird zum schlanken URL- und Daten-Orchestrator.
- `src/pages/NetworkSearchPanels.test.tsx`  
  Prüft Detailansichten, Suche und neue Hook-Rückgabe.
- `src/pages/Networking.tsx`  
  Synchronisiert den Netzwerk-Tab mit der URL und lässt „Kontrolle“ ohne
  RVTools-Snapshot zu.
- `src/pages/Networking.test.tsx`  
  Testet Deep Links und den Zugriff ohne RVTools.
- `src/lib/glossaries/networking.ts`  
  Ergänzt Begriffe für die drei handlungsorientierten Kennzahlen.

---

### Task 1: Reines Audit-View-Model

**Files:**
- Create: `src/lib/networkAuditViewModel.ts`
- Create: `src/test/networkAuditViewModel.test.ts`

- [ ] **Step 1: Failing Tests für Quellenstatus, Aggregation und Priorität schreiben**

```ts
import { describe, expect, it } from "vitest";
import {
  buildNetworkAuditViewModel,
  type NetworkAuditSourceFacts,
} from "@/lib/networkAuditViewModel";
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";

const present = { count: 1, importedAt: "2026-07-23T10:00:00.000Z" };
const missing = { count: 0, importedAt: null };

function sources(overrides: Partial<NetworkAuditSourceFacts> = {}): NetworkAuditSourceFacts {
  return {
    rvtools: present,
    cdp: present,
    eramonIface: present,
    eramonL2: present,
    ipam: present,
    techInfo: present,
    ...overrides,
  };
}

function port(overrides: Partial<PortAuditRow> = {}): PortAuditRow {
  return {
    switchInterfaceKey: "sw01::eth1/1",
    switchHostname: "sw01",
    interface: "Eth1/1",
    description: "esx01",
    status: "aktiv",
    matchStatus: "confirmed-cdp",
    matchedHost: "esx01",
    matchedSource: "cdp",
    labelConflict: false,
    labelConflictHost: null,
    statusConflict: false,
    bandwidthBps: null,
    finding: null,
    ...overrides,
  };
}

const emptyHostQuality: {
  rvtoolsRows: RvtoolsHostQualityRow[];
  techInfoRows: TechInfoHostQualityRow[];
} = { rvtoolsRows: [], techInfoRows: [] };

describe("buildNetworkAuditViewModel", () => {
  it("markiert optionale fehlende Quellen als eingeschränkt", () => {
    const result = buildNetworkAuditViewModel({
      sources: sources({ ipam: missing }),
      portRows: [port()],
      hostQuality: emptyHostQuality,
      cdpMacRows: [],
      l2DiscoveryRows: [],
    });

    expect(result.checks.ports.readiness).toBe("limited");
    expect(result.checks.ports.missingOptional).toContain("ipam");
    expect(result.checks.mac.readiness).toBe("ready");
  });

  it("priorisiert kritische Portkonflikte vor zu prüfenden MAC-Befunden", () => {
    const cdpMacRows: CdpMacRow[] = [{
      host: "esx01",
      adapter: "vmnic0",
      mac: "00:50:56:ab:cd:ef",
      macCanonical: "005056abcdef",
      inL2: false,
      l2Switch: null,
      l2Interface: null,
      vlan: null,
      learnedIp: null,
      dnsName: null,
      topologyMismatch: false,
      finding: "MAC nicht in L2-Tabelle",
    }];

    const result = buildNetworkAuditViewModel({
      sources: sources(),
      portRows: [port({ labelConflict: true, finding: "Beschriftung weicht ab" })],
      hostQuality: emptyHostQuality,
      cdpMacRows,
      l2DiscoveryRows: [],
    });

    expect(result.totals).toEqual({ critical: 1, review: 1, passed: 0 });
    expect(result.nextCheck).toBe("ports");
    expect(result.checks.ports.status).toBe("critical");
  });

  it("stuft unbekannte L2-MACs als zu prüfen ein", () => {
    const l2DiscoveryRows: L2DiscoveryRow[] = [{
      l2EntryKey: "sw01::eth1/1::aabbccddeeff::100",
      switchName: "sw01",
      interface: "Eth1/1",
      vlan: "100",
      mac: "aabb.ccdd.eeff",
      learnedIp: null,
      dnsName: null,
      classification: "unknown",
      esxiHost: null,
    }];

    const result = buildNetworkAuditViewModel({
      sources: sources(),
      portRows: [],
      hostQuality: emptyHostQuality,
      cdpMacRows: [],
      l2DiscoveryRows,
    });

    expect(result.checks.discovery.counts.review).toBe(1);
    expect(result.nextCheck).toBe("discovery");
  });

  it("liefert ohne offene Befunde kein nächstes Prüfziel", () => {
    const result = buildNetworkAuditViewModel({
      sources: sources(),
      portRows: [port()],
      hostQuality: emptyHostQuality,
      cdpMacRows: [],
      l2DiscoveryRows: [],
    });

    expect(result.totals).toEqual({ critical: 0, review: 0, passed: 1 });
    expect(result.nextCheck).toBeNull();
    expect(result.hasExecutableChecks).toBe(true);
  });

  it("unterscheidet fehlende Daten von einer bestandenen Prüfung", () => {
    const result = buildNetworkAuditViewModel({
      sources: sources({
        rvtools: missing,
        cdp: missing,
        eramonIface: missing,
        eramonL2: missing,
      }),
      portRows: [],
      hostQuality: emptyHostQuality,
      cdpMacRows: [],
      l2DiscoveryRows: [],
    });

    expect(result.hasExecutableChecks).toBe(false);
    expect(result.nextCheck).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen und erwartetes Rot bestätigen**

Run:

```bash
npm run test -- src/test/networkAuditViewModel.test.ts
```

Expected: FAIL mit `Failed to resolve import "@/lib/networkAuditViewModel"`.

- [ ] **Step 3: View-Model minimal implementieren**

```ts
import type { CdpMacRow, L2DiscoveryRow, PortAuditRow } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";

export type NetworkAuditSourceKey =
  | "rvtools"
  | "cdp"
  | "eramonIface"
  | "eramonL2"
  | "ipam"
  | "techInfo";

export type NetworkAuditCheckId = "ports" | "hosts" | "mac" | "discovery";
export type NetworkAuditCheckRoute = "overview" | NetworkAuditCheckId;
export type NetworkAuditScope = "attention" | "passed" | "all";
export type NetworkAuditReadiness = "ready" | "limited" | "unavailable";
export type NetworkAuditStatus = "critical" | "review" | "passed" | "unavailable";

export interface NetworkAuditSourceFact {
  count: number;
  importedAt: string | null;
}

export type NetworkAuditSourceFacts = Record<NetworkAuditSourceKey, NetworkAuditSourceFact>;

export interface NetworkAuditCounts {
  critical: number;
  review: number;
  passed: number;
}

export interface NetworkAuditCheckSummary {
  id: NetworkAuditCheckId;
  readiness: NetworkAuditReadiness;
  status: NetworkAuditStatus;
  counts: NetworkAuditCounts;
  missingRequired: NetworkAuditSourceKey[];
  missingOptional: NetworkAuditSourceKey[];
}

export interface NetworkAuditViewModel {
  sources: NetworkAuditSourceFacts;
  checks: Record<NetworkAuditCheckId, NetworkAuditCheckSummary>;
  totals: NetworkAuditCounts;
  nextCheck: NetworkAuditCheckId | null;
  hasExecutableChecks: boolean;
}

interface BuildInput {
  sources: NetworkAuditSourceFacts;
  portRows: PortAuditRow[];
  hostQuality: {
    rvtoolsRows: RvtoolsHostQualityRow[];
    techInfoRows: TechInfoHostQualityRow[];
  };
  cdpMacRows: CdpMacRow[];
  l2DiscoveryRows: L2DiscoveryRow[];
}

const CHECK_ORDER: NetworkAuditCheckId[] = ["ports", "hosts", "mac", "discovery"];

const REQUIREMENTS: Record<NetworkAuditCheckId, {
  required: NetworkAuditSourceKey[];
  optional: NetworkAuditSourceKey[];
}> = {
  ports: {
    required: ["eramonIface"],
    optional: ["cdp", "rvtools", "techInfo", "ipam"],
  },
  hosts: {
    required: ["rvtools"],
    optional: ["techInfo", "ipam"],
  },
  mac: {
    required: ["cdp", "eramonL2"],
    optional: [],
  },
  discovery: {
    required: ["eramonL2"],
    optional: ["cdp", "ipam"],
  },
};

function emptyCounts(): NetworkAuditCounts {
  return { critical: 0, review: 0, passed: 0 };
}

function readiness(
  id: NetworkAuditCheckId,
  sources: NetworkAuditSourceFacts,
): Pick<NetworkAuditCheckSummary, "readiness" | "missingRequired" | "missingOptional"> {
  const requirement = REQUIREMENTS[id];
  const missingRequired = requirement.required.filter((key) => sources[key].count === 0);
  const missingOptional = requirement.optional.filter((key) => sources[key].count === 0);
  return {
    readiness: missingRequired.length > 0
      ? "unavailable"
      : missingOptional.length > 0
        ? "limited"
        : "ready",
    missingRequired,
    missingOptional,
  };
}

function statusFor(readinessValue: NetworkAuditReadiness, counts: NetworkAuditCounts): NetworkAuditStatus {
  if (readinessValue === "unavailable") return "unavailable";
  if (counts.critical > 0) return "critical";
  if (counts.review > 0) return "review";
  return "passed";
}

function portCounts(rows: PortAuditRow[]): NetworkAuditCounts {
  return rows.reduce((counts, row) => {
    if (row.labelConflict || row.statusConflict) counts.critical += 1;
    else if (row.matchStatus === "unknown" || row.matchStatus === "documented-only" || row.matchStatus === "text-match") counts.review += 1;
    else counts.passed += 1;
    return counts;
  }, emptyCounts());
}

function hostCounts(input: BuildInput["hostQuality"]): NetworkAuditCounts {
  const rows = [...input.rvtoolsRows, ...input.techInfoRows];
  return rows.reduce((counts, row) => {
    if (row.finding) counts.review += 1;
    else counts.passed += 1;
    return counts;
  }, emptyCounts());
}

function macCounts(rows: CdpMacRow[]): NetworkAuditCounts {
  return rows.reduce((counts, row) => {
    if (row.topologyMismatch) counts.critical += 1;
    else if (!row.inL2) counts.review += 1;
    else counts.passed += 1;
    return counts;
  }, emptyCounts());
}

function discoveryCounts(rows: L2DiscoveryRow[]): NetworkAuditCounts {
  return rows.reduce((counts, row) => {
    if (row.classification === "unknown") counts.review += 1;
    else counts.passed += 1;
    return counts;
  }, emptyCounts());
}

export function buildNetworkAuditViewModel(input: BuildInput): NetworkAuditViewModel {
  const countsByCheck: Record<NetworkAuditCheckId, NetworkAuditCounts> = {
    ports: portCounts(input.portRows),
    hosts: hostCounts(input.hostQuality),
    mac: macCounts(input.cdpMacRows),
    discovery: discoveryCounts(input.l2DiscoveryRows),
  };

  const checks = Object.fromEntries(CHECK_ORDER.map((id) => {
    const availability = readiness(id, input.sources);
    const counts = countsByCheck[id];
    return [id, {
      id,
      ...availability,
      counts,
      status: statusFor(availability.readiness, counts),
    }];
  })) as Record<NetworkAuditCheckId, NetworkAuditCheckSummary>;

  const totals = CHECK_ORDER.reduce((result, id) => {
    if (checks[id].readiness === "unavailable") return result;
    result.critical += checks[id].counts.critical;
    result.review += checks[id].counts.review;
    result.passed += checks[id].counts.passed;
    return result;
  }, emptyCounts());

  const critical = CHECK_ORDER.find((id) => checks[id].readiness !== "unavailable" && checks[id].counts.critical > 0);
  const review = CHECK_ORDER.find((id) => checks[id].readiness !== "unavailable" && checks[id].counts.review > 0);

  return {
    sources: input.sources,
    checks,
    totals,
    nextCheck: critical ?? review ?? null,
    hasExecutableChecks: CHECK_ORDER.some((id) => checks[id].readiness !== "unavailable"),
  };
}
```

- [ ] **Step 4: View-Model-Tests grün ausführen**

Run:

```bash
npm run test -- src/test/networkAuditViewModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkAuditViewModel.ts src/test/networkAuditViewModel.test.ts
git commit -m "feat: add network audit view model"
```

---

### Task 2: URL-Zustand kapseln

**Files:**
- Create: `src/lib/networkAuditNavigation.ts`
- Create: `src/test/networkAuditNavigation.test.ts`

- [ ] **Step 1: Failing Tests für Defaults, Validierung und Updates schreiben**

```ts
import { describe, expect, it } from "vitest";
import {
  parseNetworkAuditLocation,
  parseNetworkTab,
  updateNetworkAuditSearch,
} from "@/lib/networkAuditNavigation";

describe("networkAuditNavigation", () => {
  it("verwendet sichere Defaults", () => {
    const params = new URLSearchParams();
    expect(parseNetworkTab(params, "security")).toBe("security");
    expect(parseNetworkAuditLocation(params)).toEqual({
      check: "overview",
      scope: "attention",
    });
  });

  it("akzeptiert nur bekannte Werte", () => {
    const params = new URLSearchParams("tab=audit&check=mac&scope=passed");
    expect(parseNetworkTab(params, "security")).toBe("audit");
    expect(parseNetworkAuditLocation(params)).toEqual({
      check: "mac",
      scope: "passed",
    });

    const invalid = new URLSearchParams("tab=wrong&check=wrong&scope=wrong");
    expect(parseNetworkTab(invalid, "host")).toBe("host");
    expect(parseNetworkAuditLocation(invalid)).toEqual({
      check: "overview",
      scope: "attention",
    });
  });

  it("bewahrt fremde Query-Parameter", () => {
    const current = new URLSearchParams("foo=bar&tab=audit");
    const next = updateNetworkAuditSearch(current, {
      check: "ports",
      scope: "all",
    });

    expect(next.toString()).toContain("foo=bar");
    expect(next.get("tab")).toBe("audit");
    expect(next.get("check")).toBe("ports");
    expect(next.get("scope")).toBe("all");
  });
});
```

- [ ] **Step 2: Rot bestätigen**

Run:

```bash
npm run test -- src/test/networkAuditNavigation.test.ts
```

Expected: FAIL wegen des fehlenden Moduls.

- [ ] **Step 3: URL-Helfer implementieren**

```ts
import type { NetworkAuditCheckRoute, NetworkAuditScope } from "@/lib/networkAuditViewModel";

export type NetworkTab =
  | "security"
  | "host"
  | "vlan"
  | "cdp"
  | "ipam"
  | "eramon-iface"
  | "eramon-l2"
  | "audit";

const NETWORK_TABS = new Set<NetworkTab>([
  "security",
  "host",
  "vlan",
  "cdp",
  "ipam",
  "eramon-iface",
  "eramon-l2",
  "audit",
]);

const AUDIT_CHECKS = new Set<NetworkAuditCheckRoute>([
  "overview",
  "ports",
  "hosts",
  "mac",
  "discovery",
]);

const AUDIT_SCOPES = new Set<NetworkAuditScope>([
  "attention",
  "passed",
  "all",
]);

export function parseNetworkTab(params: URLSearchParams, fallback: NetworkTab): NetworkTab {
  const value = params.get("tab") as NetworkTab | null;
  return value && NETWORK_TABS.has(value) ? value : fallback;
}

export function parseNetworkAuditLocation(params: URLSearchParams): {
  check: NetworkAuditCheckRoute;
  scope: NetworkAuditScope;
} {
  const checkValue = params.get("check") as NetworkAuditCheckRoute | null;
  const scopeValue = params.get("scope") as NetworkAuditScope | null;
  return {
    check: checkValue && AUDIT_CHECKS.has(checkValue) ? checkValue : "overview",
    scope: scopeValue && AUDIT_SCOPES.has(scopeValue) ? scopeValue : "attention",
  };
}

export function updateNetworkAuditSearch(
  current: URLSearchParams,
  patch: Partial<{
    tab: NetworkTab;
    check: NetworkAuditCheckRoute;
    scope: NetworkAuditScope;
  }>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (patch.tab) next.set("tab", patch.tab);
  if (patch.check) next.set("check", patch.check);
  if (patch.scope) next.set("scope", patch.scope);
  return next;
}
```

- [ ] **Step 4: Tests grün ausführen**

Run:

```bash
npm run test -- src/test/networkAuditNavigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkAuditNavigation.ts src/test/networkAuditNavigation.test.ts
git commit -m "feat: add network audit URL state"
```

---

### Task 3: Quellenmetadaten und Retry im Hook

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts:1-5`
- Modify: `src/hooks/useActiveSnapshots.ts:291-323`
- Modify: `src/pages/NetworkSearchPanels.test.tsx`

- [ ] **Step 1: Hook-Mock im Panel-Test um den neuen Vertrag erweitern**

Den bestehenden inline definierten `useNetworkAudit`-Rückgabewert vollständig
durch diesen Vertrag ersetzen:

```ts
useNetworkAudit: () => ({
  rows: [{
    switchInterfaceKey: "core-01::eth1/1",
    switchHostname: "core-01",
    interface: "Eth1/1",
    description: "Uplink",
    status: "aktiv",
    matchStatus: "confirmed-cdp",
    matchedHost: "esx01",
    matchedSource: "cdp",
    labelConflict: false,
    labelConflictHost: null,
    statusConflict: false,
    bandwidthBps: null,
    finding: null,
  }] as PortAuditRow[],
  hostQuality: { rvtoolsRows: [], techInfoRows: [] },
  cdpMacRows: [{
    host: "esx01",
    adapter: "vmnic0",
    mac: "00:50:56:ab:cd:ef",
    macCanonical: "005056abcdef",
    inL2: false,
    l2Switch: null,
    l2Interface: null,
    vlan: null,
    learnedIp: null,
    dnsName: null,
    topologyMismatch: false,
    finding: "MAC nicht in L2-Tabelle",
  }] as CdpMacRow[],
  l2DiscoveryRows: [{
    l2EntryKey: "core-01::eth1/1::aabbccddeeff::100",
    switchName: "core-01",
    interface: "Eth1/1",
    vlan: "100",
    mac: "aabb.ccdd.eeff",
    learnedIp: "10.0.0.20",
    dnsName: null,
    classification: "unknown",
    esxiHost: null,
  }] as L2DiscoveryRow[],
  sources: {
    rvtools: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
    cdp: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
    eramonIface: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
    eramonL2: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
    ipam: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
    techInfo: { count: 1, importedAt: "2026-07-23T10:00:00.000Z" },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
}),
```

Dabei die bisher inline definierten Arrays im Test vor dem `vi.mock` als
`auditRows`, `cdpMacRows` und `l2DiscoveryRows` benennen.

- [ ] **Step 2: Bestehenden Test ausführen**

Run:

```bash
npm run test -- src/pages/NetworkSearchPanels.test.tsx
```

Expected: PASS; der Schritt friert den neuen Mock-Vertrag ein, bevor der Hook
ersetzt wird.

- [ ] **Step 3: Import und Hilfsfunktion ergänzen**

Den View-Model-Typ importieren:

```ts
import type { NetworkAuditSourceFacts } from "@/lib/networkAuditViewModel";
```

Vor `useNetworkAudit` einfügen:

```ts
function newestImportedAt<T extends { importedAt: string }>(rows: T[]): string | null {
  return rows.reduce<string | null>(
    (latest, row) => latest === null || row.importedAt > latest ? row.importedAt : latest,
    null,
  );
}
```

- [ ] **Step 4: `useNetworkAudit` vollständig ersetzen**

```ts
export function useNetworkAudit() {
  const { snapshots, activeSnapshotIds } = useActiveSnapshotIds();
  const eramonIfaceQuery = useAllEramonIfaceLatest();
  const l2Query = useAllEramonL2Latest();
  const cdpQuery = useAllCdpLatest();
  const hostsQuery = useHosts();
  const techInfoQuery = useAllTechInfoLatest();
  const ipamQuery = useAllIpamLatest();

  const eramonIfaceRows = eramonIfaceQuery.data ?? [];
  const l2Rows = l2Query.data ?? [];
  const cdpRows = cdpQuery.data ?? [];
  const hosts = hostsQuery.data ?? [];
  const techInfo = techInfoQuery.data ?? [];
  const ipam = ipamQuery.data ?? [];

  const rows = useMemo(
    () => buildPortAuditRows({ eramonIfaceRows, cdpRows, hosts, techInfo, ipam }),
    [eramonIfaceRows, cdpRows, hosts, techInfo, ipam],
  );
  const hostQuality = useMemo(
    () => buildHostDataQualityRows({ hosts, techInfo, ipam }),
    [hosts, techInfo, ipam],
  );
  const cdpMacRows = useMemo(
    () => buildCdpMacRows({ cdpRows, l2Rows }),
    [cdpRows, l2Rows],
  );
  const l2DiscoveryRows = useMemo(
    () => buildL2DiscoveryRows({ l2Rows, cdpRows, ipam }),
    [l2Rows, cdpRows, ipam],
  );

  const activeSnapshotSet = useMemo(
    () => new Set(activeSnapshotIds),
    [activeSnapshotIds],
  );
  const activeSnapshots = useMemo(
    () => snapshots.filter((snapshot) => activeSnapshotSet.has(snapshot.snapshotId)),
    [activeSnapshotSet, snapshots],
  );

  const sources = useMemo<NetworkAuditSourceFacts>(() => ({
    rvtools: {
      count: hosts.length,
      importedAt: newestImportedAt(activeSnapshots),
    },
    cdp: {
      count: cdpRows.length,
      importedAt: newestImportedAt(cdpRows),
    },
    eramonIface: {
      count: eramonIfaceRows.length,
      importedAt: newestImportedAt(eramonIfaceRows),
    },
    eramonL2: {
      count: l2Rows.length,
      importedAt: newestImportedAt(l2Rows),
    },
    ipam: {
      count: ipam.length,
      importedAt: newestImportedAt(ipam),
    },
    techInfo: {
      count: techInfo.length,
      importedAt: newestImportedAt(techInfo),
    },
  }), [activeSnapshots, cdpRows, eramonIfaceRows, hosts.length, ipam, l2Rows, techInfo]);

  const queries = [
    eramonIfaceQuery,
    l2Query,
    cdpQuery,
    hostsQuery,
    techInfoQuery,
    ipamQuery,
  ];

  const refetch = async () => {
    await Promise.all(queries.map((query) => query.refetch()));
  };

  return {
    rows,
    hostQuality,
    cdpMacRows,
    l2DiscoveryRows,
    sources,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch,
  };
}
```

- [ ] **Step 5: Typprüfung und betroffenen Test ausführen**

Run:

```bash
npm run typecheck
npm run test -- src/pages/NetworkSearchPanels.test.tsx
```

Expected: beide Befehle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useActiveSnapshots.ts src/pages/NetworkSearchPanels.test.tsx
git commit -m "feat: expose network audit source status"
```

---

### Task 4: Aussagekräftiger leerer Tabellenzustand

**Files:**
- Modify: `src/components/tables/VirtualTable.tsx`
- Modify: `src/components/tables/VirtualTable.test.tsx`

- [ ] **Step 1: Failing Test für weggefilterte Ergebnisse schreiben**

```ts
it("erklärt einen leeren gefilterten Datenbestand", () => {
  render(
    <VirtualTable
      data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: null }]}
      columns={columns}
      globalFilter="nicht-vorhanden"
      emptyTitle="Keine passenden Einträge"
      emptyDescription="Entfernen Sie den Suchbegriff."
    />,
  );

  expect(screen.getByText("Keine passenden Einträge")).toBeInTheDocument();
  expect(screen.getByText("Entfernen Sie den Suchbegriff.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Rot bestätigen**

Run:

```bash
npm run test -- src/components/tables/VirtualTable.test.tsx
```

Expected: FAIL, weil `emptyTitle` und `emptyDescription` noch keine Props sind.

- [ ] **Step 3: Props und Tabellenzeile implementieren**

Im Props-Interface ergänzen:

```ts
emptyTitle?: string;
emptyDescription?: string;
```

Beim Destructuring ergänzen:

```ts
emptyTitle = "Keine Einträge",
emptyDescription,
```

Direkt am Anfang von `<tbody>` ergänzen:

```tsx
{rows.length === 0 && (
  <tr>
    <td colSpan={columns.length} className="px-4 py-10 text-center">
      <p className="text-sm font-semibold">{emptyTitle}</p>
      {emptyDescription && (
        <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
      )}
    </td>
  </tr>
)}
```

Die Höhenberechnung so ändern, dass der Zustand sichtbar bleibt:

```ts
const emptyStateHeight = rows.length === 0 ? 112 : 0;
const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + emptyStateHeight + (hasFooter ? ROW_HEIGHT : 0);
```

- [ ] **Step 4: Tests grün ausführen**

Run:

```bash
npm run test -- src/components/tables/VirtualTable.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tables/VirtualTable.tsx src/components/tables/VirtualTable.test.tsx
git commit -m "feat: explain empty virtual tables"
```

---

### Task 5: Gemeinsame UI-Bausteine und Übersicht

**Files:**
- Create: `src/components/network/AuditSourceStatus.tsx`
- Create: `src/components/network/AuditCheckCard.tsx`
- Create: `src/components/network/AuditDetailView.tsx`
- Create: `src/components/network/NetworkAuditOverview.tsx`
- Create: `src/components/network/NetworkAuditUi.test.tsx`
- Modify: `src/lib/glossaries/networking.ts`

- [ ] **Step 1: Failing UI-Tests schreiben**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditOverview } from "@/components/network/NetworkAuditOverview";
import { AuditDetailView } from "@/components/network/AuditDetailView";
import type { NetworkAuditViewModel } from "@/lib/networkAuditViewModel";

const sourceFact = { count: 1, importedAt: "2026-07-23T10:00:00.000Z" };

const model: NetworkAuditViewModel = {
  sources: {
    rvtools: sourceFact,
    cdp: sourceFact,
    eramonIface: sourceFact,
    eramonL2: sourceFact,
    ipam: { count: 0, importedAt: null },
    techInfo: sourceFact,
  },
  totals: { critical: 2, review: 3, passed: 20 },
  nextCheck: "ports",
  hasExecutableChecks: true,
  checks: {
    ports: {
      id: "ports",
      readiness: "limited",
      status: "critical",
      counts: { critical: 2, review: 0, passed: 10 },
      missingRequired: [],
      missingOptional: ["ipam"],
    },
    hosts: {
      id: "hosts",
      readiness: "limited",
      status: "review",
      counts: { critical: 0, review: 3, passed: 5 },
      missingRequired: [],
      missingOptional: ["ipam"],
    },
    mac: {
      id: "mac",
      readiness: "ready",
      status: "passed",
      counts: { critical: 0, review: 0, passed: 3 },
      missingRequired: [],
      missingOptional: [],
    },
    discovery: {
      id: "discovery",
      readiness: "limited",
      status: "passed",
      counts: { critical: 0, review: 0, passed: 2 },
      missingRequired: [],
      missingOptional: ["ipam"],
    },
  },
};

describe("NetworkAudit UI", () => {
  it("zeigt Quellen, Zusammenfassung und vier Prüfkarten", () => {
    render(
      <MemoryRouter>
        <NetworkAuditOverview viewModel={model} onOpenCheck={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Switch-Port-Zuordnungen/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Host-Datenqualität/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ESXi-MAC-Abgleich/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Unbekannte Geräte/ })).toBeInTheDocument();
  });

  it("öffnet über die Primäraktion den höchstpriorisierten Bereich", () => {
    const onOpenCheck = vi.fn();
    render(
      <MemoryRouter>
        <NetworkAuditOverview viewModel={model} onOpenCheck={onOpenCheck} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nächsten Befund prüfen" }));
    expect(onOpenCheck).toHaveBeenCalledWith("ports", "attention");
  });

  it("verwechselt fehlende Daten nicht mit einer bestandenen Prüfung", () => {
    render(
      <MemoryRouter>
        <NetworkAuditOverview
          viewModel={{
            ...model,
            hasExecutableChecks: false,
            nextCheck: null,
            totals: { critical: 0, review: 0, passed: 0 },
          }}
          onOpenCheck={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Noch keine Netzwerkprüfung ausführbar. Importieren Sie die benötigten Datenquellen.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nächsten Befund prüfen" })).not.toBeInTheDocument();
  });

  it("meldet Filteränderungen zugänglich", () => {
    const onScopeChange = vi.fn();
    render(
      <MemoryRouter>
        <AuditDetailView
          title="Switch-Port-Zuordnungen"
          description="Prüft Portbeschriftungen."
          summary={model.checks.ports}
          scope="attention"
          visibleCount={2}
          totalCount={12}
          search=""
          onBack={vi.fn()}
          onScopeChange={onScopeChange}
        >
          <div>Tabelle</div>
        </AuditDetailView>
      </MemoryRouter>,
    );

    expect(screen.getByText("2 von 12 Einträgen")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("radio", { name: "Alle" }));
    expect(onScopeChange).toHaveBeenCalledWith("all");
  });
});
```

- [ ] **Step 2: Rot bestätigen**

Run:

```bash
npm run test -- src/components/network/NetworkAuditUi.test.tsx
```

Expected: FAIL wegen fehlender Komponenten.

- [ ] **Step 3: Glossar für die drei Übersichtswerte ergänzen**

In `NET_AUDIT_KPI` ergänzen:

```ts
critical: {
  term: "Kritische Befunde",
  description: "Widersprüche zwischen Quellen, Statusangaben oder erwarteter und beobachteter Topologie.",
  source: "Berechnet aus Netzwerk-Kontrolle",
},
review: {
  term: "Zu prüfen",
  description: "Unbekannte Zuordnungen, Datenlücken und fehlende Beobachtungen ohne direkten Quellenwiderspruch.",
  source: "Berechnet aus Netzwerk-Kontrolle",
},
passed: {
  term: "Bestanden",
  description: "Prüfungen mit bestätigter Zuordnung und ohne erkannten Konflikt.",
  source: "Berechnet aus Netzwerk-Kontrolle",
},
```

- [ ] **Step 4: `AuditSourceStatus` implementieren**

```tsx
import { Link } from "react-router-dom";
import { Database, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NetworkAuditSourceFacts, NetworkAuditSourceKey } from "@/lib/networkAuditViewModel";

export const SOURCE_LABELS: Record<NetworkAuditSourceKey, string> = {
  rvtools: "RVTools",
  cdp: "CDP",
  eramonIface: "Eramon Interface",
  eramonL2: "Eramon L2",
  ipam: "IPAM",
  techInfo: "Tech-Info",
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditSourceStatus({ sources }: { sources: NetworkAuditSourceFacts }) {
  return (
    <section className="rounded-xl border bg-card/60 p-4 sm:p-5" aria-labelledby="audit-sources-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="audit-sources-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" aria-hidden="true" />
            Datenbasis
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Umfang und Aktualität der verwendeten Importquellen.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/upload"><Upload className="mr-2 h-4 w-4" aria-hidden="true" />Importe verwalten</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(SOURCE_LABELS) as NetworkAuditSourceKey[]).map((key) => {
          const source = sources[key];
          const ready = source.count > 0;
          return (
            <div key={key} className="min-w-0 rounded-lg border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold">{SOURCE_LABELS[key]}</span>
                <Badge variant={ready ? "secondary" : "outline"}>{ready ? "Bereit" : "Fehlt"}</Badge>
              </div>
              <p className="mt-2 font-mono-data text-lg font-bold tabular-nums">{source.count.toLocaleString("de-DE")}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {source.importedAt ? dateFormatter.format(new Date(source.importedAt)) : "Noch nicht importiert"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `AuditCheckCard` implementieren**

```tsx
import { AlertTriangle, CheckCircle2, CircleHelp, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { NetworkAuditCheckSummary, NetworkAuditScope } from "@/lib/networkAuditViewModel";

const STATUS = {
  critical: { label: "Kritisch", icon: AlertTriangle, edge: "border-l-destructive" },
  review: { label: "Prüfen", icon: CircleHelp, edge: "border-l-warning" },
  passed: { label: "Bestanden", icon: CheckCircle2, edge: "border-l-success" },
  unavailable: { label: "Nicht ausführbar", icon: LockKeyhole, edge: "border-l-muted-foreground" },
} as const;

interface Props {
  index: number;
  title: string;
  question: string;
  actionLabel: string;
  summary: NetworkAuditCheckSummary;
  onOpen: (scope: NetworkAuditScope) => void;
}

export function AuditCheckCard({ index, title, question, actionLabel, summary, onOpen }: Props) {
  const config = STATUS[summary.status];
  const Icon = config.icon;
  return (
    <Card className={`relative z-10 h-full border-l-4 bg-card ${config.edge}`}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono-data text-xs font-bold tracking-widest text-primary">
            {String(index).padStart(2, "0")}
          </span>
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {config.label}
          </Badge>
        </div>
        <h3 className="mt-5 text-base font-semibold">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{question}</p>
        <p className="mt-4 font-mono-data text-2xl font-bold tabular-nums">
          {(summary.counts.critical + summary.counts.review).toLocaleString("de-DE")}
        </p>
        <Button
          type="button"
          variant={summary.status === "critical" ? "default" : "outline"}
          className="mt-4 w-full"
          onClick={() => onOpen(summary.status === "passed" ? "all" : "attention")}
          disabled={summary.status === "unavailable"}
        >
          {summary.status === "unavailable" ? "Benötigte Daten fehlen" : actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: `AuditDetailView` implementieren**

```tsx
import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SOURCE_LABELS } from "@/components/network/AuditSourceStatus";
import type { NetworkAuditCheckSummary, NetworkAuditScope } from "@/lib/networkAuditViewModel";

interface Props {
  title: string;
  description: string;
  summary: NetworkAuditCheckSummary;
  scope: NetworkAuditScope;
  visibleCount: number;
  totalCount: number;
  search: string;
  onBack: () => void;
  onScopeChange: (scope: NetworkAuditScope) => void;
  children: ReactNode;
}

export function AuditDetailView(props: Props) {
  const { summary } = props;
  return (
    <section className="space-y-4" aria-labelledby="audit-detail-heading">
      <Button type="button" variant="ghost" size="sm" onClick={props.onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Zur Übersicht
      </Button>
      <div>
        <h2 id="audit-detail-heading" className="text-xl font-bold tracking-tight [text-wrap:balance]">{props.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground [text-wrap:pretty]">{props.description}</p>
      </div>
      {summary.readiness === "limited" && (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            Eingeschränkte Prüfung – {summary.missingOptional.map((key) => SOURCE_LABELS[key]).join(", ")} {summary.missingOptional.length === 1 ? "fehlt" : "fehlen"}
          </AlertTitle>
          <AlertDescription>
            Ergänzende Datenquellen fehlen. Die vorhandenen Ergebnisse bleiben nutzbar.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-3">
        <ToggleGroup
          type="single"
          value={props.scope}
          onValueChange={(value) => {
            if (value === "attention" || value === "passed" || value === "all") props.onScopeChange(value);
          }}
          aria-label="Ergebnisfilter"
        >
          <ToggleGroupItem value="attention" aria-label="Handlungsbedarf">Handlungsbedarf</ToggleGroupItem>
          <ToggleGroupItem value="passed" aria-label="Bestanden">Bestanden</ToggleGroupItem>
          <ToggleGroupItem value="all" aria-label="Alle">Alle</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {props.visibleCount.toLocaleString("de-DE")} von {props.totalCount.toLocaleString("de-DE")} Einträgen
        </span>
      </div>
      {props.search && (
        <p className="text-xs text-muted-foreground">
          Ergebnisse zusätzlich gefiltert nach „{props.search}“.
        </p>
      )}
      {props.children}
    </section>
  );
}
```

- [ ] **Step 7: `NetworkAuditOverview` implementieren**

```tsx
import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AuditCheckCard } from "@/components/network/AuditCheckCard";
import { AuditSourceStatus } from "@/components/network/AuditSourceStatus";
import { NET_AUDIT_KPI } from "@/lib/glossaries/networking";
import type { NetworkAuditCheckId, NetworkAuditScope, NetworkAuditViewModel } from "@/lib/networkAuditViewModel";

const CARD_COPY: Record<NetworkAuditCheckId, {
  title: string;
  question: string;
  action: (count: number) => string;
}> = {
  ports: {
    title: "Switch-Port-Zuordnungen",
    question: "Stimmen Portbeschriftung, Link-Status und CDP-Nachbar überein?",
    action: (count) => count > 0 ? `${count} Port-Befunde prüfen` : "Alle Port-Prüfungen anzeigen",
  },
  hosts: {
    title: "Host-Datenqualität",
    question: "Sind alle ESXi-Hosts in Tech-Info und IPAM dokumentiert?",
    action: (count) => count > 0 ? `${count} Datenlücken prüfen` : "Alle Host-Prüfungen anzeigen",
  },
  mac: {
    title: "ESXi-MAC-Abgleich",
    question: "Werden die Host-Adapter am erwarteten Switch-Port gesehen?",
    action: (count) => count > 0 ? `${count} MAC-Befunde prüfen` : "Alle MAC-Prüfungen anzeigen",
  },
  discovery: {
    title: "Unbekannte Geräte",
    question: "Welche Geräte lassen sich weder CDP noch IPAM zuordnen?",
    action: (count) => count > 0 ? `${count} unbekannte Geräte prüfen` : "Netz-Discovery anzeigen",
  },
};

interface Props {
  viewModel: NetworkAuditViewModel;
  onOpenCheck: (check: NetworkAuditCheckId, scope: NetworkAuditScope) => void;
}

export function NetworkAuditOverview({ viewModel, onOpenCheck }: Props) {
  const order: NetworkAuditCheckId[] = ["ports", "hosts", "mac", "discovery"];
  return (
    <div className="space-y-6">
      <AuditSourceStatus sources={viewModel.sources} />
      <section aria-labelledby="audit-summary-heading">
        <h2 id="audit-summary-heading" className="sr-only">Zusammenfassung</h2>
        <KpiGrid>
          <KpiCard title="Kritisch" value={viewModel.totals.critical} severity={viewModel.totals.critical > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={NET_AUDIT_KPI.critical} />
          <KpiCard title="Prüfen" value={viewModel.totals.review} severity={viewModel.totals.review > 0 ? "warn" : "ok"} icon={<ListChecks className="h-4 w-4" />} info={NET_AUDIT_KPI.review} />
          <KpiCard title="Bestanden" value={viewModel.totals.passed} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} info={NET_AUDIT_KPI.passed} />
        </KpiGrid>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 p-4">
          <p className="text-sm text-muted-foreground">
            {!viewModel.hasExecutableChecks
              ? "Noch keine Netzwerkprüfung ausführbar. Importieren Sie die benötigten Datenquellen."
              : viewModel.nextCheck
              ? `${viewModel.totals.critical} kritische und ${viewModel.totals.review} weitere Befunde sind offen.`
              : "Keine offenen Netzwerkbefunde."}
          </p>
          {viewModel.nextCheck && (
            <Button type="button" onClick={() => onOpenCheck(viewModel.nextCheck as NetworkAuditCheckId, "attention")}>
              Nächsten Befund prüfen
            </Button>
          )}
        </div>
      </section>
      <section aria-labelledby="audit-path-heading">
        <h2 id="audit-path-heading" className="text-sm font-semibold text-muted-foreground">Empfohlener Prüfpfad</h2>
        <div className="relative mt-3">
          <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-border xl:block" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {order.map((id, index) => {
              const summary = viewModel.checks[id];
              const openCount = summary.counts.critical + summary.counts.review;
              return (
                <AuditCheckCard
                  key={id}
                  index={index + 1}
                  title={CARD_COPY[id].title}
                  question={CARD_COPY[id].question}
                  actionLabel={CARD_COPY[id].action(openCount)}
                  summary={summary}
                  onOpen={(scope) => onOpenCheck(id, scope)}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 8: UI-Tests grün ausführen**

Run:

```bash
npm run test -- src/components/network/NetworkAuditUi.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/network/AuditSourceStatus.tsx src/components/network/AuditCheckCard.tsx src/components/network/AuditDetailView.tsx src/components/network/NetworkAuditOverview.tsx src/components/network/NetworkAuditUi.test.tsx src/lib/glossaries/networking.ts
git commit -m "feat: add guided network audit overview"
```

---

### Task 6: Vorhandene Tabellen in vier Detailpanels aufteilen

**Files:**
- Move: `src/pages/NetworkAuditPanel.tsx` → `src/components/network/NetworkAuditDetails.tsx`
- Modify: `src/components/network/NetworkAuditDetails.tsx`
- Modify: `src/pages/NetworkSearchPanels.test.tsx`

- [ ] **Step 1: Aktuelles Panel verschieben**

```bash
git mv src/pages/NetworkAuditPanel.tsx src/components/network/NetworkAuditDetails.tsx
```

Die Helfer und Spaltendefinitionen aus den bisherigen Zeilen 19–155 bleiben
inhaltlich unverändert. Nur Imports werden auf die neuen Detailkomponenten
angepasst.

- [ ] **Step 2: Gemeinsame Filterfunktionen unter den Spaltendefinitionen ergänzen**

```ts
import { useMemo, useState } from "react";
import { Database, Radar, Server } from "lucide-react";
import { AuditDetailView } from "@/components/network/AuditDetailView";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  NetworkAuditCheckSummary,
  NetworkAuditScope,
} from "@/lib/networkAuditViewModel";

function filterPortRows(rows: PortAuditRow[], scope: NetworkAuditScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => {
    const attention = row.labelConflict
      || row.statusConflict
      || row.matchStatus === "unknown"
      || row.matchStatus === "documented-only"
      || row.matchStatus === "text-match";
    return scope === "attention" ? attention : !attention;
  });
}

function filterHostRows<T extends { finding: string | null }>(rows: T[], scope: NetworkAuditScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => scope === "attention" ? row.finding !== null : row.finding === null);
}

function filterMacRows(rows: CdpMacRow[], scope: NetworkAuditScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => {
    const attention = !row.inL2 || row.topologyMismatch;
    return scope === "attention" ? attention : !attention;
  });
}

function filterDiscoveryRows(rows: L2DiscoveryRow[], scope: NetworkAuditScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => {
    const attention = row.classification === "unknown";
    return scope === "attention" ? attention : !attention;
  });
}

interface SharedDetailProps {
  summary: NetworkAuditCheckSummary;
  scope: NetworkAuditScope;
  search: string;
  onBack: () => void;
  onScopeChange: (scope: NetworkAuditScope) => void;
}
```

- [ ] **Step 3: Hilfszustand für fehlende Pflichtquellen ergänzen**

```tsx
function UnavailableAudit({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon={<Database className="h-6 w-6" />}
      title={title}
      description={description}
      actionLabel="Fehlende Daten importieren"
      actionTo="/upload"
    />
  );
}
```

- [ ] **Step 4: Vier Detailkomponenten statt des bisherigen `NetworkAuditPanel` exportieren**

Den bisherigen Funktionsblock ab `export function NetworkAuditPanel()` löschen
und durch diesen Code ersetzen:

```tsx
export function PortAuditDetail(props: SharedDetailProps & { rows: PortAuditRow[] }) {
  const displayRows = useMemo(() => filterPortRows(props.rows, props.scope), [props.rows, props.scope]);
  if (props.summary.readiness === "unavailable") {
    return <UnavailableAudit title="Switch-Port-Prüfung noch nicht möglich" description="Importieren Sie Eramon-Interface-Daten." />;
  }
  return (
    <AuditDetailView
      title="Switch-Port-Zuordnungen"
      description="Prüft Portbeschriftung, Link-Status und CDP-Nachbar auf Widersprüche."
      summary={props.summary}
      scope={props.scope}
      visibleCount={displayRows.length}
      totalCount={props.rows.length}
      search={props.search}
      onBack={props.onBack}
      onScopeChange={props.onScopeChange}
    >
      <VirtualTable
        data={displayRows}
        columns={columns}
        globalFilter={props.search}
        height={500}
        exportFileName="network-audit"
        emptyTitle={props.search ? "Keine passenden Einträge" : "Keine Einträge in diesem Ergebnisfilter"}
        emptyDescription={props.search ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter." : "Wählen Sie einen anderen Ergebnisfilter."}
      />
    </AuditDetailView>
  );
}

export function HostDataAuditDetail(
  props: SharedDetailProps & {
    rvtoolsRows: RvtoolsHostQualityRow[];
    techInfoRows: TechInfoHostQualityRow[];
  },
) {
  const [perspective, setPerspective] = useState<"rvtools" | "techinfo">("rvtools");
  const rvtoolsRows = useMemo(() => filterHostRows(props.rvtoolsRows, props.scope), [props.rvtoolsRows, props.scope]);
  const techInfoRows = useMemo(() => filterHostRows(props.techInfoRows, props.scope), [props.techInfoRows, props.scope]);
  const totalCount = perspective === "rvtools" ? props.rvtoolsRows.length : props.techInfoRows.length;
  const visibleCount = perspective === "rvtools" ? rvtoolsRows.length : techInfoRows.length;

  if (props.summary.readiness === "unavailable") {
    return <UnavailableAudit title="Host-Datenabgleich noch nicht möglich" description="Importieren Sie einen RVTools-Snapshot." />;
  }

  return (
    <AuditDetailView
      title="Host-Datenqualität"
      description="Gleicht ESXi-Namen aus RVTools und Tech-Info mit IPAM ab."
      summary={props.summary}
      scope={props.scope}
      visibleCount={visibleCount}
      totalCount={totalCount}
      search={props.search}
      onBack={props.onBack}
      onScopeChange={props.onScopeChange}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={perspective}
          onValueChange={(value) => {
            if (value === "rvtools" || value === "techinfo") setPerspective(value);
          }}
          aria-label="Ausgangspunkt des Host-Abgleichs"
        >
          <ToggleGroupItem value="rvtools" aria-label="Aus RVTools">Aus RVTools</ToggleGroupItem>
          <ToggleGroupItem value="techinfo" aria-label="Aus Tech-Info">Aus Tech-Info</ToggleGroupItem>
        </ToggleGroup>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-4 w-4 text-primary" aria-hidden="true" />
          {perspective === "rvtools" ? "Startpunkt: vCenter-Inventar" : "Startpunkt: technische Dokumentation"}
        </span>
      </div>
      {perspective === "rvtools" ? (
        <VirtualTable
          data={rvtoolsRows}
          columns={rvtoolsHostColumns}
          globalFilter={props.search}
          height={420}
          exportFileName="host-data-quality-rvtools"
          emptyTitle={props.scope === "attention" ? "Keine offenen Datenlücken" : "Keine passenden Einträge"}
          emptyDescription={props.scope === "attention" ? "In dieser Perspektive wurden keine Datenlücken erkannt." : "Ändern Sie Filter oder Suchbegriff."}
        />
      ) : (
        <VirtualTable
          data={techInfoRows}
          columns={techInfoHostColumns}
          globalFilter={props.search}
          height={420}
          exportFileName="host-data-quality-techinfo"
          emptyTitle={props.scope === "attention" ? "Keine offenen Datenlücken" : "Keine passenden Einträge"}
          emptyDescription={props.scope === "attention" ? "In dieser Perspektive wurden keine Datenlücken erkannt." : "Ändern Sie Filter oder Suchbegriff."}
        />
      )}
    </AuditDetailView>
  );
}

export function MacAuditDetail(props: SharedDetailProps & { rows: CdpMacRow[] }) {
  const displayRows = useMemo(() => filterMacRows(props.rows, props.scope), [props.rows, props.scope]);
  if (props.summary.readiness === "unavailable") {
    return <UnavailableAudit title="MAC-Abgleich noch nicht möglich" description="Importieren Sie CDP- und Eramon-L2-Daten." />;
  }
  return (
    <AuditDetailView
      title="ESXi-MAC-Abgleich"
      description="Vergleicht die MAC-Adressen der ESXi-Adapter mit ihrer beobachteten L2-Position."
      summary={props.summary}
      scope={props.scope}
      visibleCount={displayRows.length}
      totalCount={props.rows.length}
      search={props.search}
      onBack={props.onBack}
      onScopeChange={props.onScopeChange}
    >
      <VirtualTable
        data={displayRows}
        columns={cdpMacColumns}
        globalFilter={props.search}
        height={420}
        exportFileName="mac-audit-cdp"
        emptyTitle={props.scope === "attention" ? "Keine offenen MAC-Befunde" : "Keine passenden Einträge"}
        emptyDescription={props.scope === "attention" ? "Alle auswertbaren ESXi-Adapter wurden ohne Abweichung gefunden." : "Ändern Sie Filter oder Suchbegriff."}
      />
    </AuditDetailView>
  );
}

export function NetworkDiscoveryDetail(props: SharedDetailProps & { rows: L2DiscoveryRow[] }) {
  const displayRows = useMemo(() => filterDiscoveryRows(props.rows, props.scope), [props.rows, props.scope]);
  if (props.summary.readiness === "unavailable") {
    return <UnavailableAudit title="Netz-Discovery noch nicht möglich" description="Importieren Sie Eramon-L2-Daten." />;
  }
  return (
    <AuditDetailView
      title="Unbekannte Geräte"
      description="Klassifiziert gelernte L2-MACs über CDP und IPAM."
      summary={props.summary}
      scope={props.scope}
      visibleCount={displayRows.length}
      totalCount={props.rows.length}
      search={props.search}
      onBack={props.onBack}
      onScopeChange={props.onScopeChange}
    >
      <VirtualTable
        data={displayRows}
        columns={l2DiscoveryColumns}
        globalFilter={props.search}
        height={420}
        exportFileName="mac-discovery"
        emptyTitle={props.scope === "attention" ? "Keine unbekannten Geräte" : "Keine passenden Einträge"}
        emptyDescription={props.scope === "attention" ? "Alle auswertbaren L2-MACs konnten klassifiziert werden." : "Ändern Sie Filter oder Suchbegriff."}
      />
    </AuditDetailView>
  );
}
```

- [ ] **Step 5: Veraltete Imports aus der verschobenen Datei entfernen**

Die Importsektion auf diese tatsächlich benötigten Abhängigkeiten reduzieren:

```ts
import { useMemo, useState } from "react";
import { Database, Server } from "lucide-react";
import { AuditDetailView } from "@/components/network/AuditDetailView";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBandwidth } from "@/lib/eramon";
import { shortHostname } from "@/lib/networkAudit";
import {
  NET_AUDIT_COLUMNS,
  NET_HOST_QUALITY_RVTOOLS_COLUMNS,
  NET_HOST_QUALITY_TECHINFO_COLUMNS,
  NET_MAC_CDP_COLUMNS,
  NET_MAC_DISCOVERY_COLUMNS,
} from "@/lib/glossaries/networking";
import type {
  CdpMacRow,
  L2Classification,
  L2DiscoveryRow,
  PortAuditRow,
  PortMatchStatus,
} from "@/lib/networkAudit";
import type {
  RvtoolsHostQualityRow,
  TechInfoHostQualityRow,
} from "@/lib/hostDataQualityAudit";
import type {
  NetworkAuditCheckSummary,
  NetworkAuditScope,
} from "@/lib/networkAuditViewModel";
import type { ColumnDef } from "@tanstack/react-table";
```

Den nun ungenutzten Helfer `isNotable` entfernen. Alle Badge-, Zell- und
Spaltendefinitionen bleiben unverändert in dieser Datei.

- [ ] **Step 6: Testimport vorübergehend auf die neue Datei umstellen**

In `NetworkSearchPanels.test.tsx`:

```ts
import {
  MacAuditDetail,
  NetworkDiscoveryDetail,
} from "@/components/network/NetworkAuditDetails";
```

Den alten Test „zeigt den Eramon-L2-MAC-Abgleich mit beiden Tabellen“ durch zwei
Tests ersetzen. Zuerst das Summary-Fixture ergänzen:

```tsx
const cdpMacRows: CdpMacRow[] = [{
  host: "esx01",
  adapter: "vmnic0",
  mac: "00:50:56:ab:cd:ef",
  macCanonical: "005056abcdef",
  inL2: false,
  l2Switch: null,
  l2Interface: null,
  vlan: null,
  learnedIp: null,
  dnsName: null,
  topologyMismatch: false,
  finding: "MAC nicht in L2-Tabelle",
}];

const l2DiscoveryRows: L2DiscoveryRow[] = [{
  l2EntryKey: "core-01::eth1/1::aabbccddeeff::100",
  switchName: "core-01",
  interface: "Eth1/1",
  vlan: "100",
  mac: "aabb.ccdd.eeff",
  learnedIp: "10.0.0.20",
  dnsName: null,
  classification: "unknown",
  esxiHost: null,
}];

function readySummary(id: "mac" | "discovery"): NetworkAuditCheckSummary {
  return {
    id,
    readiness: "ready",
    status: "review",
    counts: { critical: 0, review: 1, passed: 0 },
    missingRequired: [],
    missingOptional: [],
  };
}

const sharedDetailProps = {
  scope: "all" as const,
  search,
  onBack: vi.fn(),
  onScopeChange: vi.fn(),
};

it("zeigt im MAC-Abgleich nur die MAC-Tabelle", () => {
  render(
    <MacAuditDetail
      {...sharedDetailProps}
      summary={readySummary("mac")}
      rows={cdpMacRows}
    />,
  );

  expect(screen.getByTestId("table-mac-audit-cdp")).toBeInTheDocument();
  expect(screen.queryByTestId("table-mac-discovery")).not.toBeInTheDocument();
});

it("zeigt in der Netz-Discovery nur die Discovery-Tabelle", () => {
  render(
    <NetworkDiscoveryDetail
      {...sharedDetailProps}
      summary={readySummary("discovery")}
      rows={l2DiscoveryRows}
    />,
  );

  expect(screen.getByTestId("table-mac-discovery")).toBeInTheDocument();
  expect(screen.queryByTestId("table-mac-audit-cdp")).not.toBeInTheDocument();
});
```

Zusätzlich importieren:

```ts
import type { NetworkAuditCheckSummary } from "@/lib/networkAuditViewModel";
```

- [ ] **Step 7: Betroffene Tests und Typprüfung ausführen**

Run:

```bash
npm run typecheck
npm run test -- src/pages/NetworkSearchPanels.test.tsx src/components/network/NetworkAuditUi.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/network/NetworkAuditDetails.tsx src/pages/NetworkSearchPanels.test.tsx
git commit -m "refactor: split network audit detail panels"
```

---

### Task 7: Neues `NetworkAuditPanel` als Orchestrator

**Files:**
- Create: `src/pages/NetworkAuditPanel.tsx`
- Modify: `src/pages/NetworkSearchPanels.test.tsx`

- [ ] **Step 1: Failing Orchestrator-Tests schreiben**

Die Tests mit `MemoryRouter initialEntries` rendern:

```tsx
function renderAudit(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <NetworkAuditPanel />
    </MemoryRouter>,
  );
}

it("öffnet standardmäßig die Übersicht", () => {
  renderAudit("/network-security?tab=audit");
  expect(screen.getByRole("heading", { name: "Netzwerk-Kontrolle" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
});

it("öffnet einen direkt verlinkten Prüfbereich", () => {
  renderAudit("/network-security?tab=audit&check=mac&scope=all");
  expect(screen.getByRole("heading", { name: "ESXi-MAC-Abgleich" })).toBeInTheDocument();
  expect(screen.getByTestId("table-mac-audit-cdp")).toBeInTheDocument();
  expect(screen.queryByTestId("table-network-audit")).not.toBeInTheDocument();
});

it("zeigt bei Query-Fehlern Retry statt eines leeren Datenbestands", () => {
  useNetworkAuditMock.mockReturnValue({
    ...auditHookResult,
    isLoading: false,
    isError: true,
    error: new Error("Lesefehler"),
  });
  renderAudit("/network-security?tab=audit");
  expect(screen.getByText("Netzwerkdaten konnten nicht geladen werden")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
});
```

Hierfür den statischen Hook-Mock in eine hoisted Mock-Funktion umstellen:

```ts
const { useNetworkAuditMock } = vi.hoisted(() => ({
  useNetworkAuditMock: vi.fn(),
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search } }),
  useNetworkAudit: useNetworkAuditMock,
}));
```

Nach den Zeilen-Fixtures ergänzen:

```ts
const sourceFact = { count: 1, importedAt: "2026-07-23T10:00:00.000Z" };

const auditRows: PortAuditRow[] = [{
  switchInterfaceKey: "core-01::eth1/1",
  switchHostname: "core-01",
  interface: "Eth1/1",
  description: "Uplink",
  status: "aktiv",
  matchStatus: "confirmed-cdp",
  matchedHost: "esx01",
  matchedSource: "cdp",
  labelConflict: false,
  labelConflictHost: null,
  statusConflict: false,
  bandwidthBps: null,
  finding: null,
}];

const auditHookResult = {
  rows: auditRows,
  hostQuality: { rvtoolsRows: [], techInfoRows: [] },
  cdpMacRows,
  l2DiscoveryRows,
  sources: {
    rvtools: sourceFact,
    cdp: sourceFact,
    eramonIface: sourceFact,
    eramonL2: sourceFact,
    ipam: sourceFact,
    techInfo: sourceFact,
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

beforeEach(() => {
  useNetworkAuditMock.mockReturnValue(auditHookResult);
});
```

- [ ] **Step 2: Rot bestätigen**

Run:

```bash
npm run test -- src/pages/NetworkSearchPanels.test.tsx
```

Expected: FAIL, weil das neue `NetworkAuditPanel.tsx` noch fehlt.

- [ ] **Step 3: Orchestrator implementieren**

```tsx
import { useMemo } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useActiveSnapshotIds, useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { NetworkAuditOverview } from "@/components/network/NetworkAuditOverview";
import {
  HostDataAuditDetail,
  MacAuditDetail,
  NetworkDiscoveryDetail,
  PortAuditDetail,
} from "@/components/network/NetworkAuditDetails";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildNetworkAuditViewModel } from "@/lib/networkAuditViewModel";
import { parseNetworkAuditLocation, updateNetworkAuditSearch } from "@/lib/networkAuditNavigation";
import type { NetworkAuditCheckId, NetworkAuditCheckRoute, NetworkAuditScope } from "@/lib/networkAuditViewModel";

const SECTIONS: Array<{ value: NetworkAuditCheckRoute; label: string }> = [
  { value: "overview", label: "Übersicht" },
  { value: "ports", label: "Switch-Ports" },
  { value: "hosts", label: "Host-Daten" },
  { value: "mac", label: "MAC-Abgleich" },
  { value: "discovery", label: "Netz-Discovery" },
];

export function NetworkAuditPanel() {
  const audit = useNetworkAudit();
  const { filters } = useActiveSnapshotIds();
  const [searchParams, setSearchParams] = useSearchParams();
  const { check, scope } = parseNetworkAuditLocation(searchParams);

  const viewModel = useMemo(() => buildNetworkAuditViewModel({
    sources: audit.sources,
    portRows: audit.rows,
    hostQuality: audit.hostQuality,
    cdpMacRows: audit.cdpMacRows,
    l2DiscoveryRows: audit.l2DiscoveryRows,
  }), [audit.cdpMacRows, audit.hostQuality, audit.l2DiscoveryRows, audit.rows, audit.sources]);

  const navigate = (nextCheck: NetworkAuditCheckRoute, nextScope: NetworkAuditScope = scope) => {
    setSearchParams(updateNetworkAuditSearch(searchParams, {
      tab: "audit",
      check: nextCheck,
      scope: nextScope,
    }));
  };

  if (audit.isLoading) return <PanelLoadingState />;

  if (audit.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Netzwerkdaten konnten nicht geladen werden</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>Versuchen Sie es erneut. Ihre importierten Daten bleiben erhalten.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void audit.refetch()}>
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const shared = {
    scope,
    search: filters.search,
    onBack: () => navigate("overview", "attention"),
    onScopeChange: (nextScope: NetworkAuditScope) => navigate(check, nextScope),
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight [text-wrap:balance]">Netzwerk-Kontrolle</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground [text-wrap:pretty]">
              Prüfen Sie Datenqualität, physische Zuordnungen und unbekannte Geräte.
            </p>
          </div>
        </div>
        <Tabs value={check} onValueChange={(value) => navigate(value as NetworkAuditCheckRoute, "attention")} className="mt-4">
          <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
            {SECTIONS.map((section) => (
              <TabsTrigger key={section.value} value={section.value}>{section.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {check === "overview" && (
        <NetworkAuditOverview
          viewModel={viewModel}
          onOpenCheck={(id: NetworkAuditCheckId, nextScope: NetworkAuditScope) => navigate(id, nextScope)}
        />
      )}
      {check === "ports" && <PortAuditDetail {...shared} summary={viewModel.checks.ports} rows={audit.rows} />}
      {check === "hosts" && <HostDataAuditDetail {...shared} summary={viewModel.checks.hosts} rvtoolsRows={audit.hostQuality.rvtoolsRows} techInfoRows={audit.hostQuality.techInfoRows} />}
      {check === "mac" && <MacAuditDetail {...shared} summary={viewModel.checks.mac} rows={audit.cdpMacRows} />}
      {check === "discovery" && <NetworkDiscoveryDetail {...shared} summary={viewModel.checks.discovery} rows={audit.l2DiscoveryRows} />}
    </div>
  );
}
```

- [ ] **Step 4: Orchestrator-Tests grün ausführen**

Run:

```bash
npm run test -- src/pages/NetworkSearchPanels.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NetworkAuditPanel.tsx src/pages/NetworkSearchPanels.test.tsx
git commit -m "feat: orchestrate guided network audit"
```

---

### Task 8: Netzwerk-Tab deep-linkbar machen und RVTools-Sperre lokalisieren

**Files:**
- Modify: `src/pages/Networking.tsx`
- Modify: `src/pages/Networking.test.tsx`

- [ ] **Step 1: Failing Tests ergänzen**

`Providers` muss `initialEntries` akzeptieren:

```tsx
function Providers({
  children,
  initialEntries = ["/network-security"],
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <FilterProvider>{children}</FilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
```

`NetworkAuditPanel` mocken:

```ts
vi.mock("@/pages/NetworkAuditPanel", () => ({
  NetworkAuditPanel: () => <div data-testid="panel-audit" />,
}));
```

Tests:

```tsx
it("öffnet die Kontrolle über einen Deep Link", async () => {
  render(
    <Networking />,
    {
      wrapper: ({ children }) => (
        <Providers initialEntries={["/network-security?tab=audit&check=mac"]}>
          {children}
        </Providers>
      ),
    },
  );

  expect(await screen.findByTestId("panel-audit")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Kontrolle" })).toHaveAttribute("data-state", "active");
});

it("lässt die Kontrolle ohne RVTools-Snapshot erreichbar", async () => {
  render(
    <Networking />,
    {
      wrapper: ({ children }) => (
        <Providers initialEntries={["/network-security?tab=audit"]}>
          {children}
        </Providers>
      ),
    },
  );

  expect(await screen.findByTestId("panel-audit")).toBeInTheDocument();
  expect(screen.queryByText("Laden Sie RVTools-Daten hoch.")).not.toBeInTheDocument();
});

it("behält den RVTools-Hinweis in RVTools-abhängigen Tabs", async () => {
  render(<Networking />, { wrapper: Providers });
  expect(await screen.findByText("Laden Sie RVTools-Daten hoch.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Kontrolle" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rot bestätigen**

Run:

```bash
npm run test -- src/pages/Networking.test.tsx
```

Expected: Die neuen Deep-Link-Tests FAIL.

- [ ] **Step 3: URL-gesteuerten Tab-Zustand implementieren**

Imports:

```ts
import { useSearchParams } from "react-router-dom";
import {
  parseNetworkTab,
  updateNetworkAuditSearch,
  type NetworkTab,
} from "@/lib/networkAuditNavigation";
```

Den lokalen `NetworkTab`-Typ und `useState` entfernen. In der Komponente:

```ts
const { snapshots, snapshotsLoading } = useActiveSnapshotIds();
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = parseNetworkTab(searchParams, initialTab);
const hasRvtools = snapshots.length > 0;

const setActiveTab = (tab: NetworkTab) => {
  const next = updateNetworkAuditSearch(searchParams, { tab });
  if (tab === "audit" && !next.has("check")) next.set("check", "overview");
  setSearchParams(next);
};
```

`initialTab` verwendet den importierten Typ:

```ts
export default function Networking({ initialTab = "security" }: { initialTab?: NetworkTab }) {
```

- [ ] **Step 4: Globalen Empty-State entfernen und lokal rendern**

Den bisherigen frühen Block

```tsx
if (snapshots.length === 0) {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Netzwerk</h1>
      <EmptyState icon={<Network className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
    </div>
  );
}
```

entfernen.

In der Komponente definieren:

```tsx
const rvtoolsEmpty = (
  <EmptyState
    icon={<Network className="h-6 w-6" />}
    title="Keine RVTools-Daten"
    description="Laden Sie RVTools-Daten hoch."
    actionLabel="Zum Upload"
    actionTo="/upload"
  />
);
```

Jeden Nicht-Audit-`TabsContent` nach diesem Muster rendern:

```tsx
<TabsContent value="security" className="space-y-4">
  {hasRvtools ? <NetworkSecurityPanel /> : rvtoolsEmpty}
</TabsContent>
```

Dasselbe für `host`, `vlan`, `cdp`, `ipam`, `eramon-iface` und `eramon-l2`.
Der Audit-Inhalt bleibt unabhängig:

```tsx
<TabsContent value="audit" className="space-y-4">
  <NetworkAuditPanel />
</TabsContent>
```

`onValueChange` ersetzen:

```tsx
onValueChange={(value) => setActiveTab(value as NetworkTab)}
```

- [ ] **Step 5: Tests grün ausführen**

Run:

```bash
npm run test -- src/pages/Networking.test.tsx src/pages/NetworkSearchPanels.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Networking.tsx src/pages/Networking.test.tsx
git commit -m "feat: deep link network control tab"
```

---

### Task 9: Regression, Barrierefreiheit und Abschlussprüfung

**Files:**
- Modify only if a finding requires it:
  - `src/components/network/*.tsx`
  - `src/pages/NetworkAuditPanel.tsx`
  - `src/pages/Networking.tsx`
  - affected tests

- [ ] **Step 1: Fokussierte Tests ausführen**

Run:

```bash
npm run test -- src/test/networkAudit.test.ts src/test/networkAuditViewModel.test.ts src/test/networkAuditNavigation.test.ts src/components/tables/VirtualTable.test.tsx src/components/network/NetworkAuditUi.test.tsx src/pages/NetworkSearchPanels.test.tsx src/pages/Networking.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Gesamte Testsuite ausführen**

Run:

```bash
npm run test
```

Expected: PASS ohne neue Fehler.

- [ ] **Step 3: Lint und TypeScript prüfen**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: beide Befehle PASS; vorhandene, unabhängige Warnungen nicht
verschlimmern.

- [ ] **Step 4: React Doctor ausführen**

Den Skill `react-doctor` aktivieren und dessen vollständigen Prüfablauf für die
geänderten React-Dateien ausführen.

Expected: keine neuen kritischen Findings. Findings im Änderungsscope beheben
und die fokussierten Tests danach erneut ausführen.

- [ ] **Step 5: Production-Build prüfen**

Run:

```bash
npm run build
```

Expected: Vite Production-Build PASS.

- [ ] **Step 6: Browserprüfung in Dark und Light Mode**

Run:

```bash
npm run dev
```

Prüfen:

1. `/network-security?tab=audit` öffnet die Übersicht.
2. Die Quellenleiste zeigt Anzahl und Importdatum in `de-DE`.
3. „Nächsten Befund prüfen“ öffnet den priorisierten Bereich.
4. Zurück/Vorwärts stellt `check` und `scope` wieder her.
5. Jede Detailansicht zeigt nur ihre eigene Tabelle.
6. Die globale Suche zeigt den sichtbaren Suchhinweis und einen verständlichen
   Nulltreffer-Zustand.
7. Fehlende Pflichtquellen führen zum spezifischen Upload-Hinweis.
8. Ohne RVTools bleibt die Kontrolle erreichbar; andere Tabs zeigen ihren
   RVTools-Empty-State.
9. Tastaturnavigation erreicht Tabs, Filter, Kartenaktionen und Tabellen.
10. Desktop, Tablet und Mobil zeigen keine abgeschnittenen Navigationslabels.
11. Dark und Light Mode verwenden ausschließlich bestehende Tokens.

- [ ] **Step 7: Abschluss-Commit für notwendige Prüfkorrekturen**

Nur falls Step 1–6 Änderungen erfordert:

```bash
git add src/components/network src/components/tables/VirtualTable.tsx src/pages/NetworkAuditPanel.tsx src/pages/Networking.tsx src/hooks/useActiveSnapshots.ts src/lib/networkAuditViewModel.ts src/lib/networkAuditNavigation.ts src/lib/glossaries/networking.ts src/test src/pages/*.test.tsx src/components/**/*.test.tsx
git commit -m "fix: address guided network audit verification"
```

- [ ] **Step 8: Arbeitsbaum und Commitfolge prüfen**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: sauberer Arbeitsbaum und kleine, nachvollziehbare Commits für
View-Model, Navigation, Quellenstatus, Tabellenzustand, Übersicht, Detailpanels,
Orchestrator und Deep Linking.
