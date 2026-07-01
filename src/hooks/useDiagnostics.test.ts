import { describe, it, expect } from "vitest";
import { getMemoryDiagnostics } from "./useDiagnostics";

describe("getMemoryDiagnostics", () => {
  it("returns unsupported when performance.memory is not present", () => {
    const result = getMemoryDiagnostics({} as Performance);
    expect(result.supported).toBe(false);
    expect(result.usedJSHeapSizeBytes).toBeNull();
    expect(result.totalJSHeapSizeBytes).toBeNull();
  });

  it("reads heap sizes when performance.memory is present", () => {
    const fakePerformance = {
      memory: { usedJSHeapSize: 1000, totalJSHeapSize: 2000 },
    } as unknown as Performance;
    const result = getMemoryDiagnostics(fakePerformance);
    expect(result.supported).toBe(true);
    expect(result.usedJSHeapSizeBytes).toBe(1000);
    expect(result.totalJSHeapSizeBytes).toBe(2000);
  });
});
