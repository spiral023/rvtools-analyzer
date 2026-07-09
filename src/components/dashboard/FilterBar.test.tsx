import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { FilterProvider } from "@/hooks/useFilterState";

vi.mock("@/data/db", () => ({
  getSnapshots: vi.fn().mockResolvedValue([{
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vcenterDisplayName: "vcsa01.lab.local",
    exportTs: "2026-07-09T00:00:00.000Z",
    importedAt: "2026-07-09T00:00:00.000Z",
    fileName: "rvtools.xlsx",
    fileChecksum: "checksum-1",
    sheetStats: {},
  }]),
  getUiState: vi.fn().mockResolvedValue(undefined),
  putUiState: vi.fn().mockResolvedValue(undefined),
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
});
