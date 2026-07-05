import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as XLSX from "@e965/xlsx";
import { persistAllowedRawSheetRows, normalizeSnapshots } from "@/domain/services/importService";
import { parseWorkbookBuffer } from "@/workers/parser.worker";
import type { ParsedSheetData } from "@/domain/models/types";

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

describe("persistAllowedRawSheetRows", () => {
  it("persists raw sheet rows in bounded batches", async () => {
    const sheets: ParsedSheetData[] = [
      {
        sheetName: "vInfo",
        headers: ["VM"],
        rows: [
          { VM: "APP01" },
          { VM: "APP02" },
          { VM: "APP03" },
        ],
      },
      {
        sheetName: "vUnknown",
        headers: ["Ignored"],
        rows: [{ Ignored: "x" }],
      },
    ];
    const batches: number[] = [];

    const persisted = await persistAllowedRawSheetRows({
      sheets,
      snapshotId: "snap-1",
      batchSize: 2,
      putBatch: async (rows) => {
        batches.push(rows.length);
      },
    });

    expect(persisted).toBe(3);
    expect(batches).toEqual([2, 1]);
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
});
