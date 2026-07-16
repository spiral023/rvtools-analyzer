import { describe, it, expect } from "vitest";
import { gzipJson, gunzipJson } from "@/lib/compression";

describe("gzipJson/gunzipJson", () => {
  it("round-trips arrays of primitive values", async () => {
    const values = [
      ["APP01", 4, true, null],
      ["APP02", 2, false, null],
    ];
    const compressed = await gzipJson(values);
    expect(compressed.byteLength).toBeGreaterThan(0);
    const restored = await gunzipJson<typeof values>(compressed);
    expect(restored).toEqual(values);
  });

  it("compresses repetitive row data to well below its raw JSON size", async () => {
    const values = Array.from({ length: 200 }, (_, i) => [`vm-${i}`, "poweredOn", 4096]);
    const rawSize = JSON.stringify(values).length;
    const compressed = await gzipJson(values);
    expect(compressed.byteLength).toBeLessThan(rawSize / 2);
  });

  it("round-trips an empty array", async () => {
    const compressed = await gzipJson([]);
    await expect(gunzipJson<unknown[]>(compressed)).resolves.toEqual([]);
  });
});
