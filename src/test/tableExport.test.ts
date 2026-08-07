import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExportData,
  buildConfluenceWikiTable,
  buildHeaderNote,
  buildJsonTable,
  buildMarkdownTable,
  copyTableText,
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

  it("behält Zahlen für Excel bei und rundet Messwerte auf zwei Nachkommastellen", () => {
    const data = buildExportData(
      [
        { id: "cpuDemandP95", header: "CPU Demand P95" },
        { id: "vcpus", header: "vCPU" },
      ],
      [{
        getValue: (columnId) => ({ cpuDemandP95: 148.2342523, vcpus: 4 })[columnId],
      }],
    );

    expect(data.rows).toEqual([{ "CPU Demand P95": "148.2342523", vCPU: "4" }]);
    expect(data.excelRows).toEqual([{ "CPU Demand P95": 148.23, vCPU: 4 }]);
  });

  it("übernimmt die Spaltenerklärungen als Header-Notizen für Excel", () => {
    const data = buildExportData(
      [
        {
          id: "cpuReady",
          header: "CPU Ready",
          info: { term: "CPU Ready", description: "Wartezeit auf CPU-Zeit.", source: 'RVTools · vCPU · „Ready %"' },
        },
        {
          id: "vcpus",
          header: "vCPU",
          info: { term: "Virtuelle CPUs", description: "Zugewiesene vCPUs der VM." },
        },
        { id: "vm", header: "VM" },
      ],
      [{ getValue: (columnId) => ({ cpuReady: 1.5, vcpus: 4, vm: "app-01" })[columnId] }],
    );

    expect(data.headerNotes).toEqual({
      "CPU Ready": 'Wartezeit auf CPU-Zeit.\n\nQuelle: RVTools · vCPU · „Ready %"',
      vCPU: "Virtuelle CPUs\nZugewiesene vCPUs der VM.",
    });
  });

  it("lässt Header-Notizen ohne Inhalt weg", () => {
    expect(buildHeaderNote({ term: "", description: "" }, "vCPU")).toBe("");
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

  it("baut und kopiert JSON für strukturierte Weiterverarbeitung", async () => {
    const data = { headers: ["Name"], rows: [{ Name: "app-01" }] };

    expect(buildJsonTable(data)).toBe('[\n  {\n    "Name": "app-01"\n  }\n]');
    await copyTableText(buildJsonTable(data));
    expect(writeText).toHaveBeenCalledWith(buildJsonTable(data));
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
