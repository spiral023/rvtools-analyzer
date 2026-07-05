import { describe, expect, it } from "vitest";
import * as XLSX from "@e965/xlsx";
import { parseWorkbookBuffer } from "./parser.worker";

function workbookBuffer(sheets: Record<string, Record<string, unknown>[]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  }
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("parseWorkbookBuffer", () => {
  it("parses a real RVTools workbook and canonicalizes known sheet aliases", async () => {
    const buffer = workbookBuffer({
      tabvInfo: [{ VM: "APP01", "VM UUID": "uuid-app01", Cluster: "CL-Prod" }],
      "vSC+VMK": [{ Host: "esx01", Device: "vmk0" }],
      vSource: [{ "VI SDK Server": "vcsa01.lab.local" }],
      vMetaData: [{ "xlsx creation datetime": 46120 }],
    });

    const result = await parseWorkbookBuffer(buffer);

    expect(result.fileKind).toBe("rvtools");
    expect(result.vcenterName).toBe("vcsa01.lab.local");
    expect(result.sheets.map((sheet) => sheet.sheetName)).toEqual([
      "vInfo",
      "vSC_VMK",
      "vSource",
      "vMetaData",
    ]);
    expect(result.sheets[0].headers).toEqual(["VM", "VM UUID", "Cluster"]);
    expect(result.sheets[0].rows[0]).toMatchObject({
      VM: "APP01",
      "VM UUID": "uuid-app01",
      Cluster: "CL-Prod",
    });
    expect(result.warnings).toContain('Expected sheet "vCPU" not found.');
    expect(result.errors).toEqual([]);
  });
});
