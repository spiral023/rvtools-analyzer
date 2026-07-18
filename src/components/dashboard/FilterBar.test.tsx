import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { FilterProvider } from "@/hooks/useFilterState";

vi.mock("@/data/db", () => ({
  getSnapshots: vi.fn().mockResolvedValue([
    {
      snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vcsa01.lab.local",
      exportTs: "2026-07-09T00:00:00.000Z", importedAt: "2026-07-09T00:00:00.000Z",
      fileName: "rvtools.xlsx", fileChecksum: "checksum-1", sheetStats: {},
    },
    {
      snapshotId: "snap-2", vcenterId: "vc-2", vcenterDisplayName: "vcsa02.lab.local",
      exportTs: "2026-07-09T00:00:00.000Z", importedAt: "2026-07-09T00:00:00.000Z",
      fileName: "rvtools-2.xlsx", fileChecksum: "checksum-2", sheetStats: {},
    },
  ]),
  getUiState: vi.fn().mockResolvedValue(undefined),
  putUiState: vi.fn().mockResolvedValue(undefined),
  getVcenterGroups: vi.fn().mockResolvedValue([]),
  putVcenterGroup: vi.fn().mockResolvedValue(undefined),
  deleteVcenterGroup: vi.fn().mockResolvedValue(undefined),
}));

describe("FilterBar", () => {
  it("does not render a snapshot selector", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <FilterProvider>
          <FilterBar />
        </FilterProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Alle vCenter")).toBeInTheDocument();
    expect(screen.queryByText("Alle Snapshots")).not.toBeInTheDocument();
  });

  it("ermöglicht Mehrfachauswahl von vCentern und zeigt die Auswahlanzahl", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <FilterProvider>
          <FilterBar />
        </FilterProvider>
      </QueryClientProvider>,
    );

    const trigger = await screen.findByRole("button", { name: "vCenter auswählen" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByText("vcsa01.lab.local"));
    fireEvent.click(await screen.findByText("vcsa02.lab.local"));

    expect(await screen.findByText("2 vCenter ausgewählt")).toBeInTheDocument();
  });
});
