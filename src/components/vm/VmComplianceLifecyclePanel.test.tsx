import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useVms: () => ({ vms: [{ snapshotId: "snap-1", vmName: "vm-old", hwVersion: "vmx-13", firmware: "bios", efiSecureBoot: false, cbt: false, osConfig: "Linux", osTools: "Linux", vmUuid: "", annotation: "", cluster: "cluster-a" }], allVms: [] as unknown[] }),
  useRawSheet: () => ({ data: [{ snapshotId: "snap-1", sheetName: "vInfo", rowIndex: 0, data: { VM: "vm-old", "HW upgrade status": "pending", "HW version": "vmx-13", "HW upgrade policy": "next reboot", "HW target": "vmx-20", Cluster: "cluster-a" } }], isLoading: false }),
}));
vi.mock("@/hooks/useGlobalVmFilter", () => ({ useGlobalVmFilterEngine: () => ({ filterVmRows: <T,>(rows: T[]) => rows }) }));
vi.mock("@/hooks/useVmDetailDialog", () => ({ useVmDetailDialog: () => ({ openVmDetail: vi.fn(), vmDetailDialog: null as unknown }) }));
vi.mock("@/components/tables/VirtualTable", () => ({ VirtualTable: ({ data }: { data: unknown[] }) => <div>{data.map((row, index) => <div key={index}>{JSON.stringify(row)}</div>)}</div> }));

const { VmComplianceLifecyclePanel } = await import("./VmComplianceLifecyclePanel");

describe("VmComplianceLifecyclePanel", () => {
  it("zeigt Compliance und den HW-Upgrade-Backlog", () => {
    render(<TooltipProvider><VmComplianceLifecyclePanel /></TooltipProvider>);
    expect(screen.getByText(/VM Compliance/)).toBeInTheDocument();
    expect(screen.getByText(/VM HW Upgrade Backlog/)).toBeInTheDocument();
    expect(screen.getByText(/pending/)).toBeInTheDocument();
  });
});
