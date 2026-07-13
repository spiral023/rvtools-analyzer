import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/domain/models/types";
import { buildVlanUsage } from "@/lib/vlanUsage";

function row(data: Record<string, string | number | boolean | null>): SheetRow {
  return { snapshotId: "snap-1", sheetName: "sheet", rowIndex: 0, data };
}

describe("buildVlanUsage", () => {
  it("returns empty array without data", () => {
    expect(buildVlanUsage([], [], [], [])).toEqual([]);
  });

  it("joins standard vSwitch portgroups to VLAN and counts distinct VMs/hosts", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
      row({ VM: "APP02", Network: "PG-Web", Connected: "true", Cluster: "Prod-01", Host: "esx2" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cluster: "Prod-01", vlan: "100", portgroups: "PG-Web", vmCount: 2, hostCount: 2 });
  });

  it("joins distributed vSwitch ports to VLAN", () => {
    const dvPort = [row({ Port: "DPG-DB", VLAN: "200" })];
    const vNetwork = [row({ VM: "DB01", Network: "DPG-DB", Connected: true, Cluster: "Prod-01", Host: "esx1" })];
    const rows = buildVlanUsage(vNetwork, [], dvPort, []);
    expect(rows[0]).toMatchObject({ vlan: "200", portgroups: "DPG-DB", vmCount: 1 });
  });

  it("ignores adapters that are not connected", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: false, Cluster: "Prod-01", Host: "esx1" })];
    expect(buildVlanUsage(vNetwork, vPort, [], [])).toEqual([]);
  });

  it("labels empty or zero VLAN as untagged", () => {
    const vPort = [row({ "Port Group": "PG-Mgmt", VLAN: "0" }), row({ "Port Group": "PG-Raw", VLAN: "" })];
    const vNetwork = [
      row({ VM: "M1", Network: "PG-Mgmt", Connected: true, Cluster: "C1", Host: "h1" }),
      row({ VM: "M2", Network: "PG-Raw", Connected: true, Cluster: "C1", Host: "h1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows.every((r) => r.vlan === "0 (untagged)")).toBe(true);
  });

  it("marks portgroups without a VLAN match as '?'", () => {
    const vNetwork = [row({ VM: "X1", Network: "PG-Unknown", Connected: true, Cluster: "C1", Host: "h1" })];
    const rows = buildVlanUsage(vNetwork, [], [], []);
    expect(rows[0]).toMatchObject({ vlan: "?", portgroups: "PG-Unknown", vmCount: 1 });
  });

  it("counts a VM with two adapters in the same VLAN only once", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
      row({ VM: "APP01", Network: "PG-Web", Connected: true, Cluster: "Prod-01", Host: "esx1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows[0].vmCount).toBe(1);
    expect(rows[0].hostCount).toBe(1);
  });

  it("derives cluster from vInfo when vNetwork has none", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vInfo = [row({ VM: "APP01", Cluster: "Prod-99" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: true, Host: "esx1" })];
    const rows = buildVlanUsage(vNetwork, vPort, [], vInfo);
    expect(rows[0].cluster).toBe("Prod-99");
  });

  it("falls back to 'Unbekannt' when no cluster is available", () => {
    const vPort = [row({ "Port Group": "PG-Web", VLAN: "100" })];
    const vNetwork = [row({ VM: "APP01", Network: "PG-Web", Connected: true, Host: "esx1" })];
    expect(buildVlanUsage(vNetwork, vPort, [], [])[0].cluster).toBe("Unbekannt");
  });

  it("sorts by cluster ascending, then vmCount descending", () => {
    const vPort = [row({ "Port Group": "A", VLAN: "10" }), row({ "Port Group": "B", VLAN: "20" })];
    const vNetwork = [
      row({ VM: "v1", Network: "A", Connected: true, Cluster: "Beta", Host: "h1" }),
      row({ VM: "v2", Network: "B", Connected: true, Cluster: "Alpha", Host: "h1" }),
      row({ VM: "v3", Network: "B", Connected: true, Cluster: "Alpha", Host: "h2" }),
      row({ VM: "v4", Network: "A", Connected: true, Cluster: "Alpha", Host: "h1" }),
    ];
    const rows = buildVlanUsage(vNetwork, vPort, [], []);
    expect(rows.map((r) => `${r.cluster}/${r.vlan}`)).toEqual(["Alpha/20", "Alpha/10", "Beta/10"]);
  });
});
