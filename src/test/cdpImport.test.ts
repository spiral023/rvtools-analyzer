import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapCdpDisplayFields,
  buildHostAdapterKey,
  normalizeVcenterId,
  CDP_REQUIRED_HEADERS,
} from "@/lib/xlsx/parseHelpers";

const CDP_HEADERS = [
  "vCenter", "Cluster", "VMHost", "HostConnectionState", "PhysicalAdapter",
  "LinkStatus", "MACAddress", "CDPDeviceID", "CDPPortID", "CDPManagementIP",
  "CDPSwitchAddress", "CDPHardwarePlatform", "CDPSoftwareVersion",
  "CDPNativeVLAN", "CDPMTU", "CDPAvailable", "QueryStatus", "ErrorMessage",
];

describe("detectParsedFileKind (CDP)", () => {
  it("erkennt CDP-CSV an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: CDP_HEADERS }])).toBe("cdp");
  });

  it("erkennt CDP auch mit minimalen Pflicht-Headern", () => {
    expect(
      detectParsedFileKind([{ sheetName: "Sheet1", headers: [...CDP_REQUIRED_HEADERS] }]),
    ).toBe("cdp");
  });

  it("fällt bei fremden CSV-Headern auf rvtools zurück (Ablehnung passiert im Import-Service)", () => {
    expect(
      detectParsedFileKind([{ sheetName: "Sheet1", headers: ["Spalte A", "Spalte B"] }]),
    ).toBe("rvtools");
  });

  it("lässt RVTools-Erkennung unangetastet", () => {
    expect(
      detectParsedFileKind([{ sheetName: "vInfo", headers: ["VM", "Powerstate"] }]),
    ).toBe("rvtools");
  });
});

describe("mapCdpDisplayFields", () => {
  it("mappt alle CDP-Spalten inkl. Boolean- und Zahl-Konvertierung", () => {
    const fields = mapCdpDisplayFields({
      "vCenter": "vcenter1110.domain.at",
      "Cluster": "CL_LNZ_VDI_5920_2",
      "HostConnectionState": "Connected",
      "LinkStatus": "Up",
      "MACAddress": "08:c0:eb:c4:c8:a0",
      "CDPDeviceID": "grznx93oc18-8.domain.at(FDO26040UFF)",
      "CDPPortID": "Ethernet1/13",
      "CDPManagementIP": "10.18.129.44",
      "CDPSwitchAddress": "192.168.125.44",
      "CDPHardwarePlatform": "N9K-C93180YC-FX3",
      "CDPSoftwareVersion": "Cisco Nexus Operating System (NX-OS) Software, Version 9.3(9)",
      "CDPNativeVLAN": 1,
      "CDPMTU": "9216",
      "CDPAvailable": "True",
      "QueryStatus": "CDP-Daten gefunden",
    });
    expect(fields.vcenter).toBe("vcenter1110.domain.at");
    expect(fields.cluster).toBe("CL_LNZ_VDI_5920_2");
    expect(fields.linkStatus).toBe("Up");
    expect(fields.mac).toBe("08:c0:eb:c4:c8:a0");
    expect(fields.cdpDeviceId).toBe("grznx93oc18-8.domain.at(FDO26040UFF)");
    expect(fields.cdpPortId).toBe("Ethernet1/13");
    expect(fields.cdpMgmtIp).toBe("10.18.129.44");
    expect(fields.cdpSwitchAddress).toBe("192.168.125.44");
    expect(fields.cdpPlatform).toBe("N9K-C93180YC-FX3");
    expect(fields.nativeVlan).toBe("1");
    expect(fields.mtu).toBe("9216");
    expect(fields.cdpAvailable).toBe(true);
    expect(fields.queryStatus).toBe("CDP-Daten gefunden");
  });

  it("liefert null für leere CDP-Felder (z. B. vusb0) und false für CDPAvailable=False", () => {
    const fields = mapCdpDisplayFields({
      "vCenter": "vcenter1110.domain.at",
      "Cluster": "CL_LNZ_VDI_5920_2",
      "LinkStatus": "Up",
      "MACAddress": "22:c4:b6:34:04:1f",
      "CDPDeviceID": "",
      "CDPPortID": "",
      "CDPAvailable": "False",
      "QueryStatus": "Keine CDP-Daten",
    });
    expect(fields.cdpDeviceId).toBeNull();
    expect(fields.cdpPortId).toBeNull();
    expect(fields.nativeVlan).toBeNull();
    expect(fields.mtu).toBeNull();
    expect(fields.cdpAvailable).toBe(false);
  });
});

describe("buildHostAdapterKey", () => {
  it("normalisiert Host und Adapter (trim + lowercase) mit ::-Trenner", () => {
    expect(buildHostAdapterKey(" ESXvdi5D43.domain.at ", " VMNIC0 ")).toBe(
      "esxvdi5d43.domain.at::vmnic0",
    );
  });
});

describe("normalizeVcenterId", () => {
  it("bildet vCenter-Namen auf die vcenterId-Konvention des RVTools-Imports ab", () => {
    expect(normalizeVcenterId("vCenter1110.Domain.AT")).toBe("vcenter1110.domain.at");
    expect(normalizeVcenterId("vc 01 (prod)")).toBe("vc_01__prod_");
    expect(normalizeVcenterId("  ")).toBe("unknown-vcenter");
  });
});
