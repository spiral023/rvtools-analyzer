import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CdpPanel } from "./CdpSwitchPorts";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CdpLatest } from "@/domain/models/types";

const { openHostDetail } = vi.hoisted(() => ({ openHostDetail: vi.fn() }));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({
    filters: { vcenterIds: [] as string[], clusters: [] as string[], hosts: [] as string[], search: "" },
  }),
  useAllCdpLatest: () => ({
    data: [
      {
        hostAdapterKey: "esx01.lab.local::vmnic0",
        hostNorm: "esx01.lab.local",
        host: "esx01.lab.local",
        adapter: "vmnic0",
        importedAt: "2026-07-15T00:00:00.000Z",
        cdpImportId: "cdp-1",
        rowIndex: 0,
        vcenter: "vcsa01.lab.local",
        cluster: "CL-Prod",
        hostConnectionState: "Connected",
        linkStatus: "Up",
        mac: "00:11:22:33:44:55",
        cdpDeviceId: "switch-01",
        cdpPortId: "Ethernet1/1",
        cdpMgmtIp: "10.0.0.1",
        cdpSwitchAddress: null,
        cdpPlatform: "N9K",
        cdpSoftware: null,
        nativeVlan: "10",
        mtu: "9000",
        cdpAvailable: true,
        queryStatus: "CDP-Daten gefunden",
      },
    ] as CdpLatest[],
  }),
}));

vi.mock("@/hooks/useHostDetailDialog", () => ({
  useHostDetailDialog: () => ({
    openHostDetail,
    hostDetailDialog: <div data-testid="host-detail-dialog" />,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ index: 0, start: 0, end: 36 }],
    getTotalSize: () => 36,
  }),
}));

describe("CdpPanel", () => {
  beforeEach(() => {
    openHostDetail.mockClear();
  });

  it("opens the ESXi detail dialog when a CDP host is clicked", () => {
    render(
      <TooltipProvider>
        <CdpPanel />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "esx01.lab.local" }));

    expect(openHostDetail).toHaveBeenCalledWith(expect.objectContaining({ host: "esx01.lab.local" }));
  });
});
