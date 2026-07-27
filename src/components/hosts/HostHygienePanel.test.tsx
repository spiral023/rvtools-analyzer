import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useRawSheet: () => ({ data: [{ snapshotId: "snap-1", sheetName: "vHost", rowIndex: 0, data: { Host: "esx-a", "NTP Server(s)": "", "NTPD running": false, "DNS Servers": "", DHCP: true } }], isLoading: false }),
}));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: ({ data }: { data: unknown[] }) => <div>{data.map((row, index) => <div key={index}>{JSON.stringify(row)}</div>)}</div> }));

const { HostHygienePanel } = await import("./HostHygienePanel");

describe("HostHygienePanel", () => {
  it("zeigt NTP-, DNS- und DHCP-Auffälligkeiten", () => {
    render(<TooltipProvider><HostHygienePanel /></TooltipProvider>);
    expect(screen.getByText(/NTP\/DNS Hygiene/)).toBeInTheDocument();
    expect(screen.getByText(/Kein NTP/)).toBeInTheDocument();
    expect(screen.getByText(/DHCP aktiv/)).toBeInTheDocument();
  });
});
