# Wartungsfenster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine leere, lokale Wartungsfenster-Verwaltung mit komfortablem Wocheneditor, Textimport und sofortiger TechInfo-Systemzuordnung unter `/wartungsfenster` bereitstellen.

**Architecture:** Reine, getrennt testbare TypeScript-Module übernehmen Slotberechnung, Parser und Zuordnung. IndexedDB speichert ausschließlich kanonische Definitionen; ein TanStack-Query-Hook kapselt CRUD/Upsert. Kleine React-Komponenten bilden Katalog, Editor, Wochenraster und Importvorschau, während die Seite nur Datenfluss und Auswahl orchestriert.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, IndexedDB via `idb`, Vitest, Testing Library

---

## Dateistruktur

**Neu:**

- `src/lib/maintenanceWindows.ts` – Slot-/Regellogik, Normalisierung, Zusammenfassung und TechInfo-Zuordnung
- `src/lib/maintenanceWindowImport.ts` – Parser, Beschreibungserkennung, Validierung und Upsert-Vorschau
- `src/hooks/useMaintenanceWindows.ts` – Query und Mutationen für den Katalog
- `src/components/maintenance-windows/MaintenanceWeekGrid.tsx` – zugängliches 7×48-Raster
- `src/components/maintenance-windows/MaintenanceWindowEditor.tsx` – Entwurf, Regelwerkzeuge und Rohmasken
- `src/components/maintenance-windows/MaintenanceWindowImportDialog.tsx` – Texteingabe und Importvorschau
- `src/pages/MaintenanceWindows.tsx` – Katalog, Kennzahlen, Auswahl und Zuordnungen
- `src/test/maintenanceWindows.test.ts` – reine Slot-/Regel-/Zuordnungslogik
- `src/test/maintenanceWindowImport.test.ts` – Parser und Importvorschau
- `src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx` – Rasterinteraktion
- `src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx` – Editorverhalten
- `src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx` – Importdialog
- `src/pages/MaintenanceWindows.test.tsx` – Seitenzustände und Zuordnungen

**Ändern:**

- `src/domain/models/types.ts` – zentrale Wartungsfenster-Typen
- `src/data/db/index.ts` – DB v20, Store und CRUD/Upsert
- `src/data/db/index.test.ts` – Migration und Persistenz
- `src/lib/backup/userDataBackup.ts` – Katalog sichern/wiederherstellen
- `src/test/userDataBackup.test.ts` – Backup-Kompatibilität
- `src/pages/Settings.tsx` – Backup-Query-Invalidierung und Ergebnistext
- `src/hooks/useActiveSnapshots.ts` – Query für alle neuesten TechInfo-Systeme
- `src/App.tsx` – Lazy Route
- `src/app/layout/AppSidebar.tsx` – Tool-Navigation
- `src/lib/glossary.ts` – Sidebar-Hilfe
- `src/index.css` – fokussierte Wochenraster-Styles/Animationen

## Task 1: Domain-Typen und Wochenplan-Logik

**Files:**
- Modify: `src/domain/models/types.ts`
- Create: `src/lib/maintenanceWindows.ts`
- Create: `src/test/maintenanceWindows.test.ts`

- [ ] **Step 1: Failing Tests für Masken, Zeitregeln und Zuordnung schreiben**

```ts
import { describe, expect, it } from "vitest";
import {
  applyTimeRange,
  assignMaintenanceWindows,
  createEmptyWeeklySlots,
  externalMaskToSlots,
  slotsToExternalMask,
} from "@/lib/maintenanceWindows";

describe("maintenance window slots", () => {
  it("konvertiert die invertierte 48-stellige Austauschmaske verlustfrei", () => {
    const mask = "001111111111111111111111111111111111111111111111";
    expect(slotsToExternalMask(externalMaskToSlots(mask))).toBe(mask);
  });

  it("verteilt ein Fenster über Mitternacht auf beide Kalendertage", () => {
    const result = applyTimeRange(createEmptyWeeklySlots(), [4, 5, 6], "22:00", "04:00", true);
    expect(result[4].slice(44)).toEqual([true, true, true, true]);
    expect(result[5].slice(0, 8)).toEqual(Array(8).fill(true));
    expect(result[0].slice(0, 8)).toEqual(Array(8).fill(false));
  });
});

describe("maintenance window assignments", () => {
  it("ordnet normalisiert zu und gruppiert unbekannte Werte", () => {
    const definitions = [{ id: "1", abbreviation: "CLDAY" }] as MaintenanceWindowDefinition[];
    const systems = [
      { vmName: "APP01", maintenanceWindow: " clday " },
      { vmName: "APP02", maintenanceWindow: "NEU" },
      { vmName: "APP03", maintenanceWindow: null },
    ] as TechInfoLatest[];
    const result = assignMaintenanceWindows(definitions, systems);
    expect(result.known[0].systemNames).toEqual(["APP01"]);
    expect(result.unknown[0]).toMatchObject({ value: "NEU", systemNames: ["APP02"] });
  });
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/test/maintenanceWindows.test.ts`

Expected: FAIL, weil `@/lib/maintenanceWindows` und die Domain-Typen noch fehlen.

- [ ] **Step 3: Zentrale Typen hinzufügen**

```ts
export type MaintenanceWindowHandling = "regular" | "always" | "approval-required" | "external";
export type MaintenanceWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type MonthlyOccurrence = 1 | 2 | 3 | 4 | 5 | "last";

export interface MaintenanceCalendarRule {
  weekday: MaintenanceWeekday;
  occurrences: MonthlyOccurrence[];
}

export interface MaintenanceWindowDefinition {
  id: string;
  abbreviation: string;
  normalizedAbbreviation: string;
  description: string;
  handling: MaintenanceWindowHandling;
  weeklySlots: [boolean[], boolean[], boolean[], boolean[], boolean[], boolean[], boolean[]];
  calendarRules: MaintenanceCalendarRule[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Minimale reine Implementierung ergänzen**

`maintenanceWindows.ts` exportiert diese feste API:

```ts
export const DAY_LABELS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const SLOT_COUNT = 48;
export const createEmptyDaySlots = (): boolean[] => Array(SLOT_COUNT).fill(false);
export const createEmptyWeeklySlots = (): MaintenanceWindowDefinition["weeklySlots"] =>
  Array.from({ length: 7 }, createEmptyDaySlots) as MaintenanceWindowDefinition["weeklySlots"];
export const normalizeMaintenanceAbbreviation = (value: string): string => value.trim().toLocaleLowerCase("de-DE");

export function externalMaskToSlots(mask: string): boolean[] {
  if (!/^[01]{48}$/.test(mask)) throw new Error("Eine Tagesmaske muss genau 48 Zeichen aus 0 und 1 enthalten.");
  return [...mask].map((value) => value === "0");
}

export function slotsToExternalMask(slots: readonly boolean[]): string {
  if (slots.length !== SLOT_COUNT) throw new Error("Ein Tag muss genau 48 Zeitslots enthalten.");
  return slots.map((allowed) => allowed ? "0" : "1").join("");
}
```

Zusätzlich implementieren: `timeToSlot`, `applyTimeRange`, `summarizeWeeklySlots`, `isDateAllowedByCalendarRules` und `assignMaintenanceWindows`. `applyTimeRange` klont alle Tagesarrays, behandelt `start === end` als 24 Stunden und schreibt bei `end < start` die Slots bis 24:00 sowie am Folgetag ab 00:00. `assignMaintenanceWindows` sortiert Systemnamen mit `localeCompare("de-DE", { numeric: true })`, ignoriert leere Werte und behält beim unbekannten Wert die erste sichtbare Schreibweise.

- [ ] **Step 5: GREEN verifizieren und weitere Randfälle ergänzen**

Run: `npm run test -- src/test/maintenanceWindows.test.ts`

Expected: PASS für Konvertierung, Mitternacht, `start === end`, Monatsvorkommen, Zusammenfassung und Zuordnung.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/models/types.ts src/lib/maintenanceWindows.ts src/test/maintenanceWindows.test.ts
git commit -m "feat: add maintenance window domain logic"
```

## Task 2: Textparser und Upsert-Vorschau

**Files:**
- Create: `src/lib/maintenanceWindowImport.ts`
- Create: `src/test/maintenanceWindowImport.test.ts`

- [ ] **Step 1: Failing Parser-Tests schreiben**

```ts
import { describe, expect, it } from "vitest";
import { buildMaintenanceImportPreview, parseMaintenanceWindowText } from "@/lib/maintenanceWindowImport";

const ALL_BLOCKED = "1".repeat(48);
const FIRST_HOUR = "00" + "1".repeat(46);

describe("parseMaintenanceWindowText", () => {
  it("ignoriert Kopf und Leerzeilen und liest Montag bis Sonntag", () => {
    const input = ["AbkÃ¼rzung", "Details", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag", "", "OCP MO1", "OCP Montag 00:00-01:00", FIRST_HOUR, ...Array(6).fill(ALL_BLOCKED)].join("\r\n\r\n");
    const result = parseMaintenanceWindowText(input);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].definition.abbreviation).toBe("OCP MO1");
    expect(result.entries[0].definition.weeklySlots[0].slice(0, 2)).toEqual([true, true]);
  });

  it("meldet Maskenlänge und doppelten normalisierten Schlüssel konkret", () => {
    const input = ["ABC", "Text", "0".repeat(47), ...Array(6).fill(ALL_BLOCKED), " abc ", "Text", ...Array(7).fill(ALL_BLOCKED)].join("\n");
    const result = parseMaintenanceWindowText(input);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["mask-length", "duplicate-abbreviation"]));
  });
});

describe("buildMaintenanceImportPreview", () => {
  it("klassifiziert neue, aktualisierte und unveränderte Einträge", () => {
    const preview = buildMaintenanceImportPreview(parsedEntries, existingDefinitions);
    expect(preview.map((row) => row.status)).toEqual(["new", "update", "unchanged"]);
  });
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/test/maintenanceWindowImport.test.ts`

Expected: FAIL wegen fehlendem Parsermodul.

- [ ] **Step 3: Parser mit explizitem Ergebnisvertrag implementieren**

```ts
export type MaintenanceImportIssueCode =
  | "incomplete-block" | "empty-abbreviation" | "mask-length"
  | "mask-characters" | "duplicate-abbreviation" | "description-conflict";
export interface MaintenanceImportIssue {
  severity: "warning" | "error";
  code: MaintenanceImportIssueCode;
  block: number;
  field?: string;
  message: string;
}
export interface ParsedMaintenanceEntry {
  block: number;
  definition: MaintenanceWindowDefinition;
  issues: MaintenanceImportIssue[];
}
export interface MaintenanceImportParseResult {
  entries: ParsedMaintenanceEntry[];
  errors: MaintenanceImportIssue[];
  warnings: MaintenanceImportIssue[];
}
export type MaintenanceImportStatus = "new" | "update" | "unchanged";
```

Der Parser normalisiert `\r\n`/`\r`, trimmt Zeilen, entfernt leere Zeilen und erkennt die neun bekannten Kopfbezeichnungen nur am Dateianfang. Danach liest er strikt Blöcke aus neun nicht leeren Zeilen. IDs neuer Einträge entstehen mit `crypto.randomUUID()`, Zeitstempel einmal pro Parse-Lauf. Beschreibungserkennung verwendet begrenzte reguläre Ausdrücke für „nur nach Rücksprache“, „laut …“, `00:00 - 24:00` und `(1.|2.|3.|4.|5.|letzter) ...tag im Monat`; die Maske wird niemals aufgrund des Beschreibungstexts überschrieben.

`buildMaintenanceImportPreview(entries, existing)` gleicht per `normalizeMaintenanceAbbreviation` ab, übernimmt bei Updates `id` und `createdAt`, setzt `updatedAt` neu und vergleicht fachliche Felder ohne Zeitstempel.

- [ ] **Step 4: GREEN verifizieren**

Run: `npm run test -- src/test/maintenanceWindowImport.test.ts`

Expected: PASS einschließlich CRLF, Leerzeilen, kaputter Kopfzeile, sieben Masken, Monatsregel, Warnung und Upsert-Kategorien.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/maintenanceWindowImport.ts src/test/maintenanceWindowImport.test.ts
git commit -m "feat: parse maintenance window text imports"
```

## Task 3: IndexedDB v20, CRUD und Nutzerdaten-Backup

**Files:**
- Modify: `src/data/db/index.ts`
- Modify: `src/data/db/index.test.ts`
- Modify: `src/lib/backup/userDataBackup.ts`
- Modify: `src/test/userDataBackup.test.ts`

- [ ] **Step 1: Failing Migration-/CRUD-Tests hinzufügen**

```ts
describe("maintenance window definitions", () => {
  it("legt den v20-Store additiv an und erhält bestehende TechInfo-Daten", async () => {
    // v19-DB mit techinfo_latest öffnen und befüllen, schließen, reales getDb importieren.
    const { getDb } = await import("./index");
    const db = await getDb();
    expect(db.objectStoreNames.contains("maintenance_windows")).toBe(true);
    await expect(db.getAll("techinfo_latest")).resolves.toHaveLength(1);
  });

  it("speichert Upserts atomar und sortiert nach Abkürzung", async () => {
    const { getMaintenanceWindows, putMaintenanceWindow, upsertMaintenanceWindows } = await import("./index");
    await putMaintenanceWindow(definition("b"));
    await upsertMaintenanceWindows([definition("A"), definition("B", "bestehende-id")]);
    expect((await getMaintenanceWindows()).map((item) => item.abbreviation)).toEqual(["A", "B"]);
  });
});
```

Backup-Test:

```ts
expect(createUserDataBackup({
  maintenanceSettings: null,
  maintenanceClusterAssignments: [],
  maintenanceWindows: [definition("CLDAY")],
  scenarios: [],
}, "2026-07-17T12:00:00.000Z").maintenanceWindows).toHaveLength(1);
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/data/db/index.test.ts src/test/userDataBackup.test.ts`

Expected: FAIL, Store und Backup-Feld fehlen.

- [ ] **Step 3: DB-Schema und additive Migration implementieren**

In `RVToolsDBSchema` ergänzen:

```ts
maintenance_windows: {
  key: string;
  value: MaintenanceWindowDefinition;
  indexes: { normalizedAbbreviation: string; updatedAt: string };
};
```

Jede Schreibfunktion berechnet den bereits im Domain-Typ vorhandenen Indexschlüssel `normalizedAbbreviation` erneut aus `abbreviation`. `DB_VERSION` wird 20. Der Upgrade-Handler erzeugt den Store mit `keyPath: "id"` und den Indizes `normalizedAbbreviation` (unique) und `updatedAt`. Store in `StoreName`, `ALL_STORES` und `STORE_DELETE_LABELS` aufnehmen.

- [ ] **Step 4: CRUD und atomaren Upsert implementieren**

```ts
export async function getMaintenanceWindows(): Promise<MaintenanceWindowDefinition[]>;
export async function putMaintenanceWindow(value: MaintenanceWindowDefinition): Promise<void>;
export async function deleteMaintenanceWindow(id: string): Promise<void>;
export async function upsertMaintenanceWindows(values: MaintenanceWindowDefinition[]): Promise<void>;
```

Alle Schreibfunktionen setzen `normalizedAbbreviation`. `upsertMaintenanceWindows` öffnet eine einzige `readwrite`-Transaktion, sucht vorhandene Werte über den Unique-Index, übernimmt deren ID/Erstellzeit und führt `put` aus. Ein ConstraintError wird als verständlicher Fehler „Abkürzung ist bereits vorhanden“ weitergegeben.

- [ ] **Step 5: Backup v2 kompatibel erweitern**

`USER_DATA_BACKUP_VERSION` auf 2 erhöhen, `maintenanceWindows` in Input/Backup/RestoreResult aufnehmen und Version 1 weiterhin akzeptieren, indem fehlende `maintenanceWindows` als `[]` normalisiert werden. `Settings.tsx` lädt/schreibt den neuen Store beim Export/Import über die bestehenden Abläufe; Query `maintenanceWindows` nach Restore invalidieren.

- [ ] **Step 6: GREEN verifizieren**

Run: `npm run test -- src/data/db/index.test.ts src/test/userDataBackup.test.ts`

Expected: PASS für Migration, CRUD, Atomizität, Delete-All und Backup v1/v2.

- [ ] **Step 7: Commit**

```powershell
git add src/domain/models/types.ts src/data/db/index.ts src/data/db/index.test.ts src/lib/backup/userDataBackup.ts src/test/userDataBackup.test.ts src/pages/Settings.tsx
git commit -m "feat: persist maintenance window definitions"
```

## Task 4: TanStack-Query-Hook

**Files:**
- Create: `src/hooks/useMaintenanceWindows.ts`
- Create: `src/hooks/useMaintenanceWindows.test.tsx`

- [ ] **Step 1: Failing Hook-Test schreiben**

```tsx
it("invalidiert den Katalog nach dem Speichern", async () => {
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useMaintenanceWindows(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  result.current.save(definition("CLDAY"));
  await waitFor(() => expect(result.current.definitions).toHaveLength(1));
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/hooks/useMaintenanceWindows.test.tsx`

Expected: FAIL wegen fehlendem Hook.

- [ ] **Step 3: Hook implementieren**

Der Hook bietet genau:

```ts
interface UseMaintenanceWindowsResult {
  definitions: MaintenanceWindowDefinition[];
  isLoading: boolean;
  error: Error | null;
  isMutating: boolean;
  save: (definition: MaintenanceWindowDefinition) => void;
  remove: (id: string) => void;
  upsert: (definitions: MaintenanceWindowDefinition[]) => void;
}
```

Query-Key ist `["maintenanceWindows"]`. Drei `useMutation`-Instanzen verwenden die DB-Helper, invalidieren in `onSuccess` exakt diesen Key und reichen Fehler an die Seite weiter. Keine TechInfo-Daten im Hook laden; die Seite kombiniert vorhandene Hooks mit der reinen Zuordnungsfunktion.

- [ ] **Step 4: GREEN verifizieren und committen**

Run: `npm run test -- src/hooks/useMaintenanceWindows.test.tsx`

```powershell
git add src/hooks/useMaintenanceWindows.ts src/hooks/useMaintenanceWindows.test.tsx
git commit -m "feat: add maintenance window query hook"
```

## Task 5: Zugängliches Wochenraster

**Files:**
- Create: `src/components/maintenance-windows/MaintenanceWeekGrid.tsx`
- Create: `src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Failing Interaktionstest schreiben**

```tsx
it("schaltet Slots mit Klick und Leertaste und meldet Tag/Zeit/Zustand", () => {
  const onChange = vi.fn();
  render(<MaintenanceWeekGrid value={createEmptyWeeklySlots()} onChange={onChange} paintMode="allow" />);
  const slot = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" });
  fireEvent.click(slot);
  expect(onChange.mock.calls[0][0][0][0]).toBe(true);
  fireEvent.keyDown(slot, { key: " " });
  expect(onChange).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx`

Expected: FAIL, Komponente fehlt.

- [ ] **Step 3: Raster implementieren**

```ts
interface MaintenanceWeekGridProps {
  value: MaintenanceWindowDefinition["weeklySlots"];
  onChange: (value: MaintenanceWindowDefinition["weeklySlots"]) => void;
  paintMode: "allow" | "block";
  disabled?: boolean;
  compact?: boolean;
}
```

Die Komponente rendert `role="grid"`, sieben `role="row"` und 336 Buttons mit `role="gridcell"`, `aria-label`, `aria-selected` und `data-allowed`. Klick setzt auf den aktuellen Paint-Modus. Pointer-Enter mit gedrückter Primärtaste malt weitere Slots. Pfeiltasten bewegen den Fokus mit Wrap innerhalb der Woche; Leertaste/Enter schalten. `compact` rendert eine nicht interaktive Miniatur mit `aria-hidden`.

In `index.css` gezielte Klassen `.maintenance-grid`, `.maintenance-slot[data-allowed="true"]`, Stunden-Trennlinien, Sticky-Tageslabels, Fokus, Hover und Reduced-Motion ergänzen. Bestehende Tokens `primary`, `muted`, `border`, `success` und `warning` verwenden; keine neuen globalen Farbwerte.

- [ ] **Step 4: GREEN verifizieren und committen**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx`

```powershell
git add src/components/maintenance-windows/MaintenanceWeekGrid.tsx src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx src/index.css
git commit -m "feat: add accessible maintenance week grid"
```

## Task 6: Wartungsfenster-Editor

**Files:**
- Create: `src/components/maintenance-windows/MaintenanceWindowEditor.tsx`
- Create: `src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx`

- [ ] **Step 1: Failing Editor-Tests schreiben**

```tsx
it("wendet eine Werktagsregel an und speichert einen gültigen Entwurf", () => {
  const onSave = vi.fn();
  render(<MaintenanceWindowEditor value={newDefinition()} onSave={onSave} onDelete={vi.fn()} onDuplicate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Abkürzung"), { target: { value: "CLDAY" } });
  fireEvent.click(screen.getByRole("button", { name: "Werktage auswählen" }));
  fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "08:00" } });
  fireEvent.change(screen.getByLabelText("Endzeit"), { target: { value: "13:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Zeitregel anwenden" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(onSave.mock.calls[0][0].weeklySlots[0].slice(16, 26)).toEqual(Array(10).fill(true));
});

it("verhindert Speichern ohne Abkürzung und kennzeichnet Änderungen", () => {
  render(<MaintenanceWindowEditor value={newDefinition()} onSave={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} />);
  expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(screen.getByText("Abkürzung ist erforderlich.")).toBeInTheDocument();
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx`

Expected: FAIL, Editor fehlt.

- [ ] **Step 3: Editor nach freigegebenem Design implementieren**

Props:

```ts
interface MaintenanceWindowEditorProps {
  value: MaintenanceWindowDefinition;
  existingAbbreviations?: string[];
  isSaving?: boolean;
  onSave: (value: MaintenanceWindowDefinition) => void;
  onDelete: (value: MaintenanceWindowDefinition) => void;
  onDuplicate: (value: MaintenanceWindowDefinition) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
```

Editorabschnitte: Identität, Behandlungsart, Schnellauswahl, Zeitregel, Monatsregel, Raster, Zusammenfassung/Rohmasken, Aktionen. Schnellauswahl schreibt Slots deterministisch. `always` setzt alle Slots. `approval-required` und `external` deaktivieren die Zeitwerkzeuge, verändern eine importierte Maske aber nicht; neue Definitionen starten ohnehin vollständig gesperrt. Monatsregeln nutzen Checkboxen für 1–5/letzter und einen Wochentag-Select. Die Rohmaskenansicht berechnet sieben Strings über `slotsToExternalMask`. Eindeutigkeit wird normalisiert gegen `existingAbbreviations` geprüft, wobei die eigene Abkürzung ausgenommen ist.

- [ ] **Step 4: GREEN verifizieren und committen**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx`

```powershell
git add src/components/maintenance-windows/MaintenanceWindowEditor.tsx src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx
git commit -m "feat: add maintenance window editor"
```

## Task 7: Importdialog mit Vorschau

**Files:**
- Create: `src/components/maintenance-windows/MaintenanceWindowImportDialog.tsx`
- Create: `src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx`

- [ ] **Step 1: Failing Dialogtest schreiben**

```tsx
it("zeigt Upsert-Kategorien und blockiert fehlerhafte Auswahl", () => {
  const onImport = vi.fn();
  render(<MaintenanceWindowImportDialog open onOpenChange={vi.fn()} existing={existing} onImport={onImport} />);
  fireEvent.change(screen.getByLabelText("Wartungsfenster-Text"), { target: { value: invalidAndValidText } });
  fireEvent.click(screen.getByRole("button", { name: "Text prüfen" }));
  expect(screen.getByText("Neu")).toBeInTheDocument();
  expect(screen.getByText(/48 Zeichen/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx`

Expected: FAIL, Dialog fehlt.

- [ ] **Step 3: Dialog implementieren**

Der Dialog besitzt Props `open`, `onOpenChange`, `existing`, `onImport`, `isImporting`. Zustand: `text`, `preview`, `selectedBlocks`. „Text prüfen“ ruft Parser und Preview auf. Jede Vorschaukarte zeigt Status-Badge, Abkürzung, Beschreibung, Warnungen/Fehler, erkannte Behandlung/Monatsregel und Mini-Wochenraster. Fehlerhafte Zeilen sind nicht auswählbar. Der Importbutton ist nur aktiv, wenn mindestens ein fehlerfreier geänderter Eintrag ausgewählt ist. `onImport` erhält ausschließlich `new`/`update`, nie `unchanged`.

- [ ] **Step 4: GREEN verifizieren und committen**

Run: `npm run test -- src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx`

```powershell
git add src/components/maintenance-windows/MaintenanceWindowImportDialog.tsx src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx
git commit -m "feat: add maintenance window import preview"
```

## Task 8: Seite, Route, Sidebar und TechInfo-Zuordnungen

**Files:**
- Create: `src/pages/MaintenanceWindows.tsx`
- Create: `src/pages/MaintenanceWindows.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/layout/AppSidebar.tsx`
- Modify: `src/lib/glossary.ts`
- Modify: `src/hooks/useActiveSnapshots.ts`

- [ ] **Step 1: Failing Seitentest schreiben**

```tsx
it("startet leer und zeigt unbekannte TechInfo-Werte", async () => {
  mockDefinitions.mockReturnValue([]);
  mockTechInfo.mockReturnValue([
    techInfo("APP01", "NEU"),
    techInfo("APP02", " neu "),
  ]);
  renderPage();
  expect(await screen.findByText("Noch keine Wartungsfenster definiert")).toBeInTheDocument();
  expect(screen.getByText("NEU")).toBeInTheDocument();
  expect(screen.getByText("2 Systeme")).toBeInTheDocument();
});

it("zeigt Definitionen mit zugeordneter Systemzahl", async () => {
  mockDefinitions.mockReturnValue([definition("CLDAY")]);
  mockTechInfo.mockReturnValue([techInfo("APP01", "clday")]);
  renderPage();
  expect(await screen.findByText("CLDAY")).toBeInTheDocument();
  expect(screen.getByText("1 System")).toBeInTheDocument();
});
```

- [ ] **Step 2: RED verifizieren**

Run: `npm run test -- src/pages/MaintenanceWindows.test.tsx`

Expected: FAIL, Seite fehlt.

- [ ] **Step 3: Seite im `frontend-design`-Stil implementieren**

`src/hooks/useActiveSnapshots.ts` erhält `useAllTechInfoLatest()` mit Query-Key `["techInfoLatestAll"]` und dem bestehenden DB-Helper `getAllTechInfoLatest`. Die Seite nutzt `useMaintenanceWindows()`, `useAllTechInfoLatest()` und `assignMaintenanceWindows()`. Sie hält `selectedId`, `isImportOpen` und Dirty-Status. Neue Definitionen entstehen nur durch Benutzeraktion mit leerem Raster. Wechsel bei Dirty-State sowie Löschen verwenden Bestätigungsdialoge.

Layout:

- ruhiger Header mit Kalender-Icon, Titel und erklärendem Satz
- vier kompakte KPI-Karten: Definitionen, zugeordnete Systeme, unbekannte Werte, unbekannte Systeme
- Toolbar mit Suche und primären Aktionen
- breite Desktop-Komposition `minmax(18rem, 0.34fr) minmax(0, 1fr)` für Katalog/Editor
- Katalogkarten mit Mini-Wochenraster, Handling-Badge und Systemzahl
- Empty State mit zwei klaren Aktionen, ohne Seed/Beispielbutton
- Zuordnungssektion als zugängliche Collapsibles für bekannte und unbekannte Gruppen

Bestehende Tokens und Komponenten verwenden; keine neue UI-Bibliothek und keine generischen Farbverläufe. Den Wochenfahrplan als visuelles Leitmotiv ausarbeiten, mit präzisen Stundenmarken, ruhiger Flächentiefe und klarer Cyan-Akzentführung.

- [ ] **Step 4: Route, Sidebar und Glossar einhängen**

In `App.tsx`:

```tsx
const MaintenanceWindows = lazy(() => import("@/pages/MaintenanceWindows"));
// ...
<Route path="/wartungsfenster" element={<MaintenanceWindows />} />
```

In `toolsNav` vor „Wartungsankündigung“:

```ts
{ title: "Wartungsfenster", url: "/wartungsfenster", icon: CalendarRange },
```

`SIDEBAR_GLOSSARY["/wartungsfenster"]` beschreibt Pflege, Textimport und TechInfo-Zuordnung.

- [ ] **Step 5: GREEN verifizieren und committen**

Run: `npm run test -- src/pages/MaintenanceWindows.test.tsx`

```powershell
git add src/pages/MaintenanceWindows.tsx src/pages/MaintenanceWindows.test.tsx src/App.tsx src/app/layout/AppSidebar.tsx src/lib/glossary.ts src/hooks/useActiveSnapshots.ts
git commit -m "feat: add maintenance windows workspace"
```

## Task 9: Integration, React-Diagnose und Abschlussprüfung

**Files:**
- Modify only files implicated by verification failures within this feature scope

- [ ] **Step 1: Featuretests gemeinsam ausführen**

Run:

```powershell
npm run test -- src/test/maintenanceWindows.test.ts src/test/maintenanceWindowImport.test.ts src/data/db/index.test.ts src/test/userDataBackup.test.ts src/hooks/useMaintenanceWindows.test.tsx src/components/maintenance-windows/MaintenanceWeekGrid.test.tsx src/components/maintenance-windows/MaintenanceWindowEditor.test.tsx src/components/maintenance-windows/MaintenanceWindowImportDialog.test.tsx src/pages/MaintenanceWindows.test.tsx
```

Expected: Alle Tests PASS, keine unhandled warnings.

- [ ] **Step 2: Vollständige Qualitätssicherung ausführen**

Run:

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
```

Expected: Exit code 0 für alle vier Befehle. Bereits vorhandene, nicht featurebezogene Hinweise dokumentieren; neue Fehler vollständig beheben.

- [ ] **Step 3: React Doctor gemäß Repository-Skill ausführen**

Den Skill `react-doctor` lesen und dessen Diagnose gegen die geänderten React-Dateien ausführen. Gemeldete Fehler im Feature-Scope beheben und die betroffenen Tests danach erneut ausführen.

- [ ] **Step 4: Funktionale Browserprüfung**

Mit `npm run dev` die Route `/wartungsfenster` prüfen:

1. leerer Start ohne Seed-Daten
2. manuelles Fenster Mo–Fr 08:00–13:00 anlegen
3. Mitternachtsfenster Fr 22:00–Mo 04:00 anlegen
4. Rohmasken auf je 48 Zeichen prüfen
5. Beispieltext importieren und Upsert erneut ausführen
6. bekannte sowie unbekannte TechInfo-Zuordnungen prüfen
7. Tastaturbedienung des Rasters prüfen
8. Hell-/Dunkelmodus und schmale Breite prüfen

- [ ] **Step 5: Abschlusscommit**

```powershell
git status --short
git add -- src/domain/models/types.ts src/lib/maintenanceWindows.ts src/lib/maintenanceWindowImport.ts src/data/db/index.ts src/lib/backup/userDataBackup.ts src/pages/Settings.tsx src/hooks/useActiveSnapshots.ts src/hooks/useMaintenanceWindows.ts src/components/maintenance-windows src/pages/MaintenanceWindows.tsx src/App.tsx src/app/layout/AppSidebar.tsx src/lib/glossary.ts src/index.css
git commit -m "test: verify maintenance windows workflow"
```

Wenn nach Task 8 keine Dateien mehr geändert wurden, keinen leeren Commit erzeugen.
