import { describe, expect, it } from "vitest";
import type { NormalizedVm, VropsTimeSeriesChunk } from "@/domain/models/types";
import {
  matchScopeVmsToRvtools,
  sliceVropsTimeSeriesChunk,
  toManifestWarnings,
} from "@/domain/services/sysvDataPackageService";

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

function normalizedVm(vmName: string, vcenterId: string): NormalizedVm {
  return {
    snapshotId: `snapshot-${vcenterId}`,
    vcenterId,
    vmKey: `${vcenterId}::${vmName}`,
    vmName,
  } as NormalizedVm;
}

describe("SysV-Scope-Zuordnung zu RVTools", () => {
  it("überspringt mehrdeutige und fehlende Namen als Warnung, statt den Export zu blockieren", () => {
    const byName = new Map<string, NormalizedVm[]>([
      ["vm-a", [normalizedVm("vm-a", "vcenter-1")]],
      ["vm-b", [normalizedVm("vm-b", "vcenter-1"), normalizedVm("vm-b", "vcenter-2")]],
    ]);

    const result = matchScopeVmsToRvtools(["vm-a", "vm-b", "vm-c"], byName);

    expect(result.selectedVms.map((vm) => vm.vmKey)).toEqual(["vcenter-1::vm-a"]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["ambiguous-vm-name", "missing-rvtools-vm"]);
    expect(result.warnings[0].candidates?.map((candidate) => candidate.vcenterId)).toEqual(["vcenter-1", "vcenter-2"]);
  });

  it("gibt Manifestwarnungen ohne lokale Kandidatenverweise aus", () => {
    const manifestWarnings = toManifestWarnings([
      {
        code: "ambiguous-vm-name",
        message: "nicht eindeutig",
        vmName: "vm-b",
        candidates: [{ vmKey: "vcenter-2::vm-b", vmName: "vm-b", snapshotId: "snapshot-vcenter-2", vcenterId: "vcenter-2" }],
      },
      { code: "excluded-sheet", message: "vLicense ausgeschlossen", count: 3 },
    ]);

    expect(manifestWarnings).toEqual([
      { code: "ambiguous-vm-name", message: "nicht eindeutig" },
      { code: "excluded-sheet", message: "vLicense ausgeschlossen", count: 3 },
    ]);
  });
});
