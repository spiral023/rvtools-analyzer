import type {
  MaintenanceClusterAssignment,
  MaintenanceSettings,
  MaintenanceWindowDefinition,
  Scenario,
  VCenterGroup,
  VmScopeSettings,
} from "@/domain/models/types";
import {
  assertWeeklySlots,
  normalizeMaintenanceAbbreviation,
  weeklyRangesToSlots,
  weeklySlotsToRanges,
  type MaintenanceWeeklySlotRanges,
} from "@/lib/maintenanceWindows";
import { DEFAULT_VM_SCOPE_SETTINGS } from "@/lib/vmScopeSettings";

export const USER_DATA_BACKUP_KIND = "rvtools-analyzer-user-data";
/**
 * Formatversionen:
 * 1 – Grundbestand, 2 – Wartungsfenster, 3 – vCenter-Gruppen, 4 – VM-Scope-Vorgaben,
 * 5 – Wochenpläne als Zeitbereiche statt als 48er-Boolean-Matrix.
 *
 * Geschrieben wird stets die neueste Version; gelesen werden alle. Die Feldweichen unten
 * vergleichen deshalb numerisch (`version >= n`) und nicht gegen diese Konstante – sonst
 * verliert jede Versionserhöhung stillschweigend die Felder der Vorgängerversion.
 */
export const USER_DATA_BACKUP_VERSION = 5;
const OLDEST_SUPPORTED_VERSION = 1;

export interface UserDataBackup {
  kind: typeof USER_DATA_BACKUP_KIND;
  version: typeof USER_DATA_BACKUP_VERSION;
  exportedAt: string;
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  maintenanceWindows: MaintenanceWindowDefinition[];
  scenarios: Scenario[];
  vcenterGroups: VCenterGroup[];
  vmScopeSettings?: VmScopeSettings;
}

export function buildUserDataBackup(input: {
  maintenanceSettings: MaintenanceSettings | null;
  maintenanceClusterAssignments: MaintenanceClusterAssignment[];
  maintenanceWindows: MaintenanceWindowDefinition[];
  scenarios: Scenario[];
  vcenterGroups?: VCenterGroup[];
  vmScopeSettings?: VmScopeSettings;
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
    vmScopeSettings: input.vmScopeSettings ?? DEFAULT_VM_SCOPE_SETTINGS,
  };
}

/**
 * Serialisierte Form eines Wartungsfensters. Abweichend von der Arbeitsform steht der
 * Wochenplan als Zeitbereiche je Wochentag in der Datei: die Boolean-Matrix erzeugt bei
 * eingerücktem JSON 336 Zeilen pro Fenster, die Zeitbereiche wenige.
 */
type SerializedMaintenanceWindow =
  Omit<MaintenanceWindowDefinition, "weeklySlots">
  & { weeklySlots: MaintenanceWeeklySlotRanges };

export function serializeUserDataBackup(backup: UserDataBackup): string {
  const maintenanceWindows: SerializedMaintenanceWindow[] = backup.maintenanceWindows.map((window) => ({
    ...window,
    weeklySlots: weeklySlotsToRanges(window.weeklySlots),
  }));
  return JSON.stringify({ ...backup, maintenanceWindows }, null, 2);
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

function normalizeVmScopeSettings(value: unknown): VmScopeSettings | null {
  if (!isRecord(value)
    || (value.vmPowerScope !== "all" && value.vmPowerScope !== "poweredOn")
    || typeof value.excludeVclsVms !== "boolean") return null;
  return {
    vmPowerScope: value.vmPowerScope,
    excludeVclsVms: value.excludeVclsVms,
    excludeDummyVms: typeof value.excludeDummyVms === "boolean" ? value.excludeDummyVms : false,
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

/**
 * Liest den Wochenplan in beiden Dateiformen: ab Version 5 stehen Zeitbereiche je
 * Wochentag in der Datei, davor die 48er-Boolean-Matrix. Die Form wird am Wert erkannt und
 * nicht an der Versionsnummer, damit auch von Hand zusammengestellte oder gemischte
 * Backups gelesen werden. Ergebnis ist immer die Arbeitsform Matrix; `null` bei defekten
 * Plänen, damit der Aufrufer das Fenster überspringen kann.
 */
function readWeeklySlots(value: unknown): MaintenanceWindowDefinition["weeklySlots"] | null {
  try {
    if (Array.isArray(value)) {
      assertWeeklySlots(value);
      return value.map((day) => [...day]) as MaintenanceWindowDefinition["weeklySlots"];
    }
    return weeklyRangesToSlots(value);
  } catch {
    return null;
  }
}

function normalizeMaintenanceWindow(value: unknown): MaintenanceWindowDefinition | null {
  if (!isRecord(value)) return null;
  const id = toTrimmedString(value.id);
  const abbreviation = toTrimmedString(value.abbreviation);
  if (!id || !abbreviation || !VALID_MAINTENANCE_WINDOW_HANDLINGS.has(
    value.handling as MaintenanceWindowDefinition["handling"],
  )) return null;

  const weeklySlots = readWeeklySlots(value.weeklySlots);
  if (weeklySlots === null) return null;

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
    weeklySlots,
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
  if (!Number.isInteger(parsed.version)
    || (parsed.version as number) < OLDEST_SUPPORTED_VERSION
    || (parsed.version as number) > USER_DATA_BACKUP_VERSION) {
    throw new Error(`Backup-Version ${String(parsed.version)} wird nicht unterstützt.`);
  }
  const version = parsed.version as number;

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
  const maintenanceWindows = version >= 2 && Array.isArray(parsed.maintenanceWindows)
    ? parsed.maintenanceWindows
        .map(normalizeMaintenanceWindow)
        .filter((entry): entry is MaintenanceWindowDefinition => entry !== null)
    : [];
  const vcenterGroups = version >= 3 && Array.isArray(parsed.vcenterGroups)
    ? parsed.vcenterGroups
        .map(normalizeVcenterGroup)
        .filter((entry): entry is VCenterGroup => entry !== null)
    : [];
  const vmScopeSettings = version >= 4
    ? normalizeVmScopeSettings(parsed.vmScopeSettings) ?? undefined
    : undefined;

  return {
    kind: USER_DATA_BACKUP_KIND,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt: toTrimmedString(parsed.exportedAt),
    maintenanceSettings: normalizeSettings(parsed.maintenanceSettings),
    maintenanceClusterAssignments: assignments,
    maintenanceWindows,
    scenarios,
    vcenterGroups,
    vmScopeSettings,
  };
}
