import type { SysvDataPackageScope, TechInfoLatest } from "@/domain/models/types";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import { formatSysvDepartmentPath, normalizeSysvDepartmentPath, normalizeSysvPersonName } from "@/lib/sysvScope";
import { parseOrgPath } from "@/lib/techInfoOrgLabels";

export type SysvDataPackageScopeNodeKind = "organisation" | "area" | "department" | "person";

type SysvScopeKind = SysvDataPackageScope["kind"];

/**
 * Ein Personenname trägt sich selbst („MUSTERMANN Max“), eine Organisationseinheit nicht: „IN-VIA“
 * allein lässt offen, ob Bereich oder Abteilung gemeint ist.
 */
const SCOPE_KIND_PREFIX: Record<SysvScopeKind, string> = {
  area: "Bereich ",
  department: "Abteilung ",
  person: "",
};

const SCOPE_KIND_PLURAL: Record<SysvScopeKind, string> = {
  area: "Bereiche",
  department: "Abteilungen",
  person: "Personen",
};

/**
 * Benennt einen Paket-Scope so, wie er in der Oberfläche erscheint: „MUSTERMANN Max“,
 * „Abteilung IN-VIA“, „Bereich IN“. Unbekannte Werte (Pakete aus älteren Schemaversionen in
 * IndexedDB) bleiben unverändert statt ein falsches Präfix zu erhalten.
 */
export function formatSysvScopeLabel(kind: SysvScopeKind, label: string): string {
  return `${SCOPE_KIND_PREFIX[kind] ?? ""}${label}`;
}

/** Sammelbegriff für mehrere gleichartige Scopes, etwa „Abteilungen“ in „3 Abteilungen“. */
export function sysvScopeKindPlural(kind: SysvScopeKind): string {
  return SCOPE_KIND_PLURAL[kind] ?? "Scopes";
}

export interface SysvDataPackageScopeNode {
  id: string;
  label: string;
  kind: SysvDataPackageScopeNodeKind;
  vmCount: number;
  scope?: SysvDataPackageScope;
  children: SysvDataPackageScopeNode[];
}

export interface SysvDataPackageScopeDirectory {
  tree: SysvDataPackageScopeNode[];
  areas: Extract<SysvDataPackageScope, { kind: "area" }>[];
  departments: Extract<SysvDataPackageScope, { kind: "department" }>[];
  persons: Extract<SysvDataPackageScope, { kind: "person" }>[];
}

interface MutableNode {
  id: string;
  label: string;
  kind: SysvDataPackageScopeNodeKind;
  vmNames: Set<string>;
  children: Map<string, MutableNode>;
  scope?: SysvDataPackageScope;
}

interface MutableScopeEntry {
  scope: SysvDataPackageScope;
  vmNames: Set<string>;
}

interface RolePath {
  organisation: string;
  normalizedOrganisation: string;
  area: string;
  normalizedArea: string;
  areaKey: string;
  department: string | null;
  normalizedPath: string | null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("de-DE");
}

function sortByLabel<T extends { displayName: string }>(values: T[]): T[] {
  return values.sort((left, right) => left.displayName.localeCompare(right.displayName, "de-DE", {
    numeric: true,
    sensitivity: "base",
  }));
}

function sortNodes(nodes: SysvDataPackageScopeNode[]): SysvDataPackageScopeNode[] {
  return nodes.sort((left, right) => left.label.localeCompare(right.label, "de-DE", {
    numeric: true,
    sensitivity: "base",
  }));
}

function createNode(
  id: string,
  label: string,
  kind: SysvDataPackageScopeNodeKind,
  scope?: SysvDataPackageScope,
): MutableNode {
  return { id, label, kind, vmNames: new Set(), children: new Map(), scope };
}

function finalizeNode(node: MutableNode): SysvDataPackageScopeNode {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    vmCount: node.vmNames.size,
    scope: node.scope,
    children: sortNodes([...node.children.values()].map(finalizeNode)),
  };
}

function readRolePath(value: string | null | undefined): RolePath | null {
  const parsed = parseOrgPath(value ?? null);
  if (!parsed?.valid || !parsed.bereich) return null;

  const organisation = normalizeWhitespace(parsed.org ?? "");
  const area = normalizeWhitespace(parsed.bereich);
  const normalizedOrganisation = normalizeLabel(organisation);
  const normalizedArea = normalizeLabel(area);
  const normalizedPath = parsed.abteilung
    ? normalizeSysvDepartmentPath(value)
    : null;

  return {
    organisation,
    normalizedOrganisation,
    area,
    normalizedArea,
    areaKey: `${normalizedOrganisation}/${normalizedArea}`,
    department: parsed.abteilung ? formatSysvDepartmentPath(value) : null,
    normalizedPath: normalizedPath || null,
  };
}

function vmNameKey(row: TechInfoLatest): string {
  return normalizeVmNameForMatch(row.vmNameNorm || row.vmName);
}

function roleValues(row: TechInfoLatest): Array<{ person: string | null; department: string | null }> {
  return [
    { person: row.sysv, department: row.sysvDepartment },
    { person: row.sysvDeputy, department: row.sysvDeputyDepartment },
  ];
}

function addScopeVm(scopeMap: Map<string, MutableScopeEntry>, scope: SysvDataPackageScope, vmName: string): void {
  const key = scope.kind === "area"
    ? `area:${scope.normalizedOrganisation}/${scope.normalizedArea}`
    : scope.kind === "department"
      ? `department:${scope.normalizedPath}`
      : `person:${scope.normalizedName}`;
  const existing = scopeMap.get(key);
  if (existing) {
    existing.vmNames.add(vmName);
    return;
  }
  scopeMap.set(key, { scope, vmNames: new Set([vmName]) });
}

/**
 * Baut die physische SysV-Paketauswahl auf. Ungültige Organisationspfade werden
 * bewusst nur in der Navigation abgelegt: sie erzeugen keinen Area- oder
 * Department-Scope, Personen bleiben aber auswählbar.
 */
export function buildSysvDataPackageScopeDirectory(
  rows: readonly TechInfoLatest[],
): SysvDataPackageScopeDirectory {
  const organisations = new Map<string, MutableNode>();
  const scopes = new Map<string, MutableScopeEntry>();
  const persons = new Map<string, MutableScopeEntry>();
  const departments = new Map<string, MutableScopeEntry>();
  const areas = new Map<string, MutableScopeEntry>();

  for (const row of rows) {
    const vmName = vmNameKey(row);
    if (!vmName) continue;

    for (const role of roleValues(row)) {
      const normalizedPerson = normalizeSysvPersonName(role.person);
      const displayPerson = normalizeWhitespace(role.person ?? "");
      const path = readRolePath(role.department);
      const organisationKey = path ? `org:${path.normalizedOrganisation || "__none__"}` : "org:__invalid__";
      const organisationLabel = path?.organisation || "Ohne Organisation";
      const areaKey = path ? `area:${path.areaKey}` : "area:__invalid__";
      const areaLabel = path?.area || "Ohne Bereich";
      const departmentKey = path?.normalizedPath ? `department:${path.normalizedPath}` : "department:__invalid__";
      const departmentLabel = path?.department ?? "Ohne verwertbare Abteilung";

      const organisation = organisations.get(organisationKey) ?? createNode(
        `sysv-package-org:${organisationKey}`,
        organisationLabel,
        "organisation",
      );
      organisations.set(organisationKey, organisation);
      organisation.vmNames.add(vmName);

      const areaScope: Extract<SysvDataPackageScope, { kind: "area" }> | undefined = path
        ? {
            kind: "area",
            displayName: path.organisation ? `${path.organisation}/${path.area}` : path.area,
            normalizedOrganisation: path.normalizedOrganisation,
            normalizedArea: path.normalizedArea,
          }
        : undefined;
      const area = organisation.children.get(areaKey) ?? createNode(
        `${organisation.id}/area:${areaKey}`,
        areaLabel,
        "area",
        areaScope,
      );
      organisation.children.set(areaKey, area);
      area.vmNames.add(vmName);
      if (areaScope) {
        addScopeVm(scopes, areaScope, vmName);
        areas.set(`area:${areaScope.normalizedOrganisation}/${areaScope.normalizedArea}`, {
          scope: areaScope,
          vmNames: scopes.get(`area:${areaScope.normalizedOrganisation}/${areaScope.normalizedArea}`)!.vmNames,
        });
      }

      const departmentScope: Extract<SysvDataPackageScope, { kind: "department" }> | undefined = path?.normalizedPath
        ? { kind: "department", displayName: path.department!, normalizedPath: path.normalizedPath }
        : undefined;
      const department = area.children.get(departmentKey) ?? createNode(
        `${area.id}/department:${departmentKey}`,
        departmentLabel,
        "department",
        departmentScope,
      );
      area.children.set(departmentKey, department);
      department.vmNames.add(vmName);
      if (departmentScope) {
        addScopeVm(scopes, departmentScope, vmName);
        departments.set(`department:${departmentScope.normalizedPath}`, {
          scope: departmentScope,
          vmNames: scopes.get(`department:${departmentScope.normalizedPath}`)!.vmNames,
        });
      }

      if (normalizedPerson && displayPerson) {
        const personScope: Extract<SysvDataPackageScope, { kind: "person" }> = {
          kind: "person",
          displayName: displayPerson,
          normalizedName: normalizedPerson,
        };
        const person = persons.get(`person:${normalizedPerson}`) ?? { scope: personScope, vmNames: new Set<string>() };
        person.vmNames.add(vmName);
        persons.set(`person:${normalizedPerson}`, person);
        addScopeVm(scopes, personScope, vmName);

        const personNode = department.children.get(`person:${normalizedPerson}`) ?? createNode(
          `${department.id}/person:${normalizedPerson}`,
          displayPerson,
          "person",
          personScope,
        );
        department.children.set(`person:${normalizedPerson}`, personNode);
        personNode.vmNames.add(vmName);
      }
    }
  }

  // Derselbe Personenscope kann unter mehreren organisatorischen Pfaden auftauchen.
  // Jeder sichtbare Personenast erhält deshalb denselben globalen VM-Zähler.
  const applyPersonCounts = (nodes: Iterable<MutableNode>) => {
    for (const node of nodes) {
      if (node.scope?.kind === "person") {
        const person = persons.get(`person:${node.scope.normalizedName}`);
        if (person) node.vmNames = new Set(person.vmNames);
      }
      applyPersonCounts(node.children.values());
    }
  };
  applyPersonCounts(organisations.values());

  const toScope = (entry: MutableScopeEntry) => entry.scope;
  return {
    tree: sortNodes([...organisations.values()].map(finalizeNode)),
    areas: sortByLabel([...areas.values()].map(toScope)) as Array<Extract<SysvDataPackageScope, { kind: "area" }>>,
    departments: sortByLabel([...departments.values()].map(toScope)) as Array<Extract<SysvDataPackageScope, { kind: "department" }>>,
    persons: sortByLabel([...persons.values()].map(toScope)) as Array<Extract<SysvDataPackageScope, { kind: "person" }>>,
  };
}

function scopeMatchesRole(scope: SysvDataPackageScope, role: { person: string | null; department: string | null }): boolean {
  if (scope.kind === "person") return normalizeSysvPersonName(role.person) === scope.normalizedName;
  const path = readRolePath(role.department);
  if (!path) return false;
  if (scope.kind === "department") return path.normalizedPath === scope.normalizedPath;
  return path.normalizedOrganisation === scope.normalizedOrganisation
    && path.normalizedArea === scope.normalizedArea;
}

export function resolveSysvDataPackageVmNames(
  rows: readonly TechInfoLatest[],
  scope: SysvDataPackageScope,
): Set<string> {
  const result = new Set<string>();
  for (const row of rows) {
    if (!roleValues(row).some((role) => scopeMatchesRole(scope, role))) continue;
    const vmName = vmNameKey(row);
    if (vmName) result.add(vmName);
  }
  return result;
}

export function sysvDataPackageScopeKey(scope: SysvDataPackageScope): string {
  if (scope.kind === "area") return `area:${scope.normalizedOrganisation}/${scope.normalizedArea}`;
  if (scope.kind === "department") return `department:${scope.normalizedPath}`;
  return `person:${scope.normalizedName}`;
}
