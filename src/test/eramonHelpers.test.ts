import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapEramonIfaceDisplayFields,
  mapEramonL2DisplayFields,
  mapEramonPortStatus,
  buildEramonSwitchPortKey,
  buildEramonL2Key,
  ERAMON_IFACE_REQUIRED_HEADERS,
  ERAMON_L2_REQUIRED_HEADERS,
} from "@/lib/xlsx/parseHelpers";
import { formatBandwidth } from "@/lib/eramon";

describe("detectParsedFileKind (Eramon)", () => {
  it("erkennt Eramon-Interface an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: [...ERAMON_IFACE_REQUIRED_HEADERS] }])).toBe("eramon-iface");
  });
  it("erkennt Eramon-L2 an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: [...ERAMON_L2_REQUIRED_HEADERS] }])).toBe("eramon-l2");
  });
  it("verwechselt L2 nicht mit Interface", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: ["ip", "name", "interface", "mac", "dnsname", "vlan"] }])).toBe("eramon-l2");
  });
  it("fällt bei fremden Headern auf rvtools zurück", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: ["foo", "bar"] }])).toBe("rvtools");
  });
});

describe("mapEramonPortStatus", () => {
  it("mappt 1 auf aktiv und 2 auf down", () => {
    expect(mapEramonPortStatus(1)).toEqual({ portStatus: "1", statusLabel: "aktiv" });
    expect(mapEramonPortStatus("2")).toEqual({ portStatus: "2", statusLabel: "down" });
  });
  it("übernimmt unbekannte Werte roh und leere als null", () => {
    expect(mapEramonPortStatus("7")).toEqual({ portStatus: "7", statusLabel: "7" });
    expect(mapEramonPortStatus("")).toEqual({ portStatus: null, statusLabel: null });
  });
});

describe("mapEramonIfaceDisplayFields", () => {
  it("parst Bandbreite aus wiss. Notation und aus Zahl", () => {
    expect(mapEramonIfaceDisplayFields({ port_desc: "SERVER_A", bandbreite: "1E+11", port_status: "1" })).toEqual({
      portDesc: "SERVER_A", bandbreiteBps: 100000000000, portStatus: "1", statusLabel: "aktiv",
    });
    expect(mapEramonIfaceDisplayFields({ port_desc: "", bandbreite: 25000000000, port_status: "2" })).toEqual({
      portDesc: null, bandbreiteBps: 25000000000, portStatus: "2", statusLabel: "down",
    });
  });
  it("liefert null-Bandbreite bei leerem Wert", () => {
    expect(mapEramonIfaceDisplayFields({ bandbreite: "", port_status: "1" }).bandbreiteBps).toBeNull();
  });
});

describe("mapEramonL2DisplayFields", () => {
  it("mappt IP/DNS/type/interfacedescription", () => {
    expect(mapEramonL2DisplayFields({ ip: "10.18.3.14", dnsname: "host.at", type: "dynamic", interfacedescription: "uplink" })).toEqual({
      ip: "10.18.3.14", dnsName: "host.at", type: "dynamic", interfaceDescription: "uplink",
    });
  });
  it("liefert null für fehlende Felder", () => {
    expect(mapEramonL2DisplayFields({ ip: "10.0.0.1" })).toEqual({
      ip: "10.0.0.1", dnsName: null, type: null, interfaceDescription: null,
    });
  });
});

describe("buildEramonSwitchPortKey", () => {
  it("normalisiert Switch und Port (trim + lowercase)", () => {
    expect(buildEramonSwitchPortKey(" GRZNX93OC3-1.domain.at ", " Ethernet1/53 ")).toBe("grznx93oc3-1.domain.at::ethernet1/53");
  });
});

describe("buildEramonL2Key", () => {
  it("kombiniert Switch, Interface, MAC und VLAN", () => {
    expect(buildEramonL2Key(" GRZ ", " Ethernet1/24 ", " E1:69:BA:54:49:F1 ", " 303 ")).toBe("grz::ethernet1/24::e1:69:ba:54:49:f1::303");
  });
});

describe("formatBandwidth", () => {
  it("formatiert bps als Gbit/s, Mbit/s und —", () => {
    expect(formatBandwidth(100000000000)).toBe("100 Gbit/s");
    expect(formatBandwidth(25000000000)).toBe("25 Gbit/s");
    expect(formatBandwidth(200000000000)).toBe("200 Gbit/s");
    expect(formatBandwidth(1000000000)).toBe("1 Gbit/s");
    expect(formatBandwidth(500000000)).toBe("500 Mbit/s");
    expect(formatBandwidth(null)).toBe("—");
  });
});
