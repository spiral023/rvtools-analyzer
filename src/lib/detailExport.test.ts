import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { SystemDossierPdf } from "@/components/detail/SystemDossierPdf";
import {
  buildDossierConfluence,
  buildDossierMarkdown,
  detailFileName,
  getTrendPeak,
  pseudonymizeDetailDossier,
  type DetailDossier,
} from "@/lib/detailExport";

const dossier: DetailDossier = {
  kind: "VM",
  title: "srv-production-01",
  titleSensitivity: "identifier",
  subtitle: "cluster-a · esx-01",
  summary: "Die VM hat ein konstantes Lastmuster.",
  sourceDate: "30.07.2026",
  kpis: [
    { label: "Host", value: "esx-01", sensitivity: "identifier" },
    { label: "vCPU", value: "8" },
  ],
  trend: {
    title: "CPU-Auslastung",
    cpuCapacityMHz: 20_000,
    points: [
      { timestampUtc: Date.UTC(2026, 6, 25, 12), cpuDemandMHz: 2_000, secondaryValue: 0.2 },
      { timestampUtc: Date.UTC(2026, 6, 26, 12), cpuDemandMHz: 8_000, secondaryValue: 0.8 },
    ],
  },
  sections: [
    {
      title: "Verantwortung",
      fields: [
        { label: "Systemverantwortlicher", value: "Max Mustermann", sensitivity: "person" },
        { label: "Abteilung", value: "IT Betrieb", sensitivity: "department" },
      ],
    },
    {
      title: "VMs",
      table: {
        headers: ["VM", "Host", "vCPU"],
        rows: [["srv-production-01", "esx-01", "8"]],
        sensitiveColumns: { 0: "identifier", 1: "identifier" },
      },
    },
  ],
};

describe("detail export", () => {
  it("pseudonymisiert sensible Werte konsistent und lässt Metriken unverändert", () => {
    const result = pseudonymizeDetailDossier(dossier);
    expect(result.title).toBe("System-001");
    expect(result.kpis[0].value).toBe("System-003");
    expect(result.sections[1].table?.rows[0]).toEqual(["System-001", "System-003", "8"]);
    expect(result.sections[0].fields?.map((field) => field.value)).toEqual(["Person-001", "Organisation-001"]);
    expect(result.trend).toEqual(dossier.trend);
  });

  it("erzeugt vollständige Markdown- und Confluence-Strukturen", () => {
    const markdown = buildDossierMarkdown(dossier);
    const confluence = buildDossierConfluence(dossier);
    expect(markdown).toContain("# VM srv-production-01");
    expect(markdown).toContain("## Auslastungsverlauf");
    expect(markdown).toContain("höchster CPU-Demand");
    expect(confluence).toContain("h1. VM srv-production-01");
    expect(confluence).toContain("|| Kennzahl || Wert || Einordnung ||");
    expect(confluence).toContain("h2. Auslastungsverlauf");
  });

  it("findet den höchsten Zeitreihen-Peak und erzeugt sichere Dateinamen", () => {
    expect(getTrendPeak(dossier.trend?.points ?? [])?.cpuDemandMHz).toBe(8_000);
    expect(detailFileName("VM", "Server / Produktion 01", true, "pdf")).toBe("vm-server-produktion-01-pseudonymisiert.pdf");
  });

  it("rendert ein valides A4-PDF-Datenblatt", async () => {
    // SystemDossierPdf rendert ein <Document>, die Props-Signatur ist aber nicht DocumentProps.
    const document = createElement(SystemDossierPdf, { dossier, pseudonymized: false }) as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(document);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
