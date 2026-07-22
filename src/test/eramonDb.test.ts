import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";

describe("Eramon-DB-Schema", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("legt die sechs Eramon-Stores an", async () => {
    const { getDb } = await import("@/data/db");
    const db = await getDb();
    const names = Array.from(db.objectStoreNames);
    for (const store of [
      "eramon_iface_imports", "eramon_iface_rows", "eramon_iface_latest",
      "eramon_l2_imports", "eramon_l2_rows", "eramon_l2_latest",
    ]) {
      expect(names).toContain(store);
    }
  });
});
