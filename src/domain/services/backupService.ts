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
import {
  LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID,
  TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
  TECH_INFO_ORGANISATION_TABLE_ID,
  notifyTableDisplayPreferencesChanged,
} from "@/lib/tableDisplayPreferences";

export interface UserDataImportResult {
  settingsImported: boolean;
  assignmentsImported: number;
  maintenanceWindowsImported: number;
  scenariosImported: number;
  vcenterGroupsImported: number;
  vmScopeSettingsImported: boolean;
  techInfoOrganisationTablePreferencesImported: boolean;
  tableDisplayPreferencesImported: boolean;
}

/** Sammelt alle Benutzerdaten (ohne RVTools-/Tech-Info-Daten) für den Export. */
export async function collectUserDataBackup(): Promise<UserDataBackup> {
  const [settings, assignments, maintenanceWindows, scenarios, vcenterGroups, tablePreferencesUiState, legacyTechInfoUiState] = await Promise.all([
    getMaintenanceSettings(),
    getMaintenanceAssignments(),
    getMaintenanceWindows(),
    getScenarios(),
    getVcenterGroups(),
    getUiState(TABLE_DISPLAY_PREFERENCES_UI_STATE_ID),
    getUiState(LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID),
  ]);

  const tableDisplayPreferences = {
    ...(legacyTechInfoUiState?.techInfoOrganisationTablePreferences
      ? { [TECH_INFO_ORGANISATION_TABLE_ID]: legacyTechInfoUiState.techInfoOrganisationTablePreferences }
      : {}),
    ...(tablePreferencesUiState?.tableDisplayPreferences ?? {}),
  };
  const techInfoOrganisationTablePreferences = tableDisplayPreferences[TECH_INFO_ORGANISATION_TABLE_ID]
    ?? legacyTechInfoUiState?.techInfoOrganisationTablePreferences;

  return buildUserDataBackup({
    maintenanceSettings: settings ?? null,
    maintenanceClusterAssignments: assignments,
    maintenanceWindows,
    scenarios,
    vcenterGroups,
    vmScopeSettings: getStoredVmScopeSettings(),
    techInfoOrganisationTablePreferences,
    tableDisplayPreferences: Object.keys(tableDisplayPreferences).length > 0 ? tableDisplayPreferences : undefined,
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
  const tableDisplayPreferences = {
    ...(backup.techInfoOrganisationTablePreferences
      ? { [TECH_INFO_ORGANISATION_TABLE_ID]: backup.techInfoOrganisationTablePreferences }
      : {}),
    ...(backup.tableDisplayPreferences ?? {}),
  };
  if (Object.keys(tableDisplayPreferences).length > 0) {
    const existing = await getUiState(TABLE_DISPLAY_PREFERENCES_UI_STATE_ID);
    await putUiState({
      ...(existing ?? { id: TABLE_DISPLAY_PREFERENCES_UI_STATE_ID, theme: "dark" }),
      id: TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
      // Tabellenweise mergen: Ansichten, die das Backup nicht kennt, bleiben erhalten.
      tableDisplayPreferences: { ...existing?.tableDisplayPreferences, ...tableDisplayPreferences },
    });

    const techInfoPreferences = tableDisplayPreferences[TECH_INFO_ORGANISATION_TABLE_ID];
    if (techInfoPreferences) {
      const legacyExisting = await getUiState(LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID);
      await putUiState({
        ...(legacyExisting ?? { id: LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID, theme: "dark" }),
        id: LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID,
        techInfoOrganisationTablePreferences: techInfoPreferences,
      });
    }
    notifyTableDisplayPreferencesChanged();
  }

  return {
    settingsImported: Boolean(backup.maintenanceSettings),
    assignmentsImported: backup.maintenanceClusterAssignments.length,
    maintenanceWindowsImported: maintenanceWindows.length,
    scenariosImported: backup.scenarios.length,
    vcenterGroupsImported: backup.vcenterGroups.length,
    vmScopeSettingsImported: Boolean(backup.vmScopeSettings),
    techInfoOrganisationTablePreferencesImported: Boolean(tableDisplayPreferences[TECH_INFO_ORGANISATION_TABLE_ID]),
    tableDisplayPreferencesImported: Object.keys(tableDisplayPreferences).length > 0,
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
