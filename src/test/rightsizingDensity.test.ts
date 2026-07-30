import { describe, expect, it } from "vitest";
import type { VmRightsizingCandidate, VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { buildRightsizingDensityGrid } from "@/lib/rightsizingDensity";

function metricStats(): VmWorkloadProfileMetricStats {
  return { expectedSlots: 168, sampleCount: 168, coverageRatio: 1, average: null, p50: null, p95: null, maximum: null };
}

function candidate(overrides: Partial<VmRightsizingCandidate> & { objectKey: string }): VmRightsizingCandidate {
  return {
    vmName: overrides.objectKey,
    clusterKey: "cluster-1",
    clusterName: "Cluster A",
    hostName: "esx01",
    vcpu: 4,
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    demand: metricStats(),
    ready: metricStats(),
    mhzPerCore: 1_000,
    usedVcpuEquivalentP95: 1,
    usedVcpuEquivalentPeak: null,
    demandBasedVcpu: null,
    recommendationWithheldReason: null,
    recommendedVcpu: null,
    reclaimableVcpu: 0,
    flags: { manyVcpuLowDemand: false, highCpuReady: false },
    ...overrides,
  };
}

/** Zelle über Bandschlüssel suchen, damit die Tests unabhängig von der Rasterreihenfolge bleiben. */
function cellOf(grid: ReturnType<typeof buildRightsizingDensityGrid>, demandBandKey: string, vcpuBandKey: string) {
  const rowIndex = grid.demandBands.findIndex((band) => band.key === demandBandKey);
  const cell = grid.rows[rowIndex]?.find((entry) => entry.vcpuBandKey === vcpuBandKey);
  if (!cell) throw new Error(`Zelle ${demandBandKey}/${vcpuBandKey} nicht im Raster`);
  return cell;
}

describe("buildRightsizingDensityGrid", () => {
  it("zählt VMs in das Band ihrer vCPU-Anzahl und ihrer Auslastung", () => {
    // 2 von 8 vCPU = 25 % => Band 25–50 %, vCPU-Band 5–8.
    const grid = buildRightsizingDensityGrid([
      candidate({ objectKey: "vm-1", vcpu: 8, usedVcpuEquivalentP95: 2, reclaimableVcpu: 2 }),
      candidate({ objectKey: "vm-2", vcpu: 8, usedVcpuEquivalentP95: 2.4, reclaimableVcpu: 4, flags: { manyVcpuLowDemand: true, highCpuReady: false } }),
      candidate({ objectKey: "vm-3", vcpu: 1, usedVcpuEquivalentP95: 0.01 }),
    ]);

    const cell = cellOf(grid, "25-50", "5-8");
    expect(cell.vmCount).toBe(2);
    expect(cell.candidateKeys).toEqual(["vm-1", "vm-2"]);
    expect(cell.reclaimableVcpu).toBe(6);
    expect(cell.notableCount).toBe(1);
    expect(cellOf(grid, "0-2", "1").vmCount).toBe(1);
    expect(grid.vmCount).toBe(3);
    expect(grid.reclaimableVcpu).toBe(6);
    expect(grid.maxVmCount).toBe(2);
  });

  it("trennt an den Bandgrenzen: 90 %, 100 % und die vCPU-Sprünge", () => {
    const grid = buildRightsizingDensityGrid([
      candidate({ objectKey: "unter-90", vcpu: 4, usedVcpuEquivalentP95: 3.59 }),
      candidate({ objectKey: "genau-90", vcpu: 4, usedVcpuEquivalentP95: 3.6 }),
      candidate({ objectKey: "genau-100", vcpu: 4, usedVcpuEquivalentP95: 4 }),
      candidate({ objectKey: "ueber-100", vcpu: 4, usedVcpuEquivalentP95: 5 }),
    ]);

    expect(cellOf(grid, "50-90", "3-4").vmCount).toBe(1);
    expect(cellOf(grid, "90-100", "3-4").vmCount).toBe(1);
    expect(cellOf(grid, "ge-100", "3-4").vmCount).toBe(2);
  });

  it("überspringt VMs ohne vCPU-Angabe oder ohne berechenbaren Bedarf", () => {
    const grid = buildRightsizingDensityGrid([
      candidate({ objectKey: "ohne-vcpu", vcpu: null }),
      candidate({ objectKey: "vcpu-null", vcpu: 0 }),
      candidate({ objectKey: "ohne-demand", usedVcpuEquivalentP95: null }),
    ]);

    expect(grid.vmCount).toBe(0);
    expect(grid.maxVmCount).toBe(0);
    expect(grid.rows.every((row) => row.every((cell) => cell.vmCount === 0))).toBe(true);
  });

  it("schneidet leere vCPU-Bänder am oberen Ende ab, behält aber eine lesbare Skala", () => {
    const kleinerBestand = buildRightsizingDensityGrid([candidate({ objectKey: "vm-1", vcpu: 1, usedVcpuEquivalentP95: 0.5 })]);
    expect(kleinerBestand.vcpuBands.map((band) => band.key)).toEqual(["1", "2", "3-4"]);

    const grosserBestand = buildRightsizingDensityGrid([candidate({ objectKey: "vm-1", vcpu: 96, usedVcpuEquivalentP95: 10 })]);
    expect(grosserBestand.vcpuBands.at(-1)?.key).toBe("65+");
    expect(cellOf(grosserBestand, "10-25", "65+").vmCount).toBe(1);
    expect(grosserBestand.rows.every((row) => row.length === grosserBestand.vcpuBands.length)).toBe(true);
  });
});
