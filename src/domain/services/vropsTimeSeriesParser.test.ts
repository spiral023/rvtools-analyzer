import { describe, expect, it } from "vitest";
import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";

const VM_HEADER = '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"';
const CLUSTER_HEADER = '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max","Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max","Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"';
const HOST_HEADER = '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last","Host|Runtime|Maintenance State|Last"';

function errorCodes(csv: string): string[] {
  return parseVropsTimeSeriesCsv(csv).issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
}

describe("parseVropsTimeSeriesCsv", () => {
  it("erkennt die bestätigten VM-Header und normalisiert englische Tausenderwerte sowie Vienna-Zeit nach UTC", () => {
    const result = parseVropsTimeSeriesCsv([
      VM_HEADER,
      '"server, alpha","12:00 AM 21 July 2026","1,546.6","0.44"',
      '"server, alpha","1:00 AM 21 July 2026","1,749.04","0.46"',
    ].join("\r\n"));

    expect(result.schema).toMatchObject({ objectType: "vm", version: 1 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      objectName: "server, alpha",
      intervalStartUtc: Date.parse("2026-07-20T22:00:00.000Z"),
      values: { vmCpuDemandAvgMHz: 1546.6, vmCpuReadyMaxPct: 0.44 },
    });
    expect(result.issues).toEqual([]);
  });

  it("erkennt die bestätigten Cluster-Header und wandelt dynamische GHz- und GB-Werte binär um", () => {
    const result = parseVropsTimeSeriesCsv([
      CLUSTER_HEADER,
      '"CL-01","2026-07-21T00:00:00+02:00","1.5 GHz","2 GHz","1.5 GB","2 GB","0.4","0.76"',
    ].join("\n"));

    expect(result.schema?.objectType).toBe("cluster");
    expect(result.rows[0]?.values).toMatchObject({
      clusterCpuDemandAvgMHz: 1500,
      clusterCpuDemandMaxMHz: 2000,
      clusterMemoryUtilizationAvgMiB: 1536,
      clusterMemoryUtilizationMaxMiB: 2048,
      clusterCpuContentionAvgPct: 0.4,
      clusterCpuContentionMaxPct: 0.76,
    });
    expect(result.issues).toEqual([]);
  });

  it("akzeptiert dimensionsgleiche Header-Aliase mit dynamischer Einheit", () => {
    const result = parseVropsTimeSeriesCsv([
      CLUSTER_HEADER.replace(/Utilization \(MB\)/g, "Utilization (GB)"),
      '"CL-01","2026-07-21T00:00:00Z","1","2","1","2","0.1","0.2"',
    ].join("\n"));

    expect(result.schema?.objectType).toBe("cluster");
    expect(result.rows[0]?.values.clusterMemoryUtilizationAvgMiB).toBe(1024);
    expect(result.rows[0]?.values.clusterMemoryUtilizationMaxMiB).toBe(2048);
  });

  it("erkennt Host über seine Pflichtheader, akzeptiert optionale Diagnosemetriken und behandelt VMware-KB als KiB", () => {
    const header = HOST_HEADER.replace('"Host|Runtime|Maintenance State|Last"', '"Host|CPU|Demand|Avg","Host|CPU|Demand|Max","Host|Runtime|Maintenance State|Last"');
    const result = parseVropsTimeSeriesCsv([
      header,
      '"esx-01","2026-07-21T00:00:00Z","124,544","1,048,576 KB","4 GHz","5 GHz","notInMaintenance"',
    ].join("\n"));

    expect(result.schema?.objectType).toBe("host");
    expect(result.rows[0]?.values).toMatchObject({
      hostCpuCapacityAvailableLastMHz: 124544,
      hostMemoryCapacityAvailableLastMiB: 1024,
      hostCpuDemandAvgMHz: 4000,
      hostCpuDemandMaxMHz: 5000,
      hostMaintenanceStateLast: "notInMaintenance",
    });
    expect(result.issues).toEqual([]);
  });

  it("unterstützt bestätigte Alias-Header, ohne die Objektart aus dem Dateinamen abzuleiten", () => {
    const result = parseVropsTimeSeriesCsv([
      '"VM Name","Interval Start","VM|CPU|Demand|Avg","VM|CPU|Ready|Max"',
      '"vm-01","2026-07-21T00:00:00Z","12.5","0.1"',
    ].join("\n"));

    expect(result.schema).toMatchObject({ objectType: "vm", objectNameHeader: "VM Name", intervalHeader: "Interval Start" });
    expect(result.rows[0]?.values.vmCpuDemandAvgMHz).toBe(12.5);
  });

  it("behält Missing Values als null und kennzeichnet fortgeschriebene Host-Maintenance-Zustände", () => {
    const result = parseVropsTimeSeriesCsv([
      HOST_HEADER,
      '"esx-01","2026-07-21T00:00:00Z","1000","2048","notInMaintenance"',
      '"esx-01","2026-07-21T01:00:00Z","-","","-"',
    ].join("\n"));

    expect(result.rows[1]).toMatchObject({
      values: {
        hostCpuCapacityAvailableLastMHz: null,
        hostMemoryCapacityAvailableLastMiB: null,
        hostMaintenanceStateLast: "notInMaintenance",
      },
      derivedMetrics: { hostMaintenanceStateLast: true },
    });
    expect(result.issues.filter((issue) => issue.code === "missing-value")).toHaveLength(2);
    expect(result.issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  it("liefert strukturierte Fehler für fehlende Pflichtspalten und doppelte Header", () => {
    const missingRequired = parseVropsTimeSeriesCsv([
      '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg"',
      '"vm-01","2026-07-21T00:00:00Z","12.5"',
    ].join("\n"));
    const duplicateHeader = parseVropsTimeSeriesCsv([
      '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max","VM|CPU|Ready (%)|Max"',
      '"vm-01","2026-07-21T00:00:00Z","12.5","0.1","0.1"',
    ].join("\n"));

    expect(missingRequired.rows).toEqual([]);
    expect(missingRequired.issues).toContainEqual(expect.objectContaining({
      code: "missing-required-column",
      severity: "error",
      details: { objectType: "vm" },
    }));
    expect(duplicateHeader.issues).toContainEqual(expect.objectContaining({ code: "duplicate-header", severity: "error" }));
  });

  it("meldet ungültige Zahlen, negative Werte, unbekannte Einheiten und Prozentbereiche strukturiert", () => {
    const invalidNumber = [
      VM_HEADER,
      '"vm-01","2026-07-21T00:00:00Z","1.234,56","0.1"',
      '"vm-02","2026-07-21T00:00:00Z","-1","0.1"',
      '"vm-03","2026-07-21T00:00:00Z","12 widgets","101"',
    ].join("\n");

    expect(errorCodes(invalidNumber)).toEqual(expect.arrayContaining([
      "invalid-number",
      "negative-value",
      "unknown-unit",
      "percentage-out-of-range",
    ]));
  });

  it("erkennt doppelte Objekt-/Zeitpunkt-Kombinationen und Stundenlücken", () => {
    const result = parseVropsTimeSeriesCsv([
      VM_HEADER,
      '"vm-01","2026-07-21T00:00:00Z","1","0.1"',
      '"vm-01","2026-07-21T00:00:00Z","2","0.2"',
      '"vm-01","2026-07-21T02:00:00Z","3","0.3"',
    ].join("\n"));

    expect(result.issues).toContainEqual(expect.objectContaining({ code: "duplicate-object-timestamp", severity: "error" }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "hour-gap", severity: "error" }));
  });

  it("akzeptiert 167 und 169 aufeinanderfolgende UTC-Stunden, ohne starr 168 Slots zu erzwingen", () => {
    const buildRows = (count: number) => Array.from({ length: count }, (_, index) => {
      const timestamp = new Date(Date.UTC(2026, 2, 22, index)).toISOString().replace(".000Z", "Z");
      return `"vm-${count}","${timestamp}","1","0.1"`;
    });
    const result167 = parseVropsTimeSeriesCsv([VM_HEADER, ...buildRows(167)].join("\n"));
    const result169 = parseVropsTimeSeriesCsv([VM_HEADER, ...buildRows(169)].join("\n"));

    expect(result167.rows).toHaveLength(167);
    expect(result169.rows).toHaveLength(169);
    expect(result167.issues.map((issue) => issue.code)).not.toContain("hour-gap");
    expect(result169.issues.map((issue) => issue.code)).not.toContain("hour-gap");
  });

  it("behandelt Zeitumstellungen bei mit Offset versehenen Zeitstempeln als lückenlose UTC-Reihe", () => {
    const result = parseVropsTimeSeriesCsv([
      VM_HEADER,
      '"vm-01","2026-03-29T01:00:00+01:00","1","0.1"',
      '"vm-01","2026-03-29T03:00:00+02:00","1","0.1"',
    ].join("\n"));

    expect(result.issues.map((issue) => issue.code)).not.toContain("hour-gap");
    expect(result.rows.map((row) => row.intervalStartUtc)).toEqual([
      Date.parse("2026-03-29T00:00:00Z"),
      Date.parse("2026-03-29T01:00:00Z"),
    ]);
  });

  it("meldet unzulässige CSV- und Plausibilitätsfehler statt beim ersten Problem abzubrechen", () => {
    const malformedCsv = parseVropsTimeSeriesCsv(`${VM_HEADER}\n"vm-01","2026-07-21T00:00:00Z","1","0.1`);
    const maximumBelowAverage = parseVropsTimeSeriesCsv([
      CLUSTER_HEADER,
      '"CL-01","2026-07-21T00:00:00Z","10","9","100","90","1","0.5"',
    ].join("\n"));

    expect(malformedCsv.issues).toContainEqual(expect.objectContaining({ code: "unclosed-quote", severity: "error" }));
    expect(maximumBelowAverage.issues.filter((issue) => issue.code === "maximum-below-average")).toHaveLength(3);
  });
});
