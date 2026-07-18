import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TechInfo from "@/pages/TechInfo";

const filters = {
  clusters: [],
  hosts: [],
  vmNameList: "",
  vmPowerScope: "all",
  excludeVclsVms: false,
  search: "",
};

const vms = [
  {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmUuid: "uuid-1", vmName: "app-01",
    cluster: null, host: null, powerState: "poweredOn", cpuCount: null, memoryMiB: null,
    provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null,
    consolidationNeeded: null, osConfig: null, osTools: null, hwVersion: null, toolsStatus: null,
    toolsVersion: null, datacenter: null, folder: null, resourcePool: null, annotation: null,
    cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
  },
  {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-2", vmUuid: "uuid-2", vmName: "app-02",
    cluster: null, host: null, powerState: "poweredOn", cpuCount: null, memoryMiB: null,
    provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null,
    consolidationNeeded: null, osConfig: null, osTools: null, hwVersion: null, toolsStatus: null,
    toolsVersion: null, datacenter: null, folder: null, resourcePool: null, annotation: null,
    cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
  },
];

const techInfoRows = [
  { vmNameNorm: "app-01", vmName: "app-01", sysv: "Max Muster", sysvDeputy: "max muster", cvBackup: false, az: "PROD" },
  { vmNameNorm: "app-02", vmName: "app-02", sysv: "Erika Muster", sysvDeputy: "Franz Beispiel", cvBackup: false, bz: "P" },
].map((row, rowIndex) => ({
  importedAt: "2026-07-18T00:00:00.000Z", techInfoImportId: "tech-1", rowIndex,
  serverType: null, maintenanceWindow: null, operatingSystem: null, comment: null,
  sysvDepartment: null, sysvDeputyDepartment: null, bz: null, clusterFromTechInfo: null,
  cvBackup: null, az: null, ...row,
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters, snapshotsLoading: false }),
  useVms: () => ({ allVms: vms, isLoading: false }),
  useTechInfoLatestByVmNames: () => ({ data: techInfoRows, isLoading: false }),
  useAllTechInfoClientLatest: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useGlobalVmFilter", () => ({ useGlobalVmFilterEngine: () => ({ hasActiveFilter: false, matchingVmKeys: null }) }));
vi.mock("@/hooks/useVmDetailDialog", () => ({ useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null }) }));
vi.mock("@/hooks/useClientDetailDialog", () => ({ useClientDetailDialog: () => ({ openClientDetail: vi.fn(), clientDetailDialog: null }) }));
vi.mock("@/components/dashboard/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns, data }: {
    columns: Array<{ accessorKey?: string; cell?: (context: { getValue: () => unknown; row: { original: Record<string, unknown> } }) => React.ReactNode }>;
    data: Array<Record<string, unknown>>;
  }) => {
    const cvBackupColumn = columns.find((column) => column.accessorKey === "cvBackup");
    if (!cvBackupColumn?.cell) return null;
    return <>{data.map((row) => <div key={String(row.vmName)}>{cvBackupColumn.cell?.({ getValue: () => row.cvBackup, row: { original: row } })}</div>)}</>;
  },
}));
vi.mock("@/components/ui/info-tooltip", () => ({ InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe("TechInfo", () => {
  it("zeigt identische SysV- und SysVStv-Zuordnungen als kritische KPI", () => {
    render(<TechInfo />);

    const title = screen.getByText("SysV = SysVStv");
    expect(title.closest(".border-l-destructive")).toHaveTextContent("1");
  });

  it("markiert fehlende CV-Backups für PROD- und P-Systeme rot", () => {
    render(<TechInfo />);

    for (const cell of screen.getAllByText("Nein")) {
      expect(cell).toHaveClass("bg-destructive");
    }
  });
});
