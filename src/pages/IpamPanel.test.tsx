import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IpamPanel } from "@/pages/IpamPanel";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useAllIpamLatest: () => ({
    data: [{ ipAddress: "10.0.0.10", status: "Used", name: "app-01", firstDiscovered: "2026-07-01" }],
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns }: { columns: Array<{ meta?: { info?: { term: string } } }> }) => (
    <div data-testid="ipam-table-columns">{columns.map((column) => column.meta?.info?.term ?? "").join("|")}</div>
  ),
}));
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div data-testid={`tooltip-${entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}>{children}</div>
  ),
}));

describe("IpamPanel", () => {
  it("erklärt alle IPAM-Kennzahlen per Tooltip", () => {
    render(<IpamPanel />);

    expect(screen.getByTestId("tooltip-ip-adressen-gesamt")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-belegte-ip-adressen")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-freie-ip-adressen")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-ip-adressen-mit-dns-name")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-ip-adressen-mit-discovery-daten")).toBeInTheDocument();
  });

  it("erklärt alle Spalten der IPAM-Tabelle", () => {
    render(<IpamPanel />);

    expect(screen.getByTestId("ipam-table-columns")).toHaveTextContent("IP-Adresse|DNS-Name|IPAM-Status|Adress-Typ|Nutzung|Erstmals erkannt|Zuletzt erkannt|Kommentar|Standort|MAC-Adresse|Betriebssystem|NetBIOS-Name|Gerätetypen|Offene Ports|Fingerprint");
  });
});
