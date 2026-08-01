/**
 * Verankert den Importvertrag der Rightsizing-Metriken an einer unveränderten
 * Kopf- und Datenzeile aus dem produktiven vROps-Export.
 *
 * Der Anlass ist ein konkreter Fehlschlag: Die Aliase waren gegen die Doku
 * geschrieben („VM|Config|…“, Einheit MHz), der reale Export schreibt aber
 * „VM|Configuration|Hardware|…“ und führt die Kapazität in GHz. Beides fiel
 * beim Schemaabgleich still durch — die Metrik hätte schlicht gefehlt.
 */
import { describe, expect, it } from "vitest";
import { parseVropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";
import { matchVropsTimeSeriesSchema } from "@/domain/services/vropsTimeSeriesSchema";
import type { VropsTimeSeriesMetricKey } from "@/domain/models/types";

/** Unveränderte Kopfzeile des produktiven VM-Exports. */
const PRODUCTION_HEADER = 'Name,"Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Demand (MHz)|Max",'
  + '"VM|CPU|Ready (%)|Max","VM|CPU|vCPU Usage Disparity (%)|Avg",'
  + '"VM|CPU|Peak vCPU Ready within collection cycle (%)|Max",'
  + '"VM|CPU|Peak vCPU Co-Stop within collection cycle (%)|Max",'
  + '"VM|CPU|Total Capacity (GHz)|Last","VM|Configuration|Hardware|Number of CPUs (vCPUs)|Last"';

const PRODUCTION_ROW = 'servername1101,"12:00 AM 1 July 2026","162.52","385.6","0.04","1.67","0.22","0","11.2","4"';

const EXPECTED_METRICS: VropsTimeSeriesMetricKey[] = [
  "vmCpuDemandAvgMHz",
  "vmCpuDemandMaxMHz",
  "vmCpuReadyMaxPct",
  "vmCpuUsageDisparityAvgPct",
  "vmCpuPeakReadyMaxPct",
  "vmCpuPeakCostopMaxPct",
  "vmCpuTotalCapacityLastMHz",
  "vmConfiguredVcpuLast",
];

function headerCells(): string[] {
  // Die Kopfzeile enthält Kommata innerhalb der Anführungszeichen.
  return PRODUCTION_HEADER.match(/("[^"]*"|[^,]+)/g)!.map((cell) => cell.replace(/^"|"$/g, ""));
}

describe("Schemaabgleich gegen den produktiven VM-Export", () => {
  it("erkennt den Objekttyp ohne Beanstandung", () => {
    const result = matchVropsTimeSeriesSchema(headerCells());
    expect(result.schema?.objectType).toBe("vm");
    expect(result.issues).toEqual([]);
  });

  it("ordnet alle acht Rightsizing-Metriken zu", () => {
    const result = matchVropsTimeSeriesSchema(headerCells());
    expect(Object.keys(result.schema!.metricHeaders).sort()).toEqual([...EXPECTED_METRICS].sort());
  });

  it("erkennt die vCPU-Anzahl trotz ausgeschriebenem „Configuration“ und Einheit im Namen", () => {
    const result = matchVropsTimeSeriesSchema(headerCells());
    expect(result.schema!.metricHeaders.vmConfiguredVcpuLast)
      .toBe("VM|Configuration|Hardware|Number of CPUs (vCPUs)|Last");
  });
});

describe("Wertübernahme aus dem produktiven VM-Export", () => {
  async function parseProductionRow() {
    const csv = [PRODUCTION_HEADER, PRODUCTION_ROW].join("\r\n");
    const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
    if (!result.matrix) throw new Error(`Matrix erwartet, Issues: ${JSON.stringify(result.issues)}`);
    return result.matrix;
  }

  it("übernimmt die Zeile ohne Fehler", async () => {
    const matrix = await parseProductionRow();
    expect(matrix.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(matrix.objectNames).toEqual(["servername1101"]);
  });

  it("rechnet die in GHz geführte Kapazität in MHz um", async () => {
    // 11,2 GHz sind 11.200 MHz — ohne Umrechnung wäre die Auslastung um Faktor 1000 falsch.
    const matrix = await parseProductionRow();
    expect(matrix.metricValues.vmCpuTotalCapacityLastMHz![0]).toBeCloseTo(11_200, 1);
  });

  it("übernimmt die vCPU-Anzahl als Zählwert", async () => {
    const matrix = await parseProductionRow();
    expect(matrix.metricValues.vmConfiguredVcpuLast![0]).toBe(4);
  });

  it("übernimmt Demand-Mittel und -Maximum getrennt", async () => {
    const matrix = await parseProductionRow();
    expect(matrix.metricValues.vmCpuDemandAvgMHz![0]).toBeCloseTo(162.52, 2);
    expect(matrix.metricValues.vmCpuDemandMaxMHz![0]).toBeCloseTo(385.6, 2);
  });

  it("übernimmt die Prozentmetriken einschließlich des Nullwerts bei Co-Stop", async () => {
    const matrix = await parseProductionRow();
    expect(matrix.metricValues.vmCpuReadyMaxPct![0]).toBeCloseTo(0.04, 4);
    expect(matrix.metricValues.vmCpuUsageDisparityAvgPct![0]).toBeCloseTo(1.67, 4);
    expect(matrix.metricValues.vmCpuPeakReadyMaxPct![0]).toBeCloseTo(0.22, 4);
    expect(matrix.metricValues.vmCpuPeakCostopMaxPct![0]).toBe(0);
  });

  it("liest den Zeitstempel im AM/PM-Format des Exports", async () => {
    // 1. Juli 2026, 00:00 Uhr Wiener Zeit = 30. Juni 2026, 22:00 UTC (Sommerzeit).
    const matrix = await parseProductionRow();
    expect(new Date(matrix.timestampsUtc[0]).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
});
