# Wartungsfenster-Auslastungschart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unterhalb der KPI-Kacheln auf `/wartungsfenster` einen Chart anzeigen, der pro Zeit-Slot die Anzahl der Systeme mit offenem Wartungsfenster zeigt, umschaltbar zwischen Tag-, Wochen- und Monatsansicht, mit Markierung der aktuellen Uhrzeit.

**Architektur:** Eine reine TypeScript-Logikdatei (`src/lib/maintenanceWindowCoverage.ts`) aggregiert aus den bereits vorhandenen `KnownMaintenanceWindowAssignment`-Gruppen (aus `assignMaintenanceWindows`) pro Halbstunden-Slot eines Datumsbereichs die Systemanzahl mit offenem Fenster – inklusive echter Kalenderdaten und Monatsregeln über die vorhandene `isDateAllowedByCalendarRules`-Funktion. Zwei neue React-Komponenten stellen das Ergebnis dar: `MaintenanceCoverageChart` (Umschalter + Flächenchart für Tag/Woche) und `MaintenanceCoverageHeatmap` (Tag-×-Uhrzeit-Heatmap für Monat). Keine DB-Änderung, keine Änderung an bestehender Zuordnungslogik.

**Tech Stack:** React, recharts (`src/components/charts/recharts.ts`), Vitest + Testing Library, bestehende Design-Tokens (`src/lib/chartStyles.ts`, `hsl(var(--primary))`), `ToggleGroup` aus `src/components/ui/toggle-group.tsx`.

## Global Constraints

- Keine IndexedDB-Schema-Änderung, keine Änderung an `assignMaintenanceWindows`, `weeklySlots` oder `calendarRules`.
- Aggregation nutzt echte Kalenderdaten (heute/aktuelle Woche/aktueller Monat); Monatsregeln werden über die bestehende `isDateAllowedByCalendarRules`-Funktion aus `src/lib/maintenanceWindows.ts` angewendet, nicht neu implementiert.
- Systeme mit `handling === "approval-required"` oder `"external"` fließen **nicht** in die Kurve/Heatmap ein (kein automatisches Zeitfenster); ihre Anzahl wird als Fußzeilenhinweis gezeigt, wenn > 0.
- Referenz-Spec: `docs/superpowers/specs/2026-07-18-wartungsfenster-auslastungschart-design.md` (freigegeben).
- Alle neuen Texte in deutscher Sprache, konsistent mit dem Rest der Seite.

---

## Task 1: Reine Logik `src/lib/maintenanceWindowCoverage.ts`

**Files:**
- Create: `src/lib/maintenanceWindowCoverage.ts`
- Test: `src/test/maintenanceWindowCoverage.test.ts`

**Interfaces:**
- Consumes: `isDateAllowedByCalendarRules(date: Date, rules: readonly {weekday: MaintenanceWeekday; occurrences: readonly MonthlyOccurrence[]}[]): boolean`, `createEmptyWeeklySlots(): WeeklySlots`, `KnownMaintenanceWindowAssignment` aus `@/lib/maintenanceWindows` (bereits vorhanden, unverändert).
- Produces: `CoverageView`, `CoverageRange`, `CoverageSlot`, `getCoverageRange`, `buildMaintenanceCoverage`, `findCurrentCoverageIndex`, `excludedSystemsCount`, `formatSlotTime`, `mondayBasedWeekday` — von Task 2 und Task 3 konsumiert.

- [ ] **Step 1: Write the failing test file**

Create `src/test/maintenanceWindowCoverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import { createEmptyWeeklySlots } from "@/lib/maintenanceWindows";
import {
  buildMaintenanceCoverage,
  excludedSystemsCount,
  findCurrentCoverageIndex,
  formatSlotTime,
  getCoverageRange,
  mondayBasedWeekday,
} from "@/lib/maintenanceWindowCoverage";

const makeDefinition = (
  abbreviation: string,
  overrides: Partial<MaintenanceWindowDefinition> = {},
): MaintenanceWindowDefinition => ({
  id: abbreviation.toLocaleLowerCase("de-DE"),
  abbreviation,
  normalizedAbbreviation: abbreviation.toLocaleLowerCase("de-DE"),
  description: `${abbreviation} Beschreibung`,
  handling: "regular",
  weeklySlots: createEmptyWeeklySlots(),
  calendarRules: [],
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  ...overrides,
});

const makeSystem = (vmName: string): TechInfoLatest => ({
  vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
  vmName,
  importedAt: "2026-07-17T08:00:00.000Z",
  techInfoImportId: "import-1",
  rowIndex: 1,
  serverType: null,
  maintenanceWindow: null,
  operatingSystem: null,
  comment: null,
  sysv: null,
  sysvDepartment: null,
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  bz: null,
  clusterFromTechInfo: null,
  cvBackup: null,
  az: null,
});

function makeGroup(definition: MaintenanceWindowDefinition, systemCount: number): KnownMaintenanceWindowAssignment {
  return {
    definition,
    systems: Array.from({ length: systemCount }, (_, i) => makeSystem(`vm-${definition.abbreviation}-${i}`)),
  };
}

describe("mondayBasedWeekday", () => {
  it("ordnet Montag den Index 0 und Sonntag den Index 6 zu", () => {
    expect(mondayBasedWeekday(new Date(2026, 6, 20))).toBe(0); // Montag, 20. Juli 2026
    expect(mondayBasedWeekday(new Date(2026, 6, 26))).toBe(6); // Sonntag, 26. Juli 2026
  });
});

describe("formatSlotTime", () => {
  it("formatiert Slot 0 als 00:00–00:30", () => {
    expect(formatSlotTime(0)).toBe("00:00–00:30");
  });

  it("formatiert den letzten Slot als 23:30–00:00", () => {
    expect(formatSlotTime(47)).toBe("23:30–00:00");
  });
});

describe("getCoverageRange", () => {
  it("liefert für 'day' den Starttag um Mitternacht und einen Tag", () => {
    const reference = new Date(2026, 6, 22, 14, 30); // Mittwoch, 22. Juli 2026, 14:30
    const range = getCoverageRange("day", reference);
    expect(range.start).toEqual(new Date(2026, 6, 22));
    expect(range.days).toBe(1);
  });

  it("liefert für 'week' den Montag der aktuellen Woche, auch wenn der Referenztag ein Sonntag ist", () => {
    const sunday = new Date(2026, 6, 26, 9, 0); // Sonntag, 26. Juli 2026
    const range = getCoverageRange("week", sunday);
    expect(range.start).toEqual(new Date(2026, 6, 20)); // Montag, 20. Juli 2026
    expect(range.days).toBe(7);
  });

  it("liefert für 'month' den 1. Tag des Monats und die korrekte Anzahl Tage", () => {
    const reference = new Date(2026, 1, 15); // Februar 2026 (kein Schaltjahr)
    const range = getCoverageRange("month", reference);
    expect(range.start).toEqual(new Date(2026, 1, 1));
    expect(range.days).toBe(28);
  });
});

describe("buildMaintenanceCoverage", () => {
  it("zählt eine 'always'-Gruppe in jedem Slot des Bereichs", () => {
    const definition = makeDefinition("ALWAYS", { handling: "always" });
    const group = makeGroup(definition, 3);
    const range = getCoverageRange("day", new Date(2026, 6, 22));

    const slots = buildMaintenanceCoverage([group], range);

    expect(slots).toHaveLength(48);
    expect(slots.every((entry) => entry.count === 3)).toBe(true);
  });

  it("folgt bei 'regular' ohne Kalenderregeln durchgehend der Wochenmaske", () => {
    const weeklySlots = createEmptyWeeklySlots();
    weeklySlots[2][20] = true; // Mittwoch, Slot 20 (10:00–10:30)
    const definition = makeDefinition("REG", { weeklySlots });
    const group = makeGroup(definition, 2);
    const range = getCoverageRange("day", new Date(2026, 6, 22)); // Mittwoch

    const slots = buildMaintenanceCoverage([group], range);

    expect(slots[20].count).toBe(2);
    expect(slots[19].count).toBe(0);
  });

  it("wendet bei 'regular' mit Kalenderregel nur passende Vorkommen des Wochentags im Monat an", () => {
    const weeklySlots = createEmptyWeeklySlots();
    weeklySlots[6][10] = true; // Sonntag, Slot 10
    const definition = makeDefinition("SUNDAY-1", {
      weeklySlots,
      calendarRules: [{ weekday: 6, occurrences: [1] }], // nur 1. Sonntag im Monat
    });
    const group = makeGroup(definition, 5);
    const range = getCoverageRange("month", new Date(2026, 6, 15)); // Juli 2026

    const slots = buildMaintenanceCoverage([group], range);
    const sundaysWithCoverage = slots.filter((entry) => entry.count > 0);

    expect(sundaysWithCoverage).toHaveLength(1);
    expect(sundaysWithCoverage[0].date.getDate()).toBe(5); // 1. Sonntag im Juli 2026 ist der 5.
  });

  it("schließt 'approval-required' und 'external' aus der Zählung aus", () => {
    const approval = makeDefinition("APPROVAL", { handling: "approval-required" });
    const external = makeDefinition("EXTERNAL", { handling: "external" });
    const groups = [makeGroup(approval, 4), makeGroup(external, 6)];
    const range = getCoverageRange("day", new Date(2026, 6, 22));

    const slots = buildMaintenanceCoverage(groups, range);

    expect(slots.every((entry) => entry.count === 0)).toBe(true);
  });

  it("summiert mehrere Gruppen, die zur selben Zeit ein offenes Fenster haben", () => {
    const alwaysA = makeGroup(makeDefinition("A", { handling: "always" }), 2);
    const alwaysB = makeGroup(makeDefinition("B", { handling: "always" }), 5);
    const range = getCoverageRange("day", new Date(2026, 6, 22));

    const slots = buildMaintenanceCoverage([alwaysA, alwaysB], range);

    expect(slots[0].count).toBe(7);
  });
});

describe("findCurrentCoverageIndex", () => {
  it("findet den Index des Slots, der den übergebenen Zeitpunkt enthält", () => {
    const range = getCoverageRange("day", new Date(2026, 6, 22));
    const slots = buildMaintenanceCoverage([], range);

    const index = findCurrentCoverageIndex(slots, new Date(2026, 6, 22, 10, 15));

    expect(index).toBe(20); // 10:00–10:30 ist Slot 20
  });

  it("liefert null, wenn der Zeitpunkt außerhalb des Bereichs liegt", () => {
    const range = getCoverageRange("day", new Date(2026, 6, 22));
    const slots = buildMaintenanceCoverage([], range);

    const index = findCurrentCoverageIndex(slots, new Date(2026, 6, 23, 10, 15));

    expect(index).toBeNull();
  });
});

describe("excludedSystemsCount", () => {
  it("summiert nur Systeme aus 'approval-required'- und 'external'-Gruppen", () => {
    const groups = [
      makeGroup(makeDefinition("REG", { handling: "regular" }), 10),
      makeGroup(makeDefinition("APPROVAL", { handling: "approval-required" }), 3),
      makeGroup(makeDefinition("EXTERNAL", { handling: "external" }), 4),
    ];

    expect(excludedSystemsCount(groups)).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/maintenanceWindowCoverage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/maintenanceWindowCoverage'` (Datei existiert noch nicht).

- [ ] **Step 3: Implement `src/lib/maintenanceWindowCoverage.ts`**

```ts
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import { isDateAllowedByCalendarRules } from "@/lib/maintenanceWindows";

export type CoverageView = "day" | "week" | "month";

export interface CoverageRange {
  start: Date; // lokale Mitternacht
  days: number;
}

export interface CoverageSlot {
  date: Date; // lokale Mitternacht des Tages dieses Slots
  slot: number; // 0..47
  count: number;
}

const SLOTS_PER_DAY = 48;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Montag = 0 ... Sonntag = 6, konsistent mit isDateAllowedByCalendarRules. */
export function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function formatSlotTime(slot: number): string {
  const startMinutes = slot * 30;
  const endMinutes = startMinutes + 30;
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(startMinutes)}–${format(endMinutes)}`;
}

export function getCoverageRange(view: CoverageView, referenceDate: Date): CoverageRange {
  const today = startOfDay(referenceDate);

  if (view === "day") return { start: today, days: 1 };

  if (view === "week") {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - mondayBasedWeekday(today));
    return { start: monday, days: 7 };
  }

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return { start: firstOfMonth, days: daysInMonth };
}

export function buildMaintenanceCoverage(
  known: readonly KnownMaintenanceWindowAssignment[],
  range: CoverageRange,
): CoverageSlot[] {
  const eligible = known.filter(
    (group) =>
      (group.definition.handling === "regular" || group.definition.handling === "always")
      && group.systems.length > 0,
  );

  const slots: CoverageSlot[] = [];
  for (let dayOffset = 0; dayOffset < range.days; dayOffset += 1) {
    const date = new Date(range.start);
    date.setDate(date.getDate() + dayOffset);
    const weekday = mondayBasedWeekday(date);

    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      let count = 0;
      for (const group of eligible) {
        if (group.definition.handling === "always") {
          count += group.systems.length;
          continue;
        }
        if (!isDateAllowedByCalendarRules(date, group.definition.calendarRules)) continue;
        if (group.definition.weeklySlots[weekday][slot]) count += group.systems.length;
      }
      slots.push({ date, slot, count });
    }
  }
  return slots;
}

export function findCurrentCoverageIndex(slots: readonly CoverageSlot[], now: Date): number | null {
  const day = startOfDay(now).getTime();
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30);
  const index = slots.findIndex((entry) => entry.date.getTime() === day && entry.slot === slot);
  return index === -1 ? null : index;
}

export function excludedSystemsCount(known: readonly KnownMaintenanceWindowAssignment[]): number {
  return known
    .filter((group) => group.definition.handling === "approval-required" || group.definition.handling === "external")
    .reduce((sum, group) => sum + group.systems.length, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/maintenanceWindowCoverage.test.ts`
Expected: PASS — alle Tests grün.

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: keine neuen Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/lib/maintenanceWindowCoverage.ts src/test/maintenanceWindowCoverage.test.ts
git commit -m "feat: add maintenance window coverage aggregation logic"
```

---

## Task 2: Heatmap-Komponente `MaintenanceCoverageHeatmap` + CSS

**Files:**
- Create: `src/components/maintenance-windows/MaintenanceCoverageHeatmap.tsx`
- Test: `src/components/maintenance-windows/MaintenanceCoverageHeatmap.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `CoverageSlot`, `formatSlotTime`, `mondayBasedWeekday` aus `@/lib/maintenanceWindowCoverage` (Task 1); `DAY_LABELS` aus `@/lib/maintenanceWindows` (bereits vorhanden).
- Produces: `MaintenanceCoverageHeatmap` — von Task 3 (`MaintenanceCoverageChart`) konsumiert.

- [ ] **Step 1: CSS-Klassen für die Heatmap ergänzen**

In `src/index.css` direkt **vor** der schließenden `}` des `@layer components`-Blocks (unmittelbar nach dem bestehenden `.maintenance-grid__compact-cell.is-allowed { background: hsl(var(--primary)); }`-Regelblock, der aktuell auf Zeile 386 endet) einfügen:

```css
  /* Monats-Heatmap der Wartungsfenster-Auslastung: Tage x Halbstunden-Slots. */
  .maintenance-heatmap-shell {
    overflow: hidden;
    border: 1px solid hsl(var(--border));
    border-radius: 0.9rem;
    background: hsl(var(--card));
  }

  .maintenance-heatmap__scroll {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 26rem;
    overscroll-behavior: contain;
    scrollbar-color: hsl(var(--border)) transparent;
  }

  .maintenance-heatmap {
    display: inline-block;
    min-width: 58rem;
  }

  .maintenance-heatmap__time-row,
  .maintenance-heatmap__row {
    display: grid;
    grid-template-columns: 5.5rem repeat(48, 1rem);
  }

  .maintenance-heatmap__time-row {
    position: sticky;
    top: 0;
    z-index: 3;
    height: 1.4rem;
    background: hsl(var(--card));
    border-bottom: 1px solid hsl(var(--border));
  }

  .maintenance-heatmap__corner,
  .maintenance-heatmap__day-label {
    position: sticky;
    left: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    padding-inline: 0.6rem;
    background: hsl(var(--card));
    border-right: 1px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .maintenance-heatmap__time-label {
    display: flex;
    align-items: center;
    padding-left: 0.1rem;
    color: hsl(var(--muted-foreground));
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.58rem;
  }

  .maintenance-heatmap__cell {
    height: 1.15rem;
    border-top: 1px solid hsl(var(--border) / 0.5);
    border-right: 1px solid hsl(var(--border) / 0.3);
    background-color: hsl(var(--muted) / 0.4);
  }

  .maintenance-heatmap__cell.is-current {
    position: relative;
    z-index: 1;
    box-shadow: inset 0 0 0 2px hsl(var(--primary));
  }
```

- [ ] **Step 2: Write the failing test file**

Create `src/components/maintenance-windows/MaintenanceCoverageHeatmap.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CoverageSlot } from "@/lib/maintenanceWindowCoverage";
import { MaintenanceCoverageHeatmap } from "./MaintenanceCoverageHeatmap";

function makeSlots(days: number, countAt: Record<string, number> = {}): CoverageSlot[] {
  const slots: CoverageSlot[] = [];
  for (let day = 0; day < days; day += 1) {
    const date = new Date(2026, 6, 1 + day);
    for (let slot = 0; slot < 48; slot += 1) {
      slots.push({ date, slot, count: countAt[`${day}-${slot}`] ?? 0 });
    }
  }
  return slots;
}

describe("MaintenanceCoverageHeatmap", () => {
  it("rendert eine Zelle je Tag und Halbstunden-Slot", () => {
    const slots = makeSlots(3);
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={null} />);

    expect(container.querySelectorAll(".maintenance-heatmap__cell")).toHaveLength(3 * 48);
    expect(container.querySelectorAll(".maintenance-heatmap__row")).toHaveLength(3);
  });

  it("hebt die Zelle am currentIndex mit der Klasse 'is-current' hervor", () => {
    const slots = makeSlots(2);
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={48} />);

    const cells = container.querySelectorAll(".maintenance-heatmap__cell");
    expect(cells[48]).toHaveClass("is-current");
    expect(cells[0]).not.toHaveClass("is-current");
  });

  it("markiert Zellen über ein Datenattribut mit ihrer Systemanzahl", () => {
    const slots = makeSlots(1, { "0-5": 4 });
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={null} />);

    const cells = container.querySelectorAll(".maintenance-heatmap__cell");
    expect(cells[5]).toHaveAttribute("data-count", "4");
    expect(cells[0]).toHaveAttribute("data-count", "0");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/maintenance-windows/MaintenanceCoverageHeatmap.test.tsx`
Expected: FAIL — `Cannot find module './MaintenanceCoverageHeatmap'`.

- [ ] **Step 4: Implement `src/components/maintenance-windows/MaintenanceCoverageHeatmap.tsx`**

```tsx
import type { CoverageSlot } from "@/lib/maintenanceWindowCoverage";
import { formatSlotTime, mondayBasedWeekday } from "@/lib/maintenanceWindowCoverage";
import { DAY_LABELS } from "@/lib/maintenanceWindows";

const SLOTS_PER_DAY = 48;

export interface MaintenanceCoverageHeatmapProps {
  slots: readonly CoverageSlot[];
  currentIndex: number | null;
}

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function MaintenanceCoverageHeatmap({ slots, currentIndex }: MaintenanceCoverageHeatmapProps) {
  const dayCount = slots.length / SLOTS_PER_DAY;
  const maxCount = Math.max(1, ...slots.map((entry) => entry.count));

  return (
    <div className="maintenance-heatmap-shell">
      <div className="maintenance-heatmap__scroll">
        <div
          className="maintenance-heatmap"
          role="img"
          aria-label="Wartungsfenster-Auslastung im Monatsverlauf, Tage gegen Uhrzeit"
        >
          <div className="maintenance-heatmap__time-row" aria-hidden="true">
            <span className="maintenance-heatmap__corner" />
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <span key={slot} className="maintenance-heatmap__time-label">
                {slot % 4 === 0 ? formatSlotTime(slot).slice(0, 2) : ""}
              </span>
            ))}
          </div>
          {Array.from({ length: dayCount }, (_, dayIndex) => {
            const dayEntries = slots.slice(dayIndex * SLOTS_PER_DAY, (dayIndex + 1) * SLOTS_PER_DAY);
            const date = dayEntries[0].date;
            return (
              <div className="maintenance-heatmap__row" key={date.toISOString()} aria-hidden="true">
                <span className="maintenance-heatmap__day-label">
                  {String(date.getDate()).padStart(2, "0")} {DAY_LABELS[mondayBasedWeekday(date)].slice(0, 2)}
                </span>
                {dayEntries.map((entry) => {
                  const globalIndex = dayIndex * SLOTS_PER_DAY + entry.slot;
                  const intensity = entry.count > 0 ? Math.max(entry.count / maxCount, 0.12) : 0;
                  const label = `${date.toLocaleDateString("de-DE")} ${formatSlotTime(entry.slot)}, ${entry.count} Systeme`;
                  return (
                    <span
                      key={entry.slot}
                      className={classNames("maintenance-heatmap__cell", globalIndex === currentIndex && "is-current")}
                      style={{ backgroundColor: `hsl(var(--primary) / ${intensity})` }}
                      data-count={entry.count}
                      title={label}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/maintenance-windows/MaintenanceCoverageHeatmap.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/components/maintenance-windows/MaintenanceCoverageHeatmap.tsx src/components/maintenance-windows/MaintenanceCoverageHeatmap.test.tsx
git commit -m "feat: add maintenance coverage heatmap component"
```

---

## Task 3: Chart-Komponente `MaintenanceCoverageChart`

**Files:**
- Create: `src/components/maintenance-windows/MaintenanceCoverageChart.tsx`
- Test: `src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx`

**Interfaces:**
- Consumes: `getCoverageRange`, `buildMaintenanceCoverage`, `findCurrentCoverageIndex`, `excludedSystemsCount`, `formatSlotTime`, `mondayBasedWeekday`, Typen `CoverageSlot`, `CoverageView` aus `@/lib/maintenanceWindowCoverage` (Task 1); `MaintenanceCoverageHeatmap` aus `@/components/maintenance-windows/MaintenanceCoverageHeatmap` (Task 2); `DAY_LABELS`, `KnownMaintenanceWindowAssignment` aus `@/lib/maintenanceWindows`; `ToggleGroup`/`ToggleGroupItem` aus `@/components/ui/toggle-group`; `CHART_AXIS_STYLE`, `CHART_COLORS`, `CHART_GRID_STYLE`, `CHART_TOOLTIP_STYLE`, `CHART_TOOLTIP_ITEM_STYLE`, `CHART_TOOLTIP_LABEL_STYLE` aus `@/lib/chartStyles`; `Area`, `AreaChart`, `CartesianGrid`, `ReferenceLine`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` aus `@/components/charts/recharts`.
- Produces: `MaintenanceCoverageChart` — von Task 4 (`MaintenanceWindows.tsx`) konsumiert.

- [ ] **Step 1: Write the failing test file**

Create `src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import { createEmptyWeeklySlots } from "@/lib/maintenanceWindows";
import { MaintenanceCoverageChart } from "./MaintenanceCoverageChart";

const makeDefinition = (
  abbreviation: string,
  overrides: Partial<MaintenanceWindowDefinition> = {},
): MaintenanceWindowDefinition => ({
  id: abbreviation.toLocaleLowerCase("de-DE"),
  abbreviation,
  normalizedAbbreviation: abbreviation.toLocaleLowerCase("de-DE"),
  description: `${abbreviation} Beschreibung`,
  handling: "regular",
  weeklySlots: createEmptyWeeklySlots(),
  calendarRules: [],
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  ...overrides,
});

const makeSystem = (vmName: string): TechInfoLatest => ({
  vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
  vmName,
  importedAt: "2026-07-17T08:00:00.000Z",
  techInfoImportId: "import-1",
  rowIndex: 1,
  serverType: null,
  maintenanceWindow: null,
  operatingSystem: null,
  comment: null,
  sysv: null,
  sysvDepartment: null,
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  bz: null,
  clusterFromTechInfo: null,
  cvBackup: null,
  az: null,
});

function makeGroup(definition: MaintenanceWindowDefinition, systemCount: number): KnownMaintenanceWindowAssignment {
  return {
    definition,
    systems: Array.from({ length: systemCount }, (_, i) => makeSystem(`vm-${definition.abbreviation}-${i}`)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 22, 10, 0)); // Mittwoch, 22. Juli 2026, 10:00
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MaintenanceCoverageChart", () => {
  it("zeigt einen Leerzustand, wenn keine automatisch planbaren Systeme zugeordnet sind", () => {
    render(<MaintenanceCoverageChart known={[]} />);

    expect(screen.getByText(/Noch keine Systeme mit automatisch planbarem Wartungsfenster zugeordnet/)).toBeInTheDocument();
  });

  it("rendert die Umschalter Tag/Woche/Monat und wechselt zur Heatmap in der Monatsansicht", () => {
    const always = makeGroup(makeDefinition("ALWAYS", { handling: "always" }), 3);
    render(<MaintenanceCoverageChart known={[always]} />);

    expect(screen.getByRole("radio", { name: "Tagesansicht" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Wochenansicht" })).toBeInTheDocument();
    const monthToggle = screen.getByRole("radio", { name: "Monatsansicht" });

    fireEvent.click(monthToggle);

    expect(screen.getByRole("img", { name: /Wartungsfenster-Auslastung im Monatsverlauf/ })).toBeInTheDocument();
  });

  it("zeigt den Ausschluss-Hinweis nur, wenn Systeme mit 'approval-required'/'external' vorhanden sind", () => {
    const always = makeGroup(makeDefinition("ALWAYS", { handling: "always" }), 3);
    const approval = makeGroup(makeDefinition("APPROVAL", { handling: "approval-required" }), 2);

    const { rerender } = render(<MaintenanceCoverageChart known={[always]} />);
    expect(screen.queryByText(/nicht enthalten/)).not.toBeInTheDocument();

    rerender(<MaintenanceCoverageChart known={[always, approval]} />);
    expect(screen.getByText(/2 Systeme sind mit/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx`
Expected: FAIL — `Cannot find module './MaintenanceCoverageChart'`.

- [ ] **Step 3: Implement `src/components/maintenance-windows/MaintenanceCoverageChart.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charts/recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CHART_AXIS_STYLE,
  CHART_COLORS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chartStyles";
import { DAY_LABELS } from "@/lib/maintenanceWindows";
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import {
  buildMaintenanceCoverage,
  excludedSystemsCount,
  findCurrentCoverageIndex,
  formatSlotTime,
  getCoverageRange,
  mondayBasedWeekday,
} from "@/lib/maintenanceWindowCoverage";
import type { CoverageSlot, CoverageView } from "@/lib/maintenanceWindowCoverage";
import { MaintenanceCoverageHeatmap } from "@/components/maintenance-windows/MaintenanceCoverageHeatmap";

const SLOTS_PER_DAY = 48;

function formatAxisTick(index: number, slots: readonly CoverageSlot[], view: CoverageView): string {
  const entry = slots[index];
  if (!entry) return "";
  if (view === "day") return formatSlotTime(entry.slot).slice(0, 5);
  return DAY_LABELS[mondayBasedWeekday(entry.date)].slice(0, 2);
}

function formatTooltipLabel(index: number, slots: readonly CoverageSlot[], view: CoverageView): string {
  const entry = slots[index];
  if (!entry) return "";
  const time = formatSlotTime(entry.slot);
  if (view === "day") return time;
  return `${DAY_LABELS[mondayBasedWeekday(entry.date)]} ${time}`;
}

function getAxisTicks(slotCount: number, view: CoverageView): number[] {
  if (view === "day") return Array.from({ length: 6 }, (_, i) => i * 8);
  const days = slotCount / SLOTS_PER_DAY;
  return Array.from({ length: days }, (_, day) => day * SLOTS_PER_DAY);
}

export interface MaintenanceCoverageChartProps {
  known: KnownMaintenanceWindowAssignment[];
}

export function MaintenanceCoverageChart({ known }: MaintenanceCoverageChartProps) {
  const [view, setView] = useState<CoverageView>("week");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const range = useMemo(() => getCoverageRange(view, now), [view, now]);
  const slots = useMemo(() => buildMaintenanceCoverage(known, range), [known, range]);
  const currentIndex = useMemo(() => findCurrentCoverageIndex(slots, now), [slots, now]);
  const excludedCount = useMemo(() => excludedSystemsCount(known), [known]);
  const hasCoverage = useMemo(() => slots.some((entry) => entry.count > 0), [slots]);
  const chartData = useMemo(() => slots.map((entry, index) => ({ index, count: entry.count })), [slots]);
  const axisTicks = useMemo(() => getAxisTicks(slots.length, view), [slots.length, view]);

  return (
    <section className="space-y-3" aria-labelledby="maintenance-coverage-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="maintenance-coverage-title" className="text-base font-semibold">Auslastung nach Uhrzeit</h2>
          <p className="text-xs text-muted-foreground">Anzahl Systeme mit offenem Wartungsfenster je Zeitpunkt.</p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "day" || value === "week" || value === "month") setView(value);
          }}
          size="sm"
          variant="outline"
          className="justify-start"
        >
          <ToggleGroupItem value="day" aria-label="Tagesansicht">Tag</ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Wochenansicht">Woche</ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Monatsansicht">Monat</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!hasCoverage ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-card/30 p-4 text-sm text-muted-foreground">
          Noch keine Systeme mit automatisch planbarem Wartungsfenster zugeordnet.
        </p>
      ) : view === "month" ? (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <MaintenanceCoverageHeatmap slots={slots} currentIndex={currentIndex} />
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke={CHART_GRID_STYLE.stroke} strokeDasharray={CHART_GRID_STYLE.strokeDasharray} vertical={false} />
              <XAxis
                dataKey="index"
                type="number"
                domain={[0, chartData.length - 1]}
                ticks={axisTicks}
                tickFormatter={(index: number) => formatAxisTick(index, slots, view)}
                tick={CHART_AXIS_STYLE}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                labelFormatter={(index: number) => formatTooltipLabel(index, slots, view)}
                formatter={(value: number) => [`${value} Systeme`, "Im Wartungsfenster"]}
              />
              <Area
                type="stepAfter"
                dataKey="count"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {currentIndex !== null && (
                <ReferenceLine
                  x={currentIndex}
                  stroke={CHART_COLORS.primary}
                  strokeDasharray="4 4"
                  label={{ value: "Jetzt", position: "top", fill: CHART_COLORS.primary, fontSize: 11 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {excludedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {excludedCount} {excludedCount === 1 ? "System ist" : "Systeme sind"} mit „Freigabe erforderlich“ oder „Extern verwaltet“ nicht enthalten, da kein automatisches Zeitfenster besteht.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/components/maintenance-windows/MaintenanceCoverageChart.tsx src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx
git commit -m "feat: add MaintenanceCoverageChart with day/week/month toggle"
```

---

## Task 4: Einbindung in `src/pages/MaintenanceWindows.tsx`

**Files:**
- Modify: `src/pages/MaintenanceWindows.tsx`

**Interfaces:**
- Consumes: `MaintenanceCoverageChart` aus `@/components/maintenance-windows/MaintenanceCoverageChart` (Task 3).

- [ ] **Step 1: Import ergänzen**

In `src/pages/MaintenanceWindows.tsx`:

```ts
import { MaintenanceWindowImportDialog } from "@/components/maintenance-windows/MaintenanceWindowImportDialog";
```
wird zu:
```ts
import { MaintenanceCoverageChart } from "@/components/maintenance-windows/MaintenanceCoverageChart";
import { MaintenanceWindowImportDialog } from "@/components/maintenance-windows/MaintenanceWindowImportDialog";
```

- [ ] **Step 2: Chart unterhalb der KPI-Grid einfügen**

```tsx
        <KpiCard title="Systeme unbekannt" value={unknownSystems} subtitle={systemLabel(unknownSystems)} icon={<TriangleAlert className="h-4 w-4" />} severity={unknownSystems ? "warn" : "ok"} />
      </div>

      {(actionError || error) && <Alert variant="destructive"><AlertTitle>Aktion fehlgeschlagen</AlertTitle><AlertDescription>{actionError ?? error?.message}</AlertDescription></Alert>}
```
wird zu:
```tsx
        <KpiCard title="Systeme unbekannt" value={unknownSystems} subtitle={systemLabel(unknownSystems)} icon={<TriangleAlert className="h-4 w-4" />} severity={unknownSystems ? "warn" : "ok"} />
      </div>

      <MaintenanceCoverageChart known={assignments.known} />

      {(actionError || error) && <Alert variant="destructive"><AlertTitle>Aktion fehlgeschlagen</AlertTitle><AlertDescription>{actionError ?? error?.message}</AlertDescription></Alert>}
```

- [ ] **Step 3: Bestehenden Seiten-Test prüfen**

Run: `npx vitest run src/pages/MaintenanceWindows.test.tsx`
Expected: PASS (die bestehenden Tests rendern `MaintenanceWindows` überwiegend mit leeren Definitionen/Tech-Info; der neue Chart zeigt in diesem Fall nur den Leerzustandstext und stört bestehende Abfragen nicht, da diese nicht nach Chart-Inhalten suchen).

- [ ] **Step 4: Commit**

```bash
git add src/pages/MaintenanceWindows.tsx
git commit -m "feat: wire MaintenanceCoverageChart into MaintenanceWindows page"
```

---

## Task 5: Vollständige Verifikation

**Files:** keine (nur Ausführung)

- [ ] **Step 1: Komplette Test-Suite**

Run: `npm run test`
Expected: alle Tests grün (bestehende Anzahl + neue Tests aus Task 1–3).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine neuen Fehler.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: keine Fehler/Warnungen aus den neuen Dateien.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 5: Manueller Browser-Test**

Dev-Server starten (`npm run dev -- --port <frei>`), im Browser:
1. Auf `/wartungsfenster` mehrere Wartungsfenster mit unterschiedlichen Wochenmasken anlegen bzw. importieren und Tech-Info-Systeme mit passenden `maintenanceWindow`-Werten laden, sodass Systeme zugeordnet werden.
2. Prüfen, dass unterhalb der KPI-Kacheln der Chart erscheint, standardmäßig in der Wochenansicht, mit einer sichtbaren "Jetzt"-Markierung zur aktuellen Uhrzeit.
3. Auf "Tag" umschalten und prüfen, dass der heutige Tagesverlauf angezeigt wird.
4. Auf "Monat" umschalten und prüfen, dass die Heatmap den aktuellen Kalendermonat mit plausibler Farbintensität zeigt; beim Hovern über eine Zelle erscheint ein natives Tooltip mit Datum, Zeitspanne und Systemanzahl.
5. Ein Wartungsfenster mit Behandlungsart „Freigabe erforderlich“ oder „Extern verwaltet“ zuordnen und prüfen, dass der Fußzeilenhinweis mit korrekter Anzahl erscheint und diese Systeme nicht in den Chart-Werten auftauchen.
6. Hell-/Dunkelmodus umschalten und Chart sowie Heatmap auf Lesbarkeit prüfen.
7. Dev-Server wieder beenden.

- [ ] **Step 6: Abschluss-Commit (falls beim manuellen Test noch Anpassungen nötig waren)**

```bash
git add -A
git commit -m "fix: address findings from manual coverage chart verification"
```

(Nur ausführen, falls Schritt 5 tatsächlich Änderungen erforderte – sonst überspringen.)
