import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as XLSX from "@e965/xlsx";
import { persistRawSheetBlobs, normalizeSnapshots } from "@/domain/services/importService";
import { gunzipJson } from "@/lib/compression";
import { parseWorkbookBuffer } from "@/workers/parser.worker";
import type { ParsedSheetData, RawSheetBlob } from "@/domain/models/types";

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sheet(rows: Record<string, unknown>[]): ParsedSheetData {
  return { sheetName: "vSnapshot", headers: Object.keys(rows[0] ?? {}), rows };
}

function workbookFile(
  fileName: string,
  sheets: Record<string, Record<string, unknown>[]>,
): File {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  }
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const file = new File([buffer], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return Object.assign(file, {
    arrayBuffer: async () => buffer.slice(0),
  });
}

function rvtoolsWorkbook(fileName: string, vmName: string, vcenterName: string): File {
  return workbookFile(fileName, {
    vInfo: [{
      VM: vmName,
      "VM UUID": `uuid-${vmName}`,
      Cluster: "CL-Prod",
      Host: `esx-${vmName}.lab.local`,
      CPUs: 4,
      Memory: 8192,
      Powerstate: "poweredOn",
    }],
    vHost: [{
      Host: `esx-${vmName}.lab.local`,
      Cluster: "CL-Prod",
      "ESX Version": "VMware ESXi 8.0.3 build-24784735",
      "# Cores": 16,
      Memory: 131072,
    }],
    vSource: [{ "VI SDK Server": vcenterName }],
  });
}

function installParserWorkerStub() {
  class ParserWorkerStub {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(message: { payload: { buffer: ArrayBuffer } }) {
      void parseWorkbookBuffer(message.payload.buffer)
        .then((payload) => {
          this.onmessage?.({ data: { type: "PARSE_COMPLETE", payload } } as MessageEvent);
        })
        .catch((error: unknown) => {
          this.onmessage?.({
            data: {
              type: "PARSE_ERROR",
              payload: error instanceof Error ? error.message : String(error),
            },
          } as MessageEvent);
        });
    }

    terminate() {}
  }

  vi.stubGlobal("Worker", ParserWorkerStub);
}

describe("normalizeSnapshots", () => {
  it("reads sizeMiB from RVTools column 'Size MiB (total)'", () => {
    const result = normalizeSnapshots(
      sheet([
        {
          VM: "srv-app-01",
          "Snapshot Name": "vor Update",
          "Date / time": "2026/06/20 08:00:00",
          "Size MiB (total)": 2048,
          "Size MiB (vmsn)": 128,
          Quiesced: "False",
        },
      ]),
      "snap-1",
      "vc-1",
    );
    expect(result).toHaveLength(1);
    expect(result[0].sizeMiB).toBe(2048);
  });

  it("keeps legacy fallback columns for sizeMiB", () => {
    const result = normalizeSnapshots(sheet([{ VM: "srv-app-02", "Size MiB": 512 }]), "snap-1", "vc-1");
    expect(result[0].sizeMiB).toBe(512);
  });
});

describe("persistRawSheetBlobs", () => {
  it("persists only allow-listed sheets as one compressed blob per sheet, dropping denylisted columns", async () => {
    const sheets: ParsedSheetData[] = [
      {
        sheetName: "vInfo",
        headers: ["VM", "VI SDK UUID"],
        rows: [
          { VM: "APP01", "VI SDK UUID": "uuid-a" },
          { VM: "APP02", "VI SDK UUID": "uuid-b" },
        ],
      },
      {
        sheetName: "vUnknown",
        headers: ["Ignored"],
        rows: [{ Ignored: "x" }],
      },
    ];
    const putBlobs: RawSheetBlob[] = [];

    const persisted = await persistRawSheetBlobs({
      sheets,
      snapshotId: "snap-1",
      putBlob: async (blob) => {
        putBlobs.push(blob);
      },
    });

    expect(persisted).toBe(2);
    expect(putBlobs).toHaveLength(1);
    expect(putBlobs[0].sheetName).toBe("vInfo");
    expect(putBlobs[0].headers).toEqual(["VM"]);
    expect(putBlobs[0].rowCount).toBe(2);
    expect(putBlobs[0].codec).toBe("gzip-json-v1");

    const values = await gunzipJson<unknown[][]>(putBlobs[0].data);
    expect(values).toEqual([["APP01"], ["APP02"]]);
  });

  it("stores each sheet as a single compressed blob and rehydrates every column, including ones only present in later rows", async () => {
    const { persistRawSheetBlobs } = await import("@/domain/services/importService");
    const { getRawSheetRows, getRawSheetFieldNames, getDb } = await import("@/data/db");
    const sheets: ParsedSheetData[] = [
      {
        sheetName: "vInfo",
        // headers stammt (wie im Parser) nur aus Zeile 0 – "Notes" fehlt hier bewusst.
        headers: ["VM", "CPUs"],
        rows: [
          { VM: "APP01", CPUs: 4 },
          { VM: "APP02", CPUs: 2, Notes: "extra" },
        ],
      },
    ];

    await persistRawSheetBlobs({ sheets, snapshotId: "snap-compact" });

    const db = await getDb();
    const blob = await db.get("rawSheetBlobs", ["snap-compact", "vInfo"]);
    expect(blob?.headers).toEqual(["VM", "CPUs", "Notes"]);
    expect(blob?.rowCount).toBe(2);

    const rows = await getRawSheetRows(["snap-compact"], "vInfo");
    expect(rows).toHaveLength(2);
    expect(rows[0].data).toEqual({ VM: "APP01", CPUs: 4, Notes: null });
    expect(rows[1].data).toEqual({ VM: "APP02", CPUs: 2, Notes: "extra" });

    await expect(getRawSheetFieldNames(["snap-compact"], "vInfo")).resolves.toEqual([
      "CPUs",
      "Notes",
      "VM",
    ]);
  });
});

describe("importRvtoolsXlsx", () => {
  it("imports a real RVTools workbook into snapshot metadata, normalized entities, and raw sheets", async () => {
    installParserWorkerStub();
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");
    const {
      getBySnapshotIds,
      getRawSheetRows,
      getSnapshots,
    } = await import("@/data/db");
    const file = workbookFile("RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx", {
      vInfo: [
        {
          VM: "APP01",
          "VM UUID": "uuid-app01",
          Cluster: "CL-Prod",
          Host: "esx01.lab.local",
          CPUs: 4,
          Memory: 8192,
          Powerstate: "poweredOn",
        },
      ],
      vHost: [
        {
          Host: "esx01.lab.local",
          Cluster: "CL-Prod",
          "ESX Version": "VMware ESXi 8.0.3 build-24784735",
          "# Cores": 16,
          Memory: 131072,
        },
      ],
      vCluster: [{ Name: "CL-Prod", Datacenter: "DC01", NumHosts: 1 }],
      vDatastore: [{ Name: "DS01", "Capacity MiB": 102400, "Free MiB": 51200 }],
      vSnapshot: [{ VM: "APP01", "Snapshot Name": "pre-change", "Size MiB (total)": 2048 }],
      vHealth: [{ Entity: "APP01", "Message type": "warning", Message: "Check VM tools" }],
      vSource: [{ "VI SDK Server": "vcsa01.lab.local" }],
    });

    const result = await importRvtoolsXlsx(file);

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("rvtools");
    expect(result.snapshotId).toBeTruthy();

    const snapshots = await getSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      snapshotId: result.snapshotId,
      vcenterId: "vcsa01.lab.local",
      vcenterDisplayName: "vcsa01.lab.local",
      fileName: file.name,
      fileSizeBytes: file.size,
    });
    expect(snapshots[0].importDurationMs).toBeGreaterThanOrEqual(0);

    const snapshotIds = [result.snapshotId!];
    const [vm] = await getBySnapshotIds("entities_vm", snapshotIds);
    expect(vm).toMatchObject({
      vmName: "APP01",
      cluster: "CL-Prod",
      host: "esx01.lab.local",
      cpuCount: 4,
      memoryMiB: 8192,
    });

    const [host] = await getBySnapshotIds("entities_host", snapshotIds);
    expect(host).toMatchObject({
      host: "esx01.lab.local",
      version: "8.0.3",
      build: "24784735",
    });

    const [datastore] = await getBySnapshotIds("entities_datastore", snapshotIds);
    expect(datastore).toMatchObject({
      name: "DS01",
      inUseMiB: 51200,
      freePct: 50,
    });

    const [snapshot] = await getBySnapshotIds("entities_snapshot", snapshotIds);
    expect(snapshot).toMatchObject({
      vmName: "APP01",
      snapshotName: "pre-change",
      sizeMiB: 2048,
    });

    const rawInfoRows = await getRawSheetRows(snapshotIds, "vInfo");
    expect(rawInfoRows).toHaveLength(1);
    expect(rawInfoRows[0].data).toMatchObject({ VM: "APP01", CPUs: 4 });
  });

  it("replaces all existing exports of the same vCenter", async () => {
    installParserWorkerStub();
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");
    const { getRawSheetRows, getSnapshots } = await import("@/data/db");
    const firstFile = rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    );
    const secondFile = rvtoolsWorkbook(
      "RVTools_export_all_2026_02_23_07_05_vcsa01.lab.local.xlsx",
      "APP02",
      "vcsa01.lab.local",
    );

    const first = await importRvtoolsXlsx(firstFile);
    const second = await importRvtoolsXlsx(secondFile);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    const snapshots = await getSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.snapshotId).toBe(second.snapshotId);
    await expect(getRawSheetRows([first.snapshotId!], "vInfo")).resolves.toEqual([]);
    await expect(getRawSheetRows([second.snapshotId!], "vInfo")).resolves.toMatchObject([
      { data: { VM: "APP02" } },
    ]);
  });

  it("keeps exports from different vCenters", async () => {
    installParserWorkerStub();
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");
    const { getSnapshots } = await import("@/data/db");

    await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    ));
    await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa02.lab.local.xlsx",
      "APP02",
      "vcsa02.lab.local",
    ));

    const snapshots = await getSnapshots();
    expect(snapshots.map((snapshot) => snapshot.vcenterId).sort()).toEqual([
      "vcsa01.lab.local",
      "vcsa02.lab.local",
    ]);
  });

  it("reports detailed progress while replacing an existing vCenter export", async () => {
    installParserWorkerStub();
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");
    const progress: Array<{ step: string; detail?: string }> = [];

    await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    ));
    await importRvtoolsXlsx(
      rvtoolsWorkbook(
        "RVTools_export_all_2026_02_23_07_05_vcsa01.lab.local.xlsx",
        "APP02",
        "vcsa01.lab.local",
      ),
      (nextProgress) => progress.push(nextProgress),
    );

    expect(progress).toContainEqual(expect.objectContaining({
      step: "Vorherige Exporte ersetzen",
      detail: expect.stringContaining("vcsa01.lab.local"),
    }));
    expect(progress).toContainEqual(expect.objectContaining({
      step: "Rohdaten speichern",
      detail: expect.stringContaining("Sheets"),
    }));
  });

  it("removes the persisted raw sheet blob when entity persistence fails", async () => {
    installParserWorkerStub();
    const db = await import("@/data/db");
    const originalBatchPut = db.batchPut;
    let batchPutCalls = 0;
    // Rohdaten-Persistenz läuft nicht mehr über batchPut (siehe persistRawSheetBlobs),
    // daher ist der erste batchPut-Aufruf bereits die erste Entitäten-Batch (entities_vm).
    // Das Blob wurde zu diesem Zeitpunkt schon erfolgreich geschrieben — der Test prüft,
    // dass der Rollback es trotzdem wieder entfernt.
    vi.spyOn(db, "batchPut").mockImplementation(async (...args) => {
      batchPutCalls += 1;
      if (batchPutCalls === 1) throw new Error("IndexedDB quota exceeded");
      await originalBatchPut(...args);
    });
    const { importRvtoolsXlsx } = await import("@/domain/services/importService");

    const result = await importRvtoolsXlsx(rvtoolsWorkbook(
      "RVTools_export_all_2026_02_22_07_05_vcsa01.lab.local.xlsx",
      "APP01",
      "vcsa01.lab.local",
    ));

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Import für vcsa01.lab.local fehlgeschlagen"));
    expect(result.errors).toContainEqual(expect.stringContaining("IndexedDB quota exceeded"));
    expect(await db.getSnapshots()).toEqual([]);
    expect(await (await db.getDb()).getAll("rawSheetBlobs")).toEqual([]);
  });
});
