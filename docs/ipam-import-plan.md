# Plan: IPAM-CSV-Import & IPAM-Tab im Netzwerk-Bereich

## 1. Ziel & Überblick

Die Anwendung soll Infoblox-IPAM-CSV-Dateien (`ipam.csv`) über den bestehenden Datei-Upload importieren können. Jede CSV-Datei repräsentiert ein Netz/Subnetz. Mehrere CSV-Dateien können hochgeladen werden, um mehrere Netze zu verwalten. Die Daten sollen auf der Netzwerk-Seite in einem neuen Tab „IPAM" in einer `VirtualTable` angezeigt werden – analog zu den bestehenden Tabs (Security, Host-Netzwerk, VLAN, CDP).

Der Implementierungsansatz folgt konsequent dem bestehenden **CDP-Import-Muster**, da CDP ebenfalls ein CSV-Import mit eigener Meta-, Rows- und Latest-Tabelle ist und sich als Vorbild anbietet.

---

## 2. Datenanalyse: IPAM CSV & Schema

### 2.1 CSV-Struktur

Die `ipam.csv` ist eine komma-separierte Datei mit Header und 20 Spalten:

| Spalte | Typ | Pflicht | Bemerkung |
|---|---|---|---|
| `IP Address` | string (IPv4) | ja | Primärschlüssel; Pattern: 4 Oktette 0–255 |
| `Name` | string | nein | DNS-Name, z. B. `SRV-04.rbgooe.at` |
| `MAC Address` | string | nein | Im Export leer |
| `DHCP Client Identifier` | string | nein | Im Export leer |
| `Status` | enum | ja | `Used` oder `Unused` |
| `Type` | enum | nein | `""`, `Host`, `Unmanaged`, `IPv4 Network`, `PTR Record`, `A Record, PTR Record`, `Broadcast` |
| `Discover Now` | string | nein | Im Export leer |
| `Usage` | enum | nein | `""`, `DNS`, `DNS, DHCP` |
| `Lease State` | string | nein | Im Export leer |
| `User Name` | string | nein | Im Export leer |
| `Task Name` | string | nein | Im Export leer |
| `First Discovered` | UTC-Timestamp oder `""` | nein | Format: `yyyy-MM-dd HH:mm:ss UTC` |
| `Last Discovered` | UTC-Timestamp oder `""` | nein | Format: `yyyy-MM-dd HH:mm:ss UTC` |
| `OS` | string | nein | Im Export leer |
| `NetBIOS Name` | string | nein | Im Export leer |
| `Device Type(s)` | string | nein | Im Export leer |
| `Open Port(s)` | string | nein | Im Export leer |
| `Fingerprint` | string | nein | Im Export leer |
| `Comment` | string | nein | Freitext, z. B. Gateway-Hinweise |
| `Site` | string | nein | Im Export leer |

### 2.2 Datenqualität & Besonderheiten

- **256 Zeilen** im Beispielexport (IP-Adressen `10.0.0.2` bis `10.0.0.257`).
- **Ungültige IP-Adressen**: `10.0.0.256` und `10.0.0.257` verletzen das IPv4-Muster (Oktett > 255). Diese werden als Fehler ausgewiesen und übersprungen.
- **Unused-Regel**: Bei `Status = "Unused"` müssen `Name`, `Type` und `Usage` leer sein.
- **Discovery-Freshness**: `Last Discovered` reicht von `2018-03-27` bis `2020-12-09` – alt, aber fachlich relevant.
- **Ein CSV = ein Netz**: Mehrere CSVs können hochgeladen werden, um mehrere Netze zu verwalten.

### 2.3 Key-Strategie

- **`ipam_rows`**: Key `[ipamImportId, rowIndex]` (wie CDP).
- **`ipam_latest`**: Key `ipAddress` (wie CDP `hostAdapterKey`).
  - Bei mehreren Netzen mit identischen IP-Adressen gewinnt der neueste Import (analog zu CDP).
  - Da verschiedene Netze in der Praxis unterschiedliche IP-Bereiche haben, ist das unkritisch.
  - Falls künftig mehrere Netze mit Overlap unterstützt werden sollen, kann der Key auf `${ipamImportId}::${ipAddress}` erweitert werden.

---

## 3. Architekturentscheidung: CDP-Muster folgen

Der IPAM-Import wird **exakt nach dem CDP-Muster** implementiert, da CDP der beste Blueprint für einen CSV-Import mit eigener Speicherung ist:

| Aspekt | CDP (Vorbild) | IPAM (neu) |
|---|---|---|
| Dateityp-Erkennung | `CDP_REQUIRED_HEADERS` | `IPAM_REQUIRED_HEADERS` |
| Meta-Typ | `CdpImportMeta` | `IpamImportMeta` |
| Row-Typ | `CdpRow` | `IpamRow` |
| Latest-Typ | `CdpLatest` | `IpamLatest` |
| DB-Stores | `cdp_imports`, `cdp_rows`, `cdp_latest` | `ipam_imports`, `ipam_rows`, `ipam_latest` |
| Import-Funktion | `importCdpCsv` | `importIpamCsv` |
| Display-Mapping | `mapCdpDisplayFields` | `mapIpamDisplayFields` |
| Hook | `useAllCdpLatest` | `useAllIpamLatest` |
| Panel | `CdpPanel` | `IpamPanel` |
| Tab in Networking | `cdp` | `ipam` |

---

## 4. Detaillierte Änderungen

### 4.1 Domain-Typen (`src/domain/models/types.ts`)

**`ImportFileKind` erweitern:**
```ts
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam";
```

**Neue Typen hinzufügen (nach `CdpLatest`):**
```ts
export interface IpamImportMeta {
  ipamImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
}

export interface IpamRow {
  ipamImportId: string;
  rowIndex: number;
  ipAddress: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface IpamLatest {
  ipAddress: string;
  importedAt: string;
  ipamImportId: string;
  rowIndex: number;
  name: string | null;
  status: string | null;
  type: string | null;
  usage: string | null;
  firstDiscovered: string | null;
  lastDiscovered: string | null;
  comment: string | null;
  site: string | null;
  macAddress: string | null;
  os: string | null;
  netBiosName: string | null;
  deviceTypes: string | null;
  openPorts: string | null;
  fingerprint: string | null;
}
```

### 4.2 Parse-Helper (`src/lib/xlsx/parseHelpers.ts`)

**`IPAM_REQUIRED_HEADERS` definieren:**
```ts
export const IPAM_REQUIRED_HEADERS = ["IP Address", "Status", "Type"] as const;
```

**`detectParsedFileKind` erweitern** (vor `return "rvtools"`):
```ts
const hasIpamHeaders = sheets.some((sheet) =>
  IPAM_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
);
if (hasIpamHeaders) return "ipam";
```

**`IpamDisplayFields` Interface & `mapIpamDisplayFields` Funktion:**
```ts
export interface IpamDisplayFields {
  name: string | null;
  status: string | null;
  type: string | null;
  usage: string | null;
  firstDiscovered: string | null;
  lastDiscovered: string | null;
  comment: string | null;
  site: string | null;
  macAddress: string | null;
  os: string | null;
  netBiosName: string | null;
  deviceTypes: string | null;
  openPorts: string | null;
  fingerprint: string | null;
}

export function mapIpamDisplayFields(row: Record<string, unknown>): IpamDisplayFields {
  return {
    name: toStr(row["Name"]),
    status: toStr(row["Status"]),
    type: toStr(row["Type"]),
    usage: toStr(row["Usage"]),
    firstDiscovered: toStr(row["First Discovered"]),
    lastDiscovered: toStr(row["Last Discovered"]),
    comment: toStr(row["Comment"]),
    site: toStr(row["Site"]),
    macAddress: toStr(row["MAC Address"]),
    os: toStr(row["OS"]),
    netBiosName: toStr(row["NetBIOS Name"]),
    deviceTypes: toStr(row["Device Type(s)"]),
    openPorts: toStr(row["Open Port(s)"]),
    fingerprint: toStr(row["Fingerprint"]),
  };
}
```

**IPv4-Validierungsfunktion:**
```ts
const IPV4_OCTET = "(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})";
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`);

export function isValidIpv4(ip: string): boolean {
  return IPV4_PATTERN.test(ip);
}
```

### 4.3 DB-Schema (`src/data/db/index.ts`)

**`DB_VERSION` erhöhen:** `20` → `21`

**`RVToolsDBSchema` erweitern** (nach `cdp_latest`):
```ts
ipam_imports: {
  key: string;
  value: IpamImportMeta;
  indexes: { fileChecksum: string; importedAt: string };
};
ipam_rows: {
  key: [string, number];
  value: IpamRow;
  indexes: { ipamImportId: string; ipAddress: string };
};
ipam_latest: {
  key: string;
  value: IpamLatest;
  indexes: { ipAddress: string };
};
```

**`StoreName`-Typ erweitern:**
```ts
| "ipam_imports" | "ipam_rows" | "ipam_latest"
```

**`ALL_STORES`-Array erweitern.**

**`STORE_DELETE_LABELS` erweitern:**
```ts
ipam_imports: "IPAM Importe",
ipam_rows: "IPAM Zeilen",
ipam_latest: "IPAM Latest",
```

**Upgrade-Callback erweitern** (neuer `if`-Block für v21):
```ts
if (!db.objectStoreNames.contains("ipam_imports")) {
  const imports = db.createObjectStore("ipam_imports", { keyPath: "ipamImportId" });
  imports.createIndex("fileChecksum", "fileChecksum");
  imports.createIndex("importedAt", "importedAt");
}
if (!db.objectStoreNames.contains("ipam_rows")) {
  const rows = db.createObjectStore("ipam_rows", { keyPath: ["ipamImportId", "rowIndex"] });
  rows.createIndex("ipamImportId", "ipamImportId");
  rows.createIndex("ipAddress", "ipAddress");
}
if (!db.objectStoreNames.contains("ipam_latest")) {
  const latest = db.createObjectStore("ipam_latest", { keyPath: "ipAddress" });
  latest.createIndex("ipAddress", "ipAddress");
}
```

**Query-/Delete-Helper hinzufügen** (analog zu CDP):
- `getIpamImportByChecksum(checksum)`
- `getIpamImports()`
- `putIpamImport(meta)`
- `batchPutIpamRows(items, batchSize)`
- `batchPutIpamLatest(items, batchSize)`
- `getAllIpamLatest()`
- `getIpamLatestByIpAddresses(ips)`
- `deleteIpamImport(ipamImportId)` – inkl. `rebuildIpamLatestForIp(ip)`
- `estimateIpamImportSizesBytes(importIds)`

### 4.4 Import-Service (`src/domain/services/importService.ts`)

**Imports erweitern:** `getIpamImportByChecksum`, `putIpamImport`, `batchPutIpamRows`, `batchPutIpamLatest`, `getIpamLatestByIpAddresses`, `IPAM_REQUIRED_HEADERS`, `mapIpamDisplayFields`, `isValidIpv4`.

**`IPAM_UI_HEADERS` definieren** (Spalten, die in der Tabelle angezeigt werden):
```ts
const IPAM_UI_HEADERS = [
  "Name", "Status", "Type", "Usage", "First Discovered", "Last Discovered",
  "Comment", "Site", "MAC Address", "OS", "NetBIOS Name", "Device Type(s)",
  "Open Port(s)", "Fingerprint",
] as const;
```

**`findIpamSheet` Funktion:**
```ts
function findIpamSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    IPAM_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}
```

**`importIpamCsv` Funktion** (analog zu `importCdpCsv`):
- Duplikat-Prüfung via Checksum
- Sheet finden via `findIpamSheet`
- UI-Header-Warnungen
- Meta speichern (`putIpamImport`)
- Rows + Latest-Candidates bauen:
  - `ipAddress = toStr(row["IP Address"])`
  - IPv4-Validierung via `isValidIpv4` – ungültige IPs als Warning überspringen
  - `rawData` via `toRawRowData(row)`
  - Display-Fields via `mapIpamDisplayFields(row)`
- Rows speichern (`batchPutIpamRows`)
- Latest aktualisieren (wie CDP: `isTechInfoNewerOrEqual` für Import-Zeitvergleich)

**Branching in `importRvtoolsXlsx` erweitern** (nach `if (parsed.fileKind === "cdp")`):
```ts
if (parsed.fileKind === "ipam") {
  return await importIpamCsv(file, checksum, parsed, warnings, errors, report);
}
```

### 4.5 Upload-Seite (`src/pages/UploadSnapshots.tsx`)

**`StoredUpload`-Typ erweitern:**
```ts
| { kind: "ipam"; id: string; importedAt: string; ipam: IpamImportMeta }
```

**`buildStoredUploads` erweitern:** IPAM-Imports abfragen und hinzufügen.

**`useUploadSnapshotsView` erweitern:**
- `getIpamImports()` in der `queryFn` abfragen
- `estimateIpamImportSizesBytes` für Größenschätzung
- `handleDeleteIpamImport` hinzufügen
- `uploadIdsByKind` um `ipam: []` erweitern
- Upload-Card-Rendering für `kind === "ipam"` erweitern

**Accept-Attribut:** `.xlsx,.xls,.csv` bleibt unverändert (CSV wird bereits akzeptiert).

### 4.6 Import-Controller (`src/hooks/useImportController.tsx`)

**`fileKindLabel` erweitern:**
```ts
if (kind === "ipam") return "IPAM-Netzwerkdaten";
```

### 4.7 Hooks (`src/hooks/useActiveSnapshots.ts`)

**`useAllIpamLatest` hinzufügen:**
```ts
export function useAllIpamLatest() {
  return useQuery({
    queryKey: ["ipamLatestAll"],
    queryFn: getAllIpamLatest,
    staleTime: STALE_MS,
  });
}
```

### 4.8 IPAM-Panel (`src/pages/IpamPanel.tsx` – neu)

Neue Datei, analog zu `CdpSwitchPorts.tsx`:

- `IpamPanel` exportieren
- `useAllIpamLatest` für Daten
- `VirtualTable` mit `ColumnDef<IpamLatest>`
- KPI-Cards: Gesamt-IPs, Used, Unused, mit DNS-Namen, mit Discovery-Daten
- EmptyState mit Upload-Link
- Spalten:
  - IP Address (mono, sortierbar)
  - Name
  - Status (Badge: Used=grün, Unused=grau)
  - Type
  - Usage
  - First Discovered
  - Last Discovered
  - Comment
  - Site
  - MAC Address (mono)
  - OS
  - NetBIOS Name
  - Device Type(s)
  - Open Port(s)
  - Fingerprint

### 4.9 Networking-Seite (`src/pages/Networking.tsx`)

**`NetworkTab`-Typ erweitern:**
```ts
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam";
```

**Tab hinzufügen:**
```tsx
<TabsTrigger value="ipam">IPAM</TabsTrigger>
...
<TabsContent value="ipam" className="space-y-4">
  <IpamPanel />
</TabsContent>
```

**Import:** `import { IpamPanel } from "@/pages/IpamPanel";`

### 4.10 Glossary (optional)

Falls gewünscht, kann ein `NET_IPAM_COLUMNS` und `NET_IPAM_KPI` in `src/lib/glossaries/networking.ts` ergänzt werden, um Info-Tooltips für Spalten und KPIs zu bieten. Dies ist optional und kann in einem Folge-Schritt erfolgen.

---

## 5. Risiken & Edge Cases

| Risiko | Mitigation |
|---|---|
| Ungültige IP-Adressen (`10.0.0.256`, `10.0.0.257`) | `isValidIpv4`-Validierung, Zeile überspringen, Warning ausgeben |
| Mehrere Netze mit gleichen IP-Adressen | `ipam_latest` mit Key `ipAddress` – neuester Import gewinnt (analog CDP) |
| Sehr große CSV-Dateien | `batchPut` mit Batch-Size 5000 (wie CDP) |
| DB-Migration | `DB_VERSION` auf 21 erhöhen, neue Stores werden nur angelegt, bestehende Daten bleiben unberührt |
| CSV-Encoding | `@e965/xlsx` behandelt UTF-8 automatisch |
| IPAM-CSV ohne alle UI-Header | Warnung pro fehlender Spalte, Werte als `null` übernehmen (wie CDP) |

---

## 6. Testing

- **Unit-Tests:** `isValidIpv4`, `mapIpamDisplayFields`, `detectParsedFileKind` mit IPAM-Sheets
- **Integration-Test:** Import einer IPAM-CSV, Prüfung der Stores
- **Manuell:** IPAM-CSV hochladen, Tab in Networking prüfen, mehrere CSVs hochladen, Löschen eines IPAM-Imports
- `npm run test` und `npm run lint` ausführen
- `npm run build` prüfen

---

## 7. Datei-Übersicht

| Datei | Aktion |
|---|---|
| `src/domain/models/types.ts` | `ImportFileKind` + 3 neue Typen |
| `src/lib/xlsx/parseHelpers.ts` | `IPAM_REQUIRED_HEADERS`, `isValidIpv4`, `mapIpamDisplayFields`, `detectParsedFileKind` erweitern |
| `src/data/db/index.ts` | `DB_VERSION` 21, 3 neue Stores, Query/Delete-Helper |
| `src/domain/services/importService.ts` | `importIpamCsv`, Branching |
| `src/hooks/useImportController.tsx` | `fileKindLabel` erweitern |
| `src/hooks/useActiveSnapshots.ts` | `useAllIpamLatest` |
| `src/pages/UploadSnapshots.tsx` | `StoredUpload` + UI für IPAM |
| `src/pages/IpamPanel.tsx` | Neu: Panel mit Tabelle |
| `src/pages/Networking.tsx` | Tab „IPAM" hinzufügen |

---

## 8. Out of Scope

- IPAM-Subnetz-Information aus Dateinamen ableiten (z. B. `10.0.0.0_24.csv`)
- IP-Adress-Bereichs-Validierung (Subnetz-Konsistenz)
- DNS-Forward/Reverse-Consistency-Checks (im Schema als Warning erwähnt)
- Export-Funktion für IPAM-Daten