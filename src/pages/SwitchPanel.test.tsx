import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwitchPanel } from "./SwitchPanel";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useAllSwitchLatest: () => ({
    data: [
      {
        switchInterfaceKey: "sw-core-01::eth1/1",
        hostnameNorm: "sw-core-01",
        hostname: "sw-core-01",
        interface: "Eth1/1",
        importedAt: "2026-07-15T00:00:00.000Z",
        switchImportId: "switch-1",
        rowIndex: 0,
        description: "esx01 vmnic0",
        status: "connected",
        mode: "trunk",
        duplex: "full",
        speed: "25G",
        transceiver: "SFP-H25GB-CU3M",
      },
      {
        switchInterfaceKey: "sw-core-01::eth1/2",
        hostnameNorm: "sw-core-01",
        hostname: "sw-core-01",
        interface: "Eth1/2",
        importedAt: "2026-07-15T00:00:00.000Z",
        switchImportId: "switch-1",
        rowIndex: 1,
        description: null,
        status: "notconnec",
        mode: "trunk",
        duplex: "auto",
        speed: "auto",
        transceiver: null,
      },
      {
        switchInterfaceKey: "sw-core-02::eth1/1",
        hostnameNorm: "sw-core-02",
        hostname: "sw-core-02",
        interface: "Eth1/1",
        importedAt: "2026-07-15T00:00:00.000Z",
        switchImportId: "switch-1",
        rowIndex: 2,
        description: "Firewall uplink",
        status: "connected",
        mode: "routed",
        duplex: "full",
        speed: "10G",
        transceiver: "SFP-10G-SR",
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ index: 0, start: 0, end: 36 }],
    getTotalSize: () => 36,
  }),
}));

describe("SwitchPanel", () => {
  it("zeigt für den gewählten Switch eine Frontplatten-Detailansicht", () => {
    render(<SwitchPanel />);

    expect(screen.getByRole("heading", { name: "Switch-Detail · sw-core-01" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eth1\/1 · connected · esx01 vmnic0/i })).toBeInTheDocument();
    expect(screen.getByText("2 Ports erfasst")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sw-core-02/i }));

    expect(screen.getByRole("heading", { name: "Switch-Detail · sw-core-02" })).toBeInTheDocument();
    expect(screen.getByText("Firewall uplink")).toBeInTheDocument();
    expect(screen.getByText("1 Port erfasst")).toBeInTheDocument();
  });
});
