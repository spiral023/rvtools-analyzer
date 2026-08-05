import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CPU_RIGHTSIZING_LEVEL_STORAGE_KEY,
  getStoredCpuRightsizingLevel,
  normalizeCpuRightsizingLevel,
  saveCpuRightsizingLevel,
  subscribeCpuRightsizingLevel,
} from "@/lib/cpuRightsizingSettings";

describe("cpuRightsizingSettings", () => {
  beforeEach(() => localStorage.clear());

  it("verwendet Vorsichtig als sicheren Default", () => {
    expect(getStoredCpuRightsizingLevel()).toBe("conservative");
    localStorage.setItem(CPU_RIGHTSIZING_LEVEL_STORAGE_KEY, "frei-erfunden");
    expect(getStoredCpuRightsizingLevel()).toBe("conservative");
  });

  it("persistiert ausschließlich geschlossene Stufen", () => {
    expect(normalizeCpuRightsizingLevel("conservative")).toBe("conservative");
    expect(normalizeCpuRightsizingLevel("p99-mit-73-prozent")).toBeNull();
    saveCpuRightsizingLevel("offensive");
    expect(getStoredCpuRightsizingLevel()).toBe("offensive");
  });

  it("benachrichtigt alle Ansichten über einen Stufenwechsel", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCpuRightsizingLevel(listener);
    saveCpuRightsizingLevel("very-conservative");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
