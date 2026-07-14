import { describe, it, expect } from "vitest";
import { filterCdpRows } from "@/lib/cdp";
import type { CdpLatest } from "@/domain/models/types";

function row(over: Partial<CdpLatest>): CdpLatest {
  return {
    hostAdapterKey: "esx01::vmnic0",
    hostNorm: "esx01.domain.at",
    host: "esx01.domain.at",
    adapter: "vmnic0",
    importedAt: "2026-07-14T00:00:00.000Z",
    cdpImportId: "cdp-1",
    rowIndex: 0,
    vcenter: "vcenter1110.domain.at",
    cluster: "CL_A",
    hostConnectionState: "Connected",
    linkStatus: "Up",
    mac: null, cdpDeviceId: null, cdpPortId: null, cdpMgmtIp: null,
    cdpSwitchAddress: null, cdpPlatform: null, cdpSoftware: null,
    nativeVlan: null, mtu: null, cdpAvailable: true, queryStatus: null,
    ...over,
  };
}

const rows = [
  row({ hostAdapterKey: "a", vcenter: "vCenter1110.Domain.AT", cluster: "CL_A", hostNorm: "esx01.domain.at" }),
  row({ hostAdapterKey: "b", vcenter: "vcenter5920.rbgooe.at", cluster: "CL_B", hostNorm: "esx02.domain.at", host: "esx02.domain.at" }),
  row({ hostAdapterKey: "c", vcenter: null, cluster: null, hostNorm: "esx03.domain.at", host: "esx03.domain.at" }),
];

describe("filterCdpRows", () => {
  it("liefert alles bei leeren Filtern", () => {
    expect(filterCdpRows(rows, { vcenterIds: [], clusters: [], hosts: [] })).toHaveLength(3);
  });

  it("filtert nach vcenterIds über normalizeVcenterId (case-insensitiv)", () => {
    const result = filterCdpRows(rows, { vcenterIds: ["vcenter1110.domain.at"], clusters: [], hosts: [] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["a"]);
  });

  it("filtert nach Cluster-Namen (exakt); Zeilen ohne Cluster fallen bei aktivem Filter raus", () => {
    const result = filterCdpRows(rows, { vcenterIds: [], clusters: ["CL_B"], hosts: [] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["b"]);
  });

  it("filtert nach Hosts case-insensitiv über hostNorm", () => {
    const result = filterCdpRows(rows, { vcenterIds: [], clusters: [], hosts: ["ESX03.Domain.AT"] });
    expect(result.map((r) => r.hostAdapterKey)).toEqual(["c"]);
  });

  it("kombiniert Filter mit UND-Verknüpfung", () => {
    const result = filterCdpRows(rows, { vcenterIds: ["vcenter1110.domain.at"], clusters: ["CL_B"], hosts: [] });
    expect(result).toHaveLength(0);
  });
});
