import { describe, expect, it, vi } from "vitest";
import * as XLSX from "@e965/xlsx";
import { buildExportData, exportExcelTable } from "@/lib/export/tableExport";

/** Fängt die Arbeitsmappe ab, die der Export als Blob zum Download gibt. */
async function writeWorkbook(data: Parameters<typeof exportExcelTable>[0]): Promise<Uint8Array> {
  const parts: BlobPart[][] = [];
  vi.stubGlobal("Blob", class { constructor(input: BlobPart[]) { parts.push(input); } });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: () => {} });
  await exportExcelTable(data, "notizen");
  return parts[0][0] as Uint8Array;
}

/** Zeilenbereich des Notizfelds je Spalte, wie ihn Excel aus dem VML-Anker liest. */
function noteRowSpans(workbookData: Uint8Array): Map<number, number> {
  const container = XLSX.CFB.read(workbookData, { type: "array" });
  const drawing = container.FileIndex.find((file: { name: string }) => file.name === "vmlDrawing1.vml");
  const vml = new TextDecoder().decode(new Uint8Array(drawing.content));
  const spans = new Map<number, number>();
  for (const shape of vml.match(/<v:shape\b[\s\S]*?<\/v:shape>/g) ?? []) {
    const anchor = /<x:Anchor>([^<]*)<\/x:Anchor>/.exec(shape)?.[1].split(",").map(Number) ?? [];
    const column = Number(/<x:Column>(\d+)<\/x:Column>/.exec(shape)?.[1]);
    spans.set(column, anchor[6] - anchor[2]);
  }
  return spans;
}

const SHORT = { term: "VM", description: "Anzeigename der VM in vCenter." };
const LONG = {
  term: "Auffällig",
  description: "Sammelspalte der erkannten Auffälligkeiten: viele vCPU bei geringem Bedarf, auffälliges CPU Ready, Co-Stop unter Last, Einzelkern-Engpass, Last auf wenigen Kernen und dauerhaft nahe Kapazität.",
  source: "berechnet · vROps",
};

// Die Stubs bleiben für die ganze Datei stehen: der Download gibt den Object-URL erst
// im nächsten Tick frei und würde ein zurückgesetztes URL-Global nicht mehr finden.
describe("Excel-Header-Notizen", () => {
  it("hängt die Spaltenerklärung als Notiz an die zugehörige Kopfzelle", async () => {
    const data = buildExportData(
      [
        { id: "vm", header: "VM", info: SHORT },
        { id: "plain", header: "Ohne Erklärung" },
        { id: "cpuReady", header: "Ready P95", unit: "%", info: { term: "Ready P95", description: "Wartezeit auf CPU-Zeit.", source: "vROps" } },
      ],
      [{ getValue: (columnId) => ({ vm: "app-01", plain: "x", cpuReady: 1.5 })[columnId] }],
    );

    const workbook = XLSX.read(await writeWorkbook(data), { type: "array" });
    const worksheet = workbook.Sheets["Tabelle"];

    expect(worksheet["A1"].c?.[0].t).toBe("Anzeigename der VM in vCenter.");
    expect(worksheet["B1"].c).toBeUndefined();
    expect(worksheet["C1"].v).toBe("Ready P95 (%)");
    expect(worksheet["C1"].c?.[0].t).toBe("Wartezeit auf CPU-Zeit.\n\nQuelle: vROps");
    // Notizen bleiben zugeklappt: Excel zeigt nur die rote Ecke, den Text erst bei Hover.
    expect(worksheet["C1"].c?.hidden).toBe(true);
  });

  it("bemisst das Notizfeld nach der Textlänge", async () => {
    const data = buildExportData(
      [{ id: "vm", header: "VM", info: SHORT }, { id: "flags", header: "Auffällig", info: LONG }],
      [{ getValue: () => "x" }],
    );

    const spans = noteRowSpans(await writeWorkbook(data));

    // Excel bemisst Notizen allein über den Anker; ohne diesen Eingriff schreibt die
    // Bibliothek für jede Notiz starre vier Zeilen und schneidet lange Texte ab.
    expect(spans.get(0)).toBe(4);
    expect(spans.get(1)).toBeGreaterThan(spans.get(0)!);
  });
});
