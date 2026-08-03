import { describe, expect, it } from "vitest";
import type { NormalizedVm, TechInfoLatest } from "@/domain/models/types";
import { buildGlobalFilterFields, evaluateGlobalFilter } from "@/lib/globalFilter";
import {
  buildSysvScopeDirectory,
  buildSysvScopeGlobalFilter,
  getAvailableSysvScopePreference,
  normalizeSysvDepartmentPath,
  normalizeSysvPersonName,
  splitSysvContactName,
} from "@/lib/sysvScope";

function techInfo(overrides: Partial<TechInfoLatest> = {}): TechInfoLatest {
  return {
    vmNameNorm: "vm-a",
    vmName: "vm-a",
    importedAt: "2026-08-03T10:00:00.000Z",
    techInfoImportId: "tech-1",
    rowIndex: 1,
    serverType: null,
    maintenanceWindow: null,
    operatingSystem: null,
    comment: null,
    sysv: "MUSTERMANN Max",
    sysvDepartment: "FIRMA/OPS-UNIX",
    sysvDeputy: "STELLVERTRETUNG Nina",
    sysvDeputyDepartment: "FIRMA/OPS-UNIX",
    bz: null,
    clusterFromTechInfo: null,
    cvBackup: null,
    az: null,
    ...overrides,
  };
}

describe("SysV-Scope-Verzeichnis", () => {
  it("nimmt primäre und stellvertretende Personen dedupliziert in die Hierarchie auf", () => {
    const directory = buildSysvScopeDirectory([
      techInfo(),
      techInfo({ vmNameNorm: "vm-b", vmName: "vm-b", sysv: "mustermann   max", sysvDeputy: null, sysvDeputyDepartment: null }),
      techInfo({
        vmNameNorm: "vm-c",
        vmName: "vm-c",
        sysv: null,
        sysvDepartment: null,
        sysvDeputy: "STELLVERTRETUNG Nina",
        sysvDeputyDepartment: "FIRMA/OPS-WINDOWS",
      }),
    ]);

    expect(directory.persons).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: "MUSTERMANN Max", normalizedName: "mustermann max", vmCount: 2 }),
      expect.objectContaining({ displayName: "STELLVERTRETUNG Nina", normalizedName: "stellvertretung nina", vmCount: 2 }),
    ]));
    expect(directory.departments).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalizedPath: "firma/ops-unix", vmCount: 2 }),
      expect.objectContaining({ normalizedPath: "firma/ops-windows", vmCount: 1 }),
    ]));
  });

  it("behält gleiche Abteilungscodes in unterschiedlichen vollständigen Pfaden getrennt", () => {
    const directory = buildSysvScopeDirectory([
      techInfo({ sysvDepartment: "FIRMA/OPS-UNIX" }),
      techInfo({ vmNameNorm: "vm-b", vmName: "vm-b", sysvDepartment: "ANDERE/OPS-UNIX" }),
    ]);

    expect(directory.departments.map((department) => department.normalizedPath)).toEqual([
      "andere/ops-unix",
      "firma/ops-unix",
    ]);
  });

  it("sortiert die Auswahlhierarchie in den Settings alphabetisch", () => {
    const directory = buildSysvScopeDirectory([
      techInfo({ vmNameNorm: "vm-z", vmName: "vm-z", sysv: "Zora Beispiel", sysvDepartment: "ZETA/OPS-ZWEI" }),
      techInfo({ vmNameNorm: "vm-b", vmName: "vm-b", sysv: "Berta Beispiel", sysvDepartment: "ALPHA/WEB-BETA" }),
      techInfo({ vmNameNorm: "vm-a", vmName: "vm-a", sysv: "Anna Beispiel", sysvDepartment: "ALPHA/WEB-ALPHA" }),
      techInfo({ vmNameNorm: "vm-c", vmName: "vm-c", sysv: "Clara Beispiel", sysvDepartment: "ALPHA/API-GAMMA" }),
      techInfo({ vmNameNorm: "vm-d", vmName: "vm-d", sysv: "Anton Beispiel", sysvDepartment: "ALPHA/API-GAMMA" }),
    ]);

    expect(directory.tree.map((node) => node.label)).toEqual(["ALPHA", "ZETA"]);
    expect(directory.tree[0]!.children.map((node) => node.label)).toEqual(["API", "WEB"]);
    expect(directory.tree[0]!.children[1]!.children.map((node) => node.label)).toEqual(["ALPHA", "BETA"]);
    expect(directory.tree[0]!.children[0]!.children[0]!.children.map((node) => node.label)).toEqual([
      "Anton Beispiel",
      "Clara Beispiel",
    ]);
  });

  it("fällt bei nicht mehr eindeutigen oder fehlenden gespeicherten Werten auf Alle Systeme zurück", () => {
    const directory = buildSysvScopeDirectory([techInfo()]);
    expect(getAvailableSysvScopePreference(directory, {
      kind: "person",
      displayName: "Nicht vorhanden",
      normalizedName: "nicht vorhanden",
    })).toEqual({ kind: "all" });
  });
});

describe("SysV-Normalisierung und Filter", () => {
  it("normalisiert Namen, Abteilungspfade und die vereinbarte Kontaktzerlegung", () => {
    expect(normalizeSysvPersonName("  MUSTERMANN   Max  ")).toBe("mustermann max");
    expect(normalizeSysvDepartmentPath(" FIRMA / OPS - UNIX ")).toBe("firma/ops-unix");
    expect(splitSysvContactName("MUSTERMANN Max Peter")).toEqual({
      displayName: "MUSTERMANN Max Peter",
      lastName: "MUSTERMANN",
      firstName: "Max Peter",
    });
    expect(splitSysvContactName("MUSTERMANN")).toMatchObject({ lastName: "MUSTERMANN", firstName: "" });
  });

  it("erstellt einen Root-ODER-Filter, der beide Rollen mit der Fachnormalisierung prüft", () => {
    const vm = {
      snapshotId: "snapshot-1",
      vcenterId: "vc-1",
      vmKey: "vm-1",
      vmName: "vm-a",
    } as NormalizedVm;
    const row = techInfo({ sysv: "  mustermann   MAX  ", sysvDepartment: "FIRMA / OPS - UNIX", sysvDeputy: "MUSTERMANN Max" });
    const fields = buildGlobalFilterFields([vm], [row], [], {});
    const context = { vm, techInfo: row, techInfoClient: null as null, rawRowsBySource: {} };

    const personFilter = buildSysvScopeGlobalFilter({
      kind: "person",
      displayName: "MUSTERMANN Max",
      normalizedName: "mustermann max",
    });
    const departmentFilter = buildSysvScopeGlobalFilter({
      kind: "department",
      displayName: "FIRMA/OPS-UNIX",
      normalizedPath: "firma/ops-unix",
    });

    expect(personFilter?.operator).toBe("or");
    expect(personFilter?.children).toHaveLength(2);
    expect(evaluateGlobalFilter(personFilter!, context, fields)).toBe(true);
    expect(evaluateGlobalFilter(departmentFilter!, context, fields)).toBe(true);
    expect(buildSysvScopeGlobalFilter({ kind: "all" })).toBeNull();
  });
});
