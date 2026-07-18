import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkAuditPanel } from "./NetworkAuditPanel";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ filters: { search: "" } }),
  useNetworkAudit: () => ({
    rows: [{ switchInterfaceKey: "sw01::eth1/1", switchHostname: "sw01", interface: "Eth1/1", description: null, status: "connected", matchStatus: "confirmed-cdp", matchedHost: "esx01", matchedSource: "cdp", labelConflict: false, labelConflictHost: null, statusConflict: false, finding: null }],
    hostQuality: {
      rvtoolsRows: [{ host: "esx02.lab.local", cluster: "Prod", version: "8.0", connectionState: "Connected", techInfoPresent: false, techInfoServerType: null, techInfoDepartment: null, ipamPresent: false, ipamAddresses: [], ipamNetworks: [], finding: "Tech-Info fehlt · IPAM fehlt" }],
      techInfoRows: [{ techInfoName: "esx03.lab.local", serverType: "ESXi", department: "Platform", maintenanceWindow: null, rvtoolsPresent: false, rvtoolsHost: null, rvtoolsCluster: null, ipamPresent: true, ipamAddresses: ["10.10.20.3"], ipamNetworks: ["10.10.20.0/24"], finding: "RVTools-Host fehlt" }],
    },
    isLoading: false,
  }),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ data }: { data: Array<Record<string, unknown>> }) => (
    <div>{data.flatMap((row) => Object.values(row).flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : []) as string[]).join(" | ")}</div>
  ),
}));

describe("NetworkAuditPanel host data quality", () => {
  it("zeigt getrennte Datenqualitäts-Tabellen für RVTools- und Tech-Info-Objekte", () => {
    render(<NetworkAuditPanel />);

    expect(screen.getByRole("heading", { name: "Host-Datenabgleich" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ESXi aus RVTools/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Objekte aus Tech-Info/ })).toBeInTheDocument();
    expect(screen.getByText(/esx02\.lab\.local/)).toBeInTheDocument();
    expect(screen.getByText(/10\.10\.20\.0\/24/)).toBeInTheDocument();
  });
});
