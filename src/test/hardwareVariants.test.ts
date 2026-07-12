import { describe, expect, it } from "vitest";
import { buildHardwareModelGroups, buildVariantSummary, NO_CLUSTER_LABEL } from "@/lib/hardwareVariants";
import type { HostDetail } from "@/lib/conversion";

function host(overrides: Partial<HostDetail>): HostDetail {
  return {
    host: "esx01",
    datacenter: "dc1",
    cluster: "cluster-a",
    model: "PowerEdge R750",
    vendor: "Dell Inc.",
    serial: "",
    cpuModel: "Intel Xeon Gold 6338",
    cpuSockets: 2,
    coresPerCpu: 32,
    totalCores: 64,
    threads: 128,
    speedMHz: 2000,
    memoryMiB: 524288,
    esxVersion: "8.0.3",
    biosVendor: "",
    biosVersion: "",
    biosDate: "",
    vmCount: 0,
    nicCount: 0,
    hbaCount: 0,
    htActive: true,
    maintenanceMode: false,
    serviceTag: "",
    ...overrides,
  };
}

describe("buildHardwareModelGroups", () => {
  it("ignores RAM size by default when model and CPU profile match", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", memoryMiB: 524288 }),
      host({ host: "esx02", memoryMiB: 786432 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].memoryMiB).toBe(524288);
  });

  it("keeps different RAM sizes separate when RAM variants are enabled", () => {
    const groups = buildHardwareModelGroups(
      [
        host({ host: "esx01", memoryMiB: 524288 }),
        host({ host: "esx02", memoryMiB: 786432 }),
      ],
      { countRamAsVariant: true },
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.count)).toEqual([1, 1]);
  });

  it("merges small RAM deviations within one percent when RAM variants are enabled", () => {
    const groups = buildHardwareModelGroups(
      [
        host({ host: "esx01", memoryMiB: 1048576 }),
        host({ host: "esx02", memoryMiB: 1040000 }),
      ],
      { countRamAsVariant: true },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});

describe("buildVariantSummary", () => {
  it("aggregates totals across hosts with differing RAM", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", memoryMiB: 524288, vmCount: 40, cluster: "cluster-a" }),
      host({ host: "esx02", memoryMiB: 786432, vmCount: 25, cluster: "cluster-b" }),
    ]);
    expect(groups).toHaveLength(1);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.totalCores).toBe(128); // 64 Cores × 2 Hosts
    expect(summary.totalGhz).toBe(256); // 128 Cores × 2000 MHz / 1000
    expect(summary.totalRamMiB).toBe(524288 + 786432);
    expect(summary.totalVms).toBe(65);
    expect(summary.clusterNames).toEqual(["cluster-a", "cluster-b"]);
  });

  it("breaks totals down per cluster and labels hosts without cluster", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", cluster: "cluster-a", vmCount: 10 }),
      host({ host: "esx02", cluster: "cluster-a", vmCount: 20 }),
      host({ host: "esx03", cluster: null, vmCount: 5 }),
    ]);
    expect(groups).toHaveLength(1);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.clusterBreakdown).toEqual([
      { cluster: "cluster-a", hosts: 2, cores: 128, ramMiB: 2 * 524288, vms: 30 },
      { cluster: NO_CLUSTER_LABEL, hosts: 1, cores: 64, ramMiB: 524288, vms: 5 },
    ]);
  });

  it("handles a single-host group", () => {
    const groups = buildHardwareModelGroups([
      host({ host: "esx01", vmCount: 12 }),
    ]);

    const summary = buildVariantSummary(groups[0]);
    expect(summary.totalCores).toBe(64);
    expect(summary.totalGhz).toBe(128);
    expect(summary.totalRamMiB).toBe(524288);
    expect(summary.totalVms).toBe(12);
    expect(summary.clusterBreakdown).toEqual([
      { cluster: "cluster-a", hosts: 1, cores: 64, ramMiB: 524288, vms: 12 },
    ]);
  });
});
