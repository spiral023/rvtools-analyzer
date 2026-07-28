import { describe, expect, it } from "vitest";
import type { CapacityPolicy, FillUpHost, FillUpHour, FillUpVm } from "@/domain/models/types";
import { createInitialCapacityPolicies } from "./capacityPolicyService";
import { analyzeFillUpCapacity, type FillUpCapacityEngineInput } from "./fillUpCapacityEngine";

const basePolicy = (): CapacityPolicy => ({
  ...createInitialCapacityPolicies("2026-07-28T00:00:00.000Z").find((policy) => policy.id === "standard-server-windows")!,
  cpuSafetyBufferPct: 0,
  ramSafetyBufferPct: 0,
  ramSystemReserveMiBPerHost: 0,
});

function host(hostKey: string, siteId = "site-1", fallbackCpuCapacityMHz = 100, fallbackMemoryCapacityMiB = 100): FillUpHost {
  return { hostKey, name: hostKey, siteId, cpuCores: 10, fallbackCpuCapacityMHz, fallbackMemoryCapacityMiB };
}

function vm(objectKey: string, workloadClass: FillUpVm["workloadClass"] = "high", configuredMemoryMiB = 10, fallbackCpuDemandMHz = 10): FillUpVm {
  return { objectKey, hostKey: "h1", workloadClass, powerState: "poweredOn", vcpu: 1, configuredMemoryMiB, fallbackCpuDemandMHz };
}

function hour(hosts: readonly FillUpHost[], demands: Record<string, number | null>, overrides: Partial<FillUpHour> = {}): FillUpHour {
  return {
    timestampUtc: 1,
    hostCapacities: Object.fromEntries(hosts.map((entry) => [entry.hostKey, { cpuCapacityMHz: 100, memoryCapacityMiB: 100 }])),
    clusterCpuDemandMHz: 10,
    clusterMemoryUtilizationMiB: 10,
    clusterCpuContentionPct: 0,
    vmCpuDemandMHzByVm: demands,
    vmCpuReadyPctByVm: Object.fromEntries(Object.keys(demands).map((key) => [key, 0])),
    ...overrides,
  };
}

function input(overrides: Partial<FillUpCapacityEngineInput> = {}): FillUpCapacityEngineInput {
  const hosts = overrides.hosts ?? [host("h1", "site-1"), host("h2", "site-2")];
  const vms = overrides.vms ?? [vm("vm:high")];
  return {
    policy: overrides.policy ?? basePolicy(),
    hosts,
    vms,
    hours: overrides.hours ?? [hour(hosts, { "vm:high": 10 })],
    confidence: overrides.confidence ?? "high",
    includeN2: overrides.includeN2,
  };
}

describe("analyzeFillUpCapacity", () => {
  it("simuliert einen homogenen 32-Host-Cluster vollständig für N-1, N-2 und beide Sites", () => {
    const hosts = Array.from({ length: 32 }, (_, index) => host(`h${index.toString().padStart(2, "0")}`, index < 16 ? "site-1" : "site-2"));
    const result = analyzeFillUpCapacity(input({ hosts, hours: [hour(hosts, { "vm:high": 10 })] }));

    expect(result.normal.status).toBe("green");
    expect(result.n1?.definition.removedHostKeys).toEqual(["h00"]);
    expect(result.n2?.definition.removedHostKeys).toEqual(["h00", "h01"]);
    expect(result.siteFailover).toHaveLength(2);
  });

  it("bestimmt bei heterogenen Hosts den ungünstigsten N-1-Ausfall", () => {
    const hosts = [host("h1", "site-1"), host("h2", "site-1"), host("h3", "site-2")];
    const result = analyzeFillUpCapacity(input({
      hosts,
      vms: [vm("vm:one", "high", 10, 75), vm("vm:two", "high", 10, 75)],
      hours: [hour(hosts, { "vm:one": 75, "vm:two": 75 }, { clusterCpuDemandMHz: 150, hostCapacities: { h1: { cpuCapacityMHz: 100, memoryCapacityMiB: 100 }, h2: { cpuCapacityMHz: 200, memoryCapacityMiB: 100 }, h3: { cpuCapacityMHz: 100, memoryCapacityMiB: 100 } } })],
    }));

    expect(result.n1?.definition.removedHostKeys).toEqual(["h2"]);
    expect(result.n1?.status).toBe("yellow");
  });

  it("kennzeichnet N-2 als informativ oder hart, ohne die Ausfallsimulation zu ändern", () => {
    const hosts = [host("h1", "site-1"), host("h2", "site-1"), host("h3", "site-2")];
    const advisory = analyzeFillUpCapacity(input({ hosts, hours: [hour(hosts, { "vm:high": 100 }, { clusterCpuDemandMHz: 100 })] }));
    const hard = analyzeFillUpCapacity(input({ policy: { ...basePolicy(), useN2AsHardLimit: true }, hosts, hours: [hour(hosts, { "vm:high": 100 }, { clusterCpuDemandMHz: 100 })] }));

    expect(advisory.n2).toMatchObject({ status: "red", definition: { hardLimit: false } });
    expect(hard.n2).toMatchObject({ status: "red", definition: { hardLimit: true } });
  });

  it.each([
    [79.9, "green"],
    [80, "yellow"],
    [99.9, "yellow"],
    [100, "red"],
  ] as const)("bewertet HIGH-CPU-Site-Failover bei %s %% als %s", (demand, expected) => {
    const policy = { ...basePolicy(), cpuDemandWarnPctNormal: 190, cpuDemandDangerPctNormal: 200, highCpuSiteWarnPct: 80, highCpuSiteDangerPct: 100 };
    const hosts = [host("h1", "site-1"), host("h2", "site-2")];
    const result = analyzeFillUpCapacity(input({ policy, hosts, vms: [vm("vm:high", "high", 10, demand), vm("vm:std", "std", 10, 200)], hours: [hour(hosts, { "vm:high": demand, "vm:std": 200 }, { clusterCpuDemandMHz: demand + 200 })] }));
    const finding = result.siteFailover[0].findings.find((entry) => entry.metricKey === "high-cpu-site");

    expect(finding?.status).toBe(expected);
  });

  it.each([
    [44.9, "green"],
    [45, "yellow"],
    [49.9, "yellow"],
    [50, "red"],
  ] as const)("bewertet HIGH-RAM-Site-Failover bei %s %% als %s", (memory, expected) => {
    const policy = { ...basePolicy(), highRamAssignedWarnPct: 45, highRamAssignedDangerPct: 50 };
    const hosts = [host("h1", "site-1"), host("h2", "site-2")];
    const result = analyzeFillUpCapacity(input({ policy, hosts, vms: [vm("vm:high", "high", memory, 10)], hours: [hour(hosts, { "vm:high": 10 })] }));
    const finding = result.siteFailover[0].findings.find((entry) => entry.metricKey === "high-ram-assigned");

    expect(finding?.status).toBe(expected);
  });

  it("meldet große VMs, blockiert aber nicht allein wegen der 50-%-Regel", () => {
    const hosts = [host("h1", "site-1"), host("h2", "site-2")];
    const result = analyzeFillUpCapacity(input({ hosts, vms: [vm("vm:large", "high", 60, 10)], hours: [hour(hosts, { "vm:large": 10 })] }));

    expect(result.normal.status).toBe("green");
    expect(result.normal.placement.oversizedVmKeys).toEqual(["vm:large"]);
    expect(result.normal.findings).toContainEqual(expect.objectContaining({ metricKey: "single-vm-host", status: "red" }));
  });

  it("verwendet die RVTools-Kapazität als gekennzeichneten Fallback", () => {
    const hosts = [host("h1", "site-1", 120, 200), host("h2", "site-2", 120, 200)];
    const result = analyzeFillUpCapacity(input({
      hosts,
      hours: [hour(hosts, { "vm:high": 10 }, { hostCapacities: { h1: { cpuCapacityMHz: null, memoryCapacityMiB: null }, h2: { cpuCapacityMHz: 120, memoryCapacityMiB: 200 } } })],
    }));

    expect(result.normal.usedRvtoolsFallback).toBe(true);
    expect(result.normal.cpuCapacityMHz).toBe(240);
    expect(result.normal.memoryCapacityMiB).toBe(400);
  });
});
