import { describe, expect, it } from "vitest";
import { getUplinkDiagramLabel } from "@/lib/networkDiagram";

describe("getUplinkDiagramLabel", () => {
  it("zeigt den Uplink-Namen oder eine klare Fallback-Beschriftung", () => {
    expect(getUplinkDiagramLabel("Uplink 1")).toBe("Uplink 1");
    expect(getUplinkDiagramLabel("")).toBe("nicht zugewiesen");
  });
});
