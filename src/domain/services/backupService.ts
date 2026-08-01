import {
  getMaintenanceAssignments,
  getMaintenanceSettings,
  getMaintenanceWindows,
  getScenarios,
  getUiState,
  getVcenterGroups,
  putMaintenanceAssignment,
  putMaintenanceSettings,
  putScenario,
  putUiState,
  putVcenterGroup,
  upsertMaintenanceWindows,
  validateMaintenanceWindowUpsertInput,
  deleteUserData as deleteUserDataStores,
  type DeleteProgressCallback,
} from "@/data/db";
import { buildUserDataBackup, parseUserDataBackup, type UserDataBackup } from "@/lib/backup/userDataBackup";
import { DEFAULT_VM_SCOPE_SETTINGS, getStoredVmScopeSettings, saveVmScopeSettings } from "@/lib/vmScopeSettings";

export interface UserDataImportResult {
  settingsImported: boolean;
  assignmentsImported: number;
  maintenanceWindowsImported: number;
  scenariosImported: number;
  vcenterGroupsImported: number;
  vmScopeSettingsImported: boolean;
  techInfoOrganisationTablePreferencesImported: boolean;
}

const TECHINFO_ORGANISATION_UI_STATE_ID = "tech-info-organisation";

/** Sammelt alle Benutzerdaten (ohne RVTools-/Tech-Info-Daten) für den Export. */
export async function collectUserDataBackup(): Promise<UserDataBackup> {
  const [settings, assignments, maintenanceWindows, scenarios, vcenterGroups, techInfoOrganisationUiState] = await Promise.all([
    getMaintenanceSettings(),
    getMaintenanceAssignments(),
    getMaintenanceWindows(),
    getScenarios(),
    getVcenterGroups(),
    getUiState(TECHINFO_ORGANISATION_UI_STATE_ID),
  ]);

  return buildUserDataBackup({
    maintenanceSettings: settings ?? null,
    maintenanceClusterAssignments: assignments,
    maintenanceWindows,
    scenarios,
    vcenterGroups,
    vmScopeSettings: getStoredVmScopeSettings(),
    techInfoOrganisationTablePreferences: techInfoOrganisationUiState?.techInfoOrganisationTablePreferences,
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
    ...backup.vcenterGroups.map((group) => putVcenterGroup(group)),
  ]);
  if (backup.vmScopeSettings) saveVmScopeSettings(backup.vmScopeSettings);
  if (backup.techInfoOrganisationTablePreferences) {
    const existing = await getUiState(TECHINFO_ORGANISATION_UI_STATE_ID);
    await putUiState({
      ...(existing ?? { id: TECHINFO_ORGANISATION_UI_STATE_ID, theme: "dark" }),
      id: TECHINFO_ORGANISATION_UI_STATE_ID,
      techInfoOrganisationTablePreferences: backup.techInfoOrganisationTablePreferences,
    });
  }

  return {
    settingsImported: Boolean(backup.maintenanceSettings),
    assignmentsImported: backup.maintenanceClusterAssignments.length,
    maintenanceWindowsImported: maintenanceWindows.length,
    scenariosImported: backup.scenarios.length,
    vcenterGroupsImported: backup.vcenterGroups.length,
    vmScopeSettingsImported: Boolean(backup.vmScopeSettings),
    techInfoOrganisationTablePreferencesImported: Boolean(backup.techInfoOrganisationTablePreferences),
  };
}

/** Liest und übernimmt einen über den normalen Upload ausgewählten Backup-Export. */
export async function importUserDataBackupFile(file: File): Promise<UserDataImportResult> {
  return applyUserDataBackup(parseUserDataBackup(await file.text()));
}

/**
 * Löscht alle Benutzerdaten (die exakte Menge, die `collectUserDataBackup` exportiert):
 * IndexedDB-Stores plus die im localStorage gehaltenen VM-Scope-Einstellungen.
 */
export async function deleteUserData(onProgress?: DeleteProgressCallback): Promise<void> {
  await deleteUserDataStores(onProgress);
  saveVmScopeSettings(DEFAULT_VM_SCOPE_SETTINGS);
}
