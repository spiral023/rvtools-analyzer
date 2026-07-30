import { describe, expect, it } from "vitest";
import { buildHeatScale, heatCellColor, relativeToMedian } from "@/lib/heatScale";

/** Deckkraft aus dem `hsl(var(--token) / alpha)`-Ausdruck, um Farbstufen vergleichen zu können. */
function alphaOf(color: string): number {
  const match = /\/ ([0-9.]+)\)$/.exec(color);
  if (match === null) throw new Error(`Keine Deckkraft in "${color}"`);
  return Number(match[1]);
}

function tokenOf(color: string): string {
  const match = /var\((--[a-z-]+)\)/.exec(color);
  if (match === null) throw new Error(`Kein Token in "${color}"`);
  return match[1];
}

describe("buildHeatScale", () => {
  it("verankert die Skala am Median und begrenzt sie am P95", () => {
    // Wie ein Wochenraster: viele Stunden dicht beieinander, eine einzelne Spitzenstunde.
    const values = [...Array.from({ length: 40 }, (_, index) => 1_000 + index * 25), 9_000];
    const scale = buildHeatScale([...values, null]);
    expect(scale).not.toBeNull();
    expect(scale!.min).toBe(1_000);
    expect(scale!.max).toBe(9_000);
    expect(scale!.lower).toBeLessThan(scale!.median);
    // Der Ausreißer 9.000 liegt oberhalb des P95 und staucht die Skala nicht.
    expect(scale!.upper).toBeLessThan(9_000);
    expect(scale!.upper).toBeGreaterThan(scale!.median);
  });

  it("weicht auf das Maximum aus, wenn P95 und Median zusammenfallen", () => {
    const scale = buildHeatScale([100, 100, 100, 100, 100, 400]);
    expect(scale!.median).toBe(100);
    expect(scale!.upper).toBe(400);
  });

  it("liefert ohne verwertbaren Wert null", () => {
    expect(buildHeatScale([null, undefined, Number.NaN])).toBeNull();
  });
});

describe("heatCellColor", () => {
  const scale = buildHeatScale([1_000, 1_200, 1_400, 1_600, 1_800, 2_000, 2_200])!;

  it("spreizt die Werte über dem Median über den vollen Deckkraftbereich", () => {
    // Genau der Punkt, an dem die Skala von 0 bis Maximum versagt: die Werte liegen
    // zwischen 45 % und 100 % des Maximums, müssen aber klar unterscheidbar bleiben.
    const knappDrueber = alphaOf(heatCellColor(scale.median + 1, scale));
    const spitze = alphaOf(heatCellColor(scale.upper, scale));
    expect(tokenOf(heatCellColor(scale.median, scale))).toBe("--primary");
    expect(spitze - knappDrueber).toBeGreaterThan(0.7);
    expect(spitze).toBeLessThanOrEqual(0.95);
  });

  it("kappt Werte oberhalb der oberen Grenze auf volle Sättigung", () => {
    expect(alphaOf(heatCellColor(scale.upper, scale))).toBe(alphaOf(heatCellColor(scale.upper * 10, scale)));
  });

  it("zeichnet Stunden unter dem Median neutral und umso blasser, je ruhiger sie sind", () => {
    const knappDrunter = heatCellColor(scale.median - 1, scale);
    const ruhigste = heatCellColor(scale.min, scale);
    expect(tokenOf(knappDrunter)).toBe("--muted-foreground");
    expect(alphaOf(ruhigste)).toBeLessThan(alphaOf(knappDrunter));
  });
});

describe("relativeToMedian", () => {
  it("gibt den Abstand zum Median in Prozent an", () => {
    const scale = buildHeatScale([1_000, 1_600, 2_000])!;
    expect(relativeToMedian(2_000, scale)).toBeCloseTo(25);
    expect(relativeToMedian(800, scale)).toBeCloseTo(-50);
  });

  it("bleibt ohne positiven Median unbestimmt", () => {
    const scale = buildHeatScale([0, 0, 0])!;
    expect(relativeToMedian(0, scale)).toBeNull();
  });
});
