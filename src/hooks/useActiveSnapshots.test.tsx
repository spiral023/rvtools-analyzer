import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { batchPut, deleteAllData, putSnapshot } from "@/data/db";
import { FilterProvider, useFilterState } from "@/hooks/useFilterState";
import { useActiveSnapshotIds, useHealthEvents, useVms } from "@/hooks/useActiveSnapshots";
import type { FilterState, NormalizedHealth, NormalizedVm, SnapshotMeta } from "@/domain/models/types";

function snapshot(
  snapshotId: string,
  vcenterId: string,
  exportTs: string,
): SnapshotMeta {
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

function vm(snapshotId: string, vmName: string, cluster: string, host = "esx01"): NormalizedVm {
  return {
    snapshotId,
    vcenterId: "vc-1",
    vmKey: `${snapshotId}-${vmName}`,
    vmUuid: `${snapshotId}-${vmName}-uuid`,
    vmName,
    cluster,
    host,
    powerState: "poweredOn",
    cpuCount: 2,
    memoryMiB: 4096,
    provisionedMiB: null,
    inUseMiB: null,
    configStatus: null,
    connectionState: null,
    consolidationNeeded: null,
    osConfig: "Windows Server",
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
  };
}

function vmWith(snapshotId: string, vmName: string, cluster: string, overrides: Partial<NormalizedVm>): NormalizedVm {
  return {
    ...vm(snapshotId, vmName, cluster),
    ...overrides,
  };
}

function health(snapshotId: string, entity: string): NormalizedHealth {
  return {
    snapshotId,
    vcenterId: "vc-1",
    entity,
    messageType: "Warning",
    message: `${entity} alarm`,
  };
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <FilterProvider>{children}</FilterProvider>
    </QueryClientProvider>
  );
}

function Probe({ filters }: { filters?: Partial<FilterState> }) {
  const { setFilters } = useFilterState();
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: healthEvents = [] } = useHealthEvents();

  useEffect(() => {
    if (filters) setFilters(filters);
  }, [filters, setFilters]);

  return (
    <>
      <div data-testid="active-snapshots">{activeSnapshotIds.join(",")}</div>
      <div data-testid="vms">{vms.map((entry) => entry.vmName).join(",")}</div>
      <div data-testid="health">{healthEvents.map((entry) => entry.entity).join(",")}</div>
    </>
  );
}

beforeEach(async () => {
  await deleteAllData();
});

describe("useActiveSnapshotIds", () => {
  it("selects the latest export for each vCenter (defensive reduction if several exist)", async () => {
    await putSnapshot(snapshot("vc1-old", "vc-1", "2026-01-01T00:00:00.000Z"));
    await putSnapshot(snapshot("vc1-new", "vc-1", "2026-02-01T00:00:00.000Z"));
    await putSnapshot(snapshot("vc2-new", "vc-2", "2026-01-15T00:00:00.000Z"));

    render(<Probe />, { wrapper: TestProviders });

    await waitFor(() => {
      expect(screen.getByTestId("active-snapshots")).toHaveTextContent("vc1-new,vc2-new");
    });
  });

  it("filters VMs by the active per-vCenter export, cluster, and search text", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    await putSnapshot(snapshot("snap-2", "vc-1", "2026-02-01T00:00:00.000Z"));
    await batchPut("entities_vm", [
      vm("snap-1", "APP-OLD", "CL-Prod"),
      vm("snap-2", "APP-KEEP", "CL-Prod"),
      vm("snap-2", "DB-SKIP", "CL-Prod"),
      vm("snap-2", "APP-OTHER-CLUSTER", "CL-Test"),
    ]);

    await act(async () => {
      render(
        <Probe filters={{ clusters: ["CL-Prod"], search: "app" }} />,
        { wrapper: TestProviders },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("active-snapshots")).toHaveTextContent("snap-2");
      expect(screen.getByTestId("vms")).toHaveTextContent("APP-KEEP");
    });
    expect(screen.getByTestId("vms")).not.toHaveTextContent("APP-OLD");
    expect(screen.getByTestId("vms")).not.toHaveTextContent("DB-SKIP");
    expect(screen.getByTestId("vms")).not.toHaveTextContent("APP-OTHER-CLUSTER");
  });

  it("applies the global VM scope before returning VMs", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    await batchPut("entities_vm", [
      vmWith("snap-1", "APP-ON", "CL-Prod", { powerState: "poweredOn" }),
      vmWith("snap-1", "APP-OFF", "CL-Prod", { powerState: "poweredOff" }),
      vmWith("snap-1", "vCLS-12345678-aaaa-bbbb-cccc-123456789abc", "CL-Prod", { powerState: "poweredOn" }),
    ]);

    await act(async () => {
      render(
        <Probe filters={{ vmPowerScope: "poweredOn", excludeVclsVms: true }} />,
        { wrapper: TestProviders },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("vms")).toHaveTextContent("APP-ON");
    });
    expect(screen.getByTestId("vms")).not.toHaveTextContent("APP-OFF");
    expect(screen.getByTestId("vms")).not.toHaveTextContent("vCLS");
  });

  it("filters VMs by a flexible VM name list from the global filter state", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    await batchPut("entities_vm", [
      vm("snap-1", "APP-01", "CL-Prod"),
      vm("snap-1", "DB-02", "CL-Prod"),
      vm("snap-1", "APP-010", "CL-Prod"),
      vm("snap-1", "WEB-03", "CL-Prod"),
    ]);

    await act(async () => {
      render(
        <Probe filters={{ vmNameList: "app-01, db-02\nweb-03" }} />,
        { wrapper: TestProviders },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("vms")).toHaveTextContent("APP-01,DB-02,WEB-03");
    });
    expect(screen.getByTestId("vms")).not.toHaveTextContent("APP-010");
  });

  it("filters health events to matching VM entities when a VM name list is active", async () => {
    await putSnapshot(snapshot("snap-1", "vc-1", "2026-01-01T00:00:00.000Z"));
    await batchPut("entities_vm", [
      vm("snap-1", "APP-01", "CL-Prod"),
      vm("snap-1", "DB-02", "CL-Prod"),
    ]);
    await batchPut("entities_health", [
      health("snap-1", "APP-01"),
      health("snap-1", "DB-02"),
      health("snap-1", "esx-01"),
    ]);

    await act(async () => {
      render(
        <Probe filters={{ vmNameList: "app-01" }} />,
        { wrapper: TestProviders },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("health")).toHaveTextContent("APP-01");
    });
    expect(screen.getByTestId("health")).not.toHaveTextContent("DB-02");
    expect(screen.getByTestId("health")).not.toHaveTextContent("esx-01");
  });
});
