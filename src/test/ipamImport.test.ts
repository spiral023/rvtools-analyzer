import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  detectParsedFileKind,
  mapIpamDisplayFields,
  isValidIpv4,
  IPAM_REQUIRED_HEADERS,
} from "@/lib/xlsx/parseHelpers";
import type { WorkerParseResult } from "@/domain/models/types";

const IPAM_HEADERS = [
  "IP Address", "Name", "MAC Address", "DHCP Client Identifier", "Status", "Type",
  "Discover Now", "Usage", "Lease State", "User Name", "Task Name",
  "First Discovered", "Last Discovered", "OS", "NetBIOS Name", "Device Type(s)",
  "Open Port(s)", "Fingerprint", "Comment", "Site",
];

describe("detectParsedFileKind (IPAM)", () => {
  it("erkennt IPAM-CSV an den Pflicht-Headern", () => {
    expect(detectParsedFileKind([{ sheetName: "Sheet1", headers: IPAM_HEADERS }])).toBe("ipam");
  });

  it("erkennt IPAM auch mit minimalen Pflicht-Headern", () => {
    expect(
      detectParsedFileKind([{ sheetName: "Sheet1", headers: [...IPAM_REQUIRED_HEADERS] }]),
    ).toBe("ipam");
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

describe("isValidIpv4", () => {
  it("akzeptiert gültige IPv4-Adressen", () => {
    expect(isValidIpv4("10.0.0.2")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
    expect(isValidIpv4("0.0.0.0")).toBe(true);
  });

  it("lehnt Oktette > 255 ab", () => {
    expect(isValidIpv4("10.0.0.256")).toBe(false);
    expect(isValidIpv4("10.0.0.257")).toBe(false);
  });

  it("lehnt ungültige Formate ab", () => {
    expect(isValidIpv4("")).toBe(false);
    expect(isValidIpv4("10.0.0")).toBe(false);
    expect(isValidIpv4("10.0.0.1.2")).toBe(false);
    expect(isValidIpv4("abc")).toBe(false);
  });
});

describe("mapIpamDisplayFields", () => {
  it("mappt alle IPAM-Spalten", () => {
    const fields = mapIpamDisplayFields({
      "Name": "SRV-04.rbgooe.at",
      "Status": "Used",
      "Type": "Host",
      "Usage": "DNS",
      "First Discovered": "2018-03-27 10:00:00 UTC",
      "Last Discovered": "2020-12-09 08:00:00 UTC",
      "Comment": "Gateway",
      "Site": "",
      "MAC Address": "",
      "OS": "",
      "NetBIOS Name": "",
      "Device Type(s)": "",
      "Open Port(s)": "",
      "Fingerprint": "",
    });
    expect(fields.name).toBe("SRV-04.rbgooe.at");
    expect(fields.status).toBe("Used");
    expect(fields.type).toBe("Host");
    expect(fields.usage).toBe("DNS");
    expect(fields.firstDiscovered).toBe("2018-03-27 10:00:00 UTC");
    expect(fields.lastDiscovered).toBe("2020-12-09 08:00:00 UTC");
    expect(fields.comment).toBe("Gateway");
    expect(fields.site).toBeNull();
    expect(fields.macAddress).toBeNull();
  });

  it("liefert null für leere Felder (Unused-Regel)", () => {
    const fields = mapIpamDisplayFields({
      "Status": "Unused",
      "Name": "",
      "Type": "",
      "Usage": "",
    });
    expect(fields.status).toBe("Unused");
    expect(fields.name).toBeNull();
    expect(fields.type).toBeNull();
    expect(fields.usage).toBeNull();
  });
});

function makeParsed(rows: Record<string, unknown>[], headers = IPAM_HEADERS): WorkerParseResult {
  return {
    fileKind: "ipam",
    vcenterName: "unknown-vcenter",
    exportTs: "2026-07-18T00:00:00.000Z",
    sheets: [{ sheetName: "Sheet1", headers, rows }],
    warnings: [],
    errors: [],
  };
}

const ipamRow = (over: Record<string, unknown> = {}) => ({
  "IP Address": "10.0.0.2",
  "Name": "SRV-04.rbgooe.at",
  "MAC Address": "",
  "DHCP Client Identifier": "",
  "Status": "Used",
  "Type": "Host",
  "Discover Now": "",
  "Usage": "DNS",
  "Lease State": "",
  "User Name": "",
  "Task Name": "",
  "First Discovered": "2018-03-27 10:00:00 UTC",
  "Last Discovered": "2020-12-09 08:00:00 UTC",
  "OS": "",
  "NetBIOS Name": "",
  "Device Type(s)": "",
  "Open Port(s)": "",
  "Fingerprint": "",
  "Comment": "",
  "Site": "",
  ...over,
});

describe("importIpamCsv", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it("importiert Zeilen, überspringt ungültige IPs mit Warnung und befüllt ipam_latest", async () => {
    const { importIpamCsv } = await import("@/domain/services/importService");
    const { getAllIpamLatest, getIpamImports } = await import("@/data/db");

    const parsed = makeParsed([
      ipamRow(),
      ipamRow({ "IP Address": "10.0.0.3" }),
      ipamRow({ "IP Address": "10.0.0.256" }),
      ipamRow({ "IP Address": "10.0.0.257" }),
    ]);
    const warnings: string[] = [];
    const result = await importIpamCsv(
      new File(["x"], "ipam.csv", { type: "text/csv" }), "chk-1", parsed, warnings, [], () => {},
    );

    expect(result.success).toBe(true);
    expect(result.fileKind).toBe("ipam");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Zeile 3");

    const latest = await getAllIpamLatest();
    expect(latest).toHaveLength(2);
    expect(latest.map((l) => l.ipAddress).sort()).toEqual(["10.0.0.2", "10.0.0.3"]);

    const imports = await getIpamImports();
    expect(imports).toHaveLength(1);
    expect(imports[0].rowCount).toBe(4);
  });

  it("lehnt Duplikate per Checksum ab", async () => {
    const { importIpamCsv } = await import("@/domain/services/importService");
    const parsed = makeParsed([ipamRow()]);
    const file = new File(["x"], "ipam.csv", { type: "text/csv" });

    await importIpamCsv(file, "chk-dup", parsed, [], [], () => {});
    const second = await importIpamCsv(file, "chk-dup", makeParsed([ipamRow()]), [], [], () => {});

    expect(second.success).toBe(false);
    expect(second.errors[0]).toContain("bereits importiert");
  });

  it("latest wins: zweiter Import überschreibt dieselbe IP-Adresse", async () => {
    const { importIpamCsv } = await import("@/domain/services/importService");
    const { getAllIpamLatest } = await import("@/data/db");
    const file1 = new File(["a"], "ipam-1.csv", { type: "text/csv" });
    const file2 = new File(["b"], "ipam-2.csv", { type: "text/csv" });

    await importIpamCsv(file1, "chk-a", makeParsed([ipamRow({ "Comment": "erster Import" })]), [], [], () => {});
    await importIpamCsv(file2, "chk-b", makeParsed([ipamRow({ "Comment": "zweiter Import" })]), [], [], () => {});

    const latest = await getAllIpamLatest();
    expect(latest).toHaveLength(1);
    expect(latest[0].comment).toBe("zweiter Import");
  });

  it("warnt bei fehlenden optionalen Spalten", async () => {
    const { importIpamCsv } = await import("@/domain/services/importService");
    const minimalHeaders = ["IP Address", "Status", "Type"];
    const warnings: string[] = [];
    const result = await importIpamCsv(
      new File(["x"], "ipam.csv", { type: "text/csv" }), "chk-min",
      makeParsed(
        [{ "IP Address": "10.0.0.2", "Status": "Used", "Type": "Host" }],
        minimalHeaders,
      ),
      warnings, [], () => {},
    );
    expect(result.success).toBe(true);
    expect(warnings.some((w) => w.includes("Fingerprint"))).toBe(true);
  });
});
