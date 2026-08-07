import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NormalizedHost } from "@/domain/models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { clusters: [] as string[], hosts: [] as string[], search: "" }, snapshotsLoading: false }),
  useHosts: () => ({ data: [] as NormalizedHost[], isLoading: false }),
  useRawSheet: () => ({ data: [] as unknown[], isLoading: false }),
}));

const appMode = vi.fn<() => { mode: string; isHydrated: boolean } | null>();

vi.mock("@/hooks/useAppMode", () => ({
  useOptionalAppMode: () => appMode(),
}));

vi.mock("@/hooks/useHostDetailDialog", () => ({
  useHostDetailDialog: () => ({ openHostDetail: vi.fn(), hostDetailDialog: <></> }),
}));

vi.mock("@/components/hosts/HostLoadMap", () => ({
  HostLoadMap: () => <div>Host Load Map</div>,
}));

vi.mock("@/components/hosts/HostInventoryPanel", () => ({
  HostInventoryPanel: () => <div>Host Inventar</div>,
}));

vi.mock("@/components/hosts/HostHygienePanel", () => ({
  HostHygienePanel: () => <div>Host-Hygiene</div>,
}));

vi.mock("@/components/vmware-versions/VmwareReleaseTables", () => ({
  EsxiVersionsTable: () => <div>Neueste ESXi Versionen</div>,
}));

vi.mock("@/pages/Hardware", () => ({
  HardwarePanel: () => <div>Varianten-Übersicht</div>,
}));

const { default: Hosts } = await import("./Hosts");

function renderHosts(initialEntry = "/hosts") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TooltipProvider><Hosts /></TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  appMode.mockReturnValue({ mode: "vm-admin", isHydrated: true });
});

describe("Hosts", () => {
  it("zeigt Host-Inventar und die neuesten ESXi-Versionen", () => {
    renderHosts();

    expect(screen.getByRole("heading", { name: "Hosts" })).toBeInTheDocument();
    expect(screen.getByText("ESXi Hosts")).toBeInTheDocument();
    expect(screen.getByText("Wartungsmodus")).toBeInTheDocument();
    expect(screen.getByText("Host Load Map")).toBeInTheDocument();
    expect(screen.getByText("Host Inventar")).toBeInTheDocument();
    expect(screen.getByText("Neueste ESXi Versionen")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("data-state", "active");
  });

  it("öffnet die Hardware-Analyse als Tab", () => {
    renderHosts();

    const hardwareTab = screen.getByRole("tab", { name: "Hardware" });
    fireEvent.mouseDown(hardwareTab);
    fireEvent.click(hardwareTab);

    expect(screen.getByText("Varianten-Übersicht")).toBeInTheDocument();
    expect(screen.queryByText("Host Inventar")).not.toBeInTheDocument();
  });

  it("öffnet den Hardware-Tab aus der URL", () => {
    renderHosts("/hosts?tab=hardware");

    expect(screen.getByRole("tab", { name: "Hardware" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Varianten-Übersicht")).toBeInTheDocument();
  });

  it("blendet die Hardware-Analyse im SysV-Modus aus und fängt Deep-Links ab", () => {
    appMode.mockReturnValue({ mode: "sysv", isHydrated: true });
    renderHosts("/hosts?tab=hardware");

    expect(screen.queryByRole("tab", { name: "Hardware" })).not.toBeInTheDocument();
    expect(screen.queryByText("Varianten-Übersicht")).not.toBeInTheDocument();
    expect(screen.getByText("Host Inventar")).toBeInTheDocument();
  });
});
