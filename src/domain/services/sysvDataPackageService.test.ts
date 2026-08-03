import { describe, expect, it } from "vitest";
import type { VropsTimeSeriesChunk } from "@/domain/models/types";
import { sliceVropsTimeSeriesChunk } from "@/domain/services/sysvDataPackageService";

function chunk(): VropsTimeSeriesChunk {
  return {
    importId: "vrops-1",
    objectType: "vm",
    chunkKey: "chunk-1",
    clusterKey: null,
    startUtc: 0,
    slotCount: 2,
    objectKeys: ["vm-a", "vm-b", "vm-c"],
    metricValues: {
      vmCpuDemandAvgMHz: new Float32Array([1, 2, 3, 4, 5, 6]).buffer,
    },
    maintenanceCodes: Uint8Array.from([10, 11, 12, 13, 14, 15]).buffer,
    maintenanceLexicon: ["maintenance"],
    maintenanceDerived: Uint8Array.from([1, 0, 1, 0, 1, 0]).buffer,
    maintenanceStates: ["a", "b", "c", "d", "e", "f"],
  };
}

describe("SysV-vROps-Chunk-Slicing", () => {
  it("übernimmt nur ausgewählte Objektbereiche in der ursprünglichen Reihenfolge", () => {
    const result = sliceVropsTimeSeriesChunk(chunk(), new Set(["vm-c", "vm-a"]));

    expect(result?.objectKeys).toEqual(["vm-a", "vm-c"]);
    expect([...new Float32Array(result!.metricValues.vmCpuDemandAvgMHz!)]).toEqual([1, 2, 5, 6]);
    expect([...new Uint8Array(result!.maintenanceCodes!)]).toEqual([10, 11, 14, 15]);
    expect([...new Uint8Array(result!.maintenanceDerived!)]).toEqual([1, 0, 1, 0]);
  });

  it("verwirft nicht kodierte Legacy-Wartungszustände, statt sie erst beim Serialisieren abzulehnen", () => {
    const result = sliceVropsTimeSeriesChunk(chunk(), new Set(["vm-a"]));

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("maintenanceStates");
  });

  it("verwirft leere Chunks und lehnt falsche Float32-Längen ab", () => {
    expect(sliceVropsTimeSeriesChunk(chunk(), new Set(["vm-x"]))).toBeNull();
    const invalid = { ...chunk(), metricValues: { vmCpuDemandAvgMHz: new Float32Array([1, 2, 3]).buffer } };
    expect(() => sliceVropsTimeSeriesChunk(invalid, new Set(["vm-a"]))).toThrow(/falsche Quelllänge/);
  });

  it("exportiert keine Nicht-VM-Chunks", () => {
    expect(sliceVropsTimeSeriesChunk({ ...chunk(), objectType: "host" }, new Set(["vm-a"]))).toBeNull();
  });
});
