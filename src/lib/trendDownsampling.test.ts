import { describe, expect, it } from "vitest";
import {
  describeTrendRange,
  downsampleTrendPoints,
  type TrendSamplePoint,
} from "@/lib/trendDownsampling";

const HOUR_MS = 60 * 60 * 1000;

function makePoints(cpuValues: readonly (number | null)[], peaks?: readonly (number | null)[]): TrendSamplePoint[] {
  return cpuValues.map((cpu, index): TrendSamplePoint => ({
    timestampMs: index * HOUR_MS,
    cpu,
    cpuPeak: peaks?.[index] ?? null,
    secondary: null,
  }));
}

describe("downsampleTrendPoints", () => {
  it("lässt kurze Reihen unverändert und ergänzt nur die Bandgrenzen", () => {
    const result = downsampleTrendPoints(makePoints([100, 200, 300]), 336);
    expect(result).toHaveLength(3);
    expect(result.map((point) => point.cpu)).toEqual([100, 200, 300]);
    expect(result.every((point) => point.sampleCount === 1)).toBe(true);
  });

  it("verdichtet einen Monat auf eine zeichenbare Punktzahl", () => {
    const result = downsampleTrendPoints(makePoints(Array.from({ length: 744 }, () => 100)), 336);
    expect(result.length).toBeLessThanOrEqual(336);
    expect(result.length).toBeGreaterThan(200);
  });

  it("erhält Spitzen, statt sie wegzumitteln", () => {
    // Genau das ist der Zweck: Der Mittelwert des Fensters liegt bei 325,
    // der Ausschlag auf 1000 muss als Bandobergrenze sichtbar bleiben.
    const result = downsampleTrendPoints(makePoints([100, 100, 100, 1000]), 1);
    expect(result).toHaveLength(1);
    expect(result[0].cpu).toBe(325);
    expect(result[0].cpuHigh).toBe(1000);
    expect(result[0].cpuLow).toBe(100);
  });

  it("zieht das Stundenmaximum in die Bandobergrenze ein", () => {
    // Ohne Demand Max wäre die Obergrenze 200; mit ihm liegt sie bei 900.
    const result = downsampleTrendPoints(makePoints([100, 200], [400, 900]), 1);
    expect(result[0].cpuHigh).toBe(900);
    expect(result[0].cpuPeak).toBe(900);
  });

  it("verdichtet die Sekundärreihe über das Maximum", () => {
    const points: TrendSamplePoint[] = [
      { timestampMs: 0, cpu: 1, cpuPeak: null, secondary: 0.2 },
      { timestampMs: HOUR_MS, cpu: 1, cpuPeak: null, secondary: 8.5 },
    ];
    // CPU Ready ist bereits ein Stundenmaximum; ein Mittelwert würde den
    // Ausreißer verstecken, der die Aussage trägt.
    expect(downsampleTrendPoints(points, 1)[0].secondary).toBe(8.5);
  });

  it("überspringt Messlücken bei der Verdichtung", () => {
    const result = downsampleTrendPoints(makePoints([100, null, 300, null]), 1);
    expect(result[0].cpu).toBe(200);
    expect(result[0].cpuLow).toBe(100);
    expect(result[0].cpuHigh).toBe(300);
  });

  it("liefert für ein durchgehend leeres Fenster null statt 0", () => {
    const result = downsampleTrendPoints(makePoints([null, null, null, null]), 1);
    expect(result[0].cpu).toBeNull();
    expect(result[0].cpuLow).toBeNull();
    expect(result[0].cpuHigh).toBeNull();
  });

  it("behält den Zeitstempel des Fensterbeginns", () => {
    const result = downsampleTrendPoints(makePoints([1, 2, 3, 4]), 2);
    expect(result.map((point) => point.timestampMs)).toEqual([0, 2 * HOUR_MS]);
  });

  it("liefert für eine leere Reihe eine leere Liste", () => {
    expect(downsampleTrendPoints([], 336)).toEqual([]);
  });
});

describe("describeTrendRange", () => {
  it("benennt den Zeitraum in Tagen", () => {
    expect(describeTrendRange(168)).toBe("7 Tage");
    expect(describeTrendRange(744)).toBe("31 Tage");
    expect(describeTrendRange(672)).toBe("28 Tage");
    expect(describeTrendRange(24)).toBe("1 Tag");
  });

  it("meldet einen unbekannten Zeitraum bei leerer Reihe", () => {
    expect(describeTrendRange(0)).toBe("unbekannter Zeitraum");
  });
});
