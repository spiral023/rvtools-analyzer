import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStoredRamRightsizingLevel,
  normalizeRamRightsizingLevel,
  saveRamRightsizingLevel,
  subscribeRamRightsizingLevel,
} from "@/lib/ramRightsizingSettings";

describe("RAM-Rightsizing-Stufen", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("fällt bei unbekannten Werten auf balanced zurück", () => {
    localStorage.setItem("rvtools-ram-rightsizing-level-v1", "p99-mit-73-prozent");

    expect(normalizeRamRightsizingLevel("offensive")).toBe("offensive");
    expect(normalizeRamRightsizingLevel("p99-mit-73-prozent")).toBeNull();
    expect(getStoredRamRightsizingLevel()).toBe("balanced");
  });

  it("persistiert die Auswahl und benachrichtigt die laufende Ansicht", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRamRightsizingLevel(listener);

    saveRamRightsizingLevel("very-conservative");

    expect(getStoredRamRightsizingLevel()).toBe("very-conservative");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
