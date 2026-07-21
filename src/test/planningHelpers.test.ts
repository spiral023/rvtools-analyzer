import { describe, expect, it } from "vitest";
import type { NormalizedCluster, NormalizedVm, Scenario, SheetRow } from "@/domain/models/types";
import { computeWhatIf } from "@/domain/services/planningHelpers";
import { clusterScopeKey } from "@/lib/clusterIdentity";

function vm(overrides: Partial<NormalizedVm>): NormalizedVm {
  return {
    snapshotId: "snap-a", vcenterId: "vc-a", vmKey: "vm-1", vmUuid: null,
    vmName: "VM-1", cluster: "Production", host: "esx-a", powerState: "poweredOn",
    cpuCount: 2, memoryMiB: 4096, provisionedMiB: null, inUseMiB: null,
    configStatus: null, connectionState: null, consolidationNeeded: null,
    osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null,
    datacenter: "DC1", folder: null, resourcePool: null, annotation: null,
    cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
    ...overrides,
  };
}

function cluster(vcenterId: string): NormalizedCluster {
  return {
    snapshotId: `snap-${vcenterId.slice(-1)}`,
    vcenterId,
    clusterKey: clusterScopeKey(vcenterId, "DC1", "Production"),
    name: "Production",
    datacenter: "DC1",
    haEnabled: null,
    drsEnabled: null,
    numHosts: 1,
    numCpuCores: 10,
    numCpuThreads: 20,
    totalMemoryMiB: 100000,
    totalCpuMHz: null,
    numEffectiveHosts: 1,
  };
}

function hostRow(snapshotId: string, host: string, vmCount: number): SheetRow {
  return {
    snapshotId,
    sheetName: "vHost",
    rowIndex: 0,
    data: {
      Cluster: "Production", Datacenter: "DC1", Host: host,
      "# Cores": 10, "# Memory": 100000, "CPU usage %": 50, "Memory usage %": 60,
      "# VMs": vmCount, "# vCPUs": 10, vRAM: 40000, "VM Used memory": 20000,
      "VM Memory Swapped": 0, "VM Memory Ballooned": 0, "HT Available": true, "HT Active": true,
    },
  };
}

describe("computeWhatIf", () => {
  it("trennt gleichnamige Quell- und Zielcluster nach ihrem Scope-Key", () => {
    const sourceKey = clusterScopeKey("vc-a", "DC1", "Production");
    const targetKey = clusterScopeKey("vc-b", "DC1", "Production");
    const scenario: Scenario = {
      id: "scn-1", name: "Move", type: "cluster-migration",
      createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
      vcenterScope: ["vc-a", "vc-b"],
      groups: [{ id: "grp-1", label: null, targetClusterKey: targetKey, vmKeys: ["vm-1"] }],
      notes: null,
    };

    const result = computeWhatIf(
      scenario,
      [vm({})],
      [hostRow("snap-a", "esx-a", 5), hostRow("snap-b", "esx-b", 7)],
      [cluster("vc-a"), cluster("vc-b")],
      new Map([["snap-a", "vc-a"], ["snap-b", "vc-b"]]),
    );

    expect(result.totalMovedVms).toBe(1);
    expect(result.clusters).toEqual(expect.arrayContaining([
      expect.objectContaining({ clusterName: "Production", incomingVmCount: 0, outgoingVmCount: 1, before: expect.objectContaining({ totalVms: 5 }) }),
      expect.objectContaining({ clusterName: "Production", incomingVmCount: 1, outgoingVmCount: 0, before: expect.objectContaining({ totalVms: 7 }) }),
    ]));
    expect(new Set(result.clusters.map((entry) => entry.before.totalVms))).toEqual(new Set([5, 7]));
    expect(result.clusters).toHaveLength(2);
    expect(sourceKey).not.toBe(targetKey);
  });
});
