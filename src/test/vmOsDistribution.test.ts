import { describe, expect, it } from "vitest";
import type { NormalizedVm } from "@/domain/models/types";
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
      { cluster: "CL-Prod", operatingSystem: "Windows Server 2019 Standard", vmCount: 2 },
      { cluster: "CL-Prod", operatingSystem: "Red Hat Enterprise Linux 8", vmCount: 1 },
      { cluster: "CL-Test", operatingSystem: "Windows Server 2019 Standard", vmCount: 1 },
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
      { cluster: "CL-Prod", operatingSystem: "Windows Server 2019", vmCount: 2 },
      { cluster: "Ohne Cluster", operatingSystem: "Unbekannt", vmCount: 1 },
    ]);
  });
});
