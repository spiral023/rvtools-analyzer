import { describe, expect, it } from "vitest";
import { buildHardwareModelGroups } from "@/lib/hardwareVariants";
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
