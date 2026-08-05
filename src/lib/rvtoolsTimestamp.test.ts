import { describe, expect, it } from "vitest";
import { parseRvtoolsTimestamp, rvtoolsTimestampAgeInDays } from "@/lib/rvtoolsTimestamp";

describe("parseRvtoolsTimestamp", () => {
  it("liest punktgetrennte Datumsangaben tag-zuerst statt monat-zuerst", () => {
    const parsed = parseRvtoolsTimestamp("04.08.2026 20:37:23")!;

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7); // August, nicht April
    expect(parsed.getDate()).toBe(4);
    expect(parsed.getHours()).toBe(20);
    expect(parsed.getMinutes()).toBe(37);
    expect(parsed.getSeconds()).toBe(23);
  });

  it("akzeptiert einstellige Tage und Monate sowie Datum ohne Uhrzeit", () => {
    const withoutTime = parseRvtoolsTimestamp("4.8.2026")!;

    expect(withoutTime.getMonth()).toBe(7);
    expect(withoutTime.getDate()).toBe(4);
    expect(withoutTime.getHours()).toBe(0);
  });

  it("liest ISO-Zeitstempel auch mit Leerzeichen statt T", () => {
    const spaced = parseRvtoolsTimestamp("2026-08-04 20:37:23")!;
    const isoT = parseRvtoolsTimestamp("2026-08-04T20:37:23")!;

    expect(spaced.getTime()).toBe(isoT.getTime());
    expect(spaced.getDate()).toBe(4);
  });

  it("weist leere Werte und unmögliche Datumsangaben zurück", () => {
    expect(parseRvtoolsTimestamp("")).toBeNull();
    expect(parseRvtoolsTimestamp("   ")).toBeNull();
    expect(parseRvtoolsTimestamp("kein Datum")).toBeNull();
    // Würde ohne Prüfung stillschweigend zum 3. März werden.
    expect(parseRvtoolsTimestamp("31.02.2026")).toBeNull();
  });
});

describe("rvtoolsTimestampAgeInDays", () => {
  const now = new Date(2026, 7, 6, 12, 0, 0).getTime();

  it("zählt ein Backup von vorgestern als zwei Tage alt, nicht als Monate", () => {
    expect(rvtoolsTimestampAgeInDays("04.08.2026 20:37:23", now)).toBe(1);
    expect(rvtoolsTimestampAgeInDays("05.08.2026 20:37:23", now)).toBe(0);
  });

  it("behandelt Zeitstempel in der Zukunft als null Tage alt", () => {
    expect(rvtoolsTimestampAgeInDays("07.08.2026 08:00:00", now)).toBe(0);
  });

  it("liefert null, wenn kein Zeitstempel vorliegt", () => {
    expect(rvtoolsTimestampAgeInDays("", now)).toBeNull();
    expect(rvtoolsTimestampAgeInDays("k. A.", now)).toBeNull();
  });
});
