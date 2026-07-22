# Eramon-Netzwerkdaten-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei neue Semikolon-CSV-Importe (`Eramon_Device_InterfaceDaten` = Switch-Port-Inventar, `Eramon_L2_Daten` = MAC-Tabelle) über die bestehende Upload-Seite importierbar machen und je in einem eigenen Netzwerk-Tab als durchsuchbare Tabelle mit KPIs anzeigen.

**Architecture:** Beide Importe folgen exakt dem etablierten CDP-Import-Muster: XLSX-Worker parst die CSV → `detectParsedFileKind` erkennt den Typ → `import…Csv` schreibt Meta/Rows/Latest in je drei IndexedDB-Stores → ein exportiertes Panel liest via React-Query-Hook aus dem `_latest`-Store. Switch/Port-Schlüssel werden mit denselben Normalisierungs-Helfern wie CDP gebildet (Vorbereitung späterer Joins).

**Tech Stack:** React 18 + TypeScript, TanStack Query, TanStack Table (`VirtualTable`), `idb` (IndexedDB), `@e965/xlsx` (Worker-Parser), Vitest + `fake-indexeddb`.

## Global Constraints

- Import-Muster **immer** CDP spiegeln (`importCdpCsv`, `deleteCdpImport`, `getAllCdpLatest`, `estimateCdpImportSizesBytes`, `rebuildCdpLatestForKey`).
- Schlüssel-Normalisierung ausschließlich über `normalizeVmNameForMatch` (trim + lowercase) plus `::`-Trenner — keine eigene Normalisierung erfinden.
- „latest wins" über `isTechInfoNewerOrEqual(candidate.importedAt, existing?.importedAt)`.
- Alle Anzeigefelder sind `string | null` (leer ⇒ `null` via `toStr`), Bandbreite `number | null` (via `toNumber`).
- UI-Texte auf Deutsch; leere Zellen als `„—"`.
- Kein Eingriff in den globalen Snapshot-Filter — Eramon-Panels reagieren nur auf `filters.search`.
- Nach jedem Task: relevante Tests grün. Am Ende zusätzlich `npm run lint` und `npm run build`.
- Commits klein und häufig, je abgeschlossenem Task mindestens einer.

---

## File Structure

**Neue Dateien:**
- `src/lib/eramon.ts` — reine Formatter-Funktion `formatBandwidth`.
- `src/pages/EramonIfacePanel.tsx` — Panel „Switch-Ports (Eramon)".
- `src/pages/EramonL2Panel.tsx` — Panel „MAC-Tabelle (Eramon)".
- `src/test/eramonHelpers.test.ts` — Tests für Detection/Maps/Keys/Status/Formatter.
- `src/test/eramonIfaceImport.test.ts` — Import-Tests Interface-Quelle.
- `src/test/eramonL2Import.test.ts` — Import-Tests L2-Quelle.

**Geänderte Dateien:**
- `src/domain/models/types.ts` — `ImportFileKind` + 6 neue Store-Typen.
- `src/lib/xlsx/parseHelpers.ts` — `ParsedFileKind`, Header-Konstanten, Detection, Display-Maps, Key-Builder, Status-Map.
- `src/data/db/index.ts` — Schema v24 (6 Stores), Unions, Labels, DB-Helper (beide Quellen).
- `src/domain/services/importService.ts` — `importEramonIfaceCsv`, `importEramonL2Csv`, Dispatch.
- `src/hooks/useActiveSnapshots.ts` — zwei Latest-Hooks.
- `src/hooks/useImportController.tsx` — `fileKindLabel`.
- `src/lib/glossaries/networking.ts` — Glossar-Einträge + Tab-Tooltips.
- `src/pages/Networking.tsx` — zwei Tabs.
- `src/pages/UploadSnapshots.tsx` — StoredUpload-Verdrahtung (beide Quellen).

---

## Task 1: Foundation — Detection, Maps, Keys, Status, Formatter

**Files:**
- Modify: `src/domain/models/types.ts:3`
- Modify: `src/lib/xlsx/parseHelpers.ts` (Typ Zeile 18; neue Exporte nach Zeile 266)
- Create: `src/lib/eramon.ts`
- Test: `src/test/eramonHelpers.test.ts`

**Interfaces:**
- Consumes: `toStr`, `toNumber`, `normalizeVmNameForMatch` (bestehend in `parseHelpers.ts`).
- Produces:
  - `ImportFileKind` / `ParsedFileKind` erweitert um `"eramon-iface"` und `"eramon-l2"`.
  - `ERAMON_IFACE_REQUIRED_HEADERS`, `ERAMON_L2_REQUIRED_HEADERS` (`readonly string[]`).
  - `interface EramonIfaceDisplayFields { portDesc: string | null; bandbreiteBps: number | null; portStatus: string | null; statusLabel: string | null }`
  - `mapEramonIfaceDisplayFields(row: Record<string, unknown>): EramonIfaceDisplayFields`
  - `interface EramonL2DisplayFields { ip: string | null; dnsName: string | null; type: string | null; interfaceDescription: string | null }`
  - `mapEramonL2DisplayFields(row: Record<string, unknown>): EramonL2DisplayFields`
  - `mapEramonPortStatus(raw: unknown): { portStatus: string | null; statusLabel: string | null }`
  - `buildEramonSwitchPortKey(deviceName: string, portName: string): string`
  - `buildEramonL2Key(name: string, interfaceName: string, mac: string, vlan: string): string`
  - `formatBandwidth(bps: number | null): string` (aus `@/lib/eramon`)

- [ ] **Step 1: Write the failing test**

Create `src/test/eramonHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapEramonIfaceDisplayFields,
  mapEramonL2DisplayFields,
  mapEramonPortStatus,
  buildEramonSwitchPortKey,
  buildEramonL2Key,
  ERAMON_IFACE_REQUIRED_HEADERS,
  ERAMON_L2_REQUIRED_HEADERS,
} from "@/lib/xlsx/parseHelpers";
import { formatBandwidth } from "@/lib/eramon";

describe("detectParsedFileKind (Eramon)", () => {
  it("erkennt Eramon-Interface an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: [...ERAMON_IFACE_REQUIRED_HEADERS] }])).toBe("eramon-iface");
  });
  it("erkennt Eramon-L2 an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: [...ERAMON_L2_REQUIRED_HEADERS] }])).toBe("eramon-l2");
  });
  it("verwechselt L2 nicht mit Interface", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: ["ip", "name", "interface", "mac", "dnsname", "vlan"] }])).toBe("eramon-l2");
  });
  it("fällt bei fremden Headern auf rvtools zurück", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: ["foo", "bar"] }])).toBe("rvtools");
  });
});

describe("mapEramonPortStatus", () => {
  it("mappt 1 auf aktiv und 2 auf down", () => {
    expect(mapEramonPortStatus(1)).toEqual({ portStatus: "1", statusLabel: "aktiv" });
    expect(mapEramonPortStatus("2")).toEqual({ portStatus: "2", statusLabel: "down" });
  });
  it("übernimmt unbekannte Werte roh und leere als null", () => {
    expect(mapEramonPortStatus("7")).toEqual({ portStatus: "7", statusLabel: "7" });
    expect(mapEramonPortStatus("")).toEqual({ portStatus: null, statusLabel: null });
  });
});

describe("mapEramonIfaceDisplayFields", () => {
  it("parst Bandbreite aus wiss. Notation und aus Zahl", () => {
    expect(mapEramonIfaceDisplayFields({ port_desc: "SERVER_A", bandbreite: "1E+11", port_status: "1" })).toEqual({
      portDesc: "SERVER_A", bandbreiteBps: 100000000000, portStatus: "1", statusLabel: "aktiv",
    });
    expect(mapEramonIfaceDisplayFields({ port_desc: "", bandbreite: 25000000000, port_status: "2" })).toEqual({
      portDesc: null, bandbreiteBps: 25000000000, portStatus: "2", statusLabel: "down",
    });
  });
  it("liefert null-Bandbreite bei leerem Wert", () => {
    expect(mapEramonIfaceDisplayFields({ bandbreite: "", port_status: "1" }).bandbreiteBps).toBeNull();
  });
});

describe("mapEramonL2DisplayFields", () => {
  it("mappt IP/DNS/type/interfacedescription", () => {
    expect(mapEramonL2DisplayFields({ ip: "10.18.3.14", dnsname: "host.at", type: "dynamic", interfacedescription: "uplink" })).toEqual({
      ip: "10.18.3.14", dnsName: "host.at", type: "dynamic", interfaceDescription: "uplink",
    });
  });
  it("liefert null für fehlende Felder", () => {
    expect(mapEramonL2DisplayFields({ ip: "10.0.0.1" })).toEqual({
      ip: "10.0.0.1", dnsName: null, type: null, interfaceDescription: null,
    });
  });
});

describe("buildEramonSwitchPortKey", () => {
  it("normalisiert Switch und Port (trim + lowercase)", () => {
    expect(buildEramonSwitchPortKey(" GRZNX93OC3-1.domain.at ", " Ethernet1/53 ")).toBe("grznx93oc3-1.domain.at::ethernet1/53");
  });
});

describe("buildEramonL2Key", () => {
  it("kombiniert Switch, Interface, MAC und VLAN", () => {
    expect(buildEramonL2Key(" GRZ ", " Ethernet1/24 ", " E1:69:BA:54:49:F1 ", " 303 ")).toBe("grz::ethernet1/24::e1:69:ba:54:49:f1::303");
  });
});

describe("formatBandwidth", () => {
  it("formatiert bps als Gbit/s, Mbit/s und —", () => {
    expect(formatBandwidth(100000000000)).toBe("100 Gbit/s");
    expect(formatBandwidth(25000000000)).toBe("25 Gbit/s");
    expect(formatBandwidth(200000000000)).toBe("200 Gbit/s");
    expect(formatBandwidth(1000000000)).toBe("1 Gbit/s");
    expect(formatBandwidth(500000000)).toBe("500 Mbit/s");
    expect(formatBandwidth(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/eramonHelpers.test.ts`
Expected: FAIL — Importe `ERAMON_IFACE_REQUIRED_HEADERS`, `formatBandwidth` etc. nicht gefunden.

- [ ] **Step 3: Erweitere `ImportFileKind`**

In `src/domain/models/types.ts` Zeile 3 ersetzen:

```ts
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam" | "switch" | "eramon-iface" | "eramon-l2";
```

- [ ] **Step 4: Erweitere `ParsedFileKind` und ergänze die Eramon-Helfer in `parseHelpers.ts`**

`src/lib/xlsx/parseHelpers.ts` Zeile 18 ersetzen:

```ts
export type ParsedFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam" | "switch" | "eramon-iface" | "eramon-l2";
```

Nach der `CDP_REQUIRED_HEADERS`-Zeile (Zeile 30) ergänzen:

```ts
export const ERAMON_IFACE_REQUIRED_HEADERS = ["device_name", "port_name", "port_status"] as const;
export const ERAMON_L2_REQUIRED_HEADERS = ["name", "interface", "mac", "vlan"] as const;
```

In `detectParsedFileKind` (nach dem IPAM-Block, vor `return "rvtools";` bei Zeile 104) einfügen:

```ts
  const hasEramonIfaceHeaders = sheets.some((sheet) =>
    ERAMON_IFACE_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasEramonIfaceHeaders) return "eramon-iface";

  const hasEramonL2Headers = sheets.some((sheet) =>
    ERAMON_L2_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasEramonL2Headers) return "eramon-l2";
```

Nach `buildSwitchInterfaceKey` (Zeile 266) anfügen:

```ts
export interface EramonIfaceDisplayFields {
  portDesc: string | null;
  bandbreiteBps: number | null;
  portStatus: string | null;
  statusLabel: string | null;
}

/** Port-Status-Rohwerte: 1 = aktiv/up, 2 = down. Unbekannte Werte werden roh übernommen. */
export function mapEramonPortStatus(raw: unknown): { portStatus: string | null; statusLabel: string | null } {
  const s = toStr(raw);
  if (s === null) return { portStatus: null, statusLabel: null };
  if (s === "1") return { portStatus: "1", statusLabel: "aktiv" };
  if (s === "2") return { portStatus: "2", statusLabel: "down" };
  return { portStatus: s, statusLabel: s };
}

export function mapEramonIfaceDisplayFields(row: Record<string, unknown>): EramonIfaceDisplayFields {
  const status = mapEramonPortStatus(row["port_status"]);
  return {
    portDesc: toStr(row["port_desc"]),
    bandbreiteBps: toNumber(row["bandbreite"]),
    portStatus: status.portStatus,
    statusLabel: status.statusLabel,
  };
}

export interface EramonL2DisplayFields {
  ip: string | null;
  dnsName: string | null;
  type: string | null;
  interfaceDescription: string | null;
}

export function mapEramonL2DisplayFields(row: Record<string, unknown>): EramonL2DisplayFields {
  return {
    ip: toStr(row["ip"]),
    dnsName: toStr(row["dnsname"]),
    type: toStr(row["type"]),
    interfaceDescription: toStr(row["interfacedescription"]),
  };
}

export function buildEramonSwitchPortKey(deviceName: string, portName: string): string {
  return `${normalizeVmNameForMatch(deviceName)}::${portName.trim().toLowerCase()}`;
}

export function buildEramonL2Key(name: string, interfaceName: string, mac: string, vlan: string): string {
  return `${normalizeVmNameForMatch(name)}::${interfaceName.trim().toLowerCase()}::${mac.trim().toLowerCase()}::${vlan.trim()}`;
}
```

- [ ] **Step 5: Erstelle `src/lib/eramon.ts`**

```ts
/** Formatiert eine Bandbreite in bps human-readable (z. B. 100000000000 → "100 Gbit/s"). */
function formatBwNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatBandwidth(bps: number | null): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return "—";
  if (bps >= 1_000_000_000) return `${formatBwNumber(bps / 1_000_000_000)} Gbit/s`;
  if (bps >= 1_000_000) return `${formatBwNumber(bps / 1_000_000)} Mbit/s`;
  if (bps >= 1_000) return `${formatBwNumber(bps / 1_000)} kbit/s`;
  return `${bps} bit/s`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- src/test/eramonHelpers.test.ts`
Expected: PASS (alle Blöcke grün).

- [ ] **Step 7: Commit**

```bash
git add src/domain/models/types.ts src/lib/xlsx/parseHelpers.ts src/lib/eramon.ts src/test/eramonHelpers.test.ts
git commit -m "feat: eramon parse helpers (detection, maps, keys, bandwidth format)"
```

---

## Task 2: Domain-Typen & DB-Schema (beide Quellen)

**Files:**
- Modify: `src/domain/models/types.ts` (nach `CdpLatest`, Zeile 218)
- Modify: `src/data/db/index.ts` (Schema, Unions, Labels, Migration)
- Test: `src/test/eramonDb.test.ts` (neu)

**Interfaces:**
- Consumes: nichts aus Task 1 zur Laufzeit (nur Typ-Ergänzungen).
- Produces (Typen in `types.ts`):
  - `EramonIfaceImportMeta { ifaceImportId; importedAt; fileName; fileChecksum; rowCount; switchCount }` (alle `string` außer `rowCount`/`switchCount`: `number`)
  - `EramonIfaceRow { ifaceImportId: string; rowIndex: number; deviceName: string; switchNorm: string; portName: string; switchPortKey: string; importedAt: string; rawData: Record<string, string | number | boolean | null> }`
  - `EramonIfaceLatest { switchPortKey: string; switchNorm: string; deviceName: string; portName: string; importedAt: string; ifaceImportId: string; rowIndex: number; portDesc: string | null; bandbreiteBps: number | null; portStatus: string | null; statusLabel: string | null }`
  - `EramonL2ImportMeta { l2ImportId; importedAt; fileName; fileChecksum; rowCount; switchCount }`
  - `EramonL2Row { l2ImportId: string; rowIndex: number; switchName: string; switchNorm: string; interface: string; mac: string; vlan: string; l2EntryKey: string; importedAt: string; rawData: Record<string, string | number | boolean | null> }`
  - `EramonL2Latest { l2EntryKey: string; switchNorm: string; switchName: string; interface: string; mac: string; vlan: string; importedAt: string; l2ImportId: string; rowIndex: number; ip: string | null; dnsName: string | null; type: string | null; interfaceDescription: string | null }`
- Produces (Stores in DB): `eramon_iface_imports`, `eramon_iface_rows`, `eramon_iface_latest`, `eramon_l2_imports`, `eramon_l2_rows`, `eramon_l2_latest`.

- [ ] **Step 1: Write the failing test**

Create `src/test/eramonDb.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";

describe("Eramon-DB-Schema", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("legt die sechs Eramon-Stores an", async () => {
    const { getDb } = await import("@/data/db");
    const db = await getDb();
    const names = Array.from(db.objectStoreNames);
    for (const store of [
      "eramon_iface_imports", "eramon_iface_rows", "eramon_iface_latest",
      "eramon_l2_imports", "eramon_l2_rows", "eramon_l2_latest",
    ]) {
      expect(names).toContain(store);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/eramonDb.test.ts`
Expected: FAIL — Stores nicht enthalten (Schema noch v23).

- [ ] **Step 3: Ergänze die Store-Typen in `types.ts`**

Nach `CdpLatest` (Zeile 218) einfügen:

```ts
export interface EramonIfaceImportMeta {
  ifaceImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface EramonIfaceRow {
  ifaceImportId: string;
  rowIndex: number;
  deviceName: string;
  switchNorm: string;
  portName: string;
  /** `${switchNorm}::${portNorm}` — Primärschlüssel in eramon_iface_latest, Index in eramon_iface_rows. */
  switchPortKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface EramonIfaceLatest {
  switchPortKey: string;
  switchNorm: string;
  deviceName: string;
  portName: string;
  importedAt: string;
  ifaceImportId: string;
  rowIndex: number;
  portDesc: string | null;
  bandbreiteBps: number | null;
  portStatus: string | null;
  statusLabel: string | null;
}

export interface EramonL2ImportMeta {
  l2ImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface EramonL2Row {
  l2ImportId: string;
  rowIndex: number;
  switchName: string;
  switchNorm: string;
  interface: string;
  mac: string;
  vlan: string;
  /** `${switchNorm}::${ifaceNorm}::${macNorm}::${vlan}` — Primärschlüssel in eramon_l2_latest, Index in eramon_l2_rows. */
  l2EntryKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface EramonL2Latest {
  l2EntryKey: string;
  switchNorm: string;
  switchName: string;
  interface: string;
  mac: string;
  vlan: string;
  importedAt: string;
  l2ImportId: string;
  rowIndex: number;
  ip: string | null;
  dnsName: string | null;
  type: string | null;
  interfaceDescription: string | null;
}
```

- [ ] **Step 4: Erweitere Import & Schema in `db/index.ts`**

Am Anfang von `db/index.ts` den Typ-Import um die neuen Typen ergänzen (im bestehenden `import type { … } from "@/domain/models/types"`-Block): `EramonIfaceImportMeta`, `EramonIfaceRow`, `EramonIfaceLatest`, `EramonL2ImportMeta`, `EramonL2Row`, `EramonL2Latest`.

In `interface RVToolsDBSchema` nach dem `switch_latest`-Block (Zeile 135) einfügen:

```ts
  eramon_iface_imports: {
    key: string;
    value: EramonIfaceImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  eramon_iface_rows: {
    key: [string, number];
    value: EramonIfaceRow;
    indexes: { ifaceImportId: string; switchPortKey: string };
  };
  eramon_iface_latest: {
    key: string;
    value: EramonIfaceLatest;
    indexes: { switchNorm: string };
  };
  eramon_l2_imports: {
    key: string;
    value: EramonL2ImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  eramon_l2_rows: {
    key: [string, number];
    value: EramonL2Row;
    indexes: { l2ImportId: string; l2EntryKey: string };
  };
  eramon_l2_latest: {
    key: string;
    value: EramonL2Latest;
    indexes: { switchNorm: string };
  };
```

`StoreName`-Union (Zeile 169, nach `"switch_imports" | "switch_rows" | "switch_latest"`) erweitern:

```ts
  | "eramon_iface_imports" | "eramon_iface_rows" | "eramon_iface_latest"
  | "eramon_l2_imports" | "eramon_l2_rows" | "eramon_l2_latest"
```

`DB_VERSION` (Zeile 176) auf `24` setzen:

```ts
const DB_VERSION = 24;
```

`ALL_STORES` (nach `"switch_imports", "switch_rows", "switch_latest",` Zeile 185) erweitern:

```ts
  "eramon_iface_imports", "eramon_iface_rows", "eramon_iface_latest",
  "eramon_l2_imports", "eramon_l2_rows", "eramon_l2_latest",
```

Im `upgrade`-Callback nach dem `switch_latest`-Block (Zeile 329) einfügen:

```ts
        // v24: Eramon-Netzwerkdaten (CSV-Import) — Muster wie CDP.
        if (!db.objectStoreNames.contains("eramon_iface_imports")) {
          const imports = db.createObjectStore("eramon_iface_imports", { keyPath: "ifaceImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("eramon_iface_rows")) {
          const rows = db.createObjectStore("eramon_iface_rows", { keyPath: ["ifaceImportId", "rowIndex"] });
          rows.createIndex("ifaceImportId", "ifaceImportId");
          rows.createIndex("switchPortKey", "switchPortKey");
        }
        if (!db.objectStoreNames.contains("eramon_iface_latest")) {
          const latest = db.createObjectStore("eramon_iface_latest", { keyPath: "switchPortKey" });
          latest.createIndex("switchNorm", "switchNorm");
        }
        if (!db.objectStoreNames.contains("eramon_l2_imports")) {
          const imports = db.createObjectStore("eramon_l2_imports", { keyPath: "l2ImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("eramon_l2_rows")) {
          const rows = db.createObjectStore("eramon_l2_rows", { keyPath: ["l2ImportId", "rowIndex"] });
          rows.createIndex("l2ImportId", "l2ImportId");
          rows.createIndex("l2EntryKey", "l2EntryKey");
        }
        if (!db.objectStoreNames.contains("eramon_l2_latest")) {
          const latest = db.createObjectStore("eramon_l2_latest", { keyPath: "l2EntryKey" });
          latest.createIndex("switchNorm", "switchNorm");
        }
```

`STORE_DELETE_LABELS` (nach `switch_latest: "Switch Latest",` Zeile 1140) erweitern:

```ts
  eramon_iface_imports: "Eramon Switch-Port Importe",
  eramon_iface_rows: "Eramon Switch-Port Zeilen",
  eramon_iface_latest: "Eramon Switch-Port Latest",
  eramon_l2_imports: "Eramon MAC-Tabelle Importe",
  eramon_l2_rows: "Eramon MAC-Tabelle Zeilen",
  eramon_l2_latest: "Eramon MAC-Tabelle Latest",
```

`estimateSizeByIndex`-Signatur (Zeilen 1001-1002) erweitern:

```ts
  storeName: SnapshotScopedStoreName | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "ipam_rows" | "switch_rows" | "eramon_iface_rows" | "eramon_l2_rows",
  indexName: "snapshotId" | "techInfoImportId" | "techInfoClientImportId" | "cdpImportId" | "ipamImportId" | "switchImportId" | "ifaceImportId" | "l2ImportId",
```

`deleteByKeyPrefix`-Signatur (Zeile 1166) erweitern:

```ts
  storeName: "rawSheetBlobs" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "ipam_rows" | "switch_rows" | "eramon_iface_rows" | "eramon_l2_rows",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/eramonDb.test.ts`
Expected: PASS (alle sechs Stores vorhanden).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/domain/models/types.ts src/data/db/index.ts src/test/eramonDb.test.ts
git commit -m "feat: eramon store types and idb schema v24"
```

---

## Task 3: Interface-Import (DB-Helper + importEramonIfaceCsv)

**Files:**
- Modify: `src/data/db/index.ts` (Helper nach den CDP-Helfern; Rebuild/Delete nach `deleteCdpImport`)
- Modify: `src/domain/services/importService.ts` (Import-Block, `findEramonIfaceSheet`, `importEramonIfaceCsv`, Dispatch)
- Test: `src/test/eramonIfaceImport.test.ts` (neu)

**Interfaces:**
- Consumes: `EramonIfaceImportMeta/Row/Latest` (Task 2), `mapEramonIfaceDisplayFields`, `buildEramonSwitchPortKey`, `ERAMON_IFACE_REQUIRED_HEADERS` (Task 1), bestehend `shortId`, `toRawRowData`, `normalizeVmNameForMatch`, `isTechInfoNewerOrEqual`.
- Produces (DB): `getEramonIfaceImportByChecksum`, `getEramonIfaceImports`, `putEramonIfaceImport`, `batchPutEramonIfaceRows`, `batchPutEramonIfaceLatest`, `getAllEramonIfaceLatest`, `getEramonIfaceLatestByKeys`, `deleteEramonIfaceImport`, `estimateEramonIfaceImportSizesBytes`.
- Produces (Service): `importEramonIfaceCsv(file, checksum, parsed, warnings, errors, report): Promise<ImportResult>`.

- [ ] **Step 1: Write the failing test**

Create `src/test/eramonIfaceImport.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { WorkerParseResult } from "@/domain/models/types";

const HEADERS = ["device_name", "port_name", "port_desc", "bandbreite", "port_status"];

function makeParsed(rows: Record<string, unknown>[], headers = HEADERS): WorkerParseResult {
  return {
    fileKind: "eramon-iface",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-22T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  device_name: "SWITCH_A", port_name: "Ethernet1/53",
  port_desc: "SERVER_A(vpc100-ch1)", bandbreite: "1E+11", port_status: "1", ...over,
});

describe("importEramonIfaceCsv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("importiert Zeilen, überspringt leere Switch/Port mit Warnung, parst Bandbreite", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest, getEramonIfaceImports } = await import("@/data/db");
    const warnings: string[] = [];
    const result = await importEramonIfaceCsv(
      new File(["x"], "iface.csv", { type: "text/csv" }), "chk-1",
      makeParsed([
        row(),
        row({ port_name: "Ethernet1/2", port_desc: "", bandbreite: 25000000000, port_status: "2" }),
        row({ device_name: "" }),
        row({ port_name: null }),
      ]),
      warnings, [], () => {},
    );

    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("eramon-iface");
    expect(warnings.some((w) => w.includes("Zeile 3"))).toBe(true);

    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(2);
    const active = latest.find((l) => l.portName === "Ethernet1/53")!;
    expect(active.bandbreiteBps).toBe(100000000000);
    expect(active.statusLabel).toBe("aktiv");
    const down = latest.find((l) => l.portName === "Ethernet1/2")!;
    expect(down.bandbreiteBps).toBe(25000000000);
    expect(down.statusLabel).toBe("down");

    const imports = await getEramonIfaceImports();
    expect(imports[0].switchCount).toBe(1);
  });

  it("lehnt Duplikate per Checksum ab", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const file = new File(["x"], "iface.csv", { type: "text/csv" });
    await importEramonIfaceCsv(file, "dup", makeParsed([row()]), [], [], () => {});
    const second = await importEramonIfaceCsv(file, "dup", makeParsed([row()]), [], [], () => {});
    expect(second.success).toBe(false);
    expect(second.errors[0]).toContain("bereits importiert");
  });

  it("latest wins über Importe hinweg für denselben Switch+Port", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest } = await import("@/data/db");
    await importEramonIfaceCsv(new File(["a"], "1.csv"), "a", makeParsed([row({ port_status: "1" })]), [], [], () => {});
    await importEramonIfaceCsv(new File(["b"], "2.csv"), "b", makeParsed([row({ port_status: "2" })]), [], [], () => {});
    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].statusLabel).toBe("down");
  });

  it("deleteEramonIfaceImport baut Latest aus verbleibenden Rows neu auf", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest, getEramonIfaceImports, deleteEramonIfaceImport } = await import("@/data/db");
    await importEramonIfaceCsv(new File(["a"], "1.csv"), "a", makeParsed([row({ port_status: "1" })]), [], [], () => {});
    await importEramonIfaceCsv(new File(["b"], "2.csv"), "b", makeParsed([row({ port_status: "2" })]), [], [], () => {});
    const imports = await getEramonIfaceImports();
    const newer = imports.find((i) => i.fileChecksum === "b")!;
    await deleteEramonIfaceImport(newer.ifaceImportId);
    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].statusLabel).toBe("aktiv");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/eramonIfaceImport.test.ts`
Expected: FAIL — `importEramonIfaceCsv` nicht exportiert.

- [ ] **Step 3: DB-Helper für Interface ergänzen (`db/index.ts`)**

Nach `getCdpLatestByHostAdapterKeys` (Zeile 847) einfügen:

```ts
export async function getEramonIfaceImportByChecksum(checksum: string): Promise<EramonIfaceImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("eramon_iface_imports", "fileChecksum", checksum);
}

export async function getEramonIfaceImports(): Promise<EramonIfaceImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("eramon_iface_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putEramonIfaceImport(meta: EramonIfaceImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("eramon_iface_imports", meta);
}

export async function batchPutEramonIfaceRows(items: EramonIfaceRow[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_iface_rows", items, batchSize);
}

export async function batchPutEramonIfaceLatest(items: EramonIfaceLatest[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_iface_latest", items, batchSize);
}

export async function getAllEramonIfaceLatest(): Promise<EramonIfaceLatest[]> {
  const db = await getDb();
  return db.getAll("eramon_iface_latest");
}

export async function getEramonIfaceLatestByKeys(keys: string[]): Promise<EramonIfaceLatest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("eramon_iface_latest", key)));
  return values.filter((v): v is EramonIfaceLatest => Boolean(v));
}
```

Größenschätzung nach `estimateIpamImportSizesBytes` (Zeile 1074) einfügen:

```ts
export async function estimateEramonIfaceImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "eramon_iface_rows", "ifaceImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}
```

Rebuild/Delete nach `deleteCdpImport` (Zeile 1395) einfügen:

```ts
function buildEramonIfaceLatestFromRow(row: EramonIfaceRow): EramonIfaceLatest {
  return {
    switchPortKey: row.switchPortKey,
    switchNorm: row.switchNorm,
    deviceName: row.deviceName,
    portName: row.portName,
    importedAt: row.importedAt,
    ifaceImportId: row.ifaceImportId,
    rowIndex: row.rowIndex,
    ...mapEramonIfaceDisplayFields(row.rawData),
  };
}

async function rebuildEramonIfaceLatestForKey(switchPortKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_iface_rows", "switchPortKey", switchPortKey);
  const latestRow = rows.reduce<EramonIfaceRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);
  if (!latestRow) {
    await db.delete("eramon_iface_latest", switchPortKey);
    return;
  }
  await db.put("eramon_iface_latest", buildEramonIfaceLatestFromRow(latestRow));
}

export async function deleteEramonIfaceImport(ifaceImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_iface_rows", "ifaceImportId", ifaceImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.switchPortKey) affectedKeys.add(row.switchPortKey);
  }
  await db.delete("eramon_iface_imports", ifaceImportId);
  await deleteByKeyPrefix("eramon_iface_rows", ifaceImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildEramonIfaceLatestForKey(key)));
}
```

Im `import { … } from "@/lib/xlsx/parseHelpers"`-Block von `db/index.ts` `mapEramonIfaceDisplayFields` ergänzen (wird von `buildEramonIfaceLatestFromRow` genutzt).

- [ ] **Step 4: `importEramonIfaceCsv` + Dispatch (`importService.ts`)**

Im Import-Block aus `@/lib/xlsx/parseHelpers` (ab Zeile 47) ergänzen: `ERAMON_IFACE_REQUIRED_HEADERS`, `mapEramonIfaceDisplayFields`, `buildEramonSwitchPortKey`. Im Import-Block aus `@/data/db` die neuen DB-Helfer aus Step 3 ergänzen. Im Typ-Import aus `@/domain/models/types` `EramonIfaceRow`, `EramonIfaceLatest` ergänzen.

Nach `importCdpCsv` (Ende Zeile 968) einfügen:

```ts
const ERAMON_IFACE_UI_HEADERS = ["port_desc", "bandbreite"] as const;

function findEramonIfaceSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    ERAMON_IFACE_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

export async function importEramonIfaceCsv(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getEramonIfaceImportByChecksum(checksum);
  if (existing) {
    return { success: false, fileKind: "eramon-iface", warnings: [], errors: ["Diese Eramon-Switch-Port-Datei wurde bereits importiert."] };
  }

  const sheet = findEramonIfaceSheet(parsed.sheets);
  if (!sheet) {
    return {
      success: false,
      fileKind: "eramon-iface",
      warnings,
      errors: [...errors, "Keine gültige Eramon-Switch-Port-CSV erkannt (erwartete Spalten: device_name, port_name, port_status)."],
    };
  }

  for (const header of ERAMON_IFACE_UI_HEADERS) {
    if (!sheet.headers.includes(header)) {
      warnings.push(`Eramon Spalte "${header}" fehlt. Wert wird als leer übernommen.`);
    }
  }

  const importedAt = new Date().toISOString();
  const ifaceImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [sheet.sheetName]: { rowCount: sheet.rows.length, columnCount: sheet.headers.length },
  };

  report("Eramon Metadaten speichern", 35);
  const switchNames = new Set<string>();
  const fullRows: EramonIfaceRow[] = [];
  const latestCandidates = new Map<string, EramonIfaceLatest>();

  report("Eramon Zeilen speichern", 45, `${sheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const deviceName = toStr(row["device_name"]);
    const portName = toStr(row["port_name"]);
    if (!deviceName || !portName) {
      warnings.push(`Eramon Zeile ${i + 1}: device_name oder port_name ist leer, Zeile wurde übersprungen.`);
      continue;
    }
    switchNames.add(deviceName);
    const switchNorm = normalizeVmNameForMatch(deviceName);
    const switchPortKey = buildEramonSwitchPortKey(deviceName, portName);
    fullRows.push({
      ifaceImportId, rowIndex: i, deviceName, switchNorm, portName, switchPortKey, importedAt,
      rawData: toRawRowData(row),
    });
    latestCandidates.set(switchPortKey, {
      switchPortKey, switchNorm, deviceName, portName, importedAt, ifaceImportId, rowIndex: i,
      ...mapEramonIfaceDisplayFields(row),
    });
  }

  await putEramonIfaceImport({
    ifaceImportId, importedAt, fileName: file.name, fileChecksum: checksum,
    rowCount: sheet.rows.length, switchCount: switchNames.size,
  });
  await batchPutEramonIfaceRows(fullRows, 5000);

  report("Eramon Latest aktualisieren", 75);
  const existingLatest = await getEramonIfaceLatestByKeys([...latestCandidates.keys()]);
  const existingMap = new Map(existingLatest.map((entry) => [entry.switchPortKey, entry]));
  const latestUpdates: EramonIfaceLatest[] = [];
  for (const [key, candidate] of latestCandidates.entries()) {
    if (isTechInfoNewerOrEqual(candidate.importedAt, existingMap.get(key)?.importedAt)) {
      latestUpdates.push(candidate);
    }
  }
  if (latestUpdates.length > 0) {
    await batchPutEramonIfaceLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} Eramon Switch-Ports`);
  return { success: true, fileKind: "eramon-iface", warnings, errors, sheetStats };
}
```

Dispatch in `importRvtoolsXlsx` nach dem IPAM-Branch (Zeile 488) einfügen:

```ts
    if (parsed.fileKind === "eramon-iface") {
      return await importEramonIfaceCsv(file, checksum, parsed, warnings, errors, report);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/eramonIfaceImport.test.ts`
Expected: PASS (4 Blöcke grün).

- [ ] **Step 6: Commit**

```bash
git add src/data/db/index.ts src/domain/services/importService.ts src/test/eramonIfaceImport.test.ts
git commit -m "feat: eramon switch-port csv import"
```

---

## Task 4: L2-Import (DB-Helper + importEramonL2Csv)

**Files:**
- Modify: `src/data/db/index.ts` (Helper nach den Iface-Helfern; Rebuild/Delete nach `deleteEramonIfaceImport`)
- Modify: `src/domain/services/importService.ts` (`findEramonL2Sheet`, `importEramonL2Csv`, Dispatch, CSV-Ablehnungstext)
- Test: `src/test/eramonL2Import.test.ts` (neu)

**Interfaces:**
- Consumes: `EramonL2ImportMeta/Row/Latest` (Task 2), `mapEramonL2DisplayFields`, `buildEramonL2Key`, `ERAMON_L2_REQUIRED_HEADERS` (Task 1).
- Produces (DB): `getEramonL2ImportByChecksum`, `getEramonL2Imports`, `putEramonL2Import`, `batchPutEramonL2Rows`, `batchPutEramonL2Latest`, `getAllEramonL2Latest`, `getEramonL2LatestByKeys`, `deleteEramonL2Import`, `estimateEramonL2ImportSizesBytes`.
- Produces (Service): `importEramonL2Csv(file, checksum, parsed, warnings, errors, report): Promise<ImportResult>`.

- [ ] **Step 1: Write the failing test**

Create `src/test/eramonL2Import.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { WorkerParseResult } from "@/domain/models/types";

const HEADERS = ["ip", "name", "interface", "mac", "dnsname", "vlan"];

function makeParsed(rows: Record<string, unknown>[], headers = HEADERS): WorkerParseResult {
  return {
    fileKind: "eramon-l2",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-22T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  ip: "10.18.4.31", name: "grznxx93oc3-35.rbgooe.at", interface: "Ethernet1/23",
  mac: "01:90:8F:E5:D3:73", dnsname: "sbc01.at", vlan: "158", ...over,
});

describe("importEramonL2Csv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("hält gleiche MAC auf mehreren VLANs/Ports als getrennte Zeilen", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    const result = await importEramonL2Csv(
      new File(["x"], "l2.csv", { type: "text/csv" }), "chk-1",
      makeParsed([
        row({ interface: "Ethernet1/23", vlan: "158" }),
        row({ interface: "Ethernet1/21", vlan: "303" }),
        row({ interface: "Ethernet1/20", vlan: "304" }),
      ]),
      [], [], () => {},
    );
    expect(result.success).toBe(true);
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(3);
    expect(latest.map((l) => l.vlan).sort()).toEqual(["158", "303", "304"]);
  });

  it("überspringt Zeilen ohne name oder interface mit Warnung", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    const warnings: string[] = [];
    await importEramonL2Csv(
      new File(["x"], "l2.csv"), "chk-2",
      makeParsed([row(), row({ name: "" }), row({ interface: null })]),
      warnings, [], () => {},
    );
    expect(warnings.some((w) => w.includes("Zeile 2"))).toBe(true);
    expect(await getAllEramonL2Latest()).toHaveLength(1);
  });

  it("latest wins bei Re-Import desselben Switch+Interface+MAC+VLAN", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    await importEramonL2Csv(new File(["a"], "1.csv"), "a", makeParsed([row({ ip: "10.0.0.1" })]), [], [], () => {});
    await importEramonL2Csv(new File(["b"], "2.csv"), "b", makeParsed([row({ ip: "10.0.0.99" })]), [], [], () => {});
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(1);
    expect(latest[0].ip).toBe("10.0.0.99");
  });

  it("deleteEramonL2Import baut Latest neu auf", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest, getEramonL2Imports, deleteEramonL2Import } = await import("@/data/db");
    await importEramonL2Csv(new File(["a"], "1.csv"), "a", makeParsed([row({ ip: "10.0.0.1" })]), [], [], () => {});
    await importEramonL2Csv(new File(["b"], "2.csv"), "b", makeParsed([row({ ip: "10.0.0.99" })]), [], [], () => {});
    const imports = await getEramonL2Imports();
    const newer = imports.find((i) => i.fileChecksum === "b")!;
    await deleteEramonL2Import(newer.l2ImportId);
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(1);
    expect(latest[0].ip).toBe("10.0.0.1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/eramonL2Import.test.ts`
Expected: FAIL — `importEramonL2Csv` nicht exportiert.

- [ ] **Step 3: DB-Helper für L2 ergänzen (`db/index.ts`)**

Nach `getEramonIfaceLatestByKeys` (aus Task 3) einfügen:

```ts
export async function getEramonL2ImportByChecksum(checksum: string): Promise<EramonL2ImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("eramon_l2_imports", "fileChecksum", checksum);
}

export async function getEramonL2Imports(): Promise<EramonL2ImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("eramon_l2_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putEramonL2Import(meta: EramonL2ImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("eramon_l2_imports", meta);
}

export async function batchPutEramonL2Rows(items: EramonL2Row[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_l2_rows", items, batchSize);
}

export async function batchPutEramonL2Latest(items: EramonL2Latest[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_l2_latest", items, batchSize);
}

export async function getAllEramonL2Latest(): Promise<EramonL2Latest[]> {
  const db = await getDb();
  return db.getAll("eramon_l2_latest");
}

export async function getEramonL2LatestByKeys(keys: string[]): Promise<EramonL2Latest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("eramon_l2_latest", key)));
  return values.filter((v): v is EramonL2Latest => Boolean(v));
}
```

Größenschätzung nach `estimateEramonIfaceImportSizesBytes` (aus Task 3) einfügen:

```ts
export async function estimateEramonL2ImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "eramon_l2_rows", "l2ImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}
```

Rebuild/Delete nach `deleteEramonIfaceImport` (aus Task 3) einfügen:

```ts
function buildEramonL2LatestFromRow(row: EramonL2Row): EramonL2Latest {
  return {
    l2EntryKey: row.l2EntryKey,
    switchNorm: row.switchNorm,
    switchName: row.switchName,
    interface: row.interface,
    mac: row.mac,
    vlan: row.vlan,
    importedAt: row.importedAt,
    l2ImportId: row.l2ImportId,
    rowIndex: row.rowIndex,
    ...mapEramonL2DisplayFields(row.rawData),
  };
}

async function rebuildEramonL2LatestForKey(l2EntryKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_l2_rows", "l2EntryKey", l2EntryKey);
  const latestRow = rows.reduce<EramonL2Row | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);
  if (!latestRow) {
    await db.delete("eramon_l2_latest", l2EntryKey);
    return;
  }
  await db.put("eramon_l2_latest", buildEramonL2LatestFromRow(latestRow));
}

export async function deleteEramonL2Import(l2ImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_l2_rows", "l2ImportId", l2ImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.l2EntryKey) affectedKeys.add(row.l2EntryKey);
  }
  await db.delete("eramon_l2_imports", l2ImportId);
  await deleteByKeyPrefix("eramon_l2_rows", l2ImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildEramonL2LatestForKey(key)));
}
```

Im `@/lib/xlsx/parseHelpers`-Import von `db/index.ts` `mapEramonL2DisplayFields` ergänzen.

- [ ] **Step 4: `importEramonL2Csv` + Dispatch (`importService.ts`)**

Import-Blöcke ergänzen: aus `parseHelpers` `ERAMON_L2_REQUIRED_HEADERS`, `mapEramonL2DisplayFields`, `buildEramonL2Key`; aus `@/data/db` die L2-Helfer aus Step 3; aus `@/domain/models/types` `EramonL2Row`, `EramonL2Latest`.

Nach `importEramonIfaceCsv` (aus Task 3) einfügen:

```ts
function findEramonL2Sheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    ERAMON_L2_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

export async function importEramonL2Csv(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getEramonL2ImportByChecksum(checksum);
  if (existing) {
    return { success: false, fileKind: "eramon-l2", warnings: [], errors: ["Diese Eramon-MAC-Tabellen-Datei wurde bereits importiert."] };
  }

  const sheet = findEramonL2Sheet(parsed.sheets);
  if (!sheet) {
    return {
      success: false,
      fileKind: "eramon-l2",
      warnings,
      errors: [...errors, "Keine gültige Eramon-MAC-Tabellen-CSV erkannt (erwartete Spalten: name, interface, mac, vlan)."],
    };
  }

  const importedAt = new Date().toISOString();
  const l2ImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [sheet.sheetName]: { rowCount: sheet.rows.length, columnCount: sheet.headers.length },
  };

  report("Eramon Zeilen speichern", 45, `${sheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  const switchNames = new Set<string>();
  const fullRows: EramonL2Row[] = [];
  const latestCandidates = new Map<string, EramonL2Latest>();
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const switchName = toStr(row["name"]);
    const interfaceName = toStr(row["interface"]);
    if (!switchName || !interfaceName) {
      warnings.push(`Eramon Zeile ${i + 1}: name oder interface ist leer, Zeile wurde übersprungen.`);
      continue;
    }
    const mac = toStr(row["mac"]) ?? "";
    const vlan = toStr(row["vlan"]) ?? "";
    switchNames.add(switchName);
    const switchNorm = normalizeVmNameForMatch(switchName);
    const l2EntryKey = buildEramonL2Key(switchName, interfaceName, mac, vlan);
    fullRows.push({
      l2ImportId, rowIndex: i, switchName, switchNorm, interface: interfaceName, mac, vlan, l2EntryKey, importedAt,
      rawData: toRawRowData(row),
    });
    latestCandidates.set(l2EntryKey, {
      l2EntryKey, switchNorm, switchName, interface: interfaceName, mac, vlan, importedAt, l2ImportId, rowIndex: i,
      ...mapEramonL2DisplayFields(row),
    });
  }

  report("Eramon Metadaten speichern", 60);
  await putEramonL2Import({
    l2ImportId, importedAt, fileName: file.name, fileChecksum: checksum,
    rowCount: sheet.rows.length, switchCount: switchNames.size,
  });
  await batchPutEramonL2Rows(fullRows, 5000);

  report("Eramon Latest aktualisieren", 75);
  const existingLatest = await getEramonL2LatestByKeys([...latestCandidates.keys()]);
  const existingMap = new Map(existingLatest.map((entry) => [entry.l2EntryKey, entry]));
  const latestUpdates: EramonL2Latest[] = [];
  for (const [key, candidate] of latestCandidates.entries()) {
    if (isTechInfoNewerOrEqual(candidate.importedAt, existingMap.get(key)?.importedAt)) {
      latestUpdates.push(candidate);
    }
  }
  if (latestUpdates.length > 0) {
    await batchPutEramonL2Latest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} Eramon MAC-Einträge`);
  return { success: true, fileKind: "eramon-l2", warnings, errors, sheetStats };
}
```

Dispatch nach dem `eramon-iface`-Branch (aus Task 3) einfügen:

```ts
    if (parsed.fileKind === "eramon-l2") {
      return await importEramonL2Csv(file, checksum, parsed, warnings, errors, report);
    }
```

CSV-Ablehnungstext (Zeile 496) ersetzen, damit unbekannte CSV weiterhin klar abgelehnt wird:

```ts
        errors: [...errors, "Keine gültige CDP-, IPAM- oder Eramon-CSV erkannt (erwartete Spalten: VMHost/PhysicalAdapter/CDPDeviceID/CDPAvailable, IP Address/Status/Type, device_name/port_name/port_status oder name/interface/mac/vlan)."],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/eramonL2Import.test.ts`
Expected: PASS (4 Blöcke grün).

- [ ] **Step 6: Commit**

```bash
git add src/data/db/index.ts src/domain/services/importService.ts src/test/eramonL2Import.test.ts
git commit -m "feat: eramon mac-table csv import"
```

---

## Task 5: Hooks, fileKindLabel & Glossar

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts` (Import Zeile 3; Hooks nach `useAllCdpLatest` Zeile 236)
- Modify: `src/hooks/useImportController.tsx:52-59`
- Modify: `src/lib/glossaries/networking.ts` (Tab-Tooltips nach `cdp`-Eintrag; neue Glossar-Blöcke am Dateiende)

**Interfaces:**
- Consumes: `getAllEramonIfaceLatest`, `getAllEramonL2Latest` (Task 3/4).
- Produces: `useAllEramonIfaceLatest()`, `useAllEramonL2Latest()` (React-Query-Hooks); `NET_ERAMON_IFACE_KPI`, `NET_ERAMON_IFACE_COLUMNS`, `NET_ERAMON_L2_KPI`, `NET_ERAMON_L2_COLUMNS`; `NET_NETWORK_TABS.eramonIface`, `NET_NETWORK_TABS.eramonL2`.

- [ ] **Step 1: Hooks ergänzen (`useActiveSnapshots.ts`)**

Im Sammelimport (Zeile 3) `getAllEramonIfaceLatest, getAllEramonL2Latest` ergänzen. Nach `useAllCdpLatest` (Zeile 236) einfügen:

```ts
export function useAllEramonIfaceLatest() {
  return useQuery({
    queryKey: ["eramonIfaceLatestAll"],
    queryFn: getAllEramonIfaceLatest,
    staleTime: STALE_MS,
  });
}

export function useAllEramonL2Latest() {
  return useQuery({
    queryKey: ["eramonL2LatestAll"],
    queryFn: getAllEramonL2Latest,
    staleTime: STALE_MS,
  });
}
```

- [ ] **Step 2: `fileKindLabel` erweitern (`useImportController.tsx`)**

Vor `return "RVTools";` (Zeile 58) einfügen:

```ts
  if (kind === "eramon-iface") return "Eramon Switch-Ports";
  if (kind === "eramon-l2") return "Eramon MAC-Tabelle";
```

- [ ] **Step 3: Glossar ergänzen (`networking.ts`)**

Nach dem `cdp`-Eintrag in `NET_NETWORK_TABS` (nach Zeile 36) einfügen:

```ts
  eramonIface: {
    term: "Switch-Ports (Eramon)",
    description:
      "Port-Inventar der Switches aus Eramon: eine Zeile pro Switch-Port mit Beschreibung, Bandbreite und Aktiv/Down-Status.",
    source: "Eramon · Device-Interface-Daten",
  },
  eramonL2: {
    term: "MAC-Tabelle (Eramon)",
    description:
      "L2-Sicht aus Eramon: welche IP/MAC/DNS-Name in welchem VLAN an welchem Switch-Port gesehen wurde.",
    source: "Eramon · L2-Daten",
  },
```

Am Dateiende von `networking.ts` anfügen:

```ts
const ERAMON = "Eramon";

export const NET_ERAMON_IFACE_KPI: Record<string, GlossaryEntry> = {
  switches: {
    term: "Switches",
    description: "Anzahl unterschiedlicher Switches (device_name) im Import.",
    source: `${ERAMON} · „device_name“`,
  },
  ports: {
    term: "Ports gesamt",
    description: "Anzahl aller Switch-Ports im aktuellen Filter — eine Zeile pro Switch+Port, neuester Import gewinnt.",
    source: `${ERAMON} · „port_name“`,
  },
  active: {
    term: "Aktive Ports",
    description: "Ports mit Status 1 (aktiv/up).",
    source: `${ERAMON} · „port_status“`,
  },
  down: {
    term: "Down-Ports",
    description: "Ports mit Status 2 (down).",
    source: `${ERAMON} · „port_status“`,
  },
};

export const NET_ERAMON_IFACE_COLUMNS: Record<string, GlossaryEntry> = {
  deviceName: { term: "Switch", description: "Switch-Hostname laut Eramon.", source: `${ERAMON} · „device_name“` },
  portName: { term: "Port", description: "Interface-Bezeichnung (physischer Port, Port-Channel, VLAN-SVI oder mgmt).", source: `${ERAMON} · „port_name“` },
  portDesc: { term: "Beschreibung", description: "Freie Port-Beschreibung (Gegenstelle, VPC, Tags).", source: `${ERAMON} · „port_desc“` },
  bandbreite: { term: "Bandbreite", description: "Port-Bandbreite, umgerechnet in Gbit/s bzw. Mbit/s.", source: `${ERAMON} · „bandbreite“` },
  status: { term: "Status", description: "Port-Status: 1 = aktiv, 2 = down.", source: `${ERAMON} · „port_status“` },
};

export const NET_ERAMON_L2_KPI: Record<string, GlossaryEntry> = {
  entries: {
    term: "Einträge gesamt",
    description: "Anzahl aller L2-Einträge im aktuellen Filter — eine Zeile pro Switch+Interface+MAC+VLAN.",
    source: `${ERAMON} · neuester Import je Eintrag`,
  },
  macs: {
    term: "Eindeutige MACs",
    description: "Anzahl unterschiedlicher MAC-Adressen.",
    source: `${ERAMON} · „mac“`,
  },
  ips: {
    term: "Eindeutige IPs",
    description: "Anzahl unterschiedlicher IP-Adressen (nicht-leer).",
    source: `${ERAMON} · „ip“`,
  },
  vlans: {
    term: "VLANs",
    description: "Anzahl unterschiedlicher VLAN-IDs (nicht-leer).",
    source: `${ERAMON} · „vlan“`,
  },
};

export const NET_ERAMON_L2_COLUMNS: Record<string, GlossaryEntry> = {
  ip: { term: "IP", description: "IP-Adresse des am Port gesehenen Endgeräts.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "DNS-Name des Endgeräts.", source: `${ERAMON} · „dnsname“` },
  mac: { term: "MAC", description: "MAC-Adresse des Endgeräts.", source: `${ERAMON} · „mac“` },
  switchName: { term: "Switch", description: "Switch, an dem die MAC gesehen wurde.", source: `${ERAMON} · „name“` },
  interface: { term: "Interface", description: "Switch-Port, an dem die MAC gesehen wurde.", source: `${ERAMON} · „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID des Eintrags.", source: `${ERAMON} · „vlan“` },
};
```

*(Falls `GlossaryEntry` in dieser Datei nicht bereits importiert/definiert ist, den bestehenden Import am Dateikopf wiederverwenden — er wird von `NET_CDP_KPI` bereits genutzt.)*

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useActiveSnapshots.ts src/hooks/useImportController.tsx src/lib/glossaries/networking.ts
git commit -m "feat: eramon hooks, file-kind labels and glossary"
```

---

## Task 6: Interface-Panel + Networking-Tab

**Files:**
- Create: `src/pages/EramonIfacePanel.tsx`
- Modify: `src/pages/Networking.tsx` (Import; `NetworkTab` Zeile 18; TabsList; TabsContent)

**Interfaces:**
- Consumes: `useAllEramonIfaceLatest` (Task 5), `formatBandwidth` (Task 1), `NET_ERAMON_IFACE_KPI/_COLUMNS` (Task 5), `EramonIfaceLatest` (Task 2), bestehende UI-Bausteine.
- Produces: `export function EramonIfacePanel()`.

- [ ] **Step 1: Panel erstellen (`src/pages/EramonIfacePanel.tsx`)**

```tsx
import { useMemo } from "react";
import { AlertCircle, Cable, CheckCircle2, Network, Router } from "lucide-react";
import { useActiveSnapshotIds, useAllEramonIfaceLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { formatBandwidth } from "@/lib/eramon";
import { NET_ERAMON_IFACE_COLUMNS, NET_ERAMON_IFACE_KPI } from "@/lib/glossaries/networking";
import type { EramonIfaceLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

function statusBadge(row: EramonIfaceLatest) {
  if (row.statusLabel === "aktiv") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">aktiv</Badge>;
  }
  if (row.statusLabel === "down") {
    return <Badge variant="secondary">down</Badge>;
  }
  return textCell(row.statusLabel);
}

const columns: ColumnDef<EramonIfaceLatest, unknown>[] = [
  { accessorKey: "deviceName", header: "Switch", meta: { info: NET_ERAMON_IFACE_COLUMNS.deviceName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "portName", header: "Port", meta: { info: NET_ERAMON_IFACE_COLUMNS.portName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "portDesc", header: "Beschreibung", meta: { info: NET_ERAMON_IFACE_COLUMNS.portDesc }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    accessorKey: "bandbreiteBps",
    header: "Bandbreite",
    meta: { info: NET_ERAMON_IFACE_COLUMNS.bandbreite },
    cell: ({ getValue }) => {
      const bps = getValue() as number | null;
      return <span className="font-mono-data" title={bps !== null ? `${bps} bit/s` : undefined}>{formatBandwidth(bps)}</span>;
    },
  },
  { accessorKey: "statusLabel", header: "Status", meta: { info: NET_ERAMON_IFACE_COLUMNS.status }, cell: ({ row }) => statusBadge(row.original) },
];

export function EramonIfacePanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rows = [], isLoading } = useAllEramonIfaceLatest();

  const switchCount = useMemo(() => new Set(rows.map((r) => r.switchNorm)).size, [rows]);
  const activeCount = useMemo(() => rows.filter((r) => r.statusLabel === "aktiv").length, [rows]);
  const downCount = useMemo(() => rows.filter((r) => r.statusLabel === "down").length, [rows]);

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-6 w-6" />}
        title="Keine Eramon-Switch-Port-Daten"
        description="Laden Sie eine Eramon-Switch-Port-CSV (device_name/port_name/port_status) auf der Upload-Seite hoch."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Switches" value={formatNum(switchCount)} icon={<Router className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.switches} />
        <KpiCard title="Ports gesamt" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.ports} />
        <KpiCard title="Aktive Ports" value={formatNum(activeCount)} icon={<CheckCircle2 className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.active} />
        <KpiCard title="Down-Ports" value={formatNum(downCount)} severity={downCount > 0 ? "warn" : "ok"} icon={<AlertCircle className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.down} />
      </KpiGrid>
      <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="eramon-switch-ports" />
    </div>
  );
}
```

*Hinweis: Prüfe die exakten KpiCard-Props/Icon-Namen gegen `CdpSwitchPorts.tsx` (`severity`, `info`, `icon`). Falls `CheckCircle2` in der lucide-Version nicht existiert, `CheckCircle` verwenden.*

- [ ] **Step 2: Networking-Tab verdrahten (`Networking.tsx`)**

Import nach Zeile 11 ergänzen:

```tsx
import { EramonIfacePanel } from "@/pages/EramonIfacePanel";
```

`NetworkTab`-Typ (Zeile 18) um `"eramon-iface"` erweitern:

```tsx
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "cisco-switch" | "eramon-iface" | "audit";
```

In `TabsList` nach dem `cisco-switch`-Trigger (Zeile 61) einfügen:

```tsx
          <InfoTooltip entry={NET_NETWORK_TABS.eramonIface} side="bottom">
            <TabsTrigger value="eramon-iface">Switch-Ports (Eramon)</TabsTrigger>
          </InfoTooltip>
```

Nach dem `cisco-switch`-TabsContent (Zeile 90) einfügen:

```tsx
        <TabsContent value="eramon-iface" className="space-y-4">
          <EramonIfacePanel />
        </TabsContent>
```

- [ ] **Step 3: Build/Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/pages/EramonIfacePanel.tsx src/pages/Networking.tsx
git commit -m "feat: eramon switch-port panel and networking tab"
```

---

## Task 7: L2-Panel + Networking-Tab

**Files:**
- Create: `src/pages/EramonL2Panel.tsx`
- Modify: `src/pages/Networking.tsx` (Import; `NetworkTab`; TabsList; TabsContent)

**Interfaces:**
- Consumes: `useAllEramonL2Latest` (Task 5), `NET_ERAMON_L2_KPI/_COLUMNS` (Task 5), `EramonL2Latest` (Task 2).
- Produces: `export function EramonL2Panel()`.

- [ ] **Step 1: Panel erstellen (`src/pages/EramonL2Panel.tsx`)**

```tsx
import { useMemo } from "react";
import { Fingerprint, Network, Router, Tags } from "lucide-react";
import { useActiveSnapshotIds, useAllEramonL2Latest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { NET_ERAMON_L2_COLUMNS, NET_ERAMON_L2_KPI } from "@/lib/glossaries/networking";
import type { EramonL2Latest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const columns: ColumnDef<EramonL2Latest, unknown>[] = [
  { accessorKey: "ip", header: "IP", meta: { info: NET_ERAMON_L2_COLUMNS.ip }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_ERAMON_L2_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_ERAMON_L2_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "switchName", header: "Switch", meta: { info: NET_ERAMON_L2_COLUMNS.switchName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", meta: { info: NET_ERAMON_L2_COLUMNS.interface }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_ERAMON_L2_COLUMNS.vlan }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

export function EramonL2Panel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rows = [], isLoading } = useAllEramonL2Latest();

  const macCount = useMemo(() => new Set(rows.map((r) => r.mac).filter(Boolean)).size, [rows]);
  const ipCount = useMemo(() => new Set(rows.map((r) => r.ip).filter((v): v is string => Boolean(v))).size, [rows]);
  const vlanCount = useMemo(() => new Set(rows.map((r) => r.vlan).filter(Boolean)).size, [rows]);

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-6 w-6" />}
        title="Keine Eramon-MAC-Tabellen-Daten"
        description="Laden Sie eine Eramon-L2-CSV (name/interface/mac/vlan) auf der Upload-Seite hoch."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Einträge gesamt" value={formatNum(rows.length)} icon={<Network className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.entries} />
        <KpiCard title="Eindeutige MACs" value={formatNum(macCount)} icon={<Fingerprint className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.macs} />
        <KpiCard title="Eindeutige IPs" value={formatNum(ipCount)} icon={<Router className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.ips} />
        <KpiCard title="VLANs" value={formatNum(vlanCount)} icon={<Tags className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.vlans} />
      </KpiGrid>
      <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="eramon-mac-tabelle" />
    </div>
  );
}
```

- [ ] **Step 2: Networking-Tab verdrahten (`Networking.tsx`)**

Import ergänzen:

```tsx
import { EramonL2Panel } from "@/pages/EramonL2Panel";
```

`NetworkTab`-Typ um `"eramon-l2"` erweitern (an die Union anhängen, vor `"audit"`):

```tsx
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "cisco-switch" | "eramon-iface" | "eramon-l2" | "audit";
```

In `TabsList` nach dem `eramon-iface`-Trigger (aus Task 6) einfügen:

```tsx
          <InfoTooltip entry={NET_NETWORK_TABS.eramonL2} side="bottom">
            <TabsTrigger value="eramon-l2">MAC-Tabelle (Eramon)</TabsTrigger>
          </InfoTooltip>
```

Nach dem `eramon-iface`-TabsContent (aus Task 6) einfügen:

```tsx
        <TabsContent value="eramon-l2" className="space-y-4">
          <EramonL2Panel />
        </TabsContent>
```

- [ ] **Step 3: Build/Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/pages/EramonL2Panel.tsx src/pages/Networking.tsx
git commit -m "feat: eramon mac-table panel and networking tab"
```

---

## Task 8: Upload-Seite verdrahten (beide Quellen)

**Files:**
- Modify: `src/pages/UploadSnapshots.tsx`

**Interfaces:**
- Consumes: `getEramonIfaceImports`, `deleteEramonIfaceImport`, `estimateEramonIfaceImportSizesBytes`, `getEramonL2Imports`, `deleteEramonL2Import`, `estimateEramonL2ImportSizesBytes` (Task 3/4); `EramonIfaceImportMeta`, `EramonL2ImportMeta` (Task 2).
- Produces: zwei neue `StoredUpload`-Varianten, vollständige Anzeige/Löschung/Größenschätzung.

- [ ] **Step 1: Importe erweitern**

DB-Import-Block (Zeilen 3-11) ergänzen:

```tsx
  getEramonIfaceImports, deleteEramonIfaceImport,
  getEramonL2Imports, deleteEramonL2Import,
```
und in der Größenschätzungs-Zeile:
```tsx
  estimateEramonIfaceImportSizesBytes, estimateEramonL2ImportSizesBytes,
```

Typ-Import (Zeile 22) um `EramonIfaceImportMeta, EramonL2ImportMeta` ergänzen.

- [ ] **Step 2: `StoredUpload`-Union erweitern (Zeilen 24-30)**

Vor dem abschließenden `;` zwei Varianten anhängen:

```tsx
  | { kind: "eramon-iface"; id: string; importedAt: string; eramonIface: EramonIfaceImportMeta }
  | { kind: "eramon-l2"; id: string; importedAt: string; eramonL2: EramonL2ImportMeta };
```

- [ ] **Step 3: `buildStoredUploads` erweitern (Zeilen 60-88)**

Signatur um zwei Parameter erweitern:

```tsx
  eramonIfaceImports: EramonIfaceImportMeta[],
  eramonL2Imports: EramonL2ImportMeta[],
```

Vor `return uploads.sort(...)` einfügen:

```tsx
  for (const eramonIface of eramonIfaceImports) {
    uploads.push({ kind: "eramon-iface", id: eramonIface.ifaceImportId, importedAt: eramonIface.importedAt, eramonIface });
  }
  for (const eramonL2 of eramonL2Imports) {
    uploads.push({ kind: "eramon-l2", id: eramonL2.l2ImportId, importedAt: eramonL2.importedAt, eramonL2 });
  }
```

- [ ] **Step 4: `storedUploads`-Query erweitern (Zeilen 109-117)**

`Promise.all`-Array und Destrukturierung um `getEramonIfaceImports()`, `getEramonL2Imports()` erweitern und an `buildStoredUploads` durchreichen:

```tsx
      const [snapshots, techInfoImports, techInfoClientImports, cdpImports, ipamImports, switchImports, eramonIfaceImports, eramonL2Imports] = await Promise.all([
        getSnapshots(),
        getTechInfoImports(),
        getTechInfoClientImports(),
        getCdpImports(),
        getIpamImports(),
        getSwitchImports(),
        getEramonIfaceImports(),
        getEramonL2Imports(),
      ]);
      return buildStoredUploads(snapshots, techInfoImports, techInfoClientImports, cdpImports, ipamImports, switchImports, eramonIfaceImports, eramonL2Imports);
```

- [ ] **Step 5: `uploadIdsByKind` + Größenschätzung erweitern (Zeilen 126-141)**

Init-Objekt (Zeile 131) ergänzen: `"eramon-iface": [], "eramon-l2": []`. `Promise.all`-Array (Zeilen 133-140) und Destrukturierung um:

```tsx
        estimateEramonIfaceImportSizesBytes(uploadIdsByKind["eramon-iface"]),
        estimateEramonL2ImportSizesBytes(uploadIdsByKind["eramon-l2"]),
```

Rückgabeobjekt (Zeile 141) ergänzen: `"eramon-iface": eramonIfaceSizes, "eramon-l2": eramonL2Sizes` (Destrukturierungsnamen entsprechend `[..., eramonIfaceSizes, eramonL2Sizes]`).

- [ ] **Step 6: Delete-Handler ergänzen (nach Zeile 190)**

```tsx
  const handleDeleteEramonIfaceImport = useCallback(async (ifaceImportId: string) => {
    await runDelete(() => deleteEramonIfaceImport(ifaceImportId), "Eramon Switch-Port-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteEramonL2Import = useCallback(async (l2ImportId: string) => {
    await runDelete(() => deleteEramonL2Import(l2ImportId), "Eramon MAC-Tabellen-Daten gelöscht.");
  }, [runDelete]);
```

- [ ] **Step 7: Dropzone-Texte erweitern (Zeilen 242-244)**

`aria-label` und Beschreibungstext um „Eramon-CSV" ergänzen, z. B. Zeile 244:

```tsx
        <p className="mt-3 text-sm font-medium">{importing ? "Import läuft..." : "RVTools / Tech-Info (XLSX), CDP-/IPAM-/Eramon-CSV oder Switch-TXT hierher ziehen oder klicken"}</p>
```
Leer-Text (Zeile 320) analog um „Eramon" ergänzen.

- [ ] **Step 8: Upload-Card-Rendering erweitern**

`title` (Zeilen 325-330): vor dem finalen `: upload.switch.fileName` zwei Zweige ergänzen:

```tsx
                : upload.kind === "eramon-iface" ? upload.eramonIface.fileName
                : upload.kind === "eramon-l2" ? upload.eramonL2.fileName
```

`rowCount` (Zeilen 331-337) analog:

```tsx
                : upload.kind === "eramon-iface" ? upload.eramonIface.rowCount
                : upload.kind === "eramon-l2" ? upload.eramonL2.rowCount
```

Meta-Zeile (Zeilen 357-364): einen Zweig für Eramon (mit Switch-Anzahl, analog Switch-Zweig) vor dem `cdp || ipam`-Zweig ergänzen:

```tsx
                        ) : upload.kind === "eramon-iface" || upload.kind === "eramon-l2" ? (
                          <p className="text-xs text-muted-foreground">
                            Import: {new Date(upload.importedAt).toLocaleString("de-DE")} · {(upload.kind === "eramon-iface" ? upload.eramonIface.switchCount : upload.eramonL2.switchCount).toLocaleString("de-DE")} {(upload.kind === "eramon-iface" ? upload.eramonIface.switchCount : upload.eramonL2.switchCount) === 1 ? "Switch" : "Switches"}
                          </p>
```

Delete-Dispatch (Zeilen 381-388): vor `else void handleDeleteSnapshot(upload.id);` einfügen:

```tsx
                        else if (upload.kind === "eramon-iface") void handleDeleteEramonIfaceImport(upload.id);
                        else if (upload.kind === "eramon-l2") void handleDeleteEramonL2Import(upload.id);
```

- [ ] **Step 9: Build/Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (insb. `StoredUpload`-Union in allen `switch`/`?:`-Ketten vollständig abgedeckt).

- [ ] **Step 10: Commit**

```bash
git add src/pages/UploadSnapshots.tsx
git commit -m "feat: eramon imports on upload page (list, size, delete)"
```

---

## Task 9: Gesamtverifikation

**Files:** keine (nur Ausführung)

- [ ] **Step 1: Alle Tests**

Run: `npm run test`
Expected: PASS — inkl. `eramonHelpers`, `eramonDb`, `eramonIfaceImport`, `eramonL2Import`; keine Regression bei CDP/IPAM/Switch.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: keine Fehler.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: erfolgreicher Production-Build.

- [ ] **Step 4: Manuelltest-Checkliste (im Dev-Server, Port 8080)**

- Eramon-Interface-CSV hochladen → Tab „Switch-Ports (Eramon)" zeigt KPIs + Tabelle; Bandbreite als Gbit/s; Status-Badges.
- Eramon-L2-CSV hochladen → Tab „MAC-Tabelle (Eramon)"; gleiche MAC auf mehreren VLANs als getrennte Zeilen sichtbar.
- Suche filtert beide Tabellen; globaler vCenter/Cluster-Filter lässt sie unverändert.
- Upload-Seite listet beide Importe mit Switch-Anzahl + Größe; Einzel-Löschung funktioniert.
- Re-Import derselben Datei → „bereits importiert".

- [ ] **Step 5: Abschluss-Commit (falls Fixes nötig waren)**

```bash
git add -A
git commit -m "test: verify eramon import end-to-end"
```

---

## Self-Review

**1. Spec coverage:**
- Zwei Import-Typen + Erkennung → Task 1. ✓
- Datenmodell (6 Stores, vierteiliger L2-Key, Iface-Key) → Task 2. ✓
- Bandbreiten-Normalisierung (`1E+11` + Number) + Formatter → Task 1 (`toNumber`/`formatBandwidth`), getestet. ✓
- `port_status` 1/2-Mapping → Task 1 (`mapEramonPortStatus`). ✓
- Import inkl. Skip-Logik, Duplikatschutz, latest-wins, Delete/Rebuild → Task 3/4. ✓
- Upload-Seite, Hooks, `fileKindLabel`, Glossar → Task 5/8. ✓
- Zwei Panels + Tabs, nur Suche als Filter → Task 6/7. ✓
- Tests (Detection, Maps, Import, latest-wins, Delete, Formatter) → Task 1/3/4. ✓

**2. Placeholder scan:** Keine TBD/TODO; jeder Code-Step enthält vollständigen Code. ✓

**3. Type consistency:** `switchNorm`, `switchPortKey`, `l2EntryKey`, `bandbreiteBps`, `statusLabel`, `deviceName`, `switchName`, `interface`, `ifaceImportId`, `l2ImportId` durchgängig identisch in Typen (Task 2), DB-Helfern (Task 3/4), Import (Task 3/4) und Panels (Task 6/7). Hook-Namen `useAllEramonIfaceLatest`/`useAllEramonL2Latest` konsistent Task 5↔6/7. DB-Helfer-Namen konsistent Task 3/4↔8. ✓
