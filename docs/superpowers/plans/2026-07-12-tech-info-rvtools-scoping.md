# Tech-Info RVTools-Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Tech-Info-Seite zeigt nur aktive RVTools-VMs mit passendem Server- oder Client-Eintrag sowie eine eigene Tabelle für aktive VMs ohne beide Eintragsarten.

**Architecture:** Eine neue reine Hilfsfunktion ordnet den bestehenden, bereits gefilterten RVTools-VMs Server- und Client-Tech-Info über normalisierte Namen zu. `TechInfo.tsx` verwendet ihr Ergebnis, um die drei Tabellen aufzubauen; IndexedDB, Import und globale Filter bleiben unverändert.

**Tech Stack:** React 18, TypeScript, Vitest, TanStack Table, bestehende Domain-Typen und Namensnormalisierung.

---

## Dateistruktur

- `src/lib/techInfoVmScope.ts` (neu): reine Zuordnung von RVTools-VMs zu Server- und Client-Tech-Info-Datensätzen.
- `src/test/techInfoVmScope.test.ts` (neu): Unit-Tests für die Zuordnung, unabhängig von React und IndexedDB.
- `src/pages/TechInfo.tsx` (ändern): konsumiert die Zuordnung, filtert die bestehenden Tabellen und rendert die Tabelle ohne Tech-Info.

### Task 1: Testbare RVTools-Tech-Info-Zuordnung

**Files:**

- Create: `src/lib/techInfoVmScope.ts`
- Create: `src/test/techInfoVmScope.test.ts`

- [ ] **Step 1: Den fehlschlagenden Test für die Aufteilung schreiben**

```ts
import { describe, expect, it } from "vitest";
import type { NormalizedVm, TechInfoClientLatest, TechInfoLatest } from "@/domain/models/types";
import { partitionTechInfoByActiveVms } from "@/lib/techInfoVmScope";

const vm = (vmName: string) => ({ vmName }) as NormalizedVm;
const server = (vmName: string) => ({ vmName, vmNameNorm: vmName.trim().toLowerCase() }) as TechInfoLatest;
const client = (clientName: string) => ({ clientName, clientNameNorm: clientName.trim().toLowerCase() }) as TechInfoClientLatest;

describe("partitionTechInfoByActiveVms", () => {
  it("ordnet nur aktive VMs zu und normalisiert Leerzeichen und Groß-/Kleinschreibung", () => {
    const result = partitionTechInfoByActiveVms(
      [vm(" APP-01 "), vm("VDI-01"), vm("UNASSIGNED-01"), vm("BOTH-01")],
      [server("app-01"), server("both-01"), server("stale-server")],
      [client("vdi-01"), client(" BOTH-01 "), client("stale-client")],
    );

    expect(result.serverVms.map((entry) => entry.vmName)).toEqual([" APP-01 ", "BOTH-01"]);
    expect(result.clientRows.map((entry) => entry.clientName)).toEqual(["vdi-01", " BOTH-01 "]);
    expect(result.vmsWithoutTechInfo.map((entry) => entry.vmName)).toEqual(["UNASSIGNED-01"]);
  });
});
```

- [ ] **Step 2: Test gezielt ausführen und das erwartete Fehlschlagen prüfen**

Run: `npm run test -- src/test/techInfoVmScope.test.ts`

Expected: FAIL, weil das Modul `@/lib/techInfoVmScope` noch nicht existiert.

- [ ] **Step 3: Die minimale Zuordnungsfunktion implementieren**

```ts
import type { NormalizedVm, TechInfoClientLatest, TechInfoLatest } from "@/domain/models/types";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";

export interface ActiveVmTechInfoPartition {
  serverVms: NormalizedVm[];
  clientRows: TechInfoClientLatest[];
  vmsWithoutTechInfo: NormalizedVm[];
}

export function partitionTechInfoByActiveVms(
  vms: NormalizedVm[],
  serverRows: TechInfoLatest[],
  clientRows: TechInfoClientLatest[],
): ActiveVmTechInfoPartition {
  const activeVmNames = new Set(vms.map((vm) => normalizeVmNameForMatch(vm.vmName)));
  const serverNames = new Set(serverRows.map((row) => normalizeVmNameForMatch(row.vmName)));
  const clientNames = new Set(clientRows.map((row) => normalizeVmNameForMatch(row.clientName)));

  return {
    serverVms: vms.filter((vm) => serverNames.has(normalizeVmNameForMatch(vm.vmName))),
    clientRows: clientRows.filter((row) => activeVmNames.has(normalizeVmNameForMatch(row.clientName))),
    vmsWithoutTechInfo: vms.filter((vm) => {
      const name = normalizeVmNameForMatch(vm.vmName);
      return !serverNames.has(name) && !clientNames.has(name);
    }),
  };
}
```

- [ ] **Step 4: Den neuen Unit-Test erneut ausführen**

Run: `npm run test -- src/test/techInfoVmScope.test.ts`

Expected: PASS mit einem erfolgreichen Test.

- [ ] **Step 5: Die erste abgeschlossene Einheit committen**

```bash
git add src/lib/techInfoVmScope.ts src/test/techInfoVmScope.test.ts
git commit -m "feat: scope Tech-Info to active RVTools VMs"
```

### Task 2: Drei Tech-Info-Tabellen aus der Zuordnung aufbauen

**Files:**

- Modify: `src/pages/TechInfo.tsx:1-260`

- [ ] **Step 1: Die getestete Zuordnung in der Seite verwenden**

```ts
import { partitionTechInfoByActiveVms } from "@/lib/techInfoVmScope";
import type { NormalizedVm, TechInfoClientLatest } from "@/domain/models/types";

const unassignedColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cluster", header: "Cluster", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "host", header: "Host", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "powerState", header: "Power-Status", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "osConfig", header: "Betriebssystem", cell: ({ getValue }) => getValue() || "—" },
];

const { serverVms, clientRows, vmsWithoutTechInfo } = useMemo(
  () => partitionTechInfoByActiveVms(scopeVms, techInfoLatest, techInfoClients),
  [scopeVms, techInfoLatest, techInfoClients],
);

const rows = useMemo<TechInfoVmRow[]>(
  () => serverVms.map((vm) => {
    const techInfo = byVmName.get(vm.vmName.trim().toLowerCase())!;
    return {
      vmName: vm.vmName,
      serverType: techInfo.serverType,
      maintenanceWindow: techInfo.maintenanceWindow,
      operatingSystem: techInfo.operatingSystem,
      comment: techInfo.comment,
      sysv: techInfo.sysv,
      sysvDepartment: techInfo.sysvDepartment,
      sysvDeputy: techInfo.sysvDeputy,
      sysvDeputyConflict: hasIdenticalSysvAndDeputy(techInfo.sysv, techInfo.sysvDeputy),
      sysvDeputyDepartment: techInfo.sysvDeputyDepartment,
      bz: techInfo.bz,
      clusterFromTechInfo: techInfo.clusterFromTechInfo,
      cvBackup: techInfo.cvBackup,
      az: techInfo.az,
      hasTechInfo: true,
    };
  }),
  [serverVms, byVmName],
);
```

Ersetze in `searchedClientRows` und der Client-`VirtualTable` die bisherige Quelle `techInfoClients` durch `clientRows`. Ergänze `searchedUnassignedRows`, das `vmsWithoutTechInfo` über `vmName`, `cluster`, `host`, `powerState` und `osConfig` mit `filters.search` filtert und nach `vmName` sortiert. Rendere anschließend unterhalb der Client-Tabelle die Tabelle **„VMs ohne Tech-Info“** mit `unassignedColumns` und `openVmDetail` als Zeilenaktion. Die Überschriften zählen jeweils `searchedRows`, `searchedClientRows` und `searchedUnassignedRows`.

- [ ] **Step 2: Den bestehenden Zuordnungstest nach der Seitenanpassung erneut ausführen**

Run: `npm run test -- src/test/techInfoVmScope.test.ts`

Expected: PASS; der Test bestätigt weiterhin die getestete Datenquelle der drei Tabellen.

- [ ] **Step 3: Die UI-Einheit committen**

```bash
git add src/pages/TechInfo.tsx
git commit -m "feat: split Tech-Info tables by RVTools match"
```

### Task 3: Gesamtprüfung

**Files:**

- Verify: `src/lib/techInfoVmScope.ts`
- Verify: `src/pages/TechInfo.tsx`
- Verify: `src/test/techInfoVmScope.test.ts`

- [ ] **Step 1: Gesamte Testsuite ausführen**

Run: `npm run test`

Expected: PASS ohne fehlgeschlagene Tests.

- [ ] **Step 2: Typen und Lint prüfen**

Run: `npm run typecheck; npm run lint`

Expected: Beide Befehle beenden sich mit Exit-Code 0; keine neuen TypeScript- oder ESLint-Probleme.

- [ ] **Step 3: Produktions-Build prüfen**

Run: `npm run build`

Expected: Vite erstellt `dist` erfolgreich.

- [ ] **Step 4: React-spezifische Prüfung ausführen**

Run: `npx -y react-doctor@latest . --verbose --diff`

Expected: Keine neu durch die Änderung verursachten Correctness- oder Architecture-Fehler.

- [ ] **Step 5: Abschließenden Prüfstand committen**

```bash
git status --short
git log --oneline -3
```

Expected: Die beiden Feature-Commits sind vorhanden und der Arbeitsbaum enthält keine unbeabsichtigten Änderungen.
