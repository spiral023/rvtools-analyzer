import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

beforeEach(() => {
  vi.resetModules();
  // Frische Factory => leere DB pro Test. Cast, falls die TS-Lib-Typen abweichen.
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

describe("getStoreDiagnostics", () => {
  it("returns zero counts for all stores on an empty database", async () => {
    const { getStoreDiagnostics } = await import("./index");
    const result = await getStoreDiagnostics();
    expect(result.length).toBeGreaterThan(0);
    for (const store of result) {
      expect(store.count).toBe(0);
      expect(store.estimatedSizeBytes).toBe(0);
    }
  });
});

describe("getStoreDiagnostics with data", () => {
  it("counts entries and estimates a non-zero size after inserting snapshots", async () => {
    const { putSnapshot, getStoreDiagnostics } = await import("./index");
    await putSnapshot({
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      vcenterDisplayName: "Test vCenter",
      exportTs: "2026-01-01T00:00:00.000Z",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "test.xlsx",
      fileChecksum: "abc123",
      sheetStats: {},
      fileSizeBytes: 1024,
      importDurationMs: 500,
    });

    const result = await getStoreDiagnostics();
    const snapshotsStore = result.find((r) => r.storeName === "snapshots");
    expect(snapshotsStore?.count).toBe(1);
    expect(snapshotsStore?.estimatedSizeBytes).toBeGreaterThan(0);
  });
});

describe("getStorageEstimate", () => {
  it("returns a result shape indicating support or graceful fallback", async () => {
    const { getStorageEstimate } = await import("./index");
    const result = await getStorageEstimate();
    expect(typeof result.supported).toBe("boolean");
    if (!result.supported) {
      expect(result.usageBytes).toBeNull();
      expect(result.quotaBytes).toBeNull();
    }
  });
});

describe("timeSampleVmQuery", () => {
  it("returns zero rows and a duration-safe result on an empty database", async () => {
    const { timeSampleVmQuery } = await import("./index");
    const result = await timeSampleVmQuery();
    expect(result.store).toBe("entities_vm");
    expect(result.rowCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
