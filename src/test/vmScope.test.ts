import { describe, expect, it } from "vitest";
import type { FilterState, NormalizedVm, SheetRow } from "@/domain/models/types";
import {
  applyVmScopeToHealthEvents,
  applyVmScopeToRows,
  applyVmScopeToVms,
  filterByVmScope,
  parseVmNameScopeList,
  isVclsVm,
  isDummyVm,
} from "@/lib/vmScope";

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
    vcenterIds: [],
    clusters: [],
    hosts: [],
    datastores: [],
    search: "",
    globalFilter: null,
    vmNameList: "",
    vmPowerScope: "all",
    excludeVclsVms: false,
    excludeDummyVms: false,
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

  it("detects dummy VMs by name prefix", () => {
    expect(isDummyVm(makeVm({ vmName: "dummy-vm-01" }))).toBe(true);
    expect(isDummyVm(makeVm({ vmName: "Dummy-VM2" }))).toBe(true);
    expect(isDummyVm(makeVm({ vmName: "APP-01" }))).toBe(false);
  });

  it("parses flexible VM name lists from paragraphs, commas, semicolons, and whitespace", () => {
    expect(parseVmNameScopeList(" APP-01,db-02\nweb-03;  api-04\tbatch-05  APP-01 ")).toEqual([
      "app-01",
      "db-02",
      "web-03",
      "api-04",
      "batch-05",
    ]);
  });

  it("applies a VM name list as an exact case-insensitive global scope", () => {
    const rows = [
      makeVm({ vmName: "APP-01" }),
      makeVm({ vmName: "DB-02" }),
      makeVm({ vmName: "APP-010" }),
    ];

    expect(applyVmScopeToVms(rows, makeFilter({ vmNameList: "app-01 db-02" })).map((vm) => vm.vmName)).toEqual([
      "APP-01",
      "DB-02",
    ]);
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

  it("applies the dummy-vm exclude scope filter to normalized VMs", () => {
    const rows = [
      makeVm({ vmName: "APP-01" }),
      makeVm({ vmName: "dummy-vm-01" }),
    ];

    expect(
      applyVmScopeToVms(rows, makeFilter({ excludeDummyVms: true })).map((vm) => vm.vmName),
    ).toEqual(["APP-01"]);
  });

  it("überträgt den VM-Scope über den RVTools-Schlüssel auf vROps-Auslastungsprofile", () => {
    const scopedVms = applyVmScopeToVms(
      [
        makeVm({ vmKey: "vm-on", vmName: "APP-ON", powerState: "poweredOn" }),
        makeVm({ vmKey: "vm-off", vmName: "APP-OFF", powerState: "poweredOff" }),
      ],
      makeFilter({ vmPowerScope: "poweredOn" }),
    );
    const profiles = [
      { rvtoolsObjectKey: "vm-on", vmName: "APP-ON" },
      { rvtoolsObjectKey: "vm-off", vmName: "APP-OFF" },
    ];

    expect(filterByVmScope(profiles, scopedVms).map((profile) => profile.vmName)).toEqual(["APP-ON"]);
  });

  it("greift für Profile ohne RVTools-Schlüssel auf den normalisierten VM-Namen zurück", () => {
    const scopedVms = [makeVm({ vmKey: "vm-on", vmName: "APP-ON" })];
    const profiles: { rvtoolsObjectKey: string | null; vmName: string }[] = [
      { rvtoolsObjectKey: null, vmName: " app-on " },
      { rvtoolsObjectKey: null, vmName: "APP-OFF" },
    ];

    expect(filterByVmScope(profiles, scopedVms).map((profile) => profile.vmName)).toEqual([" app-on "]);
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

  it("applies the same VM name scope to raw rows and VM health events", () => {
    const vms = [makeVm({ vmName: "APP-01" }), makeVm({ vmName: "DB-02" })];
    const filters = makeFilter({ vmNameList: "app-01" });

    expect(applyVmScopeToRows([makeRow("APP-01"), makeRow("DB-02")], vms, filters).map((row) => row.data.VM)).toEqual([
      "APP-01",
    ]);

    expect(
      applyVmScopeToHealthEvents(
        [
          { snapshotId: "snap-1", vcenterId: "vc-1", entity: "APP-01", messageType: "Warning", message: "VM alarm" },
          { snapshotId: "snap-1", vcenterId: "vc-1", entity: "DB-02", messageType: "Warning", message: "VM alarm" },
          { snapshotId: "snap-1", vcenterId: "vc-1", entity: "esx-01", messageType: "Warning", message: "Host alarm" },
        ],
        vms,
        filters,
      ).map((event) => event.entity),
    ).toEqual(["APP-01"]);
  });
});
