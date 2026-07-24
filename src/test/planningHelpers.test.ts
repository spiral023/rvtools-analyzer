import { describe, expect, it } from "vitest";
import type { NormalizedCluster, NormalizedVm, Scenario, SheetRow, VropsLatest } from "@/domain/models/types";
import { computeWhatIf } from "@/domain/services/planningHelpers";
import { clusterScopeKey } from "@/lib/clusterIdentity";

function vropsLatest(overrides: Partial<VropsLatest>): VropsLatest {
  return {
    clusterNorm: "production", clusterName: "Production", importedAt: "2026-07-24T00:00:00.000Z",
    vropsImportId: "vrops-1", capturedAt: null,
    ramUsageHighPct: null, ramAssignedHighPct: null, clusterRamAssignedPct: null,
    cpuUsageHighPct: null, clusterCpuUsagePct: null, avgVmsPerHost: null, cpuOvercommitRatio: null,
    ...overrides,
  };
}

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

function cluster(vcenterId: string, name = "Production", totalMemoryMiB = 100000): NormalizedCluster {
  return {
    snapshotId: `snap-${vcenterId.slice(-1)}`,
    vcenterId,
    clusterKey: clusterScopeKey(vcenterId, "DC1", name),
    name,
    datacenter: "DC1",
    haEnabled: null,
    drsEnabled: null,
    numHosts: 1,
    numCpuCores: 10,
    numCpuThreads: 20,
    totalMemoryMiB,
    totalCpuMHz: null,
    numEffectiveHosts: 1,
  };
}

function hostRow(snapshotId: string, host: string, vmCount: number, clusterName = "Production"): SheetRow {
  return {
    snapshotId,
    sheetName: "vHost",
    rowIndex: 0,
    data: {
      Cluster: clusterName, Datacenter: "DC1", Host: host,
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

  it("projiziert die HIGH-RP-RAM-Zuweisung und die Site-Failover-Ampel beim Verschieben einer HIGH-RP-VM", () => {
    const targetKey = clusterScopeKey("vc-b", "DC1", "Beta");
    const scenario: Scenario = {
      id: "scn-2", name: "Move High", type: "cluster-migration",
      createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z",
      vcenterScope: ["vc-a", "vc-b"],
      groups: [{ id: "grp-1", label: null, targetClusterKey: targetKey, vmKeys: ["vm-1"] }],
      notes: null,
    };
    const highVm = vm({
      cluster: "Alpha", vcenterId: "vc-a", memoryMiB: 10000,
      resourcePool: "/LNZ9910/CL_Alpha/Resources/HIGH",
    });

    const result = computeWhatIf(
      scenario,
      [highVm],
      [hostRow("snap-a", "esx-a", 5, "Alpha"), hostRow("snap-b", "esx-b", 7, "Beta")],
      [cluster("vc-a", "Alpha"), cluster("vc-b", "Beta")],
      new Map([["snap-a", "vc-a"], ["snap-b", "vc-b"]]),
      [
        vropsLatest({ clusterNorm: "alpha", clusterName: "Alpha", ramAssignedHighPct: 40 }),
        vropsLatest({ clusterNorm: "beta", clusterName: "Beta", ramAssignedHighPct: 38 }),
      ],
    );

    const alpha = result.clusters.find((entry) => entry.clusterName === "Alpha");
    const beta = result.clusters.find((entry) => entry.clusterName === "Beta");

    expect(alpha).toMatchObject({
      vropsRamAssignedHighPctBefore: 40, vropsRamAssignedHighPctAfter: 30,
      siteFailoverRiskBefore: "ok", siteFailoverRiskAfter: "ok",
    });
    expect(beta).toMatchObject({
      vropsRamAssignedHighPctBefore: 38, vropsRamAssignedHighPctAfter: 48,
      siteFailoverRiskBefore: "ok", siteFailoverRiskAfter: "warn",
    });
  });

  it("lässt VMs außerhalb der HIGH/STD-Pools die HIGH-RP-RAM-Projektion unberührt", () => {
    const targetKey = clusterScopeKey("vc-b", "DC1", "Beta");
    const scenario: Scenario = {
      id: "scn-3", name: "Move Unclassified", type: "cluster-migration",
      createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z",
      vcenterScope: ["vc-a", "vc-b"],
      groups: [{ id: "grp-1", label: null, targetClusterKey: targetKey, vmKeys: ["vm-1"] }],
      notes: null,
    };
    const stdVm = vm({ cluster: "Alpha", vcenterId: "vc-a", memoryMiB: 10000, resourcePool: "/LNZ9910/CL_Alpha/Resources" });

    const result = computeWhatIf(
      scenario,
      [stdVm],
      [hostRow("snap-a", "esx-a", 5, "Alpha"), hostRow("snap-b", "esx-b", 7, "Beta")],
      [cluster("vc-a", "Alpha"), cluster("vc-b", "Beta")],
      new Map([["snap-a", "vc-a"], ["snap-b", "vc-b"]]),
      [vropsLatest({ clusterNorm: "alpha", clusterName: "Alpha", ramAssignedHighPct: 40 })],
    );

    const alpha = result.clusters.find((entry) => entry.clusterName === "Alpha");
    expect(alpha).toMatchObject({ vropsRamAssignedHighPctBefore: 40, vropsRamAssignedHighPctAfter: 40 });
  });
});
