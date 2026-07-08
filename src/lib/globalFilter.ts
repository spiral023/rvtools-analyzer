import type {
  GlobalFilterDataType,
  GlobalFilterField,
  GlobalFilterGroup,
  GlobalFilterLogicalOperator,
  GlobalFilterNode,
  GlobalFilterOperator,
  GlobalFilterRule,
  GlobalFilterSourceScope,
  NormalizedVm,
  SheetRow,
  TechInfoLatest,
  TechInfoClientLatest,
} from "@/domain/models/types";

export type VmRawFilterSource = Exclude<GlobalFilterSourceScope, "root" | "vm" | "techInfo" | "techInfoClient">;

interface SerializedGlobalFilterPayload {
  type: "rvtools-global-filter";
  version: 1;
  filter: GlobalFilterGroup;
}

export interface VmGlobalFilterContextEntry {
  vm: NormalizedVm;
  techInfo: TechInfoLatest | null;
  techInfoClient: TechInfoClientLatest | null;
  rawRowsBySource: Partial<Record<VmRawFilterSource, SheetRow[]>>;
}

export const RAW_VM_FILTER_SOURCES: VmRawFilterSource[] = [
  "vInfo",
  "vCPU",
  "vMemory",
  "vDisk",
  "vPartition",
  "vNetwork",
  "vSnapshot",
  "vTools",
  "vCD",
  "vUSB",
];

export const ROOT_GROUP_SOURCE_OPTIONS: Exclude<GlobalFilterSourceScope, "root">[] = [
  "vm",
  "techInfo",
  "techInfoClient",
  ...RAW_VM_FILTER_SOURCES,
];

export const SOURCE_LABELS: Record<GlobalFilterSourceScope, string> = {
  root: "Global",
  vm: "System",
  techInfo: "Tech-Info",
  techInfoClient: "Tech-Info Clients",
  vInfo: "vInfo",
  vCPU: "CPU",
  vMemory: "Memory",
  vDisk: "Disk",
  vPartition: "Partition",
  vNetwork: "Network",
  vSnapshot: "Snapshot",
  vTools: "Tools",
  vCD: "CD",
  vUSB: "USB",
};

const VM_FIELD_META: Record<string, Omit<GlobalFilterField, "source" | "key">> = {
  vmName: { label: "VM", dataType: "text" },
  vmUuid: { label: "VM UUID", dataType: "text" },
  cluster: { label: "Cluster", dataType: "text" },
  host: { label: "Host", dataType: "text" },
  powerState: { label: "Powerstate", dataType: "text" },
  cpuCount: { label: "vCPU", dataType: "number" },
  memoryMiB: { label: "RAM", dataType: "number", unit: "MiB" },
  provisionedMiB: { label: "Provisioned", dataType: "number", unit: "MiB" },
  inUseMiB: { label: "In Use", dataType: "number", unit: "MiB" },
  configStatus: { label: "Config status", dataType: "text" },
  connectionState: { label: "Connection state", dataType: "text" },
  consolidationNeeded: { label: "Consolidation Needed", dataType: "boolean" },
  osConfig: { label: "OS according to the configuration file", dataType: "text" },
  osTools: { label: "OS according to the VMware Tools", dataType: "text" },
  hwVersion: { label: "HW version", dataType: "text" },
  toolsStatus: { label: "Tools status", dataType: "text" },
  toolsVersion: { label: "Tools version", dataType: "text" },
  datacenter: { label: "Datacenter", dataType: "text" },
  folder: { label: "Folder", dataType: "text" },
  resourcePool: { label: "Resource pool", dataType: "text" },
  annotation: { label: "Annotation", dataType: "text" },
  cpuReady: { label: "CPU Ready", dataType: "number" },
  firmware: { label: "Firmware", dataType: "text" },
  efiSecureBoot: { label: "EFI Secure boot", dataType: "boolean" },
  cbt: { label: "CBT", dataType: "boolean" },
};

const TECH_INFO_FIELD_META: Record<string, Omit<GlobalFilterField, "source" | "key">> = {
  serverType: { label: "Servertyp", dataType: "text" },
  maintenanceWindow: { label: "Wartungsfenster", dataType: "text" },
  operatingSystem: { label: "Betriebssystem", dataType: "text" },
  comment: { label: "Kommentar", dataType: "text" },
  sysv: { label: "SysV", dataType: "text" },
  sysvDepartment: { label: "SysV Abteilung", dataType: "text" },
  sysvDeputy: { label: "SysVStv", dataType: "text" },
  sysvDeputyDepartment: { label: "SysVStv Abteilung", dataType: "text" },
  bz: { label: "BZ", dataType: "text" },
  clusterFromTechInfo: { label: "Schrankreihe", dataType: "text" },
  cvBackup: { label: "CV-Backup", dataType: "boolean" },
  az: { label: "AZ", dataType: "text" },
};

const TECH_INFO_CLIENT_FIELD_META: Record<string, Omit<GlobalFilterField, "source" | "key">> = {
  blz: { label: "BLZ", dataType: "text" },
  standort: { label: "Standort", dataType: "text" },
  ip: { label: "IP", dataType: "text" },
  macAddress: { label: "MAC Adresse", dataType: "text" },
  poolName: { label: "Poolname", dataType: "text" },
  modifiedBy: { label: "Geändert von", dataType: "text" },
  createdBy: { label: "Erstellt von", dataType: "text" },
  user: { label: "User", dataType: "text" },
  hardware: { label: "Hardware", dataType: "text" },
  os: { label: "OS", dataType: "text" },
  cluster: { label: "Cluster", dataType: "text" },
  vcenter: { label: "vCenter", dataType: "text" },
  site: { label: "Site", dataType: "text" },
  insider: { label: "Insider", dataType: "text" },
  hwChanges: { label: "HW Änderungen", dataType: "text" },
  monitoring: { label: "Monitoring", dataType: "text" },
  domain: { label: "Domäne", dataType: "text" },
};

export function createGlobalFilterGroup(
  sourceScope: GlobalFilterSourceScope,
  operator: GlobalFilterLogicalOperator = "and",
): GlobalFilterGroup {
  return {
    id: crypto.randomUUID(),
    type: "group",
    operator,
    sourceScope,
    children: [],
  };
}

export function createGlobalFilterRule(field = "", dataType: GlobalFilterDataType = "text"): GlobalFilterRule {
  return {
    id: crypto.randomUUID(),
    type: "rule",
    field,
    operator: dataType === "number" ? "lt" : dataType === "boolean" ? "is_true" : "contains",
    value: "",
    valueTo: "",
  };
}

export function buildVmJoinKey(snapshotId: string, vmName: string): string {
  return `${snapshotId}::${normalizeVmName(vmName)}`;
}

export function normalizeVmName(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

export function countGlobalFilterRules(node: GlobalFilterNode | null | undefined): number {
  if (!node) return 0;
  if (node.type === "rule") return 1;
  return node.children.reduce((sum, child) => sum + countGlobalFilterRules(child), 0);
}

export function hasGlobalFilterDefinition(node: GlobalFilterNode | null | undefined): boolean {
  return countGlobalFilterRules(node) > 0;
}

export function summarizeGlobalFilter(node: GlobalFilterNode | null | undefined, fields: GlobalFilterField[] = []): string {
  if (!node || !hasGlobalFilterDefinition(node)) return "Kein globaler Filter";
  const labels = new Map(fields.map((field) => [`${field.source}:${field.key}`, field.label]));
  const parts: string[] = [];

  function visit(current: GlobalFilterNode) {
    if (current.type === "rule") return;
    for (const child of current.children) {
      if (child.type === "rule") {
        const prefix = current.sourceScope === "root" ? "" : `${SOURCE_LABELS[current.sourceScope]}: `;
        parts.push(`${prefix}${labels.get(`${current.sourceScope}:${child.field}`) ?? child.field}`);
      } else {
        visit(child);
      }
      if (parts.length >= 3) return;
    }
  }

  visit(node);
  const extra = countGlobalFilterRules(node) - parts.length;
  return extra > 0 ? `${parts.join(" · ")} · +${extra} weitere` : parts.join(" · ");
}

export function serializeGlobalFilter(filter: GlobalFilterGroup): string {
  const payload: SerializedGlobalFilterPayload = {
    type: "rvtools-global-filter",
    version: 1,
    filter,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseSerializedGlobalFilter(raw: string): GlobalFilterGroup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Die Zwischenablage enthält kein gültiges JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Das Filterformat ist ungültig.");
  }

  const payload = parsed as Partial<SerializedGlobalFilterPayload>;
  if (payload.type !== "rvtools-global-filter" || payload.version !== 1) {
    throw new Error("Die Zwischenablage enthält kein RVTools-Filterformat.");
  }

  if (!isValidGlobalFilterGroup(payload.filter)) {
    throw new Error("Der eingefügte Filter ist strukturell ungültig.");
  }

  return payload.filter;
}

export function buildGlobalFilterFields(
  vms: NormalizedVm[],
  techInfos: TechInfoLatest[],
  techInfoClients: TechInfoClientLatest[],
  rawRowsBySource: Partial<Record<VmRawFilterSource, SheetRow[]>>,
  rawFieldNamesBySource: Partial<Record<VmRawFilterSource, string[]>> = {},
): GlobalFilterField[] {
  const fields: GlobalFilterField[] = [];
  const seen = new Set<string>();

  const addField = (field: GlobalFilterField) => {
    const key = `${field.source}:${field.key}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push(field);
  };

  for (const key of Object.keys(VM_FIELD_META)) {
    if (!vms.some((vm) => vm[key as keyof NormalizedVm] !== undefined)) continue;
    addField({ source: "vm", key, ...VM_FIELD_META[key] });
  }

  for (const key of Object.keys(TECH_INFO_FIELD_META)) {
    if (!techInfos.some((entry) => entry[key as keyof TechInfoLatest] !== undefined)) continue;
    addField({ source: "techInfo", key, ...TECH_INFO_FIELD_META[key] });
  }

  for (const key of Object.keys(TECH_INFO_CLIENT_FIELD_META)) {
    if (!techInfoClients.some((entry) => entry[key as keyof TechInfoClientLatest] !== undefined)) continue;
    addField({ source: "techInfoClient", key, ...TECH_INFO_CLIENT_FIELD_META[key] });
  }

  for (const source of RAW_VM_FILTER_SOURCES) {
    const rows = rawRowsBySource[source] ?? [];
    const keys = new Set(rawFieldNamesBySource[source] ?? []);
    for (const row of rows) {
      for (const key of Object.keys(row.data)) {
        keys.add(key);
      }
    }

    for (const key of [...keys].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }))) {
      const samples = rows
        .map((row) => row.data[key])
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
        .slice(0, 25);
      addField({
        source,
        key,
        label: key,
        dataType: inferDataType(samples),
        unit: isMiBField(key) ? "MiB" : undefined,
        isRepeated: true,
      });
    }
  }

  return fields.sort((a, b) => {
    const sourceCompare = SOURCE_LABELS[a.source].localeCompare(SOURCE_LABELS[b.source], "de-DE", {
      sensitivity: "base",
    });
    if (sourceCompare !== 0) return sourceCompare;
    return a.label.localeCompare(b.label, "de-DE", { sensitivity: "base" });
  });
}

export function collectReferencedRawFilterSources(
  ...filters: Array<GlobalFilterNode | null | undefined>
): Set<VmRawFilterSource> {
  const sources = new Set<VmRawFilterSource>();
  const rawSourceSet = new Set<GlobalFilterSourceScope>(RAW_VM_FILTER_SOURCES);

  function visit(node: GlobalFilterNode | null | undefined) {
    if (!node || node.type === "rule") return;
    if (rawSourceSet.has(node.sourceScope)) {
      sources.add(node.sourceScope as VmRawFilterSource);
    }
    for (const child of node.children) {
      visit(child);
    }
  }

  for (const filter of filters) {
    visit(filter);
  }

  return sources;
}

export function evaluateGlobalFilter(
  filter: GlobalFilterGroup | null,
  context: VmGlobalFilterContextEntry,
  fields: GlobalFilterField[],
): boolean {
  if (!filter || !hasGlobalFilterDefinition(filter)) return true;
  const fieldMap = new Map(fields.map((field) => [`${field.source}:${field.key}`, field]));
  return evaluateGroup(filter, context, fieldMap, null);
}

export function filterRowsByMatchingVmJoinKeys(rows: SheetRow[], matchingVmJoinKeys: Set<string> | null): SheetRow[] {
  if (!matchingVmJoinKeys) return rows;
  return rows.filter((row) => matchingVmJoinKeys.has(buildVmJoinKey(row.snapshotId, String(row.data["VM"] ?? ""))));
}

function evaluateGroup(
  group: GlobalFilterGroup,
  context: VmGlobalFilterContextEntry,
  fieldMap: Map<string, GlobalFilterField>,
  sourceRow: Record<string, unknown> | null,
): boolean {
  if (group.children.length === 0) return true;

  if (
    group.sourceScope !== "root" &&
    group.sourceScope !== "vm" &&
    group.sourceScope !== "techInfo" &&
    group.sourceScope !== "techInfoClient" &&
    !sourceRow
  ) {
    const rows = context.rawRowsBySource[group.sourceScope] ?? [];
    if (rows.length === 0) return false;
    return rows.some((row) => {
      const results = group.children.map((child) => evaluateNode(child, group, context, fieldMap, row.data));
      return group.operator === "and" ? results.every(Boolean) : results.some(Boolean);
    });
  }

  const results = group.children.map((child) => evaluateNode(child, group, context, fieldMap, sourceRow));
  return group.operator === "and" ? results.every(Boolean) : results.some(Boolean);
}

function evaluateNode(
  node: GlobalFilterNode,
  parentGroup: GlobalFilterGroup,
  context: VmGlobalFilterContextEntry,
  fieldMap: Map<string, GlobalFilterField>,
  sourceRow: Record<string, unknown> | null,
): boolean {
  if (node.type === "rule") {
    return evaluateRule(node, parentGroup, context, fieldMap, sourceRow);
  }

  if (parentGroup.sourceScope === "root") {
    return evaluateGroup(node, context, fieldMap, null);
  }

  if (node.sourceScope !== parentGroup.sourceScope) return false;
  return evaluateGroup(node, context, fieldMap, sourceRow);
}

function evaluateRule(
  rule: GlobalFilterRule,
  group: GlobalFilterGroup,
  context: VmGlobalFilterContextEntry,
  fieldMap: Map<string, GlobalFilterField>,
  sourceRow: Record<string, unknown> | null,
): boolean {
  if (group.sourceScope === "root") return false;

  const field = fieldMap.get(`${group.sourceScope}:${rule.field}`);
  if (!field) return false;

  if (group.sourceScope === "vm") {
    return evaluateValue((context.vm as unknown as Record<string, unknown>)[rule.field], field, rule);
  }

  if (group.sourceScope === "techInfo") {
    return evaluateValue((context.techInfo as unknown as Record<string, unknown> | null)?.[rule.field], field, rule);
  }

  if (group.sourceScope === "techInfoClient") {
    return evaluateValue((context.techInfoClient as unknown as Record<string, unknown> | null)?.[rule.field], field, rule);
  }

  const rows = context.rawRowsBySource[group.sourceScope] ?? [];
  if (rows.length === 0) return false;

  const evaluateOnRow = (row: Record<string, unknown>) => evaluateValue(row[rule.field], field, rule);

  if (sourceRow) return evaluateOnRow(sourceRow);
  return rows.some((row) => evaluateOnRow(row.data));
}

function evaluateValue(
  rawValue: unknown,
  field: GlobalFilterField,
  rule: GlobalFilterRule,
): boolean {
  if (field.dataType === "boolean") {
    const boolValue = toBoolean(rawValue);
    if (rule.operator === "is_true") return boolValue === true;
    if (rule.operator === "is_false") return boolValue === false;
    return false;
  }

  if (rule.operator === "empty") return isEmptyValue(rawValue);
  if (rule.operator === "not_empty") return !isEmptyValue(rawValue);
  if (isEmptyValue(rawValue)) return false;

  if (field.dataType === "number") {
    const left = toComparableNumber(rawValue);
    if (left === null) return false;
    const right = convertRuleValueToFieldUnit(rule.value, rule.unit, field.unit);
    const rightTo = convertRuleValueToFieldUnit(rule.valueTo, rule.unit, field.unit);
    if (rule.operator === "lt") return right !== null && left < right;
    if (rule.operator === "lte") return right !== null && left <= right;
    if (rule.operator === "gt") return right !== null && left > right;
    if (rule.operator === "gte") return right !== null && left >= right;
    if (rule.operator === "between") return right !== null && rightTo !== null && left >= right && left <= rightTo;
    if (rule.operator === "eq") return right !== null && left === right;
    if (rule.operator === "neq") return right !== null && left !== right;
    return false;
  }

  const left = String(rawValue).toLocaleLowerCase("de-DE");
  const right = String(rule.value ?? "").toLocaleLowerCase("de-DE");
  if (rule.operator === "eq") return left === right;
  if (rule.operator === "neq") return left !== right;
  if (rule.operator === "contains") return left.includes(right);
  if (rule.operator === "not_contains") return !left.includes(right);
  if (rule.operator === "starts_with") return left.startsWith(right);
  if (rule.operator === "ends_with") return left.endsWith(right);
  if (rule.operator === "wildcard") return wildcardToRegExp(right).test(left);
  return false;
}

function inferDataType(values: unknown[]): GlobalFilterDataType {
  if (values.length === 0) return "text";
  if (values.every((value) => toBoolean(value) !== null)) return "boolean";
  if (values.every((value) => toComparableNumber(value) !== null)) return "number";
  return "text";
}

function isMiBField(key: string): boolean {
  return /(?:\b|_)(mib|mb)\b/i.test(key);
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function toComparableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLocaleLowerCase("de-DE");
  if (["true", "1", "yes", "ja"].includes(normalized)) return true;
  if (["false", "0", "no", "nein"].includes(normalized)) return false;
  return null;
}

function convertRuleValueToFieldUnit(
  value: string | undefined,
  inputUnit: "MiB" | "GiB" | "TiB" | undefined,
  fieldUnit: "MiB" | undefined,
): number | null {
  const numericValue = toComparableNumber(value);
  if (numericValue === null) return null;
  if (fieldUnit !== "MiB" || !inputUnit || inputUnit === "MiB") return numericValue;
  if (inputUnit === "GiB") return numericValue * 1024;
  if (inputUnit === "TiB") return numericValue * 1024 * 1024;
  return numericValue;
}

function wildcardToRegExp(value: string): RegExp {
  const escaped = value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function isValidGlobalFilterGroup(value: unknown): value is GlobalFilterGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlobalFilterGroup>;
  if (candidate.type !== "group") return false;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (candidate.operator !== "and" && candidate.operator !== "or") return false;
  if (!isValidSourceScope(candidate.sourceScope)) return false;
  if (!Array.isArray(candidate.children)) return false;
  return candidate.children.every((child) => isValidGlobalFilterNode(child));
}

function isValidGlobalFilterRule(value: unknown): value is GlobalFilterRule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlobalFilterRule>;
  if (candidate.type !== "rule") return false;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.field !== "string") return false;
  return isValidOperator(candidate.operator);
}

function isValidGlobalFilterNode(value: unknown): value is GlobalFilterNode {
  return isValidGlobalFilterGroup(value) || isValidGlobalFilterRule(value);
}

function isValidSourceScope(value: unknown): value is GlobalFilterSourceScope {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOURCE_LABELS, value);
}

function isValidOperator(value: unknown): value is GlobalFilterOperator {
  return typeof value === "string" && [
    "eq",
    "neq",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "wildcard",
    "empty",
    "not_empty",
    "lt",
    "lte",
    "gt",
    "gte",
    "between",
    "is_true",
    "is_false",
  ].includes(value);
}
