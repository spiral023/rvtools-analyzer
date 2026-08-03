import type { SheetRow } from "@/domain/models/types";
import { normalizeVmNameForMatch, parseDatastoreFromDiskPath } from "@/lib/xlsx/parseHelpers";

export interface SysvRawSheetScopeContext {
  selectedVmNames: ReadonlySet<string>;
  selectedHostNames: ReadonlySet<string>;
  selectedClusterNames: ReadonlySet<string>;
  selectedDatastoreNames: ReadonlySet<string>;
  selectedSwitchIds?: ReadonlySet<string>;
  /** Vollständige RVTools-VM-Namen des jeweiligen Snapshots, falls bekannt. */
  allVmNames?: ReadonlySet<string>;
}

export interface SysvRawSheetScopeWarning {
  code: "missing-vm-key" | "missing-host-key" | "missing-switch-key" | "missing-datastore-key" | "unknown-sheet" | "excluded-sheet" | "foreign-vm-reference";
  sheetName: string;
  message: string;
  count?: number;
}

export interface SysvRawSheetInput {
  sheetName: string;
  headers: readonly string[];
  rows: readonly SheetRow[];
}

export interface FilteredSysvRawSheet {
  sheetName: string;
  headers: string[];
  rows: SheetRow[];
  values: Array<Array<string | number | boolean | null>>;
  warnings: SysvRawSheetScopeWarning[];
}

export interface SysvRawScopeReferences {
  hostNames: Set<string>;
  clusterNames: Set<string>;
  datastoreNames: Set<string>;
  switchIds: Set<string>;
}

const VM_SHEETS = new Set([
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork", "vCD", "vUSB", "vSnapshot", "vTools",
]);
const HOST_SHEETS = new Set(["vHost", "vHBA", "vNIC", "vSwitch", "vSC_VMK", "vMultiPath"]);
const EXCLUDED_SHEETS = new Set(["vLicense"]);
const SUPPORTED_SHEETS = new Set([
  ...VM_SHEETS,
  "vSource",
  "vRP",
  ...HOST_SHEETS,
  "vPort",
  "dvSwitch",
  "dvPort",
  "vDatastore",
]);

const VM_FIELD_CANDIDATES: Record<string, readonly string[]> = {
  vInfo: ["VM", "Name"],
  vCPU: ["VM"],
  vMemory: ["VM"],
  vDisk: ["VM"],
  vPartition: ["VM"],
  vNetwork: ["VM"],
  vCD: ["VM"],
  vUSB: ["VM"],
  vSnapshot: ["VM", "VM Name"],
  vTools: ["VM"],
  dvPort: ["VM", "VM Name", "Virtual Machine"],
  vPort: ["VM", "VM Name", "Virtual Machine"],
};

const HOST_FIELD_CANDIDATES = ["Host"] as const;
const SWITCH_FIELD_CANDIDATES = ["Switch", "Switch ID", "DVS", "DVS Name", "Distributed Switch"] as const;
const DATASTORE_FIELD_CANDIDATES = ["Datastore", "Datastore name", "Datastores", "Datastore Name", "Disk Path", "Disk"] as const;
const CLUSTER_FIELD_CANDIDATES = ["Cluster", "Datacenter/Cluster", "Cluster Name"] as const;

function normalized(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim().toLocaleLowerCase("de-DE");
}

function normalizedSet(values: ReadonlySet<string> | undefined): Set<string> {
  return new Set([...values ?? []].map(normalized).filter(Boolean));
}

function readCell(row: SheetRow, candidates: readonly string[]): unknown {
  for (const candidate of candidates) {
    const value = row.data[candidate];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function readVmName(row: SheetRow, sheetName: string): string {
  return normalizeVmNameForMatch(String(readCell(row, VM_FIELD_CANDIDATES[sheetName] ?? ["VM"]) ?? ""));
}

function readHostName(row: SheetRow): string {
  return normalized(readCell(row, HOST_FIELD_CANDIDATES));
}

function readSwitchIds(row: SheetRow): Set<string> {
  const result = new Set<string>();
  for (const candidate of SWITCH_FIELD_CANDIDATES) {
    const raw = row.data[candidate];
    if (raw === null || raw === undefined) continue;
    for (const value of String(raw).split(/[,;\r\n]+/)) {
      const key = normalized(value);
      if (key) result.add(key);
    }
  }
  return result;
}

function readClusterName(row: SheetRow): string {
  return normalized(readCell(row, CLUSTER_FIELD_CANDIDATES));
}

function readDatastoreNames(row: SheetRow): Set<string> {
  const result = new Set<string>();
  for (const candidate of DATASTORE_FIELD_CANDIDATES) {
    const raw = row.data[candidate];
    if (raw === null || raw === undefined) continue;
    const text = String(raw);
    const bracketMatches = [...text.matchAll(/\[([^\]]+)\]/g)];
    if (bracketMatches.length > 0) {
      for (const match of bracketMatches) {
        const value = normalized(match[1]);
        if (value) result.add(value);
      }
      continue;
    }
    const fromDiskPath = parseDatastoreFromDiskPath(text);
    if (fromDiskPath) {
      result.add(normalized(fromDiskPath));
      continue;
    }
    for (const value of text.split(/[,;\r\n]+/)) {
      const cleaned = value.trim().replace(/^\[[^\]]*\]\s*/, "");
      if (cleaned) result.add(normalized(cleaned));
    }
  }
  return result;
}

function rowContainsForeignVmReference(row: SheetRow, selectedVmNames: Set<string>, allVmNames: Set<string>): boolean {
  for (const candidate of VM_FIELD_CANDIDATES[row.sheetName] ?? ["VM"]) {
    const value = row.data[candidate];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const key = normalizeVmNameForMatch(String(value));
    if (allVmNames.has(key) && !selectedVmNames.has(key)) return true;
  }
  return false;
}

function warning(
  code: SysvRawSheetScopeWarning["code"],
  sheetName: string,
  message: string,
): SysvRawSheetScopeWarning {
  return { code, sheetName, message };
}

function buildHeaders(input: SysvRawSheetInput): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  const add = (header: string) => {
    if (seen.has(header)) return;
    seen.add(header);
    headers.push(header);
  };
  for (const header of input.headers) add(header);
  for (const row of input.rows) for (const key of Object.keys(row.data)) add(key);
  return headers;
}

function rowValues(row: SheetRow, headers: readonly string[]): Array<string | number | boolean | null> {
  return headers.map((header) => row.data[header] ?? null);
}

function uniqueWarning(warnings: SysvRawSheetScopeWarning[]): SysvRawSheetScopeWarning[] {
  const byKey = new Map<string, SysvRawSheetScopeWarning>();
  for (const item of warnings) {
    const key = `${item.code}:${item.sheetName}`;
    const existing = byKey.get(key);
    if (existing) existing.count = (existing.count ?? 1) + (item.count ?? 1);
    else byKey.set(key, { ...item, count: item.count ?? 1 });
  }
  return [...byKey.values()];
}

/** Ermittelt Referenzen ausschließlich aus den bereits auf VM-Ebene gefilterten Zeilen. */
export function deriveSysvRawScopeReferences(
  sheets: ReadonlyMap<string, readonly SheetRow[]>,
  selectedVmNames: ReadonlySet<string>,
): SysvRawScopeReferences {
  const selected = normalizedSet(selectedVmNames);
  const references: SysvRawScopeReferences = {
    hostNames: new Set(),
    clusterNames: new Set(),
    datastoreNames: new Set(),
    switchIds: new Set(),
  };

  const vmRows = [...sheets.entries()].flatMap(([sheetName, rows]) =>
    VM_SHEETS.has(sheetName) ? rows.filter((row) => selected.has(readVmName(row, sheetName))) : [],
  );
  for (const row of vmRows) {
    const host = readHostName(row);
    if (host) references.hostNames.add(host);
    const cluster = readClusterName(row);
    if (cluster) references.clusterNames.add(cluster);
    for (const datastore of readDatastoreNames(row)) references.datastoreNames.add(datastore);
  }

  const hostRows = [...sheets.entries()].flatMap(([sheetName, rows]) =>
    HOST_SHEETS.has(sheetName) ? rows.filter((row) => references.hostNames.has(readHostName(row))) : [],
  );
  for (const row of hostRows) for (const switchId of readSwitchIds(row)) references.switchIds.add(switchId);
  for (const row of sheets.get("dvPort") ?? []) {
    if (selected.has(readVmName(row, "dvPort"))) for (const switchId of readSwitchIds(row)) references.switchIds.add(switchId);
  }
  return references;
}

function includeRow(
  sheetName: string,
  row: SheetRow,
  _context: SysvRawSheetScopeContext,
  selectedVmNames: Set<string>,
  selectedHostNames: Set<string>,
  selectedClusterNames: Set<string>,
  selectedDatastoreNames: Set<string>,
  selectedSwitchIds: Set<string>,
  allVmNames: Set<string>,
  warnings: SysvRawSheetScopeWarning[],
): boolean {
  if (VM_SHEETS.has(sheetName)) {
    const vmName = readVmName(row, sheetName);
    if (!vmName) {
      warnings.push(warning("missing-vm-key", sheetName, "Zeile ohne VM-Zuordnung ausgeschlossen."));
      return false;
    }
    return selectedVmNames.has(vmName);
  }
  if (sheetName === "vSource") return true;
  if (EXCLUDED_SHEETS.has(sheetName)) {
    warnings.push(warning("excluded-sheet", sheetName, "Sheet ist im SysV-Datenpaket nicht enthalten."));
    return false;
  }
  if (!SUPPORTED_SHEETS.has(sheetName)) {
    warnings.push(warning("unknown-sheet", sheetName, "Unbekanntes Sheet wird aus Sicherheitsgründen ausgeschlossen."));
    return false;
  }
  if (HOST_SHEETS.has(sheetName)) {
    const host = readHostName(row);
    if (!host) {
      warnings.push(warning("missing-host-key", sheetName, "Zeile ohne expliziten Host-Schlüssel ausgeschlossen."));
      return false;
    }
    return selectedHostNames.has(host);
  }
  if (sheetName === "dvPort") {
    const vmName = readVmName(row, sheetName);
    if (!vmName) {
      warnings.push(warning("missing-vm-key", sheetName, "Distributed-Port ohne VM-Zuordnung ausgeschlossen."));
      return false;
    }
    return selectedVmNames.has(vmName);
  }
  if (sheetName === "vPort") {
    const vmName = readVmName(row, sheetName);
    if (vmName) {
      if (selectedVmNames.has(vmName)) return true;
      if (allVmNames.has(vmName)) warnings.push(warning("foreign-vm-reference", sheetName, "Port mit fremder VM-Referenz ausgeschlossen."));
      return false;
    }
    const host = readHostName(row);
    if (!host || !selectedHostNames.has(host)) {
      warnings.push(warning("missing-host-key", sheetName, "Port ohne sichere VM- oder Host-Zuordnung ausgeschlossen."));
      return false;
    }
    if (rowContainsForeignVmReference(row, selectedVmNames, allVmNames)) {
      warnings.push(warning("foreign-vm-reference", sheetName, "Port mit fremder VM-Referenz ausgeschlossen."));
      return false;
    }
    return true;
  }
  if (sheetName === "dvSwitch") {
    const switchIds = readSwitchIds(row);
    if (switchIds.size === 0) {
      warnings.push(warning("missing-switch-key", sheetName, "Distributed Switch ohne sichere Switch-ID ausgeschlossen."));
      return false;
    }
    return [...switchIds].some((switchId) => selectedSwitchIds.has(switchId));
  }
  if (sheetName === "vDatastore") {
    const datastoreNames = readDatastoreNames(row);
    if (datastoreNames.size === 0) {
      warnings.push(warning("missing-datastore-key", sheetName, "Datastore ohne sichere Datastore-Zuordnung ausgeschlossen."));
      return false;
    }
    return [...datastoreNames].some((name) => selectedDatastoreNames.has(name));
  }
  if (sheetName === "vRP") {
    const cluster = readClusterName(row);
    return Boolean(cluster && selectedClusterNames.has(cluster));
  }
  return false;
}

/**
 * Fail-closed-Filter für ein einzelnes hydratisiertes RVTools-Sheet. Die
 * zurückgegebenen `rowIndex`-Werte beginnen immer bei null.
 */
export function filterSysvRawSheet(
  input: SysvRawSheetInput,
  context: SysvRawSheetScopeContext,
): FilteredSysvRawSheet {
  const headers = buildHeaders(input);
  const selectedVmNames = normalizedSet(context.selectedVmNames);
  const selectedHostNames = normalizedSet(context.selectedHostNames);
  const selectedClusterNames = normalizedSet(context.selectedClusterNames);
  const selectedDatastoreNames = normalizedSet(context.selectedDatastoreNames);
  const selectedSwitchIds = normalizedSet(context.selectedSwitchIds);
  const allVmNames = normalizedSet(context.allVmNames);
  const warnings: SysvRawSheetScopeWarning[] = [];
  const rows: SheetRow[] = [];

  for (const row of input.rows) {
    if (!includeRow(
      input.sheetName,
      row,
      context,
      selectedVmNames,
      selectedHostNames,
      selectedClusterNames,
      selectedDatastoreNames,
      selectedSwitchIds,
      allVmNames,
      warnings,
    )) continue;
    rows.push({ ...row, rowIndex: rows.length });
  }

  return {
    sheetName: input.sheetName,
    headers,
    rows,
    values: rows.map((row) => rowValues(row, headers)),
    warnings: uniqueWarning(warnings),
  };
}

/** Alias mit einem expliziteren Namen für Builder und Tests. */
export const filterSysvRawSheetRows = filterSysvRawSheet;
