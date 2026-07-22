# Eramon ↔ CDP Netzwerk-Kontrolle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Tab „Kontrolle" um Eramon-iface (Port-Join mit CDP) und eine neue MAC-Sektion (CDP↔Eramon-L2, beide Perspektiven) erweitern.

**Architecture:** Rein clientseitig — reine Funktionen in `src/lib/networkAudit.ts`, per `useMemo` im bestehenden `useNetworkAudit`-Hook abgeleitet und im `NetworkAuditPanel` gerendert. Kein neuer IndexedDB-Store, keine DB-Versionsänderung.

**Tech Stack:** React + TypeScript, TanStack Query, TanStack Table (VirtualTable), Vitest.

## Global Constraints

- **Kein neuer IndexedDB-Store, keine DB-Version-Änderung** — alle Ableitungen zur Laufzeit aus den bestehenden `*_latest`-Stores.
- **Leere Zellen als „—"** (bestehende `textCell`-Konvention).
- **Deutsche UI-Texte**, orthografisch korrekt inkl. Umlauten.
- **MAC-Kanonisierung ist Pflicht** für jeden CDP↔L2-Vergleich (VMware-Format `00:50:56:…` vs. Cisco-Format `0050.56ab.…`).
- **Bestehende `matchedSource`-Werte bleiben `{cdp, rvtools, techinfo, ipam}`** — Eramon-iface ist switch-seitig und Teil der Port-Basis, kein Label-Ziel.
- **Bestehende Tests dürfen nicht schwächer werden** — Anpassungen nur, wo eine Signaturänderung sie zwingend erfordert.
- **Nur `NetworkAuditPanel`/`networkAudit.ts`/`useNetworkAudit`/Glossar werden angefasst** — keine anderen Netzwerk-Tabs.

---

### Task 1: `canonicalMac`-Helfer

**Files:**
- Modify: `src/lib/networkAudit.ts`
- Test: `src/test/networkAudit.test.ts`

**Interfaces:**
- Produces: `export function canonicalMac(raw: string | null): string | null`

- [ ] **Step 1: Test schreiben**

In `src/test/networkAudit.test.ts` den Import erweitern (`canonicalMac` ergänzen) und diesen Block ans Ende der Datei anfügen:

```ts
describe("canonicalMac", () => {
  it("normalisiert VMware-, Cisco- und Bindestrich-Format auf dieselbe Form", () => {
    expect(canonicalMac("00:50:56:AB:CD:EF")).toBe("005056abcdef");
    expect(canonicalMac("0050.56ab.cdef")).toBe("005056abcdef");
    expect(canonicalMac("00-50-56-ab-cd-ef")).toBe("005056abcdef");
  });

  it("gibt null für leere, null- oder zu kurze Werte zurück", () => {
    expect(canonicalMac(null)).toBeNull();
    expect(canonicalMac("")).toBeNull();
    expect(canonicalMac("0050.56ab")).toBeNull();
  });
});
```

Import-Zeile oben in der Testdatei:

```ts
import {
  shortHostname,
  stripPortSuffix,
  extractCdpDeviceHostname,
  normalizeInterfaceName,
  buildPortAuditRows,
  canonicalMac,
} from "@/lib/networkAudit";
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: FAIL — `canonicalMac is not a function`.

- [ ] **Step 3: Implementieren**

In `src/lib/networkAudit.ts` nach `normalizeInterfaceName` einfügen:

```ts
/** "00:50:56:AB:CD:EF" | "0050.56ab.cdef" | "00-50-56-ab-cd-ef" -> "005056abcdef";
 *  null oder < 12 Hex-Zeichen -> null. Grundlage jedes CDP<->L2-MAC-Vergleichs. */
export function canonicalMac(raw: string | null): string | null {
  if (!raw) return null;
  const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 12 ? hex.slice(0, 12) : null;
}
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkAudit.ts src/test/networkAudit.test.ts
git commit -m "feat: add canonicalMac helper for CDP/L2 mac matching"
```

---

### Task 2: `buildPortAuditRows` um Eramon-iface-Union erweitern

**Files:**
- Modify: `src/lib/networkAudit.ts`
- Modify: `src/test/networkAudit.test.ts`
- Modify: `src/pages/NetworkSearchPanels.test.tsx` (Mock an neue Felder anpassen)
- Test: `src/test/networkAudit.test.ts`

**Interfaces:**
- Consumes: `EramonIfaceLatest` aus `@/domain/models/types` (`deviceName`, `portName`, `portDesc`, `bandbreiteBps`, `statusLabel`, `switchPortKey`).
- Produces: erweiterte `PortAuditRow` mit `sources: ("cisco" | "eramon")[]`, `bandwidthBps: number | null`, `sourceConflict: boolean`; `BuildPortAuditRowsInput` erhält optionales `eramonIfaceRows?: EramonIfaceLatest[]`.

- [ ] **Step 1: Tests schreiben**

In `src/test/networkAudit.test.ts` eine Factory für Eramon-iface-Zeilen ergänzen (nach `makeIpam`):

```ts
function makeEramonIface(over: Partial<EramonIfaceLatest> = {}): EramonIfaceLatest {
  return {
    switchPortKey: "sw01::eth1/1",
    switchNorm: "sw01",
    deviceName: "sw01",
    portName: "Eth1/1",
    importedAt: "2026-07-20T00:00:00.000Z",
    ifaceImportId: "eif-1",
    rowIndex: 0,
    portDesc: "esxxsrv2270",
    bandbreiteBps: 100_000_000_000,
    portStatus: "1",
    statusLabel: "aktiv",
    ...over,
  };
}
```

Import-Zeile der Testdatei um `EramonIfaceLatest` erweitern:

```ts
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest, EramonIfaceLatest } from "@/domain/models/types";
```

Diese Tests am Ende des `describe("buildPortAuditRows", …)`-Blocks anfügen:

```ts
  it("Union: derselbe Port aus Cisco und Eramon ergibt eine Zeile mit beiden Quellen", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270_Port2" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(["cisco", "eramon"]);
    expect(rows[0].bandwidthBps).toBe(100_000_000_000);
  });

  it("reiner Eramon-Port (ohne Cisco) mit CDP-Treffer wird confirmed-cdp", () => {
    const rows = buildPortAuditRows({
      switchRows: [],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270" })],
      cdpRows: [makeCdpRow({ cdpDeviceId: "sw01.domain.at(SERIAL1)", cdpPortId: "Ethernet1/1", host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(["eramon"]);
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
  });

  it("sourceConflict: Cisco- und Eramon-Beschriftung nennen unterschiedliche Hosts", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "altserver99" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(true);
    expect(rows[0].finding).toContain("altserver99");
  });

  it("sourceConflict: Cisco meldet connected, Eramon meldet down", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270", status: "connected" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270", statusLabel: "down" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(true);
  });

  it("kein sourceConflict bei identischer Beschreibung und identischem Status", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270", status: "connected" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270", statusLabel: "aktiv" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(false);
  });
```

- [ ] **Step 2: Tests laufen lassen (rot)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: FAIL — `eramonIfaceRows` unbekannt bzw. `sources`/`bandwidthBps`/`sourceConflict` undefined.

- [ ] **Step 3: `PortAuditRow` und `BuildPortAuditRowsInput` erweitern**

In `src/lib/networkAudit.ts` die Import-Zeile erweitern:

```ts
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest, EramonIfaceLatest, EramonL2Latest } from "@/domain/models/types";
```

(`EramonL2Latest` wird in Task 3/4 gebraucht — jetzt schon mit importieren, um die Import-Zeile nicht erneut anzufassen.)

`PortAuditRow` um drei Felder erweitern (nach `statusConflict`):

```ts
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
  sources: ("cisco" | "eramon")[];
  bandwidthBps: number | null;
  sourceConflict: boolean;
  finding: string | null;
}
```

`BuildPortAuditRowsInput` um `eramonIfaceRows` (optional) erweitern:

```ts
interface BuildPortAuditRowsInput {
  switchRows: SwitchLatest[];
  eramonIfaceRows?: EramonIfaceLatest[];
  cdpRows: CdpLatest[];
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}
```

- [ ] **Step 4: `buildPortAuditRows` neu implementieren**

Die komplette Funktion `buildPortAuditRows` (ab `export function buildPortAuditRows`) durch diese Version ersetzen:

```ts
interface MergedPort {
  key: string;
  switchInterfaceKey: string;
  switchHostname: string;
  interface: string;
  ciscoDescription: string | null;
  ciscoStatus: string | null;
  eramonPortDesc: string | null;
  eramonStatusLabel: string | null;
  bandwidthBps: number | null;
  sources: ("cisco" | "eramon")[];
}

export function buildPortAuditRows(input: BuildPortAuditRowsInput): PortAuditRow[] {
  const { switchRows, cdpRows, hosts, techInfo, ipam } = input;
  const eramonIfaceRows = input.eramonIfaceRows ?? [];

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

  // Port-Basis als Vereinigungsmenge Cisco + Eramon über switchNorm::interfaceNorm.
  const merged = new Map<string, MergedPort>();
  for (const port of switchRows) {
    const key = `${shortHostname(port.hostname)}::${normalizeInterfaceName(port.interface)}`;
    merged.set(key, {
      key,
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.hostname,
      interface: port.interface,
      ciscoDescription: port.description,
      ciscoStatus: port.status,
      eramonPortDesc: null,
      eramonStatusLabel: null,
      bandwidthBps: null,
      sources: ["cisco"],
    });
  }
  for (const iface of eramonIfaceRows) {
    const key = `${shortHostname(iface.deviceName)}::${normalizeInterfaceName(iface.portName)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.eramonPortDesc = iface.portDesc;
      existing.eramonStatusLabel = iface.statusLabel;
      existing.bandwidthBps = iface.bandbreiteBps;
      if (!existing.sources.includes("eramon")) existing.sources.push("eramon");
    } else {
      merged.set(key, {
        key,
        switchInterfaceKey: iface.switchPortKey,
        switchHostname: iface.deviceName,
        interface: iface.portName,
        ciscoDescription: null,
        ciscoStatus: null,
        eramonPortDesc: iface.portDesc,
        eramonStatusLabel: iface.statusLabel,
        bandwidthBps: iface.bandbreiteBps,
        sources: ["eramon"],
      });
    }
  }

  return [...merged.values()].map((port): PortAuditRow => {
    const cdp = cdpByPort.get(port.key);
    const description = port.ciscoDescription ?? port.eramonPortDesc;
    const rawStatus = port.ciscoStatus ?? port.eramonStatusLabel;
    const candidate = description && description !== "--" ? stripPortSuffix(description) : "";
    const candidateShort = candidate ? shortHostname(candidate) : "";
    const switchConnected = port.ciscoStatus ? port.ciscoStatus === "connected" : port.eramonStatusLabel === "aktiv";

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
        if (switchConnected !== cdpUp) statusConflict = true;
      }
    }

    // Quellen-Konflikt: Cisco- und Eramon-Sicht desselben Ports widersprechen sich.
    let sourceConflict = false;
    let sourceConflictText = "";
    if (port.sources.length > 1) {
      const ciscoCand = port.ciscoDescription && port.ciscoDescription !== "--" ? shortHostname(stripPortSuffix(port.ciscoDescription)) : "";
      const eramonCand = port.eramonPortDesc && port.eramonPortDesc !== "--" ? shortHostname(stripPortSuffix(port.eramonPortDesc)) : "";
      const labelDiverges = !!ciscoCand && !!eramonCand && ciscoCand !== eramonCand;
      const statusDiverges = port.ciscoStatus !== null && port.eramonStatusLabel !== null
        && (port.ciscoStatus === "connected") !== (port.eramonStatusLabel === "aktiv");
      sourceConflict = labelDiverges || statusDiverges;
      const scParts: string[] = [];
      if (labelDiverges) scParts.push(`Cisco-Beschriftung "${port.ciscoDescription}" ≠ Eramon "${port.eramonPortDesc}"`);
      if (statusDiverges) scParts.push(`Cisco meldet "${port.ciscoStatus}", Eramon meldet "${port.eramonStatusLabel}"`);
      sourceConflictText = scParts.join("; ");
    }

    const parts: string[] = [];
    if (labelConflict && statusConflict) {
      parts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"; Switch meldet "${rawStatus}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (labelConflict) {
      parts.push(`Beschriftung nennt "${candidate}", CDP zeigt Host "${labelConflictHost}"`);
    } else if (statusConflict) {
      parts.push(`Switch meldet "${rawStatus}", CDP zeigt Host-Adapter als "${cdp?.linkStatus}"`);
    } else if (matchStatus === "documented-only") {
      parts.push(`Nur in ${matchedSource === "techinfo" ? "TechInfo" : "IPAM"} dokumentiert, kein aktiver RVTools-Host`);
    } else if (matchStatus === "unknown") {
      parts.push("Kein bekannter Host gefunden");
    }
    if (sourceConflict) parts.push(sourceConflictText);
    const finding = parts.length ? parts.join(" · ") : null;

    return {
      switchInterfaceKey: port.switchInterfaceKey,
      switchHostname: port.switchHostname,
      interface: port.interface,
      description,
      status: rawStatus,
      matchStatus,
      matchedHost,
      matchedSource,
      labelConflict,
      labelConflictHost,
      statusConflict,
      sources: port.sources,
      bandwidthBps: port.bandwidthBps,
      sourceConflict,
      finding,
    };
  });
}
```

- [ ] **Step 5: NetworkSearchPanels-Mock an neue Pflichtfelder anpassen**

In `src/pages/NetworkSearchPanels.test.tsx` das `rows`-Objekt im `useNetworkAudit`-Mock um die drei neuen Felder ergänzen (damit der `as PortAuditRow[]`-Cast typprüft):

```ts
  useNetworkAudit: () => ({
    rows: [{
      switchInterfaceKey: "core-01::eth1/1", switchHostname: "core-01", interface: "Eth1/1", description: "Uplink",
      status: "connected", matchStatus: "confirmed-cdp", matchedHost: "esx01", matchedSource: "cdp",
      labelConflict: false, labelConflictHost: null, statusConflict: false,
      sources: ["cisco"], bandwidthBps: null, sourceConflict: false, finding: null,
    }] as PortAuditRow[],
    isLoading: false,
  }),
```

- [ ] **Step 6: Tests laufen lassen (grün)**

Run: `npm run test -- src/test/networkAudit.test.ts src/pages/NetworkSearchPanels.test.tsx`
Expected: PASS (inkl. aller bestehenden `buildPortAuditRows`-Tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/networkAudit.ts src/test/networkAudit.test.ts src/pages/NetworkSearchPanels.test.tsx
git commit -m "feat: merge eramon-iface ports into port audit with source conflicts"
```

---

### Task 3: `buildCdpMacRows` (CDP-Adapter über L2 bestätigen)

**Files:**
- Modify: `src/lib/networkAudit.ts`
- Test: `src/test/networkAudit.test.ts`

**Interfaces:**
- Consumes: `CdpLatest` (`host`, `adapter`, `mac`, `cdpDeviceId`, `cdpPortId`), `EramonL2Latest` (`switchName`, `interface`, `mac`, `vlan`, `ip`, `dnsName`).
- Produces: `export interface CdpMacRow`, `export function buildCdpMacRows(input: { cdpRows: CdpLatest[]; l2Rows: EramonL2Latest[]; }): CdpMacRow[]`.

- [ ] **Step 1: Tests schreiben**

Import-Zeile in `src/test/networkAudit.test.ts` um `buildCdpMacRows` und den Typ `EramonL2Latest` erweitern:

```ts
import {
  shortHostname,
  stripPortSuffix,
  extractCdpDeviceHostname,
  normalizeInterfaceName,
  buildPortAuditRows,
  canonicalMac,
  buildCdpMacRows,
} from "@/lib/networkAudit";
```
```ts
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest, EramonIfaceLatest, EramonL2Latest } from "@/domain/models/types";
```

Factory für L2-Zeilen (nach `makeEramonIface`) ergänzen:

```ts
function makeEramonL2(over: Partial<EramonL2Latest> = {}): EramonL2Latest {
  return {
    l2EntryKey: "sw01::eth1/1::005056abcdef::100",
    switchNorm: "sw01",
    switchName: "sw01",
    interface: "Ethernet1/1",
    mac: "0050.56ab.cdef",
    vlan: "100",
    importedAt: "2026-07-20T00:00:00.000Z",
    l2ImportId: "el2-1",
    rowIndex: 0,
    ip: "192.168.125.85",
    dnsName: "esxxsrv2270",
    type: null,
    interfaceDescription: null,
    ...over,
  };
}
```

Neuen `describe`-Block ans Ende der Datei anfügen:

```ts
describe("buildCdpMacRows", () => {
  it("findet die L2-MAC über kanonische Form (VMware- vs. Cisco-Schreibweise)", () => {
    const rows = buildCdpMacRows({
      cdpRows: [makeCdpRow({ mac: "00:50:56:AB:CD:EF", cdpDeviceId: "sw01.domain.at(S1)", cdpPortId: "Ethernet1/1" })],
      l2Rows: [makeEramonL2({ mac: "0050.56ab.cdef" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].inL2).toBe(true);
    expect(rows[0].learnedIp).toBe("192.168.125.85");
    expect(rows[0].topologyMismatch).toBe(false);
  });

  it("markiert Adapter, deren MAC nicht in der L2-Tabelle steht", () => {
    const rows = buildCdpMacRows({
      cdpRows: [makeCdpRow({ mac: "00:50:56:00:00:01" })],
      l2Rows: [makeEramonL2({ mac: "0050.56ab.cdef" })],
    });
    expect(rows[0].inL2).toBe(false);
    expect(rows[0].finding).toBe("MAC nicht in L2-Tabelle");
  });

  it("überspringt Adapter ohne verwertbare MAC", () => {
    const rows = buildCdpMacRows({
      cdpRows: [makeCdpRow({ mac: null })],
      l2Rows: [],
    });
    expect(rows).toHaveLength(0);
  });

  it("erkennt Topologie-Abweichung, wenn L2 die MAC auf anderem Switch/Port lernt", () => {
    const rows = buildCdpMacRows({
      cdpRows: [makeCdpRow({ mac: "00:50:56:ab:cd:ef", cdpDeviceId: "sw01.domain.at(S1)", cdpPortId: "Ethernet1/1" })],
      l2Rows: [makeEramonL2({ mac: "0050.56ab.cdef", switchName: "sw02", interface: "Ethernet2/2" })],
    });
    expect(rows[0].topologyMismatch).toBe(true);
    expect(rows[0].finding).toContain("Topologie weicht ab");
  });

  it("erzeugt je L2-Treffer eine Zeile, wenn dieselbe MAC auf mehreren VLANs gelernt ist", () => {
    const rows = buildCdpMacRows({
      cdpRows: [makeCdpRow({ mac: "00:50:56:ab:cd:ef", cdpDeviceId: "sw01.domain.at(S1)", cdpPortId: "Ethernet1/1" })],
      l2Rows: [
        makeEramonL2({ mac: "0050.56ab.cdef", vlan: "100" }),
        makeEramonL2({ mac: "0050.56ab.cdef", vlan: "200" }),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.vlan)).toEqual(["100", "200"]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen (rot)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: FAIL — `buildCdpMacRows is not a function`.

- [ ] **Step 3: Implementieren**

In `src/lib/networkAudit.ts` nach `buildPortAuditRows` einfügen:

```ts
export interface CdpMacRow {
  host: string;
  adapter: string;
  mac: string | null;
  macCanonical: string | null;
  inL2: boolean;
  l2Switch: string | null;
  l2Interface: string | null;
  vlan: string | null;
  learnedIp: string | null;
  dnsName: string | null;
  topologyMismatch: boolean;
  finding: string | null;
}

export function buildCdpMacRows(input: { cdpRows: CdpLatest[]; l2Rows: EramonL2Latest[] }): CdpMacRow[] {
  const l2ByMac = new Map<string, EramonL2Latest[]>();
  for (const l2 of input.l2Rows) {
    const cm = canonicalMac(l2.mac);
    if (!cm) continue;
    const arr = l2ByMac.get(cm);
    if (arr) arr.push(l2);
    else l2ByMac.set(cm, [l2]);
  }

  const out: CdpMacRow[] = [];
  for (const cdp of input.cdpRows) {
    const macCanonical = canonicalMac(cdp.mac);
    if (!macCanonical) continue;

    const hits = l2ByMac.get(macCanonical) ?? [];
    const cdpSwitch = cdp.cdpDeviceId ? extractCdpDeviceHostname(cdp.cdpDeviceId) : null;
    const cdpIface = cdp.cdpPortId ? normalizeInterfaceName(cdp.cdpPortId) : null;

    if (hits.length === 0) {
      out.push({
        host: cdp.host, adapter: cdp.adapter, mac: cdp.mac, macCanonical,
        inL2: false, l2Switch: null, l2Interface: null, vlan: null,
        learnedIp: null, dnsName: null, topologyMismatch: false,
        finding: "MAC nicht in L2-Tabelle",
      });
      continue;
    }

    for (const l2 of hits) {
      const l2Key = `${normalizeVmNameForMatch(shortHostname(l2.switchName))}::${normalizeInterfaceName(l2.interface)}`;
      const cdpKey = cdpSwitch && cdpIface ? `${normalizeVmNameForMatch(cdpSwitch)}::${cdpIface}` : null;
      const topologyMismatch = cdpKey !== null && cdpKey !== l2Key;
      out.push({
        host: cdp.host, adapter: cdp.adapter, mac: cdp.mac, macCanonical,
        inL2: true, l2Switch: l2.switchName, l2Interface: l2.interface, vlan: l2.vlan || null,
        learnedIp: l2.ip, dnsName: l2.dnsName, topologyMismatch,
        finding: topologyMismatch
          ? `Topologie weicht ab: CDP ${cdpSwitch}/${cdp.cdpPortId}, L2 ${l2.switchName}/${l2.interface}`
          : null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen (grün)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkAudit.ts src/test/networkAudit.test.ts
git commit -m "feat: add buildCdpMacRows for cdp-adapter L2 confirmation"
```

---

### Task 4: `buildL2DiscoveryRows` (L2-Netz-Discovery)

**Files:**
- Modify: `src/lib/networkAudit.ts`
- Test: `src/test/networkAudit.test.ts`

**Interfaces:**
- Consumes: `EramonL2Latest`, `CdpLatest`, `IpamLatest` (`ipAddress`).
- Produces: `export type L2Classification = "esxi-cdp" | "ipam" | "unknown"`, `export interface L2DiscoveryRow`, `export function buildL2DiscoveryRows(input: { l2Rows: EramonL2Latest[]; cdpRows: CdpLatest[]; ipam: IpamLatest[]; }): L2DiscoveryRow[]`.

- [ ] **Step 1: Tests schreiben**

Import-Zeile in `src/test/networkAudit.test.ts` um `buildL2DiscoveryRows` erweitern. Neuen `describe`-Block ans Ende anfügen:

```ts
describe("buildL2DiscoveryRows", () => {
  it("klassifiziert eine MAC als ESXi (CDP), wenn sie ein bekannter vmnic ist", () => {
    const rows = buildL2DiscoveryRows({
      l2Rows: [makeEramonL2({ mac: "0050.56ab.cdef" })],
      cdpRows: [makeCdpRow({ mac: "00:50:56:ab:cd:ef", host: "esxxsrv2270.rbgooe.at" })],
      ipam: [],
    });
    expect(rows[0].classification).toBe("esxi-cdp");
    expect(rows[0].esxiHost).toBe("esxxsrv2270.rbgooe.at");
  });

  it("klassifiziert als IPAM-bekannt, wenn die gelernte IP im IPAM steht", () => {
    const rows = buildL2DiscoveryRows({
      l2Rows: [makeEramonL2({ mac: "aabb.ccdd.eeff", ip: "192.168.20.10" })],
      cdpRows: [],
      ipam: [makeIpam("core-01")].map((e) => ({ ...e, ipAddress: "192.168.20.10" })),
    });
    expect(rows[0].classification).toBe("ipam");
    expect(rows[0].esxiHost).toBeNull();
  });

  it("klassifiziert als unbekannt, wenn weder CDP noch IPAM greifen", () => {
    const rows = buildL2DiscoveryRows({
      l2Rows: [makeEramonL2({ mac: "aabb.ccdd.eeff", ip: "10.9.9.9" })],
      cdpRows: [],
      ipam: [],
    });
    expect(rows[0].classification).toBe("unknown");
  });
});
```

- [ ] **Step 2: Tests laufen lassen (rot)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: FAIL — `buildL2DiscoveryRows is not a function`.

- [ ] **Step 3: Implementieren**

In `src/lib/networkAudit.ts` nach `buildCdpMacRows` einfügen:

```ts
export type L2Classification = "esxi-cdp" | "ipam" | "unknown";

export interface L2DiscoveryRow {
  l2EntryKey: string;
  switchName: string;
  interface: string;
  vlan: string;
  mac: string;
  learnedIp: string | null;
  dnsName: string | null;
  classification: L2Classification;
  esxiHost: string | null;
}

export function buildL2DiscoveryRows(input: {
  l2Rows: EramonL2Latest[];
  cdpRows: CdpLatest[];
  ipam: IpamLatest[];
}): L2DiscoveryRow[] {
  const cdpMacToHost = new Map<string, string>();
  for (const cdp of input.cdpRows) {
    const cm = canonicalMac(cdp.mac);
    if (cm && !cdpMacToHost.has(cm)) cdpMacToHost.set(cm, cdp.host);
  }

  const ipamIps = new Set<string>();
  for (const entry of input.ipam) {
    if (entry.ipAddress) ipamIps.add(entry.ipAddress.trim().toLowerCase());
  }

  return input.l2Rows.map((l2): L2DiscoveryRow => {
    const cm = canonicalMac(l2.mac);
    const esxiHost = cm ? cdpMacToHost.get(cm) ?? null : null;
    let classification: L2Classification;
    if (esxiHost) classification = "esxi-cdp";
    else if (l2.ip && ipamIps.has(l2.ip.trim().toLowerCase())) classification = "ipam";
    else classification = "unknown";

    return {
      l2EntryKey: l2.l2EntryKey,
      switchName: l2.switchName,
      interface: l2.interface,
      vlan: l2.vlan,
      mac: l2.mac,
      learnedIp: l2.ip,
      dnsName: l2.dnsName,
      classification,
      esxiHost,
    };
  });
}
```

- [ ] **Step 4: Tests laufen lassen (grün)**

Run: `npm run test -- src/test/networkAudit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkAudit.ts src/test/networkAudit.test.ts
git commit -m "feat: add buildL2DiscoveryRows for L2 mac discovery classification"
```

---

### Task 5: `useNetworkAudit` um Eramon-Quellen erweitern

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts`

**Interfaces:**
- Consumes: `buildCdpMacRows`, `buildL2DiscoveryRows` (Task 3/4), `useAllEramonIfaceLatest`, `useAllEramonL2Latest` (bereits vorhanden).
- Produces: `useNetworkAudit()` liefert zusätzlich `cdpMacRows: CdpMacRow[]`, `l2DiscoveryRows: L2DiscoveryRow[]`.

- [ ] **Step 1: Import erweitern**

In `src/hooks/useActiveSnapshots.ts` die Zeile 4 anpassen:

```ts
import { buildPortAuditRows, buildCdpMacRows, buildL2DiscoveryRows } from "@/lib/networkAudit";
```

- [ ] **Step 2: `useNetworkAudit` neu verdrahten**

Die komplette Funktion `useNetworkAudit` ersetzen durch:

```ts
export function useNetworkAudit() {
  const { data: switchRows = [], isLoading: switchLoading } = useAllSwitchLatest();
  const { data: eramonIfaceRows = [], isLoading: eramonIfaceLoading } = useAllEramonIfaceLatest();
  const { data: l2Rows = [], isLoading: l2Loading } = useAllEramonL2Latest();
  const { data: cdpRows = [], isLoading: cdpLoading } = useAllCdpLatest();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: techInfo = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const { data: ipam = [], isLoading: ipamLoading } = useAllIpamLatest();

  const rows = useMemo(
    () => buildPortAuditRows({ switchRows, eramonIfaceRows, cdpRows, hosts, techInfo, ipam }),
    [switchRows, eramonIfaceRows, cdpRows, hosts, techInfo, ipam],
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

  return {
    rows,
    hostQuality,
    cdpMacRows,
    l2DiscoveryRows,
    isLoading: switchLoading || eramonIfaceLoading || l2Loading || cdpLoading || hostsLoading || techInfoLoading || ipamLoading,
  };
}
```

- [ ] **Step 3: Typprüfung / Tests**

Run: `npm run test -- src/pages/NetworkSearchPanels.test.tsx`
Expected: PASS (Hook-Konsumenten kompilieren weiter; der Mock überschreibt den Hook ohnehin).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useActiveSnapshots.ts
git commit -m "feat: wire eramon sources into useNetworkAudit"
```

---

### Task 6: Glossar-Einträge ergänzen

**Files:**
- Modify: `src/lib/glossaries/networking.ts`

**Interfaces:**
- Produces: erweiterte `NET_AUDIT_KPI`/`NET_AUDIT_COLUMNS`; neue `NET_MAC_CDP_COLUMNS`, `NET_MAC_DISCOVERY_COLUMNS`.

- [ ] **Step 1: `NET_AUDIT_KPI` erweitern**

In `src/lib/glossaries/networking.ts` innerhalb von `NET_AUDIT_KPI` den `totalPorts`-Eintrag anpassen und zwei neue Einträge vor der schließenden `};` ergänzen:

```ts
  totalPorts: {
    term: "Ports gesamt",
    description: "Alle Switch-Ports aus Cisco-TXT und Eramon-Inventar, die in den Abgleich einfließen.",
    source: "Cisco-Switch-TXT · Eramon",
  },
```
```ts
  onlyEramon: {
    term: "Nur in Eramon",
    description: "Ports, die ausschließlich im Eramon-Inventar vorkommen und keinen Cisco-TXT-Eintrag haben.",
    source: "Eramon",
  },
  sourceConflicts: {
    term: "Quellen-Konflikte",
    description: "Ports, bei denen sich Cisco- und Eramon-Sicht in Beschreibung oder Status widersprechen.",
    source: "Cisco-Switch-TXT · Eramon",
  },
```

- [ ] **Step 2: `NET_AUDIT_COLUMNS` erweitern**

Zwei Einträge vor der schließenden `};` von `NET_AUDIT_COLUMNS` ergänzen:

```ts
  bandwidth: { term: "Bandbreite", description: "Vom Eramon-Switch gemeldete Port-Bandbreite.", source: "Eramon · bandbreite" },
  source: { term: "Quelle", description: "Datenquelle(n) des Ports: Cisco-TXT, Eramon oder beide.", source: "Cisco-Switch-TXT · Eramon" },
```

- [ ] **Step 3: Neue MAC-Glossare am Dateiende anfügen**

Ans Ende von `src/lib/glossaries/networking.ts` anfügen (die Konstanten `CDP` und `ERAMON` sind ab hier im Modul-Scope):

```ts
export const NET_MAC_CDP_COLUMNS: Record<string, GlossaryEntry> = {
  host: { term: "ESXi-Host", description: "ESX-Host, dessen physischer Adapter geprüft wird.", source: `${CDP} · „VMHost“` },
  adapter: { term: "vmnic", description: "Physischer Netzwerkadapter des Hosts.", source: `${CDP} · „PhysicalAdapter“` },
  mac: { term: "MAC", description: "MAC-Adresse des Adapters (Roh-Anzeige aus CDP).", source: `${CDP} · „MACAddress“` },
  inL2: { term: "In L2?", description: "Ob die MAC in der Eramon-L2-Tabelle gelernt wurde.", source: `Abgleich ${CDP} ↔ ${ERAMON}` },
  l2Location: { term: "Switch/Port (L2)", description: "Switch und Interface, an dem die MAC laut L2-Tabelle gelernt wurde.", source: `${ERAMON} · „name“ / „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID, in dem die MAC gelernt wurde.", source: `${ERAMON} · „vlan“` },
  learnedIp: { term: "Gelernte IP", description: "Vom Switch für die MAC beobachtete IP-Adresse.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "Vom Switch beobachteter DNS-Name.", source: `${ERAMON} · „dnsname“` },
  finding: { term: "Auffälligkeit", description: "Fehlende MAC in der L2-Tabelle oder Topologie-Abweichung gegenüber CDP.", source: "Berechnet aus dem Datenabgleich" },
};

export const NET_MAC_DISCOVERY_COLUMNS: Record<string, GlossaryEntry> = {
  l2Location: { term: "Switch/Port", description: "Switch und Interface, an dem der Eintrag gelernt wurde.", source: `${ERAMON} · „name“ / „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID des Eintrags.", source: `${ERAMON} · „vlan“` },
  mac: { term: "MAC", description: "Am Port gelernte MAC-Adresse.", source: `${ERAMON} · „mac“` },
  learnedIp: { term: "Gelernte IP", description: "Vom Switch beobachtete IP-Adresse.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "Vom Switch beobachteter DNS-Name.", source: `${ERAMON} · „dnsname“` },
  classification: { term: "Klassifikation", description: "ESXi (CDP), IPAM-bekannt oder unbekannt/fremd.", source: `Abgleich ${ERAMON} ↔ ${CDP} ↔ IPAM` },
  esxiHost: { term: "ESXi-Host", description: "Zugeordneter ESX-Host, falls die MAC ein bekannter vmnic ist.", source: `${CDP} · „VMHost“` },
};
```

- [ ] **Step 4: Typprüfung**

Run: `npm run test -- src/pages/NetworkSearchPanels.test.tsx`
Expected: PASS (Glossar wird importiert, keine Laufzeitänderung).

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossaries/networking.ts
git commit -m "feat: add glossary entries for eramon port and mac audit"
```

---

### Task 7: Port-Tabelle im Panel um Bandbreite/Quelle + KPIs + EmptyState

**Files:**
- Modify: `src/pages/NetworkAuditPanel.tsx`

**Interfaces:**
- Consumes: `PortAuditRow.sources/bandwidthBps/sourceConflict` (Task 2), `cdpMacRows`/`l2DiscoveryRows` aus `useNetworkAudit` (Task 5), `NET_AUDIT_COLUMNS.bandwidth/source`, `NET_AUDIT_KPI.onlyEramon/sourceConflicts` (Task 6), `formatBandwidth` aus `@/lib/eramon`.

- [ ] **Step 1: Imports erweitern**

In `src/pages/NetworkAuditPanel.tsx`:

```ts
import { formatBandwidth } from "@/lib/eramon";
```

Icon-Import (Zeile 2) um `Network` und `Radar` ergänzen (für die neuen KPIs/Sektion in Task 8):

```ts
import { ListChecks, CheckCircle2, Archive, HelpCircle, AlertTriangle, Tag, Database, Server, Network, Radar } from "lucide-react";
```

- [ ] **Step 2: `sourceBadge`-Helfer und erweitertes `isNotable`**

Nach der `matchStatusBadge`-Funktion einfügen:

```tsx
function sourceBadge(sources: ("cisco" | "eramon")[]) {
  const label = sources.length > 1 ? "beide" : sources[0] === "cisco" ? "Cisco" : "Eramon";
  return <Badge variant="outline">{label}</Badge>;
}
```

`isNotable` ersetzen durch:

```tsx
function isNotable(row: PortAuditRow): boolean {
  if (row.sourceConflict) return true;
  if (row.matchStatus === "no-target") return false;
  if (row.matchStatus === "confirmed-cdp" && !row.labelConflict && !row.statusConflict) return false;
  return true;
}
```

- [ ] **Step 3: Port-Spalten Bandbreite + Quelle**

Im `columns`-Array die zwei neuen Spalten zwischen `status` und `matchStatus` einfügen:

```tsx
  {
    id: "bandwidth",
    header: "Bandbreite",
    meta: { info: NET_AUDIT_COLUMNS.bandwidth },
    accessorFn: (row) => row.bandwidthBps ?? 0,
    cell: ({ row }) => {
      const bps = row.original.bandwidthBps;
      return <span title={bps != null ? `${bps} bit/s` : undefined}>{formatBandwidth(bps)}</span>;
    },
  },
  {
    id: "source",
    header: "Quelle",
    meta: { info: NET_AUDIT_COLUMNS.source },
    accessorFn: (row) => row.sources.join("+"),
    cell: ({ row }) => sourceBadge(row.original.sources),
  },
```

- [ ] **Step 4: Hook-Destrukturierung + KPIs + EmptyState**

Die Zeile mit `useNetworkAudit()` ersetzen durch (Defaults für die neuen Arrays, damit Mocks ohne diese Felder nicht brechen):

```tsx
  const { rows: allRows, hostQuality = { rvtoolsRows: [], techInfoRows: [] }, cdpMacRows = [], l2DiscoveryRows = [], isLoading } = useNetworkAudit();
```

Nach den bestehenden `useMemo`-Zählern (`labelConflictCount`) zwei weitere ergänzen:

```tsx
  const onlyEramonCount = useMemo(() => allRows.filter((r) => r.sources.length === 1 && r.sources[0] === "eramon").length, [allRows]);
  const sourceConflictCount = useMemo(() => allRows.filter((r) => r.sourceConflict).length, [allRows]);
```

Die EmptyState-Bedingung ersetzen (Eramon zählt als Switch-Quelle, MAC-Sektion ebenfalls berücksichtigen):

```tsx
  if (allRows.length === 0 && cdpMacRows.length === 0 && l2DiscoveryRows.length === 0) {
```

Und den EmptyState-Beschreibungstext anpassen:

```tsx
        description="Laden Sie eine Cisco-Switch-TXT oder Eramon-Exporte auf der Upload-Seite hoch, um Switch-Ports gegen CDP-, RVTools-, TechInfo-, IPAM- und Eramon-Daten abzugleichen."
```

Im `KpiGrid` nach der `labelConflicts`-KpiCard zwei weitere ergänzen:

```tsx
        <KpiCard title="Nur in Eramon" value={formatNum(onlyEramonCount)} icon={<Network className="h-4 w-4" />} info={NET_AUDIT_KPI.onlyEramon} />
        <KpiCard title="Quellen-Konflikte" value={formatNum(sourceConflictCount)} severity={sourceConflictCount > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={NET_AUDIT_KPI.sourceConflicts} />
```

- [ ] **Step 5: Tests + Typprüfung**

Run: `npm run test -- src/pages/NetworkSearchPanels.test.tsx src/pages/Networking.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/NetworkAuditPanel.tsx
git commit -m "feat: add bandwidth/source columns and eramon kpis to audit panel"
```

---

### Task 8: MAC-Abgleich-Sektion im Panel

**Files:**
- Modify: `src/pages/NetworkAuditPanel.tsx`

**Interfaces:**
- Consumes: `CdpMacRow`, `L2DiscoveryRow`, `L2Classification`, `shortHostname` aus `@/lib/networkAudit`; `NET_MAC_CDP_COLUMNS`, `NET_MAC_DISCOVERY_COLUMNS` (Task 6).

- [ ] **Step 1: Imports erweitern**

Type-Import aus `@/lib/networkAudit` erweitern und `shortHostname` als Wert importieren:

```ts
import { shortHostname } from "@/lib/networkAudit";
import type { PortAuditRow, PortMatchStatus, CdpMacRow, L2DiscoveryRow, L2Classification } from "@/lib/networkAudit";
```

Glossar-Import (Zeile 6) um die neuen Konstanten erweitern:

```ts
import { NET_AUDIT_COLUMNS, NET_AUDIT_KPI, NET_HOST_QUALITY_RVTOOLS_COLUMNS, NET_HOST_QUALITY_TECHINFO_COLUMNS, NET_MAC_CDP_COLUMNS, NET_MAC_DISCOVERY_COLUMNS } from "@/lib/glossaries/networking";
```

- [ ] **Step 2: Klassifikations-Helfer + Spaltendefinitionen**

Vor der `NetworkAuditPanel`-Funktion einfügen:

```tsx
const CLASSIFICATION_LABELS: Record<L2Classification, string> = {
  "esxi-cdp": "ESXi (CDP)",
  "ipam": "IPAM-bekannt",
  "unknown": "Unbekannt/Fremd",
};

function classificationBadge(c: L2Classification) {
  if (c === "esxi-cdp") return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{CLASSIFICATION_LABELS[c]}</Badge>;
  if (c === "ipam") return <Badge variant="secondary">{CLASSIFICATION_LABELS[c]}</Badge>;
  return <Badge variant="destructive">{CLASSIFICATION_LABELS[c]}</Badge>;
}

const cdpMacColumns: ColumnDef<CdpMacRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_MAC_CDP_COLUMNS.host }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "adapter", header: "vmnic", meta: { info: NET_MAC_CDP_COLUMNS.adapter }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_MAC_CDP_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { id: "inL2", header: "In L2?", meta: { info: NET_MAC_CDP_COLUMNS.inL2 }, accessorFn: (row) => (row.inL2 ? "ja" : "nein"), cell: ({ row }) => (row.original.inL2 ? presenceBadge(true) : <Badge variant="destructive">fehlt</Badge>) },
  { id: "l2Location", header: "Switch/Port (L2)", meta: { info: NET_MAC_CDP_COLUMNS.l2Location }, accessorFn: (row) => `${row.l2Switch ?? ""} ${row.l2Interface ?? ""}`, cell: ({ row }) => (row.original.l2Switch ? <span className="font-mono-data text-xs">{shortHostname(row.original.l2Switch)}/{row.original.l2Interface}</span> : "—") },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_MAC_CDP_COLUMNS.vlan }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "learnedIp", header: "Gelernte IP", meta: { info: NET_MAC_CDP_COLUMNS.learnedIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_MAC_CDP_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "finding", header: "Auffälligkeit", meta: { info: NET_MAC_CDP_COLUMNS.finding }, cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className="text-warning text-xs">{v}</span> : "—"; } },
];

const l2DiscoveryColumns: ColumnDef<L2DiscoveryRow, unknown>[] = [
  { id: "l2Location", header: "Switch/Port", meta: { info: NET_MAC_DISCOVERY_COLUMNS.l2Location }, accessorFn: (row) => `${row.switchName} ${row.interface}`, cell: ({ row }) => <span className="font-mono-data text-xs">{shortHostname(row.original.switchName)}/{row.original.interface}</span> },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_MAC_DISCOVERY_COLUMNS.vlan }, cell: ({ getValue }) => textCell((getValue() as string) || null) },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_MAC_DISCOVERY_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "learnedIp", header: "Gelernte IP", meta: { info: NET_MAC_DISCOVERY_COLUMNS.learnedIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_MAC_DISCOVERY_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "classification", header: "Klassifikation", meta: { info: NET_MAC_DISCOVERY_COLUMNS.classification }, accessorFn: (row) => CLASSIFICATION_LABELS[row.classification], cell: ({ row }) => classificationBadge(row.original.classification) },
  { accessorKey: "esxiHost", header: "ESXi-Host", meta: { info: NET_MAC_DISCOVERY_COLUMNS.esxiHost }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];
```

- [ ] **Step 3: Toggle-State + gefilterte Sichten**

In `NetworkAuditPanel` nach den bestehenden `useState`-Zeilen ergänzen:

```tsx
  const [onlyMacFindings, setOnlyMacFindings] = useState(true);
  const [onlyUnknownL2, setOnlyUnknownL2] = useState(true);

  const cdpMacDisplay = useMemo(
    () => (onlyMacFindings ? cdpMacRows.filter((r) => !r.inL2 || r.topologyMismatch) : cdpMacRows),
    [cdpMacRows, onlyMacFindings],
  );
  const l2DiscoveryDisplay = useMemo(
    () => (onlyUnknownL2 ? l2DiscoveryRows.filter((r) => r.classification === "unknown") : l2DiscoveryRows),
    [l2DiscoveryRows, onlyUnknownL2],
  );
```

- [ ] **Step 4: MAC-Sektion rendern**

Direkt vor dem schließenden `</div>` der äußersten Rückgabe (nach der bestehenden „Host-Datenabgleich"-`</section>`) einfügen:

```tsx
      {(cdpMacRows.length > 0 || l2DiscoveryRows.length > 0) && (
        <section className="overflow-hidden rounded-xl border border-border bg-card/60" aria-labelledby="mac-audit-heading">
          <div className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Radar className="h-4 w-4" /></div>
              <div>
                <h3 id="mac-audit-heading" className="text-sm font-semibold">MAC-Abgleich (Eramon L2)</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Gleicht die MAC-Adressen der ESXi-Adapter (CDP) mit der Eramon-L2-Tabelle ab und klassifiziert alle am Netz gelernten MACs. MAC-Formate werden dafür kanonisiert.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-4 sm:p-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">ESXi-Adapter in L2 ({cdpMacDisplay.length} von {cdpMacRows.length})</h4></div>
                <label htmlFor="only-mac-findings" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
                  <span>Nur Auffälligkeiten</span>
                  <ToggleSwitch id="only-mac-findings" checked={onlyMacFindings} onCheckedChange={setOnlyMacFindings} aria-label="Nur auffällige Adapter anzeigen" />
                </label>
              </div>
              <VirtualTable data={cdpMacDisplay} columns={cdpMacColumns} globalFilter={filters.search} height={360} exportFileName="mac-audit-cdp" />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">Netz-Discovery ({l2DiscoveryDisplay.length} von {l2DiscoveryRows.length})</h4></div>
                <label htmlFor="only-unknown-l2" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
                  <span>Nur Unbekannte</span>
                  <ToggleSwitch id="only-unknown-l2" checked={onlyUnknownL2} onCheckedChange={setOnlyUnknownL2} aria-label="Nur unbekannte MACs anzeigen" />
                </label>
              </div>
              <VirtualTable data={l2DiscoveryDisplay} columns={l2DiscoveryColumns} globalFilter={filters.search} height={360} exportFileName="mac-discovery" />
            </div>
          </div>
        </section>
      )}
```

- [ ] **Step 5: Tests + Typprüfung**

Run: `npm run test -- src/pages/NetworkSearchPanels.test.tsx src/pages/Networking.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/NetworkAuditPanel.tsx
git commit -m "feat: add mac audit section to network control tab"
```

---

### Task 9: Gesamtverifikation

**Files:** keine (nur Verifikation)

- [ ] **Step 1: Volle Testsuite**

Run: `npm run test`
Expected: PASS (alle Tests grün).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: keine Fehler.

- [ ] **Step 3: Build (Typprüfung end-to-end)**

Run: `npm run build`
Expected: erfolgreicher Build (vorbestehende Chunk-Size-Warnungen für `xlsx`/`vendor-charts` sind unkritisch).

- [ ] **Step 4: Abschluss-Commit (falls nötig)**

Nur falls Lint/Build kleine Anpassungen erzwungen haben:

```bash
git add -A
git commit -m "chore: lint/build fixes for eramon-cdp audit"
```

## Self-Review

- **Spec-Abdeckung:** Teil A (Port-Union CDP↔Eramon) → Task 2; `canonicalMac` → Task 1; Teil B Tabelle 3a → Task 3; Tabelle 3b → Task 4; Hook → Task 5; Glossar → Task 6; Port-Tabelle/KPIs/EmptyState → Task 7; MAC-Sektion → Task 8; Verifikation → Task 9. Alle Spec-Abschnitte abgedeckt.
- **Typkonsistenz:** `buildPortAuditRows`/`buildCdpMacRows`/`buildL2DiscoveryRows`, `CdpMacRow`/`L2DiscoveryRow`/`L2Classification`, `canonicalMac`, `sources`/`bandwidthBps`/`sourceConflict` durchgängig identisch benannt zwischen Definition (Tasks 1–4) und Konsum (Tasks 5, 7, 8).
- **Keine Platzhalter:** jeder Code-Schritt enthält vollständigen Code.
- **YAGNI:** kein Teil C, kein neuer Store, keine Änderung an anderen Tabs.
