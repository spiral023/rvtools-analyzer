import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComplianceLifecycle from "@/pages/ComplianceLifecycle";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots: [{ snapshotId: "snap-1" }], filters: { search: "" }, snapshotsLoading: false }),
  useVms: () => ({ vms: [], allVms: [], isLoading: false }),
  useHosts: () => ({ data: [], isLoading: false }),
  useRawSheet: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useGlobalVmFilter", () => ({
  useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows }),
}));

vi.mock("@/hooks/useVmDetailDialog", () => ({
  useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null }),
}));

vi.mock("@/components/dashboard/FilterBar", () => ({ FilterBar: () => <div /> }));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: () => <div /> }));
vi.mock("@/pages/Hardware", () => ({ HostDetailDialog: () => null }));
vi.mock("@/pages/VmwareVersions", () => ({ VmwareVersionsPanel: () => <div /> }));
vi.mock("@/components/charts/recharts", () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { BarChart: Container, Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, ResponsiveContainer: Container, PieChart: Container, Pie: () => null, Cell: () => null, Legend: () => null };
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
});
