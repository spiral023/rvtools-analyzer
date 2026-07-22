import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { WorkerParseResult } from "@/domain/models/types";

const HEADERS = ["device_name", "port_name", "port_desc", "bandbreite", "port_status"];

function makeParsed(rows: Record<string, unknown>[], headers = HEADERS): WorkerParseResult {
  return {
    fileKind: "eramon-iface",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-22T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  device_name: "SWITCH_A", port_name: "Ethernet1/53",
  port_desc: "SERVER_A(vpc100-ch1)", bandbreite: "1E+11", port_status: "1", ...over,
});

describe("importEramonIfaceCsv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("importiert Zeilen, überspringt leere Switch/Port mit Warnung, parst Bandbreite", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest, getEramonIfaceImports } = await import("@/data/db");
    const warnings: string[] = [];
    const result = await importEramonIfaceCsv(
      new File(["x"], "iface.csv", { type: "text/csv" }), "chk-1",
      makeParsed([
        row(),
        row({ port_name: "Ethernet1/2", port_desc: "", bandbreite: 25000000000, port_status: "2" }),
        row({ device_name: "" }),
        row({ port_name: null }),
      ]),
      warnings, [], () => {},
    );

    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("eramon-iface");
    expect(warnings.some((w) => w.includes("Zeile 3"))).toBe(true);

    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(2);
    const active = latest.find((l) => l.portName === "Ethernet1/53")!;
    expect(active.bandbreiteBps).toBe(100000000000);
    expect(active.statusLabel).toBe("aktiv");
    const down = latest.find((l) => l.portName === "Ethernet1/2")!;
    expect(down.bandbreiteBps).toBe(25000000000);
    expect(down.statusLabel).toBe("down");

    const imports = await getEramonIfaceImports();
    expect(imports[0].switchCount).toBe(1);
  });

  it("lehnt Duplikate per Checksum ab", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const file = new File(["x"], "iface.csv", { type: "text/csv" });
    await importEramonIfaceCsv(file, "dup", makeParsed([row()]), [], [], () => {});
    const second = await importEramonIfaceCsv(file, "dup", makeParsed([row()]), [], [], () => {});
    expect(second.success).toBe(false);
    expect(second.errors[0]).toContain("bereits importiert");
  });

  it("latest wins über Importe hinweg für denselben Switch+Port", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest } = await import("@/data/db");
    await importEramonIfaceCsv(new File(["a"], "1.csv"), "a", makeParsed([row({ port_status: "1" })]), [], [], () => {});
    await importEramonIfaceCsv(new File(["b"], "2.csv"), "b", makeParsed([row({ port_status: "2" })]), [], [], () => {});
    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].statusLabel).toBe("down");
  });

  it("deleteEramonIfaceImport baut Latest aus verbleibenden Rows neu auf", async () => {
    const { importEramonIfaceCsv } = await import("@/domain/services/importService");
    const { getAllEramonIfaceLatest, getEramonIfaceImports, deleteEramonIfaceImport } = await import("@/data/db");
    await importEramonIfaceCsv(new File(["a"], "1.csv"), "a", makeParsed([row({ port_status: "1" })]), [], [], () => {});
    await importEramonIfaceCsv(new File(["b"], "2.csv"), "b", makeParsed([row({ port_status: "2" })]), [], [], () => {});
    const imports = await getEramonIfaceImports();
    const newer = imports.find((i) => i.fileChecksum === "b")!;
    await deleteEramonIfaceImport(newer.ifaceImportId);
    const latest = await getAllEramonIfaceLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].statusLabel).toBe("aktiv");
  });
});
