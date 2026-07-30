import { describe, expect, it } from "vitest";
import { formatDemandMHz, formatDemandPct, toCapacityPct } from "@/lib/formatDemand";

describe("toCapacityPct", () => {
  it("setzt den Demand in Bezug zur konfigurierten Kapazität", () => {
    expect(toCapacityPct(2_230, 12_660)).toBeCloseTo(17.6, 1);
    expect(toCapacityPct(12_660, 12_660)).toBe(100);
  });

  it("bleibt ohne belastbare Bezugsgröße unbestimmt", () => {
    expect(toCapacityPct(2_230, null)).toBeNull();
    expect(toCapacityPct(2_230, 0)).toBeNull();
    expect(toCapacityPct(null, 12_660)).toBeNull();
    expect(toCapacityPct(Number.NaN, 12_660)).toBeNull();
  });
});

describe("formatDemandPct", () => {
  it("formatiert im deutschen Format mit einer Dezimalstelle", () => {
    expect(formatDemandPct(23.456)).toBe("23,5 %");
    expect(formatDemandPct(100, 0)).toBe("100 %");
    expect(formatDemandPct(null)).toBe("—");
  });
});

describe("formatDemandMHz", () => {
  it("wechselt bei 1 GHz die Einheit", () => {
    expect(formatDemandMHz(630)).toBe("630 MHz");
    expect(formatDemandMHz(2_230)).toBe("2,23 GHz");
  });
});
