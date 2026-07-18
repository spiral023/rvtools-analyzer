import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAllData, putSnapshot } from "@/data/db";
import { FilterProvider } from "@/hooks/useFilterState";
import Networking from "@/pages/Networking";
import type { SnapshotMeta } from "@/domain/models/types";

vi.mock("@/pages/NetworkSecurity", () => ({ NetworkSecurityPanel: () => <div data-testid="panel-security" /> }));
vi.mock("@/pages/HostNetwork", () => ({ HostNetworkPanel: () => <div /> }));
vi.mock("@/pages/VlanUsage", () => ({ VlanUsagePanel: () => <div /> }));
vi.mock("@/pages/CdpSwitchPorts", () => ({ CdpPanel: () => <div /> }));
vi.mock("@/components/dashboard/FilterBar", () => ({ FilterBar: () => <div data-testid="filter-bar" /> }));
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div data-testid={`tooltip-${entry.term.toLowerCase().replace(/\s+/g, "-")}`} data-tooltip-term={entry.term}>{children}</div>
  ),
}));

function snapshot(snapshotId: string, vcenterId: string, exportTs: string): SnapshotMeta {
  return {
    snapshotId,
    vcenterId,
    vcenterDisplayName: vcenterId,
    exportTs,
    importedAt: exportTs,
    fileName: `${snapshotId}.xlsx`,
    fileChecksum: snapshotId,
    sheetStats: {},
  };
}

function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <FilterProvider>{children}</FilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await deleteAllData();
});

describe("Networking", () => {
  it("zeigt während des Ladens keinen 'Keine Daten'-Hinweis, sondern einen Ladezustand", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    render(<Networking />, { wrapper: Providers });

    // Solange die Snapshots noch aus IndexedDB geladen werden, darf kein
    // EmptyState erscheinen — das suggeriert fälschlich einen leeren Datenbestand.
    expect(screen.queryByText("Keine Daten")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Security & Policies" })).toBeInTheDocument();
    });
  });

  it("zeigt den 'Keine Daten'-Hinweis nach dem Laden, wenn keine Snapshots existieren", async () => {
    render(<Networking />, { wrapper: Providers });

    await waitFor(() => {
      expect(screen.getByText("Keine Daten")).toBeInTheDocument();
    });
  });

  it("erklärt die neuen Tabs IPAM, Cisco Switch und Kontrolle per Tooltip", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    render(<Networking />, { wrapper: Providers });

    await waitFor(() => {
      expect(screen.getByTestId("tooltip-ipam")).toHaveAttribute("data-tooltip-term", "IPAM");
      expect(screen.getByTestId("tooltip-cisco-switch")).toHaveAttribute("data-tooltip-term", "Cisco Switch");
      expect(screen.getByTestId("tooltip-kontrolle")).toHaveAttribute("data-tooltip-term", "Kontrolle");
    });
  });
});
