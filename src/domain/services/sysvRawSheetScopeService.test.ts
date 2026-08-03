import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/domain/models/types";
import { filterSysvRawSheet } from "@/domain/services/sysvRawSheetScopeService";

function row(sheetName: string, rowIndex: number, data: Record<string, string | number | null>): SheetRow {
  return { snapshotId: "snapshot-1", sheetName, rowIndex, data };
}

const context = {
  selectedVmNames: new Set(["vm-a"]),
  selectedHostNames: new Set(["esxi-a"]),
  selectedClusterNames: new Set(["cluster-a"]),
  selectedDatastoreNames: new Set(["datastore-a"]),
  selectedSwitchIds: new Set(["dvs-a"]),
  allVmNames: new Set(["vm-a", "vm-b"]),
};

describe("SysV-RVTools-Rohdatenfilter", () => {
  it("filtert VM-Sheets fail-closed und nummeriert die RowIndex-Werte neu", () => {
    const result = filterSysvRawSheet({
      sheetName: "vCPU",
      headers: ["VM", "Cores"],
      rows: [
        row("vCPU", 17, { VM: "vm-b", Cores: 4 }),
        row("vCPU", 42, { VM: " VM-A ", Cores: 8 }),
        row("vCPU", 99, { Cores: 2 }),
      ],
    }, context);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rowIndex).toBe(0);
    expect(result.values).toEqual([[" VM-A ", 8]]);
    expect(result.warnings.some((warning) => warning.code === "missing-vm-key")).toBe(true);
  });

  it("nimmt Hostkomponenten, Distributed Switches und Resource Pools nur über sichere Referenzen auf", () => {
    const host = filterSysvRawSheet({
      sheetName: "vNIC",
      headers: ["Host", "Switch"],
      rows: [row("vNIC", 0, { Host: "esxi-a", Switch: "dvs-a" }), row("vNIC", 1, { Host: "esxi-b", Switch: "dvs-b" })],
    }, context);
    const dvSwitch = filterSysvRawSheet({
      sheetName: "dvSwitch",
      headers: ["Switch", "Name"],
      rows: [row("dvSwitch", 0, { Switch: "dvs-a", Name: "allowed" }), row("dvSwitch", 1, { Switch: "dvs-b", Name: "foreign" })],
    }, context);
    const resourcePool = filterSysvRawSheet({
      sheetName: "vRP",
      headers: ["Cluster", "Name"],
      rows: [row("vRP", 0, { Cluster: "cluster-a", Name: "allowed" }), row("vRP", 1, { Cluster: "cluster-b", Name: "foreign" })],
    }, context);

    expect(host.rows).toHaveLength(1);
    expect(dvSwitch.rows).toHaveLength(1);
    expect(resourcePool.rows).toHaveLength(1);
  });

  it("schließt vPort mit fremder VM-Referenz und unbekannte Sheets aus", () => {
    const vPort = filterSysvRawSheet({
      sheetName: "vPort",
      headers: ["Host", "VM", "Port"],
      rows: [row("vPort", 0, { Host: "esxi-a", VM: "vm-b", Port: "p1" }), row("vPort", 1, { Host: "esxi-a", Port: "p2" })],
    }, context);
    const unknown = filterSysvRawSheet({
      sheetName: "vHealth",
      headers: ["VM", "State"],
      rows: [row("vHealth", 0, { VM: "vm-a", State: "ok" })],
    }, context);

    expect(vPort.rows).toHaveLength(1);
    expect(vPort.rows[0].data.Port).toBe("p2");
    expect(vPort.warnings.some((warning) => warning.code === "foreign-vm-reference")).toBe(true);
    expect(unknown.rows).toHaveLength(0);
    expect(unknown.warnings[0].code).toBe("unknown-sheet");
  });
});
