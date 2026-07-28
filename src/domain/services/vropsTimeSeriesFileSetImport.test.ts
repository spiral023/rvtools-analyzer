import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";
import type { NormalizedCluster, NormalizedHost, NormalizedVm } from "@/domain/models/types";

const encoder = new TextEncoder();

function csvFile(name: string, content: string): File {
  const buffer = encoder.encode(content).buffer;
  return Object.assign(new File([content], name, { type: "text/csv" }), { arrayBuffer: async () => buffer.slice(0) });
}

beforeEach(() => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  class TimeSeriesWorkerStub {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage(message: { payload: { buffers: ArrayBuffer[] } }) {
      const decoder = new TextDecoder();
      this.onmessage?.({ data: { type: "VROPS_TIMESERIES_PARSE_COMPLETE", payload: { parsedFiles: message.payload.buffers.map((buffer) => parseVropsTimeSeriesCsv(decoder.decode(buffer))) } } } as MessageEvent);
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", TimeSeriesWorkerStub);
});

describe("importVropsTimeSeriesFileSet", () => {
  it("prüft den vollständigen Dateisatz im Worker, friert RVTools-Namensmatches ein und erkennt Re-Importe", async () => {
    const db = await import("@/data/db");
    const { importVropsTimeSeriesFileSet } = await import("./vropsTimeSeriesImportService");
    await db.putSnapshot({ snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "VC 1", exportTs: "2026-07-21T00:00:00.000Z", importedAt: "2026-07-21T01:00:00.000Z", fileName: "rvtools.xlsx", fileChecksum: "snap", sheetStats: {} });
    const rawDb = await db.getDb();
    await rawDb.put("entities_vm", { snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-key", vmName: "vm-01", cluster: "cluster-01", host: "esxsrv1-01", resourcePool: "/Resources/HIGH", powerState: "poweredOn" } as unknown as NormalizedVm);
    await rawDb.put("entities_host", { snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-key", host: "esxsrv1-01", cluster: "cluster-01" } as unknown as NormalizedHost);
    await rawDb.put("entities_cluster", { snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cluster-key", name: "cluster-01" } as unknown as NormalizedCluster);

    const files = {
      vm: csvFile("vm.csv", ['"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"', '"vm-01","2026-07-21T00:00:00Z","1","0.1"', '"vm-01","2026-07-21T01:00:00Z","2","0.2"'].join("\n")),
      cluster: csvFile("cluster.csv", ['"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max","Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max","Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"', '"cluster-01","2026-07-21T00:00:00Z","1","2","1024","2048","0.1","0.2"', '"cluster-01","2026-07-21T01:00:00Z","2","3","2048","4096","0.2","0.3"'].join("\n")),
      host: csvFile("host.csv", ['"Name","Interval Breakdown","Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last"', '"esxsrv1-01","2026-07-21T00:00:00Z","1000","2048"', '"esxsrv1-01","2026-07-21T01:00:00Z","1000","2048"'].join("\n")),
    };

    const result = await importVropsTimeSeriesFileSet(files, ["snap-1"]);

    expect(result).toMatchObject({ success: true, qualitySummary: { expectedSlots: 2, objectCountByType: { vm: 1, cluster: 1, host: 1 } } });
    const [stored] = await db.getVropsTimeSeriesImports();
    expect(stored.files.map((file) => file.objectType).sort()).toEqual(["cluster", "host", "vm"]);
    await expect(db.getVropsTimeSeriesObjects(stored.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ objectKey: "vm:vm-01", rvtoolsObjectKey: "vm-key", hostKey: "host-key", workloadClass: "high", powerState: "poweredOn", matchStatus: "matched" }),
      expect.objectContaining({ objectKey: "host:esxsrv1-01", siteId: "site-1", matchStatus: "matched" }),
    ]));
    await expect(db.getVropsTimeSeriesChunks(stored.id)).resolves.toHaveLength(3);

    const duplicate = await importVropsTimeSeriesFileSet(files, ["snap-1"]);
    expect(duplicate.success).toBe(false);
    expect(duplicate.errors[0]).toContain("bereits");
  });
});
