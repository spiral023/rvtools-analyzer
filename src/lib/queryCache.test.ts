import { describe, expect, it } from "vitest";
import { IMPORTED_DATA_QUERY_DEFAULTS, QUERY_CACHE_DURATION_MS, RAW_QUERY_GC_MS } from "@/lib/queryCache";

describe("query cache policy", () => {
  it("hält importierte Daten exakt eine Stunde frisch im Speicher", () => {
    expect(QUERY_CACHE_DURATION_MS).toBe(60 * 60 * 1000);
    expect(RAW_QUERY_GC_MS).toBe(QUERY_CACHE_DURATION_MS);
    expect(IMPORTED_DATA_QUERY_DEFAULTS).toMatchObject({
      staleTime: QUERY_CACHE_DURATION_MS,
      gcTime: QUERY_CACHE_DURATION_MS,
    });
  });
});
