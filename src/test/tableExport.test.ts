import { describe, expect, it } from "vitest";
import {
  buildExportData,
  buildMarkdownTable,
  formatExportValue,
  normalizeExportFilename,
  resolveExportHeader,
} from "@/lib/export/tableExport";

describe("table export helpers", () => {
  it("prepares export rows with stable plain-text headers and duplicate header handling", () => {
    const data = buildExportData(
      [
        { id: "vm", header: "VM" },
        { id: "power", header: "Power" },
        { id: "powerRaw", header: "Power" },
        { id: "reactHeader", header: { type: "span" } },
      ],
      [
        {
          getValue: (columnId) =>
            ({
              vm: "app-01",
              power: true,
              powerRaw: "poweredOn",
              reactHeader: null,
            })[columnId],
        },
      ],
    );

    expect(data.headers).toEqual(["VM", "Power", "Power 2", "reactHeader"]);
    expect(data.rows).toEqual([
      {
        VM: "app-01",
        Power: "Ja",
        "Power 2": "poweredOn",
        reactHeader: "",
      },
    ]);
  });

  it("escapes markdown table cells", () => {
    const markdown = buildMarkdownTable({
      headers: ["Name", "Kommentar"],
      rows: [
        {
          Name: "vm|01",
          Kommentar: "erste Zeile\nzweite Zeile",
        },
      ],
    });

    expect(markdown).toBe(
      "| Name | Kommentar |\n| --- | --- |\n| vm\\|01 | erste Zeile<br>zweite Zeile |",
    );
  });

  it("formats export values and filenames for downloads", () => {
    expect(formatExportValue(false)).toBe("Nein");
    expect(formatExportValue(["a", "b"])).toBe("a, b");
    expect(formatExportValue({ a: 1 })).toBe('{"a":1}');
    expect(resolveExportHeader(42, "fallback")).toBe("42");
    expect(resolveExportHeader(null, "fallback")).toBe("fallback");
    expect(normalizeExportFilename(" Capacity / Cluster: Risiko ")).toBe(
      "Capacity-Cluster-Risiko",
    );
    expect(normalizeExportFilename("")).toBe("rvtools-table-export");
  });
});
