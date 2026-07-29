import { describe, expect, it } from "vitest";
import {
  buildCdpMacRows,
  buildL2DiscoveryRows,
  buildPortAuditRows,
  canonicalMac,
  extractCdpDeviceHostname,
  extractLabelHostCore,
  hostCoresMatch,
  normalizeInterfaceName,
  shortHostname,
  stripPortSuffix,
} from "@/lib/networkAudit";
import type { CdpLatest, EramonIfaceLatest, EramonL2Latest, IpamLatest, NormalizedHost, TechInfoLatest } from "@/domain/models/types";

function eramon(over: Partial<EramonIfaceLatest> = {}): EramonIfaceLatest {
  return {
    switchPortKey: "sw01::eth1/1", switchNorm: "sw01", deviceName: "sw01", portName: "Eth1/1",
    importedAt: "2026-07-20T00:00:00.000Z", ifaceImportId: "eramon-1", rowIndex: 0,
    portDesc: "esx01_Port1", bandbreiteBps: 100_000_000_000, portStatus: "1", statusLabel: "aktiv",
    ...over,
  };
}

function cdp(over: Partial<CdpLatest> = {}): CdpLatest {
  return {
    hostAdapterKey: "esx01::vmnic0", hostNorm: "esx01", host: "esx01", adapter: "vmnic0",
    importedAt: "2026-07-20T00:00:00.000Z", cdpImportId: "cdp-1", rowIndex: 0, vcenter: null, cluster: null,
    hostConnectionState: "Connected", linkStatus: "Up", mac: "00:50:56:ab:cd:ef",
    cdpDeviceId: "sw01.domain.at(SERIAL1)", cdpPortId: "Ethernet1/1", cdpMgmtIp: null,
    cdpSwitchAddress: null, cdpPlatform: null, cdpSoftware: null, nativeVlan: null, mtu: null,
    cdpAvailable: true, queryStatus: null,
    ...over,
  };
}

function host(name: string): NormalizedHost {
  return { snapshotId: "snap-1", vcenterId: "vc-1", hostKey: `${name}::vc-1`, host: name, cluster: null, datacenter: null, cpuModel: null, cpuTotalMHz: null, cpuCores: null, cpuThreads: null, memoryTotalMiB: null, version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null };
}

function techInfo(vmName: string): TechInfoLatest {
  return { vmNameNorm: vmName, vmName, importedAt: "2026-07-20T00:00:00.000Z", techInfoImportId: "ti-1", rowIndex: 0, serverType: null, maintenanceWindow: null, operatingSystem: null, comment: null, sysv: null, sysvDepartment: null, sysvDeputy: null, sysvDeputyDepartment: null, bz: null, clusterFromTechInfo: null, cvBackup: null, az: null };
}

function ipam(name: string): IpamLatest {
  return { ipAddress: "10.0.0.1", importedAt: "2026-07-20T00:00:00.000Z", ipamImportId: "ipam-1", rowIndex: 0, name, status: "Used", type: "Host", usage: null, firstDiscovered: null, lastDiscovered: null, comment: null, site: null, macAddress: null, os: null, netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null };
}

function l2(over: Partial<EramonL2Latest> = {}): EramonL2Latest {
  return { l2EntryKey: "sw01::eth1/1::005056abcdef::100", switchNorm: "sw01", switchName: "sw01", interface: "Ethernet1/1", mac: "0050.56ab.cdef", vlan: "100", importedAt: "2026-07-20T00:00:00.000Z", l2ImportId: "l2-1", rowIndex: 0, ip: "10.0.0.1", dnsName: "esx01", type: null, interfaceDescription: null, ...over };
}

describe("Netzwerk-Helfer", () => {
  it("normalisiert Host-, Interface- und MAC-Schreibweisen", () => {
    expect(shortHostname("ESX01.example.local")).toBe("esx01");
    expect(stripPortSuffix("esx01_Port2")).toBe("esx01");
    expect(extractCdpDeviceHostname("sw01.domain.at(SERIAL1)")).toBe("sw01");
    expect(normalizeInterfaceName("Ethernet1/1")).toBe("eth1/1");
    expect(canonicalMac("00:50:56:AB:CD:EF")).toBe("005056abcdef");
  });

  it("extrahiert den Hostnamen-Kern aus dekorierten Portbeschriftungen", () => {
    expect(extractLabelHostCore("esxivdi1185(Trunk Prod) [E:0010]")).toBe("esxivdi1185");
    expect(extractLabelHostCore("esxivdi1193 vSAN [E:0010]")).toBe("esxivdi1193");
    expect(extractLabelHostCore("esxivdi2168_itsp(Trunk-Prod) - (igrznx93oc18-13 - Eth118)")).toBe("esxivdi2168_itsp");
    expect(extractLabelHostCore("esxivdixy(vMotion, MGMT) (110.118.51.x)")).toBe("esxivdixy");
  });

  it("erkennt einen an den Hostnamen angehängten Zusatz als Übereinstimmung", () => {
    expect(hostCoresMatch("esxivdi1185", "esxivdi1185")).toBe(true);
    expect(hostCoresMatch("esxivdi2168_itsp", "esxivdi2168")).toBe(true);
  });

  it("lehnt abweichende oder nur zufällig präfixgleiche Hostnamen ab", () => {
    expect(hostCoresMatch("esxivdixy", "esxivdi1200")).toBe(false);
    expect(hostCoresMatch("esxivdi2154", "esxivdi2153")).toBe(false);
    expect(hostCoresMatch("esxivdi2114-dell", "esxivdi2113")).toBe(false);
    // "esxivdi216" wäre ein reiner Zeichen-Präfix von "esxivdi2168", aber kein Zusatz-Suffix (kein Trenner danach) -> kein Treffer.
    expect(hostCoresMatch("esxivdi2168", "esxivdi216")).toBe(false);
  });
});

describe("buildPortAuditRows", () => {
  it("verwendet ausschließlich Eramon-Portdaten und bestätigt die Zuordnung per CDP", () => {
    const rows = buildPortAuditRows({ eramonIfaceRows: [eramon()], cdpRows: [cdp()], hosts: [], techInfo: [], ipam: [] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "esx01_Port1", status: "aktiv", bandwidthBps: 100_000_000_000, matchStatus: "confirmed-cdp", matchedHost: "esx01" });
  });

  it("meldet eine abweichende Eramon-Beschriftung gegenüber CDP", () => {
    const [row] = buildPortAuditRows({ eramonIfaceRows: [eramon({ portDesc: "altserver_Port1" })], cdpRows: [cdp()], hosts: [], techInfo: [], ipam: [] });

    expect(row.labelConflict).toBe(true);
    expect(row.finding).toContain("altserver");
  });

  it("meldet keine Auffälligkeit bei einer dekorierten, aber passenden Beschriftung", () => {
    const [row] = buildPortAuditRows({
      eramonIfaceRows: [eramon({ portDesc: "esxivdi1185(Trunk Prod) [E:0010]" })],
      cdpRows: [cdp({ host: "esxivdi1185.domain.at", cdpDeviceId: "sw01.domain.at(SERIAL1)" })],
      hosts: [], techInfo: [], ipam: [],
    });

    expect(row.labelConflict).toBe(false);
    expect(row.finding).toBeNull();
  });

  it("meldet keine Auffälligkeit, wenn die Beschriftung nur ein Team-Kürzel an den echten Hostnamen anhängt", () => {
    const [row] = buildPortAuditRows({
      eramonIfaceRows: [eramon({ portDesc: "esxivdi2168_itsp(Trunk-Prod) - (igrznx93oc18-13 - Eth118)" })],
      cdpRows: [cdp({ host: "esxivdi2168.domain.at", cdpDeviceId: "sw01.domain.at(SERIAL1)" })],
      hosts: [], techInfo: [], ipam: [],
    });

    expect(row.labelConflict).toBe(false);
  });

  it("meldet eine Auffälligkeit, wenn eine dekorierte Beschriftung einen anderen Host als CDP nennt", () => {
    const [row] = buildPortAuditRows({
      eramonIfaceRows: [eramon({ portDesc: "esxivdixy(vMotion, MGMT) (110.118.51.x)" })],
      cdpRows: [cdp({ host: "esxivdi1200.domain.at", cdpDeviceId: "sw01.domain.at(SERIAL1)" })],
      hosts: [], techInfo: [], ipam: [],
    });

    expect(row.labelConflict).toBe(true);
    expect(row.finding).toContain("esxivdixy");
  });

  it("ordnet einen Eramon-Port ohne CDP über RVTools zu", () => {
    const [row] = buildPortAuditRows({ eramonIfaceRows: [eramon()], cdpRows: [], hosts: [host("esx01.example.local")], techInfo: [], ipam: [] });

    expect(row.matchStatus).toBe("text-match");
    expect(row.matchedSource).toBe("rvtools");
  });

  it("ordnet einen nur dokumentierten Eramon-Port über Tech-Info vor IPAM zu", () => {
    const [row] = buildPortAuditRows({ eramonIfaceRows: [eramon({ portDesc: "legacy01_Port1" })], cdpRows: [], hosts: [], techInfo: [techInfo("legacy01")], ipam: [ipam("legacy01")] });

    expect(row.matchStatus).toBe("documented-only");
    expect(row.matchedSource).toBe("techinfo");
  });
});

describe("Eramon-L2-Abgleich", () => {
  it("findet die CDP-MAC in der Eramon-L2-Tabelle", () => {
    const [row] = buildCdpMacRows({ cdpRows: [cdp()], l2Rows: [l2()] });

    expect(row).toMatchObject({ inL2: true, topologyMismatch: false, l2Switch: "sw01", vlan: "100" });
  });

  it("klassifiziert L2-Einträge über CDP oder IPAM", () => {
    const rows = buildL2DiscoveryRows({ cdpRows: [cdp()], l2Rows: [l2(), l2({ l2EntryKey: "sw02::eth1/2::aabbccddeeff::200", mac: "aabb.ccdd.eeff", ip: "10.0.0.20" })], ipam: [ipam("other")] });

    expect(rows.map((row) => row.classification)).toEqual(["esxi-cdp", "unknown"]);
  });
});
