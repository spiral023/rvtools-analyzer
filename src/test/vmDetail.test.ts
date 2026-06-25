import { describe, expect, it } from "vitest";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import {
  formatRvtoolsDate,
  matchRowsForVm,
  normalizeVmName,
  resolveVmDetailTarget,
  summarizeSnapshots,
  summarizeStorage,
} from "@/lib/vmDetail";

const baseVm: NormalizedVm = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  vmKey: "vm-1::vc-1",
  vmUuid: "uuid-1",
  vmName: "Srv-App-01",
  cluster: "Cluster-A",
  host: "esx01.local",
  powerState: "poweredOn",
  cpuCount: 4,
  memoryMiB: 8192,
  provisionedMiB: 102400,
  inUseMiB: 51200,
  configStatus: "green",
  connectionState: "connected",
  consolidationNeeded: false,
  osConfig: "Linux",
  osTools: "Linux",
  hwVersion: "21",
  toolsStatus: "toolsOk",
  toolsVersion: "12345",
  datacenter: "DC-1",
  folder: "/DC-1/vm",
  resourcePool: "Resources",
  annotation: null,
  cpuReady: 0,
  firmware: "efi",
  efiSecureBoot: true,
  cbt: true,
};

function row(snapshotId: string, vmName: string, data: Record<string, string | number | boolean | null>): SheetRow {
  return {
    snapshotId,
    sheetName: "vDisk",
    rowIndex: 0,
    data: {
      VM: vmName,
      ...data,
    },
  };
}

describe("vm detail helpers", () => {
  it("normalizes VM names case-insensitive", () => {
    expect(normalizeVmName("  Srv-App-01  ")).toBe("srv-app-01");
  });

  it("matches rows only by snapshotId + VM name", () => {
    const rows: SheetRow[] = [
      row("snap-1", "srv-app-01", { "Capacity MiB": 2048 }),
      row("snap-2", "srv-app-01", { "Capacity MiB": 1024 }),
      row("snap-1", "srv-db-01", { "Capacity MiB": 4096 }),
    ];

    const matches = matchRowsForVm(rows, baseVm);
    expect(matches).toHaveLength(1);
    expect(matches[0].snapshotId).toBe("snap-1");
    expect(matches[0].data["VM"]).toBe("srv-app-01");
  });

  it("resolves detail targets from direct and derived VM table rows", () => {
    const otherSnapshotVm = { ...baseVm, snapshotId: "snap-2", vmKey: "vm-2::vc-1" };
    const allVms = [baseVm, otherSnapshotVm];

    expect(resolveVmDetailTarget(baseVm, allVms)).toBe(baseVm);
    expect(resolveVmDetailTarget({ vmName: " srv-app-01 ", snapshotId: "snap-1" }, allVms)).toBe(baseVm);
    expect(resolveVmDetailTarget({ vm: "SRV-APP-01", snapshotId: "snap-2" }, allVms)).toBe(otherSnapshotVm);
    expect(resolveVmDetailTarget({ vm: "unknown" }, allVms)).toBeNull();
    expect(resolveVmDetailTarget({ host: "esx01.local" }, allVms)).toBeNull();
  });

  it("formats RVTools excel serial dates", () => {
    const formatted = formatRvtoolsDate(46061.3046875);
    expect(formatted).not.toBe("—");
    expect(formatted).not.toContain("46061");
  });

  it("formats ISO/string dates and falls back for invalid values", () => {
    expect(formatRvtoolsDate("2026-02-07T18:49:30.000Z")).not.toBe("—");
    expect(formatRvtoolsDate("not-a-date")).toBe("not-a-date");
    expect(formatRvtoolsDate(null)).toBe("—");
  });

  it("summarizes storage totals", () => {
    const rows: SheetRow[] = [
      row("snap-1", "srv-app-01", { "Capacity MiB": 2048 }),
      row("snap-1", "srv-app-01", { "Capacity MiB": "4096" }),
      row("snap-1", "srv-app-01", { "Capacity MiB": null }),
    ];
    const summary = summarizeStorage(rows);
    expect(summary.diskCount).toBe(3);
    expect(summary.totalCapacityMiB).toBe(6144);
  });

  it("summarizes snapshot totals", () => {
    const rows: SheetRow[] = [
      row("snap-1", "srv-app-01", { "Size MiB (total)": 512 }),
      row("snap-1", "srv-app-01", { "Size MiB (total)": "1024.5" }),
    ];
    const summary = summarizeSnapshots(rows);
    expect(summary.snapshotCount).toBe(2);
    expect(summary.totalSizeMiB).toBe(1536.5);
  });
});
