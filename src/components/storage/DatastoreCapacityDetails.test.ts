import { describe, expect, it } from "vitest";
import { buildDatastoreDetailRows } from "@/lib/datastoreDetails";
import type { NormalizedDatastore, NormalizedHost } from "@/domain/models/types";

const datastore: NormalizedDatastore = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  dsKey: "ds-1",
  name: "DS-Shared",
  clusterName: null,
  hostNames: [],
  type: "VMFS",
  capacityMiB: 1_000,
  inUseMiB: 500,
  freeMiB: 500,
  freePct: 50,
  version: "6",
  siocEnabled: true,
};

function host(name: string, cluster: string): NormalizedHost {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    hostKey: `${name}::vc-1`,
    host: name,
    cluster,
    datacenter: "DC1",
    cpuModel: null,
    cpuTotalMHz: null,
    cpuCores: null,
    cpuThreads: null,
    memoryTotalMiB: null,
    version: null,
    build: null,
    vendor: null,
    model: null,
    connectionState: null,
    powerState: null,
    maintenanceMode: null,
    vmCount: null,
  };
}

describe("buildDatastoreDetailRows", () => {
  it("löst alle verbundenen Compute-Cluster auf und bewahrt den Datastore Cluster separat", () => {
    const rows = buildDatastoreDetailRows(
      [datastore],
      [
        host("esx-01.example.at", "Compute-A"),
        host("esx-02.example.at", "Compute-B"),
        host("esx-03.example.at", "Compute-A"),
      ],
      [{
        snapshotId: "snap-1",
        sheetName: "vDatastore",
        rowIndex: 0,
        data: {
          Name: "DS-Shared",
          Hosts: "esx-01.example.at; ESX-02.EXAMPLE.AT, esx-03.example.at",
          "Datastore cluster name": "SDRS-Production",
        },
      }],
    );

    expect(rows[0]).toMatchObject({
      computeClusters: ["Compute-A", "Compute-B"],
      computeClusterCount: 2,
      datastoreClusterName: "SDRS-Production",
    });
  });
});
