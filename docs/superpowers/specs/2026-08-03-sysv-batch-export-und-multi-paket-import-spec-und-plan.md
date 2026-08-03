# SysV-Datenpakete: Batch-Export und Multi-Paket-Import

**Datum:** 2026-08-03
**Status:** Implementierungsbereit
**Zielgruppe:** Implementierende Agenten und Entwickler
**Abhängigkeit:** `2026-08-03-sysv-datenpaket-export-import-spec-und-plan.md` ist implementiert. Diese Spezifikation ist rein additiv und ändert das Paketformat Version 1 nicht.

## 1. Ziel

Zwei zusammengehörige Erweiterungen des SysV-Datenpakets:

**Batch-Export.** Im Tab **SysV-Datensatz** kann statt eines einzelnen Scopes
eine ganze Ebene der Organisationshierarchie exportiert werden. Ergebnis ist ein
Container-ZIP, das die einzelnen Pakete in der Organisationsstruktur verschachtelt
enthält:

- alle Systemverantwortlichen einer Abteilung,
- alle Abteilungen eines Bereichs, jeweils inklusive ihrer Systemverantwortlichen,
- alle Bereiche, jeweils inklusive ihrer Abteilungen und Systemverantwortlichen.

**Multi-Paket-Import.** Der Import akzeptiert mehrere Pakete gleichzeitig —
einzeln ausgewählt oder als Container-ZIP. Der resultierende Datenbestand ist die
**Vereinigung** der importierten Pakete. Nach dem Import kann der Empfänger
zusätzlich nach Herkunftspaket filtern.

Die harte Datengrenze bleibt unverändert: Sichtbar ist ausschließlich, was
physisch in mindestens einem importierten Paket enthalten war. Kein Filter und
keine Modusumschaltung kann diese Grenze erweitern.

## 2. Warum die Vereinigung tragfähig ist

Alle Pakete eines Batch-Laufs stammen aus derselben lokalen Datenbasis und
behalten ihre Primärschlüssel unverändert. `scopedSnapshots` übernimmt die
originale `snapshotId` (`sysvDataPackageService.ts`), und die Entitätsstores sind
auf fachlich stabile Schlüssel gekeyt:

| Store | Schlüssel | Verhalten bei Union |
|---|---|---|
| `snapshots` | `snapshotId` | identisch, bis auf `restrictedDataset` |
| `entities_vm` | `vmKey` | identischer Record |
| `entities_host` | `hostKey` | identischer Record |
| `entities_cluster` | `clusterKey` | identischer Record |
| `entities_datastore` | `dsKey` | identischer Record |
| `techinfo_latest` | `vmNameNorm` | identischer Record, abweichender Pointer |

Daraus folgt die zentrale Eigenschaft:

> Der Merge ist **idempotent** und **teilmengentolerant**. Ein Bereichspaket und
> drei darin enthaltene Personenpakete dürfen gemeinsam importiert werden, ohne
> dass VMs doppelt gezählt werden oder Daten verloren gehen.

Diese Eigenschaft ist kein Zufallsprodukt, sondern die Grundlage des gesamten
Features. Jede Änderung, die Schlüssel beim Export umschreibt, bricht sie und ist
unzulässig.

## 3. Verbindliche fachliche Entscheidungen

### 3.1 Das Paketformat Version 1 bleibt unverändert

Container-ZIP und Merge sind vollständig außerhalb des Formatvertrags
umgesetzt. `serializeSysvDataPackage`, `validateSysvDataPackageZip` und
`SysvDataPackageManifestV1` werden **nicht** geändert. Jedes Blattpaket im
Container ist ein reguläres, einzeln importierbares Paket Version 1.

Damit bleiben bereits verteilte Pakete gültig und ein Empfänger mit älterem
Stand kann jedes einzelne Blattpaket weiterhin importieren.

### 3.2 Der Container ist ein Transportbehälter, kein Paket

Das Container-ZIP hat kein `manifest.json` im Root und ist selbst kein
importierbarer Datensatz. Es enthält ausschließlich Blattpakete und einen
Übersichtsbericht. Der Import löst den Container auf und verarbeitet die
enthaltenen Pakete.

### 3.3 Personen-Scopes bleiben global

Ein Personen-Scope umfasst weiterhin **alle** VMs dieser Person, unabhängig von
der Abteilung (`applyPersonCounts` in `sysvDataPackageScope.ts`). Es wird **kein**
neuer Scope-Typ `person∩department` eingeführt.

Begründung: Ein solcher Typ wäre eine Formatänderung mit Manifest-Version 2 und
würde die Aussage „das ist dein vollständiger Systembestand“ zerstören — genau
die Aussage, die ein Personenpaket für den Empfänger wertvoll macht.

Konsequenz für den Container: Ist eine Person in mehreren Abteilungen tätig,
erscheint **dasselbe** Personenpaket unter jeder betroffenen Abteilung. Die Datei
ist byteidentisch und trägt dieselbe `packageId`. Der Übersichtsbericht muss
diesen Fall ausweisen (siehe 4.3), damit niemand aus der Ordnerstruktur eine
Abteilungsgrenze ableitet, die das Paket nicht einhält.

### 3.4 Herkunft stammt aus dem Manifest, nicht aus der Ordnerstruktur

Die Zuordnung „diese VM kam aus Paket X“ wird ausschließlich aus
`manifest.packageId` und `manifest.scope` abgeleitet. Die Position im Container
wird nicht ausgewertet.

Begründung: Pakete dürfen auch einzeln, ohne Container, importiert werden. Die
Herkunftsverfolgung muss in beiden Fällen identisch funktionieren. Eine aus
Ordnernamen abgeleitete Herkunft wäre zudem fälschbar.

### 3.5 Der Merge ersetzt den Datenbestand als Ganzes

Ein Multi-Paket-Import ist eine einzige atomare Operation: Erst werden **alle**
Pakete vollständig validiert und im Speicher zusammengeführt, dann werden die
Stores geleert und das Ergebnis geschrieben. Es gibt kein inkrementelles
Hinzufügen zu einem bestehenden Datenbestand.

Begründung: Inkrementelles Hinzufügen würde erlauben, Pakete aus
unterschiedlichen Export-Generationen zu vermischen, ohne dass die Prüfung aus
Abschnitt 7 greifen kann. Ein Import ist damit immer vollständig reproduzierbar
aus der Menge der gewählten Dateien.

### 3.6 Der globale Filter bleibt nach dem Import leer

Wie beim Einzelimport wird `globalFilter` auf `null` und der persönliche
Systemkontext auf `all` gesetzt. „Alle Systeme“ bedeutet nach einem
Multi-Paket-Import: die Vereinigung aller importierten Pakete.

## 4. Container-Format

### 4.1 Struktur

```text
rvtools-sysv-batch_<ebene>_<label>_<datum>.zip
├─ uebersicht.json
├─ uebersicht.csv
└─ bereiche/
   └─ <bereich-label>/
      ├─ bereich_<label>.zip
      └─ abteilungen/
         └─ <abteilung-label>/
            ├─ abteilung_<label>.zip
            └─ systemverantwortliche/
               ├─ person_<label>.zip
               └─ person_<label>.zip
```

Bei einem Batch auf Abteilungsebene entfällt die Ebene `bereiche/`, bei einem
Batch auf Personenebene zusätzlich `abteilungen/`. Die Ordnernamen werden mit
derselben Regel wie Dateinamen normalisiert.

### 4.2 Dateinamen und Kollisionen

Die Blattpakete verwenden `buildSysvDataPackageFileName`. Da diese Funktion das
Label auf 60 Zeichen kürzt, können unterschiedliche Scopes denselben Namen
erzeugen. Der Container-Builder führt deshalb pro Verzeichnis eine
Namensregistrierung und hängt bei Kollision `-2`, `-3` an. Ein stilles
Überschreiben ist unzulässig — `fflate.zip` nimmt ein `Record` entgegen und würde
den Konflikt nicht melden.

### 4.3 Übersichtsbericht

`uebersicht.json` und die inhaltsgleiche `uebersicht.csv` dokumentieren den
gesamten Lauf:

```ts
interface SysvBatchReport {
  createdAt: string;
  appVersion: string;
  level: "person" | "department" | "area";
  rootLabel: string;
  includeVropsTimeSeries: boolean;
  entries: SysvBatchReportEntry[];
  skipped: SysvBatchReportSkip[];
}

interface SysvBatchReportEntry {
  path: string;
  packageId: string;
  scopeKind: SysvDataPackageScope["kind"];
  scopeLabel: string;
  vmCount: number;
  compressedBytes: number;
  /** Personenpaket, das VMs außerhalb der Abteilung enthält, unter der es liegt. */
  crossesParentScope: boolean;
  warningCodes: string[];
}

interface SysvBatchReportSkip {
  scopeKind: SysvDataPackageScope["kind"];
  scopeLabel: string;
  reason: string;
}
```

`crossesParentScope` ist die in 3.3 geforderte Kennzeichnung. Es wird berechnet,
indem die VM-Menge des Personenpakets gegen die VM-Menge des übergeordneten
Abteilungsscopes geprüft wird.

### 4.4 Übersprungene Scopes brechen den Batch nicht ab

Ein Scope, dessen Vorschau `canExport === false` liefert — etwa weil keine VM
eindeutig zu RVTools aufgelöst werden konnte — wird mit Begründung in `skipped`
aufgenommen. Der Batch läuft weiter. Nur wenn **kein einziges** Paket erzeugt
werden konnte, schlägt der gesamte Lauf fehl.

## 5. Batch-Export: Architektur

### 5.1 Das Problem

`resolveSysvDataPackage` lädt pro Aufruf den gesamten Datenbestand neu: alle
Snapshots, alle Entitäten, sämtliche Raw-Sheet-Blobs inklusive `gunzipJson`
(`loadSnapshotRawData`) sowie alle vROps-Objekte, -Chunks und -Summaries. Bei 300
Systemverantwortlichen wäre das die 300-fache Dekomprimierung des gesamten
Rohdatenbestands. Das ist im Browser nicht durchführbar.

### 5.2 Die Auflösung

`resolveSysvDataPackage` wird in eine Ladephase und eine reine Filterphase
getrennt:

```ts
/** Einmalig geladene, über alle Scopes eines Laufs geteilte Rohdatenbasis. */
export interface SysvDataPackageSource {
  snapshots: SnapshotMeta[];
  techInfoLatest: TechInfoLatest[];
  techInfoRows: TechInfoRow[];
  allVms: NormalizedVm[];
  vmsByNormalizedName: ReadonlyMap<string, readonly NormalizedVm[]>;
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  snapshotEntities: NormalizedSnapshot[];
  rawData: SnapshotRawData[];
  vrops: {
    importMeta: VropsTimeSeriesImport;
    objects: VropsTimeSeriesImportedObject[];
    chunks: VropsTimeSeriesChunk[];
    summaries: VropsTimeSeriesSummary[];
  } | null;
}

export async function loadSysvDataPackageSource(
  options?: { includeVropsTimeSeries?: boolean; onProgress?: (p: SysvDataPackageProgress) => void },
): Promise<SysvDataPackageSource>;

export function resolveSysvDataPackageFromSource(
  source: SysvDataPackageSource,
  scope: SysvDataPackageScope,
  options?: BuildSysvDataPackageOptions,
): ResolvedSysvDataPackage;
```

`resolveSysvDataPackageFromSource` ist **synchron und frei von Datenbankzugriffen**.
Der bestehende `resolveSysvDataPackage(scope, options)` bleibt als dünner Wrapper
erhalten, damit Vorschau und Einzelexport unverändert weiterlaufen:

```ts
async function resolveSysvDataPackage(scope, options) {
  const source = await loadSysvDataPackageSource(options);
  return resolveSysvDataPackageFromSource(source, scope, options);
}
```

Zu beachten: Auch `getTechInfoRowsByLatestPointers` ist heute ein Zugriff pro
Scope. Die Source lädt die Tech-Info-Rohzeilen einmal vollständig; die
Pointer-Auflösung arbeitet danach gegen eine In-Memory-Map.

### 5.3 Der Batch-Builder

```ts
export interface SysvBatchExportRequest {
  level: "person" | "department" | "area";
  /** Auf diesen Teilbaum begrenzen; leer bedeutet den gesamten Bestand. */
  root?: SysvDataPackageScope;
  includeVropsTimeSeries: boolean;
}

export async function buildSysvDataPackageBatch(
  request: SysvBatchExportRequest,
  options?: { onProgress?: (p: SysvBatchProgress) => void; signal?: AbortSignal },
): Promise<{ zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport }>;
```

Ablauf:

1. `loadSysvDataPackageSource` einmal aufrufen.
2. Aus `buildSysvDataPackageScopeDirectory(source.techInfoLatest)` die Zielscopes
   der gewählten Ebene bestimmen und auf `request.root` einschränken.
3. Je Scope `resolveSysvDataPackageFromSource` → `serializeSysvDataPackage` →
   `zipSysvDataPackage` aufrufen und das Ergebnis unter seinem Containerpfad
   ablegen.
4. Nach jedem Paket dessen Zwischenergebnisse freigeben (siehe 5.4).
5. Übersichtsbericht erzeugen und den Container zippen.

### 5.4 Speicher

Der Container wird als `Record<string, Uint8Array>` aufgebaut und enthält
zwangsläufig alle Blattpakete gleichzeitig komprimiert im Speicher. Verbindliche
Maßnahmen:

- Nach jedem Blattpaket werden `payload`, `files` und `preview` verworfen. Nur
  die fertigen ZIP-Bytes und der Berichtseintrag bleiben erhalten.
- `includeVropsTimeSeries` ist im Batch standardmäßig **aus**. Die
  Zeitreihen-Chunks dominieren die Paketgröße und werden bei
  Ebenen-Exporten mehrfach redundant abgelegt.
- Vor dem Start schätzt die UI die Gesamtgröße über
  `preview.estimatedCompressedBytes` aller Zielscopes und warnt ab 500 MB.
- Überschreitet der Container 3 GB, bricht der Lauf mit einer klaren Meldung ab.
  `fflate` erzeugt oberhalb von 4 GB ZIP64-Archive, und `readZipCentralDirectory`
  lehnt ZIP64 ab (`sysvDataPackageFormat.ts`) — ein solcher Container wäre nicht
  mehr auflösbar.

### 5.5 Redundanz ist beabsichtigt

Im Bereichs-Batch erscheint jede VM in mindestens drei Paketen (Person,
Abteilung, Bereich), bei Doppelrolle SysV/SysVStv häufiger. Das ist gewollt: Jedes
Paket muss für sich allein verteilbar und importierbar sein. Der
Übersichtsbericht weist den Redundanzfaktor als Kennzahl aus, damit die
Containergröße nachvollziehbar bleibt.

## 6. Multi-Paket-Import: Erkennung und Auswahl

### 6.1 Erkennung

`useImportController.importFiles` erhält eine vorgelagerte Sammelphase, die
`inspectSysvDataPackageFile` ersetzt:

```ts
interface DiscoveredSysvPackage {
  /** Anzeigepfad: Dateiname oder Pfad innerhalb des Containers. */
  path: string;
  bytes: Uint8Array;
  manifest: SysvDataPackageManifestV1;
}

async function discoverSysvPackages(files: File[]): Promise<DiscoveredSysvPackage[]>;
```

Regeln:

- Jede `.zip`-Datei wird geprüft. Enthält sie ein `manifest.json` im Root, ist sie
  ein Blattpaket.
- Andernfalls wird sie einmal ausgepackt und jeder enthaltene `.zip`-Eintrag
  rekursiv geprüft. Die Rekursionstiefe ist auf **4** begrenzt.
- Es werden höchstens **500** Pakete gesammelt.
- Dedup über `manifest.packageId`. Dasselbe Paket unter mehreren Containerpfaden
  — der in 3.3 beschriebene Regelfall — wird genau einmal verarbeitet.

Werden Pakete gefunden, übernimmt der Paketpfad die Verarbeitung vollständig. Die
bestehende Regel „ein SysV-Paket darf nicht zusammen mit anderen Dateien
importiert werden“ bleibt bestehen und gilt jetzt für die gesamte gefundene
Menge: Enthält der Upload zusätzlich XLSX-, CSV- oder TXT-Dateien, wird er
abgelehnt.

### 6.2 Auswahldialog

Ab zwei gefundenen Paketen erscheint vor dem Import ein Dialog mit der Liste aus
Scope-Typ, Anzeigename, VM-Anzahl und Containerpfad. Vorauswahl: alle. Der
Nutzer kann einzelne abwählen.

Der Dialog zeigt zusätzlich die aus den Manifesten berechnete Vorschau der
Vereinigung: eindeutige VMs, vCenter, Snapshots. Da die `counts` der Manifeste
Überschneidungen enthalten, ist dies erst nach Validierung exakt; vorab wird die
Obergrenze als „bis zu N VMs“ ausgewiesen.

## 7. Ablehnungsregeln

Vor dem Schreiben wird die gesamte Paketmenge geprüft. Verstöße brechen den
Import ab, bevor Daten verändert werden.

| Prüfung | Bedingung | Meldung |
|---|---|---|
| Formatversion | alle `manifest.version === 1` | „Paket X verwendet eine nicht unterstützte Formatversion.“ |
| Datenrichtlinie | alle `dataPolicy === "strict-vm-scope-v1"` | „Paket X verwendet eine abweichende Datenrichtlinie.“ |
| Export-Generation | siehe unten | „Die Pakete stammen aus unterschiedlichen Exportläufen.“ |

**Export-Generation.** Zwei Pakete sind unvereinbar, wenn sie für dieselbe
`vcenterId` unterschiedliche `snapshotId`-Werte mitbringen. In diesem Fall
enthielte die Vereinigung zwei Zeitstände desselben vCenters, und alle
Aggregationen über Hosts und Cluster wären doppelt gezählt. Die Prüfung läuft
über `payload.snapshots` nach der Einzelvalidierung.

Ein Paket, dessen Einzelvalidierung durch `validateSysvDataPackageZip`
fehlschlägt, bricht den gesamten Import ab. Ein teilweiser Import wäre nicht
reproduzierbar und würde eine Datengrenze suggerieren, die niemand geprüft hat.

## 8. Merge-Semantik je Store

Grundregel: identischer Schlüssel bedeutet identischer Record, letztes Schreiben
gewinnt. Die folgenden Stores erfordern abweichende Behandlung.

### 8.1 `rawSheetBlobs` — Zeilenvereinigung

Der Schlüssel ist `[snapshotId, sheetName]`, aber jedes Paket bringt eine anders
gefilterte Zeilenmenge desselben Sheets. Blindes `put` würde die Zeilen aller
übrigen Pakete verwerfen.

Vorgehen je `[snapshotId, sheetName]`:

1. `headers` aller Pakete vergleichen. Bei Abweichung — nur bei
   unterschiedlichen Exportläufen möglich, die Abschnitt 7 bereits ausschließt —
   mit klarer Meldung abbrechen.
2. Zeilen aller Pakete sammeln und über einen stabilen Hash der serialisierten
   Wertezeile deduplizieren.
3. Die vereinigte Matrix **einmal** über `gzipJson` komprimieren und `rowCount`
   neu setzen.

Der Vergleichsschlüssel ist `JSON.stringify(values)`. Die Werte stammen aus
derselben Quellzeile und sind damit byteidentisch; eine feldweise Normalisierung
ist nicht erforderlich und würde echte Duplikate verschleiern.

### 8.2 `snapshots` — mehrere Herkunftsquellen

`SnapshotMeta.restrictedDataset` ist heute ein einzelnes Objekt. Statt das
bestehende Feld zu ändern, wird ein zusätzliches Feld ergänzt:

```ts
export interface SnapshotMeta {
  // ...
  /** Harte, beim SysV-Paketimport materialisierte Datengrenze. */
  restrictedDataset?: RestrictedDatasetSource;
  /**
   * Alle Pakete, die zu diesem Snapshot beigetragen haben. Bei einem
   * Einzelimport genau ein Eintrag, identisch mit `restrictedDataset`.
   */
  restrictedDatasetSources?: RestrictedDatasetSource[];
}
```

`restrictedDataset` bleibt gesetzt und trägt die Quelle mit dem breitesten
Scope (`area` vor `department` vor `person`; bei Gleichstand die alphabetisch
erste). Damit funktionieren `RestrictedDatasetBadge`, alle Prüfungen auf
`restrictedDataset?.kind === "sysv-package"` und `validateEntityReferences`
unverändert weiter.

`sheetStats` wird aus der vereinigten Raw-Sheet-Matrix neu berechnet, nicht aus
einem der Pakete übernommen.

### 8.3 `entities_snapshot` — kein stabiler Schlüssel

Dieser Store verwendet `keyPath: "id", autoIncrement: true`. Dass die in den
Paketen mitgelieferten `id`-Werte über Pakete hinweg zusammenpassen, ist heute
eine Folge der gemeinsamen Quelldatenbank und keine Zusicherung.

Vorgehen: Über `(snapshotId, vmName, name, created)` deduplizieren, das Feld `id`
verwerfen und die Datenbank neu vergeben lassen.

### 8.4 Tech-Info — Pointer-Integrität

`techinfo_rows` ist auf `[techInfoImportId, rowIndex]` gekeyt, und jedes Paket
bringt eine eigene `techInfoImportId` (`sysv-package:<packageId>:tech-info`).
Kollisionen gibt es daher nicht; alle Import-Metadaten und Rohzeilen aller Pakete
werden übernommen.

`techinfo_latest` ist auf `vmNameNorm` gekeyt. Bei mehreren Paketen mit derselben
VM gewinnt ein beliebiger Record — inhaltlich sind sie bis auf
`techInfoImportId` und `rowIndex` identisch. Verbindlich ist nur: Der übernommene
Pointer muss auf eine tatsächlich geschriebene Zeile zeigen. Deterministisch wird
der Record des Pakets mit dem breitesten Scope übernommen, analog zu 8.2.

### 8.5 vROps — Chunk-Zusammenführung

Jedes Paket bringt eine eigene `importId`, sodass nichts kollidiert. Die
Leseseite verwendet aber `vropsImports[0]` (`sysvDataPackageService.ts`) und
würde alle übrigen Importe ignorieren. Die Zeitreihen müssen daher zu **einem**
Import zusammengeführt werden.

Neue Import-ID: `sysv-merge:<importSessionId>:vrops`.

Objekte und Summaries werden über `objectKey` dedupliziert und auf die neue
`importId` umgeschrieben.

Chunks werden über `chunkKey` gruppiert. Innerhalb einer Gruppe:

1. `startUtc` und `slotCount` müssen übereinstimmen; andernfalls abbrechen.
2. Die Vereinigung der `objectKeys` unter Beibehaltung der Ersteinfügereihenfolge
   bilden.
3. Je Metrik einen `Float32Array` der Länge `objectKeys.length * slotCount`
   anlegen und die Slots jedes Quellobjekts an seine neue Position kopieren.
   Metriken, die in einem Quellchunk fehlen, werden mit `NaN` aufgefüllt.
4. `maintenanceCodes` und `maintenanceDerived` analog als `Uint8Array` behandeln.
   Das `maintenanceLexicon` muss über die Gruppe identisch sein; andernfalls
   werden die Codes verworfen und eine Warnung ausgegeben.
5. `qualitySummary` über den zusammengeführten Bestand neu berechnen.

Dies ist die Umkehrung von `sliceVropsTimeSeriesChunk` und gehört als reine,
testbare Funktion `mergeVropsTimeSeriesChunks` in denselben Modul-Kontext.

### 8.6 `metrics_cache`

Wird nicht aus Paketen befüllt und beim Merge geleert, wie schon beim
Einzelimport.

## 9. Herkunftsverfolgung und Anzeige

### 9.1 Speicherung

Ein neuer Store `sysv_packages` hält einen Record je importiertem Paket. Der
Schlüssel ist `packageId`; damit ist der Store ohne Migrationslogik
selbstheilend, weil er bei jedem Import mit geleert und neu geschrieben wird.

```ts
export interface ImportedSysvPackage {
  packageId: string;
  scopeKind: SysvDataPackageScope["kind"];
  scopeLabel: string;
  createdAt: string;
  importedAt: string;
  /** Pfad innerhalb des Container-ZIPs; leer bei Einzelimport. */
  containerPath: string;
  vmCount: number;
  vmKeys: string[];
}
```

`DB_VERSION` wird von 29 auf 30 erhöht. `sysv_packages` wird in
`SYSV_PACKAGE_REPLACE_STORES` und in die Löschpfade aufgenommen, aber **nicht**
in `USER_DATA_STORES` — es ist Analysedatum, kein Userdatum, und gehört nicht ins
Backup.

### 9.2 Filterbarkeit

`evaluateRule` liest bei `sourceScope: "vm"` Felder direkt vom `NormalizedVm`
(`globalFilter.ts`). Ein Feld auf der VM ist damit ohne neue Filter-Infrastruktur
filterbar:

```ts
export interface NormalizedVm {
  // ...
  /**
   * Anzeigenamen der SysV-Pakete, aus denen diese VM stammt. Wird ausschließlich
   * beim Merge gesetzt und ist nicht Teil des Paketformats.
   */
  sysvPackageScopes?: string[];
}
```

Erforderliche Anpassungen:

1. `evaluateValue` in `globalFilter.ts` muss Array-Werte unterstützen: Bei einem
   Array gilt die Regel als erfüllt, wenn **ein** Element sie erfüllt. Heute
   werden Arrays an `String()` übergeben und ergäben kommaseparierten Unsinn.
2. `buildGlobalFilterFields` registriert `sysvPackageScopes` als VM-Feld mit dem
   Label „SysV-Datenpaket“, aber nur, wenn mindestens eine VM den Wert trägt.
   Damit erscheint das Feld ausschließlich nach einem Paketimport.

Das Feld ist ein gewöhnlicher, entfernbarer Filter. Es erweitert die Datengrenze
nicht — es schränkt innerhalb der bereits materialisierten Vereinigung ein.

### 9.3 Kennzeichnung

`RestrictedDatasetBadge` zeigt bei mehreren Quellen die Anzahl statt eines
einzelnen Labels:

```text
Eingeschränkter SysV-Datensatz · 12 Pakete
```

Der Tooltip listet die Scopes auf, bei mehr als zehn gekürzt. Der bestehende
Text zum gemeinsamen Kapazitätskontext bleibt unverändert.

Zusätzlich erhält **Einstellungen** eine Übersicht der importierten Pakete mit
Scope, VM-Anzahl und Importzeitpunkt, gespeist aus `sysv_packages`.

## 10. Konkrete Änderungen nach Datei

| Datei | Änderung |
|---|---|
| `src/domain/models/types.ts` | `restrictedDatasetSources`, `sysvPackageScopes`, `ImportedSysvPackage`, Batch-Report-Typen |
| `src/domain/services/sysvDataPackageService.ts` | Ladephase und Filterphase trennen; `SysvDataPackageSource` |
| `src/domain/services/sysvBatchExportService.ts` | **neu** — Ebenenauswahl, Containeraufbau, Übersichtsbericht |
| `src/lib/export/sysvDataPackageContainer.ts` | **neu** — Containerpfade, Kollisionsauflösung, rekursive Paketsuche |
| `src/domain/services/sysvPackageMergeService.ts` | **neu** — Vereinigung aller Stores, vROps-Chunk-Merge, Ablehnungsregeln |
| `src/lib/export/sysvDataPackageFormat.ts` | keine Formatänderung; `mergeVropsTimeSeriesChunks` ergänzen |
| `src/data/db/index.ts` | `DB_VERSION` 30, Store `sysv_packages`, `mergeAnalysisDataWithSysvPackages` |
| `src/hooks/useSysvDataPackageExport.ts` | Batch-Modus, Fortschritt je Paket, Abbruch |
| `src/components/exports/SysvDataPackageTab.tsx` | Ebenenauswahl, Batch-Vorschau, Größenwarnung |
| `src/hooks/useImportController.tsx` | `discoverSysvPackages`, Auswahldialog, Merge-Aufruf |
| `src/components/import/SysvPackageSelectionDialog.tsx` | **neu** — Paketauswahl vor dem Import |
| `src/lib/globalFilter.ts` | Array-Werte in `evaluateValue`; `sysvPackageScopes` als VM-Feld |
| `src/components/layout/RestrictedDatasetBadge.tsx` | Mehrfachquellen anzeigen |
| `src/pages/Settings.tsx` | Übersicht importierter Pakete |

Die Implementierung beginnt gemäß Repositoryregel mit den Typen in
`src/domain/models/types.ts`.

## 11. Implementierungsreihenfolge

### Phase 1: Source-Trennung

1. `SysvDataPackageSource` und `loadSysvDataPackageSource` implementieren.
2. `resolveSysvDataPackageFromSource` als synchrone, DB-freie Funktion
   herauslösen.
3. `resolveSysvDataPackage` auf den Wrapper reduzieren.
4. Bestehende Tests in `sysvDataPackageService.test.ts` müssen unverändert grün
   bleiben — das ist der Beleg für die Verhaltensgleichheit.
5. Test ergänzen: zwei Scopes aus derselben Source erzeugen dieselben Pakete wie
   zwei Einzelaufrufe.

### Phase 2: Container und Batch-Export

1. Containerpfade und Kollisionsauflösung implementieren.
2. `buildSysvDataPackageBatch` mit Fortschritt und Abbruch implementieren.
3. Übersichtsbericht inklusive `crossesParentScope` und Redundanzfaktor.
4. Größenprüfungen und Abbruchgrenzen aus 5.4.
5. Tests: Ebenenauswahl, übersprungene Scopes, Namenskollision,
   Personenpaket unter mehreren Abteilungen.

### Phase 3: Paketsuche und Auswahl

1. `discoverSysvPackages` mit Rekursionsgrenze und Dedup über `packageId`.
2. Auswahldialog mit Obergrenzen-Vorschau.
3. Ablehnungsregeln aus Abschnitt 7.
4. Tests: verschachtelter Container, dasselbe Paket doppelt, gemischter Upload
   mit XLSX, unterschiedliche Exportgenerationen.

### Phase 4: Merge

1. `mergeVropsTimeSeriesChunks` als reine Funktion mit Property-Test gegen
   `sliceVropsTimeSeriesChunk`: Slicen und wieder Zusammenführen muss den
   Ausgangschunk reproduzieren.
2. Raw-Sheet-Zeilenvereinigung.
3. Snapshot-, Tech-Info- und `entities_snapshot`-Zusammenführung.
4. `mergeAnalysisDataWithSysvPackages` als eine Transaktion; bei Fehler
   vollständiger Abbruch ohne Datenänderung.
5. Tests: Idempotenz und Teilmengentoleranz (siehe 12).

### Phase 5: Anzeige

1. Store `sysv_packages` und `DB_VERSION` 30.
2. `sysvPackageScopes` beim Merge setzen.
3. Array-Auswertung in `globalFilter.ts` und Feldregistrierung.
4. Badge und Settings-Übersicht.

## 12. Verbindliche Testfälle

Die folgenden Fälle sind der Kern der Absicherung und müssen als Unit-Tests
vorliegen.

**Idempotenz.** Ein Paket zweimal in derselben Menge importieren ergibt exakt
denselben Datenbestand wie ein einmaliger Import — gleiche VM-Anzahl, gleiche
Raw-Sheet-Zeilenzahl, gleiche vROps-Objektzahl.

**Teilmengentoleranz.** Ein Abteilungspaket und ein darin enthaltenes
Personenpaket gemeinsam importieren ergibt exakt den Datenbestand des
Abteilungspakets allein, ergänzt um `sysvPackageScopes` mit zwei Einträgen für
die VMs der Person.

**Echte Vereinigung.** Zwei disjunkte Personenpakete ergeben die Summe beider
VM-Mengen, und die Raw-Sheets enthalten die Zeilen beider Pakete.

**vROps-Rundreise.** Ein Chunk wird über `sliceVropsTimeSeriesChunk` in zwei
disjunkte Teilmengen zerlegt; `mergeVropsTimeSeriesChunks` reproduziert daraus
den Ausgangschunk — identische `objectKeys` als Menge und identische
Metrikwerte je Objekt.

**Grenzverletzung.** Nach dem Merge existiert keine VM, kein Host, kein Cluster
und keine Raw-Sheet-Zeile, die in keinem der importierten Pakete enthalten war.
Dies ist der Regressionstest gegen die harte Datengrenze und muss über alle
Stores laufen.

**Ablehnung.** Zwei Pakete mit derselben `vcenterId`, aber unterschiedlichen
`snapshotId`-Werten führen zum Abbruch ohne Datenänderung.

**Leerer Batch.** Ein Batch, in dem kein einziger Scope exportierbar ist,
schlägt fehl; ein Batch mit einem einzigen exportierbaren Scope gelingt und
weist die übrigen in `skipped` aus.

## 13. Nicht-Ziele

- Kein neuer Scope-Typ `organisation`. Ein „Firmenpaket“ wäre ein Einzelpaket
  über den gesamten Bestand und damit funktional ein normaler RVTools-Export.
  Für die ganze Firma ist der Bereichs-Batch das vorgesehene Mittel.
- Kein Scope-Typ `person∩department` (siehe 3.3).
- Kein inkrementelles Hinzufügen zu einem bestehenden Datenbestand (siehe 3.5).
- Keine Pseudonymisierung — unverändert nicht vorgesehen.
- Kein ZIP64. Container oberhalb der Grenzen aus 5.4 werden abgelehnt statt
  erzeugt.
- Keine Änderung am Paketformat Version 1.

## 14. Offene Punkte

Die folgenden Entscheidungen wurden im Rahmen dieser Spezifikation getroffen und
sind bei abweichender fachlicher Vorgabe zu revidieren:

1. **Personen-Scopes bleiben global** (3.3). Alternative wäre ein neuer
   Scope-Typ mit Manifest-Version 2 — deutlich größerer Eingriff, der die
   Eigenständigkeit von Personenpaketen aufgibt.
2. **Herkunft aus dem Manifest** (3.4). Alternative wäre die Containerposition,
   was den Einzelimport ohne Container jedoch nicht abdecken kann.
3. **vROps im Batch standardmäßig aus** (5.4). Falls Zeitreihen im Batch
   regelmäßig gebraucht werden, sollte stattdessen eine Begrenzung auf die
   Personenebene erwogen werden, wo die Redundanz am geringsten ist.
