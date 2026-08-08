import { describe, expect, it } from "vitest";
import { calculateWorkloadTrend } from "@/domain/services/vmWorkloadTrendService";

function dailySeries(days: number, valueForDay: (day: number) => number) {
  return Array.from({ length: days }, (_, day) => Array.from({ length: 24 }, () => ({
    dayKey: `2026-07-${String(day + 1).padStart(2, "0")}`,
    value: valueForDay(day),
  }))).flat();
}

describe("calculateWorkloadTrend", () => {
  it("erkennt einen starken, nahezu linearen CPU-Anstieg", () => {
    const trend = calculateWorkloadTrend(dailySeries(31, (day) => 500 + day * 100), { capacity: 10_000 });
    expect(trend.direction).toBe("strongly-rising");
    expect(trend.rSquared).toBeCloseTo(1);
    expect(trend.capacityChangePct).toBeCloseTo(30);
  });

  it("bleibt bei flacher Last stabil", () => {
    const trend = calculateWorkloadTrend(dailySeries(31, () => 30), { capacity: 100 });
    expect(trend.direction).toBe("stable");
  });

  it("trifft ohne mindestens 14 vollständig belegte Tage keine Aussage", () => {
    const trend = calculateWorkloadTrend(dailySeries(13, (day) => day), { capacity: 100 });
    expect(trend.direction).toBe("not-computable");
  });
});
