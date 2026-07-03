import {
  getMaintenanceAssignments,
  getMaintenanceSettings,
  getScenarios,
  putMaintenanceAssignment,
  putMaintenanceSettings,
  putScenario,
} from "@/data/db";
import { buildUserDataBackup, type UserDataBackup } from "@/lib/backup/userDataBackup";

export interface UserDataImportResult {
  settingsImported: boolean;
  assignmentsImported: number;
  scenariosImported: number;
}

/** Sammelt alle Benutzerdaten (ohne RVTools-/Tech-Info-Daten) für den Export. */
export async function collectUserDataBackup(): Promise<UserDataBackup> {
  const [settings, assignments, scenarios] = await Promise.all([
    getMaintenanceSettings(),
    getMaintenanceAssignments(),
    getScenarios(),
  ]);

  return buildUserDataBackup({
    maintenanceSettings: settings ?? null,
    maintenanceClusterAssignments: assignments,
    scenarios,
  });
}

/**
 * Schreibt ein Backup in die Datenbank (Merge: gleiche Schlüssel werden
 * überschrieben, alle übrigen Einträge bleiben erhalten).
 */
export async function applyUserDataBackup(backup: UserDataBackup): Promise<UserDataImportResult> {
  if (backup.maintenanceSettings) {
    await putMaintenanceSettings(backup.maintenanceSettings);
  }
  for (const assignment of backup.maintenanceClusterAssignments) {
    await putMaintenanceAssignment(assignment);
  }
  for (const scenario of backup.scenarios) {
    await putScenario(scenario);
  }

  return {
    settingsImported: Boolean(backup.maintenanceSettings),
    assignmentsImported: backup.maintenanceClusterAssignments.length,
    scenariosImported: backup.scenarios.length,
  };
}
