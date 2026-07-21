import { describe, expect, it } from "vitest";
import type { NormalizedVm } from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import { buildClusterOsDistributionRows } from "@/lib/vmOsDistribution";

function makeVm(overrides: Partial<NormalizedVm>): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmKey: overrides.vmName || "vm",
    vmUuid: null,
    vmName: "APP-01",
    cluster: "CL-Prod",
    host: "esx-01",
    powerState: "poweredOn",
    cpuCount: 2,
    memoryMiB: 4096,
    provisionedMiB: null,
    inUseMiB: null,
    configStatus: null,
    connectionState: null,
    consolidationNeeded: null,
    osConfig: "Windows Server 2019",
    osTools: "Windows Server 2019 Standard",
    hwVersion: null,
    toolsStatus: null,
    toolsVersion: null,
    datacenter: null,
    folder: null,
    resourcePool: null,
    annotation: null,
    cpuReady: null,
    firmware: null,
    efiSecureBoot: null,
    cbt: null,
    ...overrides,
  };
}

describe("VM OS distribution", () => {
  it("groups VM counts by cluster and selected OS source", () => {
    const rows = buildClusterOsDistributionRows(
      [
        makeVm({ vmName: "APP-01", cluster: "CL-Prod", osTools: "Windows Server 2019 Standard" }),
        makeVm({ vmName: "APP-02", cluster: "CL-Prod", osTools: "Windows Server 2019 Standard" }),
        makeVm({ vmName: "DB-01", cluster: "CL-Prod", osTools: "Red Hat Enterprise Linux 8" }),
        makeVm({ vmName: "APP-03", cluster: "CL-Test", osTools: "Windows Server 2019 Standard" }),
      ],
      "tools",
    );

    expect(rows).toEqual([
      { vcenterId: "vc-1", datacenter: null, clusterKey: clusterScopeKey("vc-1", null, "CL-Prod"), cluster: "CL-Prod", operatingSystem: "Windows Server 2019 Standard", vmCount: 2, clusterSharePct: 66.66666666666666 },
      { vcenterId: "vc-1", datacenter: null, clusterKey: clusterScopeKey("vc-1", null, "CL-Prod"), cluster: "CL-Prod", operatingSystem: "Red Hat Enterprise Linux 8", vmCount: 1, clusterSharePct: 33.33333333333333 },
      { vcenterId: "vc-1", datacenter: null, clusterKey: clusterScopeKey("vc-1", null, "CL-Test"), cluster: "CL-Test", operatingSystem: "Windows Server 2019 Standard", vmCount: 1, clusterSharePct: 100 },
    ]);
  });

  it("can group by configuration-file OS and keeps empty values visible", () => {
    const rows = buildClusterOsDistributionRows(
      [
        makeVm({ vmName: "APP-01", cluster: "CL-Prod", osConfig: "Windows Server 2019", osTools: "Windows Server" }),
        makeVm({ vmName: "APP-02", cluster: "CL-Prod", osConfig: "Windows Server 2019", osTools: "Windows Server" }),
        makeVm({ vmName: "APP-03", cluster: null, osConfig: null, osTools: "Ubuntu Linux" }),
      ],
      "config",
    );

    expect(rows).toEqual([
      { vcenterId: "vc-1", datacenter: null, clusterKey: clusterScopeKey("vc-1", null, "CL-Prod"), cluster: "CL-Prod", operatingSystem: "Windows Server 2019", vmCount: 2, clusterSharePct: 100 },
      { vcenterId: "vc-1", datacenter: null, clusterKey: clusterScopeKey("vc-1", null, null), cluster: "Ohne Cluster", operatingSystem: "Unbekannt", vmCount: 1, clusterSharePct: 100 },
    ]);
  });

  it("trennt gleichnamige Cluster verschiedener vCenter", () => {
    const rows = buildClusterOsDistributionRows(
      [
        makeVm({ vmName: "APP-A", vcenterId: "vc-a", datacenter: "DC1", cluster: "Production", osTools: "Windows Server" }),
        makeVm({ vmName: "APP-B", vcenterId: "vc-b", datacenter: "DC1", cluster: "Production", osTools: "Windows Server" }),
      ],
      "tools",
    );

    expect(rows).toEqual([
      {
        vcenterId: "vc-a",
        datacenter: "DC1",
        clusterKey: clusterScopeKey("vc-a", "DC1", "Production"),
        cluster: "Production",
        operatingSystem: "Windows Server",
        vmCount: 1,
        clusterSharePct: 100,
      },
      {
        vcenterId: "vc-b",
        datacenter: "DC1",
        clusterKey: clusterScopeKey("vc-b", "DC1", "Production"),
        cluster: "Production",
        operatingSystem: "Windows Server",
        vmCount: 1,
        clusterSharePct: 100,
      },
    ]);
  });
});
