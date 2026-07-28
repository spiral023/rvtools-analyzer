# Fill-Up-Policies als eigener Tab in der Planung

## Kontext

Fill-Up-Policies (`CapacityPolicy`) werden heute innerhalb des Tabs `Fill up`
in `src/pages/Planning.tsx` direkt unter `FillUpPlanningPanel` gerendert
(`CapacityPolicyEditor`). Der Editor bietet aktuell:

- Bearbeitung aller Guardrail-Felder einer Policy und Speichern als neue
  Version (`createNextCapacityPolicyVersion`),
- Zuweisung eines Basisprofils zu genau einem Cluster über zwei
  `Select`-Felder plus einen Einzel-Feld-Override.

Es gibt weder eine Übersicht "alle Cluster mit ihrer aktiven Policy" noch
CRUD (Anlegen/Duplizieren/Löschen) für Policies. Die 10 vordefinierten Profile
(`PROFILE_DEFINITIONS` in `capacityPolicyService.ts`) werden bei jedem Laden
über `mergeInitialAndStoredCapacityPolicies` automatisch nachgezogen, falls sie
fehlen.

Ziel dieser Änderung:

1. Fill-Up-Policies bekommen einen eigenen Tab `Policies` in der Planung.
2. Der neue Tab enthält eine KPI-Leiste, eine Tabelle aller Cluster mit ihrer
   aktiven Policy, und darunter einen Policy-Katalog mit Editor.
3. Policies können dort angelegt, bearbeitet und gelöscht werden.
4. Der Default für `cpuSafetyBufferPct` und `ramSafetyBufferPct` wird bei
   allen Policies auf 0 % gesetzt.

## Geklärte Entscheidungen

- **Löschen nur für eigene Policies.** Die 10 Standardprofile bleiben
  editierbar (neue Version), sind aber nicht löschbar — sie würden durch die
  bestehende Merge-Logik ohnehin beim nächsten Laden wiederkehren. Für ein
  echtes Löschen von Standardprofilen wäre eine zusätzliche
  Tombstone-Markierung nötig; das ist bewusst nicht Teil dieser Änderung.
- **Löschen blockiert bei aktiver Zuweisung.** Ist eine (eigene) Policy noch
  mindestens einem Cluster zugewiesen, wird das Löschen mit einer
  Fehlermeldung verhindert, statt Zuweisungen automatisch umzuhängen.
- **KPI-Leiste zeigt zwei Kacheln:** "Policies gesamt" (mit Subtitle "davon N
  eigene") und "Cluster ohne explizite Zuweisung" (Severity `warn`, wenn > 0).
- **Cluster-Tabelle ist die Zuweisungs-UI.** Die aktive Policy wird direkt in
  der Tabellenzeile per `Select` geändert; es gibt keine zusätzliche,
  redundante Zuweisungs-UI mehr. Einzel-Feld-Overrides pro Cluster bleiben
  erhalten, aber wandern in einen `Dialog` pro Zeile (kein neuer
  Popover-Baustein, da im Projekt noch keiner existiert).
- **Dateizuschnitt:** drei neue, fokussierte Komponenten
  (Cluster-Zuweisungstabelle, Policy-Katalogliste, zusammensetzendes Panel)
  statt einer großen Datei.
- **Fill-up-Tab bekommt einen Hinweis** anstelle des entfernten Editors, mit
  einem Button, der direkt in den neuen `Policies`-Tab wechselt (dafür werden
  die Tabs in `Planning.tsx` von `defaultValue` auf kontrollierten `value`
  umgestellt).

## Architektur

### Tab-Struktur (`src/pages/Planning.tsx`)

```tsx
const [tab, setTab] = useState("what-if");
<Tabs value={tab} onValueChange={setTab} className="space-y-4">
  <TabsList aria-label="Planungsbereich">
    <TabsTrigger value="what-if">What-if</TabsTrigger>
    <TabsTrigger value="fill-up">Fill up</TabsTrigger>
    <TabsTrigger value="policies">Policies</TabsTrigger>
  </TabsList>
  <TabsContent value="what-if" className="space-y-6">…</TabsContent>
  <TabsContent value="fill-up" className="space-y-6">
    <GlobalFilterScopeHint … />
    <FillUpPlanningPanel />
    <PolicyTabHint onNavigate={() => setTab("policies")} />
  </TabsContent>
  <TabsContent value="policies" className="space-y-6">
    <GlobalFilterScopeHint … />
    <PolicyManagementPanel />
  </TabsContent>
</Tabs>
```

`PolicyTabHint` ist eine kleine Inline-Card/Alert ("Policies werden jetzt im
Tab **Policies** verwaltet" + Button "Zu Policies wechseln").

### Domain/Service-Änderungen (`src/domain/services/capacityPolicyService.ts`)

- `BASE_VALUES.cpuSafetyBufferPct: 0` (vorher 10), `BASE_VALUES.ramSafetyBufferPct: 0` (vorher 10).
- Die Overrides `cpuSafetyBufferPct: 15, ramSafetyBufferPct: 15` werden aus
  den `values`-Objekten von `realtime-telephony`, `special` und
  `vmware-management` entfernt, damit wirklich alle 10 Profile auf 0 % starten.
- Neu: `BUILT_IN_CAPACITY_POLICY_IDS: ReadonlySet<string>` aus
  `PROFILE_DEFINITIONS.map(p => p.id)`.
- Neu: `isBuiltInCapacityPolicy(policy: CapacityPolicy): boolean` — prüft
  Mitgliedschaft in `BUILT_IN_CAPACITY_POLICY_IDS`.
- Neu: `createCustomCapacityPolicy(name: string, now?: string): CapacityPolicy`
  — `id: crypto.randomUUID()`, `profileKind: "custom"`, Werte = `BASE_VALUES`,
  `version: 1`.
- Neu: `duplicateCapacityPolicy(policy: CapacityPolicy, name: string, now?: string): CapacityPolicy`
  — Kopie aller Werte von `policy`, aber neue `id`, `profileKind: "custom"`,
  `version: 1`.

### Datenzugriff (`src/data/db/index.ts`)

- Neu: `deleteCapacityPolicy(id: string): Promise<void>` — löscht alle
  Versionszeilen der Policy über den vorhandenen `policyId`-Index im Store
  `capacity_policies`.

### Hook (`src/hooks/useCapacityPolicies.ts`)

- Neue Mutation `deletePolicy` (wrapping `deleteCapacityPolicy`, invalidiert
  beide Query-Keys).
- Der Hook bleibt sonst unverändert (`policies`, `assignments`, `savePolicy`,
  `saveAssignment`).

### `CapacityPolicyEditor.tsx` (verschlankt)

Wird zu einer reinen, kontrollierten Feld-Editor-Komponente:

```ts
function CapacityPolicyEditor({
  policy, onSaveVersion, isSaving, error,
}: {
  policy: CapacityPolicy;
  onSaveVersion: (next: CapacityPolicy) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}): JSX.Element
```

- Übernimmt unverändert `POLICY_GROUPS`, `BOOLEAN_FIELDS`, `NumericInput`,
  Validierung via `validateCapacityPolicy`.
- Neu: editierbares `Name`-Feld oben in der Card (bisher nicht editierbar,
  obwohl der Service es unterstützt) — wichtig für eigene Policies.
- Die komplette rechte Card "Clusterzuweisung" (Zeilen 138–162 im aktuellen
  Stand) entfällt ersatzlos; diese Funktion übernimmt die neue Tabelle.

### Neu: `PolicyClusterAssignmentTable.tsx`

`src/components/planning/policies/PolicyClusterAssignmentTable.tsx`

- Datenquelle: `useClusters()` + `useCapacityPolicies()`.
- Pro Cluster: `assignment = assignments.find(...)`,
  `effectivePolicy = resolveEffectiveCapacityPolicy(policies, assignment) ?? policies[0]`
  (gleicher Fallback wie in `fillUpPlanningService.ts:91`, damit die Anzeige
  konsistent mit der tatsächlichen Berechnung ist).
- Tabelle via bestehende `VirtualTable`-Komponente (wie `FillUpClusterTable`),
  Spalten: Cluster, **Aktive Policy** (`Select`, `onValueChange` ruft
  `saveAssignment(createCapacityPolicyAssignment(...))`), Version (Badge),
  Overrides (Anzahl als Badge + Button öffnet Dialog), Quelle ("Explizit" /
  "Fallback").
- Override-Dialog: gleiche Feld-Auswahl + Werteingabe wie im bisherigen
  `CapacityPolicyEditor`, aber pro Zeile in einem `Dialog` statt einer
  Dauerhaft sichtbaren Card.

### Neu: `PolicyCatalogList.tsx`

`src/components/planning/policies/PolicyCatalogList.tsx`

- Liste aller Policies (`policies` aus dem Hook), sortiert wie bisher
  (`getLatestCapacityPolicies` sortiert bereits alphabetisch).
- Pro Zeile: Name, Badge "Standard" oder "Eigene", Version.
- Auswahl per Klick (ähnlich Wartungsfenster-Katalog).
- Toolbar oberhalb: Button "Neue Policy" (Dialog mit Namensfeld →
  `createCustomCapacityPolicy` → `savePolicy`).
- Pro ausgewählter Policy: Button "Duplizieren" (Dialog mit Namensfeld →
  `duplicateCapacityPolicy` → `savePolicy`), Button "Löschen" — deaktiviert
  mit Tooltip "Standardprofile können nicht gelöscht werden", wenn
  `isBuiltInCapacityPolicy`; sonst mit `window.confirm` + Prüfung, ob noch
  Cluster zugewiesen sind (Fehlermeldung statt Löschen, falls ja).

### Neu: `PolicyManagementPanel.tsx`

`src/components/planning/policies/PolicyManagementPanel.tsx`

Komponiert für den `Policies`-Tab:

1. `KpiGrid` mit zwei `KpiCard`s ("Policies gesamt", "Cluster ohne explizite
   Zuweisung").
2. `<PolicyClusterAssignmentTable />`.
3. Zweispaltiges Layout wie `MaintenanceWindows.tsx`: links
   `PolicyCatalogList`, rechts `CapacityPolicyEditor` für die aktuell
   ausgewählte (oder neu angelegte, noch ungespeicherte) Policy.
4. Hält den lokalen State für "aktuell ausgewählte Policy-ID" /
   "Entwurf einer neuen Policy vor dem ersten Speichern".

### Glossar (`src/lib/glossaries/planning.ts`)

Neuer Export `FILL_UP_POLICY_KPI: Record<string, GlossaryEntry>` mit den
Einträgen `totalPolicies` und `unassignedClusters`, nach demselben Muster wie
`MAINTENANCE_WINDOWS_KPI`.

## Nicht Teil dieser Änderung

- Keine Migration bereits gespeicherter Policy-Versionen auf die neuen
  0-%-Defaults — Versionierung bleibt unverändert; nur zukünftige, nie
  bearbeitete Standardprofile starten bei 0 %.
- Keine Tombstone-Logik für das Löschen von Standardprofilen.
- Keine Änderung an `fillUpPlanningService.ts` oder der Berechnungslogik.

## Testplan

- Unit-Tests für `capacityPolicyService.ts`: neue Defaults (0 % für alle 10
  Profile), `createCustomCapacityPolicy`, `duplicateCapacityPolicy`,
  `isBuiltInCapacityPolicy`.
- Unit-Test für `deleteCapacityPolicy` in `db/index.ts` (löscht alle
  Versionszeilen).
- Komponenten-/Interaktionstests für `PolicyClusterAssignmentTable`
  (Zuweisung ändern, Override-Dialog) und `PolicyCatalogList` (Neu,
  Duplizieren, Löschen inkl. Blockade bei aktiver Zuweisung und bei
  Standardprofilen).
