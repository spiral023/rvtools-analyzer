import { describe, expect, it } from "vitest";
import { normalizeSnapshots } from "@/domain/services/importService";
import type { ParsedSheetData } from "@/domain/models/types";

function sheet(rows: Record<string, unknown>[]): ParsedSheetData {
  return { sheetName: "vSnapshot", headers: Object.keys(rows[0] ?? {}), rows };
}

describe("normalizeSnapshots", () => {
  it("reads sizeMiB from RVTools column 'Size MiB (total)'", () => {
    const result = normalizeSnapshots(
      sheet([
        {
          VM: "srv-app-01",
          "Snapshot Name": "vor Update",
          "Date / time": "2026/06/20 08:00:00",
          "Size MiB (total)": 2048,
          "Size MiB (vmsn)": 128,
          Quiesced: "False",
        },
      ]),
      "snap-1",
      "vc-1",
    );
    expect(result).toHaveLength(1);
    expect(result[0].sizeMiB).toBe(2048);
  });

  it("keeps legacy fallback columns for sizeMiB", () => {
    const result = normalizeSnapshots(sheet([{ VM: "srv-app-02", "Size MiB": 512 }]), "snap-1", "vc-1");
    expect(result[0].sizeMiB).toBe(512);
  });
});
