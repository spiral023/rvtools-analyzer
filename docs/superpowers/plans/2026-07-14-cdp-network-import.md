# CDP-CSV-Import + Netzwerk-Ansicht — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CDP-CSV-Dateien (Cisco Discovery Protocol, Semikolon-getrennt) über die bestehende Upload-Zone importieren und im Netzwerk-Bereich als neuen Tab „CDP/Switch-Ports" mit KPIs und Tabelle auswerten.

**Architecture:** Die bestehende Import-Pipeline (Drag&Drop → Parser-Worker → fileKind-Erkennung → Import-Service → IndexedDB) wird um den Dateityp `"cdp"` erweitert — exakt nach dem Tech-Info-Muster mit drei Stores (`cdp_imports`, `cdp_rows`, `cdp_latest`, latest wins pro Host+Adapter). Die Ansicht folgt dem `VlanUsagePanel`-Muster (KPI-Grid + VirtualTable + Glossar).

**Tech Stack:** React 18, TypeScript, idb (IndexedDB), SheetJS (`@e965/xlsx`, liest auch CSV), TanStack Query/Table, Vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-07-14-cdp-network-import-design.md`

## Global Constraints

- Alle UI-Texte auf Deutsch mit korrekten Umlauten und typografischen Anführungszeichen („…").
- Keine neuen npm-Dependencies — SheetJS parst CSV.
- IndexedDB: `DB_VERSION` wird von 17 auf **18** erhöht; neue Stores nur additiv (kein Löschen bestehender Stores).
- Pflicht-Header zur CDP-Erkennung (verbatim): `VMHost`, `PhysicalAdapter`, `CDPDeviceID`, `CDPAvailable`.
- Testkommandos: `npx vitest run <datei>` (einzeln), `npm test` (alle), `npm run typecheck`, `npm run lint`.
- Bestehende Muster übernehmen: Tech-Info-Client-Import als Vorlage für Import/DB, `VlanUsagePanel` als Vorlage fürs Panel.

---

### Task 1: CDP-Typen, Header-Erkennung und Feld-Mapping (parseHelpers)

**Files:**
- Modify: `src/domain/models/types.ts` (ImportFileKind Zeile 3; neue Interfaces nach `TechInfoClientLatest` ~Zeile 153)
- Modify: `src/lib/xlsx/parseHelpers.ts` (ParsedFileKind Zeile 18, detectParsedFileKind Zeile 78, neue Exporte)
- Test: `src/test/cdpImport.test.ts` (neu), `src/test/parseHelpers.test.ts` (erweitern)

**Interfaces:**
- Consumes: `toStr`, `toBool`, `normalizeVmNameForMatch` (bestehend in parseHelpers)
- Produces:
  - `type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp"` (types.ts)
  - `interface CdpImportMeta { cdpImportId: string; importedAt: string; fileName: string; fileChecksum: string; rowCount: number; columnCount: number }` (types.ts)
  - `interface CdpRow { cdpImportId: string; rowIndex: number; host: string; hostNorm: string; adapter: string; hostAdapterKey: string; importedAt: string; rawData: Record<string, string | number | boolean | null> }` (types.ts)
  - `interface CdpLatest` (types.ts, alle Felder siehe Step 3)
  - `CDP_REQUIRED_HEADERS: readonly string[]`, `mapCdpDisplayFields(row: Record<string, unknown>): CdpDisplayFields`, `buildHostAdapterKey(host: string, adapter: string): string`, `normalizeVcenterId(vcenterName: string): string` (parseHelpers.ts)

- [ ] **Step 1: Failing Tests schreiben**

Neue Datei `src/test/cdpImport.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapCdpDisplayFields,
  buildHostAdapterKey,
  normalizeVcenterId,
  CDP_REQUIRED_HEADERS,
} from "@/lib/xlsx/parseHelpers";

const CDP_HEADERS = [
  "vCenter", "Cluster", "VMHost", "HostConnectionState", "PhysicalAdapter",
  "LinkStatus", "MACAddress", "CDPDeviceID", "CDPPortID", "CDPManagementIP",
  "CDPSwitchAddress", "CDPHardwarePlatform", "CDPSoftwareVersion",
  "CDPNativeVLAN", "CDPMTU", "CDPAvailable", "QueryStatus", "ErrorMessage",
];

describe("detectParsedFileKind (CDP)", () => {
  it("erkennt CDP-CSV an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: CDP_HEADERS }])).toBe("cdp");
  });

  it("erkennt CDP auch mit minimalen Pflicht-Headern", () => {
    expect(
      detectParsedFileKind([{ sheetName: "Sheet1", headers: [...CDP_REQUIRED_HEADERS] }]),
    ).toBe("cdp");
  });

  it("fällt bei fremden CSV-Headern auf rvtools zurück (Ablehnung passiert im Import-Service)", () => {
    expect(
      detectParsedFileKind([{ sheetName: "Sheet1", headers: ["Spalte A", "Spalte B"] }]),
    ).toBe("rvtools");
  });

  it("lässt RVTools-Erkennung unangetastet", () => {
    expect(
      detectParsedFileKind([{ sheetName: "vInfo", headers: ["VM", "Powerstate"] }]),
    ).toBe("rvtools");
  });
});

describe("mapCdpDisplayFields", () => {
  it("mappt alle CDP-Spalten inkl. Boolean- und Zahl-Konvertierung", () => {
    const fields = mapCdpDisplayFields({
      "vCenter": "vcenter1110.domain.at",
      "Cluster": "CL_LNZ_VDI_5920_2",
      "HostConnectionState": "Connected",
      "LinkStatus": "Up",
      "MACAddress": "08:c0:eb:c4:c8:a0",
      "CDPDeviceID": "grznx93oc18-8.domain.at(FDO26040UFF)",
      "CDPPortID": "Ethernet1/13",
      "CDPManagementIP": "10.18.129.44",
      "CDPSwitchAddress": "192.168.125.44",
      "CDPHardwarePlatform": "N9K-C93180YC-FX3",
      "CDPSoftwareVersion": "Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)",
      "CDPNativeVLAN": 1,
      "CDPMTU": "9216",
      "CDPAvailable": "True",
      "QueryStatus": "CDP-Daten gefunden",
    });
    expect(fields.vcenter).toBe("vcenter1110.domain.at");
    expect(fields.cluster).toBe("CL_LNZ_VDI_5920_2");
    expect(fields.linkStatus).toBe("Up");
    expect(fields.mac).toBe("08:c0:eb:c4:c8:a0");
    expect(fields.cdpDeviceId).toBe("grznx93oc18-8.domain.at(FDO26040UFF)");
    expect(fields.cdpPortId).toBe("Ethernet1/13");
    expect(fields.cdpMgmtIp).toBe("10.18.129.44");
    expect(fields.cdpSwitchAddress).toBe("192.168.125.44");
    expect(fields.cdpPlatform).toBe("N9K-C93180YC-FX3");
    expect(fields.nativeVlan).toBe("1");
    expect(fields.mtu).toBe("9216");
    expect(fields.cdpAvailable).toBe(true);
    expect(fields.queryStatus).toBe("CDP-Daten gefunden");
  });

  it("liefert null für leere CDP-Felder (z. B. vusb0) und false für CDPAvailable=False", () => {
    const fields = mapCdpDisplayFields({
      "vCenter": "vcenter1110.domain.at",
      "Cluster": "CL_LNZ_VDI_5920_2",
      "LinkStatus": "Up",
      "MACAddress": "22:c4:b6:34:04:1f",
      "CDPDeviceID": "",
      "CDPPortID": "",
      "CDPAvailable": "False",
      "QueryStatus": "Keine CDP-Daten",
    });
    expect(fields.cdpDeviceId).toBeNull();
    expect(fields.cdpPortId).toBeNull();
    expect(fields.nativeVlan).toBeNull();
    expect(fields.mtu).toBeNull();
    expect(fields.cdpAvailable).toBe(false);
  });
});

describe("buildHostAdapterKey", () => {
  it("normalisiert Host und Adapter (trim + lowercase) mit ::-Trenner", () => {
    expect(buildHostAdapterKey(" ESXvdi5D43.domain.at ", " VMNIC0 ")).toBe(
      "esxvdi5d43.domain.at::vmnic0",
    );
  });
});

describe("normalizeVcenterId", () => {
  it("bildet vCenter-Namen auf die vcenterId-Konvention des RVTools-Imports ab", () => {
    expect(normalizeVcenterId("vCenter1110.Domain.AT")).toBe("vcenter1110.domain.at");
    expect(normalizeVcenterId("vc 01 (prod)")).toBe("vc_01__prod_");
    expect(normalizeVcenterId("  ")).toBe("unknown-vcenter");
  });
});
```

- [ ] **Step 2: Tests laufen lassen — sie müssen fehlschlagen**

Run: `npx vitest run src/test/cdpImport.test.ts`
Expected: FAIL — `mapCdpDisplayFields`, `buildHostAdapterKey`, `normalizeVcenterId`, `CDP_REQUIRED_HEADERS` sind nicht exportiert.

- [ ] **Step 3: Typen in `src/domain/models/types.ts` ergänzen**

Zeile 3 ändern:

```ts
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp";
```

Nach dem Interface `TechInfoClientLatest` (endet ~Zeile 153) einfügen:

```ts
export interface CdpImportMeta {
  cdpImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
}

export interface CdpRow {
  cdpImportId: string;
  rowIndex: number;
  host: string;
  hostNorm: string;
  adapter: string;
  /** `${hostNorm}::${adapterNorm}` — Primärschlüssel in cdp_latest, Index in cdp_rows. */
  hostAdapterKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface CdpLatest {
  hostAdapterKey: string;
  hostNorm: string;
  host: string;
  adapter: string;
  importedAt: string;
  cdpImportId: string;
  rowIndex: number;
  vcenter: string | null;
  cluster: string | null;
  hostConnectionState: string | null;
  linkStatus: string | null;
  mac: string | null;
  cdpDeviceId: string | null;
  cdpPortId: string | null;
  cdpMgmtIp: string | null;
  cdpSwitchAddress: string | null;
  cdpPlatform: string | null;
  cdpSoftware: string | null;
  nativeVlan: string | null;
  mtu: string | null;
  cdpAvailable: boolean | null;
  queryStatus: string | null;
}
```

- [ ] **Step 4: parseHelpers erweitern**

In `src/lib/xlsx/parseHelpers.ts`:

Zeile 18 ändern:

```ts
export type ParsedFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp";
```

Nach `TECH_INFO_CLIENT_REQUIRED_HEADERS` (Zeile 29) einfügen:

```ts
export const CDP_REQUIRED_HEADERS = ["VMHost", "PhysicalAdapter", "CDPDeviceID", "CDPAvailable"] as const;
```

In `detectParsedFileKind` (Zeile 78) vor dem abschließenden `return "rvtools";` einfügen:

```ts
  const hasCdpHeaders = sheets.some((sheet) =>
    CDP_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasCdpHeaders) return "cdp";
```

Nach `mapTechInfoClientDisplayFields` (endet Zeile 145) einfügen:

```ts
export interface CdpDisplayFields {
  vcenter: string | null;
  cluster: string | null;
  hostConnectionState: string | null;
  linkStatus: string | null;
  mac: string | null;
  cdpDeviceId: string | null;
  cdpPortId: string | null;
  cdpMgmtIp: string | null;
  cdpSwitchAddress: string | null;
  cdpPlatform: string | null;
  cdpSoftware: string | null;
  nativeVlan: string | null;
  mtu: string | null;
  cdpAvailable: boolean | null;
  queryStatus: string | null;
}

export function mapCdpDisplayFields(row: Record<string, unknown>): CdpDisplayFields {
  return {
    vcenter: toStr(row["vCenter"]),
    cluster: toStr(row["Cluster"]),
    hostConnectionState: toStr(row["HostConnectionState"]),
    linkStatus: toStr(row["LinkStatus"]),
    mac: toStr(row["MACAddress"]),
    cdpDeviceId: toStr(row["CDPDeviceID"]),
    cdpPortId: toStr(row["CDPPortID"]),
    cdpMgmtIp: toStr(row["CDPManagementIP"]),
    cdpSwitchAddress: toStr(row["CDPSwitchAddress"]),
    cdpPlatform: toStr(row["CDPHardwarePlatform"]),
    cdpSoftware: toStr(row["CDPSoftwareVersion"]),
    nativeVlan: toStr(row["CDPNativeVLAN"]),
    mtu: toStr(row["CDPMTU"]),
    cdpAvailable: toBool(row["CDPAvailable"]),
    queryStatus: toStr(row["QueryStatus"]),
  };
}

export function buildHostAdapterKey(host: string, adapter: string): string {
  return `${normalizeVmNameForMatch(host)}::${adapter.trim().toLowerCase()}`;
}

/** vCenter-Anzeigename → vcenterId, identische Konvention wie beim RVTools-Import. */
export function normalizeVcenterId(vcenterName: string): string {
  return vcenterName.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "_") || "unknown-vcenter";
}
```

- [ ] **Step 5: Tests laufen lassen — sie müssen bestehen**

Run: `npx vitest run src/test/cdpImport.test.ts src/test/parseHelpers.test.ts`
Expected: PASS

- [ ] **Step 6: `normalizeVcenterId` im RVTools-Import wiederverwenden**

In `src/domain/services/importService.ts` Zeile 473 ersetzen:

```ts
  const vcenterId = normalizeVcenterId(vcenterDisplayName);
```

und `normalizeVcenterId` zum Import-Block aus `@/lib/xlsx/parseHelpers` (Zeile 19–31) hinzufügen.

- [ ] **Step 7: Typecheck + alle Tests**

Run: `npm run typecheck && npm test`
Expected: PASS (keine Regression)

- [ ] **Step 8: Commit**

```bash
git add src/domain/models/types.ts src/lib/xlsx/parseHelpers.ts src/domain/services/importService.ts src/test/cdpImport.test.ts
git commit -m "feat: add CDP file kind detection and field mapping"
```

---

### Task 2: IndexedDB-Stores + CRUD + Lösch-/Rebuild-Logik

**Files:**
- Modify: `src/data/db/index.ts` (Schema ~Zeile 28–119, upgrade ~Zeile 199–214, CRUD nach Zeile 499, Labels Zeile 648, delete nach Zeile 876)
- Test: `src/data/db/index.test.ts` (erweitern)

**Interfaces:**
- Consumes: `CdpImportMeta`, `CdpRow`, `CdpLatest` (Task 1), `mapCdpDisplayFields`, `isTechInfoNewerOrEqual` (parseHelpers)
- Produces (alle exportiert aus `src/data/db/index.ts`):
  - `getCdpImportByChecksum(checksum: string): Promise<CdpImportMeta | undefined>`
  - `getCdpImports(): Promise<CdpImportMeta[]>` (sortiert nach `importedAt` absteigend)
  - `putCdpImport(meta: CdpImportMeta): Promise<void>`
  - `batchPutCdpRows(items: CdpRow[], batchSize?: number): Promise<void>`
  - `batchPutCdpLatest(items: CdpLatest[], batchSize?: number): Promise<void>`
  - `getAllCdpLatest(): Promise<CdpLatest[]>`
  - `getCdpLatestByHostAdapterKeys(keys: string[]): Promise<CdpLatest[]>`
  - `estimateCdpImportSizesBytes(importIds: string[]): Promise<Record<string, number>>`
  - `deleteCdpImport(cdpImportId: string): Promise<void>`

- [ ] **Step 1: Failing Test schreiben**

In `src/data/db/index.test.ts` ans Ende anfügen (Spiegel des Tech-Info-Tests ab Zeile 219):

```ts
describe("CDP import listing and deletion", () => {
  const makeLatest = (over: Partial<import("@/domain/models/types").CdpLatest>) => ({
    hostAdapterKey: "esx01::vmnic0",
    hostNorm: "esx01",
    host: "esx01",
    adapter: "vmnic0",
    importedAt: "2026-01-02T00:00:00.000Z",
    cdpImportId: "cdp-new",
    rowIndex: 0,
    vcenter: null, cluster: null, hostConnectionState: null, linkStatus: null,
    mac: null, cdpDeviceId: null, cdpPortId: null, cdpMgmtIp: null,
    cdpSwitchAddress: null, cdpPlatform: null, cdpSoftware: null,
    nativeVlan: null, mtu: null, cdpAvailable: null, queryStatus: null,
    ...over,
  });

  it("lists CDP imports and restores older latest rows after deleting the newest import", async () => {
    const {
      batchPutCdpLatest, batchPutCdpRows, deleteCdpImport,
      getCdpImports, getAllCdpLatest, getCdpLatestByHostAdapterKeys, putCdpImport,
    } = await import("./index");

    await putCdpImport({
      cdpImportId: "cdp-old", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp-old.csv", fileChecksum: "old", rowCount: 1, columnCount: 18,
    });
    await putCdpImport({
      cdpImportId: "cdp-new", importedAt: "2026-01-02T00:00:00.000Z",
      fileName: "cdp-new.csv", fileChecksum: "new", rowCount: 1, columnCount: 18,
    });

    await batchPutCdpRows([
      {
        cdpImportId: "cdp-old", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-01T00:00:00.000Z",
        rawData: { VMHost: "esx01", PhysicalAdapter: "vmnic0", CDPDeviceID: "switch-alt", CDPAvailable: "True" },
      },
      {
        cdpImportId: "cdp-new", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-02T00:00:00.000Z",
        rawData: { VMHost: "esx01", PhysicalAdapter: "vmnic0", CDPDeviceID: "switch-neu", CDPAvailable: "True" },
      },
    ]);
    await batchPutCdpLatest([makeLatest({ cdpDeviceId: "switch-neu", cdpAvailable: true })]);

    const imports = await getCdpImports();
    expect(imports.map((entry) => entry.cdpImportId)).toEqual(["cdp-new", "cdp-old"]);

    await deleteCdpImport("cdp-new");

    const remaining = await getCdpImports();
    expect(remaining.map((entry) => entry.cdpImportId)).toEqual(["cdp-old"]);

    const [latest] = await getCdpLatestByHostAdapterKeys(["esx01::vmnic0"]);
    expect(latest.cdpImportId).toBe("cdp-old");
    expect(latest.cdpDeviceId).toBe("switch-alt");

    const all = await getAllCdpLatest();
    expect(all).toHaveLength(1);
  });

  it("removes latest entries entirely when the only import is deleted", async () => {
    const { batchPutCdpLatest, batchPutCdpRows, deleteCdpImport, getAllCdpLatest, putCdpImport } =
      await import("./index");

    await putCdpImport({
      cdpImportId: "cdp-only", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp.csv", fileChecksum: "only", rowCount: 1, columnCount: 18,
    });
    await batchPutCdpRows([
      {
        cdpImportId: "cdp-only", rowIndex: 0, host: "esx02", hostNorm: "esx02",
        adapter: "vmnic1", hostAdapterKey: "esx02::vmnic1",
        importedAt: "2026-01-01T00:00:00.000Z",
        rawData: { VMHost: "esx02", PhysicalAdapter: "vmnic1", CDPDeviceID: "sw", CDPAvailable: "True" },
      },
    ]);
    await batchPutCdpLatest([
      makeLatest({ hostAdapterKey: "esx02::vmnic1", hostNorm: "esx02", host: "esx02", adapter: "vmnic1", cdpImportId: "cdp-only", importedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    await deleteCdpImport("cdp-only");
    await expect(getAllCdpLatest()).resolves.toHaveLength(0);
  });

  it("estimates per-import sizes and includes cdp stores in deleteAllData", async () => {
    const { putCdpImport, batchPutCdpRows, estimateCdpImportSizesBytes, deleteAllData, getCdpImports } =
      await import("./index");
    await putCdpImport({
      cdpImportId: "cdp-1", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp.csv", fileChecksum: "c1", rowCount: 2, columnCount: 18,
    });
    await batchPutCdpRows([
      {
        cdpImportId: "cdp-1", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-01T00:00:00.000Z", rawData: { VMHost: "esx01" },
      },
      {
        cdpImportId: "cdp-1", rowIndex: 1, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic1", hostAdapterKey: "esx01::vmnic1",
        importedAt: "2026-01-01T00:00:00.000Z", rawData: { VMHost: "esx01" },
      },
    ]);

    const sizes = await estimateCdpImportSizesBytes(["cdp-1", "cdp-unbekannt"]);
    expect(sizes["cdp-1"]).toBeGreaterThan(0);
    expect(sizes["cdp-unbekannt"]).toBe(0);

    await deleteAllData();
    await expect(getCdpImports()).resolves.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/data/db/index.test.ts`
Expected: FAIL — `putCdpImport` etc. nicht exportiert.

- [ ] **Step 3: Schema + Stores implementieren**

In `src/data/db/index.ts`:

1. Type-Import ergänzen (Zeile 2–24): `CdpImportMeta, CdpRow, CdpLatest` zur Import-Liste hinzufügen.
2. In `RVToolsDBSchema` nach `techinfo_client_latest` (Zeile 83) einfügen:

```ts
  cdp_imports: {
    key: string;
    value: CdpImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  cdp_rows: {
    key: [string, number];
    value: CdpRow;
    indexes: { cdpImportId: string; hostAdapterKey: string };
  };
  cdp_latest: {
    key: string;
    value: CdpLatest;
    indexes: { hostNorm: string };
  };
```

3. `StoreName` (Zeile 100) um `| "cdp_imports" | "cdp_rows" | "cdp_latest"` erweitern.
4. `DB_VERSION` (Zeile 111) auf `18` erhöhen.
5. `ALL_STORES` (Zeile 112) um `"cdp_imports", "cdp_rows", "cdp_latest"` erweitern (nach den techinfo-Stores).
6. Im `upgrade`-Callback nach dem `techinfo_client_latest`-Block (Zeile 202) einfügen:

```ts
        // v18: CDP-Netzwerkdaten (CSV-Import) — Muster wie Tech-Info.
        if (!db.objectStoreNames.contains("cdp_imports")) {
          const imports = db.createObjectStore("cdp_imports", { keyPath: "cdpImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("cdp_rows")) {
          const rows = db.createObjectStore("cdp_rows", { keyPath: ["cdpImportId", "rowIndex"] });
          rows.createIndex("cdpImportId", "cdpImportId");
          rows.createIndex("hostAdapterKey", "hostAdapterKey");
        }
        if (!db.objectStoreNames.contains("cdp_latest")) {
          const latest = db.createObjectStore("cdp_latest", { keyPath: "hostAdapterKey" });
          latest.createIndex("hostNorm", "hostNorm");
        }
```

7. `STORE_DELETE_LABELS` (Zeile 648) ergänzen:

```ts
  cdp_imports: "CDP Importe",
  cdp_rows: "CDP Zeilen",
  cdp_latest: "CDP Latest",
```

- [ ] **Step 4: CRUD-, Estimate- und Delete-Funktionen implementieren**

1. Nach `batchPutTechInfoClientLatest` (Zeile 499) einfügen:

```ts
export async function getCdpImportByChecksum(checksum: string): Promise<CdpImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("cdp_imports", "fileChecksum", checksum);
}

export async function getCdpImports(): Promise<CdpImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("cdp_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putCdpImport(meta: CdpImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("cdp_imports", meta);
}

export async function batchPutCdpRows(items: CdpRow[], batchSize = 5000): Promise<void> {
  await batchPut("cdp_rows", items, batchSize);
}

export async function batchPutCdpLatest(items: CdpLatest[], batchSize = 5000): Promise<void> {
  await batchPut("cdp_latest", items, batchSize);
}

export async function getAllCdpLatest(): Promise<CdpLatest[]> {
  const db = await getDb();
  return db.getAll("cdp_latest");
}

export async function getCdpLatestByHostAdapterKeys(keys: string[]): Promise<CdpLatest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("cdp_latest", key)));
  return values.filter((v): v is CdpLatest => Boolean(v));
}
```

2. `deleteByKeyPrefix`-Union (Zeile 689) um `"cdp_rows"` erweitern.
3. `estimateSizeByIndex`-Unions (Zeile 567–568) um `"cdp_rows"` bzw. `"cdpImportId"` erweitern.
4. Nach `estimateTechInfoClientImportSizesBytes` (Zeile 618) einfügen:

```ts
/** Geschätzte IndexedDB-Größe je CDP-Import. */
export async function estimateCdpImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "cdp_rows", "cdpImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}
```

5. Am Dateiende nach `deleteTechInfoClientImport` (Zeile 876) einfügen:

```ts
function buildCdpLatestFromRow(row: CdpRow): CdpLatest {
  return {
    hostAdapterKey: row.hostAdapterKey,
    hostNorm: row.hostNorm,
    host: row.host,
    adapter: row.adapter,
    importedAt: row.importedAt,
    cdpImportId: row.cdpImportId,
    rowIndex: row.rowIndex,
    ...mapCdpDisplayFields(row.rawData),
  };
}

async function rebuildCdpLatestForKey(hostAdapterKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("cdp_rows", "hostAdapterKey", hostAdapterKey);
  const latestRow = rows.reduce<CdpRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("cdp_latest", hostAdapterKey);
    return;
  }

  await db.put("cdp_latest", buildCdpLatestFromRow(latestRow));
}

export async function deleteCdpImport(cdpImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("cdp_rows", "cdpImportId", cdpImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.hostAdapterKey) affectedKeys.add(row.hostAdapterKey);
  }

  await db.delete("cdp_imports", cdpImportId);
  await deleteByKeyPrefix("cdp_rows", cdpImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildCdpLatestForKey(key)));
}
```

6. `mapCdpDisplayFields` zum parseHelpers-Import (Zeile 25) hinzufügen.

- [ ] **Step 5: Tests laufen lassen — müssen bestehen**

Run: `npx vitest run src/data/db/index.test.ts`
Expected: PASS (inkl. Bestandstests — `getStoreDiagnostics` zählt jetzt 23 Stores)

- [ ] **Step 6: Typecheck + Commit**

Run: `npm run typecheck`
Expected: PASS

```bash
git add src/data/db/index.ts src/data/db/index.test.ts
git commit -m "feat: add cdp_imports/cdp_rows/cdp_latest stores with rebuild-on-delete"
```

---

### Task 3: Import-Service — `importCdpCsv` + CSV-Dispatch

**Files:**
- Modify: `src/domain/services/importService.ts` (Dispatch in `importRvtoolsXlsx` Zeile 432–440, neue Funktion am Dateiende)
- Test: `src/test/cdpImport.test.ts` (erweitern)

**Interfaces:**
- Consumes: `CDP_REQUIRED_HEADERS`, `mapCdpDisplayFields`, `buildHostAdapterKey`, `normalizeVmNameForMatch`, `isTechInfoNewerOrEqual` (Task 1); `getCdpImportByChecksum`, `putCdpImport`, `batchPutCdpRows`, `batchPutCdpLatest`, `getCdpLatestByHostAdapterKeys` (Task 2)
- Produces: `importCdpCsv(file: File, checksum: string, parsed: WorkerParseResult, warnings: string[], errors: string[], report: (step: string, percent: number, detail?: string) => void): Promise<ImportResult>` (exportiert für Tests); CSV-Guard in `importRvtoolsXlsx`

- [ ] **Step 1: Failing Tests schreiben**

In `src/test/cdpImport.test.ts` ergänzen (oben `beforeEach`/`vi`-Import hinzufügen):

```ts
import { beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { WorkerParseResult } from "@/domain/models/types";

function makeParsed(rows: Record<string, unknown>[], headers = CDP_HEADERS): WorkerParseResult {
  return {
    fileKind: "cdp",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-14T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const cdpRow = (over: Record<string, unknown> = {}) => ({
  "vCenter": "vcenter1110.domain.at",
  "Cluster": "CL_LNZ_VDI_5920_2",
  "VMHost": "esxvdi5d43.domain.at",
  "HostConnectionState": "Connected",
  "PhysicalAdapter": "vmnic0",
  "LinkStatus": "Up",
  "MACAddress": "08:c0:eb:c4:c8:a0",
  "CDPDeviceID": "grznx93oc18-8.domain.at(FDO26040UFF)",
  "CDPPortID": "Ethernet1/13",
  "CDPManagementIP": "10.18.129.44",
  "CDPSwitchAddress": "192.168.125.44",
  "CDPHardwarePlatform": "N9K-C93180YC-FX3",
  "CDPSoftwareVersion": "NX-OS 9.3(9)",
  "CDPNativeVLAN": "1",
  "CDPMTU": "9216",
  "CDPAvailable": "True",
  "QueryStatus": "CDP-Daten gefunden",
  "ErrorMessage": "",
  ...over,
});

describe("importCdpCsv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("importiert Zeilen, überspringt leere Hosts/Adapter mit Warnung und befüllt cdp_latest", async () => {
    const { importCdpCsv } = await import("@/domain/services/importService");
    const { getAllCdpLatest, getCdpImports } = await import("@/data/db");

    const parsed = makeParsed([
      cdpRow(),
      cdpRow({ "PhysicalAdapter": "vmnic1", "CDPPortID": "Ethernet1/37" }),
      cdpRow({ "VMHost": "" }),
      cdpRow({ "PhysicalAdapter": null }),
    ]);
    const warnings: string[] = [];
    const result = await importCdpCsv(
      new File(["x"], "cdp.csv", { type: "text/csv" }), "chk-1", parsed, warnings, [], () => {},
    );

    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("cdp");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Zeile 3");

    const latest = await getAllCdpLatest();
    expect(latest).toHaveLength(2);
    expect(latest.map((l) => l.adapter).sort()).toEqual(["vmnic0", "vmnic1"]);
    expect(latest[0].hostNorm).toBe("esxvdi5d43.domain.at");

    const imports = await getCdpImports();
    expect(imports).toHaveLength(1);
    expect(imports[0].rowCount).toBe(4);
  });

  it("lehnt Duplikate per Checksum ab", async () => {
    const { importCdpCsv } = await import("@/domain/services/importService");
    const parsed = makeParsed([cdpRow()]);
    const file = new File(["x"], "cdp.csv", { type: "text/csv" });

    await importCdpCsv(file, "chk-dup", parsed, [], [], () => {});
    const second = await importCdpCsv(file, "chk-dup", makeParsed([cdpRow()]), [], [], () => {});

    expect(second.success).toBe(false);
    expect(second.errors[0]).toContain("bereits importiert");
  });

  it("latest wins: zweiter Import überschreibt denselben Host+Adapter", async () => {
    const { importCdpCsv } = await import("@/domain/services/importService");
    const { getAllCdpLatest } = await import("@/data/db");
    const file1 = new File(["a"], "cdp-1.csv", { type: "text/csv" });
    const file2 = new File(["b"], "cdp-2.csv", { type: "text/csv" });

    await importCdpCsv(file1, "chk-a", makeParsed([cdpRow({ "CDPPortID": "Ethernet1/13" })]), [], [], () => {});
    await importCdpCsv(file2, "chk-b", makeParsed([cdpRow({ "CDPPortID": "Ethernet1/99" })]), [], [], () => {});

    const latest = await getAllCdpLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].cdpPortId).toBe("Ethernet1/99");
  });

  it("warnt bei fehlenden optionalen Spalten", async () => {
    const { importCdpCsv } = await import("@/domain/services/importService");
    const minimalHeaders = ["VMHost", "PhysicalAdapter", "CDPDeviceID", "CDPAvailable"];
    const warnings: string[] = [];
    const result = await importCdpCsv(
      new File(["x"], "cdp.csv", { type: "text/csv" }), "chk-min",
      makeParsed(
        [{ "VMHost": "esx01", "PhysicalAdapter": "vmnic0", "CDPDeviceID": "sw", "CDPAvailable": "True" }],
        minimalHeaders,
      ),
      warnings, [], () => {},
    );
    expect(result.success).toBe(true);
    expect(warnings.some((w) => w.includes("CDPMTU"))).toBe(true);
  });
});
```

Hinweis: `CDP_HEADERS` ist die in Task 1 Step 1 definierte Konstante derselben Testdatei.

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npx vitest run src/test/cdpImport.test.ts`
Expected: FAIL — `importCdpCsv` nicht exportiert.

- [ ] **Step 3: `importCdpCsv` implementieren + Dispatch**

In `src/domain/services/importService.ts`:

1. Imports ergänzen: aus `@/data/db` zusätzlich `getCdpImportByChecksum, putCdpImport, batchPutCdpRows, batchPutCdpLatest, getCdpLatestByHostAdapterKeys`; aus `@/lib/xlsx/parseHelpers` zusätzlich `CDP_REQUIRED_HEADERS, mapCdpDisplayFields, buildHostAdapterKey`; aus types zusätzlich `CdpRow, CdpLatest`.

2. In `importRvtoolsXlsx` (Zeile 432–440) nach dem `tech-info-client`-Dispatch einfügen:

```ts
    if (parsed.fileKind === "cdp") {
      return await importCdpCsv(file, checksum, parsed, warnings, errors, report);
    }

    // CSV-Dateien, die keine CDP-Struktur haben, dürfen nicht in den RVTools-Zweig laufen.
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (isCsv) {
      return {
        success: false,
        warnings,
        errors: [...errors, "Keine gültige CDP-CSV erkannt (erwartete Spalten: VMHost, PhysicalAdapter, CDPDeviceID, CDPAvailable)."],
      };
    }
```

3. Am Dateiende (nach `importTechInfoClientXlsx`) einfügen:

```ts
const CDP_UI_HEADERS = [
  "vCenter", "Cluster", "HostConnectionState", "LinkStatus", "MACAddress",
  "CDPPortID", "CDPManagementIP", "CDPSwitchAddress", "CDPHardwarePlatform",
  "CDPSoftwareVersion", "CDPNativeVLAN", "CDPMTU", "QueryStatus",
] as const;

function findCdpSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    CDP_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

export async function importCdpCsv(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getCdpImportByChecksum(checksum);
  if (existing) {
    return {
      success: false,
      fileKind: "cdp",
      warnings: [],
      errors: ["Diese CDP-Datei wurde bereits importiert."],
    };
  }

  const cdpSheet = findCdpSheet(parsed.sheets);
  if (!cdpSheet) {
    return {
      success: false,
      fileKind: "cdp",
      warnings,
      errors: [...errors, "Keine gültige CDP-CSV erkannt (erwartete Spalten: VMHost, PhysicalAdapter, CDPDeviceID, CDPAvailable)."],
    };
  }

  for (const header of CDP_UI_HEADERS) {
    if (!cdpSheet.headers.includes(header)) {
      warnings.push(`CDP Spalte "${header}" fehlt. Wert wird als leer übernommen.`);
    }
  }

  const importedAt = new Date().toISOString();
  const cdpImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [cdpSheet.sheetName]: { rowCount: cdpSheet.rows.length, columnCount: cdpSheet.headers.length },
  };

  report("CDP Metadaten speichern", 35);
  await putCdpImport({
    cdpImportId,
    importedAt,
    fileName: file.name,
    fileChecksum: checksum,
    rowCount: cdpSheet.rows.length,
    columnCount: cdpSheet.headers.length,
  });

  report("CDP Zeilen speichern", 45, `${cdpSheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  const fullRows: CdpRow[] = [];
  const latestCandidates = new Map<string, CdpLatest>();
  for (let i = 0; i < cdpSheet.rows.length; i++) {
    const row = cdpSheet.rows[i];
    const host = toStr(row["VMHost"]);
    const adapter = toStr(row["PhysicalAdapter"]);
    if (!host || !adapter) {
      warnings.push(`CDP Zeile ${i + 1}: VMHost oder PhysicalAdapter ist leer, Zeile wurde übersprungen.`);
      continue;
    }

    const hostNorm = normalizeVmNameForMatch(host);
    const hostAdapterKey = buildHostAdapterKey(host, adapter);
    fullRows.push({
      cdpImportId,
      rowIndex: i,
      host,
      hostNorm,
      adapter,
      hostAdapterKey,
      importedAt,
      rawData: toRawRowData(row),
    });

    latestCandidates.set(hostAdapterKey, {
      hostAdapterKey,
      hostNorm,
      host,
      adapter,
      importedAt,
      cdpImportId,
      rowIndex: i,
      ...mapCdpDisplayFields(row),
    });
  }

  await batchPutCdpRows(fullRows, 5000);

  report("CDP Latest aktualisieren", 75);
  const existingLatest = await getCdpLatestByHostAdapterKeys([...latestCandidates.keys()]);
  const existingMap = new Map(existingLatest.map((entry) => [entry.hostAdapterKey, entry]));
  const latestUpdates: CdpLatest[] = [];
  for (const [key, candidate] of latestCandidates.entries()) {
    if (isTechInfoNewerOrEqual(candidate.importedAt, existingMap.get(key)?.importedAt)) {
      latestUpdates.push(candidate);
    }
  }
  if (latestUpdates.length > 0) {
    await batchPutCdpLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} CDP Zeilen`);
  return { success: true, fileKind: "cdp", warnings, errors, sheetStats };
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npx vitest run src/test/cdpImport.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + alle Tests + Commit**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/domain/services/importService.ts src/test/cdpImport.test.ts
git commit -m "feat: import CDP CSV with latest-wins per host adapter"
```

---

### Task 4: Upload-UX — CSV-Annahme, Label, Liste, Löschen

**Files:**
- Modify: `src/hooks/useImportController.tsx` (Zeile 39–52, 78)
- Modify: `src/pages/UploadSnapshots.tsx` (StoredUpload Zeile 20–23, buildStoredUploads Zeile 53–69, Queries Zeile 87–118, Delete-Handler Zeile 155–161, Input/Texte Zeile 205–208, Listen-Rendering Zeile 282–345)
- Test: `src/pages/UploadSnapshots.test.tsx` (Label-Regex anpassen)

**Interfaces:**
- Consumes: `getCdpImports`, `deleteCdpImport`, `estimateCdpImportSizesBytes` (Task 2), `CdpImportMeta` (Task 1)
- Produces: `isSupportedImportFile(file: File): boolean` (ersetzt `isSpreadsheetFile`, nur intern genutzt); `fileKindLabel("cdp") === "CDP-Netzwerkdaten"`

- [ ] **Step 1: Test anpassen (failing)**

In `src/pages/UploadSnapshots.test.tsx` Zeile 43–45 ersetzen:

```ts
    const input = screen.getByLabelText(
      /RVTools, Tech-Info oder CDP-Datei/i,
    );
```

Run: `npx vitest run src/pages/UploadSnapshots.test.tsx`
Expected: FAIL — Label existiert noch nicht.

- [ ] **Step 2: `useImportController.tsx` erweitern**

Zeile 39–46 ersetzen:

```ts
export function isSupportedImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "text/csv"
  );
}
```

Zeile 48–52 (`fileKindLabel`) ersetzen:

```ts
export function fileKindLabel(kind?: ImportFileKind): string {
  if (kind === "tech-info") return "Tech-Info Server";
  if (kind === "tech-info-client") return "Tech-Info Client";
  if (kind === "cdp") return "CDP-Netzwerkdaten";
  return "RVTools";
}
```

Zeile 78: `if (isSpreadsheetFile(file))` → `if (isSupportedImportFile(file))`.

- [ ] **Step 3: `UploadSnapshots.tsx` erweitern**

1. Imports (Zeile 4–7): `getCdpImports, deleteCdpImport, estimateCdpImportSizesBytes` ergänzen; Typ-Import `CdpImportMeta` (Zeile 18).
2. `StoredUpload` (Zeile 20–23) erweitern:

```ts
type StoredUpload =
  | { kind: "rvtools"; id: string; importedAt: string; snapshot: SnapshotMeta }
  | { kind: "tech-info"; id: string; importedAt: string; techInfo: TechInfoImportMeta }
  | { kind: "tech-info-client"; id: string; importedAt: string; techInfoClient: TechInfoClientImportMeta }
  | { kind: "cdp"; id: string; importedAt: string; cdp: CdpImportMeta };
```

3. `buildStoredUploads` (Zeile 53–69): Parameter `cdpImports: CdpImportMeta[]` ergänzen und Schleife hinzufügen:

```ts
  for (const cdp of cdpImports) {
    uploads.push({ kind: "cdp", id: cdp.cdpImportId, importedAt: cdp.importedAt, cdp });
  }
```

4. `storedUploads`-Query (Zeile 87–97): `getCdpImports()` ins `Promise.all` aufnehmen und an `buildStoredUploads` durchreichen.
5. Größen-Query (Zeile 100–118): Initial-Record um `cdp: []` erweitern, `estimateCdpImportSizesBytes(uploadIdsByKind.cdp)` ins `Promise.all`, Ergebnis-Record um `cdp` ergänzen.
6. Delete-Handler nach Zeile 161 ergänzen:

```ts
  const handleDeleteCdpImport = useCallback(async (cdpImportId: string) => {
    await runDelete(() => deleteCdpImport(cdpImportId), "CDP-Daten gelöscht.");
  }, [runDelete]);
```

7. Datei-Input (Zeile 205): `accept=".xlsx,.xls,.csv"`, `aria-label="RVTools, Tech-Info oder CDP-Datei auswählen"`.
8. Drop-Zonen-Text (Zeile 207): `"RVTools / Tech-Info (XLSX) oder CDP-CSV hierher ziehen oder klicken"`.
9. Leerlisten-Text (Zeile 283): `"Noch keine RVTools-, Tech-Info- oder CDP-Dateien importiert."`
10. Listen-Rendering (Zeile 286–345): `title`/`rowCount`-Ternaries auf `switch`-freundliche Helfer umstellen:

```ts
              const title = upload.kind === "rvtools" ? upload.snapshot.fileName
                : upload.kind === "tech-info" ? upload.techInfo.fileName
                : upload.kind === "tech-info-client" ? upload.techInfoClient.fileName
                : upload.cdp.fileName;
              const rowCount = upload.kind === "rvtools"
                ? Object.values(upload.snapshot.sheetStats).reduce((sum, v) => sum + v.rowCount, 0)
                : upload.kind === "tech-info" ? upload.techInfo.rowCount
                : upload.kind === "tech-info-client" ? upload.techInfoClient.rowCount
                : upload.cdp.rowCount;
```

Detail-Zeile (Zeile 313–321): dritter Zweig für CDP (kein Sheet-Name vorhanden):

```tsx
                        {upload.kind === "rvtools" ? (
                          <p className="text-xs text-muted-foreground">
                            vCenter: {upload.snapshot.vcenterDisplayName} · Export: {new Date(upload.snapshot.exportTs).toLocaleString("de-DE")} · Import: {new Date(upload.snapshot.importedAt).toLocaleString("de-DE")}
                          </p>
                        ) : upload.kind === "cdp" ? (
                          <p className="text-xs text-muted-foreground">
                            Import: {new Date(upload.importedAt).toLocaleString("de-DE")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Sheet: {upload.kind === "tech-info" ? upload.techInfo.sheetName : upload.techInfoClient.sheetName} · Import: {new Date(upload.importedAt).toLocaleString("de-DE")}
                          </p>
                        )}
```

Delete-`onClick` (Zeile 333–337) erweitern:

```tsx
                      onClick={() => {
                        if (upload.kind === "tech-info") void handleDeleteTechInfoImport(upload.id);
                        else if (upload.kind === "tech-info-client") void handleDeleteTechInfoClientImport(upload.id);
                        else if (upload.kind === "cdp") void handleDeleteCdpImport(upload.id);
                        else void handleDeleteSnapshot(upload.id);
                      }}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npx vitest run src/pages/UploadSnapshots.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + Lint + Commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS

```bash
git add src/hooks/useImportController.tsx src/pages/UploadSnapshots.tsx src/pages/UploadSnapshots.test.tsx
git commit -m "feat: accept CDP CSV uploads and manage them in the upload list"
```

---

### Task 5: Reine Filterfunktion `filterCdpRows`

**Files:**
- Create: `src/lib/cdp.ts`
- Test: `src/test/cdpFilter.test.ts` (neu)

**Interfaces:**
- Consumes: `CdpLatest`, `FilterState` (types.ts), `normalizeVcenterId`, `normalizeVmNameForMatch` (parseHelpers)
- Produces: `type CdpFilters = Pick<FilterState, "vcenterIds" | "clusters" | "hosts">`; `filterCdpRows(rows: CdpLatest[], filters: CdpFilters): CdpLatest[]`

- [ ] **Step 1: Failing Tests schreiben**

Neue Datei `src/test/cdpFilter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterCdpRows } from "@/lib/cdp";
import type { CdpLatest } from "@/domain/models/types";

function row(over: Partial<CdpLatest>): CdpLatest {
  return {
    hostAdapterKey: "esx01::vmnic0",
    hostNorm: "esx01.domain.at",
    host: "esx01.domain.at",
    adapter: "vmnic0",
    importedAt: "2026-07-14T00:00:00.000Z",
    cdpImportId: "cdp-1",
    rowIndex: 0,
    vcenter: "vcenter1110.domain.at",
    cluster: "CL_A",
    hostConnectionState: "Connected",
    linkStatus: "Up",
    mac: null, cdpDeviceId: null, cdpPortId: null, cdpMgmtIp: null,
    cdpSwitchAddress: null, cdpPlatform: null, cdpSoftware: null,
    nativeVlan: null, mtu: null, cdpAvailable: true, queryStatus: null,
    ...over,
  };
}

const rows = [
  row({ hostAdapterKey: "a", vcenter: "vCenter1110.Domain.AT", cluster: "CL_A", hostNorm: "esx01.domain.at" }),
  row({ hostAdapterKey: "b", vcenter: "vcenter5920.rbgooe.at", cluster: "CL_B", hostNorm: "esx02.domain.at", host: "esx02.domain.at" }),
  row({ hostAdapterKey: "c", vcenter: null, cluster: null, hostNorm: "esx03.domain.at", host: "esx03.domain.at" }),
];

describe("filterCdpRows", () => {
  it("liefert alles bei leeren Filtern", () => {
    expect(filterCdpRows(rows, { vcenterIds: [], clusters: [], hosts: [] })).toHaveLength(3);
  });

  it("filtert nach vcenterIds über normalizeVcenterId (case-insensitiv)", () => {
    const result = filterCdpRows(rows, { vcenterIds: ["vcenter1110.domain.at"], clusters: [], hosts: [] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["a"]);
  });

  it("filtert nach Cluster-Namen (exakt); Zeilen ohne Cluster fallen bei aktivem Filter raus", () => {
    const result = filterCdpRows(rows, { vcenterIds: [], clusters: ["CL_B"], hosts: [] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["b"]);
  });

  it("filtert nach Hosts case-insensitiv über hostNorm", () => {
    const result = filterCdpRows(rows, { vcenterIds: [], clusters: [], hosts: ["ESX03.Domain.AT"] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["c"]);
  });

  it("kombiniert Filter mit UND-Verknüpfung", () => {
    const result = filterCdpRows(rows, { vcenterIds: ["vcenter1110.domain.at"], clusters: ["CL_B"], hosts: [] });
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/test/cdpFilter.test.ts`
Expected: FAIL — Modul `@/lib/cdp` existiert nicht.

- [ ] **Step 3: `src/lib/cdp.ts` implementieren**

```ts
import { normalizeVcenterId, normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { CdpLatest, FilterState } from "@/domain/models/types";

export type CdpFilters = Pick<FilterState, "vcenterIds" | "clusters" | "hosts">;

/**
 * Wendet den globalen Filter auf CDP-Zeilen an. CDP-Daten hängen an keinem Snapshot,
 * daher erfolgt der Abgleich über Namen aus der CSV: vCenter über die vcenterId-Konvention
 * des RVTools-Imports, Cluster exakt, Hosts case-insensitiv. Leere Filterlisten = keine
 * Einschränkung (Konvention der übrigen Panels).
 */
export function filterCdpRows(rows: CdpLatest[], filters: CdpFilters): CdpLatest[] {
  let result = rows;
  if (filters.vcenterIds.length > 0) {
    const vcenterIdSet = new Set(filters.vcenterIds);
    result = result.filter((row) => row.vcenter !== null && vcenterIdSet.has(normalizeVcenterId(row.vcenter)));
  }
  if (filters.clusters.length > 0) {
    const clusterSet = new Set(filters.clusters);
    result = result.filter((row) => row.cluster !== null && clusterSet.has(row.cluster));
  }
  if (filters.hosts.length > 0) {
    const hostSet = new Set(filters.hosts.map((host) => normalizeVmNameForMatch(host)));
    result = result.filter((row) => hostSet.has(row.hostNorm));
  }
  return result;
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run src/test/cdpFilter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cdp.ts src/test/cdpFilter.test.ts
git commit -m "feat: add pure global-filter function for CDP rows"
```

---

### Task 6: Glossar, CdpPanel und Netzwerk-Tab

**Files:**
- Modify: `src/lib/glossaries/networking.ts` (ans Dateiende)
- Modify: `src/hooks/useActiveSnapshots.ts` (neuer Hook nach `useAllTechInfoClientLatest` Zeile 207–213)
- Create: `src/pages/CdpSwitchPorts.tsx`
- Modify: `src/pages/Networking.tsx` (Tab ergänzen)

**Interfaces:**
- Consumes: `getAllCdpLatest` (Task 2), `filterCdpRows` (Task 5), `CdpLatest` (Task 1), `KpiCard`/`KpiGrid`/`VirtualTable`/`EmptyState`/`InfoTooltip` (bestehend)
- Produces: `useAllCdpLatest()` (Hook), `CdpPanel` (benannter Export), Glossar-Objekte `NET_CDP_KPI`, `NET_CDP_COLUMNS`, `NET_CDP_SECTIONS`

- [ ] **Step 1: Glossar-Einträge ergänzen**

Ans Ende von `src/lib/glossaries/networking.ts`:

```ts
/* ================================================================== */
/*  Tab „CDP/Switch-Ports"                                             */
/* ================================================================== */

const CDP = "CDP-CSV";

export const NET_CDP_KPI: Record<string, GlossaryEntry> = {
  hostsWithCdp: {
    term: "Hosts mit CDP-Daten",
    description:
      "ESX-Hosts, für die mindestens ein physischer Adapter CDP-Nachbarschaftsdaten liefert. Grundlage für die Nachvollziehbarkeit der physischen Switch-Anbindung.",
    source: `${CDP} · „VMHost" / „CDPAvailable"`,
  },
  adapters: {
    term: "Physische Adapter",
    description:
      "Anzahl aller importierten physischen Adapter (vmnic/vusb) im aktuellen Filter — eine Zeile pro Host und Adapter, neuester Import gewinnt.",
    source: `${CDP} · „PhysicalAdapter"`,
  },
  adaptersWithoutCdp: {
    term: "Adapter ohne CDP-Daten",
    description:
      "Adapter, für die keine CDP-Daten vorliegen (z. B. USB-NICs oder Ports an Switches ohne CDP). Für Uplinks an Cisco-Switches ist ein fehlender CDP-Eintrag ein Hinweis auf deaktiviertes CDP oder einen inaktiven Link.",
    source: `${CDP} · „CDPAvailable"`,
  },
  switches: {
    term: "Eindeutige Switches",
    description:
      "Anzahl unterschiedlicher physischer Switches (CDP Device ID), an denen die gefilterten Hosts angeschlossen sind.",
    source: `${CDP} · „CDPDeviceID"`,
  },
};

export const NET_CDP_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESX-Host, zu dem der physische Adapter gehört.",
    source: `${CDP} · „VMHost"`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster-Zuordnung des Hosts laut CDP-Export.",
    source: `${CDP} · „Cluster"`,
  },
  adapter: {
    term: "Adapter",
    description: "Physischer Netzwerkadapter des Hosts (vmnic/vusb).",
    source: `${CDP} · „PhysicalAdapter"`,
  },
  linkStatus: {
    term: "Link",
    description: "Link-Status des Adapters zum Zeitpunkt des Exports (Up/Down).",
    source: `${CDP} · „LinkStatus"`,
  },
  cdpDeviceId: {
    term: "Switch",
    description: "CDP Device ID des angeschlossenen Switches. Tooltip zeigt die Software-Version.",
    source: `${CDP} · „CDPDeviceID"`,
  },
  cdpPortId: {
    term: "Port",
    description: "Switch-Port, an dem der Adapter angeschlossen ist.",
    source: `${CDP} · „CDPPortID"`,
  },
  nativeVlan: {
    term: "Native VLAN",
    description: "Native (untagged) VLAN des Switch-Ports laut CDP.",
    source: `${CDP} · „CDPNativeVLAN"`,
  },
  mtu: {
    term: "MTU",
    description: "MTU des Switch-Ports laut CDP. Abweichungen innerhalb eines Clusters deuten auf inkonsistente Jumbo-Frame-Konfiguration hin.",
    source: `${CDP} · „CDPMTU"`,
  },
  cdpPlatform: {
    term: "Plattform",
    description: "Hardware-Plattform des Switches (z. B. Nexus-Modell).",
    source: `${CDP} · „CDPHardwarePlatform"`,
  },
  cdpMgmtIp: {
    term: "Mgmt-IP",
    description: "Management-IP-Adresse des Switches laut CDP.",
    source: `${CDP} · „CDPManagementIP"`,
  },
  mac: {
    term: "MAC",
    description: "MAC-Adresse des physischen Adapters.",
    source: `${CDP} · „MACAddress"`,
  },
};

export const NET_CDP_SECTIONS: Record<string, GlossaryEntry> = {
  table: {
    term: "Switch-Ports pro Adapter",
    description:
      "Eine Zeile pro Host und physischem Adapter mit der per CDP ermittelten Switch-Anbindung. Bei mehreren Importen gewinnt je Host+Adapter der neueste Stand.",
    source: `${CDP} · neuester Import je Host+Adapter`,
  },
};
```

- [ ] **Step 2: Hook `useAllCdpLatest` ergänzen**

In `src/hooks/useActiveSnapshots.ts`: `getAllCdpLatest` zum Import aus `@/data/db` (Zeile 3) hinzufügen; nach `useAllTechInfoClientLatest` (Zeile 213) einfügen:

```ts
export function useAllCdpLatest() {
  return useQuery({
    queryKey: ["cdpLatestAll"],
    queryFn: getAllCdpLatest,
    staleTime: STALE_MS,
  });
}
```

- [ ] **Step 3: `CdpPanel` implementieren**

Neue Datei `src/pages/CdpSwitchPorts.tsx`:

```tsx
import { useMemo } from "react";
import { Cable, HelpCircle, Router, Server } from "lucide-react";
import { useActiveSnapshotIds, useAllCdpLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { filterCdpRows } from "@/lib/cdp";
import { NET_CDP_KPI, NET_CDP_COLUMNS, NET_CDP_SECTIONS } from "@/lib/glossaries/networking";
import type { CdpLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const columns: ColumnDef<CdpLatest, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_CDP_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_CDP_COLUMNS.cluster }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "adapter", header: "Adapter", meta: { info: NET_CDP_COLUMNS.adapter }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  {
    accessorKey: "linkStatus",
    header: "Link",
    meta: { info: NET_CDP_COLUMNS.linkStatus },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return "—";
      return <span className={v.toLowerCase() === "up" ? "" : "text-warning font-semibold"}>{v}</span>;
    },
  },
  {
    accessorKey: "cdpDeviceId",
    header: "Switch",
    meta: { info: NET_CDP_COLUMNS.cdpDeviceId },
    cell: ({ row, getValue }) => {
      const v = getValue() as string | null;
      if (!v) return "—";
      return <div className="max-w-[280px] truncate" title={row.original.cdpSoftware ?? v}>{v}</div>;
    },
  },
  { accessorKey: "cdpPortId", header: "Port", meta: { info: NET_CDP_COLUMNS.cdpPortId }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "nativeVlan", header: "Native VLAN", meta: { info: NET_CDP_COLUMNS.nativeVlan }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "mtu", header: "MTU", meta: { info: NET_CDP_COLUMNS.mtu }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "cdpPlatform", header: "Plattform", meta: { info: NET_CDP_COLUMNS.cdpPlatform }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "cdpMgmtIp", header: "Mgmt-IP", meta: { info: NET_CDP_COLUMNS.cdpMgmtIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_CDP_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

export function CdpPanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: allRows = [] } = useAllCdpLatest();

  const rows = useMemo(() => filterCdpRows(allRows, filters), [allRows, filters]);

  const hostsWithCdp = useMemo(
    () => new Set(rows.filter((r) => r.cdpAvailable === true).map((r) => r.hostNorm)).size,
    [rows],
  );
  const adaptersWithoutCdp = useMemo(() => rows.filter((r) => r.cdpAvailable !== true).length, [rows]);
  const switchCount = useMemo(
    () => new Set(rows.map((r) => r.cdpDeviceId).filter((v): v is string => Boolean(v))).size,
    [rows],
  );

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<Cable className="h-6 w-6" />}
        title="Keine CDP-Daten"
        description="Laden Sie eine CDP-CSV auf der Upload-Seite hoch, um die physische Switch-Anbindung auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Hosts mit CDP-Daten" value={formatNum(hostsWithCdp)} icon={<Server className="h-4 w-4" />} info={NET_CDP_KPI.hostsWithCdp} />
        <KpiCard title="Physische Adapter" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} info={NET_CDP_KPI.adapters} />
        <KpiCard title="Adapter ohne CDP-Daten" value={formatNum(adaptersWithoutCdp)} severity={adaptersWithoutCdp > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={NET_CDP_KPI.adaptersWithoutCdp} />
        <KpiCard title="Eindeutige Switches" value={formatNum(switchCount)} icon={<Router className="h-4 w-4" />} info={NET_CDP_KPI.switches} />
      </KpiGrid>

      <div>
        <InfoTooltip entry={NET_CDP_SECTIONS.table} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Switch-Ports pro Adapter ({rows.length})</h3>
        </InfoTooltip>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="cdp-switch-ports" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tab in `Networking.tsx` ergänzen**

In `src/pages/Networking.tsx`:

```tsx
import { CdpPanel } from "@/pages/CdpSwitchPorts";

type NetworkTab = "security" | "host" | "vlan" | "cdp";
```

In der `TabsList` (nach dem VLAN-Trigger, Zeile 38):

```tsx
          <TabsTrigger value="cdp">CDP/Switch-Ports</TabsTrigger>
```

Nach dem VLAN-`TabsContent` (Zeile 51):

```tsx
        <TabsContent value="cdp" className="space-y-4">
          <CdpPanel />
        </TabsContent>
```

- [ ] **Step 5: Typecheck + Lint + alle Tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/glossaries/networking.ts src/hooks/useActiveSnapshots.ts src/pages/CdpSwitchPorts.tsx src/pages/Networking.tsx
git commit -m "feat: add CDP switch-port tab with KPIs and adapter table"
```

---

### Task 7: End-to-End-Verifikation im Browser

**Files:**
- Keine Quellcode-Änderungen erwartet (nur Fixes, falls die Verifikation Fehler aufdeckt)

**Interfaces:**
- Consumes: komplette Feature-Kette aus Task 1–6

- [ ] **Step 1: Test-CSV erzeugen**

Im Scratchpad (nicht im Repo!) eine Datei `cdp-test.csv` mit exakt diesem Inhalt anlegen (UTF-8):

```csv
"vCenter";"Cluster";"VMHost";"HostConnectionState";"PhysicalAdapter";"LinkStatus";"MACAddress";"CDPDeviceID";"CDPPortID";"CDPManagementIP";"CDPSwitchAddress";"CDPHardwarePlatform";"CDPSoftwareVersion";"CDPNativeVLAN";"CDPMTU";"CDPAvailable";"QueryStatus";"ErrorMessage"
"vcenter5920.rbgooe.at";"CL_LNZ_VDI_5920_2";"esxvdi5d43.domain.at";"Connected";"vmnic0";"Up";"08:c0:eb:c4:c8:a0";"grznx93oc18-8.domain.at(FDO26040UFF)";"Ethernet1/13";"10.18.129.44";"192.168.125.44";"N9K-C93180YC-FX3";"Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)";"1";"9216";"True";"CDP-Daten gefunden";""
"vcenter1110.domain.at";"CL_LNZ_VDI_5920_2";"esxvdi5d43.domain.at";"Connected";"vmnic1";"Up";"08:c0:eb:c4:c8:a1";"grznx93oc18-8.domain.at(FDO26040UFF)";"Ethernet1/37";"10.18.129.44";"192.168.125.44";"N9K-C93180YC-FX3";"Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)";"1";"9216";"True";"CDP-Daten gefunden";""
"vcenter1110.domain.at";"CL_LNZ_VDI_5920_2";"esxvdi5d43.domain.at";"Connected";"vmnic2";"Up";"10:70:fd:43:d1:50";"grznx93oc18-7.domain.at(FDO260416S5)";"Ethernet1/13";"10.18.129.43";"192.168.125.43";"N9K-C93180YC-FX3";"Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)";"1";"9216";"True";"CDP-Daten gefunden";""
"vcenter1110.domain.at";"CL_LNZ_VDI_5920_2";"esxvdi5d43.domain.at";"Connected";"vmnic3";"Up";"10:70:fd:43:d1:51";"grznx93oc18-7.domain.at(FDO260416S5)";"Ethernet1/37";"10.18.129.43";"192.168.125.43";"N9K-C93180YC-FX3";"Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)";"1";"9216";"True";"CDP-Daten gefunden";""
"vcenter1110.domain.at";"CL_LNZ_VDI_5920_2";"esxvdi5d43.domain.at";"Connected";"vusb0";"Up";"22:c4:b6:34:04:1f";"";"";"";"";"";"";"";"";"False";"Keine CDP-Daten";""
```

- [ ] **Step 2: Dev-Server starten und manuell prüfen**

Run: `npm run dev` (Dev-Server läuft auf **Port 8080**, nicht 5173)

Prüfschritte im Browser (bei Bedarf via Chrome-DevTools-MCP):
1. Upload-Seite: `cdp-test.csv` per Drag&Drop hochladen → Erfolgs-Toast mit Label „CDP-Netzwerkdaten"; Datei erscheint in „Gespeicherte Uploads" mit Zeilenzahl und Größe. (Voraussetzung: mindestens ein RVTools-Snapshot ist importiert, sonst bleibt die Netzwerk-Seite im EmptyState.)
2. Netzwerk-Seite → Tab „CDP/Switch-Ports": 4 KPIs plausibel (1 Host mit CDP, 5 Adapter, 1 ohne CDP, 2 Switches), Tabelle zeigt 5 Zeilen, vusb0 mit „—"-Werten.
3. Suchfeld: Eingabe „Ethernet1/37" filtert die Tabelle auf 2 Zeilen.
4. Dieselbe CSV erneut hochladen → Fehler-Toast „bereits importiert".
5. Beliebige Nicht-CDP-CSV hochladen → Fehler-Toast „Keine gültige CDP-CSV erkannt …".
6. Upload-Seite: CDP-Eintrag löschen → Tab zeigt wieder den Leerzustand mit Upload-Link.

- [ ] **Step 3: Gesamte Suite + Build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: alles PASS, Build ohne Fehler

- [ ] **Step 4: Abschluss-Commit (falls Fixes anfielen)**

```bash
git add -A
git commit -m "fix: address findings from CDP end-to-end verification"
```

Falls keine Änderungen: Schritt überspringen.
