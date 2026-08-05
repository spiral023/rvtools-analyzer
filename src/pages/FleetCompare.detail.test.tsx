import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHealth,
  NormalizedHost,
  NormalizedVm,
  SnapshotMeta,
} from "@/domain/models/types";

const snapshot: SnapshotMeta = {
  snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vcenter-prod",
  exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-23T00:00:00.000Z",
  fileName: "prod.xlsx", fileChecksum: "checksum", sheetStats: {},
};

const vm: NormalizedVm = {
  snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmUuid: "uuid-1", vmName: "APP-01",
  cluster: "CL-Prod", host: "esx01", powerState: "poweredOn", cpuCount: 4, memoryMiB: 8192,
  provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null, consolidationNeeded: null,
  osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null, datacenter: null,
  folder: null, resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
};

const host: NormalizedHost = {
  snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "esx01", host: "esx01", cluster: "CL-Prod",
  datacenter: "DC1", cpuModel: "Intel Xeon", cpuTotalMHz: 20000, cpuCores: 16, cpuThreads: 32,
  memoryTotalMiB: 131072, version: "8.0", build: "1", vendor: "Dell", model: "R750",
  connectionState: "connected", powerState: "poweredOn", maintenanceMode: "false", vmCount: 1,
};

const cluster: NormalizedCluster = {
  snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cl-1", name: "CL-Prod", datacenter: "DC1",
  haEnabled: true, drsEnabled: true, numHosts: 1, numCpuCores: 16, numCpuThreads: 32,
  totalMemoryMiB: 131072, totalCpuMHz: 20000, numEffectiveHosts: 1,
};

const datastore: NormalizedDatastore = {
  snapshotId: "snap-1", vcenterId: "vc-1", dsKey: "ds-1", name: "DS01", clusterName: "CL-Prod",
  hostNames: ["esx01"], type: "VMFS", capacityMiB: 1048576, inUseMiB: 995328, freeMiB: 52428,
  freePct: 5, version: "6", siocEnabled: null,
};

const healthEvent: NormalizedHealth = {
  snapshotId: "snap-1", vcenterId: "vc-1", entity: "esx01", messageType: "Warning", message: "Uplink redundancy lost",
};

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({
    data,
    columns,
    onRowClick,
  }: {
    data: Array<Record<string, unknown> & { displayName: string }>;
    columns: Array<{
      accessorKey?: string;
      cell?: (args: { getValue: () => unknown; row: { original: Record<string, unknown> } }) => ReactNode;
    }>;
    onRowClick?: (row: unknown) => void;
  }) => (
    <table>
      <tbody>
        {data.map((row) => (
          <tr key={row.displayName} onClick={() => onRowClick?.(row)}>
            {columns.map((column, index) => (
              <td key={column.accessorKey ?? index} data-testid={`cell-${column.accessorKey ?? index}`}>
                {column.cell
                  ? column.cell({ getValue: () => row[column.accessorKey ?? ""], row: { original: row } })
                  : String(row[column.accessorKey ?? ""] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: [string, ...unknown[]] }) => {
    const key = queryKey[0];
    const data = key === "snapshots" ? [snapshot]
      : key === "vms" ? [vm]
      : key === "hosts" ? [host]
      : key === "clusters" ? [cluster]
      : key === "datastores" ? [datastore]
      : key === "health" ? [healthEvent]
      : key === "vmSnapshots" ? []
      : key === "rawSheet" ? []
      : [];
    return { data, isPending: false, isLoading: false };
  },
}));

vi.mock("@/components/licensing/LicenseDetailsTable", () => ({
  LicenseDetailsTable: (): null => null,
}));

vi.mock("@/lib/licenseDetails", () => ({
  getLicenseRows: (): [] => [],
}));

const { default: FleetCompare } = await import("./FleetCompare");

afterEach(() => cleanup());

function renderPage() {
  render(
    <MemoryRouter>
      <TooltipProvider><FleetCompare /></TooltipProvider>
    </MemoryRouter>,
  );
}

describe("FleetCompare – vCenter-Detailansicht", () => {
  it("öffnet beim Klick auf eine vCenter-Zeile die Detailansicht mit den zugehörigen Kennzahlen", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("vcenter-prod"));

    await waitFor(() => expect(screen.getByRole("heading", { name: "vcenter-prod" })).toBeInTheDocument());
    expect(screen.getAllByText("CL-Prod").length).toBeGreaterThan(0);
    expect(screen.getByText("DS01")).toBeInTheDocument();
    expect(screen.getByText("Uplink redundancy lost")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopieren / Export" })).toBeInTheDocument();
  });

  it("erklärt Health und Risiko Score per Tooltip", async () => {
    renderPage();

    const healthValue = (await screen.findByTestId("cell-healthIssues")).querySelector("span");
    expect(healthValue).not.toBeNull();
    fireEvent.pointerMove(healthValue);

    expect((await screen.findAllByText("1 von vCenter gemeldete Health- und Konfigurationswarnung.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Warning").length).toBeGreaterThan(0);

    const riskValue = screen.getByTestId("cell-riskScore").querySelector("span");
    expect(riskValue).not.toBeNull();
    fireEvent.pointerMove(riskValue);

    expect((await screen.findAllByText("Score 12 von maximal 100")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Health-Warnungen (1 × 2)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kritische Datastores (1 × 10)").length).toBeGreaterThan(0);
  });

  it("schließt die Detailansicht wieder", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("vcenter-prod"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "vcenter-prod" })).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("heading", { name: "vcenter-prod" })).not.toBeInTheDocument());
  });
});
