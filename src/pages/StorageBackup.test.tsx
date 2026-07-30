import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import StorageBackup from "@/pages/StorageBackup";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useDatastores: () => ({ data: [] as unknown[], isLoading: false }),
  useHosts: () => ({ data: [] as unknown[], isLoading: false }),
  useRawSheet: (sheet: string) => ({
    data: sheet === "vPartition"
      ? Array.from({ length: 21 }, (_, index) => index * 5).map((freePct, rowIndex) => ({
        snapshotId: "snap-1",
        sheetName: "vPartition",
        rowIndex,
        data: { VM: `vm-${freePct}`, Disk: `disk-${freePct}`, "Capacity MiB": 100, "Free MiB": freePct },
      })) as SheetRow[]
      : [] as SheetRow[],
    isLoading: false,
  }),
  useVmSnapshots: () => ({ data: [] as unknown[], isLoading: false }),
  useVms: () => ({ vms: [] as NormalizedVm[], allVms: [] as NormalizedVm[], isLoading: false }),
}));

vi.mock("@/hooks/useGlobalVmFilter", () => ({
  useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]): T[] => rows, matchingVmJoinKeys: undefined as Set<string> | undefined }),
}));

vi.mock("@/hooks/useVmDetailDialog", () => ({
  useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as ReactNode }),
}));

vi.mock("@/hooks/useHostDetailDialog", () => ({
  useHostDetailDialog: () => ({ openHostDetail: vi.fn(), hostDetailDialog: null as ReactNode }),
}));

vi.mock("@/components/dashboard/KpiCard", () => ({
  KpiCard: ({ title }: { title: string }) => <div data-testid="kpi-card">{title}</div>,
}));
vi.mock("@/components/dashboard/KpiGrid", () => ({
  KpiGrid: ({ children }: { children: ReactNode }) => <div data-testid="kpi-grid">{children}</div>,
}));
vi.mock("@/components/charts/recharts", () => ({
  BarChart: ({ data, layout }: { data?: Array<{ label: string; count: number }>; layout?: string }) => (
    <div data-testid="partition-chart" data-layout={layout ?? "horizontal"}>
      {data?.map((point) => <span key={point.label}>{point.label}:{point.count}</span>)}
    </div>
  ),
  Bar: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
  Tooltip: (): null => null,
  CartesianGrid: (): null => null,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Cell: (): null => null,
}));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: () => <div /> }));
vi.mock("@/components/layout/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/dashboard/PageLoadingState", () => ({ PageLoadingState: () => <div /> }));
vi.mock("@/components/dashboard/EmptyState", () => ({ EmptyState: () => <div /> }));
vi.mock("@/components/global-filter/GlobalFilterScopeHint", () => ({ GlobalFilterScopeHint: () => <div /> }));
vi.mock("@/components/ui/info-tooltip", () => ({ InfoTooltip: ({ children }: { children: ReactNode }) => <>{children}</> }));

describe("StorageBackup KPI-Kacheln", () => {
  it("zeigt je Tab passende KPI-Kacheln unterhalb der Tab-Leiste", () => {
    render(<StorageBackup />);

    expect(within(screen.getByTestId("kpi-grid")).getAllByTestId("kpi-card").map((card) => card.textContent)).toEqual([
      "Kritisch (<10%)",
      "Warnung (<20%)",
      "Datastores",
      "Datastores <20% frei",
      "Ø Datastore frei",
      "Kritische Datastores",
    ]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pfade & Geräte" }), { button: 0 });
    expect(within(screen.getByTestId("kpi-grid")).getAllByTestId("kpi-card").map((card) => card.textContent)).toEqual([
      "Multipath Issues",
      "Dead Paths",
      "Virtuelle Disks",
      "Thin Disks",
      "RDMs",
      "SCSI-Zuordnungen",
    ]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Backup & Recovery" }), { button: 0 });
    expect(within(screen.getByTestId("kpi-grid")).getAllByTestId("kpi-card").map((card) => card.textContent)).toEqual([
      "Kein Backup",
      "Backup >7d",
      "Backup-Risiken",
      "Snapshot + Backup",
      "Backup-Abdeckung",
      "Snapshots gesamt",
    ]);
  });

  it("zeigt Gast-Partitionen durchgehend in 5%-Intervallen von 0 bis 100 Prozent", () => {
    render(<StorageBackup />);

    expect(screen.getByTestId("partition-chart")).toHaveAttribute("data-layout", "horizontal");

    for (const bucket of Array.from({ length: 20 }, (_, index) => {
      const lower = index * 5;
      const upper = lower + 5;
      return `${lower}–${upper} %:${index === 19 ? 2 : 1}`;
    })) {
      expect(screen.getByText(bucket)).toBeInTheDocument();
    }
  });
});
