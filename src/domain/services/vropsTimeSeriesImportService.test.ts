import { describe, expect, it } from "vitest";
import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";
import { prepareVropsTimeSeriesPayload } from "@/domain/services/vropsTimeSeriesImportService";

const vm = parseVropsTimeSeriesCsv([
  '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"',
  '"vm-01","2026-07-21T00:00:00Z","100","0.1"',
  '"vm-01","2026-07-21T01:00:00Z","200","0.2"',
].join("\n"));
const cluster = parseVropsTimeSeriesCsv([
  '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max","Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max","Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"',
  '"cluster-01","2026-07-21T00:00:00Z","100","120","1024","2048","0.1","0.2"',
  '"cluster-01","2026-07-21T01:00:00Z","200","220","2048","4096","0.2","0.3"',
].join("\n"));
const host = parseVropsTimeSeriesCsv([
  '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last","Host|Runtime|Maintenance State|Last"',
  '"host-01","2026-07-21T00:00:00Z","1000","2048","notInMaintenance"',
  '"host-01","2026-07-21T01:00:00Z","1000","2048","-"',
].join("\n"));

describe("prepareVropsTimeSeriesPayload", () => {
  it("baut kompakte Object×Hour-Blöcke und Summaries ohne IndexedDB-Abhängigkeit", () => {
    const result = prepareVropsTimeSeriesPayload({ vm, cluster, host });

    expect(result.errors).toEqual([]);
    const payload = result.payload!;
    expect(payload.expectedSlots).toBe(2);
    expect(payload.chunks).toHaveLength(3);
    const vmChunk = payload.chunks.find((chunk) => chunk.objectType === "vm")!;
    expect(vmChunk.objectKeys).toEqual(["vm:vm-01"]);
    expect(Array.from(new Float32Array(vmChunk.metricValues.vmCpuDemandAvgMHz!))).toEqual([100, 200]);
    const hostChunk = payload.chunks.find((chunk) => chunk.objectType === "host")!;
    expect(hostChunk.maintenanceStates).toEqual(["notInMaintenance", "notInMaintenance"]);
    expect(Array.from(new Uint8Array(hostChunk.maintenanceDerived!))).toEqual([0, 1]);
    expect(payload.summaries.find((summary) => summary.objectKey === "vm:vm-01")?.metricStats.vmCpuDemandAvgMHz).toMatchObject({
      expectedSlots: 2,
      presentSlots: 2,
      minimum: 100,
      maximum: 200,
      average: 150,
    });
  });

  it("lehnt einen Dateisatz mit unterschiedlichen Zeitrastern vor der Persistenz ab", () => {
    const hostWithDifferentGrid = parseVropsTimeSeriesCsv([
      '"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last"',
      '"host-01","2026-07-21T00:00:00Z","1000","2048"',
      '"host-01","2026-07-21T02:00:00Z","1000","2048"',
    ].join("\n"));

    const result = prepareVropsTimeSeriesPayload({ vm, cluster, host: hostWithDifferentGrid });

    expect(result.payload).toBeUndefined();
    expect(result.errors).toContainEqual(expect.stringContaining("HOST-CSV stimmt nicht mit der VM-CSV überein"));
  });
});
