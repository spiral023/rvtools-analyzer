import { describe, expect, it } from "vitest";
import type { SysvDataPackageScope, TechInfoLatest } from "@/domain/models/types";
import { buildSysvBatchScopeTargets } from "@/domain/services/sysvBatchExportService";
import type { SysvDataPackageSource } from "@/domain/services/sysvDataPackageService";

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

function source(rows: TechInfoLatest[]): SysvDataPackageSource {
  return { techInfoLatest: rows } as unknown as SysvDataPackageSource;
}

const request = (level: "area" | "department" | "person") => ({ level, includeVropsTimeSeries: false });

describe("SysV-Batch-Zielscopes", () => {
  const rows = [
    techInfo("vm-a", { sysv: "Anna Beispiel", sysvDepartment: "ALPHA/WEB-ALPHA" }),
    techInfo("vm-b", { sysv: "Berta Beispiel", sysvDepartment: "ALPHA/WEB-BETA" }),
    techInfo("vm-c", { sysv: "Anna Beispiel", sysvDepartment: "BETA/WEB-ALPHA" }),
  ];

  it("erzeugt im Bereichs-Batch alle Ebenen inklusive global wiederholter Personen", () => {
    const targets = buildSysvBatchScopeTargets(source(rows), request("area"), new Date("2026-08-03T00:00:00.000Z"));

    expect(targets).toHaveLength(8);
    expect(targets.filter((target) => target.scope.kind === "area")).toHaveLength(2);
    expect(targets.filter((target) => target.scope.kind === "department")).toHaveLength(3);
    expect(targets.filter((target) => target.scope.kind === "person")).toHaveLength(3);
    expect(targets.filter((target) => target.scope.kind === "person" && target.scope.displayName === "Anna Beispiel")).toHaveLength(2);
    expect(targets.every((target) => target.path.startsWith("bereiche/"))).toBe(true);
  });

  it("entfernt bei niedrigerer Ebene die übergeordneten Ordner und dedupliziert globale Personen", () => {
    const departmentTargets = buildSysvBatchScopeTargets(source(rows), request("department"), new Date("2026-08-03T00:00:00.000Z"));
    const personTargets = buildSysvBatchScopeTargets(source(rows), request("person"), new Date("2026-08-03T00:00:00.000Z"));

    expect(departmentTargets).toHaveLength(6);
    expect(departmentTargets.every((target) => !target.path.startsWith("bereiche/"))).toBe(true);
    expect(departmentTargets.filter((target) => target.scope.kind === "person" && target.path.includes("systemverantwortliche/")).length).toBe(3);
    expect(personTargets).toHaveLength(2);
    expect(personTargets.every((target) => target.path.startsWith("systemverantwortliche/"))).toBe(true);
  });

  it("begrenzt den Batch auf einen gewählten Teilbaum", () => {
    const root: SysvDataPackageScope = {
      kind: "department",
      displayName: "ALPHA/WEB-ALPHA",
      normalizedPath: "alpha/web-alpha",
    };
    const targets = buildSysvBatchScopeTargets(source(rows), { ...request("department"), root }, new Date("2026-08-03T00:00:00.000Z"));

    expect(targets.map((target) => target.scope.displayName)).toEqual(["ALPHA/WEB-ALPHA", "Anna Beispiel"]);
  });
});
