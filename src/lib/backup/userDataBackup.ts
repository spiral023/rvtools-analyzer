import type {
  MaintenanceClusterAssignment,
  MaintenanceSettings,
  Scenario,
} from "@/domain/models/types";

export const USER_DATA_BACKUP_KIND = "rvtools-analyzer-user-data";
export const USER_DATA_BACKUP_VERSION = 1;

export interface UserDataBackup {
  kind: typeof USER_DATA_BACKUP_KIND;
  version: typeof USER_DATA_BACKUP_VERSION;
  exportedAt: string;
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  scenarios: Scenario[];
}

export function buildUserDataBackup(input: {
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  scenarios: Scenario[];
  exportedAt?: Date;
}): UserDataBackup {
  return {
    kind: USER_DATA_BACKUP_KIND,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    maintenanceSettings: input.maintenanceSettings,
    maintenanceClusterAssignments: input.maintenanceClusterAssignments,
    scenarios: input.scenarios,
  };
}

export function serializeUserDataBackup(backup: UserDataBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function buildBackupFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `rvtools-analyzer-backup-${stamp}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeSettings(value: unknown): MaintenanceSettings | null {
  if (!isRecord(value)) return null;
  return {
    id: "default",
    firstName: toTrimmedString(value.firstName),
    lastName: toTrimmedString(value.lastName),
    companyName: toTrimmedString(value.companyName),
    updatedAt: toTrimmedString(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizeAssignment(value: unknown): MaintenanceClusterAssignment | null {
  if (!isRecord(value)) return null;
  const vcenterId = toTrimmedString(value.vcenterId);
  const clusterName = toTrimmedString(value.clusterName);
  if (!vcenterId || !clusterName) return null;

  return {
    vcenterId,
    clusterName,
    type: value.type === "Spezial" ? "Spezial" : "Normal",
    windows: Array.isArray(value.windows)
      ? (value.windows.filter(isRecord) as unknown as MaintenanceClusterAssignment["windows"])
      : [],
    contacts: Array.isArray(value.contacts)
      ? (value.contacts.filter(isRecord) as unknown as MaintenanceClusterAssignment["contacts"])
      : [],
    additionalEmails: toStringArray(value.additionalEmails),
    updatedAt: toTrimmedString(value.updatedAt) || new Date().toISOString(),
    id: `${vcenterId}::${clusterName}`,
  };
}

function normalizeScenario(value: unknown): Scenario | null {
  if (!isRecord(value)) return null;
  const id = toTrimmedString(value.id);
  const name = toTrimmedString(value.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    type: "cluster-migration",
    createdAt: toTrimmedString(value.createdAt) || new Date().toISOString(),
    updatedAt: toTrimmedString(value.updatedAt) || new Date().toISOString(),
    vcenterScope: toStringArray(value.vcenterScope),
    groups: Array.isArray(value.groups)
      ? (value.groups.filter(isRecord) as unknown as Scenario["groups"])
      : [],
    notes: typeof value.notes === "string" ? value.notes : null,
  };
}

/**
 * Parst und validiert eine Backup-Datei. Wirft bei strukturell ungültigen Dateien;
 * einzelne unbrauchbare Einträge werden stillschweigend übersprungen.
 */
export function parseUserDataBackup(raw: string): UserDataBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Die Datei enthält kein gültiges JSON.");
  }

  if (!isRecord(parsed) || parsed.kind !== USER_DATA_BACKUP_KIND) {
    throw new Error("Die Datei ist kein RVTools-Analyzer-Backup.");
  }
  if (parsed.version !== USER_DATA_BACKUP_VERSION) {
    throw new Error(`Backup-Version ${String(parsed.version)} wird nicht unterstützt.`);
  }

  const assignments = Array.isArray(parsed.maintenanceClusterAssignments)
    ? parsed.maintenanceClusterAssignments
        .map(normalizeAssignment)
        .filter((entry): entry is MaintenanceClusterAssignment => entry !== null)
    : [];
  const scenarios = Array.isArray(parsed.scenarios)
    ? parsed.scenarios
        .map(normalizeScenario)
        .filter((entry): entry is Scenario => entry !== null)
    : [];

  return {
    kind: USER_DATA_BACKUP_KIND,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt: toTrimmedString(parsed.exportedAt),
    maintenanceSettings: normalizeSettings(parsed.maintenanceSettings),
    maintenanceClusterAssignments: assignments,
    scenarios,
  };
}
