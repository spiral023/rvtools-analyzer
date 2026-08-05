import { describe, expect, it } from "vitest";
import type { TechInfoLatest } from "@/domain/models/types";
import {
  buildSysvDataPackageScopeDirectory,
  formatSysvScopeLabel,
  resolveSysvDataPackageVmNames,
  sysvScopeKindPlural,
} from "@/lib/sysvDataPackageScope";

function techInfo(vmName: string, values: Partial<TechInfoLatest> = {}): TechInfoLatest {
  return {
    vmName,
    vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
    importedAt: "2026-08-03T00:00:00.000Z",
    techInfoImportId: "tech-info-test",
    rowIndex: 0,
    serverType: null,
    maintenanceWindow: null,
    operatingSystem: null,
    comment: null,
    sysv: null,
    sysvDepartment: null,
    sysvDeputy: null,
    sysvDeputyDepartment: null,
    bz: null,
    clusterFromTechInfo: null,
    cvBackup: null,
    az: null,
    ...values,
  };
}

describe("SysV-Datenpaket-Scope", () => {
  it("berücksichtigt SysV und SysVStv für Bereich, Abteilung und Person", () => {
    const rows = [
      techInfo("vm-a", { sysv: "Anna Beispiel", sysvDepartment: "ALPHA/WEB-ALPHA" }),
      techInfo("vm-b", { sysvDeputy: "Anna Beispiel", sysvDeputyDepartment: "ALPHA/WEB-ALPHA" }),
      techInfo("vm-c", { sysv: "Berta Beispiel", sysvDepartment: "ALPHA/WEB-BETA" }),
      techInfo("vm-d", { sysv: "Anna Beispiel", sysvDepartment: "BETA/WEB-ALPHA" }),
    ];
    const directory = buildSysvDataPackageScopeDirectory(rows);
    const alphaArea = directory.areas.find((scope) => scope.displayName === "ALPHA/WEB");
    const alphaDepartment = directory.departments.find((scope) => scope.displayName === "ALPHA/WEB-ALPHA");
    const anna = directory.persons.find((scope) => scope.displayName === "Anna Beispiel");

    expect(alphaArea).toBeDefined();
    expect(alphaDepartment).toBeDefined();
    expect(anna).toBeDefined();
    expect(resolveSysvDataPackageVmNames(rows, alphaArea!)).toEqual(new Set(["vm-a", "vm-b", "vm-c"]));
    expect(resolveSysvDataPackageVmNames(rows, alphaDepartment!)).toEqual(new Set(["vm-a", "vm-b"]));
    expect(resolveSysvDataPackageVmNames(rows, anna!)).toEqual(new Set(["vm-a", "vm-b", "vm-d"]));
  });

  it("trennt gleichnamige Bereiche nach Organisation und hält Personen global dedupliziert", () => {
    const rows = [
      techInfo("vm-a", { sysv: "Anna Beispiel", sysvDepartment: "ALPHA/WEB-UNIX" }),
      techInfo("vm-b", { sysv: "Anna Beispiel", sysvDepartment: "BETA/WEB-UNIX" }),
    ];
    const directory = buildSysvDataPackageScopeDirectory(rows);
    const areaNames = directory.areas.map((scope) => scope.displayName).sort();
    const anna = directory.persons.find((scope) => scope.normalizedName === "anna beispiel");

    expect(areaNames).toEqual(["ALPHA/WEB", "BETA/WEB"]);
    expect(directory.persons).toHaveLength(1);
    expect(resolveSysvDataPackageVmNames(rows, anna!)).toEqual(new Set(["vm-a", "vm-b"]));
  });

  it("bietet Personen mit ungültigem Organisationspfad an, erzeugt dafür aber keinen Bereichsscope", () => {
    const rows = [techInfo("vm-a", { sysv: "Cara Beispiel", sysvDepartment: "-" })];
    const directory = buildSysvDataPackageScopeDirectory(rows);

    expect(directory.areas).toHaveLength(0);
    expect(directory.departments).toHaveLength(0);
    expect(directory.persons).toHaveLength(1);
    expect(resolveSysvDataPackageVmNames(rows, directory.persons[0])).toEqual(new Set(["vm-a"]));
  });
});

describe("formatSysvScopeLabel", () => {
  it("lässt Personennamen unverändert und benennt Organisationseinheiten", () => {
    expect(formatSysvScopeLabel("person", "MUSTERMANN Max")).toBe("MUSTERMANN Max");
    expect(formatSysvScopeLabel("department", "IN-VIA")).toBe("Abteilung IN-VIA");
    expect(formatSysvScopeLabel("area", "IN")).toBe("Bereich IN");
  });

  it("behält Organisationspräfixe im Label", () => {
    expect(formatSysvScopeLabel("department", "FIRMA/IN-VIA")).toBe("Abteilung FIRMA/IN-VIA");
  });
});

describe("sysvScopeKindPlural", () => {
  it("liefert den Sammelbegriff je Ebene", () => {
    expect(sysvScopeKindPlural("person")).toBe("Personen");
    expect(sysvScopeKindPlural("department")).toBe("Abteilungen");
    expect(sysvScopeKindPlural("area")).toBe("Bereiche");
  });
});
