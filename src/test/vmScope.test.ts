import { describe, expect, it } from "vitest";
import type { FilterState, NormalizedVm, SheetRow } from "@/domain/models/types";
import { applyVmScopeToRows, applyVmScopeToVms, isVclsVm } from "@/lib/vmScope";

function makeVm(overrides: Partial<NormalizedVm> = {}): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmKey: "vm-1",
    vmUuid: "uuid-1",
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
    osConfig: "Windows Server",
    osTools: "Windows Server 2022",
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

function makeFilter(overrides: Partial<FilterState> = {}): FilterState {
  return {
    snapshotIds: [],
    vcenterIds: [],
    clusters: [],
    hosts: [],
    datastores: [],
    search: "",
    globalFilter: null,
    vmPowerScope: "all",
    excludeVclsVms: false,
    ...overrides,
  };
}

function makeRow(vmName: string): SheetRow {
  return {
    snapshotId: "snap-1",
    sheetName: "vDisk",
    rowIndex: 1,
    data: { VM: vmName, Disk: "Hard disk 1" },
  };
}

describe("VM scope filters", () => {
  it("detects vCLS VMs from name, folder, or resource pool", () => {
    expect(isVclsVm(makeVm({ vmName: "vCLS-12345678-aaaa-bbbb-cccc-123456789abc" }))).toBe(true);
    expect(isVclsVm(makeVm({ vmName: "APP-01", folder: "vm/vCLS" }))).toBe(true);
    expect(isVclsVm(makeVm({ vmName: "APP-01", resourcePool: "vCLS" }))).toBe(true);
    expect(isVclsVm(makeVm({ vmName: "APP-VCLS-REPORT" }))).toBe(false);
  });

  it("applies powered-on and vCLS scope filters to normalized VMs", () => {
    const rows = [
      makeVm({ vmName: "APP-ON", powerState: "poweredOn" }),
      makeVm({ vmName: "APP-OFF", powerState: "poweredOff" }),
      makeVm({ vmName: "vCLS-12345678-aaaa-bbbb-cccc-123456789abc", powerState: "poweredOn" }),
    ];

    expect(
      applyVmScopeToVms(rows, makeFilter({ vmPowerScope: "poweredOn", excludeVclsVms: true })).map((vm) => vm.vmName),
    ).toEqual(["APP-ON"]);
  });

  it("applies the same scope to raw VM sheet rows by matching normalized VMs", () => {
    const vms = [
      makeVm({ vmName: "APP-ON", powerState: "poweredOn" }),
      makeVm({ vmName: "APP-OFF", powerState: "poweredOff" }),
      makeVm({ vmName: "vCLS-12345678-aaaa-bbbb-cccc-123456789abc", powerState: "poweredOn" }),
    ];
    const rows = [makeRow("APP-ON"), makeRow("APP-OFF"), makeRow("vCLS-12345678-aaaa-bbbb-cccc-123456789abc")];

    expect(
      applyVmScopeToRows(rows, vms, makeFilter({ vmPowerScope: "poweredOn", excludeVclsVms: true })).map(
        (row) => row.data.VM,
      ),
    ).toEqual(["APP-ON"]);
  });
});
