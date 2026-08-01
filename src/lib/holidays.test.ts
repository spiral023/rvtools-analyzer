import { describe, expect, it } from "vitest";
import { austrianHolidays, austrianHolidaysInRange, easterSunday } from "@/lib/holidays";

describe("easterSunday", () => {
  // Referenzdaten aus dem gregorianischen Osterkalender.
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2038, 4, 25],
  ])("berechnet Ostersonntag %i", (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day });
  });
});

describe("austrianHolidays", () => {
  it("enthält die beweglichen Feiertage relativ zu Ostern", () => {
    const byName = new Map(austrianHolidays(2026).map((holiday) => [holiday.name, holiday.date]));
    // Ostersonntag 2026 ist der 5. April.
    expect(byName.get("Ostermontag")).toBe("2026-04-06");
    expect(byName.get("Christi Himmelfahrt")).toBe("2026-05-14");
    expect(byName.get("Pfingstmontag")).toBe("2026-05-25");
    expect(byName.get("Fronleichnam")).toBe("2026-06-04");
  });

  it("führt Heiligen Abend und Silvester als lastarm statt als gesetzlichen Feiertag", () => {
    const holidays = austrianHolidays(2026);
    expect(holidays.find((holiday) => holiday.date === "2026-12-24")?.kind).toBe("reduced");
    expect(holidays.find((holiday) => holiday.date === "2026-12-31")?.kind).toBe("reduced");
    expect(holidays.find((holiday) => holiday.date === "2026-10-26")?.kind).toBe("public");
  });

  it("enthält Karfreitag nicht, da seit 2019 kein allgemeiner Feiertag", () => {
    // Karfreitag 2026 wäre der 3. April.
    expect(austrianHolidays(2026).some((holiday) => holiday.date === "2026-04-03")).toBe(false);
  });

  it("liefert die Feiertage aufsteigend sortiert", () => {
    const dates = austrianHolidays(2026).map((holiday) => holiday.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("austrianHolidaysInRange", () => {
  it("grenzt auf den geschlossenen Bereich ein", () => {
    const holidays = austrianHolidaysInRange("2026-08-01", "2026-08-31");
    expect(holidays.map((holiday) => holiday.date)).toEqual(["2026-08-15"]);
  });

  it("deckt einen Jahreswechsel innerhalb des Bereichs ab", () => {
    const dates = austrianHolidaysInRange("2026-12-20", "2027-01-07").map((holiday) => holiday.date);
    expect(dates).toEqual(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31", "2027-01-01", "2027-01-06"]);
  });

  it("liefert für einen feiertagsfreien Bereich eine leere Liste", () => {
    expect(austrianHolidaysInRange("2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("liefert für einen ungültigen Bereich eine leere Liste", () => {
    expect(austrianHolidaysInRange("2026-09-01", "2025-09-30")).toEqual([]);
  });
});
