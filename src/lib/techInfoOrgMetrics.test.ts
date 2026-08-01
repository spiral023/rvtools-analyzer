import { describe, expect, it } from "vitest";
import type { VmRightsizingCandidate, VmWorkloadProfile } from "@/domain/models/types";
import { buildTechInfoOrgMetricsByVmName } from "@/lib/techInfoOrgMetrics";
import { metricStatsFixture, vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";

function profile(objectKey: string, vmName: string): VmWorkloadProfile {
  return vmWorkloadProfileFixture({
    objectKey,
    vmName,
    clusterKey: null,
    clusterName: null,
    hostKey: null,
    host: null,
    vcpu: 8,
    configuredCpuCapacityMHz: 8_000,
    configuredMemoryMiB: 16_384,
    demand: metricStatsFixture({ average: 800 }),
  });
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
