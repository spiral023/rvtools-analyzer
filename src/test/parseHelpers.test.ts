import { describe, it, expect } from "vitest";
import { parseRvtoolsExportFileName } from "@/lib/xlsx/parseHelpers";

describe("parseRvtoolsExportFileName", () => {
  it("parses vcenter and timestamp from RVTools export file name", () => {
    const parsed = parseRvtoolsExportFileName(
      "RVTools_export_all_2026_02_22_07_05_vcenter9910.xlsx",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.vcenterName).toBe("vcenter9910");

    const d = new Date(parsed!.exportTs);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(5);
  });

  it("supports .xls extension and vcenter names with separators", () => {
    const parsed = parseRvtoolsExportFileName(
      "RVTools_export_all_2026_11_09_15_45_vcenter-01.company.local.xls",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.vcenterName).toBe("vcenter-01.company.local");
  });

  it("returns null for non-matching names", () => {
    expect(parseRvtoolsExportFileName("my-export.xlsx")).toBeNull();
  });
});
