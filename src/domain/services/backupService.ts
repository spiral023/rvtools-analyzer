import {
  getMaintenanceAssignments,
  getMaintenanceSettings,
  getMaintenanceWindows,
  getScenarios,
  putMaintenanceAssignment,
  putMaintenanceSettings,
  putScenario,
  upsertMaintenanceWindows,
  validateMaintenanceWindowUpsertInput,
} from "@/data/db";
import { buildUserDataBackup, type UserDataBackup } from "@/lib/backup/userDataBackup";

export interface UserDataImportResult {
  settingsImported: boolean;
  assignmentsImported: number;
  maintenanceWindowsImported: number;
  scenariosImported: number;
}

/** Sammelt alle Benutzerdaten (ohne RVTools-/Tech-Info-Daten) für den Export. */
export async function collectUserDataBackup(): Promise<UserDataBackup> {
  const [settings, assignments, maintenanceWindows, scenarios] = await Promise.all([
    getMaintenanceSettings(),
    getMaintenanceAssignments(),
    getMaintenanceWindows(),
    getScenarios(),
  ]);

  return buildUserDataBackup({
    maintenanceSettings: settings ?? null,
    maintenanceClusterAssignments: assignments,
    maintenanceWindows,
    scenarios,
  });
}

/**
 * Schreibt ein Backup in die Datenbank (Merge: gleiche Schlüssel werden
 * überschrieben, alle übrigen Einträge bleiben erhalten).
 */
export async function applyUserDataBackup(backup: UserDataBackup): Promise<UserDataImportResult> {
  const maintenanceWindows = validateMaintenanceWindowUpsertInput(backup.maintenanceWindows);

  await Promise.all([
    backup.maintenanceSettings ? putMaintenanceSettings(backup.maintenanceSettings) : Promise.resolve(),
    maintenanceWindows.length > 0
      ? upsertMaintenanceWindows(maintenanceWindows)
      : Promise.resolve(),
    ...backup.maintenanceClusterAssignments.map((assignment) => putMaintenanceAssignment(assignment)),
    ...backup.scenarios.map((scenario) => putScenario(scenario)),
  ]);

  return {
    settingsImported: Boolean(backup.maintenanceSettings),
    assignmentsImported: backup.maintenanceClusterAssignments.length,
    maintenanceWindowsImported: maintenanceWindows.length,
    scenariosImported: backup.scenarios.length,
  };
}
