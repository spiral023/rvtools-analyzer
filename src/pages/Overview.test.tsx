import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterProvider } from "@/hooks/useFilterState";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NormalizedVm, SnapshotMeta } from "@/domain/models/types";

// Reproduziert den gemeldeten Bug: die snapshots-Query (wenige Metadaten-
// Einträge) löst sofort auf, aber die vms-Query (Zehntausende Zeilen über
// mehrere vCenter in der Praxis) braucht spürbar länger. Die Seite darf in
// dieser Lücke keine KPI-Ansicht mit "0 VMs" zeigen, sondern muss einen
// Ladezustand anzeigen.
const { deferredVms, resolveVms } = vi.hoisted(() => {
  let resolve!: (value: NormalizedVm[]) => void;
  const promise = new Promise<NormalizedVm[]>((res) => {
    resolve = res;
  });
  return { deferredVms: promise, resolveVms: resolve };
});

vi.mock("@/data/db", async () => {
  const actual = await vi.importActual<typeof import("@/data/db")>("@/data/db");
  return {
    ...actual,
    getBySnapshotIds: vi.fn((store: Parameters<typeof actual.getBySnapshotIds>[0], ids: string[]) => {
      if (store === "entities_vm") return deferredVms;
      return actual.getBySnapshotIds(store, ids);
    }),
  };
});

const { deleteAllData, putSnapshot } = await import("@/data/db");
const { default: Overview } = await import("@/pages/Overview");

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

beforeEach(async () => {
  await deleteAllData();
});

describe("Overview", () => {
  it("zeigt VM-KPIs und -Tabelle, aber keine übernommenen Clusterbereiche", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <FilterProvider>
              <Overview />
            </FilterProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // Wartet, bis die snapshots-Query sicher aufgelöst ist (in der Praxis nur
    // wenige Metadaten-Einträge, daher schnell) — die vms-Query bleibt wegen
    // deferredVms bewusst weiter offen (steht stellvertretend für Zehntausende
    // Zeilen über mehrere vCenter, die spürbar länger brauchen).
    await waitFor(() => {
      expect(queryClient.getQueryState(["snapshots"])?.status).toBe("success");
    });

    // In dieser Lücke darf keine KPI-Ansicht mit "0 VMs" erscheinen.
    expect(screen.queryByText("VMs Total")).not.toBeInTheDocument();

    resolveVms([]);

    await waitFor(() => {
      expect(screen.getByText("VMs Total")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Analysiert:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Virtuelle Maschinen \(0\)/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Betriebssysteme je Cluster/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Host-Verteilung je Cluster" })).not.toBeInTheDocument();
  });
});
