import { afterEach, describe, expect, it, vi } from "vitest";
import { clearQueryTimings, getQueryTimings, recordQueryTiming, timeQuery } from "@/lib/queryTiming";

afterEach(() => {
  clearQueryTimings();
  vi.restoreAllMocks();
});

describe("queryTiming", () => {
  it("summarizes the most recent measurement per query key", () => {
    recordQueryTiming("vms", 120, 500);
    recordQueryTiming("vms", 340, 520);

    const summaries = getQueryTimings();
    const vms = summaries.find((s) => s.queryKey === "vms");

    expect(vms).toMatchObject({ lastDurationMs: 340, lastRowCount: 520, sampleCount: 2 });
  });

  it("keeps only the last 5 samples per key (ring buffer)", () => {
    for (let i = 1; i <= 8; i++) {
      recordQueryTiming("rawSheet/vCPU", i * 100, i);
    }

    const summaries = getQueryTimings();
    const entry = summaries.find((s) => s.queryKey === "rawSheet/vCPU");

    expect(entry?.sampleCount).toBe(5);
    // Älteste 3 Messungen (100,200,300) wurden verdrängt; Durchschnitt aus den letzten 5 (400..800).
    expect(entry?.avgDurationMs).toBe(600);
    expect(entry?.lastDurationMs).toBe(800);
  });

  it("sorts summaries by last duration, slowest first", () => {
    recordQueryTiming("hosts", 50, 10);
    recordQueryTiming("rawSheet/vDisk", 4000, 90000);
    recordQueryTiming("datastores", 30, 20);

    const summaries = getQueryTimings();

    expect(summaries.map((s) => s.queryKey)).toEqual(["rawSheet/vDisk", "hosts", "datastores"]);
  });

  it("timeQuery records duration and row count, then returns the original result", async () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1250);

    const result = await timeQuery("vms", async () => [{ id: 1 }, { id: 2 }, { id: 3 }]);

    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const summary = getQueryTimings().find((s) => s.queryKey === "vms");
    expect(summary).toMatchObject({ lastDurationMs: 250, lastRowCount: 3, sampleCount: 1 });
  });
});
