import { describe, expect, it } from "vitest";
import { matchVropsTimeSeriesSchema } from "@/domain/services/vropsTimeSeriesSchema";
import { parseVropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";

const CPU_PREFIX = '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"';

function headerWith(memoryAvg: string, memoryMax?: string): string {
  return [CPU_PREFIX, `"${memoryAvg}"`, memoryMax ? `"${memoryMax}"` : ""].filter(Boolean).join(",");
}

function ramRow(values: string): string {
  return `"vm-01","12:00 AM 1 August 2026","100","0.1",${values}`;
}

describe("RAM-Memory-Workload vROps-Schema", () => {
  it("behält alte CPU-Importe ohne RAM-Metrik gültig", () => {
    const result = matchVropsTimeSeriesSchema([
      "Name",
      "Interval Breakdown",
      "VM|CPU|Demand (MHz)|Avg",
      "VM|CPU|Ready (%)|Max",
    ]);

    expect(result.schema?.objectType).toBe("vm");
    expect(result.schema?.metricHeaders.vmMemoryWorkloadAvgPct).toBeUndefined();
    expect(result.schema?.metricHeaders.vmMemoryWorkloadMaxPct).toBeUndefined();
    expect(result.issues).toEqual([]);
  });

  it.each([
    "VM|Memory|Workload (%)|Avg",
    "VM|Memory|Workload|Avg",
    "Memory|Workload (%)|Avg",
    "Memory|Workload|Avg",
  ])("erkennt den Avg-Alias %s", (header) => {
    const result = matchVropsTimeSeriesSchema(["Name", "Interval Breakdown", "VM|CPU|Demand (MHz)|Avg", "VM|CPU|Ready (%)|Max", header]);
    expect(result.schema?.metricHeaders.vmMemoryWorkloadAvgPct).toBe(header);
    expect(result.issues).toEqual([]);
  });

  it.each([
    "VM|Memory|Workload (%)|Max",
    "VM|Memory|Workload|Max",
    "Memory|Workload (%)|Max",
    "Memory|Workload|Max",
  ])("erkennt den Max-Alias %s", (header) => {
    const result = matchVropsTimeSeriesSchema(["Name", "Interval Breakdown", "VM|CPU|Demand (MHz)|Avg", "VM|CPU|Ready (%)|Max", header]);
    expect(result.schema?.metricHeaders.vmMemoryWorkloadMaxPct).toBe(header);
    expect(result.issues).toEqual([]);
  });
});

describe("RAM-Memory-Workload Parsing", () => {
  it("parst Prozentpunkte und behält Werte über 100 % mit Warnung", async () => {
    const csv = [
      headerWith("VM|Memory|Workload (%)|Avg", "VM|Memory|Workload (%)|Max"),
      ramRow('"42.5","125.5"'),
    ].join("\r\n");
    const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
    expect(result.matrix?.metricValues.vmMemoryWorkloadAvgPct?.[0]).toBeCloseTo(42.5, 4);
    expect(result.matrix?.metricValues.vmMemoryWorkloadMaxPct?.[0]).toBeCloseTo(125.5, 4);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "percentage-out-of-range", severity: "warning" }));
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("akzeptiert eine fehlende Max-Reihe als optional", async () => {
    const csv = [
      headerWith("Memory|Workload|Avg"),
      ramRow('"42.5"'),
    ].join("\r\n");
    const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
    expect(result.matrix?.metricValues.vmMemoryWorkloadAvgPct?.[0]).toBeCloseTo(42.5, 4);
    expect(result.matrix?.metricValues.vmMemoryWorkloadMaxPct).toBeUndefined();
  });

  it("speichert fehlende Avg-Werte als NaN statt als 0", async () => {
    const csv = [
      headerWith("Memory|Workload (%)|Avg"),
      ramRow('"-"'),
      '"vm-01","1:00 AM 1 August 2026","100","0.1","50"',
    ].join("\r\n");
    const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
    expect(Number.isNaN(result.matrix?.metricValues.vmMemoryWorkloadAvgPct?.[0])).toBe(true);
    expect(result.matrix?.metricValues.vmMemoryWorkloadAvgPct?.[1]).toBe(50);
  });

  it("meldet Avg über Max nur als Datenqualitätswarnung", async () => {
    const csv = [
      headerWith("Memory|Workload (%)|Avg", "Memory|Workload (%)|Max"),
      ramRow('"80","70"'),
    ].join("\r\n");
    const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "maximum-below-average", severity: "warning" }));
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
