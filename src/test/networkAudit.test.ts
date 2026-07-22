import { describe, it, expect } from "vitest";
import {
  shortHostname,
  stripPortSuffix,
  extractCdpDeviceHostname,
  normalizeInterfaceName,
  buildPortAuditRows,
  canonicalMac,
} from "@/lib/networkAudit";
import type { SwitchLatest, CdpLatest, NormalizedHost, TechInfoLatest, IpamLatest, EramonIfaceLatest } from "@/domain/models/types";

describe("shortHostname", () => {
  it("schneidet den Domain-Teil einer FQDN ab", () => {
    expect(shortHostname("esxxsrv2270.rbgooe.at")).toBe("esxxsrv2270");
  });

  it("lässt einen bereits kurzen Namen unverändert (kleingeschrieben)", () => {
    expect(shortHostname("ESXXSRV2270")).toBe("esxxsrv2270");
  });
});

describe("stripPortSuffix", () => {
  it("entfernt einen _PortN-Suffix", () => {
    expect(stripPortSuffix("esxxsrv2270_Port2")).toBe("esxxsrv2270");
  });

  it("entfernt einen -portN-Suffix (andere Schreibweise)", () => {
    expect(stripPortSuffix("esxxsrv2270-port12")).toBe("esxxsrv2270");
  });

  it("lässt einen Namen ohne Port-Suffix unverändert", () => {
    expect(stripPortSuffix("esxxsrv2270")).toBe("esxxsrv2270");
  });
});

describe("extractCdpDeviceHostname", () => {
  it("schneidet Seriennummer in Klammern und Domain ab", () => {
    expect(extractCdpDeviceHostname("grznx93oc18-8.domain.at(FDO26040UFF)")).toBe("grznx93oc18-8");
  });

  it("funktioniert auch ohne Seriennummer", () => {
    expect(extractCdpDeviceHostname("grznx93oc18-8.domain.at")).toBe("grznx93oc18-8");
  });
});

describe("normalizeInterfaceName", () => {
  it("kürzt 'Ethernet' auf 'eth' und lowercased", () => {
    expect(normalizeInterfaceName("Ethernet1/13")).toBe("eth1/13");
  });

  it("lässt eine bereits kurze Interface-Bezeichnung unverändert", () => {
    expect(normalizeInterfaceName("Eth1/1")).toBe("eth1/1");
  });
});

describe("canonicalMac", () => {
  it("normalisiert VMware-, Cisco- und Bindestrich-Format auf dieselbe Form", () => {
    expect(canonicalMac("00:50:56:AB:CD:EF")).toBe("005056abcdef");
    expect(canonicalMac("0050.56ab.cdef")).toBe("005056abcdef");
    expect(canonicalMac("00-50-56-ab-cd-ef")).toBe("005056abcdef");
  });

  it("gibt null für leere, null- oder zu kurze Werte zurück", () => {
    expect(canonicalMac(null)).toBeNull();
    expect(canonicalMac("")).toBeNull();
    expect(canonicalMac("0050.56ab")).toBeNull();
  });
});

function makeSwitchRow(over: Partial<SwitchLatest> = {}): SwitchLatest {
  return {
    switchInterfaceKey: "sw01::eth1/1",
    hostnameNorm: "sw01",
    hostname: "sw01",
    interface: "Eth1/1",
    importedAt: "2026-07-18T00:00:00.000Z",
    switchImportId: "imp-1",
    rowIndex: 0,
    description: "esxxsrv2270_Port2",
    status: "connected",
    mode: "trunk",
    duplex: "full",
    speed: "25G",
    transceiver: "SFP-H25GB-CU3M",
    ...over,
  };
}

function makeCdpRow(over: Partial<CdpLatest> = {}): CdpLatest {
  return {
    hostAdapterKey: "esxxsrv2270::vmnic0",
    hostNorm: "esxxsrv2270.rbgooe.at",
    host: "esxxsrv2270.rbgooe.at",
    adapter: "vmnic0",
    importedAt: "2026-07-18T00:00:00.000Z",
    cdpImportId: "cdp-1",
    rowIndex: 0,
    vcenter: null,
    cluster: null,
    hostConnectionState: "Connected",
    linkStatus: "Up",
    mac: null,
    cdpDeviceId: "sw01.domain.at(SERIAL1)",
    cdpPortId: "Ethernet1/1",
    cdpMgmtIp: null,
    cdpSwitchAddress: null,
    cdpPlatform: null,
    cdpSoftware: null,
    nativeVlan: null,
    mtu: null,
    cdpAvailable: true,
    queryStatus: null,
    ...over,
  };
}

function makeHost(host: string): NormalizedHost {
  return {
    snapshotId: "snap-1", vcenterId: "vc-1", hostKey: `${host}::vc-1`, host,
    cluster: null, datacenter: null, cpuModel: null, cpuTotalMHz: null, cpuCores: null,
    cpuThreads: null, memoryTotalMiB: null, version: null, build: null, vendor: null,
    model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
  };
}

function makeTechInfo(vmName: string): TechInfoLatest {
  return {
    vmNameNorm: vmName.toLowerCase(), vmName, importedAt: "2026-07-18T00:00:00.000Z",
    techInfoImportId: "ti-1", rowIndex: 0, serverType: null, maintenanceWindow: null,
    operatingSystem: null, comment: null, sysv: null, sysvDepartment: null, sysvDeputy: null,
    sysvDeputyDepartment: null, bz: null, clusterFromTechInfo: null, cvBackup: null, az: null,
  };
}

function makeIpam(name: string): IpamLatest {
  return {
    ipAddress: "10.0.0.1", importedAt: "2026-07-18T00:00:00.000Z", ipamImportId: "ip-1",
    rowIndex: 0, name, status: "Used", type: "Host", usage: "DNS", firstDiscovered: null,
    lastDiscovered: null, comment: null, site: null, macAddress: null, os: null,
    netBiosName: null, deviceTypes: null, openPorts: null, fingerprint: null,
  };
}

function makeEramonIface(over: Partial<EramonIfaceLatest> = {}): EramonIfaceLatest {
  return {
    switchPortKey: "sw01::eth1/1",
    switchNorm: "sw01",
    deviceName: "sw01",
    portName: "Eth1/1",
    importedAt: "2026-07-20T00:00:00.000Z",
    ifaceImportId: "eif-1",
    rowIndex: 0,
    portDesc: "esxxsrv2270",
    bandbreiteBps: 100_000_000_000,
    portStatus: "1",
    statusLabel: "aktiv",
    ...over,
  };
}

describe("buildPortAuditRows", () => {
  it("confirmed-cdp: CDP löst Switch+Port strukturiert auf, Beschreibung (FQDN vs. non-FQDN) passt dazu", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [makeCdpRow({ host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
    expect(rows[0].matchedHost).toBe("esxxsrv2270.rbgooe.at");
    expect(rows[0].labelConflict).toBe(false);
    expect(rows[0].statusConflict).toBe(false);
  });

  it("labelConflict: Beschreibung nennt einen anderen Host als CDP", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altgeraet01_Port2" })],
      cdpRows: [makeCdpRow({ host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
    expect(rows[0].labelConflict).toBe(true);
    expect(rows[0].labelConflictHost).toBe("esxxsrv2270.rbgooe.at");
    expect(rows[0].finding).toContain("altgeraet01");
    expect(rows[0].finding).toContain("esxxsrv2270.rbgooe.at");
  });

  it("statusConflict: Switch meldet notconnec, CDP zeigt Host als verbunden", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ status: "notconnec" })],
      cdpRows: [makeCdpRow({ linkStatus: "Up" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].statusConflict).toBe(true);
  });

  it("kein statusConflict, wenn CDP keinen linkStatus liefert (null)", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ status: "notconnec" })],
      cdpRows: [makeCdpRow({ linkStatus: null })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].statusConflict).toBe(false);
  });

  it("text-match: kein CDP-Treffer, aber Beschreibung matcht einen aktiven RVTools-Host", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [],
      hosts: [makeHost("esxxsrv2270.rbgooe.at")], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("text-match");
    expect(rows[0].matchedSource).toBe("rvtools");
  });

  it("documented-only via TechInfo: kein RVTools-Host, aber TechInfo-Server-Name passt", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver01_Port2" })],
      cdpRows: [], hosts: [], techInfo: [makeTechInfo("altserver01")], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("documented-only");
    expect(rows[0].matchedSource).toBe("techinfo");
    expect(rows[0].finding).toContain("TechInfo");
  });

  it("documented-only via IPAM, wenn TechInfo keinen Treffer liefert", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver02_Port2" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [makeIpam("altserver02")],
    });
    expect(rows[0].matchStatus).toBe("documented-only");
    expect(rows[0].matchedSource).toBe("ipam");
  });

  it("documented-only Priorität: Name in TechInfo UND IPAM -> TechInfo gewinnt", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altserver03_Port2" })],
      cdpRows: [], hosts: [],
      techInfo: [makeTechInfo("altserver03")], ipam: [makeIpam("altserver03")],
    });
    expect(rows[0].matchedSource).toBe("techinfo");
  });

  it("unknown: kein Match in keiner Quelle", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "voelligunbekannt_Port2" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("unknown");
    expect(rows[0].finding).toBe("Kein bekannter Host gefunden");
  });

  it("no-target: Beschreibung ist '--' (z. B. mgmt0), kein CDP-Treffer", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ interface: "mgmt0", description: "--" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("no-target");
    expect(rows[0].finding).toBeNull();
  });

  it("confirmed-cdp hat Vorrang vor no-target: unbeschrifteter, aber CDP-bestätigter Port", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "--" })],
      cdpRows: [makeCdpRow()],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
  });

  it("cdpAvailable=false fließt nicht in den CDP-Index ein", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "esxxsrv2270_Port2" })],
      cdpRows: [makeCdpRow({ cdpAvailable: false })],
      hosts: [makeHost("esxxsrv2270.rbgooe.at")], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("text-match");
  });

  it("confirmed-cdp: Switch-Hostname als FQDN gespeichert (hostnameNorm nicht domain-gestrippt) matcht trotzdem gegen CDP", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostnameNorm: "sw01.domain.at", hostname: "sw01.domain.at" })],
      cdpRows: [makeCdpRow({ cdpDeviceId: "sw01.domain.at(SERIAL1)" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
  });

  it("finding enthält sowohl labelConflict- als auch statusConflict-Text, wenn beide gleichzeitig zutreffen", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ description: "altgeraet01_Port2", status: "notconnec" })],
      cdpRows: [makeCdpRow({ host: "esxxsrv2270.rbgooe.at", linkStatus: "Up" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].labelConflict).toBe(true);
    expect(rows[0].statusConflict).toBe(true);
    expect(rows[0].finding).toContain('Beschriftung nennt "altgeraet01"');
    expect(rows[0].finding).toContain('Switch meldet "notconnec"');
  });

  it("Union: derselbe Port aus Cisco und Eramon ergibt eine Zeile mit beiden Quellen", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270_Port2" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(["cisco", "eramon"]);
    expect(rows[0].bandwidthBps).toBe(100_000_000_000);
  });

  it("reiner Eramon-Port (ohne Cisco) mit CDP-Treffer wird confirmed-cdp", () => {
    const rows = buildPortAuditRows({
      switchRows: [],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270" })],
      cdpRows: [makeCdpRow({ cdpDeviceId: "sw01.domain.at(SERIAL1)", cdpPortId: "Ethernet1/1", host: "esxxsrv2270.rbgooe.at" })],
      hosts: [], techInfo: [], ipam: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(["eramon"]);
    expect(rows[0].matchStatus).toBe("confirmed-cdp");
  });

  it("sourceConflict: Cisco- und Eramon-Beschriftung nennen unterschiedliche Hosts", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "altserver99" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(true);
    expect(rows[0].finding).toContain("altserver99");
  });

  it("sourceConflict: Cisco meldet connected, Eramon meldet down", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270", status: "connected" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270", statusLabel: "down" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(true);
  });

  it("kein sourceConflict bei identischer Beschreibung und identischem Status", () => {
    const rows = buildPortAuditRows({
      switchRows: [makeSwitchRow({ hostname: "sw01", interface: "Eth1/1", description: "esxxsrv2270", status: "connected" })],
      eramonIfaceRows: [makeEramonIface({ deviceName: "sw01", portName: "Ethernet1/1", portDesc: "esxxsrv2270", statusLabel: "aktiv" })],
      cdpRows: [], hosts: [], techInfo: [], ipam: [],
    });
    expect(rows[0].sourceConflict).toBe(false);
  });
});
