import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComplianceLifecycle from "@/pages/ComplianceLifecycle";
import type { NormalizedVm, NormalizedHost, SheetRow } from "@/domain/models/types";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useVms: () => ({ vms: [] as NormalizedVm[], allVms: [] as NormalizedVm[], isLoading: false }),
  useHosts: () => ({ data: [] as NormalizedHost[], isLoading: false }),
  useRawSheet: () => ({ data: [] as SheetRow[], isLoading: false }),
}));

vi.mock("@/hooks/useGlobalVmFilter", () => ({
  useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows }),
}));

vi.mock("@/hooks/useVmDetailDialog", () => ({
  useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as React.ReactNode }),
}));

vi.mock("@/components/dashboard/FilterBar", () => ({ FilterBar: () => <div /> }));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: () => <div /> }));
vi.mock("@/pages/Hardware", () => ({ HostDetailDialog: (): null => null }));
vi.mock("@/pages/VmwareVersions", () => ({ VmwareVersionsPanel: () => <div /> }));
vi.mock("@/components/charts/recharts", () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { BarChart: Container, Bar: (): null => null, XAxis: (): null => null, YAxis: (): null => null, Tooltip: (): null => null, ResponsiveContainer: Container, PieChart: Container, Pie: (): null => null, Cell: (): null => null, Legend: (): null => null };
});
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    <div data-testid={`tooltip-${entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`} data-tooltip-term={entry.term}>{children}</div>
  ),
}));

describe("ComplianceLifecycle", () => {
  it("erklärt alle Lifecycle-Tabs per Tooltip", () => {
    render(<ComplianceLifecycle />);

    expect(screen.getByTestId("tooltip-compliance")).toHaveAttribute("data-tooltip-term", "Compliance");
    expect(screen.getByTestId("tooltip-operations")).toHaveAttribute("data-tooltip-term", "Operations");
    expect(screen.getByTestId("tooltip-infrastruktur")).toHaveAttribute("data-tooltip-term", "Infrastruktur");
    expect(screen.getByTestId("tooltip-versionen")).toHaveAttribute("data-tooltip-term", "Versionen");
  });

  it("keeps the ESXi version view but no longer renders cluster infrastructure inventories", () => {
    render(<ComplianceLifecycle initialTab="infrastructure" />);

    expect(screen.getByText("ESXi Version/Build")).toBeInTheDocument();
    expect(screen.queryByText(/CPU-Generationen Mix je Cluster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Host Inventar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HBA\/NIC Treiberinventar/)).not.toBeInTheDocument();
  });
});
