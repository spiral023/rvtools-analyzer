# Eramon-Netzwerkdaten: CSV-Import + zwei Netzwerk-Ansichten — Design

**Datum:** 2026-07-22
**Status:** Freigegeben

## Ziel

Zwei neue Eramon-Datenquellen sollen über die bestehende Upload-Seite als CSV importierbar
sein und je in einem eigenen Tab im Netzwerk-Bereich als durchsuchbare Tabelle mit KPIs
erscheinen:

1. **Eramon Switch-Ports** (`Eramon_Device_InterfaceDaten`) — Port-/Interface-Inventar pro
   Switch (eine Zeile pro Switch-Port: Beschreibung, Bandbreite, Status).
2. **Eramon MAC-Tabelle** (`Eramon_L2_Daten`) — L2-Sicht: welche IP/MAC/DNS-Name/VLAN
   wurde an welchem Switch-Port gesehen (0..n Zeilen pro Switch-Port).

Beide Quellen werden **eigenständig** umgesetzt (kein Join mit RVTools/CDP/IPAM), das
Schlüsseldesign bereitet einen späteren CDP-Join aber vor (siehe „Nicht im Scope").

## Architekturentscheidung

Beide Importe folgen dem etablierten, getesteten **CDP-Import-Muster** (Semikolon-CSV →
XLSX-Worker → Meta/Rows/Latest-Stores → exportiertes Panel im Netzwerk-Tab). Eine andere
Architektur (eigener Worker, relationale Zwischenschicht) wäre Overhead ohne Nutzen.

## Eingabeformate (CSV)

Semikolon-getrennt, UTF-8. Anders als die CDP-CSV sind die Werte **nicht** in
Anführungszeichen gequotet. SheetJS (`@e965/xlsx`) erkennt Delimiter und Quoting
automatisch, daher unkritisch. Eine Datei kann mehrere Switches enthalten. Größenordnung
~6k Zeilen (Interface), unkritisch mit Batch-Insert.

### Eramon Switch-Ports (`Eramon_Device_InterfaceDaten`)

```
device_name;port_name;port_desc;bandbreite;port_status
SWITCH_A;Ethernet1/53;SERVER_A(vpc100-ch1) - (SWITCH_A - Eth1/53) [E:3211];1E+11;1
SWITCH_A;Ethernet1/2;;25000000000;2
```

| Feld | Bedeutung | Bemerkung |
|---|---|---|
| `device_name` | Switch-Hostname | z. B. `grzxnx93oc3-1.domain.at` |
| `port_name` | Interface | heterogen: `Ethernet1/53`, `port-channel24`, `Vlan940`, `Vlan1`, `mgmt0` |
| `port_desc` | freie Beschreibung/Gegenstelle | oft leer; enthält Gegenstelle, VPC, IPs, Tags `[E:3211]`, `[stc]` |
| `bandbreite` | Bandbreite in **bps** | teils wiss. Notation: `1E+11`=100G, `2E+11`=200G, `25000000000`=25G, `10000000000`=10G, `1000000000`=1G |
| `port_status` | Status | `1` = aktiv/up, `2` = down; sonstige Werte = Rohwert |

- **Pflicht-Header (Erkennung):** `device_name`, `port_name`, `port_status`
- **Optionale Header:** `port_desc`, `bandbreite` — fehlt einer, Warnung „Spalte X fehlt, Wert leer"

### Eramon MAC-Tabelle (`Eramon_L2_Daten`)

```
ip;name;interface;mac;dnsname;vlan
10.18.3.14;grznxx93oc18-37.rbgooe.at;Ethernet1/24;E1:69:BA:54:49:F1;raitec_...-gi0-0-1.domain.at;303
10.18.4.31;grznxx93oc3-35.rbgooe.at;Ethernet1/23;01:90:8F:E5:D3:73;sbc01....at;158
10.18.4.31;grznxx93oc3-35.rbgooe.at;Ethernet1/21;01:90:8F:E5:D3:73;sbc01....at;303
```

| Feld | Bedeutung | Bemerkung |
|---|---|---|
| `ip` | IP-Adresse des Endgeräts | Attribut (überschreibbar) |
| `name` | Switch-Hostname | Teil des Schlüssels |
| `interface` | Switch-Port | Teil des Schlüssels |
| `mac` | MAC-Adresse | Teil des Schlüssels |
| `dnsname` | DNS-Name des Endgeräts | Attribut |
| `vlan` | VLAN-ID | Teil des Schlüssels |
| `type` | (optional, aus erweiterter Abfrage) | nur gespeichert, nicht in Standardansicht |
| `interfacedescription` | (optional) | nur gespeichert, nicht in Standardansicht |

- **Pflicht-Header (Erkennung):** `name`, `interface`, `mac`, `vlan`
- **Optionale Header:** `ip`, `dnsname`, `type`, `interfacedescription`
- Eine MAC kann auf mehreren VLANs/Ports erscheinen (Beispiel `10.18.4.31`: VLANs 158/303/304).

## Dateierkennung

`detectParsedFileKind` in `src/lib/xlsx/parseHelpers.ts` wird um beide Typen erweitert,
Header-Abgleich **case-insensitiv**:

- `device_name` + `port_name` + `port_status` vorhanden ⇒ `eramon-iface`
- `name` + `interface` + `mac` + `vlan` vorhanden ⇒ `eramon-l2`

`ImportFileKind` in `src/domain/models/types.ts` um `"eramon-iface"` und `"eramon-l2"`
erweitern, `ParsedFileKind` in `parseHelpers.ts` analog. CSV ohne passende Header ⇒
bestehende Fehlermeldung mit den erwarteten Spalten je Typ.

## Datenmodell (IndexedDB, Schema-Version +1)

Je Quelle drei Stores nach CDP-Muster.

### Eramon Switch-Ports

| Store | KeyPath | Indizes | Inhalt |
|---|---|---|---|
| `eramon_iface_imports` | `ifaceImportId` | `fileChecksum`, `importedAt` | Metadaten: Dateiname, Checksum, `rowCount`, `switchCount`, `importedAt` |
| `eramon_iface_rows` | `[ifaceImportId, rowIndex]` | `ifaceImportId`, `switchPortKey` | vollständige Rohzeile + Normalisierungsfelder |
| `eramon_iface_latest` | `switchPortKey` | `switchNorm` | eine Zeile pro Switch+Port, gemappte Felder |

`switchPortKey = normalizeVmNameForMatch(device_name) + "::" + normalize(port_name)`
(`normalize` = trim + lowercase). Genau 1 Zeile pro Switch+Port ⇒ „latest wins" per
`importedAt` (Vergleich `isTechInfoNewerOrEqual`), exakt CDP-Logik.

`EramonIfaceLatest`-Felder: `switchPortKey`, `switchNorm`, `deviceName`, `portName`,
`portDesc: string | null`, `bandbreiteBps: number | null`, `portStatus: string | null`
(Rohwert), `statusLabel: string | null` (`"aktiv"`/`"down"`/Rohwert), `importedAt`,
`ifaceImportId`, `rowIndex: number`.

### Eramon MAC-Tabelle

| Store | KeyPath | Indizes | Inhalt |
|---|---|---|---|
| `eramon_l2_imports` | `l2ImportId` | `fileChecksum`, `importedAt` | Metadaten: Dateiname, Checksum, `rowCount`, `switchCount`, `importedAt` |
| `eramon_l2_rows` | `[l2ImportId, rowIndex]` | `l2ImportId`, `l2EntryKey` | vollständige Rohzeile + Normalisierungsfelder |
| `eramon_l2_latest` | `l2EntryKey` | `switchNorm` | eine Zeile pro Switch+Port+MAC+VLAN, gemappte Felder |

`l2EntryKey = normalizeVmNameForMatch(name) + "::" + normalize(interface) + "::" +
normalize(mac) + "::" + String(vlan).trim()`. Die Identität einer L2-Zeile ist die
Kombination **Switch+Interface+MAC+VLAN**; `ip` und `dnsname` sind überschreibbare
Attribute. Mehrere VLANs/MACs pro Port bleiben als getrennte Zeilen erhalten. „latest wins"
per `importedAt`.

`EramonL2Latest`-Felder: `l2EntryKey`, `switchNorm`, `switchName`, `interface`, `mac`,
`vlan: string | null`, `ip: string | null`, `dnsName: string | null`,
`type: string | null`, `interfaceDescription: string | null`, `importedAt`, `l2ImportId`,
`rowIndex: number`.

### Normalisierung beim Import

- `bandbreite`: robust zu `number` (bps) parsen — sowohl `"1E+11"` (String, wiss.
  Notation) als auch `100000000000` (Number) ergeben `100000000000`. Nicht parsebar ⇒ `null`.
- `port_status`: `1` → `"aktiv"`, `2` → `"down"`, sonst Rohwert-String in `statusLabel`;
  `portStatus` behält den Rohwert.
- Switch/Port bzw. Switch/Interface/MAC über dieselben Helfer wie CDP normalisiert
  (`normalizeVmNameForMatch`, trim+lowercase) — **Join-Vorbereitung**.
- Zeilen ohne Switch **oder** ohne Port/Interface ⇒ übersprungen + Warnung mit Zeilennummer.

### Import-Funktionen

`importEramonIfaceCsv()` und `importEramonL2Csv()` in
`src/domain/services/importService.ts`, Muster `importCdpCsv`: Checksummen-Duplikatschutz,
Skip-Logik, alle Zeilen nach `_rows`, Latest-Kandidaten nach `_latest` (Map-Semantik:
letzte Zeile je Key gewinnt innerhalb einer Datei; latest wins per `importedAt` über
Dateien hinweg).

### Löschen eines Imports

`deleteEramonIfaceImport` / `deleteEramonL2Import` analog `deleteCdpImport`: betroffene
Keys aus `_rows` sammeln, Import + Rows löschen, `_latest` je Key aus verbleibenden Rows
neu aufbauen (`rebuild…LatestForKey`). Kein Rest-Import ⇒ Latest-Eintrag löschen.

## Upload-Seite (`src/pages/UploadSnapshots.tsx`)

- `StoredUpload` um `kind: "eramon-iface"` und `kind: "eramon-l2"` erweitern
  (Meta: `EramonIfaceImportMeta` / `EramonL2ImportMeta`).
- Beide Import-Listen in `buildStoredUploads` abfragen; Einzel-Löschung,
  Größenschätzung (`estimateEramonIfaceImportSizesBytes` /
  `estimateEramonL2ImportSizesBytes`) und „Alle Daten löschen" (`deleteAllData`)
  einbeziehen; `uploadIdsByKind` erweitern.
- `.csv` ist bereits akzeptiert (CDP/IPAM) — keine Accept-Änderung.
- Dropzone-Beschreibung um „Eramon Switch-Ports / MAC-Tabelle (CSV)" ergänzen.
- Upload-Card je Typ: Dateiname, Zeilen-/Switch-Anzahl.

## Import-Controller (`src/hooks/useImportController.tsx`)

`fileKindLabel` erweitern: `"eramon-iface"` ⇒ „Eramon Switch-Ports",
`"eramon-l2"` ⇒ „Eramon MAC-Tabelle".

## Hooks (`src/hooks/useActiveSnapshots.ts`)

`useAllEramonIfaceLatest()` und `useAllEramonL2Latest()` (Muster `useAllCdpLatest`,
Query über den jeweiligen `_latest`-Store, `staleTime: STALE_MS`).

## Netzwerk-Seite (`src/pages/Networking.tsx`)

`NetworkTab`-Typ um `"eramon-iface"` und `"eramon-l2"` erweitern, zwei neue Tabs mit
exportierten Panels. Tab-Namen mit „Eramon"-Suffix zur Abgrenzung vom bestehenden Tab
„CDP/Switch-Ports" (ESX-Seite).

### Tab „Switch-Ports (Eramon)" — `EramonIfacePanel` (`src/pages/EramonIfacePanel.tsx`, neu)

KPIs:
| KPI | Definition |
|---|---|
| Switches | distinct `deviceName` |
| Ports gesamt | Zeilen (nach Suche) |
| Aktive Ports | `portStatus = "1"` (bzw. `statusLabel = "aktiv"`) |
| Down-Ports | `portStatus = "2"`; Warn-Färbung bei > 0 |

Spalten (`VirtualTable`, sortierbar): **Switch | Port | Beschreibung | Bandbreite | Status**
- Bandbreite human-readable (`100 Gbit/s`, `25 Gbit/s`) via reiner Formatter-Funktion; Rohwert-bps im `title`.
- Status als Badge: aktiv = grün, down = grau/gelb.
- leere Beschreibung als „—".
- Export-Dateiname `eramon-switch-ports`.

### Tab „MAC-Tabelle (Eramon)" — `EramonL2Panel` (`src/pages/EramonL2Panel.tsx`, neu)

KPIs:
| KPI | Definition |
|---|---|
| Einträge gesamt | Zeilen (nach Suche) |
| Eindeutige MACs | distinct `mac` |
| Eindeutige IPs | distinct nicht-leere `ip` |
| VLANs | distinct nicht-leere `vlan` |

Spalten: **IP | DNS-Name | MAC | Switch | Interface | VLAN**
- IP/MAC/VLAN in `font-mono-data`, leere Werte „—".
- `type`/`interfaceDescription` werden gespeichert, aber nur als Spalte eingeblendet, wenn im Datensatz befüllt (YAGNI in Standardansicht).
- Export-Dateiname `eramon-mac-tabelle`.

### Filter — bewusste Abweichung von CDP

Eramon-Daten haben **keine** vCenter/Cluster/ESX-Host-Zuordnung (physische
Netzwerk-Switches). Der globale Snapshot-Filter (vCenter/Cluster/Host) greift daher
**nicht**; die Panels reagieren nur auf die **Volltextsuche** (`filters.search` an
`VirtualTable` als `globalFilter`). Sortierbare Spalten + Suche genügen für ein
Nachschlagewerk.

### Leerzustand

- Ohne RVTools-Snapshot bleibt die Netzwerk-Seite wie bisher komplett im `EmptyState`.
- Mit Snapshots, ohne Eramon-Import: Panel-Hinweis „Keine Eramon-Daten importiert. Laden
  Sie die CSV auf der Upload-Seite hoch." mit Link `/upload`.

## Glossar (`src/lib/glossaries/networking.ts`)

Neu: `NET_ERAMON_IFACE_KPI`/`NET_ERAMON_IFACE_COLUMNS` und
`NET_ERAMON_L2_KPI`/`NET_ERAMON_L2_COLUMNS`. Quellenattribution: `Eramon · Spaltenname`
(analog bestehender Konvention).

## Edge-Cases

| Fall | Verhalten |
|---|---|
| `bandbreite` als `"1E+11"` (String) | zu `100000000000` (Number) geparst |
| `bandbreite` als `100000000000` (Number) | unverändert übernommen |
| `bandbreite` leer/nicht parsebar | `bandbreiteBps = null`, Anzeige „—" |
| `port_status` unbekannt (≠ 1/2) | `statusLabel` = Rohwert |
| gleiche MAC, mehrere VLANs/Ports (L2) | getrennte Zeilen (vierteiliger Key) |
| gleicher Switch+Port+MAC+VLAN doppelt in einer Datei | letzte Zeile gewinnt (Map-Semantik) |
| gleicher Key in mehreren Dateien | latest wins (`importedAt`) |
| Zeile ohne Switch/Port bzw. Switch/Interface | übersprungen + Warnung |
| CSV mit BOM | SheetJS entfernt BOM |
| Nicht-Eramon-CSV | Fehler mit erwarteten Spalten, kein Import |
| Duplikat (gleiche Checksum) | Fehler „bereits importiert" |
| `port_name` = SVI/Port-Channel/mgmt0 | normale Zeile, keine Sonderbehandlung |

## Tests

Muster `src/test/cdpImport.test.ts` / `cdpFilter.test.ts` (Fake-Store).

- **`parseHelpers`-Erweiterung:** `detectParsedFileKind` erkennt beide Eramon-Header,
  unterscheidet sie von CDP/IPAM; falsche Header ⇒ kein Eramon-Typ.
- **Interface-Import:** `bandbreite`-Parsing (`"1E+11"` **und** `100000000000` →
  `100000000000`; leer → `null`); `port_status`-Mapping (1/2/sonst); Skip-Logik +
  Warnungen; latest-wins bei zwei Importen; `deleteEramonIfaceImport` baut `_latest`
  korrekt neu auf.
- **L2-Import:** vierteiliger `l2EntryKey`; mehrere VLANs/MACs pro Port bleiben getrennt;
  latest-wins bei Re-Import; `deleteEramonL2Import` baut `_latest` korrekt neu auf.
- **Bandbreiten-Formatter** (bps → `Gbit/s`/`Mbit/s`) als reine Funktion mit
  Grenzwerten (1G, 10G, 25G, 100G, 200G, null).

## Nicht im Scope (YAGNI)

- Join Eramon ↔ CDP (ESX-Host/vmnic ↔ physischer Switch-Port) — wertvollster Folge-Spec,
  auf echten (nicht pseudonymisierten) Daten zu kalibrieren; Switch-Namens- und
  Port-Schreibweisen-Abgleich ist fehleranfällig (`eth1/14` vs. `eth122`).
- Join Eramon-L2 ↔ IPAM (IP/MAC/DNS-Abgleich).
- Dedizierte Facetten-Filter (Switch-/VLAN-/Status-Dropdown).
- Auswertung von Port-Channels/SVIs als eigene Kategorien.
- Anzeige `type`/`interfacedescription` als feste Spalten in der L2-Standardansicht.
- Parsing/Strukturierung der freien `port_desc` (VPC, Tags, Gegenstelle).
