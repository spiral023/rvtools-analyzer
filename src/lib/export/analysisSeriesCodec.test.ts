import { describe, expect, it } from "vitest";
import {
  COUNT_ENCODING,
  MHZ_ENCODING,
  PERCENT_ENCODING,
  decodeAnalysisSeries,
  encodeAnalysisSeries,
  quantize,
  roundToSignificantDigits,
} from "@/lib/export/analysisSeriesCodec";

describe("roundToSignificantDigits", () => {
  it("rundet auf die angegebene Stellenzahl", () => {
    expect(roundToSignificantDigits(19488.68, 4)).toBe(19490);
    expect(roundToSignificantDigits(234.567, 3)).toBe(235);
    expect(roundToSignificantDigits(0.001234, 3)).toBeCloseTo(0.00123, 8);
  });

  it("hält den relativen Fehler unabhängig von der Größenordnung klein", () => {
    // Der Grund für relative statt absoluter Rundung: eine VM mit 20 MHz Grundlast
    // darf nicht dieselbe absolute Rundung abbekommen wie eine mit 20.000 MHz.
    for (const magnitude of [20, 200, 2000, 20000]) {
      const exact = magnitude * 1.23456;
      const relativeError = Math.abs(roundToSignificantDigits(exact, 4) - exact) / exact;
      expect(relativeError).toBeLessThan(0.001);
    }
  });

  it("liefert 0 für 0 und nicht endliche Werte", () => {
    expect(roundToSignificantDigits(0, 3)).toBe(0);
    expect(roundToSignificantDigits(Number.NaN, 3)).toBe(0);
  });
});

describe("quantize", () => {
  it("skaliert Prozentwerte, damit kleine Ready-Werte unterscheidbar bleiben", () => {
    // Ohne Skalierung würden 0,234 % und 0,151 % beide zu 0 gerundet.
    expect(quantize(0.234, PERCENT_ENCODING)).toBe(234);
    expect(quantize(0.151, PERCENT_ENCODING)).toBe(151);
  });

  it("speichert Zählwerte exakt", () => {
    expect(quantize(12, COUNT_ENCODING)).toBe(12);
    expect(quantize(7, COUNT_ENCODING)).toBe(7);
  });
});

describe("encodeAnalysisSeries", () => {
  // Werte in Zehnteln, weil MHZ_ENCODING mit scale = 10 arbeitet.
  it("kodiert Differenzen statt Absolutwerten", () => {
    expect(encodeAnalysisSeries([1000, 1010, 1020], MHZ_ENCODING)).toBe("10000,100,100");
  });

  it("fasst Wiederholungen ab drei zusammen", () => {
    expect(encodeAnalysisSeries([100, 100, 100, 100], MHZ_ENCODING)).toBe("1000,0*3");
  });

  it("zählt kurze Läufe unter drei aus", () => {
    expect(encodeAnalysisSeries([100, 100], MHZ_ENCODING)).toBe("1000,0");
  });

  it("schreibt Messlücken als leeres Feld", () => {
    expect(encodeAnalysisSeries([100, null, 120], MHZ_ENCODING)).toBe("1000,,200");
  });

  it("unterbricht die Delta-Kette an Lücken nicht", () => {
    // Nach der Lücke ist 120 der Bezugspunkt, nicht 0 — sonst entstünde ein Sprung.
    const encoded = encodeAnalysisSeries([100, null, 120, 130], MHZ_ENCODING);
    expect(encoded).toBe("1000,,200,100");
  });

  it("liefert für eine leere Reihe einen leeren String", () => {
    expect(encodeAnalysisSeries([], MHZ_ENCODING)).toBe("");
  });

  it("kodiert eine durchgehend leere Reihe als einen Lauf", () => {
    expect(encodeAnalysisSeries([null, null, null, null], MHZ_ENCODING)).toBe("*4");
  });
});

describe("Round-Trip", () => {
  it("stellt eine MHz-Reihe innerhalb der Quantisierungsgenauigkeit wieder her", () => {
    const values = [19488.68, 17277.86, 17644.01, 22342.11, 0, 145.5];
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, MHZ_ENCODING), MHZ_ENCODING);
    expect(decoded).toHaveLength(values.length);
    values.forEach((value, index) => {
      const restored = decoded[index] as number;
      // Drei signifikante Stellen entsprechen höchstens 0,5 % relativer Abweichung.
      expect(Math.abs(restored - value)).toBeLessThanOrEqual(Math.max(value * 0.005, 0.05));
    });
  });

  it("hält den Fehler auch bei sehr kleinen Werten klein", () => {
    // Der Grund für scale = 10: Bei scale = 1 würden diese Werte alle zu 1 gerundet,
    // aus einer schwankenden Leerlaufreihe würde eine konstante.
    const values = [0.5, 0.7, 1.2, 1.4, 0.6];
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, MHZ_ENCODING), MHZ_ENCODING);
    expect(new Set(decoded).size).toBeGreaterThan(1);
    values.forEach((value, index) => {
      expect(Math.abs((decoded[index] as number) - value) / value).toBeLessThan(0.02);
    });
  });

  it("stellt Prozentwerte mit drei Nachkommastellen wieder her", () => {
    const values = [0.2, 0.234, 5.125, 100];
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, PERCENT_ENCODING), PERCENT_ENCODING);
    values.forEach((value, index) => {
      expect(decoded[index]).toBeCloseTo(value, 2);
    });
  });

  it("stellt Zählwerte exakt wieder her", () => {
    const values = [8, 8, 8, 16, 16];
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, COUNT_ENCODING), COUNT_ENCODING);
    expect(decoded).toEqual(values);
  });

  it("erhält Position und Anzahl der Lücken", () => {
    const values = [100, null, null, 300, null, 500];
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, MHZ_ENCODING), MHZ_ENCODING);
    expect(decoded.map((value) => value === null)).toEqual([false, true, true, false, true, false]);
  });

  it("erhält die Länge langer Läufe", () => {
    const values = Array.from({ length: 744 }, () => 500);
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, MHZ_ENCODING), MHZ_ENCODING);
    expect(decoded).toHaveLength(744);
    expect(decoded.every((value) => value === 500)).toBe(true);
  });
});
