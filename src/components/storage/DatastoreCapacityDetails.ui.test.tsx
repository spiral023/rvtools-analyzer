import { render, screen } from "@testing-library/react";
import type { NormalizedDatastore, NormalizedHost, SheetRow } from "@/domain/models/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>;
    columns: Array<{ header?: unknown }>;
  }) => (
    <div
      data-testid="virtual-table"
      data-columns={columns.map((column) => String(column.header ?? "")).join("|")}
      data-compute-cluster-count={String(data[0]?.computeClusterCount ?? "")}
      data-datastore-cluster={String(data[0]?.datastoreClusterName ?? "")}
    />
  ),
}));

const { DatastoreCapacityDetails } = await import("./DatastoreCapacityDetails");

const datastore: NormalizedDatastore = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  dsKey: "ds-1",
  name: "DS-Shared",
  clusterName: null,
  hostNames: [],
  type: "VMFS",
  capacityMiB: 1_000,
  inUseMiB: 500,
  freeMiB: 500,
  freePct: 50,
  version: "6",
  siocEnabled: true,
};

function host(name: string, cluster: string): NormalizedHost {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    hostKey: `${name}::vc-1`,
    host: name,
    cluster,
    datacenter: "DC1",
    cpuModel: null,
    cpuTotalMHz: null,
    cpuCores: null,
    cpuThreads: null,
    memoryTotalMiB: null,
    version: null,
    build: null,
    vendor: null,
    model: null,
    connectionState: null,
    powerState: null,
    maintenanceMode: null,
    vmCount: null,
  };
}

describe("DatastoreCapacityDetails", () => {
  it("zeigt die Anzahl der Compute-Cluster und den RVTools-Datastore-Cluster", () => {
    const rawDatastores: SheetRow[] = [{
      snapshotId: "snap-1",
      sheetName: "vDatastore",
      rowIndex: 0,
      data: {
        Name: "DS-Shared",
        Hosts: "esx-01.example.at, esx-02.example.at",
        "Datastore cluster name": "SDRS-Production",
      },
    }];

    render(
      <DatastoreCapacityDetails
        datastores={[datastore]}
        hosts={[
          host("esx-01.example.at", "Compute-A"),
          host("esx-02.example.at", "Compute-B"),
        ]}
        allVms={[]}
        rawDatastores={rawDatastores}
        rawDisks={[]}
        search=""
        onOpenVm={vi.fn()}
      />,
    );

    const table = screen.getByTestId("virtual-table");
    expect(table).toHaveAttribute("data-columns", expect.stringContaining("Anzahl Compute-Cluster"));
    expect(table).toHaveAttribute("data-compute-cluster-count", "2");
    expect(table).toHaveAttribute("data-datastore-cluster", "SDRS-Production");
  });
});
