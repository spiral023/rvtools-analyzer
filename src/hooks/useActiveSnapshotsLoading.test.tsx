import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterProvider } from "@/hooks/useFilterState";
import type { NormalizedVm, SnapshotMeta } from "@/domain/models/types";

// Reproduziert den gemeldeten Bug: die snapshots-Query (10 Metadaten-Einträge)
// löst fast sofort auf, aber die vms-Query (Zehntausende Zeilen über mehrere
// vCenter) braucht spürbar länger. Seiten, die nur auf `snapshotsLoading`
// prüfen, rendern in dieser Lücke mit leeren Default-Arrays — sichtbar als
// "keine Daten", bis die VM-Query Sekunden später auflöst.
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
const { useBaseVms } = await import("@/hooks/useActiveSnapshots");

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

function Probe() {
  const { isLoading, vms } = useBaseVms();
  return (
    <>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="count">{vms.length}</div>
    </>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <FilterProvider>{children}</FilterProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  await deleteAllData();
});

describe("useBaseVms isLoading", () => {
  it("reports isLoading=true while the VM query is still fetching, then false once it resolves", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));

    render(<Probe />, { wrapper: Providers });

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    resolveVms([
      {
        snapshotId: "snap-1",
        vcenterId: "vc-1",
        vmKey: "snap-1-APP-01",
        vmUuid: "uuid-1",
        vmName: "APP-01",
        cluster: "CL-Prod",
        host: "esx01",
        powerState: "poweredOn",
        cpuCount: 2,
        memoryMiB: 4096,
        provisionedMiB: null,
        inUseMiB: null,
        configStatus: null,
        connectionState: null,
        consolidationNeeded: null,
        osConfig: null,
        osTools: null,
        hwVersion: null,
        toolsStatus: null,
        toolsVersion: null,
        datacenter: null,
        folder: null,
        resourcePool: null,
        annotation: null,
        cpuReady: null,
        firmware: null,
        efiSecureBoot: null,
        cbt: null,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
