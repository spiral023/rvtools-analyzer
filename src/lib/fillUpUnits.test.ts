import { describe, expect, it } from "vitest";
import { formatFillUpValue, fromFillUpDisplayValue, toFillUpDisplayValue } from "./fillUpUnits";

describe("Fill-Up-Einheiten", () => {
  it("formatiert interne MHz und MiB als GHz und GiB mit zwei Nachkommastellen", () => {
    expect(formatFillUpValue(1_234.5, "MHz")).toBe("1,23 GHz");
    expect(formatFillUpValue(4_608, "MiB")).toBe("4,50 GiB");
  });

  it("wandelt Eingabewerte verlustfrei zurück in die interne Einheit", () => {
    expect(toFillUpDisplayValue(4_608, "MiB")).toBe("4.50");
    expect(fromFillUpDisplayValue("4.50", "MiB")).toBe(4_608);
    expect(fromFillUpDisplayValue("1,25", "MHz")).toBe(1_250);
  });
});
