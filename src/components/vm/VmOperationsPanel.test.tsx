import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useVms: () => ({ vms: [{ vmName: "vm-config", configStatus: "red", connectionState: "connected", powerState: "poweredOn", cluster: "cluster-a", host: "esx-a", osConfig: "Linux" }], allVms: [] as unknown[] }),
  useVmSnapshots: () => ({ data: [{ snapshotId: "snap-1", vmName: "vm-config", snapshotName: "before-upgrade", description: "Config", dateTaken: null as string | null, sizeMiB: null as number | null, quiesced: null as boolean | null }], isLoading: false }),
  useRawSheet: () => ({ data: [] as unknown[], isLoading: false }),
}));
vi.mock("@/hooks/useGlobalVmFilter", () => ({ useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows, matchingVmJoinKeys: null as Set<string> | null }) }));
vi.mock("@/hooks/useVmDetailDialog", () => ({ useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as unknown }) }));
vi.mock("@/components/vm/VmToolsWavePlan", () => ({ VmToolsWavePlan: () => <div>VMTools Upgrade Wellenplanung</div> }));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: ({ data }: { data: unknown[] }) => <div>{data.map((row, index) => <div key={index}>{JSON.stringify(row)}</div>)}</div> }));

const { VmOperationsPanel } = await import("./VmOperationsPanel");

describe("VmOperationsPanel", () => {
  it("zeigt Config-Probleme, Snapshots und Tools-Wellenplanung", () => {
    render(<TooltipProvider><VmOperationsPanel /></TooltipProvider>);
    expect(screen.getByText(/Konfigurationsproblemen/)).toBeInTheDocument();
    expect(screen.getByText(/before-upgrade/)).toBeInTheDocument();
    expect(screen.getByText("VMTools Upgrade Wellenplanung")).toBeInTheDocument();
  });
});
