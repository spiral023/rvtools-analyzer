import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/domain/models/types";
import { buildAverageVm, type AverageVmSource } from "@/lib/averageVm";

function row(vm: string, data: Record<string, string | number | boolean | null>): SheetRow {
  return { snapshotId: "snap-1", sheetName: "sheet", rowIndex: 0, data: { VM: vm, ...data } };
}

describe("buildAverageVm", () => {
  it("returns null when no VMs are in scope", () => {
    expect(buildAverageVm({ vms: [], memoryRows: [], diskRows: [], partitionRows: [], networkRows: [] })).toBeNull();
  });

  it("averages CPU, memory, disks, partitions and NICs per VM", () => {
    const vms: AverageVmSource[] = [
      { cpuCount: 4, memoryMiB: 8192 },
      { cpuCount: 2, memoryMiB: 4096 },
    ];
    const memoryRows: SheetRow[] = [
      row("APP01", { Active: 1024, Consumed: 4096 }),
      row("APP02", { Active: 512, Consumed: 2048 }),
    ];
    const diskRows: SheetRow[] = [
      row("APP01", { "Capacity MiB": 40960 }),
      row("APP01", { "Capacity MiB": 20480 }),
      row("APP02", { "Capacity MiB": 10240 }),
    ];
    const partitionRows: SheetRow[] = [
      row("APP01", { "Capacity MiB": 40960, "Consumed MiB": 20480, "Free MiB": 20480 }),
      row("APP02", { "Capacity MiB": 10240, "Consumed MiB": 2560, "Free MiB": 7680 }),
    ];
    const networkRows: SheetRow[] = [row("APP01", {}), row("APP02", {}), row("APP02", {})];

    const avg = buildAverageVm({ vms, memoryRows, diskRows, partitionRows, networkRows });

    expect(avg).not.toBeNull();
    expect(avg?.vmCount).toBe(2);
    expect(avg?.cpuCores).toBe(3); // (4 + 2) / 2
    expect(avg?.memorySizeMiB).toBe(6144); // (8192 + 4096) / 2
    expect(avg?.memoryActiveMiB).toBe(768); // (1024 + 512) / 2
    expect(avg?.memoryConsumedMiB).toBe(3072); // (4096 + 2048) / 2
    expect(avg?.disksPerVm).toBe(1.5); // 3 rows / 2 VMs
    expect(avg?.diskProvisionedMiB).toBe(35840); // (40960 + 20480 + 10240) / 2
    expect(avg?.partitionsPerVm).toBe(1); // 2 rows / 2 VMs
    expect(avg?.partitionCapacityMiB).toBe(25600); // (40960 + 10240) / 2
    expect(avg?.partitionFreeMiB).toBe(14080); // (20480 + 7680) / 2
    expect(avg?.partitionFreePct).toBeCloseTo((28160 / 51200) * 100, 5); // aggregate free / capacity
    expect(avg?.nicsPerVm).toBe(1.5); // 3 rows / 2 VMs
  });

  it("treats missing numeric cells as zero and reports null free% without capacity", () => {
    const avg = buildAverageVm({
      vms: [{ cpuCount: null, memoryMiB: null }],
      memoryRows: [row("APP01", {})],
      diskRows: [],
      partitionRows: [row("APP01", { "Free MiB": 0 })],
      networkRows: [],
    });

    expect(avg?.cpuCores).toBe(0);
    expect(avg?.memorySizeMiB).toBe(0);
    expect(avg?.disksPerVm).toBe(0);
    expect(avg?.partitionFreePct).toBeNull();
  });
});
