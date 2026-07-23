import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostDensityTooltip } from "@/components/cluster/ClusterCapacityPanel";
import type { HostDensityPoint } from "@/lib/clusterCapacityWorkspace";

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
