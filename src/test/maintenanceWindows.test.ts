import { describe, expect, it } from "vitest";

import type {
  MaintenanceCalendarRule,
  MaintenanceWeekday,
  MaintenanceWindowDefinition,
  TechInfoLatest,
} from "@/domain/models/types";
import {
  applyTimeRange,
  assignMaintenanceWindows,
  createEmptyWeeklySlots,
  externalMaskToSlots,
  isDateAllowedByCalendarRules,
  slotsToExternalMask,
  summarizeWeeklySlots,
  timeToSlot,
} from "@/lib/maintenanceWindows";

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

const makeTechInfo = (
  vmName: string,
  maintenanceWindow: string | null,
): TechInfoLatest => ({
  vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
  vmName,
  importedAt: "2026-07-17T08:00:00.000Z",
  techInfoImportId: "import-1",
  rowIndex: 1,
  serverType: null,
  maintenanceWindow,
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

describe("maintenance window masks", () => {
  it("converts an external inverted mask losslessly", () => {
    const mask = `001111${"01".repeat(21)}`;

    const slots = externalMaskToSlots(mask);

    expect(slots.slice(0, 6)).toEqual([true, true, false, false, false, false]);
    expect(slotsToExternalMask(slots)).toBe(mask);
  });

  it("rejects masks with invalid length or characters", () => {
    expect(() => externalMaskToSlots("0".repeat(47))).toThrow(/48 Zeichen/);
    expect(() => externalMaskToSlots(`${"0".repeat(47)}x`)).toThrow(/0 und 1/);
    expect(() => slotsToExternalMask(Array(47).fill(true))).toThrow(/48 Einträge/);
  });
});

describe("time ranges", () => {
  it("accepts half-hour values and 24:00 only as an end boundary", () => {
    expect(timeToSlot("00:00")).toBe(0);
    expect(timeToSlot("23:30")).toBe(47);
    expect(timeToSlot("24:00", true)).toBe(48);
    expect(() => timeToSlot("24:00")).toThrow(/Endgrenze/);
    expect(() => timeToSlot("08:15")).toThrow(/halben Stunden/);
    expect(() => timeToSlot("25:00", true)).toThrow(/Ungültige Uhrzeit/);
  });

  it("applies Friday, Saturday and Sunday ranges across midnight with Sunday wrapping to Monday", () => {
    const result = applyTimeRange(createEmptyWeeklySlots(), [4, 5, 6], "22:00", "02:00", true);

    expect(result[4].slice(44)).toEqual(Array(4).fill(true));
    expect(result[5].slice(0, 4)).toEqual(Array(4).fill(true));
    expect(result[5].slice(44)).toEqual(Array(4).fill(true));
    expect(result[6].slice(0, 4)).toEqual(Array(4).fill(true));
    expect(result[6].slice(44)).toEqual(Array(4).fill(true));
    expect(result[0].slice(0, 4)).toEqual(Array(4).fill(true));
    expect(result[4].slice(0, 44)).toEqual(Array(44).fill(false));
  });

  it("treats equal start and end times as a full 24-hour range and clones input arrays", () => {
    const original = createEmptyWeeklySlots();

    const result = applyTimeRange(original, [1], "08:00", "08:00", true);

    expect(result[1]).toEqual(Array(48).fill(true));
    expect(original[1]).toEqual(Array(48).fill(false));
    result[0][0] = true;
    expect(original[0][0]).toBe(false);
  });

  it.each([
    ["weniger als sieben Tage", createEmptyWeeklySlots().slice(0, 6)],
    ["weniger als 48 Einträge", [Array(47).fill(false), ...createEmptyWeeklySlots().slice(1)]],
    ["nicht-boolesche Einträge", [["false", ...Array(47).fill(false)], ...createEmptyWeeklySlots().slice(1)]],
    ["leere Array-Plätze", [Array(48), ...createEmptyWeeklySlots().slice(1)]],
  ])("rejects malformed weekly slots with %s", (_label, malformedSlots) => {
    expect(() => applyTimeRange(
      malformedSlots as MaintenanceWindowDefinition["weeklySlots"],
      [0],
      "08:00",
      "09:00",
      true,
    )).toThrow(/Wochenplan/);
  });

  it("rejects selected weekdays outside the Monday-to-Sunday index", () => {
    expect(() => applyTimeRange(
      createEmptyWeeklySlots(),
      [7 as MaintenanceWeekday],
      "08:00",
      "09:00",
      true,
    )).toThrow(/Wochentag/);
  });
});

describe("weekly summaries", () => {
  it("uses readable special summaries for entirely allowed and blocked weeks", () => {
    const blocked = createEmptyWeeklySlots();
    const allowed = blocked.map(() => Array(48).fill(true)) as MaintenanceWindowDefinition["weeklySlots"];

    expect(summarizeWeeklySlots(blocked)).toBe("Durchgehend gesperrt");
    expect(summarizeWeeklySlots(allowed)).toBe("Durchgehend erlaubt");
  });

  it("groups adjacent weekdays with equal ranges", () => {
    let slots = createEmptyWeeklySlots();
    slots = applyTimeRange(slots, [0, 1, 2, 3, 4], "08:00", "17:00", true);

    expect(summarizeWeeklySlots(slots)).toBe(
      "Montag–Freitag: 08:00–17:00; Samstag–Sonntag: gesperrt",
    );
  });

  it("rejects malformed weekly slots instead of interpreting an empty day as all-day", () => {
    const malformed = [
      [],
      ...createEmptyWeeklySlots().slice(1),
    ] as MaintenanceWindowDefinition["weeklySlots"];

    expect(() => summarizeWeeklySlots(malformed)).toThrow(/Wochenplan/);
  });
});

describe("monthly calendar rules", () => {
  it("allows an empty rule set and unions numbered and last weekday occurrences", () => {
    const rules = [
      { weekday: 0 as const, occurrences: [1, 3] as const },
      { weekday: 4 as const, occurrences: ["last"] as const },
    ];

    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 1), [])).toBe(true);
    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 6), rules)).toBe(true);
    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 20), rules)).toBe(true);
    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 31), rules)).toBe(true);
    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 13), rules)).toBe(false);
    expect(isDateAllowedByCalendarRules(new Date(2026, 6, 24), rules)).toBe(false);
  });

  it("returns false for an invalid date even when no calendar rules exist", () => {
    expect(isDateAllowedByCalendarRules(new Date("invalid"), [])).toBe(false);
  });

  it.each([
    [[{ weekday: 0, occurrences: [1] }, { weekday: 7, occurrences: [1] }]],
    [[{ weekday: 0, occurrences: [1, 0] }]],
    [[{ weekday: 0, occurrences: [1, "first"] }]],
    [[{ weekday: 0, occurrences: Object.assign(Array(2), { 0: 1 }) }]],
  ])("does not grant access when persisted calendar rules are malformed", (malformedRules) => {
    expect(isDateAllowedByCalendarRules(
      new Date(2026, 6, 6),
      malformedRules as unknown as MaintenanceCalendarRule[],
    )).toBe(false);
  });

  it("detects the last occurrence across a year boundary", () => {
    const lastThursday = [{ weekday: 3 as const, occurrences: ["last"] as const }];

    expect(isDateAllowedByCalendarRules(new Date(2026, 11, 24), lastThursday)).toBe(false);
    expect(isDateAllowedByCalendarRules(new Date(2026, 11, 31), lastThursday)).toBe(true);
  });

  it("detects the last weekday in February of a leap year", () => {
    const lastThursday = [{ weekday: 3 as const, occurrences: ["last"] as const }];

    expect(isDateAllowedByCalendarRules(new Date(2024, 1, 22), lastThursday)).toBe(false);
    expect(isDateAllowedByCalendarRules(new Date(2024, 1, 29), lastThursday)).toBe(true);
  });

  it("allows a fifth occurrence that is also the last occurrence", () => {
    const fifthMonday = [{ weekday: 0 as const, occurrences: [5] as const }];
    const lastMonday = [{ weekday: 0 as const, occurrences: ["last"] as const }];
    const date = new Date(2025, 2, 31);

    expect(isDateAllowedByCalendarRules(date, fifthMonday)).toBe(true);
    expect(isDateAllowedByCalendarRules(date, lastMonday)).toBe(true);
  });
});

describe("TechInfo assignment", () => {
  it("includes every known definition, groups unknown values, sorts systems and ignores blank values", () => {
    const definitions = [makeDefinition("CLDAY"), makeDefinition("EMPTY")];
    const systems = [
      makeTechInfo("srv10", " clday "),
      makeTechInfo("srv2", "NEU"),
      makeTechInfo("srv1", " neu "),
      makeTechInfo("ignored-null", null),
      makeTechInfo("ignored-blank", "   "),
    ];

    const result = assignMaintenanceWindows(definitions, systems);

    expect(result.known).toHaveLength(2);
    expect(result.known[0].definition.abbreviation).toBe("CLDAY");
    expect(result.known[0].systems.map((system) => system.vmName)).toEqual(["srv10"]);
    expect(result.known[1].definition.abbreviation).toBe("EMPTY");
    expect(result.known[1].systems).toEqual([]);
    expect(result.unknown).toHaveLength(1);
    expect(result.unknown[0].abbreviation).toBe("NEU");
    expect(result.unknown[0].normalizedAbbreviation).toBe("neu");
    expect(result.unknown[0].systems.map((system) => system.vmName)).toEqual(["srv1", "srv2"]);
  });
});
