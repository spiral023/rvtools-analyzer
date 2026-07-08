import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

beforeEach(() => {
  vi.resetModules();
  // Frische Factory => leere DB pro Test. Cast, falls die TS-Lib-Typen abweichen.
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
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
    const { batchPut, getRawSheetFieldNames } = await import("./index");

    await batchPut("rawSheets", [
      {
        snapshotId: "snap-1",
        sheetName: "vDisk",
        rowIndex: 0,
        data: { VM: "APP01", Disk: "Hard disk 1", "Capacity MiB": 1024 },
      },
      {
        snapshotId: "snap-1",
        sheetName: "vDisk",
        rowIndex: 1,
        data: { VM: "APP02", Disk: "Hard disk 1", "Capacity MiB": 2048, "Thin": true },
      },
      {
        snapshotId: "snap-2",
        sheetName: "vDisk",
        rowIndex: 0,
        data: { VM: "APP03", Datastore: "DS01" },
      },
    ]);

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
    const { putSnapshot, batchPut } = dbModule;
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
    await batchPut("rawSheets", Array.from({ length: rowCount }, (_, i) => ({
      snapshotId,
      sheetName: "vInfo",
      rowIndex: i,
      data: { VM: `vm-${i}`, "Powerstate": "poweredOn" },
    })));
    await batchPut("entities_vm", Array.from({ length: 5 }, (_, i) => ({
      vmKey: `vm-${i}::vc-${snapshotId}`,
      snapshotId,
      vmName: `vm-${i}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testdaten benötigen nicht alle NormalizedVm-Felder
    })) as any);
  };

  it("deletes raw rows and entities of one snapshot, keeps others, and reports monotonic progress up to 100", async () => {
    const dbModule = await import("./index");
    const { deleteSnapshot, getSnapshots, getRawSheetRows, getBySnapshotIds } = dbModule;
    // 6001 Zeilen => mehr als ein Lösch-Chunk (5000), damit der Chunk-Pfad getestet wird
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

  it("estimates a plausible per-snapshot size and clears everything via deleteAllData with progress", async () => {
    const dbModule = await import("./index");
    const { deleteAllData, estimateSnapshotSizesBytes, getSnapshots, getRawSheetRows } = dbModule;
    await seedSnapshot(dbModule, "snap-1", 500);

    const sizes = await estimateSnapshotSizesBytes(["snap-1", "snap-unbekannt"]);
    expect(sizes["snap-1"]).toBeGreaterThan(500 * 10);
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
