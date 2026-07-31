import { describe, expect, it } from "vitest";
import {
  MAX_ISSUES_PER_CODE,
  parseVropsTimeSeriesMatrix,
  type VropsTimeSeriesMatrix,
} from "@/domain/services/vropsTimeSeriesMatrixParser";
import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";
import { computeChecksum } from "@/lib/xlsx/parseHelpers";
import type { VropsTimeSeriesMetricKey } from "@/domain/models/types";

const VM_HEADER = '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"';
const HOST_HEADER = '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last",'
  + '"Host|Memory|Capacity Available to VMs|Last","Host|Runtime|Maintenance State|Last"';

function csvOf(lines: string[]): string {
  return lines.join("\r\n");
}

function blobOf(csv: string): Blob {
  return new Blob([csv], { type: "text/csv" });
}

async function parseMatrix(csv: string, chunkSizeBytes?: number): Promise<VropsTimeSeriesMatrix> {
  const result = await parseVropsTimeSeriesMatrix(blobOf(csv), { chunkSizeBytes });
  if (!result.matrix) throw new Error(`Matrix erwartet, Issues: ${JSON.stringify(result.issues)}`);
  return result.matrix;
}

/** Liest eine Zelle aus der Matrix. */
function cell(matrix: VropsTimeSeriesMatrix, metric: VropsTimeSeriesMetricKey, objectName: string, timestampUtc: number): number {
  const objectIndex = matrix.objectNames.indexOf(objectName);
  const slotIndex = matrix.timestampsUtc.indexOf(timestampUtc);
  return matrix.metricValues[metric]![objectIndex * matrix.timestampsUtc.length + slotIndex];
}

describe("parseVropsTimeSeriesMatrix", () => {
  const vmCsv = csvOf([
    VM_HEADER,
    '"vm-b","12:00 AM 21 July 2026","1,546.6","0.44"',
    '"vm-b","1:00 AM 21 July 2026","1,749.04","0.46"',
    '"vm-a","12:00 AM 21 July 2026","900.5","0.1"',
    '"vm-a","1:00 AM 21 July 2026","910.25","0.2"',
  ]);

  it("füllt die Matrix mit sortierten Objekten und Stunden", async () => {
    const matrix = await parseMatrix(vmCsv);
    const midnight = Date.parse("2026-07-20T22:00:00.000Z");

    expect(matrix.objectNames).toEqual(["vm-a", "vm-b"]);
    expect(matrix.timestampsUtc).toEqual([midnight, midnight + 3_600_000]);
    expect(matrix.rowCount).toBe(4);
    expect(cell(matrix, "vmCpuDemandAvgMHz", "vm-b", midnight)).toBeCloseTo(1546.6, 3);
    expect(cell(matrix, "vmCpuReadyMaxPct", "vm-a", midnight + 3_600_000)).toBeCloseTo(0.2, 5);
    expect(matrix.issues).toEqual([]);
  });

  it("liefert dieselben Werte und Issue-Codes wie der zeilenbasierte Parser", async () => {
    const csv = csvOf([
      VM_HEADER,
      '"vm-a","12:00 AM 21 July 2026","1,546.6","0.44"',
      '"vm-a","1:00 AM 21 July 2026","-","0.46"',
      '"vm-a","2:00 AM 21 July 2026","2 GHz","0.5"',
      '"vm-b","12:00 AM 21 July 2026","900.5","0.1"',
      '"vm-b","1:00 AM 21 July 2026","910.25","0.2"',
      '"vm-b","2:00 AM 21 July 2026","920.75","0.3"',
    ]);

    const reference = parseVropsTimeSeriesCsv(csv);
    const matrix = await parseMatrix(csv);

    for (const row of reference.rows) {
      for (const [metric, expected] of Object.entries(row.values) as Array<[VropsTimeSeriesMetricKey, number | null]>) {
        const actual = cell(matrix, metric, row.objectName, row.intervalStartUtc);
        if (expected === null) expect(Number.isNaN(actual)).toBe(true);
        else expect(actual).toBeCloseTo(expected as number, 4);
      }
    }
    expect(matrix.issues.map((issue) => issue.code).sort())
      .toEqual(reference.issues.map((issue) => issue.code).sort());
  });

  it("liefert für jede Chunkgrösse dasselbe Ergebnis", async () => {
    const reference = await parseMatrix(vmCsv);
    for (const chunkSizeBytes of [1, 3, 16, 64, 4096]) {
      const matrix = await parseMatrix(vmCsv, chunkSizeBytes);
      expect(matrix.objectNames, `Chunk ${chunkSizeBytes}`).toEqual(reference.objectNames);
      expect(matrix.timestampsUtc, `Chunk ${chunkSizeBytes}`).toEqual(reference.timestampsUtc);
      expect(Array.from(matrix.metricValues.vmCpuDemandAvgMHz!), `Chunk ${chunkSizeBytes}`)
        .toEqual(Array.from(reference.metricValues.vmCpuDemandAvgMHz!));
      expect(matrix.fileChecksum, `Chunk ${chunkSizeBytes}`).toBe(reference.fileChecksum);
    }
  });

  it("berechnet dieselbe Prüfsumme wie computeChecksum über den ganzen Puffer", async () => {
    const matrix = await parseMatrix(vmCsv);
    const expected = await computeChecksum(new TextEncoder().encode(vmCsv).buffer);

    expect(matrix.fileChecksum).toBe(expected);
  });

  it("meldet doppelte Objekt/Zeitpunkt-Kombinationen mit der Quellzeile", async () => {
    const matrix = await parseMatrix(csvOf([
      VM_HEADER,
      '"vm-a","12:00 AM 21 July 2026","100","0.1"',
      '"vm-a","12:00 AM 21 July 2026","200","0.2"',
    ]));

    expect(matrix.issues).toContainEqual(expect.objectContaining({
      code: "duplicate-object-timestamp",
      row: 3,
      objectName: "vm-a",
    }));
  });

  it("meldet Avg>Max mit der Quellzeile", async () => {
    const clusterHeader = '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max",'
      + '"Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max",'
      + '"Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"';
    const matrix = await parseMatrix(csvOf([
      clusterHeader,
      '"CL-01","12:00 AM 21 July 2026","500","400","1000","1000","0.4","0.5"',
    ]));

    expect(matrix.issues).toContainEqual(expect.objectContaining({
      code: "maximum-below-average",
      row: 2,
      metric: "clusterCpuDemandMaxMHz",
    }));
  });

  it("schreibt den Wartungszustand über fehlende Stunden fort und markiert ihn als abgeleitet", async () => {
    const matrix = await parseMatrix(csvOf([
      HOST_HEADER,
      '"esx-01","12:00 AM 21 July 2026","124,544","1,536,409.75","notInMaintenance"',
      '"esx-01","1:00 AM 21 July 2026","124,544","1,536,409.75","-"',
      '"esx-01","2:00 AM 21 July 2026","124,544","1,536,409.75","inMaintenance"',
    ]));

    const codes = matrix.maintenanceCodes!;
    const lexicon = matrix.maintenanceLexicon!;
    expect(lexicon).toContain("notInMaintenance");
    expect(lexicon[codes[0] - 1]).toBe("notInMaintenance");
    // Die Lücke übernimmt den Vorstundenwert und ist als abgeleitet markiert.
    expect(lexicon[codes[1] - 1]).toBe("notInMaintenance");
    expect(matrix.maintenanceDerived![1]).toBe(1);
    expect(matrix.maintenanceDerived![0]).toBe(0);
    expect(lexicon[codes[2] - 1]).toBe("inMaintenance");
  });

  it("erkennt Lücken im Stundenraster eines Objekts", async () => {
    const matrix = await parseMatrix(csvOf([
      VM_HEADER,
      '"vm-a","12:00 AM 21 July 2026","100","0.1"',
      '"vm-a","1:00 AM 21 July 2026","110","0.1"',
      '"vm-a","3:00 AM 21 July 2026","130","0.1"',
      '"vm-b","12:00 AM 21 July 2026","100","0.1"',
      '"vm-b","1:00 AM 21 July 2026","110","0.1"',
      '"vm-b","2:00 AM 21 July 2026","120","0.1"',
      '"vm-b","3:00 AM 21 July 2026","130","0.1"',
    ]));

    const gaps = matrix.issues.filter((issue) => issue.code === "hour-gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ objectName: "vm-a" });
  });

  it("deckelt die gesammelten Issues je Code und behält die Gesamtzahl", async () => {
    const lines = [VM_HEADER];
    const total = MAX_ISSUES_PER_CODE + 25;
    for (let index = 0; index < total; index += 1) {
      const hour = index % 12 === 0 ? 12 : index % 12;
      const meridiem = index < 12 ? "AM" : "PM";
      lines.push(`"vm-${index}","${hour}:00 ${meridiem} 21 July 2026","-","0.1"`);
    }

    const matrix = await parseMatrix(csvOf(lines));
    const collected = matrix.issues.filter((issue) => issue.code === "missing-value");

    expect(collected).toHaveLength(MAX_ISSUES_PER_CODE);
    expect(matrix.issueCountsByCode["missing-value"]).toBe(total);
  });

  it("meldet eine leere Datei ohne Matrix", async () => {
    const result = await parseVropsTimeSeriesMatrix(blobOf(""));

    expect(result.matrix).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "empty-file" }));
  });

  it("meldet einen unbekannten Objekttyp ohne Matrix", async () => {
    const result = await parseVropsTimeSeriesMatrix(blobOf('"a","b"\r\n"1","2"'));

    expect(result.matrix).toBeUndefined();
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});
