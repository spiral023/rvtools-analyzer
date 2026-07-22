import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { WorkerParseResult } from "@/domain/models/types";

const HEADERS = ["ip", "name", "interface", "mac", "dnsname", "vlan"];

function makeParsed(rows: Record<string, unknown>[], headers = HEADERS): WorkerParseResult {
  return {
    fileKind: "eramon-l2",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-22T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  ip: "10.18.4.31", name: "grznxx93oc3-35.rbgooe.at", interface: "Ethernet1/23",
  mac: "01:90:8F:E5:D3:73", dnsname: "sbc01.at", vlan: "158", ...over,
});

describe("importEramonL2Csv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("hält gleiche MAC auf mehreren VLANs/Ports als getrennte Zeilen", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    const result = await importEramonL2Csv(
      new File(["x"], "l2.csv", { type: "text/csv" }), "chk-1",
      makeParsed([
        row({ interface: "Ethernet1/23", vlan: "158" }),
        row({ interface: "Ethernet1/21", vlan: "303" }),
        row({ interface: "Ethernet1/20", vlan: "304" }),
      ]),
      [], [], () => {},
    );
    expect(result.success).toBe(true);
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(3);
    expect(latest.map((l) => l.vlan).sort()).toEqual(["158", "303", "304"]);
  });

  it("überspringt Zeilen ohne name oder interface mit Warnung", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    const warnings: string[] = [];
    await importEramonL2Csv(
      new File(["x"], "l2.csv"), "chk-2",
      makeParsed([row(), row({ name: "" }), row({ interface: null })]),
      warnings, [], () => {},
    );
    expect(warnings.some((w) => w.includes("Zeile 2"))).toBe(true);
    expect(await getAllEramonL2Latest()).toHaveLength(1);
  });

  it("latest wins bei Re-Import desselben Switch+Interface+MAC+VLAN", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest } = await import("@/data/db");
    await importEramonL2Csv(new File(["a"], "1.csv"), "a", makeParsed([row({ ip: "10.0.0.1" })]), [], [], () => {});
    await importEramonL2Csv(new File(["b"], "2.csv"), "b", makeParsed([row({ ip: "10.0.0.99" })]), [], [], () => {});
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(1);
    expect(latest[0].ip).toBe("10.0.0.99");
  });

  it("deleteEramonL2Import baut Latest neu auf", async () => {
    const { importEramonL2Csv } = await import("@/domain/services/importService");
    const { getAllEramonL2Latest, getEramonL2Imports, deleteEramonL2Import } = await import("@/data/db");
    await importEramonL2Csv(new File(["a"], "1.csv"), "a", makeParsed([row({ ip: "10.0.0.1" })]), [], [], () => {});
    await importEramonL2Csv(new File(["b"], "2.csv"), "b", makeParsed([row({ ip: "10.0.0.99" })]), [], [], () => {});
    const imports = await getEramonL2Imports();
    const newer = imports.find((i) => i.fileChecksum === "b")!;
    await deleteEramonL2Import(newer.l2ImportId);
    const latest = await getAllEramonL2Latest();
    expect(latest).toHaveLength(1);
    expect(latest[0].ip).toBe("10.0.0.1");
  });
});
