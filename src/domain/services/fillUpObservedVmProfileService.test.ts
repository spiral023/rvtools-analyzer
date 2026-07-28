import { describe, expect, it } from "vitest";
import { buildObservedVmProfiles } from "./fillUpObservedVmProfileService";

describe("buildObservedVmProfiles", () => {
  it("verdichtet Cluster und Resource Pools mit gewichteten CPU-Werten und konservativem P95", () => {
    const profiles = buildObservedVmProfiles({
      clusterKey: "cluster-1",
      clusterName: "Cluster 1",
      vms: [
        { objectKey: "vm-1", resourcePool: "HIGH-RP", workloadClass: "high", vcpu: 2, configuredMemoryMiB: 4_096 },
        { objectKey: "vm-2", resourcePool: "HIGH-RP", workloadClass: "high", vcpu: 4, configuredMemoryMiB: 8_192 },
        { objectKey: "vm-3", resourcePool: "STD-RP", workloadClass: "std", vcpu: 2, configuredMemoryMiB: 2_048 },
      ],
      cpuDemandByVm: new Map([
        ["vm-1", new Map([[0, 100], [1, 200]])],
        ["vm-2", new Map([[0, 300], [1, 400]])],
        ["vm-3", new Map([[0, 500], [1, Number.NaN]])],
      ]),
      cpuReadyByVm: new Map([
        ["vm-1", new Map([[0, 1], [1, 2]])],
        ["vm-2", new Map([[0, 3], [1, 4]])],
        ["vm-3", new Map([[0, 5]])],
      ]),
    });

    expect(profiles).toHaveLength(3);
    expect(profiles[0]).toMatchObject({
      scope: "cluster",
      vmCount: 3,
      vmWithCpuDemandCount: 3,
      averageVcpu: 8 / 3,
      averageConfiguredMemoryMiB: 14_336 / 3,
      averageCpuDemandMHz: 300,
      cpuDemandP95MHz: 500,
      cpuReadyP95Pct: 5,
      sampleCount: 5,
      suggestedWorkloadClass: "std",
    });
    expect(profiles[1]).toMatchObject({
      scope: "resource-pool",
      resourcePool: "HIGH-RP",
      vmCount: 2,
      averageCpuDemandMHz: 250,
      cpuDemandP95MHz: 400,
      suggestedWorkloadClass: "high",
    });
    expect(profiles[2]).toMatchObject({ resourcePool: "STD-RP", cpuDemandP95MHz: 500, suggestedWorkloadClass: "std" });
  });

  it("behält einen Resource Pool ohne Zeitreihen sichtbar und macht seine CPU-Werte leer", () => {
    const [cluster, unassigned] = buildObservedVmProfiles({
      clusterKey: "cluster-1",
      clusterName: "Cluster 1",
      vms: [{ objectKey: "vm-1", resourcePool: null, workloadClass: "unknown", vcpu: null, configuredMemoryMiB: null }],
      cpuDemandByVm: new Map(),
      cpuReadyByVm: new Map(),
    });

    expect(cluster).toMatchObject({ scope: "cluster", vmCount: 1, vmWithCpuDemandCount: 0, averageVcpu: null, cpuDemandP95MHz: null });
    expect(unassigned).toMatchObject({ scope: "resource-pool", resourcePool: null, sampleCount: 0, cpuReadyP95Pct: null });
  });
});
