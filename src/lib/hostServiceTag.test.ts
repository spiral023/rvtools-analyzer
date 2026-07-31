import { describe, expect, it } from "vitest";
import { buildHostServiceTagMap, findHostServiceTag } from "@/lib/hostServiceTag";
import type { SheetRow } from "@/domain/models/types";

function vHostRow(snapshotId: string, data: Record<string, string | number | boolean | null>): SheetRow {
  return { snapshotId, sheetName: "vHost", rowIndex: 0, data };
}

describe("buildHostServiceTagMap", () => {
  it("findet den Service Tag unabhängig von der Groß-/Kleinschreibung des Hostnamens", () => {
    const map = buildHostServiceTagMap([vHostRow("snap-1", { Host: "ESX-01.lab.local", "Service tag": "CZ12345" })]);

    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "esx-01.LAB.local" })).toBe("CZ12345");
  });

  it("hält Hosts gleichen Namens aus verschiedenen Snapshots auseinander", () => {
    const map = buildHostServiceTagMap([
      vHostRow("snap-1", { Host: "esx-01", "Service tag": "TAG-ALT" }),
      vHostRow("snap-2", { Host: "esx-01", "Service tag": "TAG-NEU" }),
    ]);

    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "esx-01" })).toBe("TAG-ALT");
    expect(findHostServiceTag(map, { snapshotId: "snap-2", host: "esx-01" })).toBe("TAG-NEU");
  });

  it("akzeptiert die Spaltenvariante „Service Tag“ und den Hostnamen aus „Name“", () => {
    const map = buildHostServiceTagMap([vHostRow("snap-1", { Name: "esx-02", "Service Tag": "  CZ99999  " })]);

    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "esx-02" })).toBe("CZ99999");
  });

  it("gibt null zurück, wenn der Export keinen Service Tag liefert", () => {
    const map = buildHostServiceTagMap([
      vHostRow("snap-1", { Host: "esx-03", "Service tag": "" }),
      vHostRow("snap-1", { Host: "esx-04" }),
    ]);

    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "esx-03" })).toBeNull();
    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "esx-04" })).toBeNull();
    expect(findHostServiceTag(map, { snapshotId: "snap-1", host: "unbekannt" })).toBeNull();
  });
});
