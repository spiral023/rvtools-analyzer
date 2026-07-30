import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostLoadMap } from "@/components/hosts/HostLoadMap";
import type { NormalizedHost, SheetRow, SnapshotMeta } from "@/domain/models/types";

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const snapshot: SnapshotMeta = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  vcenterDisplayName: "vCenter Wien",
  exportTs: "2026-07-30T10:00:00.000Z",
  importedAt: "2026-07-30T10:05:00.000Z",
  fileName: "rvtools.xlsx",
  fileChecksum: "checksum",
  sheetStats: {},
};

function host(index: number): NormalizedHost {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    hostKey: `host-${index}::vc-1`,
    host: `host-${String(index).padStart(3, "0")}.example.at`,
    cluster: `Cluster ${Math.floor(index / 25) + 1}`,
    datacenter: "Wien",
    cpuModel: "Xeon",
    cpuTotalMHz: 100_000,
    cpuCores: 32,
    cpuThreads: 64,
    memoryTotalMiB: 512_000,
    version: "8.0.3",
    build: "123",
    vendor: "Dell",
    model: "R760",
    connectionState: "connected",
    powerState: "poweredOn",
    maintenanceMode: "False",
    vmCount: 20,
  };
}

function raw(index: number): SheetRow {
  return {
    snapshotId: "snap-1",
    sheetName: "vHost",
    rowIndex: index,
    data: {
      Host: `host-${String(index).padStart(3, "0")}.example.at`,
      "CPU usage %": index === 499 ? 91 : 30 + (index % 30),
      "Memory usage %": 40 + (index % 25),
      "# VMs": 20,
    },
  };
}

describe("HostLoadMap", () => {
  it("stellt auch 500 Hosts kompakt dar und priorisiert kritische Systeme", () => {
    const onHostClick = vi.fn();
    render(
      <HostLoadMap
        hosts={Array.from({ length: 500 }, (_, index) => host(index))}
        rawVHostRows={Array.from({ length: 500 }, (_, index) => raw(index))}
        snapshots={[snapshot]}
        filters={{ clusters: [], hosts: [], search: "" }}
        isLoading={false}
        onHostClick={onHostClick}
      />,
    );

    const tiles = screen.getAllByTestId("host-load-tile");
    expect(tiles).toHaveLength(500);
    expect(tiles[0]).toHaveAttribute("data-severity", "critical");
    expect(tiles[0]).toHaveAccessibleName(/host-499.*CPU 91/);

    fireEvent.click(tiles[0]);
    expect(onHostClick).toHaveBeenCalledWith(expect.objectContaining({ host: "host-499.example.at" }));
  });
});
