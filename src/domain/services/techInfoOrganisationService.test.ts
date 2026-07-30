import { describe, expect, it } from "vitest";
import { buildTechInfoOrganisation, type TechInfoOrgVmSource } from "@/domain/services/techInfoOrganisationService";

function vm(overrides: Partial<TechInfoOrgVmSource> = {}): TechInfoOrgVmSource {
  return {
    vmName: "vm-1",
    sysv: "Anna Muster",
    sysvDepartment: "RAITEC/IN-VIA",
    sysvDeputy: "Bert Beispiel",
    sysvDeputyDepartment: "RAITEC/IN-SEC",
    cpuCount: 4,
    memoryMiB: 8192,
    poweredOn: true,
    ...overrides,
  };
}

describe("buildTechInfoOrganisation", () => {
  it("baut die Hierarchie Organisation -> Bereich -> Abteilung -> Person -> VM für den Primärmodus", () => {
    const result = buildTechInfoOrganisation([vm()], "primary");

    expect(result.tree).toHaveLength(1);
    const org = result.tree[0]!;
    expect(org.org).toBe("RAITEC");
    expect(org.bereiche).toHaveLength(1);
    const bereich = org.bereiche[0]!;
    expect(bereich.code).toBe("IN");
    expect(bereich.label).toBe("IN");
    expect(bereich.abteilungen).toHaveLength(1);
    const abteilung = bereich.abteilungen[0]!;
    expect(abteilung.code).toBe("VIA");
    expect(abteilung.label).toBe("VIA");
    expect(abteilung.persons).toHaveLength(1);
    const person = abteilung.persons[0]!;
    expect(person.person).toBe("Anna Muster");
    expect(person.vmCount).toBe(1);
    expect(person.vCpuSum).toBe(4);
    expect(person.memoryMiBSum).toBe(8192);
    expect(person.poweredOnCount).toBe(1);
    expect(person.cpuDemandVmCount).toBe(0);
    expect(person.rightsizingVmCount).toBe(0);
    expect(result.summary.assignedVmCount).toBe(1);
    expect(result.summary.unassignedVmCount).toBe(0);
    expect(result.doubleCountingWarning).toBe(false);
  });

  it("wertet im Stellvertretungsmodus die SysVStv-Felder aus", () => {
    const result = buildTechInfoOrganisation([vm()], "deputy");

    const person = result.tree[0]!.bereiche[0]!.abteilungen[0]!.persons[0]!;
    expect(person.person).toBe("Bert Beispiel");
    expect(result.tree[0]!.bereiche[0]!.abteilungen[0]!.code).toBe("SEC");
  });

  it("zählt VMs im Modus 'beide Rollen' doppelt und setzt die Warnung", () => {
    const result = buildTechInfoOrganisation([vm()], "both");

    expect(result.doubleCountingWarning).toBe(true);
    expect(result.summary.assignedVmCount).toBe(1);
    const totalVmCountInTree = result.tree[0]!.bereiche.reduce((sum, bereich) => sum + bereich.vmCount, 0);
    expect(totalVmCountInTree).toBe(2);
  });

  it("markiert fehlende Verantwortliche als Datenqualitätsproblem und zählt die VM als unzugeordnet", () => {
    const result = buildTechInfoOrganisation([vm({ sysv: null })], "primary");

    expect(result.tree).toHaveLength(0);
    expect(result.summary.unassignedVmCount).toBe(1);
    expect(result.dataQuality).toHaveLength(1);
    expect(result.dataQuality[0]!.category).toBe("missing-responsible");
  });

  it("markiert einen leeren Pfad nach dem Organisationskürzel als nicht interpretierbar", () => {
    const result = buildTechInfoOrganisation([vm({ sysvDepartment: "RAITEC/" })], "primary");

    expect(result.tree).toHaveLength(0);
    expect(result.summary.unassignedVmCount).toBe(1);
    expect(result.dataQuality[0]!.category).toBe("unparseable-path");
  });

  it("führt einen Bereich ohne Bindestrich als eigene Abteilungsgruppe 'Ohne Abteilung'", () => {
    const result = buildTechInfoOrganisation([vm({ sysvDepartment: "RAITEC/OHNEBINDESTRICH" })], "primary");

    expect(result.tree).toHaveLength(1);
    expect(result.tree[0]!.bereiche[0]!.code).toBe("OHNEBINDESTRICH");
    expect(result.tree[0]!.bereiche[0]!.abteilungen[0]!.code).toBeNull();
    expect(result.tree[0]!.bereiche[0]!.abteilungen[0]!.label).toBe("Ohne Abteilung");
  });

  it("erkennt widersprüchliche Abteilungszuordnungen für dieselbe Person", () => {
    const result = buildTechInfoOrganisation(
      [
        vm({ vmName: "vm-1", sysv: "Anna Muster", sysvDepartment: "RAITEC/IN-VIA" }),
        vm({ vmName: "vm-2", sysv: "Anna Muster", sysvDepartment: "RAITEC/IN-SEC" }),
      ],
      "primary",
    );

    const conflict = result.dataQuality.find((issue) => issue.category === "conflicting-department");
    expect(conflict).toBeDefined();
    expect(conflict?.vmNames.sort()).toEqual(["vm-1", "vm-2"]);
  });

  it("aggregiert optionale CPU- und Rightsizing-Metriken nur bei vorhandener Datenbasis", () => {
    const result = buildTechInfoOrganisation([
      vm({
        vmName: "vm-1",
        cpuCount: 8,
        cpuDemandAverageMHz: 800,
        configuredCpuCapacityMHz: 8_000,
        reclaimableVcpu: 2,
      }),
      vm({
        vmName: "vm-2",
        cpuCount: 4,
        cpuDemandAverageMHz: null,
        configuredCpuCapacityMHz: null,
        reclaimableVcpu: null,
      }),
    ], "primary");

    const aggregate = result.tree[0]!.bereiche[0]!;
    expect(aggregate).toMatchObject({
      vCpuSum: 12,
      cpuDemandAverageMHzSum: 800,
      cpuDemandCapacityMHzSum: 8_000,
      cpuDemandVmCount: 1,
      reclaimableVcpuSum: 2,
      rightsizingVmCount: 1,
    });
  });
});
