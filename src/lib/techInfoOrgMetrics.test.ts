import { describe, expect, it } from "vitest";
import type { VmRightsizingCandidate, VmWorkloadProfile, VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { buildTechInfoOrgMetricsByVmName } from "@/lib/techInfoOrgMetrics";

function profile(objectKey: string, vmName: string): VmWorkloadProfile {
  const emptyStats: VmWorkloadProfileMetricStats = {
    expectedSlots: 168,
    sampleCount: 168,
    coverageRatio: 1,
    average: null,
    p50: null,
    p95: null,
    maximum: null,
  };
  return {
    objectKey,
    rvtoolsObjectKey: objectKey,
    vmName,
    clusterKey: null,
    clusterName: null,
    hostKey: null,
    host: null,
    vcpu: 8,
    configuredCpuCapacityMHz: 8_000,
    configuredMemoryMiB: 16_384,
    powerState: "poweredOn",
    workloadClass: "std",
    hourly: [],
    demand: { ...emptyStats, average: 800 },
    ready: emptyStats,
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    signals: {
      coefficientOfVariation: null,
      activeHourSharePct: null,
      dutyCyclePct: null,
      baselineRatio: null,
      utilizationP95Pct: null,
      dailyRepeatability: null,
      businessHoursConcentration: null,
      nightConcentration: null,
      weekendConcentration: null,
    },
  };
}

describe("buildTechInfoOrgMetricsByVmName", () => {
  it("verknüpft optionale Metriken über normalisierte eindeutige VM-Namen", () => {
    const result = buildTechInfoOrgMetricsByVmName(
      [profile("vm-1", " APP-01 ")],
      [{ objectKey: "vm-1", reclaimableVcpu: 2 } as VmRightsizingCandidate],
    );

    expect(result.get("app-01")).toEqual({
      cpuDemandAverageMHz: 800,
      configuredCpuCapacityMHz: 8_000,
      reclaimableVcpu: 2,
    });
  });

  it("lässt mehrdeutige VM-Namen aus verschiedenen vCenter aus", () => {
    const result = buildTechInfoOrgMetricsByVmName(
      [profile("vm-1", "APP-01"), profile("vm-2", "app-01")],
      [],
    );

    expect(result.has("app-01")).toBe(false);
  });
});
