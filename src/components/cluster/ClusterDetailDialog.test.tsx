import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClusterDetailDialog } from "@/components/cluster/ClusterDetailDialog";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import type { NormalizedCluster, NormalizedHost, NormalizedVm } from "@/domain/models/types";

const cluster: NormalizedCluster = {
  snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: clusterScopeKey("vc-1", null, "Production"),
  name: "Production", datacenter: null, haEnabled: true, drsEnabled: true, numHosts: 1,
  numCpuCores: 10, numCpuThreads: 20, totalMemoryMiB: 100_000, totalCpuMHz: null, numEffectiveHosts: 1,
};

const host: NormalizedHost = {
  snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: "esx-01", cluster: "Production", datacenter: "DC1",
  cpuModel: null, cpuTotalMHz: null, cpuCores: 10, cpuThreads: 20, memoryTotalMiB: 100_000,
  version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
};

const vm: NormalizedVm = {
  snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmUuid: null, vmName: "APP-01", cluster: "Production", host: "esx-01",
  powerState: "poweredOn", cpuCount: 4, memoryMiB: 16_000, provisionedMiB: null, inUseMiB: null, configStatus: null,
  connectionState: null, consolidationNeeded: null, osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null,
  datacenter: "DC1", folder: null, resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
};

describe("ClusterDetailDialog", () => {
  it("findet Host- und VM-Metriken bei einem Cluster ohne eigenes Datacenter", () => {
    render(
      <ClusterDetailDialog
        clusterKey={clusterScopeKey("vc-1", "DC1", "Production")}
        open
        onClose={() => {}}
        clusters={[cluster]}
        hosts={[host]}
        vms={[vm]}
        datastores={[]}
        rawVHostRows={[]}
      />,
    );

    expect(screen.getByText("Laufende VMs (1)")).toBeInTheDocument();
    expect(screen.getByText("APP-01")).toBeInTheDocument();
  });
});
