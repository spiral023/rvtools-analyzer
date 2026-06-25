import { describe, it, expect } from "vitest";
import {
  detectParsedFileKind,
  mapTechInfoDisplayFields,
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
