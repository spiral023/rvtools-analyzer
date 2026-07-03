import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapTechInfoDisplayFields,
  mapTechInfoClientDisplayFields,
  hasIdenticalSysvAndDeputy,
  isTechInfoNewerOrEqual,
  normalizeVmNameForMatch,
} from "@/lib/xlsx/parseHelpers";

describe("tech-info helpers", () => {
  it("detects rvtools file kind when rvtools sheets are present", () => {
    const kind = detectParsedFileKind([
      { sheetName: "vInfo", headers: ["VM", "Name"] },
      { sheetName: "vHost", headers: ["Host"] },
    ]);
    expect(kind).toBe("rvtools");
  });

  it("detects tech-info file kind when required headers are present", () => {
    const kind = detectParsedFileKind([
      { sheetName: "Server Doku", headers: ["Name", "Wartungsfenster", "Betriebssystem", "Kommentar"] },
    ]);
    expect(kind).toBe("tech-info");
  });

  it("detects tech-info-client file kind when client headers are present", () => {
    const kind = detectParsedFileKind([
      {
        sheetName: "Client Doku",
        headers: ["Name", "BLZ", "Standort", "IP", "MAC Adresse", "Poolname", "User", "OS", "Cluster", "vCenter"],
      },
    ]);
    expect(kind).toBe("tech-info-client");
  });

  it("prefers tech-info over tech-info-client when server headers are present", () => {
    const kind = detectParsedFileKind([
      { sheetName: "Doku", headers: ["Name", "Wartungsfenster", "Betriebssystem", "BLZ", "MAC Adresse", "Poolname"] },
    ]);
    expect(kind).toBe("tech-info");
  });

  it("maps tech-info-client columns and skips CPU/RAM min/max", () => {
    const mapped = mapTechInfoClientDisplayFields({
      Name: "VRX41168",
      BLZ: "80018",
      Standort: "LNZ9920",
      IP: "10.19.106.129",
      "MAC Adresse": "00:51:54:a4:83:0a",
      Poolname: "9920_PodB_5",
      "Geändert von": "SDDC_Validations",
      "Änderungsdatum": "2026-05-20T12:25:57.22",
      "Erstellt von": "SDDC_larwpuz",
      Erstellungsdatum: "2023-06-05T12:03:07.063",
      User: "larwpuz",
      Hardware: "Virtueller-Client",
      OS: "Windows 10",
      Cluster: "CL_LNZ_VDI_9920_ITSP_B4",
      vCenter: "VCenter9920",
      Site: "B",
      Insider: "Standard",
      "CPU min": 2,
      "CPU max": 4,
      "RAM min": 4096,
      "RAM max": 8192,
      "HW Änderungen": "Normal",
      Monitoring: "MO4",
      "Domäne": "DOM.LOCAL",
    });

    expect(mapped.blz).toBe("80018");
    expect(mapped.standort).toBe("LNZ9920");
    expect(mapped.ip).toBe("10.19.106.129");
    expect(mapped.macAddress).toBe("00:51:54:a4:83:0a");
    expect(mapped.poolName).toBe("9920_PodB_5");
    expect(mapped.modifiedBy).toBe("SDDC_Validations");
    expect(mapped.modifiedAt).toBe("2026-05-20T12:25:57.22");
    expect(mapped.createdBy).toBe("SDDC_larwpuz");
    expect(mapped.createdAt).toBe("2023-06-05T12:03:07.063");
    expect(mapped.user).toBe("larwpuz");
    expect(mapped.hardware).toBe("Virtueller-Client");
    expect(mapped.os).toBe("Windows 10");
    expect(mapped.cluster).toBe("CL_LNZ_VDI_9920_ITSP_B4");
    expect(mapped.vcenter).toBe("VCenter9920");
    expect(mapped.site).toBe("B");
    expect(mapped.insider).toBe("Standard");
    expect(mapped.hwChanges).toBe("Normal");
    expect(mapped.monitoring).toBe("MO4");
    expect(mapped.domain).toBe("DOM.LOCAL");
    expect(mapped).not.toHaveProperty("cpuMin");
    expect(mapped).not.toHaveProperty("ramMax");
  });

  it("maps requested tech-info columns correctly", () => {
    const mapped = mapTechInfoDisplayFields({
      Servertyp: "Applikationsserver",
      Wartungsfenster: "SRVSTD1",
      Betriebssystem: "W2022",
      Kommentar: "Testserver",
      SysV: "ASANGER Philipp",
      "SysV Abteilung": "RAITEC/IN-VIA",
      SysVStv: "WINTER Simon",
      "SysVStv Abteilung": "RAITEC/IN-VIA",
      BZ: "E",
      Schrankreihe: "CL_LNZ_SRV_9910_WIN06",
      "CV-Backup": true,
      AZ: "FTZ",
    });

    expect(mapped.serverType).toBe("Applikationsserver");
    expect(mapped.maintenanceWindow).toBe("SRVSTD1");
    expect(mapped.operatingSystem).toBe("W2022");
    expect(mapped.comment).toBe("Testserver");
    expect(mapped.sysv).toBe("ASANGER Philipp");
    expect(mapped.sysvDepartment).toBe("RAITEC/IN-VIA");
    expect(mapped.sysvDeputy).toBe("WINTER Simon");
    expect(mapped.sysvDeputyDepartment).toBe("RAITEC/IN-VIA");
    expect(mapped.bz).toBe("E");
    expect(mapped.clusterFromTechInfo).toBe("CL_LNZ_SRV_9910_WIN06");
    expect(mapped.cvBackup).toBe(true);
    expect(mapped.az).toBe("FTZ");
  });

  it("normalizes vm names for matching", () => {
    expect(normalizeVmNameForMatch("  MiChiAPP1101  ")).toBe("michiapp1101");
  });

  it("detects identical SysV and SysVStv values", () => {
    expect(hasIdenticalSysvAndDeputy("ASANGER Philipp", "asanger philipp")).toBe(true);
    expect(hasIdenticalSysvAndDeputy("ASANGER Philipp", "WINTER Simon")).toBe(false);
    expect(hasIdenticalSysvAndDeputy("ASANGER Philipp", null)).toBe(false);
    expect(hasIdenticalSysvAndDeputy("", "")).toBe(false);
  });

  it("uses newest-or-equal timestamp policy", () => {
    expect(isTechInfoNewerOrEqual("2026-02-23T01:00:00.000Z", "2026-02-23T00:59:59.000Z")).toBe(true);
    expect(isTechInfoNewerOrEqual("2026-02-23T01:00:00.000Z", "2026-02-23T01:00:00.000Z")).toBe(true);
    expect(isTechInfoNewerOrEqual("2026-02-23T00:59:59.000Z", "2026-02-23T01:00:00.000Z")).toBe(false);
  });
});
