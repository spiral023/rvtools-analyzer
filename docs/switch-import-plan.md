# Plan: Cisco-Switch-TXT-Import & „Cisco Switch"-Tab im Netzwerk-Bereich

## 1. Ziel & Überblick

Die Anwendung soll Cisco-NX-OS-CLI-Ausgaben (`switch.txt`) über den bestehenden Datei-Upload importieren können. Eine TXT-Datei enthält die gefilterte Ausgabe von `show interface status`-Befehlen für **mehrere Switches und mehrere Abfragen** (z. B. `connected`, `notconnec`). Mehrere TXT-Dateien können hochgeladen werden. Die Daten sollen auf der Netzwerk-Seite in einem neuen Tab „Cisco Switch" in einer `VirtualTable` angezeigt werden – analog zu den bestehenden Tabs (Security, Host-Netzwerk, VLAN, CDP).

Der Implementierungsansatz folgt dem **CDP-Import-Muster** für die Speicherung (Meta/Rows/Latest), erfordert aber einen **eigenen Text-Parser**, da die switch.txt keine CSV- oder XLSX-Datei ist, sondern eine unstrukturierte CLI-Ausgabe mit festen Spaltenbreiten.

---

## 2. Datenanalyse: switch.txt & Schema

### 2.1 Dateiformat

Die `switch.txt` ist eine UTF-8-Textdatei mit Cisco-NX-OS-CLI-Ausgaben. Sie besteht aus **Abschnitten**, die jeweils durch einen Prompt eingeleitet werden:

```
agrznx93oc18-10# sh int statu | in connected

mgmt0         --                 connected routed    full    1000    --        

Eth1/1        esxxsrv2270_Port2(T connected trunk     full    25G     SFP-H25GB-CU3M
...
```

**Struktur:**
1. **Prompt-Zeile**: `<hostname># <command>` – leitet einen neuen Abschnitt ein
2. **Leerzeile** nach dem Prompt
3. **Interface-Zeilen**: festes Spaltenlayout mit 7 Spalten
4. **Leerzeilen** zwischen Abschnitten

### 2.2 Spalten der Interface-Zeilen

Die Interface-Daten haben ein festes Spaltenlayout (whitespace-getrennt):

| Spalte | Feld | Beispiel | Bemerkung |
|---|---|---|---|
| 1 | Port | `Eth1/1`, `mgmt0` | Interface-Bezeichnung |
| 2 | Name | `esxxsrv2270_Port2(T`, `--` | Beschreibung/Gegenstelle; kann Leerzeichen enthalten und wird durch `(` abgeschnitten |
| 3 | Status | `connected`, `notconnec` | Gekürzte Schreibweise möglich |
| 4 | Vlan/Mode | `trunk`, `routed` | Switchport-Modus |
| 5 | Duplex | `full`, `auto` | Aushandlungsstatus |
| 6 | Speed | `1000`, `25G`, `auto` | Portgeschwindigkeit |
| 7 | Type | `SFP-H25GB-CU3M`, `--` | Transceiver/Kabeltyp |

### 2.3 Schema-Analyse (`switch.schema.json`)

Das Schema beschreibt die normalisierte Repräsentation:

- **`switches[]`**: Jeder Switch (Hostname) kommt nur einmal vor
- **`queries[]`**: Pro Switch mehrere Abfragen (command + filter)
- **`interfaces[]`**: Pro Abfrage mehrere Interface-Einträge

**Validierungsregeln aus dem Schema:**
- `hostname`: Pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$`
- `command`: Enum mit 4 erlaubten Werten (`sh int statu | in connected`, `sh int statu | in notconnec`, `show interface status | include connected`, `show interface status | include notconnect`)
- `filter`: `connected`, `notconnec`, `notconnect`
- `interface`: Pattern `^(?:mgmt0|Eth[0-9]+/[0-9]+(?:/[0-9]+)?)$`
- `status`: `connected`, `notconnec`, `notconnect`
- `mode`: `trunk`, `routed`
- `duplex`: `full`, `half`, `auto`
- `speed`: `1000`, `10G`, `25G`, `40G`, `100G`, `auto`
- `transceiver`: Pattern `^(?:--|[A-Za-z0-9._/-]+)$`

**Konsistenzregeln (allOf):**
- `mgmt0` → `mode = "routed"`, `transceiver = "--"`
- `status = "connected"` → `duplex ∈ {full, half}`, `speed ≠ "auto"`
- `status ∈ {notconnec, notconnect}` → `duplex = "auto"`, `speed = "auto"`

**Datenqualitätsregeln (x-dataQualityRules):**
- `unique-switch-hostname` (error): Hostname darf nur einmal vorkommen
- `unique-interface-per-query` (error): Interface pro Abfrage nur einmal
- `link-negotiation-consistency` (error): Verbundene Ports brauchen ausgehandelte Werte
- `duplicate-endpoint-description` (warning): Gleiche Beschreibungen auf mehreren Ports
- `disconnected-server-link` (warning): Nicht verbundene Trunk-Ports mit Serverbeschreibung prüfen

### 2.4 Key-Strategie

- **`switch_rows`**: Key `[switchImportId, rowIndex]` (wie CDP)
- **`switch_latest`**: Key `${hostname}::${interface}` (wie CDP `hostAdapterKey`)
  - Bei mehreren Importen mit dem gleichen Switch+Interface gewinnt der neueste Import
  - Da Switch-Daten periodisch aktualisiert werden, ist das der richtige Ansatz

---

## 3. Architekturentscheidung: CDP-Muster + eigener Text-Parser

Der Switch-Import folgt dem CDP-Muster für die **Speicherung** (Meta/Rows/Latest), benötigt aber einen **eigenen Text-Parser**, da die switch.txt keine CSV-Datei ist:

| Aspekt | CDP (Vorbild) | Switch (neu) |
|---|---|---|
| Dateityp | `.csv` | `.txt` |
| Dateiformat | CSV mit Headern | Cisco CLI-Textausgabe |
| Dateityp-Erkennung | `CDP_REQUIRED_HEADERS` | Prompt-Pattern `^[A-Za-z0-9][A-Za-z0-9._-]*#\s+(sh int statu\|show interface status)` |
| Parser | `@e965/xlsx` (CSV-Modus) | Eigener Text-Parser (`parseSwitchTxt`) |
| Meta-Typ | `CdpImportMeta` | `SwitchImportMeta` |
| Row-Typ | `CdpRow` | `SwitchRow` |
| Latest-Typ | `CdpLatest` | `SwitchLatest` |
| DB-Stores | `cdp_imports`, `cdp_rows`, `cdp_latest` | `switch_imports`, `switch_rows`, `switch_latest` |
| Import-Funktion | `importCdpCsv` | `importSwitchTxt` |
| Display-Mapping | `mapCdpDisplayFields` | `mapSwitchDisplayFields` |
| Hook | `useAllCdpLatest` | `useAllSwitchLatest` |
| Panel | `CdpPanel` | `SwitchPanel` |
| Tab in Networking | `cdp` | `cisco-switch` |
| Latest-Key | `hostAdapterKey` (`${hostNorm}::${adapterNorm}`) | `switchInterfaceKey` (`${hostnameNorm}::${interfaceNorm}`) |

**Wichtiger Unterschied:** CDP/IPAM nutzen den XLSX-Worker zum Parsen. Die switch.txt ist eine reine Textdatei, die nicht über den XLSX-Worker geparst werden kann. Stattdessen wird ein **direkter Text-Parser** in `importService.ts` verwendet, der die Datei als Text einliest und mit Regex/Zeilen-Splitting parst.

---

## 4. Detaillierte Änderungen

### 4.1 Domain-Typen (`src/domain/models/types.ts`)

**`ImportFileKind` erweitern:**
```ts
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "switch";
```

**Neue Typen hinzufügen (nach `CdpLatest`):**
```ts
export interface SwitchImportMeta {
  switchImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface SwitchRow {
  switchImportId: string;
  rowIndex: number;
  hostname: string;
  hostnameNorm: string;
  command: string;
  filter: string;
  interface: string;
  /** `${hostnameNorm}::${interfaceNorm}` — Primärschlüssel in switch_latest, Index in switch_rows. */
  switchInterfaceKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface SwitchLatest {
  switchInterfaceKey: string;
  hostnameNorm: string;
  hostname: string;
  interface: string;
  importedAt: string;
  switchImportId: string;
  rowIndex: number;
  description: string | null;
  status: string | null;
  mode: string | null;
  duplex: string | null;
  speed: string | null;
  transceiver: string | null;
}
```

### 4.2 Parse-Helper (`src/lib/xlsx/parseHelpers.ts`)

**`ParsedFileKind` erweitern:**
```ts
export type ParsedFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "switch";
```

**`SwitchDisplayFields` Interface & `mapSwitchDisplayFields` Funktion:**
```ts
export interface SwitchDisplayFields {
  description: string | null;
  status: string | null;
  mode: string | null;
  duplex: string | null;
  speed: string | null;
  transceiver: string | null;
}

export function mapSwitchDisplayFields(row: Record<string, unknown>): SwitchDisplayFields {
  return {
    description: toStr(row["description"]),
    status: toStr(row["status"]),
    mode: toStr(row["mode"]),
    duplex: toStr(row["duplex"]),
    speed: toStr(row["speed"]),
    transceiver: toStr(row["transceiver"]),
  };
}
```

**`buildSwitchInterfaceKey` Funktion:**
```ts
export function buildSwitchInterfaceKey(hostname: string, interfaceName: string): string {
  return `${normalizeVmNameForMatch(hostname)}::${interfaceName.trim().toLowerCase()}`;
}
```

**Hinweis:** `detectParsedFileKind` wird **nicht** erweitert, da die Switch-Erkennung nicht über Sheet-Header läuft, sondern über einen eigenen Text-Parser (siehe 4.4). Die Erkennung erfolgt direkt im `importService.ts` vor dem Worker-Einsatz.

### 4.3 Switch-Text-Parser (`src/lib/switchParser.ts` – neu)

Neue Datei mit dem eigentlichen Parser für die Cisco-CLI-Textausgabe:

```ts
export interface ParsedSwitchSection {
  hostname: string;
  command: string;
  filter: string;
  interfaces: ParsedSwitchInterface[];
}

export interface ParsedSwitchInterface {
  interface: string;
  description: string;
  status: string;
  mode: string;
  duplex: string;
  speed: string;
  transceiver: string;
}

export interface ParsedSwitchFile {
  switches: Map<string, ParsedSwitchSection[]>;
  totalInterfaceCount: number;
}

/** Erkennt, ob ein Textinhalt eine Switch-CLI-Ausgabe ist. */
export function isSwitchTxtContent(text: string): boolean {
  // Prompt-Pattern: hostname# sh int statu | in ...  oder  hostname# show interface status | include ...
  const promptPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*#\s+(?:sh int statu|show interface status)\s+\|\s+(?:in|include)\s+\S+/m;
  return promptPattern.test(text);
}

/** Parst eine komplette switch.txt-Datei in Abschnitte. */
export function parseSwitchTxt(text: string): ParsedSwitchFile {
  // 1. Datei in Zeilen splitten
  // 2. Prompt-Zeilen erkennen (Pattern: ^hostname# command)
  // 3. Nach jedem Prompt die Interface-Zeilen sammeln
  // 4. Interface-Zeilen mit Regex/Whitespace-Split in 7 Spalten zerlegen
  //    - Spezialfall: Name-Spalte kann `--` sein oder Text mit `(` (wird abgeschnitten)
  //    - Spezialfall: Leerzeilen und reine Whitespace-Zeilen überspringen
  // 5. Abschnitte nach Hostname gruppieren (gleiche Hostnames zusammenführen)
  // 6. Filter aus Command ableiten: `| in connected` → "connected", `| in notconnec` → "notconnec"
  // ...
}
```

**Parser-Logik im Detail:**

1. **Prompt-Erkennung**: Regex `^([A-Za-z0-9][A-Za-z0-9._-]*)#\s+(sh int statu \| in (connected|notconnec)|show interface status \| include (connected|notconnect))$`
2. **Interface-Zeilen-Split**: Jede Interface-Zeile wird an Whitespace gesplittet. Da die Spalten fest sind, reicht ein `split(/\s+/)` mit 7 Tokens. Die `description`-Spalte kann jedoch Leerzeichen enthalten – daher wird die Zeile mit einem Regex geparst, das die ersten 7 Whitespace-getrennten Tokens extrahiert, aber die Description als alles zwischen Port und Status auffasst.
3. **Description-Behandlung**: Die Description-Spalte endet oft mit `(T` (abgeschnitten). Der Parser nimmt den Rohwert und schneidet bei `(` ab.
4. **Filter-Extraktion**: Aus dem Command wird der Filter extrahiert: `| in connected` → `connected`, `| in notconnec` → `notconnec`.
5. **Hostname-Gruppierung**: Abschnitte mit gleichem Hostname werden zusammengeführt.

### 4.4 Import-Service (`src/domain/services/importService.ts`)

**Imports erweitern:** `getSwitchImportByChecksum`, `putSwitchImport`, `batchPutSwitchRows`, `batchPutSwitchLatest`, `getSwitchLatestBySwitchInterfaceKeys`, `mapSwitchDisplayFields`, `buildSwitchInterfaceKey`, `SwitchRow`, `SwitchLatest`, `isSwitchTxtContent`, `parseSwitchTxt`.

**Switch-Erkennung vor dem Worker:**

Da `.txt`-Dateien nicht über den XLSX-Worker geparst werden können, wird die Erkennung direkt in `importRvtoolsXlsx` vor dem Worker-Einsatz durchgeführt:

```ts
// In importRvtoolsXlsx, nach checksum-Berechnung, vor workerParse:
const isTxt = file.name.toLowerCase().endsWith(".txt");
if (isTxt) {
  const text = new TextDecoder().decode(buffer);
  if (isSwitchTxtContent(text)) {
    return await importSwitchTxt(file, checksum, text, warnings, errors, report);
  }
  return {
    success: false,
    warnings,
    errors: [...errors, "Unbekannte TXT-Datei. Erwartet: Cisco-Switch-CLI-Ausgabe (show interface status)."],
  };
}
```

**`importSwitchTxt` Funktion** (analog zu `importCdpCsv`, aber mit Text-Parser):

```ts
export async function importSwitchTxt(
  file: File,
  checksum: string,
  text: string,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  // 1. Duplikat-Prüfung via Checksum
  const existing = await getSwitchImportByChecksum(checksum);
  if (existing) {
    return { success: false, fileKind: "switch", warnings: [], errors: ["Diese Switch-Datei wurde bereits importiert."] };
  }

  // 2. Text parsen
  const parsed = parseSwitchTxt(text);
  if (parsed.switches.size === 0) {
    return { success: false, fileKind: "switch", warnings, errors: [...errors, "Keine Switch-Daten in der Datei gefunden."] };
  }

  // 3. Meta speichern
  const importedAt = new Date().toISOString();
  const switchImportId = shortId();
  report("Switch Metadaten speichern", 35);
  await putSwitchImport({
    switchImportId,
    importedAt,
    fileName: file.name,
    fileChecksum: checksum,
    rowCount: parsed.totalInterfaceCount,
    switchCount: parsed.switches.size,
  });

  // 4. Rows + Latest-Candidates bauen
  report("Switch Zeilen speichern", 45, `${parsed.totalInterfaceCount.toLocaleString("de-DE")} Interfaces...`);
  const fullRows: SwitchRow[] = [];
  const latestCandidates = new Map<string, SwitchLatest>();
  let rowIndex = 0;

  for (const [hostname, sections] of parsed.switches) {
    for (const section of sections) {
      for (const iface of section.interfaces) {
        const hostnameNorm = normalizeVmNameForMatch(hostname);
        const switchInterfaceKey = buildSwitchInterfaceKey(hostname, iface.interface);
        const rawData: Record<string, unknown> = {
          hostname, command: section.command, filter: section.filter,
          interface: iface.interface, description: iface.description,
          status: iface.status, mode: iface.mode, duplex: iface.duplex,
          speed: iface.speed, transceiver: iface.transceiver,
        };
        fullRows.push({
          switchImportId, rowIndex, hostname, hostnameNorm,
          command: section.command, filter: section.filter,
          interface: iface.interface, switchInterfaceKey, importedAt,
          rawData: toRawRowData(rawData),
        });
        latestCandidates.set(switchInterfaceKey, {
          switchInterfaceKey, hostnameNorm, hostname,
          interface: iface.interface, importedAt, switchImportId, rowIndex,
          ...mapSwitchDisplayFields(rawData),
        });
        rowIndex++;
      }
    }
  }

  // 5. Rows speichern
  await batchPutSwitchRows(fullRows, 5000);

  // 6. Latest aktualisieren (wie CDP)
  report("Switch Latest aktualisieren", 75);
  const existingLatest = await getSwitchLatestBySwitchInterfaceKeys([...latestCandidates.keys()]);
  const existingMap = new Map(existingLatest.map((e) => [e.switchInterfaceKey, e]));
  const latestUpdates: SwitchLatest[] = [];
  for (const [key, candidate] of latestCandidates) {
    if (isTechInfoNewerOrEqual(candidate.importedAt, existingMap.get(key)?.importedAt)) {
      latestUpdates.push(candidate);
    }
  }
  if (latestUpdates.length > 0) {
    await batchPutSwitchLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} Switch Interfaces`);
  return { success: true, fileKind: "switch", warnings, errors, sheetStats: {} };
}
```

### 4.5 DB-Schema (`src/data/db/index.ts`)

**`DB_VERSION` erhöhen:** `20` → `21`

**`RVToolsDBSchema` erweitern** (nach `cdp_latest`):
```ts
switch_imports: {
  key: string;
  value: SwitchImportMeta;
  indexes: { fileChecksum: string; importedAt: string };
};
switch_rows: {
  key: [string, number];
  value: SwitchRow;
  indexes: { switchImportId: string; switchInterfaceKey: string };
};
switch_latest: {
  key: string;
  value: SwitchLatest;
  indexes: { hostnameNorm: string };
};
```

**`StoreName`-Typ erweitern:**
```ts
| "switch_imports" | "switch_rows" | "switch_latest"
```

**`ALL_STORES`-Array erweitern.**

**`STORE_DELETE_LABELS` erweitern:**
```ts
switch_imports: "Switch Importe",
switch_rows: "Switch Zeilen",
switch_latest: "Switch Latest",
```

**`deleteByKeyPrefix`-Typ-Union erweitern:**
```ts
storeName: "rawSheetBlobs" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "switch_rows",
```

**`estimateSizeByIndex`-Typ-Union erweitern:**
```ts
storeName: SnapshotScopedStoreName | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "switch_rows",
indexName: "snapshotId" | "techInfoImportId" | "techInfoClientImportId" | "cdpImportId" | "switchImportId",
```

**Upgrade-Callback erweitern** (neuer `if`-Block für v21):
```ts
// v21: Cisco-Switch-Daten (TXT-Import) — Muster wie CDP.
if (!db.objectStoreNames.contains("switch_imports")) {
  const imports = db.createObjectStore("switch_imports", { keyPath: "switchImportId" });
  imports.createIndex("fileChecksum", "fileChecksum");
  imports.createIndex("importedAt", "importedAt");
}
if (!db.objectStoreNames.contains("switch_rows")) {
  const rows = db.createObjectStore("switch_rows", { keyPath: ["switchImportId", "rowIndex"] });
  rows.createIndex("switchImportId", "switchImportId");
  rows.createIndex("switchInterfaceKey", "switchInterfaceKey");
}
if (!db.objectStoreNames.contains("switch_latest")) {
  const latest = db.createObjectStore("switch_latest", { keyPath: "switchInterfaceKey" });
  latest.createIndex("hostnameNorm", "hostnameNorm");
}
```

**Query-/Delete-Helper hinzufügen** (analog zu CDP):
- `getSwitchImportByChecksum(checksum)`
- `getSwitchImports()`
- `putSwitchImport(meta)`
- `batchPutSwitchRows(items, batchSize)`
- `batchPutSwitchLatest(items, batchSize)`
- `getAllSwitchLatest()`
- `getSwitchLatestBySwitchInterfaceKeys(keys)`
- `deleteSwitchImport(switchImportId)` – inkl. `rebuildSwitchLatestForKey(switchInterfaceKey)`
- `estimateSwitchImportSizesBytes(importIds)`

**`buildSwitchLatestFromRow` und `rebuildSwitchLatestForKey`** (analog zu CDP):
```ts
function buildSwitchLatestFromRow(row: SwitchRow): SwitchLatest {
  return {
    switchInterfaceKey: row.switchInterfaceKey,
    hostnameNorm: row.hostnameNorm,
    hostname: row.hostname,
    interface: row.interface,
    importedAt: row.importedAt,
    switchImportId: row.switchImportId,
    rowIndex: row.rowIndex,
    ...mapSwitchDisplayFields(row.rawData),
  };
}

async function rebuildSwitchLatestForKey(switchInterfaceKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("switch_rows", "switchInterfaceKey", switchInterfaceKey);
  const latestRow = rows.reduce<SwitchRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);
  if (!latestRow) {
    await db.delete("switch_latest", switchInterfaceKey);
    return;
  }
  await db.put("switch_latest", buildSwitchLatestFromRow(latestRow));
}

export async function deleteSwitchImport(switchImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("switch_rows", "switchImportId", switchImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.switchInterfaceKey) affectedKeys.add(row.switchInterfaceKey);
  }
  await db.delete("switch_imports", switchImportId);
  await deleteByKeyPrefix("switch_rows", switchImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildSwitchLatestForKey(key)));
}
```

### 4.6 Upload-Seite (`src/pages/UploadSnapshots.tsx`)

**`StoredUpload`-Typ erweitern:**
```ts
| { kind: "switch"; id: string; importedAt: string; switch: SwitchImportMeta }
```

**`buildStoredUploads` erweitern:** Switch-Imports abfragen und hinzufügen.

**`useUploadSnapshotsView` erweitern:**
- `getSwitchImports()` in der `queryFn` abfragen
- `estimateSwitchImportSizesBytes` für Größenschätzung
- `handleDeleteSwitchImport` hinzufügen
- `uploadIdsByKind` um `switch: []` erweitern
- Upload-Card-Rendering für `kind === "switch"` erweitern

**Accept-Attribut erweitern:** `.xlsx,.xls,.csv,.txt` (TXT wird neu akzeptiert).

**UI-Texte anpassen:**
- Dropzone-Beschreibung: „RVTools / Tech-Info (XLSX), CDP-CSV oder Switch-TXT hierher ziehen oder klicken"
- Upload-Card für Switch: Dateiname, Interface-Anzahl, Switch-Anzahl anzeigen

### 4.7 Import-Controller (`src/hooks/useImportController.tsx`)

**`fileKindLabel` erweitern:**
```ts
if (kind === "switch") return "Cisco-Switch-Daten";
```

### 4.8 Hooks (`src/hooks/useActiveSnapshots.ts`)

**`useAllSwitchLatest` hinzufügen:**
```ts
export function useAllSwitchLatest() {
  return useQuery({
    queryKey: ["switchLatestAll"],
    queryFn: getAllSwitchLatest,
    staleTime: STALE_MS,
  });
}
```

### 4.9 Switch-Panel (`src/pages/SwitchPanel.tsx` – neu)

Neue Datei, analog zu `CdpSwitchPorts.tsx`:

- `SwitchPanel` exportieren
- `useAllSwitchLatest` für Daten
- `VirtualTable` mit `ColumnDef<SwitchLatest>`
- KPI-Cards: Gesamt-Interfaces, Connected, Not Connected, Eindeutige Switches
- EmptyState mit Upload-Link
- Spalten:
  - Hostname (mono, sortierbar)
  - Interface (mono, sortierbar)
  - Description (Gegenstelle/Portname)
  - Status (Badge: connected=grün, notconnec=rot/gelb)
  - Mode (trunk/routed)
  - Duplex (full/auto)
  - Speed (mono)
  - Transceiver (mono)

**Beispiel-Struktur:**
```tsx
export function SwitchPanel() {
  const { data: allRows = [], isLoading } = useAllSwitchLatest();
  const columns = useMemo(() => createColumns(), []);
  const rows = allRows;

  const connectedCount = useMemo(() => rows.filter((r) => r.status === "connected").length, [rows]);
  const notConnectedCount = useMemo(() => rows.filter((r) => r.status !== "connected").length, [rows]);
  const switchCount = useMemo(() => new Set(rows.map((r) => r.hostname)).size, [rows]);

  if (isLoading) return <PanelLoadingState />;
  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<Router className="h-6 w-6" />}
        title="Keine Switch-Daten"
        description="Laden Sie eine Cisco-Switch-TXT auf der Upload-Seite hoch, um Interface-Status auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Switches" value={formatNum(switchCount)} icon={<Router />} />
        <KpiCard title="Interfaces gesamt" value={formatNum(rows.length)} icon={<Cable />} />
        <KpiCard title="Connected" value={formatNum(connectedCount)} severity="ok" icon={<CheckCircle />} />
        <KpiCard title="Not Connected" value={formatNum(notConnectedCount)} severity={notConnectedCount > 0 ? "warn" : "ok"} icon={<AlertCircle />} />
      </KpiGrid>
      <VirtualTable data={rows} columns={columns} height={500} exportFileName="cisco-switch-ports" />
    </div>
  );
}
```

### 4.10 Networking-Seite (`src/pages/Networking.tsx`)

**`NetworkTab`-Typ erweitern:**
```ts
type NetworkTab = "security" | "host" | "vlan" | "cdp" | "cisco-switch";
```

**Tab hinzufügen:**
```tsx
<TabsTrigger value="cisco-switch">Cisco Switch</TabsTrigger>
...
<TabsContent value="cisco-switch" className="space-y-4">
  <SwitchPanel />
</TabsContent>
```

**Import:** `import { SwitchPanel } from "@/pages/SwitchPanel";`

### 4.11 Glossary (optional)

Falls gewünscht, kann ein `NET_SWITCH_COLUMNS` und `NET_SWITCH_KPI` in `src/lib/glossaries/networking.ts` ergänzt werden, um Info-Tooltips für Spalten und KPIs zu bieten. Dies ist optional und kann in einem Folge-Schritt erfolgen.

---

## 5. Parser-Details: `parseSwitchTxt`

Der Parser ist der komplexeste Teil. Hier die detaillierte Logik:

### 5.1 Prompt-Erkennung

```ts
const PROMPT_REGEX = /^([A-Za-z0-9][A-Za-z0-9._-]*)#\s+(sh int statu \| in (connected|notconnec)|show interface status \| include (connected|notconnect))$/;
```

### 5.2 Interface-Zeilen-Parsing

Interface-Zeilen haben ein festes Spaltenlayout. Die Herausforderung ist die `description`-Spalte, die Leerzeichen enthalten kann. Der Parser verwendet ein Regex, das die 7 Spalten extrahiert:

```ts
// Pattern für Interface-Zeilen:
// ^(\S+)\s+        -- Port (Spalte 1)
// (.+?)\s+         -- Description (Spalte 2, non-greedy bis zum nächsten bekannten Status-Wort)
// (connected|notconnec|notconnect)\s+  -- Status (Spalte 3)
// (trunk|routed)\s+                     -- Mode (Spalte 4)
// (full|half|auto)\s+                   -- Duplex (Spalte 5)
// (\S+)\s+                              -- Speed (Spalte 6)
// (\S+)$                                -- Transceiver (Spalte 7)

const INTERFACE_LINE_REGEX = /^(\S+)\s+(.+?)\s+(connected|notconnec|notconnect)\s+(trunk|routed)\s+(full|half|auto)\s+(\S+)\s+(\S+)$/;
```

**Alternative (robuster):** Da die Status-Spalte immer ein bekannter Wert ist (`connected`, `notconnec`, `notconnect`), kann der Parser die Zeile an diesem Wort aufteilen:

1. Port = erstes Token
2. Description = alles zwischen Port und Status-Wort
3. Status = bekanntes Status-Wort
4. Rest = 4 weitere Whitespace-getrennte Tokens (mode, duplex, speed, transceiver)

### 5.3 Description-Behandlung

- `--` → leerer String (`""`)
- Text mit `(` → abschneiden bei `(` (z. B. `esxxsrv2270_Port2(T` → `esxxsrv2270_Port2`)
- Trimmen von führenden/nachfolgenden Leerzeichen

### 5.4 Leerzeilen und Whitespace

- Leerzeilen werden übersprungen
- Zeilen mit nur Whitespace werden übersprungen
- Der Prompt kann von Leerzeilen gefolgt sein

### 5.5 Hostname-Gruppierung

Abschnitte mit gleichem Hostname werden in der `Map<string, ParsedSwitchSection[]>` zusammengeführt. Jeder Abschnitt behält seinen eigenen Command und Filter.

---

## 6. Risiken & Edge Cases

| Risiko | Mitigation |
|---|---|
| TXT-Datei ist keine Switch-Ausgabe | `isSwitchTxtContent`-Prüfung vor dem Parsen, klare Fehlermeldung |
| Interface-Zeilen mit ungewöhnlichem Format | Robuster Parser mit Fallback, ungültige Zeilen als Warning überspringen |
| Description mit Leerzeichen | Regex mit non-greedy Description oder Split am Status-Wort |
| Mehrere Dateien mit gleichen Switches | `switch_latest` mit Key `hostname::interface` – neuester Import gewinnt (analog CDP) |
| Sehr große TXT-Dateien | `batchPut` mit Batch-Size 5000 (wie CDP) |
| DB-Migration | `DB_VERSION` auf 21 erhöhen, neue Stores werden nur angelegt, bestehende Daten bleiben unberührt |
| Encoding-Probleme | `TextDecoder` mit UTF-8 verwenden |
| Abweichende Command-Schreibweisen | Schema akzeptiert `statu`/`status` und `in`/`include` (wie in switch.schema.json definiert) |
| Prompt ohne `#` | Parser erkennt nur Zeilen mit `hostname# command`-Pattern |

---

## 7. Testing

- **Unit-Tests:**
  - `isSwitchTxtContent` mit gültigen/ungültigen Texten
  - `parseSwitchTxt` mit der Beispieldatei `referenzdaten/switch.txt`
  - `mapSwitchDisplayFields` mit Rohdaten
  - `buildSwitchInterfaceKey` mit Hostname + Interface
- **Integration-Test:** Import einer Switch-TXT, Prüfung der Stores
- **Manuell:**
  - Switch-TXT hochladen, Tab in Networking prüfen
  - Mehrere TXTs hochladen, Latest-Logik prüfen
  - Löschen eines Switch-Imports
- `npm run test` und `npm run lint` ausführen
- `npm run build` prüfen

---

## 8. Datei-Übersicht

| Datei | Aktion |
|---|---|
| `src/domain/models/types.ts` | `ImportFileKind` + 3 neue Typen (`SwitchImportMeta`, `SwitchRow`, `SwitchLatest`) |
| `src/lib/xlsx/parseHelpers.ts` | `ParsedFileKind` erweitern, `SwitchDisplayFields`, `mapSwitchDisplayFields`, `buildSwitchInterfaceKey` |
| `src/lib/switchParser.ts` | **Neu:** Text-Parser für Cisco-CLI-Ausgaben |
| `src/data/db/index.ts` | `DB_VERSION` 21, 3 neue Stores, Query/Delete-Helper, `buildSwitchLatestFromRow`, `rebuildSwitchLatestForKey` |
| `src/domain/services/importService.ts` | `importSwitchTxt`, TXT-Erkennung vor Worker, Branching |
| `src/hooks/useImportController.tsx` | `fileKindLabel` erweitern |
| `src/hooks/useActiveSnapshots.ts` | `useAllSwitchLatest` |
| `src/pages/UploadSnapshots.tsx` | `StoredUpload` + UI für Switch, `.txt` im Accept |
| `src/pages/SwitchPanel.tsx` | **Neu:** Panel mit Tabelle |
| `src/pages/Networking.tsx` | Tab „Cisco Switch" hinzufügen |

---

## 9. Out of Scope

- VLAN-Information aus Switch-Daten ableiten
- Port-Channel-Informationen
- Fehlerzähler und Interface-Statistiken
- Switch-Modell-Information
- Export-Funktion für Switch-Daten
- Cross-Referenz zwischen CDP-Daten (ESXi-Seite) und Switch-Daten (Cisco-Seite)