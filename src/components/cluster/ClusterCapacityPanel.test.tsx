import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostDensityTooltip } from "@/components/cluster/ClusterCapacityPanel";
import type { ClusterCapacityRow, HostDensityPoint } from "@/lib/clusterCapacityWorkspace";
import { calculateCapacityRiskKpis } from "@/lib/clusterCapacityKpis";

const point: HostDensityPoint = {
  hostKey: "host-1",
  clusterKey: "cluster-1",
  name: "esx01.lab.local",
  vcenterDisplayName: "vcsa-a",
  cluster: "Production",
  vms: 24,
  vcpuPerCore: 3.5,
  ramGiB: 512,
};

describe("HostDensityTooltip", () => {
  it("zeigt den Hostnamen des berührten Datenpunkts", () => {
    render(<HostDensityTooltip active payload={[{ payload: point }]} />);

    expect(screen.getByText("esx01.lab.local")).toBeInTheDocument();
    expect(screen.getByText("vcsa-a · Production")).toBeInTheDocument();
  });
});

describe("calculateCapacityRiskKpis", () => {
  it("verdichtet Risiken, Hot Hosts, Swap/Balloon und vCPU-Dichte im Capacity-Scope", () => {
    const rows = [
      { totalCores: 16, vcpuPerCore: 3.5, risk: "hoch", hotHosts: 2, swapBalloonPct: 6 },
      { totalCores: 8, vcpuPerCore: 2, risk: "mittel", hotHosts: 1, swapBalloonPct: 1 },
    ] as ClusterCapacityRow[];

    expect(calculateCapacityRiskKpis(rows)).toEqual({
      criticalCapacity: 1,
      mediumCapacity: 1,
      hotHosts: 3,
      maxSwapBalloon: 6,
      avgVcpuPerCore: 3,
    });
  });
});
