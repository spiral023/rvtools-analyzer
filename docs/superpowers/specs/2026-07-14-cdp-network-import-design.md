# CDP-Daten: CSV-Import + Netzwerk-Ansicht — Design

**Datum:** 2026-07-14
**Status:** Freigegeben

## Ziel

CDP-Daten (Cisco Discovery Protocol, per PowerCLI-Skript als CSV exportiert) sollen über die
bestehende Upload-Seite importierbar sein. Im Netzwerk-Bereich zeigt ein neuer Tab
„CDP/Switch-Ports" die physische Switch-Anbindung der ESX-Hosts: welcher vmnic hängt an
welchem Switch/Port, inkl. KPIs und durchsuchbarer Tabelle.

## Eingabeformat (CSV)

Semikolon-getrennt, Werte in doppelten Anführungszeichen, UTF-8. Eine Zeile pro
physischem Adapter (vmnic/vusb) pro Host; eine Datei kann mehrere Hosts und mehrere
vCenter enthalten.

```
"vCenter";"Cluster";"VMHost";"HostConnectionState";"PhysicalAdapter";"LinkStatus";
"MACAddress";"CDPDeviceID";"CDPPortID";"CDPManagementIP";"CDPSwitchAddress";
"CDPHardwarePlatform";"CDPSoftwareVersion";"CDPNativeVLAN";"CDPMTU";"CDPAvailable";
"QueryStatus";"ErrorMessage"
```

- **Pflicht-Header (Erkennung):** `VMHost`, `PhysicalAdapter`, `CDPDeviceID`, `CDPAvailable`
- **Optionale Header:** alle übrigen; fehlt einer, Warnung „Spalte X fehlt, Wert leer" (Muster Tech-Info)
- Adapter ohne CDP (`CDPAvailable = False`, z. B. `vusb0`) haben leere CDP-Felder — Zeile bleibt erhalten.

## Import-Pipeline (Ansatz A: bestehende Pipeline erweitern)

1. **Dateiannahme:** `isSpreadsheetFile` in `src/hooks/useImportController.tsx` wird zu
   `isSupportedImportFile` erweitert: zusätzlich `.csv` (und MIME `text/csv`).
2. **Worker:** unverändert `PARSE_FILE` mit Buffer — SheetJS (`@e965/xlsx`) erkennt
   CSV-Inhalt inkl. Semikolon-Delimiter und Quoting automatisch und liefert ein
   Ein-Sheet-Ergebnis.
3. **Erkennung:** `detectParsedFileKind` in `src/lib/xlsx/parseHelpers.ts` um Typ `"cdp"`
   erweitern (Pflicht-Header vorhanden ⇒ `cdp`). `ImportFileKind` in
   `src/domain/models/types.ts` um `"cdp"` ergänzen. CSV ohne CDP-Header ⇒ Fehler
   „Keine gültige CDP-CSV erkannt (erwartete Spalten: VMHost, PhysicalAdapter,
   CDPDeviceID, CDPAvailable)."
4. **`importCdpCsv()`** in `src/domain/services/importService.ts` (Muster
   `importTechInfoXlsx`):
   - Checksummen-Duplikatschutz über `cdp_imports`.
   - Zeilen ohne `VMHost` **oder** ohne `PhysicalAdapter` überspringen (Warnung mit Zeilennummer).
   - `hostAdapterKey = normalize(VMHost) + "::" + normalize(PhysicalAdapter)`
     (`normalize` = trim + lowercase, wie `normalizeVmNameForMatch`).
   - Alle Zeilen nach `cdp_rows`, Latest-Kandidaten nach `cdp_latest`
     (latest wins per `importedAt`, Vergleich via `isTechInfoNewerOrEqual`).
5. **Label:** `fileKindLabel` ⇒ „CDP-Netzwerkdaten".

## Datenmodell (IndexedDB, Schema-Version +1)

| Store | KeyPath | Indizes | Inhalt |
|-------|---------|---------|--------|
| `cdp_imports` | `cdpImportId` | `fileChecksum` | Metadaten: Dateiname, Checksum, `rowCount`, `importedAt` |
| `cdp_rows` | `[cdpImportId, rowIndex]` | `cdpImportId`, `hostAdapterKey` | vollständige Rohzeile (`rawData`) + Normalisierungsfelder |
| `cdp_latest` | `hostAdapterKey` | `hostNorm` | eine Zeile pro Host+Adapter, gemappte Felder |

`CdpLatest`-Felder (alle `string | null`, außer wo angegeben):
`hostAdapterKey`, `hostNorm`, `host`, `adapter`, `vcenter`, `cluster`,
`hostConnectionState`, `linkStatus`, `mac`, `cdpDeviceId`, `cdpPortId`, `cdpMgmtIp`,
`cdpSwitchAddress`, `cdpPlatform`, `cdpSoftware`, `nativeVlan`, `mtu`,
`cdpAvailable: boolean`, `queryStatus`, `importedAt`, `cdpImportId`, `rowIndex: number`.

**Löschen eines Imports** (`deleteCdpImport`): betroffene `hostAdapterKey`s aus `cdp_rows`
sammeln, Import + Rows löschen, dann `cdp_latest` je Key aus verbleibenden `cdp_rows`
neu aufbauen (Muster `rebuildTechInfoLatestForVm`). Kein Rest-Import ⇒ Latest-Eintrag löschen.

**Backup:** kein Handlungsbedarf — `userDataBackup` sichert nur Einstellungen/Szenarien,
keine Importdaten.

## Upload-Seite (`src/pages/UploadSnapshots.tsx`)

- `StoredUpload` um `kind: "cdp"` erweitern (Meta: `CdpImportMeta`).
- Liste, Einzel-Löschung, Größenschätzung (`estimateCdpImportSizesBytes`) und
  „Alle Daten löschen" (`deleteAllData`) einbeziehen.
- Beschreibungstext der Upload-Zone um CDP-CSV ergänzen.

## Netzwerk-Seite: Tab „CDP/Switch-Ports"

`src/pages/Networking.tsx`: vierter Tab `value="cdp"`, Label „CDP/Switch-Ports",
`NetworkTab`-Typ erweitern. Panel `CdpPanel` in `src/pages/CdpSwitchPorts.tsx`
(Muster `VlanUsagePanel`: exportiertes Panel, kein eigenes Routing).

### Datenzugriff & globaler Filter

- Hook `useAllCdpLatest()` in `src/hooks/useActiveSnapshots.ts` (Query über `cdp_latest`,
  Muster `useAllTechInfoClientLatest`).
- Filterung als reine Funktion `filterCdpRows(rows, filters)` in `src/lib/cdp.ts`,
  im Panel per `useMemo` gegen `filters` aus `useActiveSnapshotIds()` angewendet:
  - **vCenter:** CSV-`vcenter` → `normalizeVcenterId()` (aus `importService` nach
    `parseHelpers` extrahieren, dort wiederverwenden) und gegen `filters.vcenterIds` prüfen.
  - **Cluster:** Namensvergleich `cluster` ∈ `filters.clusters`.
  - **Hosts:** Namensvergleich `host` ∈ `filters.hosts` (case-insensitiv, getrimmt).
  - **Suche:** `globalFilter={filters.search}` an `VirtualTable`.
- Leere Filterlisten ⇒ keine Einschränkung (Konvention der übrigen Panels).

### KPIs (Abdeckung & Basiszahlen)

| KPI | Definition |
|-----|------------|
| Hosts mit CDP-Daten | distinct `hostNorm` mit ≥ 1 Adapter `cdpAvailable = true` |
| Physische Adapter | Anzahl Zeilen (nach Filter) |
| Adapter ohne CDP-Daten | Zeilen mit `cdpAvailable ≠ true`; Warn-Färbung bei > 0 |
| Eindeutige Switches | distinct nicht-leere `cdpDeviceId` |

### Tabelle (eine Zeile pro Adapter)

`VirtualTable`, sortierbar: **Host | Cluster | Adapter | Link | Switch | Port |
Native VLAN | MTU | Plattform | Mgmt-IP | MAC**. Leere Werte als „—"; `Switch`
(`cdpDeviceId`) mit `title`-Tooltip inkl. `cdpSoftware`. MAC/VLAN/MTU in `font-mono-data`.

### Glossar (`src/lib/glossaries/networking.ts`)

Neu: `NET_CDP_KPI` (4 Einträge), `NET_CDP_COLUMNS` (11 Spalten), `NET_CDP_SECTIONS.table`.
Quellenattribution: `CDP-CSV · Spaltenname` (analog bestehender Konvention).

### Leerzustand

- Ohne RVTools-Snapshot bleibt die Netzwerk-Seite wie bisher komplett im `EmptyState`.
- Mit Snapshots, aber ohne CDP-Import: Panel zeigt Hinweis „Keine CDP-Daten importiert.
  Laden Sie eine CDP-CSV auf der Upload-Seite hoch." mit Link `/upload`.

## Edge-Cases

| Fall | Verhalten |
|------|-----------|
| Gleicher Host+Adapter in mehreren Dateien | latest wins (`importedAt`) |
| Gleicher Host+Adapter doppelt in einer Datei | letzte Zeile gewinnt (Map-Semantik) |
| Zeile ohne `VMHost`/`PhysicalAdapter` | übersprungen + Warnung |
| `CDPAvailable = False` (z. B. `vusb0`) | Zeile bleibt, CDP-Felder „—", zählt in KPI 3 |
| vCenter-Name weicht zwischen Dateien ab (Beispieldaten!) | kein Problem — Key ist Host+Adapter, `vcenter` wird überschrieben |
| CSV mit BOM | SheetJS entfernt BOM beim Parsen |
| Nicht-CDP-CSV | Fehler mit erwarteten Spalten, kein Import |
| Duplikat (gleiche Checksum) | Fehler „bereits importiert" |

## Tests

- `src/test/parseHelpers.test.ts` (erweitern): `detectParsedFileKind` erkennt CDP-Header;
  Nicht-CDP-CSV ⇒ kein `cdp`.
- `src/test/cdpImport.test.ts` (neu): Zeilen-Mapping inkl. leerer CDP-Felder und
  Boolean-Parsing (`"True"/"False"`); Skip-Logik + Warnungen; latest wins bei zwei
  Importen; `deleteCdpImport` baut `cdp_latest` korrekt neu auf (Fake-Store-Muster
  wie bestehende Import-Tests).
- `src/test/cdpFilter.test.ts` (neu, reine Funktion `filterCdpRows`): vCenter-Id-Abgleich,
  Cluster-/Host-Namensvergleich, leere Filter = alles.

## Nicht im Scope (YAGNI)

- Redundanz-/Konsistenz-Checks (Single-Switch-Hosts, MTU-/Native-VLAN-Abweichungen) — späterer Ausbau möglich.
- Join CDP ↔ RVTools `vNIC`-Sheet (Abgleich vmnic-Ebene).
- LLDP-Daten.
- Switch-zentrierte Aggregatansicht.
- Anzeige von `QueryStatus`/`ErrorMessage` in der Tabelle (nur im Datenmodell vorgehalten).
