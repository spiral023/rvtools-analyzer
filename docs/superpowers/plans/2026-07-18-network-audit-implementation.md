# Netzwerk-Kontrolle (Switch-Port-Audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Tab „Kontrolle" im Netzwerk-Bereich, der CDP-, Switch-, RVTools-, TechInfo- und IPAM-Daten clientseitig zu einer Port-zentrierten Tabelle zusammenführt und abgebaute Hosts, Beschriftungs-Konflikte und Status-Widersprüche aufdeckt.

**Architektur:** Reines TypeScript-Modul (`src/lib/networkAudit.ts`) berechnet aus den bereits vorhandenen `*_latest`-Daten pro Switch-Port einen Match-Status + Konflikt-Flags. Ein neuer Hook (`useNetworkAudit`) verbindet die bestehenden Daten-Hooks und ruft die Berechnung per `useMemo` auf. Ein neues Panel (`NetworkAuditPanel`) zeigt KPIs + Tabelle. Keine DB-Änderung.

**Tech Stack:** React, TanStack Query/Table, Vitest, bestehende `VirtualTable`/`KpiCard`/`Badge`-Komponenten.

## Global Constraints

- Keine IndexedDB-Schema-Änderung, keine `DB_VERSION`-Erhöhung — reine Ableitung aus bereits geladenen Daten.
- Matching-Logik ausschließlich über `shortHostname`/`normalizeVmNameForMatch`-Vergleiche, kein Fuzzy-/Levenshtein-Algorithmus.
- Priorität bei `documented-only`: TechInfo vor IPAM (deterministisch, siehe Spec).
- `confirmed-cdp` hat Vorrang vor `no-target` in der Status-Ermittlung (unbeschrifteter, aber CDP-bestätigter Port zählt als bestätigt).
- Referenz-Spec: `docs/superpowers/specs/2026-07-18-network-audit-design.md` (freigegeben).

---

## Task 1: Matching-Modul `src/lib/networkAudit.ts`

**Files:**
- Create: `src/lib/networkAudit.ts`
- Test: `src/test/networkAudit.test.ts`

**Interfaces:**
- Consumes: `normalizeVmNameForMatch(name: string): string` aus `@/lib/xlsx/parseHelpers` (bereits vorhanden); Typen `SwitchLatest`, `CdpLatest`, `NormalizedHost`, `TechInfoLatest`, `IpamLatest` aus `@/domain/models/types` (bereits vorhanden, Felder siehe unten).
- Produces: `PortMatchStatus`, `MatchedSource`, `PortAuditRow`, `buildPortAuditRows(input): PortAuditRow[]` — von Task 2 (Hook) konsumiert.

Relevante Felder der bestehenden Typen (aus `src/domain/models/types.ts`):
- `SwitchLatest`: `switchInterfaceKey`, `hostnameNorm`, `hostname`, `interface`, `description: string | null`, `status: string | null`.
- `CdpLatest`: `host`, `cdpDeviceId: string | null`, `cdpPortId: string | null`, `cdpAvailable: boolean | null`, `linkStatus: string | null`.
- `NormalizedHost`: `host: string`.
- `TechInfoLatest`: `vmName: string`.
- `IpamLatest`: `name: string | null`.

- [ ] **Step 1: Write the failing test file**

Create `src/test/networkAudit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  shortHostname,
  stripPortSuffix,
  extractCdpDeviceHostname,
  normalizeInterfaceName,
  buildPortAuditRows,
} from "@/lib/networkAudit";
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest } from "@/domain/models/types";

describe("shortHostname", () => {
  it("schneidet den Domain-Teil einer FQDN ab", () => {
    expect(shortHostname("esxxsrv2270.rbgooe.at")).toBe("esxxsrv2270");
  });

  it("lässt einen bereits kurzen Namen unverändert (kleingeschrieben)", () => {
    expect(shortHostname("ESXXSRV2270")).toBe("esxxsrv2270");
  });
});

describe("stripPortSuffix", () => {
  it("entfernt einen _PortN-Suffix", () => {
    expect(stripPortSuffix("esxxsrv2270_Port2")).toBe("esxxsrv2270");
  });

  it("entfernt einen -portN-Suffix (andere Schreibweise)", () => {
    expect(stripPortSuffix("esxxsrv2270-port12")).toBe("esxxsrv2270");
  });

  it("lässt einen Namen ohne Port-Suffix unverändert", () => {
    expect(stripPortSuffix("esxxsrv2270")).toBe("esxxsrv2270");
  });
});

describe("extractCdpDeviceHostname", () => {
  it("schneidet Seriennummer in Klammern und Domain ab", () => {
    expect(extractCdpDeviceHostname("grznx93oc18-8.domain.at(FDO26040UFF)")).toBe("grznx93oc18-8");
  });

  it("funktioniert auch ohne Seriennummer", () => {
    expect(extractCdpDeviceHostname("grznx93oc18-8.domain.at")).toBe("grznx93oc18-8");
  });
});

describe("normalizeInterfaceName", () => {
  it("kürzt 'Ethernet' auf 'eth' und lowercased", () => {
    expect(normalizeInterfaceName("Ethernet1/13")).toBe("eth1/13");
  });

  it("lässt eine bereits kurze Interface-Bezeichnung unverändert", () => {
    expect(normalizeInterfaceName("Eth1/1")).toBe("eth1/1");
  });
});

function makeSwitchRow(over: Partial<SwitchLatest> = {}): SwitchLatest {
  return {
    switchInterfaceKey: "sw01::eth1/1",
    hostnameNorm: "sw01",
    hostname: "sw01",
    interface: "Eth1/1",
    importedAt: "2026-07-18T00:00:00.000Z",
    switchImportId: "imp-1",
    rowIndex: 0,
    description: "esxxsrv2270_Port2",
    status: "connected",
    mode: "trunk",
    duplex: "full",
    speed: "25G",
    transceiver: "SFP-H25GB-CU3M",
    ...over,
  };
}

function makeCdpRow(over: Partial<CdpLatest> = {}): CdpLatest {
  return {
    hostAdapterKey: "esxxsrv2270::vmnic0",
    hostNorm: "esxxsrv2270.rbgooe.at",
    host: "esxxsrv2270.rbgooe.at",
    adapter: "vmnic0",
    importedAt: "2026-07-18T00:00:00.000Z",
    cdpImportId: "cdp-1",
    rowIndex: 0,
    vcenter: null,
    cluster: null,
    hostConnectionState: "Connected",
    linkStatus: "Up",
    mac: null,
    cdpDeviceId: "sw01.domain.at(SERIAL1)",
    cdpPortId: "Ethernet1/1",
    cdpMgmtIp: null,
    cdpSwitchAddress: null,
    cdpPlatform: null,
    cdpSoftware: null,
    nativeVlan: null,
    mtu: null,
    cdpAvailable: true,
    queryStatus: null,
    ...over,
  };
}

function makeHost(host: string): NormalizedHost {
  return {
    snapshotId: "snap-1", vcenterId: "vc-1", hostKey: `${host}::vc-1`, host,
    cluster: null, datacenter: null, cpuModel: null, cpuTotalMHz: null, cpuCores: null,
    cpuThreads: null, memoryTotalMiB: null, version: null, build: null, vendor: null,
    model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
  };
}

function makeTechInfo(vmName: string): TechInfoLatest {
  return {
    vmNameNorm: vmName.toLowerCase(), vmName, importedAt: "2026-07-18T00:00:00.000Z",
    techInfoImportId: "ti-1", rowIndex: 0, serverType: null, maintenanceWindow: null,
    operatingSystem: null, comment: null, sysv: null, sysvDepartment: null, sysvDeputy: null,
    sysvDeputyDepartment: null, bz: null, clusterFromTechInfo: null, cvBackup: null, az: null,
  };
}

function makeIpam(name: string): IpamLatest {
  return {
    ipAddress: "10.0.0.1", importedAt: "2026-07-18T00:00:00.000Z", ipamImportId: "ip-1",
    rowIndex: 0, name, status: "Used", type: "Host", usage: "DNS", firstDiscovered: null,
    lastDiscovered: null, comment: null, site: null, macAddress: null, os: null,
    netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null,
  };
}

describe("buildPortAuditRows", () => {
  it("confirmed-cdp: CDP löst Switch+Port strukturiert auf, Beschreibung (FQDN vs. non-FQDN) passt dazu", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [makeCdpRow({ host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
    expect(rows[0].matchedHost).toBe("esxxsrv2270.rbgooe.at");
    expect(rows[0].labelConflict).toBe(false);
    expect(rows[0].statusConflict).toBe(false);
  });

  it("labelConflict: Beschreibung nennt einen anderen Host als CDP", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altgeraet01_Port2" })],
      cdpRows: [makeCdpRow({ host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
    expect(rows[0].labelConflict).toBe(true);
    expect(rows[0].labelConflictHost).toBe("esxxsrv2270.rbgooe.at");
    expect(rows[0].finding).toContain("altgeraet01");
    expect(rows[0].finding).toContain("esxxsrv2270.rbgooe.at");
  });

  it("statusConflict: Switch meldet notconnec, CDP zeigt Host als verbunden", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ status: "notconnec" })],
      cdpRows: [makeCdpRow({ linkStatus: "Up" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].statusConflict).toBe(true);
  });

  it("kein statusConflict, wenn CDP keinen linkStatus liefert (null)", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ status: "notconnec" })],
      cdpRows: [makeCdpRow({ linkStatus: null })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].statusConflict).toBe(false);
  });

  it("text-match: kein CDP-Treffer, aber Beschreibung matcht einen aktiven RVTools-Host", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [],
      hosts: [makeHost("esxxsrv2270.rbgooe.at")], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("text-match");
    expect(rows[0].matchedSource).toBe("rvtools");
  });

  it("documented-only via TechInfo: kein RVTools-Host, aber TechInfo-Server-Name passt", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver01_Port2" })],
      cdpRows: [], hosts: [], techInfo: [makeTechInfo("altserver01")], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("documented-only");
    expect(rows[0].matchedSource).toBe("techinfo");
    expect(rows[0].finding).toContain("TechInfo");
  });

  it("documented-only via IPAM, wenn TechInfo keinen Treffer liefert", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver02_Port2" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [makeIpam("altserver02")],
    });
    expect(rows[0].matchStatus).toBe("documented-only");
    expect(rows[0].matchedSource).toBe("ipam");
  });

  it("documented-only Priorität: Name in TechInfo UND IPAM -> TechInfo gewinnt", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver03_Port2" })],
      cdpRows: [], hosts: [],
      techInfo: [makeTechInfo("altserver03")], ipam: [makeIpam("altserver03")],
    });
    expect(rows[0].matchedSource).toBe("techinfo");
  });

  it("unknown: kein Match in keiner Quelle", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "voelligunbekannt_Port2" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("unknown");
    expect(rows[0].finding).toBe("Kein bekannter Host gefunden");
  });

  it("no-target: Beschreibung ist '--' (z. B. mgmt0), kein CDP-Treffer", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ interface: "mgmt0", description: "--" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("no-target");
    expect(rows[0].finding).toBeNull();
  });

  it("confirmed-cdp hat Vorrang vor no-target: unbeschrifteter, aber CDP-bestätigter Port", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "--" })],
      cdpRows: [makeCdpRow()],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
  });

  it("cdpAvailable=false fließt nicht in den CDP-Index ein", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [makeCdpRow({ cdpAvailable: false })],
      hosts: [makeHost("esxxsrv2270.rbgooe.at")], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("text-match");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/networkAudit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/networkAudit'` (Datei existiert noch nicht).

- [ ] **Step 3: Implement `src/lib/networkAudit.ts`**

```ts
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest } from "@/domain/models/types";

export type PortMatchStatus = "confirmed-cdp" | "no-target" | "text-match" | "documented-only" | "unknown";
export type MatchedSource = "cdp" | "rvtools" | "techinfo" | "ipam";

export interface PortAuditRow {
  switchInterfaceKey: string;
  switchHostname: string;
  interface: string;
  description: string | null;
  status: string | null;
  matchStatus: PortMatchStatus;
  matchedHost: string | null;
  matchedSource: MatchedSource | null;
  labelConflict: boolean;
  labelConflictHost: string | null;
  statusConflict: boolean;
  finding: string | null;
}

const PORT_SUFFIX_REGEX = /[\s_-]?port\s*\d+$/i;

/** "esxxsrv2270.rbgooe.at" -> "esxxsrv2270"; bereits kurze Namen bleiben (kleingeschrieben) unverändert. */
export function shortHostname(name: string): string {
  return name.trim().split(".")[0].toLowerCase();
}

/** "esxxsrv2270_Port2" -> "esxxsrv2270"; ohne Suffix unverändert (nur getrimmt). */
export function stripPortSuffix(description: string): string {
  return description.trim().replace(PORT_SUFFIX_REGEX, "").trim();
}

/** "grznx93oc18-8.domain.at(SERIAL)" -> "grznx93oc18-8" — Seriennummer in Klammern und Domain abschneiden. */
export function extractCdpDeviceHostname(cdpDeviceId: string): string {
  const withoutSerial = cdpDeviceId.replace(/\([^)]*\)\s*$/, "").trim();
  return shortHostname(withoutSerial);
}

/** "Ethernet1/13" -> "eth1/13"; "Eth1/1" -> "eth1/1". */
export function normalizeInterfaceName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^ethernet/, "eth");
}

interface BuildPortAuditRowsInput {
  switchRows: SwitchLatest[];
  cdpRows: CdpLatest[];
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}

export function buildPortAuditRows(input: BuildPortAuditRowsInput): PortAuditRow[] {
  const { switchRows, cdpRows, hosts, techInfo, ipam } = input;

  const cdpByPort = new Map<string, CdpLatest>();
  for (const cdp of cdpRows) {
    if (cdp.cdpAvailable !== true || !cdp.cdpDeviceId || !cdp.cdpPortId) continue;
    const key = `${normalizeVmNameForMatch(extractCdpDeviceHostname(cdp.cdpDeviceId))}::${normalizeInterfaceName(cdp.cdpPortId)}`;
    cdpByPort.set(key, cdp);
  }

  const rvtoolsHostSet = new Set(hosts.map((h) => shortHostname(h.host)));
  const techInfoNameSet = new Set(techInfo.map((t) => shortHostname(t.vmName)));
  const ipamNameSet = new Set<string>();
  for (const entry of ipam) {
    if (entry.name) ipamNameSet.add(shortHostname(entry.name));
  }

  return switchRows.map((port): PortAuditRow => {
    const key = `${port.hostnameNorm}::${normalizeInterfaceName(port.interface)}`;
    const cdp = cdpByPort.get(key);
    const candidate = port.description && port.description !== "--" ? stripPortSuffix(port.description) : "";
    const candidateShort = candidate ? shortHostname(candidate) : "";

    let matchStatus: PortMatchStatus;
    let matchedHost: string | null = null;
    let matchedSource: MatchedSource | null = null;

    if (cdp) {
      matchStatus = "confirmed-cdp";
      matchedHost = cdp.host;
      matchedSource = "cdp";
    } else if (!candidateShort) {
      matchStatus = "no-target";
    } else if (rvtoolsHostSet.has(candidateShort)) {
      matchStatus = "text-match";
      matchedHost = candidate;
      matchedSource = "rvtools";
    } else if (techInfoNameSet.has(candidateShort)) {
      matchStatus = "documented-only";
      matchedHost = candidate;
      matchedSource = "techinfo";
    } else if (ipamNameSet.has(candidateShort)) {
      matchStatus = "documented-only";
      matchedHost = candidate;
      matchedSource = "ipam";
    } else {
      matchStatus = "unknown";
    }

    let labelConflict = false;
    let labelConflictHost: string | null = null;
    let statusConflict = false;

    if (cdp) {
      if (candidateShort && candidateShort !== shortHostname(cdp.host)) {
        labelConflict = true;
        labelConflictHost = cdp.host;
      }
      if (cdp.linkStatus) {
        const cdpUp = cdp.linkStatus.toLowerCase() === "up";
        const switchConnected = port.status === "connected";
        if (switchConnected !== cdpUp) statusConflict = true;
      }
    }

    let finding: string | null = null;
    if (labelConflict) {
      finding = `Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"`;
    } else if (statusConflict) {
      finding = `Switch meldet "${port.status}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`;
    } else if (matchStatus === "documented-only") {
      finding = `Nur in ${matchedSource === "techinfo" ? "TechInfo" : "IPAM"} dokumentiert, kein aktiver RVTools-Host`;
    } else if (matchStatus === "unknown") {
      finding = "Kein bekannter Host gefunden";
    }

    return {
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.hostname,
      interface: port.interface,
      description: port.description,
      status: port.status,
      matchStatus,
      matchedHost,
      matchedSource,
      labelConflict,
      labelConflictHost,
      statusConflict,
      finding,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/networkAudit.test.ts`
Expected: PASS — all 17 tests green.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors/warnings for the new files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/networkAudit.ts src/test/networkAudit.test.ts
git commit -m "feat: add network audit matching engine (CDP/Switch/RVTools/TechInfo/IPAM)"
```

---

## Task 2: Hook `useNetworkAudit` + Panel `NetworkAuditPanel`

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts`
- Create: `src/pages/NetworkAuditPanel.tsx`

**Interfaces:**
- Consumes: `buildPortAuditRows`, `PortAuditRow`, `PortMatchStatus` aus `@/lib/networkAudit` (Task 1); bereits vorhandene Hooks `useAllSwitchLatest`, `useAllCdpLatest`, `useHosts`, `useAllTechInfoLatest`, `useAllIpamLatest` (alle in derselben Datei); `formatNum` aus `@/lib/xlsx/parseHelpers`; `KpiCard`, `KpiGrid`, `EmptyState`, `PanelLoadingState`, `VirtualTable`, `Badge`, `Switch` (UI-Toggle) aus den bestehenden Komponentenpfaden.
- Produces: `useNetworkAudit(): { rows: PortAuditRow[]; isLoading: boolean }` — von `NetworkAuditPanel` konsumiert; `NetworkAuditPanel` — von Task 3 (Networking.tsx) konsumiert.

- [ ] **Step 1: Hook `useNetworkAudit` hinzufügen**

In `src/hooks/useActiveSnapshots.ts` direkt **nach** der bestehenden Import-Zeile

```ts
import { getSnapshots, getBySnapshotIds, getRawSheetRows, getTechInfoLatestByVmNames, getAllTechInfoLatest, getAllTechInfoClientLatest, getTechInfoClientLatestByClientNames, getAllCdpLatest, getAllIpamLatest, getAllSwitchLatest } from "@/data/db";
```

(diese Zeile bleibt unverändert stehen) eine neue Zeile einfügen:

```ts
import { buildPortAuditRows } from "@/lib/networkAudit";
```

Am Ende der Datei (nach `useAllSwitchLatest`, vor `useVmsWithTechInfo`) einfügen:

```ts
export function useNetworkAudit() {
  const { data: switchRows = [], isLoading: switchLoading } = useAllSwitchLatest();
  const { data: cdpRows = [], isLoading: cdpLoading } = useAllCdpLatest();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: techInfo = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const { data: ipam = [], isLoading: ipamLoading } = useAllIpamLatest();

  const rows = useMemo(
    () => buildPortAuditRows({ switchRows, cdpRows, hosts, techInfo, ipam }),
    [switchRows, cdpRows, hosts, techInfo, ipam],
  );

  return {
    rows,
    isLoading: switchLoading || cdpLoading || hostsLoading || techInfoLoading || ipamLoading,
  };
}
```

- [ ] **Step 2: Panel `src/pages/NetworkAuditPanel.tsx` erstellen**

```tsx
import { useMemo, useState } from "react";
import { ListChecks, CheckCircle2, Archive, HelpCircle, AlertTriangle, Tag } from "lucide-react";
import { useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { PortAuditRow, PortMatchStatus } from "@/lib/networkAudit";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const MATCH_STATUS_LABELS: Record<PortMatchStatus, string> = {
  "confirmed-cdp": "CDP bestätigt",
  "text-match": "Beschreibung",
  "documented-only": "Nur dokumentiert",
  "unknown": "Unbekannt",
  "no-target": "Kein Ziel",
};

function matchStatusBadge(status: PortMatchStatus) {
  const label = MATCH_STATUS_LABELS[status];
  if (status === "confirmed-cdp") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{label}</Badge>;
  }
  if (status === "documented-only") {
    return <Badge className="border-transparent bg-warning text-warning-foreground hover:bg-warning/80">{label}</Badge>;
  }
  if (status === "unknown") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (status === "no-target") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function isNotable(row: PortAuditRow): boolean {
  if (row.matchStatus === "no-target") return false;
  if (row.matchStatus === "confirmed-cdp" && !row.labelConflict && !row.statusConflict) return false;
  return true;
}

const columns: ColumnDef<PortAuditRow, unknown>[] = [
  { accessorKey: "switchHostname", header: "Switch", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Beschreibung", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "matchStatus", header: "Match-Status", cell: ({ getValue }) => matchStatusBadge(getValue() as PortMatchStatus) },
  { accessorKey: "matchedHost", header: "Vermuteter Host", cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    accessorKey: "finding",
    header: "Auffälligkeit",
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return "—";
      return <span className="text-warning text-xs">{v}</span>;
    },
  },
];

export function NetworkAuditPanel() {
  const { rows: allRows, isLoading } = useNetworkAudit();
  const [onlyNotable, setOnlyNotable] = useState(true);

  const rows = useMemo(() => (onlyNotable ? allRows.filter(isNotable) : allRows), [allRows, onlyNotable]);

  const confirmedCount = useMemo(() => allRows.filter((r) => r.matchStatus === "confirmed-cdp").length, [allRows]);
  const documentedOnlyCount = useMemo(() => allRows.filter((r) => r.matchStatus === "documented-only").length, [allRows]);
  const unknownCount = useMemo(() => allRows.filter((r) => r.matchStatus === "unknown").length, [allRows]);
  const statusConflictCount = useMemo(() => allRows.filter((r) => r.statusConflict).length, [allRows]);
  const labelConflictCount = useMemo(() => allRows.filter((r) => r.labelConflict).length, [allRows]);

  if (isLoading) return <PanelLoadingState />;

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="h-6 w-6" />}
        title="Keine Daten für die Kontrolle"
        description="Laden Sie eine Cisco-Switch-TXT auf der Upload-Seite hoch, um Switch-Ports gegen CDP-, RVTools-, TechInfo- und IPAM-Daten abzugleichen."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Ports gesamt" value={formatNum(allRows.length)} icon={<ListChecks className="h-4 w-4" />} />
        <KpiCard title="CDP-bestätigt" value={formatNum(confirmedCount)} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard title="Nur dokumentiert" value={formatNum(documentedOnlyCount)} severity={documentedOnlyCount > 0 ? "warn" : "ok"} icon={<Archive className="h-4 w-4" />} />
        <KpiCard title="Unbekannt" value={formatNum(unknownCount)} severity={unknownCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} />
        <KpiCard title="Status-Konflikte" value={formatNum(statusConflictCount)} severity={statusConflictCount > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Beschriftungs-Konflikte" value={formatNum(labelConflictCount)} severity={labelConflictCount > 0 ? "warn" : "ok"} icon={<Tag className="h-4 w-4" />} />
      </KpiGrid>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Switch-Ports ({rows.length} von {allRows.length})</h3>
          <label htmlFor="only-notable" className="flex cursor-pointer items-center gap-3 rounded-md bg-background/70 px-3 py-2 text-xs font-medium">
            <span>Nur Auffälligkeiten</span>
            <ToggleSwitch id="only-notable" checked={onlyNotable} onCheckedChange={setOnlyNotable} aria-label="Nur auffällige Ports anzeigen" />
          </label>
        </div>
        <VirtualTable data={rows} columns={columns} height={500} exportFileName="network-audit" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keine neuen Fehler in `useActiveSnapshots.ts` oder `NetworkAuditPanel.tsx` (bestehende, unabhängige Fehler in `tooltip.test.tsx`/`CdpSwitchPorts.test.tsx` bleiben unverändert bestehen — siehe Global Constraints der vorherigen Features).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useActiveSnapshots.ts src/pages/NetworkAuditPanel.tsx
git commit -m "feat: add useNetworkAudit hook and NetworkAuditPanel"
```

---

## Task 3: Tab „Kontrolle" in `Networking.tsx`

**Files:**
- Modify: `src/pages/Networking.tsx`

**Interfaces:**
- Consumes: `NetworkAuditPanel` aus `@/pages/NetworkAuditPanel` (Task 2).

- [ ] **Step 1: Import und Tab-Typ erweitern**

In `src/pages/Networking.tsx`:

```ts
import { SwitchPanel } from "@/pages/SwitchPanel";
```
wird zu:
```ts
import { SwitchPanel } from "@/pages/SwitchPanel";
import { NetworkAuditPanel } from "@/pages/NetworkAuditPanel";
```

```ts
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "cisco-switch";
```
wird zu:
```ts
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "cisco-switch" | "audit";
```

- [ ] **Step 2: Tab-Trigger und Tab-Content ergänzen**

```tsx
          <TabsTrigger value="cisco-switch">Cisco Switch</TabsTrigger>
        </TabsList>
```
wird zu:
```tsx
          <TabsTrigger value="cisco-switch">Cisco Switch</TabsTrigger>
          <TabsTrigger value="audit">Kontrolle</TabsTrigger>
        </TabsList>
```

```tsx
        <TabsContent value="cisco-switch" className="space-y-4">
          <SwitchPanel />
        </TabsContent>
      </Tabs>
```
wird zu:
```tsx
        <TabsContent value="cisco-switch" className="space-y-4">
          <SwitchPanel />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <NetworkAuditPanel />
        </TabsContent>
      </Tabs>
```

- [ ] **Step 3: Bestehenden Networking-Test prüfen**

Run: `npx vitest run src/pages/Networking.test.tsx`
Expected: PASS (der Test prüft i. d. R. nur, dass die Seite ohne Snapshot den EmptyState zeigt bzw. mit Snapshot rendert — neuer Tab bricht das nicht, da `NetworkAuditPanel` denselben Query-Client-/Router-Kontext nutzt wie die übrigen Panels).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Networking.tsx
git commit -m "feat: add Kontrolle tab wiring NetworkAuditPanel into Networking page"
```

---

## Task 4: Vollständige Verifikation

**Files:** keine (nur Ausführung)

- [ ] **Step 1: Komplette Test-Suite**

Run: `npm run test`
Expected: alle Tests grün (bestehende Anzahl + 17 neue aus Task 1).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nur die bereits vor diesem Feature bestehenden, unabhängigen Fehler in `src/components/ui/tooltip.test.tsx` und `src/pages/CdpSwitchPorts.test.tsx` (siehe Baseline-Check der vorherigen Features) — keine neuen.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: keine Fehler/Warnungen.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build erfolgreich (Chunk-Size-Warnung für `xlsx`/`vendor-charts` ist bekannt und unabhängig von diesem Feature).

- [ ] **Step 5: Manueller Browser-Test**

Dev-Server starten (`npm run dev -- --port <frei>`), im Browser:
1. `referenzdaten/switch.txt` (falls noch nicht vorhanden im DB-Stand) und eine RVTools-Testdatei hochladen, damit die Netzwerk-Seite nicht im globalen `EmptyState` bleibt.
2. Optional `referenzdaten/ipam.csv` und eine TechInfo-Server-Doku hochladen, um `documented-only`/`text-match`-Fälle zu sehen.
3. Tab „Kontrolle" öffnen, KPI-Zahlen und Tabelle auf Plausibilität prüfen (Summe `confirmed-cdp + text-match + documented-only + unknown + no-target` = Ports gesamt).
4. Toggle „Nur Auffälligkeiten" umschalten und prüfen, dass sich die Zeilenzahl ändert.
5. Dev-Server wieder beenden.

- [ ] **Step 6: Abschluss-Commit (falls beim manuellen Test noch Anpassungen nötig waren)**

```bash
git add -A
git commit -m "fix: address findings from manual network audit verification"
```

(Nur ausführen, falls Schritt 5 tatsächlich Änderungen erforderte — sonst überspringen.)
