import type {
  MaintenanceClusterAssignment,
  MaintenanceSettings,
  MaintenanceWindowDefinition,
  Scenario,
  VCenterGroup,
} from "@/domain/models/types";
import { assertWeeklySlots, normalizeMaintenanceAbbreviation } from "@/lib/maintenanceWindows";

export const USER_DATA_BACKUP_KIND = "rvtools-analyzer-user-data";
export const USER_DATA_BACKUP_VERSION = 3;

export interface UserDataBackup {
  kind: typeof USER_DATA_BACKUP_KIND;
  version: typeof USER_DATA_BACKUP_VERSION;
  exportedAt: string;
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  maintenanceWindows: MaintenanceWindowDefinition[];
  scenarios: Scenario[];
  vcenterGroups: VCenterGroup[];
}

export function buildUserDataBackup(input: {
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  maintenanceWindows: MaintenanceWindowDefinition[];
  scenarios: Scenario[];
  vcenterGroups?: VCenterGroup[];
  exportedAt?: Date;
}): UserDataBackup {
  return {
    kind: USER_DATA_BACKUP_KIND,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    maintenanceSettings: input.maintenanceSettings,
    maintenanceClusterAssignments: input.maintenanceClusterAssignments,
    maintenanceWindows: input.maintenanceWindows,
    scenarios: input.scenarios,
    vcenterGroups: input.vcenterGroups ?? [],
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

function normalizeVcenterGroup(value: unknown): VCenterGroup | null {
  if (!isRecord(value)) return null;
  const id = toTrimmedString(value.id);
  const name = toTrimmedString(value.name);
  const vcenterIds = [...new Set(toStringArray(value.vcenterIds))];
  if (!id || !name || vcenterIds.length === 0) return null;
  const fallbackTimestamp = new Date().toISOString();
  return {
    id,
    name,
    vcenterIds,
    createdAt: normalizeTimestamp(value.createdAt, fallbackTimestamp),
    updatedAt: normalizeTimestamp(value.updatedAt, fallbackTimestamp),
  };
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  const candidate = toTrimmedString(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : fallback;
}

const VALID_MAINTENANCE_WINDOW_HANDLINGS = new Set<MaintenanceWindowDefinition["handling"]>([
  "regular",
  "always",
  "approval-required",
  "external",
]);

function normalizeMaintenanceWindow(value: unknown): MaintenanceWindowDefinition | null {
  if (!isRecord(value)) return null;
  const id = toTrimmedString(value.id);
  const abbreviation = toTrimmedString(value.abbreviation);
  if (!id || !abbreviation || !VALID_MAINTENANCE_WINDOW_HANDLINGS.has(
    value.handling as MaintenanceWindowDefinition["handling"],
  )) return null;

  try {
    assertWeeklySlots(value.weeklySlots);
  } catch {
    return null;
  }

  if (!Array.isArray(value.calendarRules)) return null;
  const calendarRules: MaintenanceWindowDefinition["calendarRules"] = [];
  for (const candidate of value.calendarRules) {
    if (!isRecord(candidate)
      || !Number.isInteger(candidate.weekday)
      || Number(candidate.weekday) < 0
      || Number(candidate.weekday) > 6
      || !Array.isArray(candidate.occurrences)
      || candidate.occurrences.some((occurrence) =>
        occurrence !== "last"
        && (!Number.isInteger(occurrence) || Number(occurrence) < 1 || Number(occurrence) > 5))) {
      return null;
    }
    calendarRules.push({
      weekday: Number(candidate.weekday) as MaintenanceWindowDefinition["calendarRules"][number]["weekday"],
      occurrences: [...candidate.occurrences] as MaintenanceWindowDefinition["calendarRules"][number]["occurrences"],
    });
  }

  const fallbackTimestamp = new Date().toISOString();
  return {
    id,
    abbreviation,
    normalizedAbbreviation: normalizeMaintenanceAbbreviation(abbreviation),
    description: typeof value.description === "string" ? value.description : "",
    handling: value.handling as MaintenanceWindowDefinition["handling"],
    weeklySlots: value.weeklySlots.map((day) => [...day]) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules,
    createdAt: normalizeTimestamp(value.createdAt, fallbackTimestamp),
    updatedAt: normalizeTimestamp(value.updatedAt, fallbackTimestamp),
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
  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== USER_DATA_BACKUP_VERSION) {
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
  const maintenanceWindows = (parsed.version === 2 || parsed.version === USER_DATA_BACKUP_VERSION) && Array.isArray(parsed.maintenanceWindows)
    ? parsed.maintenanceWindows
        .map(normalizeMaintenanceWindow)
        .filter((entry): entry is MaintenanceWindowDefinition => entry !== null)
    : [];
  const vcenterGroups = parsed.version === USER_DATA_BACKUP_VERSION && Array.isArray(parsed.vcenterGroups)
    ? parsed.vcenterGroups
        .map(normalizeVcenterGroup)
        .filter((entry): entry is VCenterGroup => entry !== null)
    : [];

  return {
    kind: USER_DATA_BACKUP_KIND,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt: toTrimmedString(parsed.exportedAt),
    maintenanceSettings: normalizeSettings(parsed.maintenanceSettings),
    maintenanceClusterAssignments: assignments,
    maintenanceWindows,
    scenarios,
    vcenterGroups,
  };
}
