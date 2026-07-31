import { describe, expect, it } from "vitest";
import { findWeekTimeMarkerTimestamp } from "@/lib/weekTimeMarker";

const HOUR_MS = 60 * 60 * 1_000;

/** Stündliche Zeitstempel, die `hours` Stunden vor `end` beginnen. */
function hourlySeries(end: Date, hours: number): number[] {
  return Array.from({ length: hours }, (_, index) => end.getTime() - (hours - 1 - index) * HOUR_MS);
}

describe("findWeekTimeMarkerTimestamp", () => {
  it("markiert im Vergangenheitsfenster die Stunde mit gleichem Wochentag und gleicher Stunde", () => {
    // Mittwoch, 15.07.2026, 14:00 – das Fenster endet fünf Tage vor „jetzt“.
    const now = new Date(2026, 6, 15, 14, 37);
    const series = hourlySeries(new Date(2026, 6, 10, 23, 0), 7 * 24);

    const marker = findWeekTimeMarkerTimestamp(series, now);

    expect(marker).not.toBeNull();
    const markerDate = new Date(marker!);
    expect(markerDate.getDay()).toBe(now.getDay());
    expect(markerDate.getHours()).toBe(14);
    // Mittwoch, 08.07.2026 – der einzige Mittwoch im Fenster.
    expect(markerDate.getDate()).toBe(8);
  });

  it("wählt bei mehreren passenden Stunden die jüngste", () => {
    const now = new Date(2026, 6, 15, 9, 5);
    const series = hourlySeries(new Date(2026, 6, 14, 23, 0), 21 * 24);

    const marker = new Date(findWeekTimeMarkerTimestamp(series, now)!);

    expect(marker.getDay()).toBe(now.getDay());
    expect(marker.getHours()).toBe(9);
    // Von den drei Mittwochen im Fenster gewinnt der jüngste.
    expect(marker.getDate()).toBe(8);
  });

  it("gibt null zurück, wenn keine Stunde passt", () => {
    const now = new Date(2026, 6, 15, 14, 0);
    // Nur drei Stunden am Freitag – der Mittwoch 14:00 kommt darin nicht vor.
    const series = hourlySeries(new Date(2026, 6, 10, 5, 0), 3);

    expect(findWeekTimeMarkerTimestamp(series, now)).toBeNull();
  });

  it("gibt null für eine leere Reihe zurück", () => {
    expect(findWeekTimeMarkerTimestamp([], new Date(2026, 6, 15, 14, 0))).toBeNull();
  });
});
