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
