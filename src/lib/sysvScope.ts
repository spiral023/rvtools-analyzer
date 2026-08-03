import type {
  GlobalFilterGroup,
  GlobalFilterRule,
  SysvScopePreference,
  TechInfoLatest,
} from "@/domain/models/types";
import { parseOrgPath } from "@/lib/techInfoOrgLabels";

export interface SysvScopePerson {
  displayName: string;
  normalizedName: string;
  vmCount: number;
}

export interface SysvScopeDepartment {
  displayName: string;
  normalizedPath: string;
  vmCount: number;
}

export interface SysvScopeTreeNode {
  id: string;
  label: string;
  kind: "organisation" | "bereich" | "department" | "person";
  vmCount: number;
  scope?: Exclude<SysvScopePreference, { kind: "all" }>;
  children: SysvScopeTreeNode[];
}

export interface SysvScopeDirectory {
  tree: SysvScopeTreeNode[];
  persons: SysvScopePerson[];
  departments: SysvScopeDepartment[];
}

interface MutableTreeNode {
  id: string;
  label: string;
  kind: SysvScopeTreeNode["kind"];
  vmNames: Set<string>;
  children: Map<string, MutableTreeNode>;
  scope?: Exclude<SysvScopePreference, { kind: "all" }>;
}

interface MutablePerson {
  displayName: string;
  normalizedName: string;
  vmNames: Set<string>;
}

interface MutableDepartment {
  displayName: string;
  normalizedPath: string;
  vmNames: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Vergleichsschlüssel für Tech-Info-Personen: case-insensitive, ohne Rand- und Mehrfachleerzeichen. */
export function normalizeSysvPersonName(value: string | null | undefined): string {
  return value ? normalizeWhitespace(value).toLocaleLowerCase("de-DE") : "";
}

/**
 * Liefert den fachlichen Vergleichsschlüssel eines Abteilungspfads. Bei wohlgeformten
 * Werten werden Leerzeichen an den Organisationsgrenzen bereinigt, damit etwa
 * `FIRMA / OPS - UNIX` denselben Schlüssel wie `FIRMA/OPS-UNIX` erhält.
 */
export function normalizeSysvDepartmentPath(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";

  const parsed = parseOrgPath(raw);
  if (parsed?.valid && parsed.bereich) {
    const organisation = parsed.org ? normalizeWhitespace(parsed.org) : "";
    const bereich = normalizeWhitespace(parsed.bereich);
    const abteilung = parsed.abteilung ? normalizeWhitespace(parsed.abteilung) : "";
    const localPath = abteilung ? `${bereich}-${abteilung}` : bereich;
    return `${organisation ? `${organisation}/` : ""}${localPath}`.toLocaleLowerCase("de-DE");
  }

  return raw.toLocaleLowerCase("de-DE");
}

export function formatSysvDepartmentPath(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "Ohne Abteilung";
  const parsed = parseOrgPath(raw);
  if (!parsed?.valid || !parsed.bereich) return normalizeWhitespace(raw);

  const organisation = parsed.org ? normalizeWhitespace(parsed.org) : "";
  const bereich = normalizeWhitespace(parsed.bereich);
  const abteilung = parsed.abteilung ? normalizeWhitespace(parsed.abteilung) : "";
  const localPath = abteilung ? `${bereich}-${abteilung}` : bereich;
  return organisation ? `${organisation}/${localPath}` : localPath;
}

/** Vereinbarte Zerlegung des Tech-Info-Formats `NACHNAME Vorname`. */
export function splitSysvContactName(value: string): { displayName: string; firstName: string; lastName: string } {
  const displayName = normalizeWhitespace(value);
  if (!displayName) return { displayName: "", firstName: "", lastName: "" };
  const [lastName, ...firstNameParts] = displayName.split(" ");
  return { displayName, firstName: firstNameParts.join(" "), lastName };
}

export function readSysvScopePreference(value: unknown): SysvScopePreference | null {
  if (!isRecord(value)) return null;
  if (value.kind === "all") return { kind: "all" };

  if (value.kind === "person" && typeof value.displayName === "string") {
    const displayName = value.displayName.trim();
    const normalizedName = normalizeSysvPersonName(
      typeof value.normalizedName === "string" ? value.normalizedName : displayName,
    );
    if (displayName && normalizedName) return { kind: "person", displayName, normalizedName };
  }

  if (value.kind === "department" && typeof value.displayName === "string") {
    const displayName = formatSysvDepartmentPath(value.displayName);
    const normalizedPath = normalizeSysvDepartmentPath(
      typeof value.normalizedPath === "string" ? value.normalizedPath : displayName,
    );
    if (displayName && normalizedPath) return { kind: "department", displayName, normalizedPath };
  }

  return null;
}

export function normalizeSysvScopePreference(value: unknown): SysvScopePreference {
  return readSysvScopePreference(value) ?? { kind: "all" };
}

export function sysvScopePreferenceKey(scope: SysvScopePreference): string {
  if (scope.kind === "all") return "all";
  return `${scope.kind}:${scope.kind === "person" ? scope.normalizedName : scope.normalizedPath}`;
}

export function isSameSysvScopePreference(left: SysvScopePreference, right: SysvScopePreference): boolean {
  return sysvScopePreferenceKey(left) === sysvScopePreferenceKey(right);
}

function createMutableNode(
  id: string,
  label: string,
  kind: SysvScopeTreeNode["kind"],
  scope?: Exclude<SysvScopePreference, { kind: "all" }>,
): MutableTreeNode {
  return { id, label, kind, vmNames: new Set(), children: new Map(), scope };
}

function sortNodes(nodes: SysvScopeTreeNode[]): SysvScopeTreeNode[] {
  return nodes.sort((left, right) => left.label.localeCompare(right.label, "de-DE", { sensitivity: "base" }));
}

function finalizeNode(node: MutableTreeNode): SysvScopeTreeNode {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    vmCount: node.vmNames.size,
    scope: node.scope,
    children: sortNodes([...node.children.values()].map(finalizeNode)),
  };
}

/**
 * Baut eine kompakte, aus beiden Tech-Info-Rollen deduplizierte Auswahlhierarchie.
 * Personen ohne verwertbaren Abteilungspfad bleiben unter einem neutralen Knoten
 * auswählbar; ein Abteilungsscope wird nur für vollständige Pfade angeboten.
 */
export function buildSysvScopeDirectory(rows: readonly TechInfoLatest[]): SysvScopeDirectory {
  const organisations = new Map<string, MutableTreeNode>();
  const persons = new Map<string, MutablePerson>();
  const departments = new Map<string, MutableDepartment>();

  for (const row of rows) {
    const vmKey = row.vmNameNorm || row.vmName.trim().toLocaleLowerCase("de-DE");
    if (!vmKey) continue;

    const roles = [
      { person: row.sysv, department: row.sysvDepartment },
      { person: row.sysvDeputy, department: row.sysvDeputyDepartment },
    ];

    for (const role of roles) {
      // Der sichtbare Name bleibt der Tech-Info-Anzeigename; nur der Vergleichsschlüssel
      // normalisiert Groß-/Kleinschreibung und Leerraum.
      const displayName = role.person?.trim() ?? "";
      const normalizedName = normalizeSysvPersonName(role.person);
      if (!displayName || !normalizedName) continue;

      const person = persons.get(normalizedName) ?? {
        displayName,
        normalizedName,
        vmNames: new Set<string>(),
      };
      person.vmNames.add(vmKey);
      persons.set(normalizedName, person);

      const parsed = parseOrgPath(role.department);
      const validDepartment = Boolean(parsed?.valid && parsed.bereich && parsed.abteilung);
      const normalizedPath = validDepartment ? normalizeSysvDepartmentPath(role.department) : "";
      const displayPath = validDepartment ? formatSysvDepartmentPath(role.department) : "Ohne verwertbare Abteilung";

      if (normalizedPath) {
        const department = departments.get(normalizedPath) ?? {
          displayName: displayPath,
          normalizedPath,
          vmNames: new Set<string>(),
        };
        department.vmNames.add(vmKey);
        departments.set(normalizedPath, department);
      }

      const organisationLabel = parsed?.org ? normalizeWhitespace(parsed.org) : "Ohne Organisation";
      const bereichLabel = parsed?.bereich ? normalizeWhitespace(parsed.bereich) : "Ohne Bereich";
      const organisationKey = normalizeSysvPersonName(organisationLabel) || "__none__";
      const bereichKey = normalizeSysvPersonName(bereichLabel) || "__none__";
      const departmentKey = normalizedPath || "__unassigned__";

      const organisation = organisations.get(organisationKey) ?? createMutableNode(
        `sysv-org:${organisationKey}`,
        organisationLabel,
        "organisation",
      );
      organisations.set(organisationKey, organisation);
      organisation.vmNames.add(vmKey);

      const bereich = organisation.children.get(bereichKey) ?? createMutableNode(
        `${organisation.id}/bereich:${bereichKey}`,
        bereichLabel,
        "bereich",
      );
      organisation.children.set(bereichKey, bereich);
      bereich.vmNames.add(vmKey);

      const departmentScope = normalizedPath
        ? { kind: "department" as const, displayName: displayPath, normalizedPath }
        : undefined;
      const department = bereich.children.get(departmentKey) ?? createMutableNode(
        `${bereich.id}/abteilung:${departmentKey}`,
        displayPath,
        "department",
        departmentScope,
      );
      bereich.children.set(departmentKey, department);
      department.vmNames.add(vmKey);

      const personNode = department.children.get(normalizedName) ?? createMutableNode(
        `${department.id}/person:${normalizedName}`,
        person.displayName,
        "person",
        { kind: "person", displayName: person.displayName, normalizedName },
      );
      department.children.set(normalizedName, personNode);
      personNode.vmNames.add(vmKey);
    }
  }

  // Eine Person kann in mehreren Abteilungen vorkommen. Der angezeigte Zähler eines
  // Personenknotens entspricht deshalb bewusst ihrem vollständigen Personenscope,
  // nicht nur dem Teilast, in dem der Knoten gerade dargestellt wird.
  const applyGlobalPersonCounts = (nodes: Iterable<MutableTreeNode>) => {
    for (const node of nodes) {
      if (node.scope?.kind === "person") {
        const person = persons.get(node.scope.normalizedName);
        if (person) node.vmNames = new Set(person.vmNames);
      }
      applyGlobalPersonCounts(node.children.values());
    }
  };
  applyGlobalPersonCounts(organisations.values());

  return {
    tree: sortNodes([...organisations.values()].map(finalizeNode)),
    persons: [...persons.values()]
      .map((person) => ({
        displayName: person.displayName,
        normalizedName: person.normalizedName,
        vmCount: person.vmNames.size,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "de-DE", { sensitivity: "base" })),
    departments: [...departments.values()]
      .map((department) => ({
        displayName: department.displayName,
        normalizedPath: department.normalizedPath,
        vmCount: department.vmNames.size,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "de-DE", { sensitivity: "base" })),
  };
}

export function getAvailableSysvScopePreference(
  directory: SysvScopeDirectory,
  preference: SysvScopePreference,
): SysvScopePreference {
  if (preference.kind === "all") return preference;
  if (preference.kind === "person") {
    const person = directory.persons.find((entry) => entry.normalizedName === preference.normalizedName);
    return person
      ? { kind: "person", displayName: person.displayName, normalizedName: person.normalizedName }
      : { kind: "all" };
  }

  const department = directory.departments.find((entry) => entry.normalizedPath === preference.normalizedPath);
  return department
    ? { kind: "department", displayName: department.displayName, normalizedPath: department.normalizedPath }
    : { kind: "all" };
}

function createTechInfoRule(id: string, field: GlobalFilterRule["field"], value: string): GlobalFilterRule {
  return { id, type: "rule", field, operator: "eq", value };
}

/** Erstellt einen gewöhnlichen, jederzeit editier- und entfernbaren globalen Filter. */
export function buildSysvScopeGlobalFilter(scope: SysvScopePreference): GlobalFilterGroup | null {
  if (scope.kind === "all") return null;

  const fields = scope.kind === "person"
    ? ["sysv", "sysvDeputy"]
    : ["sysvDepartment", "sysvDeputyDepartment"];
  const value = scope.kind === "person" ? scope.normalizedName : scope.normalizedPath;

  return {
    id: "sysv-scope-root",
    type: "group",
    operator: "or",
    sourceScope: "root",
    children: fields.map((field, index) => ({
      id: `sysv-scope-${index}`,
      type: "group" as const,
      operator: "and" as const,
      sourceScope: "techInfo" as const,
      children: [createTechInfoRule(`sysv-scope-${index}-rule`, field, value)],
    })),
  };
}
