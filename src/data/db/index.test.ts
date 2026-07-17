import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

beforeEach(() => {
  vi.resetModules();
  // Frische Factory => leere DB pro Test. Cast, falls die TS-Lib-Typen abweichen.
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

describe("v19 upgrade migration", () => {
  it("clears RVTools stores and drops legacy raw-sheet stores while preserving CDP data when upgrading from a v18 database", async () => {
    const { openDB } = await import("idb");

    // Seed a minimal legacy (pre-v19) schema directly against the shared fake IDBFactory,
    // mirroring the old rawSheets/rawSheetHeaders stores this migration removes.
    const legacyDb = await openDB("rvtools-analyzer", 18, {
      upgrade(db) {
        db.createObjectStore("snapshots", { keyPath: "snapshotId" });
        db.createObjectStore("entities_vm", { keyPath: "vmKey" });
        db.createObjectStore("rawSheets", { keyPath: ["snapshotId", "sheetName", "rowIndex"] });
        db.createObjectStore("rawSheetHeaders", { keyPath: ["snapshotId", "sheetName"] });
        db.createObjectStore("cdp_imports", { keyPath: "cdpImportId" });
      },
    });

    await legacyDb.put("snapshots", {
      snapshotId: "snap-legacy",
      vcenterId: "vc-1",
      vcenterDisplayName: "Legacy vCenter",
      exportTs: "2025-01-01T00:00:00.000Z",
      importedAt: "2025-01-01T00:00:00.000Z",
      fileName: "legacy.xlsx",
      fileChecksum: "legacy-chk",
      sheetStats: {},
    });
    await legacyDb.put("entities_vm", {
      vmKey: "vm-1::vc-1",
      snapshotId: "snap-legacy",
      vmName: "vm-1",
    });
    await legacyDb.put("rawSheets", {
      snapshotId: "snap-legacy",
      sheetName: "vInfo",
      rowIndex: 0,
      data: { VM: "vm-1" },
    });
    await legacyDb.put("rawSheetHeaders", {
      snapshotId: "snap-legacy",
      sheetName: "vInfo",
      headers: ["VM"],
    });
    await legacyDb.put("cdp_imports", {
      cdpImportId: "cdp-1",
      importedAt: "2025-01-01T00:00:00.000Z",
      fileName: "cdp.csv",
      fileChecksum: "cdp-chk",
      rowCount: 1,
      columnCount: 18,
    });
    legacyDb.close();

    // Fresh module import (module cache was reset in beforeEach) opens the same
    // fake-IndexedDB database at DB_VERSION 19, triggering the real upgrade handler.
    const { getDb } = await import("./index");
    const db = await getDb();

    expect(Array.from(db.objectStoreNames).includes("rawSheets" as any)).toBe(false);
    expect(Array.from(db.objectStoreNames).includes("rawSheetHeaders" as any)).toBe(false);
    expect(db.objectStoreNames.contains("rawSheetBlobs")).toBe(true);

    await expect(db.getAll("snapshots")).resolves.toHaveLength(0);
    await expect(db.getAll("entities_vm")).resolves.toHaveLength(0);

    const cdpImports = await db.getAll("cdp_imports");
    expect(cdpImports).toHaveLength(1);
    expect(cdpImports[0].cdpImportId).toBe("cdp-1");
  });
});

describe("getStoreDiagnostics", () => {
  it("returns zero counts for all stores on an empty database", async () => {
    const { getStoreDiagnostics } = await import("./index");
    const result = await getStoreDiagnostics();
    expect(result.length).toBeGreaterThan(0);
    for (const store of result) {
      expect(store.count).toBe(0);
      expect(store.estimatedSizeBytes).toBe(0);
    }
  });
});

describe("getStoreDiagnostics with data", () => {
  it("counts entries and estimates a non-zero size after inserting snapshots", async () => {
    const { putSnapshot, getStoreDiagnostics } = await import("./index");
    await putSnapshot({
      snapshotId: "snap-1",
      vcenterId: "vc-1",
      vcenterDisplayName: "Test vCenter",
      exportTs: "2026-01-01T00:00:00.000Z",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "test.xlsx",
      fileChecksum: "abc123",
      sheetStats: {},
      fileSizeBytes: 1024,
      importDurationMs: 500,
    });

    const result = await getStoreDiagnostics();
    const snapshotsStore = result.find((r) => r.storeName === "snapshots");
    expect(snapshotsStore?.count).toBe(1);
    expect(snapshotsStore?.estimatedSizeBytes).toBeGreaterThan(0);
  });
});

describe("getStorageEstimate", () => {
  it("returns a result shape indicating support or graceful fallback", async () => {
    const { getStorageEstimate } = await import("./index");
    const result = await getStorageEstimate();
    expect(typeof result.supported).toBe("boolean");
    if (!result.supported) {
      expect(result.usageBytes).toBeNull();
      expect(result.quotaBytes).toBeNull();
    }
  });
});

describe("timeSampleVmQuery", () => {
  it("returns zero rows and a duration-safe result on an empty database", async () => {
    const { timeSampleVmQuery } = await import("./index");
    const result = await timeSampleVmQuery();
    expect(result.store).toBe("entities_vm");
    expect(result.rowCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("getRawSheetFieldNames", () => {
  it("returns raw sheet field names without reading full sheet rows", async () => {
    const { getDb, getRawSheetFieldNames } = await import("./index");
    const { gzipJson } = await import("@/lib/compression");
    const db = await getDb();

    await db.put("rawSheetBlobs", {
      snapshotId: "snap-1",
      sheetName: "vDisk",
      headers: ["VM", "Disk", "Capacity MiB"],
      rowCount: 2,
      codec: "gzip-json-v1",
      data: await gzipJson([
        ["APP01", "Hard disk 1", 1024],
        ["APP02", "Hard disk 1", 2048],
      ]),
    });
    await db.put("rawSheetBlobs", {
      snapshotId: "snap-2",
      sheetName: "vDisk",
      headers: ["VM", "Datastore"],
      rowCount: 1,
      codec: "gzip-json-v1",
      data: await gzipJson([["APP03", "DS01"]]),
    });

    await expect(getRawSheetFieldNames(["snap-1", "snap-2"], "vDisk")).resolves.toEqual([
      "Capacity MiB",
      "Datastore",
      "Disk",
      "VM",
    ]);
  });
});

describe("maintenance settings and assignments", () => {
  it("persists settings and overwrites cluster assignments by vCenter and cluster name", async () => {
    const {
      getMaintenanceAssignments,
      getMaintenanceSettings,
      putMaintenanceAssignment,
      putMaintenanceSettings,
    } = await import("./index");

    await putMaintenanceSettings({
      id: "default",
      firstName: "Jörg",
      lastName: "Weiß",
      companyName: "Müller IT",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(getMaintenanceSettings()).resolves.toMatchObject({
      firstName: "Jörg",
      lastName: "Weiß",
      companyName: "Müller IT",
    });

    await putMaintenanceAssignment({
      vcenterId: "vc-1",
      clusterName: "CL-Prod",
      type: "Normal",
      windows: [],
      contacts: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await putMaintenanceAssignment({
      vcenterId: "vc-1",
      clusterName: "CL-Prod",
      type: "Spezial",
      windows: [],
      contacts: [{ firstName: "Max", lastName: "Mustermann" }],
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const assignments = await getMaintenanceAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      vcenterId: "vc-1",
      clusterName: "CL-Prod",
      type: "Spezial",
      contacts: [{ firstName: "Max", lastName: "Mustermann" }],
    });
  });
});

describe("deleteSnapshot", () => {
  const seedSnapshot = async (dbModule: typeof import("./index"), snapshotId: string, rowCount: number) => {
    const { putSnapshot, batchPut, getDb } = dbModule;
    const { gzipJson } = await import("@/lib/compression");
    await putSnapshot({
      snapshotId,
      vcenterId: `vc-${snapshotId}`,
      vcenterDisplayName: "Test vCenter",
      exportTs: "2026-01-01T00:00:00.000Z",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: `${snapshotId}.xlsx`,
      fileChecksum: `chk-${snapshotId}`,
      sheetStats: { vInfo: { rowCount, columnCount: 2 } },
    });
    const db = await getDb();
    const values = Array.from({ length: rowCount }, (_, i) => [`vm-${i}`, "poweredOn"]);
    await db.put("rawSheetBlobs", {
      snapshotId,
      sheetName: "vInfo",
      headers: ["VM", "Powerstate"],
      rowCount,
      codec: "gzip-json-v1",
      data: await gzipJson(values),
    });
    await batchPut("entities_vm", Array.from({ length: 5 }, (_, i) => ({
      vmKey: `vm-${i}::vc-${snapshotId}`,
      snapshotId,
      vmName: `vm-${i}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testdaten benötigen nicht alle NormalizedVm-Felder
    })) as any);
  };

  it("deletes the raw sheet blob and entities of one snapshot, keeps others, and reports monotonic progress up to 100", async () => {
    const dbModule = await import("./index");
    const { deleteSnapshot, getSnapshots, getRawSheetRows, getBySnapshotIds } = dbModule;
    // Zeilenreiche Sheets, um zu bestätigen, dass Kompression/Dekompression auch bei
    // realistischer Größe funktioniert — die Löschung selbst ist unabhängig von rowCount,
    // da ein Blob immer ein einziger Record ist.
    await seedSnapshot(dbModule, "snap-del", 6001);
    await seedSnapshot(dbModule, "snap-keep", 10);

    const percents: number[] = [];
    await deleteSnapshot("snap-del", (p) => percents.push(p.percent));

    expect(percents.length).toBeGreaterThan(1);
    expect(percents.at(-1)).toBe(100);
    expect([...percents]).toEqual([...percents].sort((a, b) => a - b));

    const snapshots = await getSnapshots();
    expect(snapshots.map((s) => s.snapshotId)).toEqual(["snap-keep"]);
    await expect(getRawSheetRows(["snap-del"], "vInfo")).resolves.toHaveLength(0);
    await expect(getRawSheetRows(["snap-keep"], "vInfo")).resolves.toHaveLength(10);
    await expect(getBySnapshotIds("entities_vm", ["snap-del"])).resolves.toHaveLength(0);
    await expect(getBySnapshotIds("entities_vm", ["snap-keep"])).resolves.toHaveLength(5);
  }, 20000);

  it("estimates a plausible, compressed per-snapshot size and clears everything via deleteAllData with progress", async () => {
    const dbModule = await import("./index");
    const { deleteAllData, estimateSnapshotSizesBytes, getSnapshots, getRawSheetRows } = dbModule;
    await seedSnapshot(dbModule, "snap-1", 500);

    const sizes = await estimateSnapshotSizesBytes(["snap-1", "snap-unbekannt"]);
    // Verifiziert gegen echte gzip-Kompression dieser Testdaten (~1.2-1.7 KB) —
    // deutlich unter dem, was 500 unkomprimierte Zeilen bräuchten (>5000 Bytes).
    expect(sizes["snap-1"]).toBeGreaterThan(500);
    expect(sizes["snap-1"]).toBeLessThan(5000);
    expect(sizes["snap-unbekannt"]).toBe(0);

    const percents: number[] = [];
    await deleteAllData((p) => percents.push(p.percent));
    expect(percents.at(-1)).toBe(100);

    await expect(getSnapshots()).resolves.toHaveLength(0);
    await expect(getRawSheetRows(["snap-1"], "vInfo")).resolves.toHaveLength(0);
  });
});

describe("Tech-Info import listing and deletion", () => {
  it("lists Tech-Info imports and restores older latest rows after deleting the newest import", async () => {
    const {
      batchPutTechInfoLatest,
      batchPutTechInfoRows,
      deleteTechInfoImport,
      getTechInfoImports,
      getTechInfoLatestByVmNames,
      putTechInfoImport,
    } = await import("./index");

    await putTechInfoImport({
      techInfoImportId: "tech-old",
      importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "tech-old.xlsx",
      fileChecksum: "old",
      sheetName: "Tech-Info",
      rowCount: 1,
      columnCount: 3,
    });
    await putTechInfoImport({
      techInfoImportId: "tech-new",
      importedAt: "2026-01-02T00:00:00.000Z",
      fileName: "tech-new.xlsx",
      fileChecksum: "new",
      sheetName: "Tech-Info",
      rowCount: 1,
      columnCount: 3,
    });

    await batchPutTechInfoRows([
      {
        techInfoImportId: "tech-old",
        rowIndex: 0,
        vmName: "APP01",
        vmNameNorm: "app01",
        importedAt: "2026-01-01T00:00:00.000Z",
        rawData: { Name: "APP01", Servertyp: "alt", Betriebssystem: "Windows" },
      },
      {
        techInfoImportId: "tech-new",
        rowIndex: 0,
        vmName: "APP01",
        vmNameNorm: "app01",
        importedAt: "2026-01-02T00:00:00.000Z",
        rawData: { Name: "APP01", Servertyp: "neu", Betriebssystem: "Linux" },
      },
    ]);
    await batchPutTechInfoLatest([
      {
        vmNameNorm: "app01",
        vmName: "APP01",
        importedAt: "2026-01-02T00:00:00.000Z",
        techInfoImportId: "tech-new",
        rowIndex: 0,
        serverType: "neu",
        maintenanceWindow: null,
        operatingSystem: "Linux",
        comment: null,
        sysv: null,
        sysvDepartment: null,
        sysvDeputy: null,
        sysvDeputyDepartment: null,
        bz: null,
        clusterFromTechInfo: null,
        cvBackup: null,
        az: null,
      },
    ]);

    const imports = await getTechInfoImports();
    expect(imports.map((entry) => entry.techInfoImportId)).toEqual(["tech-new", "tech-old"]);

    await deleteTechInfoImport("tech-new");

    const remainingImports = await getTechInfoImports();
    expect(remainingImports.map((entry) => entry.techInfoImportId)).toEqual(["tech-old"]);

    const [latest] = await getTechInfoLatestByVmNames(["APP01"]);
    expect(latest.techInfoImportId).toBe("tech-old");
    expect(latest.serverType).toBe("alt");
    expect(latest.operatingSystem).toBe("Windows");
  });
});

describe("CDP import listing and deletion", () => {
  const makeLatest = (over: Partial<import("@/domain/models/types").CdpLatest>): import("@/domain/models/types").CdpLatest => ({
    hostAdapterKey: "esx01::vmnic0",
    hostNorm: "esx01",
    host: "esx01",
    adapter: "vmnic0",
    importedAt: "2026-01-02T00:00:00.000Z",
    cdpImportId: "cdp-new",
    rowIndex: 0,
    vcenter: null, cluster: null, hostConnectionState: null, linkStatus: null,
    mac: null, cdpDeviceId: null, cdpPortId: null, cdpMgmtIp: null,
    cdpSwitchAddress: null, cdpPlatform: null, cdpSoftware: null,
    nativeVlan: null, mtu: null, cdpAvailable: null, queryStatus: null,
    ...over,
  });

  it("lists CDP imports and restores older latest rows after deleting the newest import", async () => {
    const {
      batchPutCdpLatest, batchPutCdpRows, deleteCdpImport,
      getCdpImports, getAllCdpLatest, getCdpLatestByHostAdapterKeys, putCdpImport,
    } = await import("./index");

    await putCdpImport({
      cdpImportId: "cdp-old", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp-old.csv", fileChecksum: "old", rowCount: 1, columnCount: 18,
    });
    await putCdpImport({
      cdpImportId: "cdp-new", importedAt: "2026-01-02T00:00:00.000Z",
      fileName: "cdp-new.csv", fileChecksum: "new", rowCount: 1, columnCount: 18,
    });

    await batchPutCdpRows([
      {
        cdpImportId: "cdp-old", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-01T00:00:00.000Z",
        rawData: { VMHost: "esx01", PhysicalAdapter: "vmnic0", CDPDeviceID: "switch-alt", CDPAvailable: "True" },
      },
      {
        cdpImportId: "cdp-new", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-02T00:00:00.000Z",
        rawData: { VMHost: "esx01", PhysicalAdapter: "vmnic0", CDPDeviceID: "switch-neu", CDPAvailable: "True" },
      },
    ]);
    await batchPutCdpLatest([makeLatest({ cdpDeviceId: "switch-neu", cdpAvailable: true })]);

    const imports = await getCdpImports();
    expect(imports.map((entry) => entry.cdpImportId)).toEqual(["cdp-new", "cdp-old"]);

    await deleteCdpImport("cdp-new");

    const remaining = await getCdpImports();
    expect(remaining.map((entry) => entry.cdpImportId)).toEqual(["cdp-old"]);

    const [latest] = await getCdpLatestByHostAdapterKeys(["esx01::vmnic0"]);
    expect(latest.cdpImportId).toBe("cdp-old");
    expect(latest.cdpDeviceId).toBe("switch-alt");

    const all = await getAllCdpLatest();
    expect(all).toHaveLength(1);
  });

  it("removes latest entries entirely when the only import is deleted", async () => {
    const { batchPutCdpLatest, batchPutCdpRows, deleteCdpImport, getAllCdpLatest, putCdpImport } =
      await import("./index");

    await putCdpImport({
      cdpImportId: "cdp-only", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp.csv", fileChecksum: "only", rowCount: 1, columnCount: 18,
    });
    await batchPutCdpRows([
      {
        cdpImportId: "cdp-only", rowIndex: 0, host: "esx02", hostNorm: "esx02",
        adapter: "vmnic1", hostAdapterKey: "esx02::vmnic1",
        importedAt: "2026-01-01T00:00:00.000Z",
        rawData: { VMHost: "esx02", PhysicalAdapter: "vmnic1", CDPDeviceID: "sw", CDPAvailable: "True" },
      },
    ]);
    await batchPutCdpLatest([
      makeLatest({ hostAdapterKey: "esx02::vmnic1", hostNorm: "esx02", host: "esx02", adapter: "vmnic1", cdpImportId: "cdp-only", importedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    await deleteCdpImport("cdp-only");
    await expect(getAllCdpLatest()).resolves.toHaveLength(0);
  });

  it("estimates per-import sizes and includes cdp stores in deleteAllData", async () => {
    const { putCdpImport, batchPutCdpRows, estimateCdpImportSizesBytes, deleteAllData, getCdpImports } =
      await import("./index");
    await putCdpImport({
      cdpImportId: "cdp-1", importedAt: "2026-01-01T00:00:00.000Z",
      fileName: "cdp.csv", fileChecksum: "c1", rowCount: 2, columnCount: 18,
    });
    await batchPutCdpRows([
      {
        cdpImportId: "cdp-1", rowIndex: 0, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic0", hostAdapterKey: "esx01::vmnic0",
        importedAt: "2026-01-01T00:00:00.000Z", rawData: { VMHost: "esx01" },
      },
      {
        cdpImportId: "cdp-1", rowIndex: 1, host: "esx01", hostNorm: "esx01",
        adapter: "vmnic1", hostAdapterKey: "esx01::vmnic1",
        importedAt: "2026-01-01T00:00:00.000Z", rawData: { VMHost: "esx01" },
      },
    ]);

    const sizes = await estimateCdpImportSizesBytes(["cdp-1", "cdp-unbekannt"]);
    expect(sizes["cdp-1"]).toBeGreaterThan(0);
    expect(sizes["cdp-unbekannt"]).toBe(0);

    await deleteAllData();
    await expect(getCdpImports()).resolves.toHaveLength(0);
  });
});
