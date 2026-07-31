import { beforeAll, describe, expect, it } from "vitest";
import { parseVropsTimeSeriesMatrix, type VropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";
import { prepareVropsTimeSeriesPayloadFromMatrices } from "@/domain/services/vropsTimeSeriesImportService";

const VM_CSV = [
  '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"',
  '"vm-01","2026-07-21T00:00:00Z","100","0.1"',
  '"vm-01","2026-07-21T01:00:00Z","200","0.2"',
].join("\n");
const CLUSTER_CSV = [
  '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max","Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max","Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"',
  '"cluster-01","2026-07-21T00:00:00Z","100","120","1024","2048","0.1","0.2"',
  '"cluster-01","2026-07-21T01:00:00Z","200","220","2048","4096","0.2","0.3"',
].join("\n");
const HOST_CSV = [
  '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last","Host|Runtime|Maintenance State|Last"',
  '"host-01","2026-07-21T00:00:00Z","1000","2048","notInMaintenance"',
  '"host-01","2026-07-21T01:00:00Z","1000","2048","-"',
].join("\n");

async function matrixOf(csv: string): Promise<VropsTimeSeriesMatrix> {
  const result = await parseVropsTimeSeriesMatrix(new Blob([csv], { type: "text/csv" }));
  if (!result.matrix) throw new Error(`Matrix erwartet, Issues: ${JSON.stringify(result.issues)}`);
  return result.matrix;
}

let vm: VropsTimeSeriesMatrix;
let cluster: VropsTimeSeriesMatrix;
let host: VropsTimeSeriesMatrix;

beforeAll(async () => {
  [vm, cluster, host] = await Promise.all([matrixOf(VM_CSV), matrixOf(CLUSTER_CSV), matrixOf(HOST_CSV)]);
});

describe("prepareVropsTimeSeriesPayloadFromMatrices", () => {
  it("baut kompakte Object×Hour-Blöcke und Summaries ohne IndexedDB-Abhängigkeit", () => {
    const result = prepareVropsTimeSeriesPayloadFromMatrices({ vm, cluster, host });

    expect(result.errors).toEqual([]);
    const payload = result.payload!;
    expect(payload.expectedSlots).toBe(2);
    expect(payload.chunks).toHaveLength(3);
    const vmChunk = payload.chunks.find((chunk) => chunk.objectType === "vm")!;
    expect(vmChunk.objectKeys).toEqual(["vm:vm-01"]);
    expect(Array.from(new Float32Array(vmChunk.metricValues.vmCpuDemandAvgMHz!))).toEqual([100, 200]);
    const hostChunk = payload.chunks.find((chunk) => chunk.objectType === "host")!;
    // Der Zustand wird als Code plus Lexikon abgelegt statt als String je Zelle.
    expect(hostChunk.maintenanceLexicon).toEqual(["notInMaintenance"]);
    expect(Array.from(new Uint8Array(hostChunk.maintenanceCodes!))).toEqual([1, 1]);
    expect(Array.from(new Uint8Array(hostChunk.maintenanceDerived!))).toEqual([0, 1]);
    expect(payload.summaries.find((summary) => summary.objectKey === "vm:vm-01")?.metricStats.vmCpuDemandAvgMHz).toMatchObject({
      expectedSlots: 2,
      presentSlots: 2,
      minimum: 100,
      maximum: 200,
      average: 150,
    });
  });

  it("lehnt einen Dateisatz mit unterschiedlichen Zeitrastern vor der Persistenz ab", async () => {
    const hostWithDifferentGrid = await matrixOf([
      '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last"',
      '"host-01","2026-07-21T00:00:00Z","1000","2048"',
      '"host-01","2026-07-21T02:00:00Z","1000","2048"',
    ].join("\n"));

    const result = prepareVropsTimeSeriesPayloadFromMatrices({ vm, cluster, host: hostWithDifferentGrid });

    expect(result.payload).toBeUndefined();
    expect(result.errors).toContainEqual(expect.stringContaining("HOST-CSV passt nicht zur VM-CSV: 1 fehlende und 1 zusätzliche Stunde(n)"));
    expect(result.gridDiagnostics).toContainEqual(expect.objectContaining({
      objectType: "host",
      slotCount: 2,
      missingHourlySlots: 1,
      missingFromVmCount: 1,
      additionalToVmCount: 1,
      missingFromVmSamples: [Date.parse("2026-07-21T01:00:00Z")],
      additionalToVmSamples: [Date.parse("2026-07-21T02:00:00Z")],
    }));
  });

  it("weist eine Lücke in der VM-Referenz getrennt von Objekt-Teilzeiträumen aus", async () => {
    const [vmWithGap, clusterWithGap, hostWithGap] = await Promise.all([
      matrixOf([
        '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"',
        '"vm-01","2026-07-21T00:00:00Z","100","0.1"',
        '"vm-01","2026-07-21T02:00:00Z","200","0.2"',
      ].join("\n")),
      matrixOf([
        '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max","Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max","Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"',
        '"cluster-01","2026-07-21T00:00:00Z","100","120","1024","2048","0.1","0.2"',
        '"cluster-01","2026-07-21T02:00:00Z","200","220","2048","4096","0.2","0.3"',
      ].join("\n")),
      matrixOf([
        '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last"',
        '"host-01","2026-07-21T00:00:00Z","1000","2048"',
        '"host-01","2026-07-21T02:00:00Z","1000","2048"',
      ].join("\n")),
    ]);

    const result = prepareVropsTimeSeriesPayloadFromMatrices({ vm: vmWithGap, cluster: clusterWithGap, host: hostWithGap });

    expect(result.warnings).toEqual([]);
    expect(result.errors).toContain("VM-CSV enthält 1 Lücke(n) im Stundenraster.");
    expect(result.gridDiagnostics).toContainEqual(expect.objectContaining({
      objectType: "vm",
      missingHourlySlots: 1,
      missingFromVmCount: 0,
      additionalToVmCount: 0,
    }));
  });

  it("speichert objektindividuelle Teilzeiträume als Missing Values statt den ganzen Dateisatz abzulehnen", async () => {
    const vmWithTransientObject = await matrixOf([
      '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"',
      '"vm-01","2026-07-21T00:00:00Z","100","0.1"',
      '"vm-01","2026-07-21T01:00:00Z","200","0.2"',
      '"hotclone-01","2026-07-21T01:00:00Z","10","0.1"',
    ].join("\n"));

    const result = prepareVropsTimeSeriesPayloadFromMatrices({ vm: vmWithTransientObject, cluster, host });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(expect.stringContaining("VM-CSV enthält 1 Objekt(e) mit Teilzeitraum"));
    const vmChunk = result.payload!.chunks.find((chunk) => chunk.objectType === "vm")!;
    expect(Array.from(new Float32Array(vmChunk.metricValues.vmCpuDemandAvgMHz!))).toEqual([Number.NaN, 10, 100, 200]);
  });
});
