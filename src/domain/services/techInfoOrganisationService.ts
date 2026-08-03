import { parseOrgPath } from "@/lib/techInfoOrgLabels";

export type TechInfoOrgRoleMode = "primary" | "deputy" | "both";
export type TechInfoOrgRole = "primary" | "deputy";

export type TechInfoOrgDataQualityCategory =
  | "missing-responsible"
  | "unparseable-path"
  | "conflicting-department";

/** Eine Server-VM inkl. der für die Organisationsauswertung relevanten Tech-Info- und RVTools-Felder. */
export interface TechInfoOrgVmSource {
  vmName: string;
  sysv: string | null;
  sysvDepartment: string | null;
  sysvDeputy: string | null;
  sysvDeputyDepartment: string | null;
  cpuCount: number | null;
  memoryMiB: number | null;
  poweredOn: boolean;
  /** Optionaler mittlerer CPU Demand aus dem jüngsten vROps-Zeitreihenimport. */
  cpuDemandAverageMHz?: number | null;
  /** Optionale konfigurierte CPU-Kapazität der VM für die Intensitätsberechnung. */
  configuredCpuCapacityMHz?: number | null;
  /** Optionales, prüfpflichtiges CPU-Rightsizing-Potenzial. */
  reclaimableVcpu?: number | null;
}

export interface TechInfoOrgAggregate {
  vmCount: number;
  poweredOnCount: number;
  poweredOffCount: number;
  vCpuSum: number;
  memoryMiBSum: number;
  cpuDemandAverageMHzSum: number;
  cpuDemandCapacityMHzSum: number;
  cpuDemandVmCount: number;
  reclaimableVcpuSum: number;
  rightsizingVmCount: number;
}

export interface TechInfoOrgVmRef {
  vmName: string;
  role: TechInfoOrgRole;
  poweredOn: boolean;
  cpuCount: number | null;
  memoryMiB: number | null;
  cpuDemandAverageMHz: number | null;
  configuredCpuCapacityMHz: number | null;
  reclaimableVcpu: number | null;
}

export interface TechInfoOrgPersonNode extends TechInfoOrgAggregate {
  id: string;
  person: string;
  vms: TechInfoOrgVmRef[];
}

export interface TechInfoOrgAbteilungNode extends TechInfoOrgAggregate {
  id: string;
  code: string | null;
  label: string;
  persons: TechInfoOrgPersonNode[];
}

export interface TechInfoOrgBereichNode extends TechInfoOrgAggregate {
  id: string;
  code: string | null;
  label: string;
  abteilungen: TechInfoOrgAbteilungNode[];
}

export interface TechInfoOrgNode extends TechInfoOrgAggregate {
  id: string;
  org: string | null;
  label: string;
  bereiche: TechInfoOrgBereichNode[];
}

export interface TechInfoOrgDataQualityIssue {
  category: TechInfoOrgDataQualityCategory;
  person: string | null;
  vmNames: string[];
  detail: string;
}

export interface TechInfoOrganisationSummary {
  totalVmCount: number;
  assignedVmCount: number;
  unassignedVmCount: number;
  orgCount: number;
  bereichCount: number;
  abteilungCount: number;
  personCount: number;
  dataQualityVmCount: number;
}

export interface TechInfoOrganisationResult {
  roleMode: TechInfoOrgRoleMode;
  tree: TechInfoOrgNode[];
  summary: TechInfoOrganisationSummary;
  dataQuality: TechInfoOrgDataQualityIssue[];
  /** true bei roleMode "both": dieselbe VM kann unter Primär- und Stellvertretungs-Ast gleichzeitig auftauchen. */
  doubleCountingWarning: boolean;
}

interface RoleOccurrence {
  vmName: string;
  role: TechInfoOrgRole;
  person: string | null;
  departmentRaw: string | null;
  cpuCount: number | null;
  memoryMiB: number | null;
  poweredOn: boolean;
  cpuDemandAverageMHz: number | null;
  configuredCpuCapacityMHz: number | null;
  reclaimableVcpu: number | null;
}

export function normalizePersonKey(person: string): string {
  return person.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

function rolesForMode(mode: TechInfoOrgRoleMode): TechInfoOrgRole[] {
  if (mode === "primary") return ["primary"];
  if (mode === "deputy") return ["deputy"];
  return ["primary", "deputy"];
}

function emptyAggregate(): TechInfoOrgAggregate {
  return {
    vmCount: 0,
    poweredOnCount: 0,
    poweredOffCount: 0,
    vCpuSum: 0,
    memoryMiBSum: 0,
    cpuDemandAverageMHzSum: 0,
    cpuDemandCapacityMHzSum: 0,
    cpuDemandVmCount: 0,
    reclaimableVcpuSum: 0,
    rightsizingVmCount: 0,
  };
}

function addOccurrenceToAggregate(aggregate: TechInfoOrgAggregate, occurrence: RoleOccurrence): void {
  aggregate.vmCount += 1;
  if (occurrence.poweredOn) aggregate.poweredOnCount += 1;
  else aggregate.poweredOffCount += 1;
  aggregate.vCpuSum += occurrence.cpuCount ?? 0;
  aggregate.memoryMiBSum += occurrence.memoryMiB ?? 0;
  if (occurrence.cpuDemandAverageMHz !== null) {
    aggregate.cpuDemandAverageMHzSum += occurrence.cpuDemandAverageMHz;
    aggregate.cpuDemandVmCount += 1;
    if (occurrence.configuredCpuCapacityMHz !== null) {
      aggregate.cpuDemandCapacityMHzSum += occurrence.configuredCpuCapacityMHz;
    }
  }
  if (occurrence.reclaimableVcpu !== null) {
    aggregate.reclaimableVcpuSum += occurrence.reclaimableVcpu;
    aggregate.rightsizingVmCount += 1;
  }
}

function addIssue(
  issues: Map<string, TechInfoOrgDataQualityIssue>,
  category: TechInfoOrgDataQualityCategory,
  person: string | null,
  rawValue: string | null,
  vmName: string,
  detail: string,
): void {
  const key = `${category}|${person ?? ""}|${rawValue ?? ""}`;
  const existing = issues.get(key);
  if (existing) {
    if (!existing.vmNames.includes(vmName)) existing.vmNames.push(vmName);
    return;
  }
  issues.set(key, { category, person, vmNames: [vmName], detail });
}

export function buildTechInfoOrganisation(
  sources: readonly TechInfoOrgVmSource[],
  roleMode: TechInfoOrgRoleMode,
): TechInfoOrganisationResult {
  const roles = rolesForMode(roleMode);
  const issues = new Map<string, TechInfoOrgDataQualityIssue>();
  const orgNodes = new Map<string, TechInfoOrgNode>();
  const departmentsByPerson = new Map<string, Set<string>>();
  const assignedVmNames = new Set<string>();
  const dataQualityVmNames = new Set<string>();

  for (const source of sources) {
    for (const role of roles) {
      const person = role === "primary" ? source.sysv : source.sysvDeputy;
      const departmentRaw = role === "primary" ? source.sysvDepartment : source.sysvDeputyDepartment;
      const occurrence: RoleOccurrence = {
        vmName: source.vmName,
        role,
        person: person?.trim() || null,
        departmentRaw,
        cpuCount: source.cpuCount,
        memoryMiB: source.memoryMiB,
        poweredOn: source.poweredOn,
        cpuDemandAverageMHz: source.cpuDemandAverageMHz ?? null,
        configuredCpuCapacityMHz: source.configuredCpuCapacityMHz ?? null,
        reclaimableVcpu: source.reclaimableVcpu ?? null,
      };

      if (!occurrence.person) {
        addIssue(issues, "missing-responsible", null, null, source.vmName, `Kein${role === "primary" ? "e" : "e Stellvertretung für den"} Systemverantwortliche${role === "primary" ? "r" : ""} hinterlegt.`);
        dataQualityVmNames.add(source.vmName);
        continue;
      }

      const personKey = normalizePersonKey(occurrence.person);
      if (departmentRaw?.trim()) {
        const set = departmentsByPerson.get(personKey) ?? new Set<string>();
        set.add(departmentRaw.trim());
        departmentsByPerson.set(personKey, set);
      }

      const parsed = parseOrgPath(departmentRaw);
      if (!parsed || !parsed.valid) {
        addIssue(
          issues,
          "unparseable-path",
          occurrence.person,
          departmentRaw,
          source.vmName,
          departmentRaw ? `Abteilungspfad "${departmentRaw}" lässt sich nicht in Bereich/Abteilung zerlegen.` : "Kein Abteilungspfad hinterlegt.",
        );
        dataQualityVmNames.add(source.vmName);
        continue;
      }

      assignedVmNames.add(source.vmName);

      const orgKey = parsed.org ?? "__none__";
      let orgNode = orgNodes.get(orgKey);
      if (!orgNode) {
        orgNode = { id: `org:${orgKey}`, org: parsed.org, label: parsed.org ?? "Ohne Organisation", bereiche: [], ...emptyAggregate() };
        orgNodes.set(orgKey, orgNode);
      }

      const bereichKey = parsed.bereich!.trim().toUpperCase();
      let bereichNode = orgNode.bereiche.find((entry) => entry.code === bereichKey);
      if (!bereichNode) {
        bereichNode = {
          id: `${orgNode.id}/bereich:${bereichKey}`,
          code: bereichKey,
          label: parsed.bereich!,
          abteilungen: [],
          ...emptyAggregate(),
        };
        orgNode.bereiche.push(bereichNode);
      }

      const abteilungKey = parsed.abteilung ? parsed.abteilung.trim().toUpperCase() : "__none__";
      let abteilungNode = bereichNode.abteilungen.find((entry) => entry.code === abteilungKey);
      if (!abteilungNode) {
        abteilungNode = {
          id: `${bereichNode.id}/abteilung:${abteilungKey}`,
          code: parsed.abteilung ? abteilungKey : null,
          label: parsed.abteilung ?? "Ohne Abteilung",
          persons: [],
          ...emptyAggregate(),
        };
        bereichNode.abteilungen.push(abteilungNode);
      }

      let personNode = abteilungNode.persons.find((entry) => entry.id === `${abteilungNode.id}/person:${personKey}`);
      if (!personNode) {
        personNode = { id: `${abteilungNode.id}/person:${personKey}`, person: occurrence.person, vms: [], ...emptyAggregate() };
        abteilungNode.persons.push(personNode);
      }

      personNode.vms.push({
        vmName: occurrence.vmName,
        role,
        poweredOn: occurrence.poweredOn,
        cpuCount: occurrence.cpuCount,
        memoryMiB: occurrence.memoryMiB,
        cpuDemandAverageMHz: occurrence.cpuDemandAverageMHz,
        configuredCpuCapacityMHz: occurrence.configuredCpuCapacityMHz,
        reclaimableVcpu: occurrence.reclaimableVcpu,
      });
      addOccurrenceToAggregate(personNode, occurrence);
      addOccurrenceToAggregate(abteilungNode, occurrence);
      addOccurrenceToAggregate(bereichNode, occurrence);
      addOccurrenceToAggregate(orgNode, occurrence);
    }
  }

  for (const [personKey, values] of departmentsByPerson) {
    if (values.size <= 1) continue;
    let displayPerson = personKey;
    const affectedVmNames: string[] = [];
    for (const source of sources) {
      const matchingName = [source.sysv, source.sysvDeputy]
        .find((name) => name && normalizePersonKey(name) === personKey);
      if (!matchingName) continue;
      if (displayPerson === personKey) displayPerson = matchingName;
      affectedVmNames.push(source.vmName);
    }
    for (const vmName of affectedVmNames) dataQualityVmNames.add(vmName);
    issues.set(`conflicting-department|${personKey}`, {
      category: "conflicting-department",
      person: displayPerson,
      vmNames: affectedVmNames,
      detail: `Unterschiedliche Abteilungsangaben für dieselbe Person: ${[...values].join(", ")}.`,
    });
  }

  // Die Einfügereihenfolge hängt vom Tech-Info-Import ab. Für die Navigation ist
  // eine stabile alphabetische Reihenfolge auf jeder Hierarchieebene hilfreicher.
  const compareLabels = <T extends { label: string }>(left: T, right: T) => (
    left.label.localeCompare(right.label, "de-DE", { sensitivity: "base" })
  );
  const tree = [...orgNodes.values()];
  for (const org of tree) {
    org.bereiche.sort(compareLabels);
    for (const bereich of org.bereiche) {
      bereich.abteilungen.sort(compareLabels);
      for (const abteilung of bereich.abteilungen) {
        abteilung.persons.sort((left, right) => left.person.localeCompare(right.person, "de-DE", { sensitivity: "base" }));
      }
    }
  }
  tree.sort(compareLabels);
  const bereichCount = tree.reduce((sum, org) => sum + org.bereiche.length, 0);
  const abteilungCount = tree.reduce((sum, org) => sum + org.bereiche.reduce((s, bereich) => s + bereich.abteilungen.length, 0), 0);
  const personKeys = new Set<string>();
  for (const org of tree) {
    for (const bereich of org.bereiche) {
      for (const abteilung of bereich.abteilungen) {
        for (const person of abteilung.persons) personKeys.add(normalizePersonKey(person.person));
      }
    }
  }

  const totalVmNames = new Set(sources.map((source) => source.vmName));
  const unassignedVmNames = new Set([...totalVmNames].filter((vmName) => !assignedVmNames.has(vmName)));

  return {
    roleMode,
    tree,
    summary: {
      totalVmCount: totalVmNames.size,
      assignedVmCount: assignedVmNames.size,
      unassignedVmCount: unassignedVmNames.size,
      orgCount: tree.length,
      bereichCount,
      abteilungCount,
      personCount: personKeys.size,
      dataQualityVmCount: dataQualityVmNames.size,
    },
    dataQuality: [...issues.values()],
    doubleCountingWarning: roleMode === "both",
  };
}
