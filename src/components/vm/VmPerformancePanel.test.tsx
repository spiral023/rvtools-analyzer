import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

const ftRow = { snapshotId: "snap-1", sheetName: "vInfo", rowIndex: 0, data: { VM: "vm-ft", "FT State": "enabled", "FT Role": "Primary", "FT Latency": 12, "FT Sec. Latency": 3, "FT Bandwidth": 100 } };
vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useVms: () => ({ vms: [{ vmName: "vm-ft", cpuReady: 8, cpuCount: 4, cluster: "cluster-a", host: "esx-a", powerState: "poweredOn" }], allVms: [] as unknown[] }),
  useRawSheet: (sheet: string) => ({ data: sheet === "vInfo" ? [ftRow] : [], isLoading: false }),
}));
vi.mock("@/hooks/useGlobalVmFilter", () => ({ useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows }) }));
vi.mock("@/hooks/useVmDetailDialog", () => ({ useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as unknown }) }));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: ({ data }: { data: unknown[] }) => <div>{data.map((row, index) => <div key={index}>{JSON.stringify(row)}</div>)}</div> }));

const { VmPerformancePanel } = await import("./VmPerformancePanel");

describe("VmPerformancePanel", () => {
  it("zeigt die FT-Latenz-Tabelle zusätzlich zu den Performance-Details", () => {
    render(<TooltipProvider><VmPerformancePanel /></TooltipProvider>);
    expect(screen.getByText(/FT Latenz Monitoring/)).toBeInTheDocument();
    expect(screen.getByText(/ftLatency/)).toBeInTheDocument();
    expect(screen.getByText("Top CPU Ready VMs")).toBeInTheDocument();
  });
});
