import { describe, expect, it } from "vitest";
import type { NormalizedVm, VropsTimeSeriesChunk } from "@/domain/models/types";
import {
  describeScopedVropsSource,
  matchScopeVmsToRvtools,
  sliceVropsTimeSeriesChunk,
  toManifestWarnings,
} from "@/domain/services/sysvDataPackageService";
import { mergeVropsTimeSeriesChunksWithWarnings } from "@/lib/export/sysvDataPackageFormat";
import { findVropsTimeSeriesMetricHeader } from "@/domain/services/vropsTimeSeriesSchema";

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

describe("SysV-vROps-Quellangabe", () => {
  it("beschreibt den beschnittenen Paketinhalt statt der ursprünglichen CSV-Metadaten", () => {
    const sliced = sliceVropsTimeSeriesChunk(chunk(), new Set(["vm-a", "vm-b"]))!;

    const [file] = describeScopedVropsSource("sysv-abc", [sliced]);

    // 2 Objekte × 2 Slots × 4 Byte Float32 + 4 Byte Codes + 4 Byte Derived.
    expect(file.fileSizeBytes).toBe(24);
    expect(file.rowCount).toBe(4);
    expect(file.columnCount).toBe(1);
    // Spaltenname, nicht interner Schlüssel: Sonst erkennt `findVropsTimeSeriesMetricHeader`
    // die enthaltene Metrik nicht wieder und Ansichten halten sie für nicht importiert.
    expect(file.detectedColumns).toEqual(["VM|CPU|Demand (MHz)|Avg"]);
    expect(file.fileChecksum).toBe("sysv-abc");
    expect(file.objectType).toBe("vm");
    expect(file.status).toBe("accepted");
  });

  it("macht die RAM-Metrik eines Pakets für die Metrikerkennung auffindbar", () => {
    // Regression: Standen hier interne Schlüssel, fand `findVropsTimeSeriesMetricHeader`
    // die Memory-Workload-Reihe nicht und der RAM-Rightsizing-Tab blieb nach einem
    // SysV-Paketimport leer, obwohl die Werte in den Chunks lagen.
    const withMemory: VropsTimeSeriesChunk = {
      ...chunk(),
      metricValues: {
        vmCpuDemandAvgMHz: new Float32Array([1, 2, 3, 4, 5, 6]).buffer,
        vmMemoryWorkloadAvgPct: new Float32Array([7, 8, 9, 10, 11, 12]).buffer,
      },
    };

    const [file] = describeScopedVropsSource("sysv-ram", [withMemory]);

    expect(findVropsTimeSeriesMetricHeader(file.detectedColumns, "vmMemoryWorkloadAvgPct")).toBeDefined();
    expect(findVropsTimeSeriesMetricHeader(file.detectedColumns, "vmCpuDemandAvgMHz")).toBeDefined();
  });

  it("meldet ein Paket ohne Zeitreihen als leer statt mit Fremdwerten", () => {
    const [file] = describeScopedVropsSource("sysv-leer", []);

    expect(file.fileSizeBytes).toBe(0);
    expect(file.rowCount).toBe(0);
    expect(file.detectedColumns).toEqual([]);
  });
});

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

describe("SysV-vROps-Chunk-Merge", () => {
  it("vereinigt Objektkeys, füllt fehlende Float32-Werte mit NaN und Wartungscodes mit 0", () => {
    const result = mergeVropsTimeSeriesChunksWithWarnings([
      {
        ...chunk(),
        objectKeys: ["vm-a", "vm-b"],
        metricValues: { vmCpuDemandAvgMHz: new Float32Array([1, 2, 3, 4]).buffer },
        maintenanceCodes: Uint8Array.from([1, 2, 3, 4]).buffer,
        maintenanceDerived: Uint8Array.from([1, 0, 1, 0]).buffer,
      },
      {
        ...chunk(),
        objectKeys: ["vm-c"],
        metricValues: { vmCpuDemandAvgMHz: new Float32Array([5, 6]).buffer },
        maintenanceCodes: undefined,
        maintenanceDerived: Uint8Array.from([0, 1]).buffer,
      },
    ], "sysv-merge:test:vrops");

    expect(result.warnings).toEqual([]);
    expect(result.chunks[0].objectKeys).toEqual(["vm-a", "vm-b", "vm-c"]);
    expect([...new Float32Array(result.chunks[0].metricValues.vmCpuDemandAvgMHz!)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...new Uint8Array(result.chunks[0].maintenanceCodes!)]).toEqual([1, 2, 3, 4, 0, 0]);
  });

  it("verwirft Wartungscodes bei inkompatiblen Lexika und lehnt widersprüchliche Zeitachsen ab", () => {
    const first = { ...chunk(), maintenanceLexicon: ["planned"] };
    const second = { ...chunk(), maintenanceLexicon: ["unplanned"], objectKeys: ["vm-c", "vm-d", "vm-e"] };
    const result = mergeVropsTimeSeriesChunksWithWarnings([first, second]);

    expect(result.warnings[0]).toContain("unterschiedlicher Lexika");
    expect(result.chunks[0].maintenanceCodes).toBeUndefined();
    expect(() => mergeVropsTimeSeriesChunksWithWarnings([{ ...first, startUtc: 3600 }, second])).toThrow(/widersprüchliche Zeitachsen/);
  });
});
