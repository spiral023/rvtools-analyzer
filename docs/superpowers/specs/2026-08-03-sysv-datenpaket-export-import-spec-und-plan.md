# SysV-Datenpaket: Scope-sicherer ZIP-Export und Wiederimport

**Datum:** 2026-08-03  
**Status:** Implementierungsbereit  
**Zielgruppe:** Implementierende Agenten und Entwickler  
**Abhängigkeit:** Der in `2026-08-03-sysv-modus-spec-und-plan.md` beschriebene SysV-Modus ist vorhanden beziehungsweise wird parallel fertiggestellt.

## 1. Ziel

Unter **Export & Berichte** wird ein neuer Tab **SysV-Datensatz** ergänzt. Ein
VM-Admin kann dort anhand der Tech-Info-Daten genau einen fachlichen Scope
auswählen:

- Bereich,
- Abteilung oder
- verantwortliche Person.

Bei einer Person und bei Organisationszuordnungen werden immer beide
Tech-Info-Rollen berücksichtigt:

```text
SysV ODER SysVStv
```

Aus der Auswahl erzeugt die App lokal im Browser ein ZIP-Datenpaket. Dieses ZIP
kann über den normalen Upload der App wieder importiert werden. Nach dem Import
enthält die lokale Datenbank ausschließlich die VM-bezogenen Daten des
exportierten Scopes sowie den ausdrücklich erlaubten gemeinsamen
Infrastrukturkontext. Das Paket aktiviert über eine enthaltene `modus.json` den
SysV-Modus.

Der Empfänger soll mit dem Paket insbesondere Folgendes können:

- seine VMs inventarisieren und durchsuchen,
- VM-Details und Tech-Info-Zuordnungen ansehen,
- VM-Performance aus RVTools analysieren,
- vROps-VM-Zeitreihen auswerten,
- CPU- und RAM-Rightsizing durchführen,
- innerhalb des bereits begrenzten Pakets zusätzliche normale Filter setzen
  oder entfernen.

Das Entfernen eines globalen Filters darf niemals VMs außerhalb des
exportierten Pakets sichtbar machen. Der physische Paketinhalt ist die harte
Datengrenze; der SysV-Modus und globale Filter bleiben reine UI-Funktionen.

## 2. Verhältnis zur bestehenden SysV-Modus-Spezifikation

Die bestehende SysV-Modus-Spezifikation beschreibt einen weichen persönlichen
Filter auf einem vollständigen lokalen Datenbestand. Dieses Feature ist
additiv und führt eine zweite, strengere Ebene ein:

| Ebene | Bedeutung |
|---|---|
| Paket-Scope | Harte, beim Export materialisierte Datengrenze; nicht entfernbar |
| Persönlicher Systemkontext | Gewöhnlicher, entfernbarer globaler Filter innerhalb des Pakets |
| SysV-Modus | Angepasste Navigation; kein Sicherheitsmechanismus |

`SysvScopePreference` darf für dieses Feature nicht unüberlegt erweitert oder
umgedeutet werden. Der Export erhält einen eigenen Typ
`SysvDataPackageScope`. So bleibt das Verhalten von Settings, Backup und
persönlichem Filter kompatibel.

Nach dem Import eines SysV-Datenpakets wird der persönliche Systemkontext auf
`all` gesetzt. In diesem Zustand bedeutet „Alle Systeme“ ausschließlich alle
VMs des importierten Pakets.

## 3. Verbindliche fachliche Entscheidungen

### 3.1 Der Export ist kein Originaldatei-Archiv

Das ZIP enthält nicht einfach die ursprünglichen RVTools- und vROps-Dateien.
Diese Originaldateien sind im Browser nicht vollständig gespeichert und
würden außerdem fremde VMs enthalten. Stattdessen wird ein eigenes,
versioniertes, maschinenlesbares Paketformat erzeugt.

### 3.2 Relevante vCenter, aber nicht deren vollständiger VM-Bestand

Ein RVTools-Snapshot wird aufgenommen, wenn mindestens eine ausgewählte VM in
diesem Snapshot liegt. Innerhalb dieses Snapshots werden VM-bezogene Daten aber
zeilenweise gefiltert. Andere VMs desselben vCenters dürfen nicht enthalten
sein.

### 3.3 Gemeinsamer Infrastrukturkontext ist erlaubt und sichtbar markiert

Für Rightsizing und Platzierung dürfen die von ausgewählten VMs referenzierten
Hosts und Cluster aufgenommen werden. Diese Datensätze können aggregierte
Kapazitätswerte des gemeinsamen Hosts oder Clusters enthalten, beispielsweise
Gesamtkerne, Gesamtspeicher oder die ursprüngliche Host-VM-Anzahl. Sie dürfen
keine Namen oder Detailzeilen fremder VMs enthalten.

Die UI und das Paketmanifest müssen diesen Anteil als
`shared-capacity-context` kennzeichnen. Vollständige Cluster- oder
vCenter-Analysen dürfen nicht als vollständig dargestellt werden.

### 3.4 vROps wird auf VM-Ebene physisch beschnitten

Version 1 des Pakets enthält ausschließlich vROps-Zeitreihenobjekte vom Typ
`vm`, deren `rvtoolsObjectKey` auf eine ausgewählte VM zeigt. Cluster- und
Host-Zeitreihen werden nicht exportiert, weil sie Lasten anderer Systeme
aggregieren.

Die binären Chunk-Matrizen müssen neu aufgebaut werden. Das bloße Entfernen von
Objektmetadaten ist nicht ausreichend.

### 3.5 Keine Kontaktvorgaben und keine Userdaten

Das Paket enthält insbesondere nicht:

- `maintenance_settings`,
- Vorname oder Nachname aus den Settings,
- aus der ausgewählten Person abgeleitete Kontaktvorgaben,
- Wartungs-Kontaktlisten,
- persönliche Tabellenansichten,
- Filter-Presets,
- Szenarien,
- vCenter-Gruppen,
- sonstige `ui_state`-Datensätze.

Der Import darf `maintenance_settings` weder schreiben noch löschen. Auf einem
frischen Browserprofil bleiben Vorname und Nachname daher leer. Auf einem
bereits verwendeten Browserprofil bleiben dessen persönliche Einstellungen
unverändert.

Der Paketimport darf `splitSysvContactName` nicht aufrufen und keine Person aus
dem Paket in die Kontaktvorgaben kopieren.

### 3.6 Bestehende Analysedaten werden atomar ersetzt

Ein SysV-Datenpaket darf nicht mit einem bereits vorhandenen vollständigen oder
anderen eingeschränkten Datenbestand vermischt werden. Falls importierte
Analysedaten vorhanden sind, zeigt die UI vor dem Schreiben eine ausdrückliche
Bestätigung:

> Das SysV-Datenpaket ersetzt die vorhandenen Analysedaten. Persönliche
> Einstellungen und Kontaktvorgaben bleiben erhalten.

Validierung und Prüfsummenprüfung erfolgen vollständig vor dieser Bestätigung.
Das Ersetzen geschieht in genau einer IndexedDB-Transaktion. Schlägt die
Transaktion fehl, bleiben die vorherigen Daten bestehen.

`deleteSystemData()` darf dafür nicht verwendet werden, weil diese Funktion
auch `ui_state` löscht. Es wird eine eigene Datenbankfunktion mit einer
expliziten Store-Liste implementiert.

## 4. Nicht-Ziele für Version 1

- kein Backend und kein Upload an einen Server,
- keine Authentifizierung, Verschlüsselung oder digitale Signatur,
- keine nachträgliche Erweiterung eines importierten Pakets durch weitere
  Originalimporte,
- kein Zusammenführen mehrerer SysV-Pakete,
- kein vollständiger vCenter-, Host-, Cluster- oder Fill-Up-Datensatz,
- keine vROps-Host- oder vROps-Cluster-Zeitreihen,
- keine panelbasierten `vrops_latest`-Clusterkennzahlen,
- keine Netzwerk-Kontrolldaten aus CDP, IPAM oder Eramon,
- kein Tech-Info-Client-Datensatz,
- kein Userdaten-Backup im Paket,
- keine Pseudonymisierung; das Paket muss seine echten VM-Namen für die lokale
  Zuordnung behalten,
- keine auswählbare Organisationsebene; gefordert sind Bereich, Abteilung und
  Person.

## 5. Begriffe und Domain-Typen

In `src/domain/models/types.ts` werden folgende additive Typen eingeführt.
Benennungen dürfen nur aus zwingenden technischen Gründen abweichen.

```ts
export type SysvDataPackageScope =
  | {
      kind: "area";
      displayName: string;
      normalizedOrganisation: string;
      normalizedArea: string;
    }
  | {
      kind: "department";
      displayName: string;
      normalizedPath: string;
    }
  | {
      kind: "person";
      displayName: string;
      normalizedName: string;
    };

export interface RestrictedDatasetSource {
  kind: "sysv-package";
  packageId: string;
  packageVersion: 1;
  scopeKind: SysvDataPackageScope["kind"];
  scopeLabel: string;
  dataPolicy: "strict-vm-scope-v1";
  sharedCapacityContext: true;
}
```

`SnapshotMeta` erhält ein optionales Feld:

```ts
restrictedDataset?: RestrictedDatasetSource;
```

Das Feld ist optional, damit bestehende Snapshots und Originalimporte ohne
Migration gültig bleiben. Für diese additive Änderung ist keine Erhöhung von
`DB_VERSION` erforderlich.

`ImportFileKind` erhält:

```ts
"sysv-data-package"
```

## 6. Scope-Verzeichnis und Auswahl

### 6.1 Neue reine Scope-Hilfe

Eine neue Datei `src/lib/sysvDataPackageScope.ts` kapselt die Exportauswahl.
Sie darf React, IndexedDB und TanStack Query nicht importieren.

Sie exportiert mindestens:

```ts
export interface SysvDataPackageScopeDirectory {
  tree: SysvDataPackageScopeNode[];
  areas: SysvDataPackageScope[];
  departments: SysvDataPackageScope[];
  persons: SysvDataPackageScope[];
}

export function buildSysvDataPackageScopeDirectory(
  rows: readonly TechInfoLatest[],
): SysvDataPackageScopeDirectory;

export function resolveSysvDataPackageVmNames(
  rows: readonly TechInfoLatest[],
  scope: SysvDataPackageScope,
): Set<string>;
```

Bestehende Normalisierer aus `src/lib/sysvScope.ts` und
`src/lib/techInfoOrgLabels.ts` werden wiederverwendet. Logik darf nicht durch
Kopieren leicht abweichend dupliziert werden.

### 6.2 Bereichsschlüssel

Ein Bereich wird nicht nur über seinen kurzen Bereichscode identifiziert. Der
Schlüssel besteht aus normalisierter Organisation und normalisiertem Bereich:

```text
<organisation-normalisiert>/<bereich-normalisiert>
```

Dadurch bleiben beispielsweise `FIRMA-A/IT` und `FIRMA-B/IT` getrennt.
Groß-/Kleinschreibung, Rand- und Mehrfachleerzeichen werden ignoriert.

Tech-Info-Abteilungspfade, die `parseOrgPath()` nicht valide zerlegen kann,
werden keinem Bereichs- oder Abteilungsscope zugeordnet. Eine Person bleibt
trotzdem auswählbar, sofern ein gültiger Personenname vorhanden ist.

### 6.3 Matchingregeln

Person:

```text
normalize(SysV) = normalizedName
ODER
normalize(SysVStv) = normalizedName
```

Abteilung:

```text
normalizeDepartment(SysV Abteilung) = normalizedPath
ODER
normalizeDepartment(SysVStv Abteilung) = normalizedPath
```

Bereich:

```text
parse(SysV Abteilung).org/bereich = gewählter Bereich
ODER
parse(SysVStv Abteilung).org/bereich = gewählter Bereich
```

Das Ergebnis ist immer ein `Set<string>` aus `vmNameNorm`. Eine VM, die in
beiden Rollen oder über mehrere passende Pfade vorkommt, erscheint nur einmal.

### 6.4 Kein „Alle Systeme“-Export

Der Export-Tab verlangt genau einen Bereich, eine Abteilung oder eine Person.
Es gibt dort keine Option „Alle Systeme“, damit nicht versehentlich ein
vollständiger Datenbestand verteilt wird.

## 7. Auflösung von Tech-Info auf RVTools

Der Paket-Builder verwendet alle aktuell gespeicherten Snapshots und ignoriert
die temporären Sitzungsfilter. Ein globaler Such-, Host- oder Clusterfilter darf
den Paketinhalt nicht unbemerkt verkleinern.

Für den Vergleich wird ausschließlich
`normalizeVmNameForMatch()` aus `src/lib/xlsx/parseHelpers.ts` verwendet.

Der Builder erstellt:

```ts
Map<vmNameNorm, NormalizedVm[]>
```

Für jeden Namen aus dem Tech-Info-Scope gelten folgende Regeln:

- kein RVTools-Treffer: Warnung `missing-rvtools-vm`; die Tech-Info-Zeile wird
  nicht exportiert, weil kein analysierbares System vorhanden ist,
- genau ein Treffer: VM wird aufgenommen,
- mehrere Treffer in demselben oder unterschiedlichen vCenters: blockierender
  Fehler `ambiguous-vm-name`.

Bei Mehrdeutigkeit darf nicht automatisch „alles mit diesem Namen“ exportiert
werden. Tech-Info besitzt aktuell keinen hinreichenden vCenter-Schlüssel; ein
automatisches Einschließen könnte eine fremde VM offenlegen.

Der Exportbutton bleibt bei mindestens einer Mehrdeutigkeit deaktiviert. Die
Vorschau listet die betroffenen VM-Namen und vCenter auf.

Wenn keine VM eindeutig zugeordnet werden kann, ist der Export ebenfalls
deaktiviert.

## 8. Paketinhalt: verbindliche Include-/Exclude-Matrix

### 8.1 RVTools-Metadaten und normalisierte Entitäten

| Store/Datentyp | Regel |
|---|---|
| `snapshots` | nur Snapshots mit mindestens einer ausgewählten VM; `sheetStats` für den gefilterten Inhalt neu berechnen; `restrictedDataset` setzen |
| `entities_vm` | nur eindeutig ausgewählte VMs |
| `entities_host` | nur Hosts, die von ausgewählten VMs über `vcenterId + host` referenziert werden |
| `entities_cluster` | nur Cluster, die von ausgewählten VMs über vCenter, Datacenter und Cluster referenziert werden |
| `entities_datastore` | nur sicher aus gefilterten VM-Rohzeilen ermittelte Datastores |
| `entities_snapshot` | nur Zeilen, deren normalisierter `vmName` ausgewählt ist |
| `entities_health` | in Version 1 leer; `entity` ist nicht zuverlässig VM-spezifisch |
| `metrics_cache` | nicht exportieren; Cache wird bei Bedarf neu erzeugt |

`NormalizedHost.vmCount` sowie Cluster-Gesamtkapazitäten bleiben unverändert,
weil sie als gemeinsamer Kapazitätskontext dienen. Sie dürfen nicht auf die
ausgewählten VMs umgerechnet oder als vollständiger Paketbestand beschriftet
werden.

### 8.2 Tech-Info Server

Exportiert werden nur die Tech-Info-Rohzeilen, die exakt zu den final
aufgenommenen RVTools-VMs gehören. Es wird ein synthetischer Importdatensatz
erzeugt:

- neue `techInfoImportId` auf Basis der `packageId`,
- ein `TechInfoImportMeta`,
- sequenziell neu nummerierte `TechInfoRow`-Einträge,
- dazu passende `TechInfoLatest`-Einträge.

`TechInfoLatest.techInfoImportId` und `rowIndex` müssen auf die synthetischen
Zeilen zeigen. Die vollständige `rawData` der ausgewählten Tech-Info-Zeile darf
enthalten sein. Zeilen anderer VMs dürfen nicht enthalten sein.

Für effizientes Lesen wird in `src/data/db/index.ts` ein gezielter Read-Helper
ergänzt, der anhand der `TechInfoLatest`-Pointer genau die benötigten
`TechInfoRow`-Datensätze lädt. Kein N-maliges Öffnen der Datenbank und kein
vollständiges Einlesen aller historischen Tech-Info-Zeilen.

### 8.3 Nicht enthaltene Auxiliary-Daten

Folgende Stores sind im Paket immer leer und werden beim Paketimport von alten
Analysedaten bereinigt:

- `techinfo_client_imports`, `techinfo_client_rows`, `techinfo_client_latest`,
- `cdp_imports`, `cdp_rows`, `cdp_latest`,
- `ipam_imports`, `ipam_rows`, `ipam_latest`,
- `eramon_iface_imports`, `eramon_iface_rows`, `eramon_iface_latest`,
- `eramon_l2_imports`, `eramon_l2_rows`, `eramon_l2_latest`,
- `vrops_imports`, `vrops_rows`, `vrops_latest`.

Sie dürfen nicht aus Bequemlichkeit vollständig übernommen werden.

### 8.4 Kapazitätsrichtlinien und Planungsläufe

- `capacity_policies` bleiben beim Import als persönliche Definitionen des
  Empfängers erhalten.
- `capacity_policy_assignments` werden geleert, da alte Clusterzuordnungen nicht
  zum neuen Datenbestand gehören.
- `fillup_analysis_runs` werden geleert und nicht exportiert.

Das individuelle CPU-Rightsizing-Level bleibt eine lokale Einstellung des
Empfängers und wird nicht aus dem Erzeugerprofil übernommen.

## 9. RVTools-Rohdaten: Fail-closed-Filterung

### 9.1 Grundsatz

Rohdaten werden nie über eine generische Regel „unbekannt bedeutet vollständig
übernehmen“ gefiltert. Jede unterstützte Sheet-Art besitzt eine explizite,
getestete Scope-Regel. Unbekannte Sheets oder Zeilen ohne erforderlichen
Zuordnungsschlüssel werden ausgeschlossen.

Die neue Datei `src/domain/services/sysvRawSheetScopeService.ts` enthält reine
Funktionen. Sie nimmt hydratisierte `SheetRow`-Daten entgegen und liefert
gefilterte Array-Werte für neue `RawSheetBlob`-Datensätze.

### 9.2 VM-bezogene Sheets

Folgende Sheets werden anhand des VM-Namens gefiltert:

```text
vInfo
vCPU
vMemory
vDisk
vPartition
vNetwork
vCD
vUSB
vSnapshot
vTools
```

Für jedes Sheet wird eine feste Kandidatenliste für das VM-Feld definiert.
Primär ist dies `VM`; `Name` darf nur dort als Fallback verwendet werden, wo
der bestehende RVTools-Vertrag es als VM-Namen verwendet. Der Wert wird mit
`normalizeVmNameForMatch()` normalisiert.

Ein fehlendes VM-Feld führt zum Ausschluss der Zeile und zu einem
Qualitätshinweis. Es darf nicht zum Einschließen der Zeile führen.

### 9.3 Snapshot-Metadaten

`vSource` darf vollständig für die bereits eingeschlossenen Snapshot-IDs
übernommen werden. Es enthält vCenter-Quellmetadaten und keine fremden
VM-Detailzeilen.

`vLicense` wird nicht exportiert.

### 9.4 Hosts und Hostkomponenten

Aus den ausgewählten VMs wird zunächst je Snapshot ein normalisierter
Hostnamensatz erzeugt. Folgende Sheets dürfen nur für diese Hosts übernommen
werden:

```text
vHost
vHBA
vNIC
vSwitch
vSC_VMK
vMultiPath
```

Zuordnungsschlüssel ist das explizite Feld `Host`. Fehlt es, wird die Zeile
ausgeschlossen.

`vPort` wird nur übernommen, wenn die Zeile entweder

1. über ein vorhandenes VM-Feld einer ausgewählten VM zugeordnet ist oder
2. eindeutig zu einem bereits eingeschlossenen Host gehört und kein Name einer
   fremden VM in der Zeile steht.

Im Zweifel wird die Zeile ausgeschlossen.

### 9.5 Distributed Switches

`dvPort` wird ausschließlich über sein VM-Feld auf ausgewählte VMs gefiltert.
Aus den gefilterten `dvPort`- und `vNIC`-Zeilen werden referenzierte
Switch-Identifier gesammelt. `dvSwitch` enthält anschließend nur Zeilen mit
einem dieser Identifier im Feld `Switch`.

Gibt es keine sicher referenzierte Switch-ID, werden keine `dvSwitch`-Zeilen
exportiert.

### 9.6 Datastores

Datastorenamen werden ausschließlich aus bereits gefilterten VM-Zeilen
ermittelt, insbesondere aus `vDisk` und – sofern vorhanden – `vInfo`. Dafür
werden explizite Feldkandidaten wie `Datastore`, `Datastore name` und
`Datastores` verwendet. Mehrfachwerte werden nach den im vorhandenen Import
verwendeten Trennzeichen zerlegt.

`vDatastore` enthält nur Datastores aus diesem ermittelten Set und demselben
Snapshot. `NormalizedDatastore` wird mit derselben Menge gefiltert.

Kann ein Datastore nicht sicher einer ausgewählten VM zugeordnet werden, wird
er nicht exportiert.

### 9.7 Resource Pools

`vRP` darf nur für Cluster übernommen werden, die von ausgewählten VMs
referenziert werden. Die Zeilen sind gemeinsamer Kapazitätskontext und werden
im Manifest entsprechend gezählt. Ein Resource-Pool-Name darf nicht als
Begründung verwendet werden, um weitere VM-Zeilen einzuschließen.

### 9.8 RowIndex und Blob-Aufbau

Nach dem Filtern werden die Zeilen je Sheet ab null neu nummeriert. Die
Headerreihenfolge des ursprünglichen `RawSheetBlob` bleibt erhalten. Die Werte
werden in dieser Reihenfolge als Array von Arrays geschrieben und über
`gzipJson()` wieder in das vorhandene `RawSheetBlob`-Format überführt.

Leere Sheets werden nicht als Blob gespeichert. `SnapshotMeta.sheetStats`
enthält für exportierte Sheets die neue Zeilen- und Spaltenzahl. Nicht
exportierte Sheets werden aus `sheetStats` entfernt.

## 10. vROps-Zeitreihenfilterung

### 10.1 Auswahl der Importquelle

Wie beim bestehenden Analyse-Export wird standardmäßig der jüngste vollständig
gespeicherte vROps-Zeitreihenimport verwendet. Die UI zeigt dessen Zeitraum und
Importzeitpunkt. Gibt es keinen Import, kann trotzdem ein Paket ohne
Zeitreihen erzeugt werden.

Der Tab besitzt einen standardmäßig aktivierten Schalter
**vROps-VM-Zeitreihen einschließen**. Ohne verfügbaren Import ist der Schalter
deaktiviert und die Vorschau erklärt den Grund.

### 10.2 Objektauswahl

Aufgenommen werden nur `VropsTimeSeriesImportedObject` mit:

```text
objectType = "vm"
AND matchStatus = "matched"
AND rvtoolsObjectKey gehört zu den ausgewählten vmKey-Werten
```

Unmatched oder ambiguous vROps-Objekte werden nicht anhand des Namens erraten.

### 10.3 Chunk-Slicing

Für jeden VM-Chunk:

1. Ermittle die Indizes aller `chunk.objectKeys`, die in der ausgewählten
   Objektmenge liegen.
2. Behalte die vorhandene Reihenfolge dieser Indizes bei.
3. Verwerfe den Chunk, wenn kein Index übrig bleibt.
4. Setze `objectKeys` auf die ausgewählten Schlüssel.
5. Für jeden Eintrag in `metricValues`:
   - interpretiere den Buffer als `Float32Array`,
   - validiere
     `length === alteObjectCount * slotCount`,
   - reserviere
     `Float32Array(neueObjectCount * slotCount)`,
   - kopiere je Objekt genau den zusammenhängenden Bereich
     `[oldIndex * slotCount, (oldIndex + 1) * slotCount)`,
   - speichere den neuen `ArrayBuffer`.
6. VM-Chunks besitzen keine Host-Maintenance-Reihen. Falls dennoch
   `maintenanceCodes`, `maintenanceStates` oder `maintenanceDerived` vorhanden
   sind, müssen sie mit derselben Objektindexlogik beschnitten oder als
   ungültiger Chunk abgelehnt werden; niemals unverändert übernehmen.

Pseudocode:

```ts
for (const metric of Object.keys(chunk.metricValues)) {
  const source = new Float32Array(chunk.metricValues[metric]!);
  assert(source.length === chunk.objectKeys.length * chunk.slotCount);
  const target = new Float32Array(selectedIndexes.length * chunk.slotCount);

  selectedIndexes.forEach((sourceIndex, targetIndex) => {
    const from = sourceIndex * chunk.slotCount;
    const to = from + chunk.slotCount;
    target.set(source.subarray(from, to), targetIndex * chunk.slotCount);
  });
}
```

### 10.4 Neue Import-ID und Metadaten

Das exportierte Paket erhält eine neue Zeitreihen-Import-ID, zum Beispiel:

```text
sysv-package:<packageId>:vrops
```

Diese ID wird konsistent in Importmetadaten, Objekten, Chunks und Summaries
verwendet. `rvtoolsSnapshotIds` enthält nur die im Paket vorhandenen Snapshots.

Die neue `qualitySummary` wird aus dem beschnittenen Bestand neu berechnet:

- VM-Objektanzahl,
- Cluster- und Hostanzahl jeweils null,
- erwartete Slots unverändert,
- Missing-Value-Anzahl aus den exportierten VM-Buffern,
- Warnungen und Fehler nur für enthaltene Objekte.

`validationStatus` wird auf `relationships-partial` gesetzt.
`relationshipIssues` wird entweder sicher auf enthaltene Objekt-Keys gefiltert
oder vollständig weggelassen. Freitext-Details mit fremden Objektnamen dürfen
nicht übernommen werden.

Nur Summaries der ausgewählten Objekt-Keys werden exportiert. Ihre `importId`
wird auf die neue ID umgeschrieben.

## 11. ZIP-Format Version 1

### 11.1 Verzeichnisstruktur

```text
manifest.json
modus.json
data/
  snapshots.json
  entities/
    vms.json
    hosts.json
    clusters.json
    datastores.json
    snapshots.json
  raw-sheets/
    index.json
    <snapshotId>/
      <sheetName>.json
  tech-info/
    import.json
    rows.json
    latest.json
  vrops/
    import.json
    objects.json
    summaries.json
    chunks/
      index.json
      <chunkId>/
        <metricKey>.f32
        maintenance-codes.u8
        maintenance-derived.u8
```

Nicht benötigte optionale Dateien und Verzeichnisse dürfen fehlen. Pfade im
Manifest sind immer ZIP-Pfade mit `/`, niemals Windows-Pfade.

### 11.2 modus.json

Die Datei liegt im Archivroot und verwendet unverändert das bestehende Format:

```json
{
  "kind": "rvtools-analyzer-mode",
  "version": 1,
  "mode": "sysv"
}
```

Sie wird beim Paketimport mit dem vorhandenen `parseModeFile()` validiert. Ein
anderer Modus ist in einem SysV-Datenpaket unzulässig.

### 11.3 manifest.json

Der Vertrag lautet:

```ts
export interface SysvDataPackageManifestV1 {
  kind: "rvtools-analyzer-sysv-data-package";
  version: 1;
  packageId: string;
  createdAt: string;
  appVersion: string;
  dataPolicy: "strict-vm-scope-v1";
  scope: SysvDataPackageScope & {
    roleMatch: "sysv-or-deputy";
  };
  capabilities: {
    vmInventory: true;
    techInfo: true;
    vmRawSheets: true;
    vmVropsTimeSeries: boolean;
    cpuRightsizing: boolean;
    ramRightsizing: boolean;
    fullClusterAnalysis: false;
    fillUpPlanning: false;
  };
  counts: {
    vcenters: number;
    snapshots: number;
    vms: number;
    techInfoRows: number;
    sharedHosts: number;
    sharedClusters: number;
    referencedDatastores: number;
    vropsVmObjects: number;
    vropsChunks: number;
  };
  warnings: Array<{
    code: string;
    message: string;
    count?: number;
  }>;
  files: Array<{
    path: string;
    sizeBytes: number;
    sha256: string;
  }>;
}
```

`manifest.json` führt jede andere Datei im Archiv auf, einschließlich
`modus.json`, aber nicht sich selbst. Zusätzliche, nicht im Manifest
aufgeführte Dateien sind ein Importfehler. Doppelte normalisierte ZIP-Pfade
sind ein Importfehler.

### 11.4 JSON- und Binärkodierung

- JSON wird als UTF-8 ohne BOM geschrieben.
- Das ZIP selbst komprimiert JSON über Deflate; JSON-Dateien werden nicht
  zusätzlich gzip-komprimiert.
- `RawSheetBlob`-Werte werden im Paket als `{ headers, values }` gespeichert und
  beim Import wieder mit `gzipJson()` aufgebaut.
- vROps-Metriken werden als rohe Little-Endian-Float32-Bytes (`.f32`)
  gespeichert. Browserplattformen sind praktisch little-endian; der Import
  prüft die erwartete Bytelänge. Das Manifestformat legt Little Endian explizit
  fest.
- Wartungscodes und Derived-Flags werden als rohe Uint8-Bytes gespeichert.
- `ArrayBuffer` wird niemals als JSON-Zahlenarray oder Base64 kodiert.

### 11.5 Prüfsummen

Für jede Datei außer `manifest.json` wird SHA-256 über die exakten Bytes im ZIP
berechnet. Der Import prüft Pfad, Byteanzahl und SHA-256, bevor er JSON parst
oder eine Datenbanktransaktion öffnet.

Vorhandene Hash-Helfer werden wiederverwendet. Es wird keine zweite
unabhängige SHA-256-Implementierung eingeführt.

## 12. Export-Service

Neue Dateien:

```text
src/domain/services/sysvDataPackageService.ts
src/lib/export/sysvDataPackageFormat.ts
src/hooks/useSysvDataPackageExport.ts
```

### 12.1 Verantwortlichkeiten

`sysvDataPackageScope.ts`:

- Auswahlbaum,
- Normalisierung,
- Auflösung Tech-Info → VM-Namensset.

`sysvDataPackageService.ts`:

- benötigte Stores lesen,
- eindeutige VMs auflösen,
- referenzierte Infrastruktur ermitteln,
- Rohdaten filtern,
- Tech-Info synthetisieren,
- vROps beschneiden,
- Vorschau und Payload erzeugen.

`sysvDataPackageFormat.ts`:

- Manifesttypen und defensive Parser,
- JSON-/Binärserialisierung,
- Prüfsummen,
- ZIP-Erzeugung und ZIP-Validierung.

`useSysvDataPackageExport.ts`:

- React-Ladezustand,
- Fortschrittsphasen,
- Download,
- Toast-Ergebnis.

### 12.2 Fortschrittsphasen

Die UI zeigt mindestens:

```text
Scope auflösen
RVTools-Daten filtern
Tech-Info filtern
vROps-Zeitreihen beschneiden
Prüfsummen berechnen
ZIP komprimieren
Download vorbereiten
```

Das ZIP wird mit dem vorhandenen asynchronen `fflate.zip()` erzeugt. Für große
Zeitreihen darf nicht `zipSync()` auf dem Hauptthread verwendet werden.

### 12.3 Dateiname

```text
rvtools-sysv_<scope-kind>_<bereinigtes-scope-label>_<YYYY-MM-DD>.zip
```

Der Labelteil wird über den bestehenden Dateinamen-Normalisierer bereinigt und
auf 60 Zeichen begrenzt.

## 13. Importerkennung und Importablauf

### 13.1 Paket vor generischem ZIP-Expand erkennen

Der aktuelle `useImportController.tsx` verwirft beim generischen Entpacken die
Ordnerstruktur. Ein SysV-Datenpaket muss daher vor `expandZipFiles()` erkannt
werden.

Der Ablauf wird so umgebaut:

```text
ausgewählte Dateien
  → ZIPs zunächst nur inspizieren
  → enthält Root-manifest mit passendem kind?
      ja: als genau ein SysV-Datenpaket behandeln
      nein: bisheriges generisches ZIP-Expand unverändert verwenden
```

Ein SysV-Datenpaket darf in Version 1 weder mit weiteren Dateien noch mit einem
zweiten Paket im selben Auswahlbatch gemischt werden. Die UI meldet dies als
klaren Fehler, bevor irgendein Import startet.

Ein normales ZIP ohne passendes Manifest funktioniert weiterhin wie bisher.

### 13.2 Defensive Validierungsreihenfolge

1. ZIP-Größe und Eintragsanzahl gegen Grenzwerte prüfen.
2. Pfade normalisieren und Zip-Slip-Pfade (`..`, absolute Pfade, Backslashes)
   ablehnen.
3. Genau ein `manifest.json` im Root verlangen.
4. Manifest `kind` und Version validieren.
5. Keine unerwarteten oder fehlenden Dateien zulassen.
6. Byteanzahl und SHA-256 aller Dateien prüfen.
7. `modus.json` mit `parseModeFile()` validieren und `sysv` verlangen.
8. JSON-Dateien defensiv parsen und alle Schlüssel-/Referenzbeziehungen prüfen.
9. Binärpufferlängen prüfen.
10. Counts aus dem Payload neu berechnen und mit dem Manifest vergleichen.
11. Erst danach Ersetzungsbestätigung und Datenbanktransaktion starten.

Unbekannte Paketversionen werden mit einer verständlichen Meldung abgelehnt.
Es gibt kein „best effort“-Importieren eines teilweise verstandenen Pakets.

### 13.3 Größenlimits

Zur Abwehr beschädigter ZIPs werden Konstanten definiert und getestet:

```ts
MAX_SYSV_PACKAGE_COMPRESSED_BYTES = 1_000_000_000;
MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES = 4_000_000_000;
MAX_SYSV_PACKAGE_ENTRIES = 20_000;
```

Die konkreten Werte dürfen nach realen Tests reduziert werden, aber nicht
stillschweigend entfallen. Die Summe der entpackten Eintragsgrößen wird vor dem
vollständigen Parsen geprüft, soweit `fflate` dies ermöglicht.

### 13.4 Atomarer Datenbank-Replace

In `src/data/db/index.ts` wird eine Funktion ergänzt:

```ts
export async function replaceAnalysisDataWithSysvPackage(
  payload: ValidatedSysvDataPackagePayload,
): Promise<void>;
```

Sie öffnet genau eine Readwrite-Transaktion über diese Stores:

```text
snapshots
rawSheetBlobs
entities_vm
entities_host
entities_cluster
entities_datastore
entities_snapshot
entities_health
metrics_cache
techinfo_imports
techinfo_rows
techinfo_latest
techinfo_client_imports
techinfo_client_rows
techinfo_client_latest
cdp_imports
cdp_rows
cdp_latest
ipam_imports
ipam_rows
ipam_latest
eramon_iface_imports
eramon_iface_rows
eramon_iface_latest
eramon_l2_imports
eramon_l2_rows
eramon_l2_latest
vrops_imports
vrops_rows
vrops_latest
vrops_timeseries_imports
vrops_timeseries_objects
vrops_timeseries_chunks
vrops_timeseries_summaries
capacity_policy_assignments
fillup_analysis_runs
```

Innerhalb derselben Transaktion:

1. alle genannten Stores leeren,
2. Paket-Snapshots schreiben,
3. Rohdaten-Blobs schreiben,
4. normalisierte Entitäten schreiben,
5. synthetische Tech-Info-Daten schreiben,
6. optionale vROps-Zeitreihendaten schreiben,
7. Transaktion abschließen.

Nicht Teil der Transaktion und niemals zu leeren sind insbesondere:

```text
ui_state
maintenance_settings
maintenance_cluster_assignments
maintenance_windows
scenarios
vcenter_groups
capacity_policies
```

Alle JSON-Transformationen, `gzipJson()`-Aufrufe und Binärvalidierungen müssen
vor Öffnen der Transaktion abgeschlossen sein. Während der Transaktion werden
nur IndexedDB-Requests awaited, damit die Transaktion nicht inaktiv wird.

### 13.5 Zustand nach erfolgreichem Import

Nach erfolgreichem Commit:

1. alle TanStack-Queries invalidieren,
2. Sitzungsfilter auf einen neutralen Zustand zurücksetzen:
   - keine vCenter-, Cluster-, Host- oder Datastoreauswahl,
   - Suche leer,
   - `globalFilter: null`,
   - `vmNameList` leer,
   - bestehende VM-Power-Vorgaben dürfen erhalten bleiben,
3. `lastSysvScope` auf `{ kind: "all" }` setzen,
4. Modus auf `sysv` setzen,
5. keinen persönlichen Scope-Dialog automatisch öffnen,
6. zur Übersicht navigieren,
7. Erfolgstoast mit Paketlabel, VM-Anzahl und Zeitraum anzeigen.

Das Nichtöffnen des Dialogs ist beabsichtigt: Der Datenbestand ist bereits hart
begrenzt und „Alle Systeme“ ist der sichere Paketgesamtbestand. Der Benutzer
kann später in den Settings optional weiter filtern.

## 14. UI unter Export & Berichte

### 14.1 Tabs

`src/pages/ExportStudio.tsx` erhält URL-synchronisierte Tabs:

```text
Berichte
SysV-Datensatz
```

Queryparameter:

```text
/exports?tab=reports
/exports?tab=sysv-package
```

Default bleibt `reports`. Bestehendes Verhalten und bestehende Exporte dürfen
nicht verändert werden.

Um die Datei beherrschbar zu halten, wird der neue Tab als Komponente
`src/components/exports/SysvDataPackageTab.tsx` umgesetzt. Ein großer
mechanischer Umbau des bestehenden Export Studios ist nicht Teil dieses
Features.

### 14.2 Auswahloberfläche

Der Tab zeigt links einen hierarchischen Baum:

```text
Organisation
  Bereich                 auswählbar
    Abteilung             auswählbar
      Person              auswählbar
```

Die Organisation dient nur als Navigation. Bereich, Abteilung und Person sind
per Radio-Semantik auswählbar. Es ist immer höchstens ein Scope aktiv.

Zusätzlich gibt es eine Suche über Bereich, Abteilung und Person. Treffer
öffnen ihre Eltern, ohne die VM-Menge zu verändern.

### 14.3 Vorschau

Nach einer Auswahl zeigt die rechte Seite mindestens:

- Scope-Art und Anzeigename,
- eindeutig gefundene VMs,
- betroffene vCenter,
- gemeinsame Hosts,
- gemeinsame Cluster,
- referenzierte Datastores,
- VMs mit vROps-Zeitreihe,
- VMs ohne vROps-Zeitreihe,
- vROps-Zeitraum,
- geschätzte unkomprimierte und komprimierte Größe,
- Warnungen und blockierende Fehler.

Ein permanenter Hinweis lautet sinngemäß:

> Das Paket enthält ausschließlich die aufgelisteten VMs. Host- und
> Clusterwerte dienen als gemeinsamer Kapazitätskontext und stellen keinen
> vollständigen Infrastrukturbericht dar.

### 14.4 Exportbutton

Beschriftung:

```text
SysV-Datensatz als ZIP erzeugen
```

Deaktiviert bei:

- keiner Auswahl,
- null eindeutig zugeordneten VMs,
- mindestens einem mehrdeutigen VM-Namen,
- laufendem Export.

Vor dem eigentlichen Export zeigt ein Bestätigungsdialog die Scope-Bezeichnung,
VM-Anzahl und den Hinweis, dass echte Systemnamen enthalten sind. Eine
Pseudonymisierungsoption gibt es nicht.

## 15. Kennzeichnung eingeschränkter Datenbestände

Sobald mindestens ein aktiver Snapshot `restrictedDataset.kind ===
"sysv-package"` trägt, zeigt das App-Layout oder der `PageHeader` einen gut
sichtbaren Badge:

```text
Eingeschränkter SysV-Datensatz
```

Tooltip beziehungsweise Infotext:

> VM-Zahlen beziehen sich auf den exportierten Scope. Host- und
> Clusterkapazitäten können gemeinsame Infrastruktur abbilden.

Mindestens Übersicht, vCenter, Cluster, Hosts und Export & Berichte müssen
diese Kennzeichnung erhalten. Bevorzugt wird eine zentrale Layoutlösung statt
fünf kopierter Hinweise.

Der Badge ist rein informativ. Die Sicherheit entsteht bereits durch den
gefilterten Datenbestand.

## 16. Konkrete Änderungen nach Datei

| Datei | Änderung |
|---|---|
| `src/domain/models/types.ts` | Scope-, Manifest-, Restricted-Dataset- und Importtypen ergänzen |
| `src/lib/sysvDataPackageScope.ts` | Bereichs-/Abteilungs-/Personenverzeichnis und VM-Namensauflösung |
| `src/lib/export/sysvDataPackageFormat.ts` | Formatvertrag, Serialisierung, Hashing, defensive Validierung |
| `src/domain/services/sysvRawSheetScopeService.ts` | explizite Sheetfilter und Blob-Neuaufbau |
| `src/domain/services/sysvDataPackageService.ts` | vollständiger Builder und Vorschau |
| `src/hooks/useSysvDataPackageExport.ts` | Exportstatus und Download |
| `src/components/exports/SysvDataPackageTab.tsx` | Auswahl, Vorschau, Bestätigung und Fortschritt |
| `src/pages/ExportStudio.tsx` | neuen URL-synchronisierten Tab einhängen |
| `src/data/db/index.ts` | gezielte Reads und atomarer Paket-Replace |
| `src/hooks/useImportController.tsx` | Paket vor ZIP-Expansion erkennen und als eigenen Queue-Eintrag importieren |
| `src/lib/appMode.ts` | keine Formatänderung; vorhandenen Parser wiederverwenden |
| `src/hooks/useAppMode.tsx` | vorhandene APIs verwenden; bei Bedarf atomare Hilfsmethode für Modus + `all` ergänzen |
| `src/app/layout/*` oder zentrale Header-Komponente | Restricted-Dataset-Badge |

Die Implementierung beginnt gemäß Repositoryregel mit den Typen in
`src/domain/models/types.ts`. Datenbank, Services und Hooks werden danach
synchron angepasst.

## 17. Implementierungsreihenfolge

### Phase 1: Verträge und reine Scope-Logik

1. Domain-Typen ergänzen.
2. `sysvDataPackageScope.ts` implementieren.
3. Bereichsschlüssel über Organisation + Bereich implementieren.
4. Matching über SysV und SysVStv implementieren.
5. Unit-Tests für Scope-Verzeichnis und VM-Namensset schreiben.

### Phase 2: Vorschau und Datenauflösung

1. Read-Helper für Snapshots, Entitäten und Tech-Info-Rohzeilen ergänzen.
2. eindeutige Tech-Info-zu-RVTools-Auflösung implementieren,
3. Missing- und Ambiguous-Diagnosen implementieren,
4. referenzierte Hosts, Cluster und Datastores ermitteln,
5. Preview-Datentyp und Counts implementieren,
6. Unit-Tests mit mehreren vCenters schreiben.

### Phase 3: Rohdatenfilter

1. explizite Regeln je unterstütztem Sheet implementieren,
2. VM-, Host-, Switch- und Datastore-Referenzen in der festgelegten Reihenfolge
   ermitteln,
3. Header erhalten und Array-Werte neu aufbauen,
4. `sheetStats` neu berechnen,
5. für jedes Sheet einen Fremddaten-Regressionsfall testen.

### Phase 4: vROps-Slicing

1. ausgewählte vROps-VM-Objekte bestimmen,
2. Float32-Chunk-Slicing als reine Funktion implementieren,
3. Import-IDs umschreiben,
4. Summaries filtern,
5. Quality Summary neu berechnen,
6. Binärtests mit mindestens drei Objekten und nicht zusammenhängenden
   Auswahlindizes schreiben.

### Phase 5: Paketformat und Export

1. JSON- und Binärdateien erzeugen,
2. Manifestcounts aus dem finalen Payload berechnen,
3. Prüfsummen über finale Bytes bilden,
4. ZIP asynchron erzeugen,
5. Parser und Validator unabhängig vom Builder testen,
6. Downloadhook implementieren.

### Phase 6: Atomarer Import

1. ZIP-Paket vor generischem Expand erkennen,
2. Pfad-, Größen-, Manifest- und Hashprüfung implementieren,
3. Payloadbeziehungen validieren,
4. atomare Replace-Funktion in der DB implementieren,
5. Filter neutralisieren und SysV-Modus aktivieren,
6. Importqueue und verständliche Fehlerzustände ergänzen,
7. normale ZIP-, Originaldatei- und `modus.json`-Imports regressionsprüfen.

### Phase 7: UI und Restricted-Dataset-Kennzeichnung

1. Tabs in Export & Berichte ergänzen,
2. Auswahlbaum und Suche implementieren,
3. Vorschau, Optionen, Warnungen und Bestätigung implementieren,
4. Fortschrittsanzeige implementieren,
5. Restricted-Dataset-Badge zentral ergänzen,
6. Komponenten- und Accessibility-Tests schreiben.

## 18. Automatisierte Tests

### 18.1 Scope

- Bereich matcht primäre Abteilung.
- Bereich matcht stellvertretende Abteilung.
- Abteilung matcht beide Rollen.
- Person matcht SysV, SysVStv und beide Rollen.
- doppelte Rollenzuordnung dedupliziert die VM.
- gleiche Bereichscodes verschiedener Organisationen bleiben getrennt.
- ungültiger Abteilungspfad erzeugt keinen Bereichs-/Abteilungsscope.
- Person ohne gültigen Abteilungspfad bleibt auswählbar.
- Groß-/Kleinschreibung und Mehrfachleerzeichen werden ignoriert.

### 18.2 RVTools-Auflösung

- Scope-VM mit genau einem Treffer wird aufgenommen.
- fehlende RVTools-VM erzeugt eine Warnung.
- identischer VM-Name in zwei vCenters blockiert den Export.
- aktive Sitzungsfilter verändern die Paketmenge nicht.
- nur Snapshots mit ausgewählten VMs werden aufgenommen.
- nur referenzierte Hosts und Cluster werden aufgenommen.

### 18.3 Rohdaten und Datenschutz

Jeder Testdatensatz enthält eine ausgewählte VM `ALLOWED-VM` und eine fremde VM
`FOREIGN-SECRET-VM`.

- jedes VM-Sheet enthält nach dem Filter nur `ALLOWED-VM`,
- ein hostbezogenes Sheet enthält nur referenzierte Hosts,
- `dvPort` enthält keinen Port von `FOREIGN-SECRET-VM`,
- `dvSwitch` enthält nur tatsächlich referenzierte Switches,
- `vDatastore` enthält nur über ausgewählte VM-Zeilen referenzierte Datastores,
- Zeilen ohne sicheren Schlüssel werden ausgeschlossen,
- unbekannte Sheets werden ausgeschlossen,
- `sheetStats` stimmen mit den gefilterten Zeilen überein,
- vollständiges Entpacken und rekursives Durchsuchen aller Textdateien findet
  `FOREIGN-SECRET-VM` nirgends.

### 18.4 vROps

- Objektreihenfolge bleibt nach nicht zusammenhängender Auswahl korrekt.
- jeder Metrikbuffer besitzt
  `selectedObjectCount * slotCount * 4` Bytes.
- Werte jeder ausgewählten VM bleiben slotgenau erhalten.
- fremde Objektkeys fehlen aus objects, chunks und summaries.
- Cluster- und Hostchunks fehlen.
- falsche Quellbufferlängen brechen den Export ab.
- Quality Counts stimmen mit dem gefilterten Bestand überein.
- vollständige Binärprüfung bestätigt, dass kein fremder Objektblock übernommen
  wurde.

### 18.5 Paketvalidator

- gültiges Paket Version 1 wird akzeptiert.
- falsches `kind` oder unbekannte Version wird abgelehnt.
- fehlende, zusätzliche oder doppelte Datei wird abgelehnt.
- manipulierte Datei wird durch SHA-256 abgelehnt.
- falsche Byteanzahl wird abgelehnt.
- Pfade mit `..`, Backslash oder absolutem Pfad werden abgelehnt.
- `modus.json` mit anderem Modus wird abgelehnt.
- Manifestcounts, die nicht zum Payload passen, werden abgelehnt.
- zu große Archive und zu viele Einträge werden abgelehnt.

### 18.6 Datenbankimport

Mit `fake-indexeddb`:

1. vollständigen alten Datenbestand mit einer fremden VM und persönlichen
   Settings anlegen,
2. gültiges SysV-Paket importieren,
3. prüfen, dass alte Analyse- und Netzwerkstores leer beziehungsweise ersetzt
   sind,
4. prüfen, dass ausschließlich Paket-VMs vorhanden sind,
5. prüfen, dass Settings, Wartungsfenster, Szenarien und `capacity_policies`
   unverändert sind,
6. prüfen, dass `capacity_policy_assignments` und Fill-Up-Läufe geleert wurden,
7. prüfen, dass ein absichtlich ausgelöster Schreibfehler die gesamte
   Transaktion zurückrollt.

### 18.7 Importcontroller

- SysV-Paket wird vor generischem ZIP-Expand erkannt.
- normale ZIP-Dateien funktionieren weiterhin.
- Paket plus weitere Datei wird abgelehnt.
- zwei Pakete werden abgelehnt.
- ungültiges Paket verändert weder Daten noch Modus.
- abgelehnte Ersetzungsbestätigung verändert nichts.
- erfolgreicher Import aktiviert SysV ohne Scope-Dialog.
- Filter werden neutralisiert.
- Kontaktvorgaben werden nicht geschrieben oder abgeleitet.

### 18.8 UI

- bestehender Berichte-Tab bleibt Default.
- URL-Query öffnet den SysV-Datensatz-Tab.
- Bereich, Abteilung und Person sind auswählbar; Organisation nicht.
- Vorschau zeigt Counts und Shared-Context-Hinweis.
- Ambiguous-Fehler deaktiviert den Exportbutton.
- Exportbestätigung nennt echte Systemnamen.
- Fortschrittsanzeige ist während des Exports sichtbar.
- Restricted-Dataset-Badge erscheint nach Paketimport.

## 19. Manuelle Abnahme

### 19.1 Vorbereitung durch VM-Admin

1. Mehrere RVTools-vCenter importieren.
2. Tech-Info Server importieren.
3. Einen vollständigen vROps-Zeitreihensatz importieren.
4. Sicherstellen, dass mindestens zwei Bereiche und mehrere SysV/SysVStv
   vorhanden sind.
5. Einen Scope auswählen, der nur einen Teil eines vCenters enthält.

### 19.2 Export prüfen

1. `/exports?tab=sysv-package` öffnen.
2. Bereich auswählen und Previewcounts notieren.
3. ZIP mit Zeitreihen erzeugen.
4. ZIP manuell öffnen.
5. `manifest.json` und `modus.json` prüfen.
6. Nach einem bekannten fremden VM-Namen in allen entpackten Textdateien
   suchen; kein Treffer ist zulässig.

### 19.3 Import auf frischem Browserprofil

1. App mit leerer IndexedDB öffnen.
2. ZIP über Upload importieren.
3. Prüfen, dass SysV-Modus aktiv ist.
4. Prüfen, dass kein Scope-Dialog erscheint.
5. VM-Liste mit Previewcount vergleichen.
6. globalen Filter entfernen beziehungsweise leer lassen; es dürfen weiterhin
   nur Paket-VMs sichtbar sein.
7. VM-Details öffnen.
8. CPU- und RAM-Rightsizing öffnen und Messreihen prüfen.
9. Settings öffnen; Vorname und Nachname müssen leer sein.
10. Restricted-Dataset-Badge und Kontextwarnung prüfen.

### 19.4 Import über bestehenden Datenbestand

1. In einem zweiten Profil Originaldaten und Kontaktvorgaben anlegen.
2. Paketimport starten und Ersetzung abbrechen; Daten müssen unverändert sein.
3. Paketimport erneut starten und bestätigen.
4. Alte Analyse-VMs und Netzwerkdaten dürfen nicht mehr sichtbar sein.
5. Persönliche Kontaktvorgaben und Wartungsfenster müssen unverändert sein.

## 20. Abnahmekriterien

- Unter Export & Berichte existiert der neue Tab **SysV-Datensatz**.
- Ein VM-Admin kann Bereich, Abteilung oder Person auswählen.
- Jede Auswahl berücksichtigt SysV und SysVStv.
- VM-Namensmehrdeutigkeiten blockieren statt Daten großzügig einzuschließen.
- Das ZIP ist versioniert, besitzt Manifest, Prüfsummen und `modus.json`.
- Nur betroffene vCenter-Snapshots werden aufgenommen.
- Innerhalb dieser Snapshots sind VM-Daten strikt auf den Scope begrenzt.
- Referenzierte Hosts und Cluster sind ausschließlich als gekennzeichneter
  gemeinsamer Kapazitätskontext enthalten.
- vROps-VM-Chunks sind physisch auf die ausgewählten Objektindizes beschnitten.
- Cluster- und Hostzeitreihen sowie panelbasierte vROps-Daten fehlen.
- Tech-Info enthält nur final aufgenommene VMs.
- Userdaten und Kontaktvorgaben fehlen aus dem Paket.
- Paketimport verändert keine bestehenden Kontaktvorgaben.
- Der Paketimport ersetzt vorhandene Analysedaten atomar und erhält persönliche
  Daten.
- Nach erfolgreichem Import ist der SysV-Modus aktiv und der persönliche Scope
  steht auf `all`.
- Das Entfernen aller UI-Filter kann keine VM außerhalb des Pakets sichtbar
  machen.
- Ein eingeschränkter Bestand ist in der UI klar gekennzeichnet.
- Bestehende Originaldatei-, normale ZIP-, Backup- und Modusimporte bleiben
  funktionsfähig.

## 21. Qualitätsbefehle

Nach jeder Phase werden die betroffenen Tests ausgeführt. Vor Abschluss des
Features sind gemäß Repositoryregeln zwingend auszuführen:

```text
npm run test
npm run lint
npm run build
```

Zusätzlich wird empfohlen:

```text
npm run typecheck
```

## 22. Definition of Done

Das Feature ist erst fertig, wenn nicht nur der Happy Path funktioniert,
sondern der automatisierte Fremddaten-Regressionsfall das erzeugte ZIP auf
allen Ebenen erfolgreich prüft. Ein Export, der nur UI-Listen oder
Objektmetadaten filtert, aber fremde Zeilen in Rohdaten oder binären
Zeitreihenpuffern belässt, gilt ausdrücklich als nicht implementiert.
