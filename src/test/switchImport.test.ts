import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const SWITCH_TXT = [
  "sw01# sh int statu | in connected",
  "",
  "mgmt0         --                 connected routed    full    1000    --        ",
  "",
  "Eth1/1        esxxsrv2270_Port2(T connected trunk     full    25G     SFP-H25GB-CU3M",
  "",
  "sw02# sh int statu | in notconnec",
  "",
  "Eth1/7        esxxvdi2215_Port0(T notconnec trunk     auto    auto    SFP-H25GB-CU3M",
].join("\n");

describe("importSwitchTxt", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("importiert Interfaces aus mehreren Switches und befüllt switch_latest", async () => {
    const { importSwitchTxt } = await import("@/domain/services/importService");
    const { getAllSwitchLatest, getSwitchImports } = await import("@/data/db");

    const warnings: string[] = [];
    const result = await importSwitchTxt(
      new File(["x"], "switch.txt", { type: "text/plain" }), "chk-1", SWITCH_TXT, warnings, [], () => {},
    );

    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("switch");
    expect(warnings).toHaveLength(0);

    const latest = await getAllSwitchLatest();
    expect(latest).toHaveLength(3);
    expect(latest.map((l) => l.interface).sort()).toEqual(["Eth1/1", "Eth1/7", "mgmt0"]);

    const imports = await getSwitchImports();
    expect(imports).toHaveLength(1);
    expect(imports[0].rowCount).toBe(3);
    expect(imports[0].switchCount).toBe(2);
  });

  it("lehnt Duplikate per Checksum ab", async () => {
    const { importSwitchTxt } = await import("@/domain/services/importService");
    const file = new File(["x"], "switch.txt", { type: "text/plain" });

    await importSwitchTxt(file, "chk-dup", SWITCH_TXT, [], [], () => {});
    const second = await importSwitchTxt(file, "chk-dup", SWITCH_TXT, [], [], () => {});

    expect(second.success).toBe(false);
    expect(second.errors[0]).toContain("bereits importiert");
  });

  it("latest wins: zweiter Import überschreibt dasselbe Switch+Interface", async () => {
    const { importSwitchTxt } = await import("@/domain/services/importService");
    const { getAllSwitchLatest } = await import("@/data/db");

    const first = [
      "sw01# sh int statu | in connected",
      "",
      "Eth1/1        old_description(T   connected trunk     full    25G     SFP-H25GB-CU3M",
    ].join("\n");
    const second = [
      "sw01# sh int statu | in connected",
      "",
      "Eth1/1        new_description(T   connected trunk     full    25G     SFP-H25GB-CU3M",
    ].join("\n");

    await importSwitchTxt(new File(["a"], "switch-1.txt", { type: "text/plain" }), "chk-a", first, [], [], () => {});
    await importSwitchTxt(new File(["b"], "switch-2.txt", { type: "text/plain" }), "chk-b", second, [], [], () => {});

    const latest = await getAllSwitchLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].description).toBe("new_description");
  });

  it("meldet einen Fehler, wenn keine Switch-Daten gefunden werden", async () => {
    const { importSwitchTxt } = await import("@/domain/services/importService");
    const result = await importSwitchTxt(
      new File(["x"], "empty.txt", { type: "text/plain" }), "chk-empty", "kein Prompt hier", [], [], () => {},
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Keine Switch-Daten");
  });
});
