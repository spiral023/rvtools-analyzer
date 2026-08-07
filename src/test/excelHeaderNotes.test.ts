import { describe, expect, it, vi } from "vitest";
import { buildExportData, exportExcelTable } from "@/lib/export/tableExport";

const writeFile = vi.fn();

// Nur der Datei-Download wird ersetzt; das Arbeitsblatt baut die echte Bibliothek,
// damit der Test die tatsächlichen Zelladressen der Kopfzeile prüft.
vi.mock("@e965/xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@e965/xlsx")>();
  return { ...actual, writeFile: (...args: unknown[]) => writeFile(...args) };
});

describe("Excel-Header-Notizen", () => {
  it("hängt die Spaltenerklärung als Notiz an die zugehörige Kopfzelle", async () => {
    const data = buildExportData(
      [
        { id: "vm", header: "VM", info: { term: "VM", description: "Name der VM." } },
        { id: "plain", header: "Ohne Erklärung" },
        {
          id: "cpuReady",
          header: "CPU Ready",
          info: { term: "CPU Ready", description: "Wartezeit auf CPU-Zeit.", source: "RVTools · vCPU" },
        },
      ],
      [{ getValue: (columnId) => ({ vm: "app-01", plain: "x", cpuReady: 1.5 })[columnId] }],
    );

    await exportExcelTable(data, "notizen");

    const workbook = writeFile.mock.calls[0][0] as import("@e965/xlsx").WorkBook;
    const worksheet = workbook.Sheets["Tabelle"];

    expect(worksheet["A1"].c?.[0].t).toBe("Name der VM.");
    expect(worksheet["B1"].c).toBeUndefined();
    expect(worksheet["C1"].c?.[0].t).toBe("Wartezeit auf CPU-Zeit.\n\nQuelle: RVTools · vCPU");
    // Notizen bleiben zugeklappt: Excel zeigt nur die rote Ecke, den Text erst bei Hover.
    expect(worksheet["C1"].c?.hidden).toBe(true);
  });
});
