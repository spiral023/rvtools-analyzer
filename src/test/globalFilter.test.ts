import { describe, expect, it } from "vitest";
import type { GlobalFilterGroup, NormalizedVm, SheetRow, TechInfoLatest, TechInfoClientLatest } from "@/domain/models/types";
import {
  buildGlobalFilterFields,
  buildVmJoinKey,
  collectReferencedRawFilterSources,
  evaluateGlobalFilter,
  parseSerializedGlobalFilter,
  serializeGlobalFilter,
  type VmGlobalFilterContextEntry,
} from "@/lib/globalFilter";

function makeVm(overrides: Partial<NormalizedVm> = {}): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmKey: "vm-1",
    vmUuid: "uuid-1",
    vmName: "bank-app-01",
    cluster: "Cluster-A",
    host: "esx-01",
    powerState: "poweredOn",
    cpuCount: 4,
    memoryMiB: 8192,
    provisionedMiB: 40960,
    inUseMiB: 20480,
    configStatus: "green",
    connectionState: "connected",
    consolidationNeeded: false,
    osConfig: "Red Hat Enterprise Linux 9",
    osTools: "Red Hat Enterprise Linux 9.3",
    hwVersion: "21",
    toolsStatus: "toolsOk",
    toolsVersion: "1",
    datacenter: "DC1",
    folder: "Prod",
    resourcePool: "RP1",
    annotation: "managed",
    cpuReady: 2.5,
    firmware: "efi",
    efiSecureBoot: true,
    cbt: true,
    ...overrides,
  };
}

function makeTechInfo(overrides: Partial<TechInfoLatest> = {}): TechInfoLatest {
  return {
    vmNameNorm: "bank-app-01",
    vmName: "bank-app-01",
    importedAt: "2026-04-02T10:00:00.000Z",
    techInfoImportId: "tech-1",
    rowIndex: 1,
    serverType: "Bankserver",
    maintenanceWindow: "Sa 22:00",
    operatingSystem: "Red Hat Enterprise Linux",
    comment: null,
    sysv: "Philipp Asanger",
    sysvDepartment: "OPS",
    sysvDeputy: "Simon Winter",
    sysvDeputyDepartment: "OPS",
    bz: null,
    clusterFromTechInfo: null,
    cvBackup: true,
    az: null,
    ...overrides,
  };
}

function makeTechInfoClient(overrides: Partial<TechInfoClientLatest> = {}): TechInfoClientLatest {
  return {
    clientNameNorm: "bank-app-01",
    clientName: "bank-app-01",
    importedAt: "2026-04-02T10:00:00.000Z",
    techInfoClientImportId: "tech-client-1",
    rowIndex: 1,
    blz: "12345",
    standort: "Linz",
    ip: "10.10.0.42",
    macAddress: "00:50:56:AA:BB:CC",
    poolName: "Pool-Standard",
    modifiedBy: "Max Mustermann",
    modifiedAt: "2026-06-15T10:30:00.000Z",
    createdBy: "Erika Musterfrau",
    createdAt: "2025-01-20T09:00:00.000Z",
    user: "muster.max",
    hardware: "Virtuell",
    os: "Windows 11",
    cluster: "VDI-Cluster-A",
    vcenter: "vcenter01",
    site: "RZ1",
    insider: "Ja",
    hwChanges: null,
    monitoring: "Aktiv",
    domain: "example.local",
    ...overrides,
  };
}

function makeRow(sheetName: string, data: SheetRow["data"]): SheetRow {
  return {
    snapshotId: "snap-1",
    sheetName,
    rowIndex: 1,
    data: {
      VM: "bank-app-01",
      ...data,
    },
  };
}

function makeContext(partitionRows: SheetRow[] = [], diskRows: SheetRow[] = []) {
  const vm = makeVm();
  const techInfo = makeTechInfo();
  const techInfoClient = makeTechInfoClient();
  const rawRowsBySource = {
    vPartition: partitionRows,
    vDisk: diskRows,
  };
  const fields = buildGlobalFilterFields([vm], [techInfo], [techInfoClient], rawRowsBySource);

  return {
    fields,
    context: {
      vm,
      techInfo,
      techInfoClient,
      rawRowsBySource,
    },
  };
}

describe("global filter evaluator", () => {
  it("supports nested AND/OR groups across VM and Tech-Info fields", () => {
    const { fields, context } = makeContext();
    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "tech",
          type: "group",
          operator: "or",
          sourceScope: "techInfo",
          children: [
            { id: "r1", type: "rule", field: "sysv", operator: "eq", value: "Philipp Asanger" },
            { id: "r2", type: "rule", field: "sysvDeputy", operator: "eq", value: "Philipp Asanger" },
          ],
        },
        {
          id: "vm",
          type: "group",
          operator: "and",
          sourceScope: "vm",
          children: [
            { id: "r3", type: "rule", field: "osTools", operator: "contains", value: "Red Hat Enterprise Linux" },
            { id: "r4", type: "rule", field: "powerState", operator: "eq", value: "poweredOn" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(true);
  });

  it("filters systems by joined Tech-Info client fields", () => {
    const { fields, context } = makeContext();
    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "client",
          type: "group",
          operator: "and",
          sourceScope: "techInfoClient",
          children: [
            { id: "r1", type: "rule", field: "poolName", operator: "contains", value: "Standard" },
            { id: "r2", type: "rule", field: "os", operator: "eq", value: "Windows 11" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(true);
    expect(fields.some((field) => field.source === "techInfoClient" && field.key === "poolName")).toBe(true);
  });

  it("excludes systems without a matching client record", () => {
    const { fields } = makeContext();
    const context: VmGlobalFilterContextEntry = { vm: makeVm(), techInfo: makeTechInfo(), techInfoClient: null, rawRowsBySource: {} };
    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "client",
          type: "group",
          operator: "and",
          sourceScope: "techInfoClient",
          children: [
            { id: "r1", type: "rule", field: "poolName", operator: "contains", value: "Standard" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(false);
  });

  it("supports wildcard text matching", () => {
    const { fields, context } = makeContext();
    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "vm",
          type: "group",
          operator: "and",
          sourceScope: "vm",
          children: [
            { id: "r1", type: "rule", field: "osTools", operator: "wildcard", value: "Red Hat Enterprise Linux*" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(true);
  });

  it("converts numeric units for MiB-backed fields", () => {
    const partitionRows = [
      makeRow("vPartition", { Disk: "C:\\Daten", "Capacity MiB": 15360, "Free %": 8 }),
    ];
    const { fields, context } = makeContext(partitionRows);

    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "partition",
          type: "group",
          operator: "and",
          sourceScope: "vPartition",
          children: [
            { id: "r1", type: "rule", field: "Disk", operator: "eq", value: "C:\\Daten" },
            { id: "r2", type: "rule", field: "Capacity MiB", operator: "gt", value: "10", unit: "GiB" },
            { id: "r3", type: "rule", field: "Free %", operator: "lt", value: "10" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(true);
  });

  it("keeps repeated-source rules on the same row", () => {
    const partitionRows = [
      makeRow("vPartition", { Disk: "C:\\Daten", "Capacity MiB": 5120, "Free %": 25 }),
      makeRow("vPartition", { Disk: "C:\\Archive", "Capacity MiB": 15360, "Free %": 5 }),
    ];
    const { fields, context } = makeContext(partitionRows);

    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "partition",
          type: "group",
          operator: "and",
          sourceScope: "vPartition",
          children: [
            { id: "r1", type: "rule", field: "Disk", operator: "eq", value: "C:\\Daten" },
            { id: "r2", type: "rule", field: "Capacity MiB", operator: "gt", value: "10", unit: "GiB" },
            { id: "r3", type: "rule", field: "Free %", operator: "lt", value: "10" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(false);
  });

  it("supports boolean and empty/not-empty checks", () => {
    const vm = makeVm({ annotation: "", efiSecureBoot: true });
    const techInfo = makeTechInfo();
    const techInfoClient = makeTechInfoClient();
    const fields = buildGlobalFilterFields([vm], [techInfo], [techInfoClient], {});
    const context = { vm, techInfo, techInfoClient, rawRowsBySource: {} };

    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "vm",
          type: "group",
          operator: "and",
          sourceScope: "vm",
          children: [
            { id: "r1", type: "rule", field: "efiSecureBoot", operator: "is_true" },
            { id: "r2", type: "rule", field: "annotation", operator: "empty" },
          ],
        },
      ],
    };

    expect(evaluateGlobalFilter(filter, context, fields)).toBe(true);
    expect(buildVmJoinKey("snap-1", "bank-app-01")).toBe("snap-1::bank-app-01");
  });

  it("serializes and parses clipboard payloads", () => {
    const filter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "vm",
          type: "group",
          operator: "and",
          sourceScope: "vm",
          children: [
            { id: "r1", type: "rule", field: "powerState", operator: "eq", value: "poweredOn" },
          ],
        },
      ],
    };

    const serialized = serializeGlobalFilter(filter);
    expect(parseSerializedGlobalFilter(serialized)).toEqual(filter);
  });

  it("rejects invalid clipboard payloads", () => {
    expect(() => parseSerializedGlobalFilter("{\"type\":\"other\"}")).toThrow();
    expect(() => parseSerializedGlobalFilter("not json")).toThrow();
  });

  it("collects only raw sources referenced by nested filter groups", () => {
    const activeFilter: GlobalFilterGroup = {
      id: "root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "vm",
          type: "group",
          operator: "and",
          sourceScope: "vm",
          children: [{ id: "r1", type: "rule", field: "powerState", operator: "eq", value: "poweredOn" }],
        },
        {
          id: "disk",
          type: "group",
          operator: "and",
          sourceScope: "vDisk",
          children: [{ id: "r2", type: "rule", field: "Capacity MiB", operator: "gt", value: "100", unit: "GiB" }],
        },
      ],
    };
    const previewFilter: GlobalFilterGroup = {
      id: "preview-root",
      type: "group",
      operator: "and",
      sourceScope: "root",
      children: [
        {
          id: "snapshot",
          type: "group",
          operator: "and",
          sourceScope: "vSnapshot",
          children: [],
        },
      ],
    };

    expect([...collectReferencedRawFilterSources(activeFilter, previewFilter)].sort()).toEqual(["vDisk", "vSnapshot"]);
  });

  it("adds lightweight raw field names without requiring raw rows", () => {
    const vm = makeVm();
    const fields = buildGlobalFilterFields([vm], [], [], {}, { vDisk: ["VM", "Capacity MiB"] });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "vDisk", key: "Capacity MiB", label: "Capacity MiB", dataType: "text" }),
      ]),
    );
  });
});
