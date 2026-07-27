import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExportData,
  buildConfluenceWikiTable,
  buildMarkdownTable,
  copyConfluenceWikiTable,
  formatExportValue,
  normalizeExportFilename,
  resolveExportHeader,
} from "@/lib/export/tableExport";

const writeText = vi.fn().mockResolvedValue(undefined);

describe("table export helpers", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

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

  it("builds Confluence Wiki-Markup and preserves special characters in cells", () => {
    const markup = buildConfluenceWikiTable({
      headers: ["Name", "Kommentar"],
      rows: [
        {
          Name: "vm|01",
          Kommentar: "erste Zeile\nzweite Zeile & <kritisch>",
        },
      ],
    });

    expect(markup).toBe(
      "||Name||Kommentar||\n|vm&#124;01|erste Zeile\\\\zweite Zeile &amp; &lt;kritisch&gt;|",
    );
  });

  it("copies Confluence Wiki-Markup to the clipboard", async () => {
    await copyConfluenceWikiTable({
      headers: ["Name"],
      rows: [{ Name: "app-01" }],
    });

    expect(writeText).toHaveBeenCalledWith("||Name||\n|app-01|");
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
