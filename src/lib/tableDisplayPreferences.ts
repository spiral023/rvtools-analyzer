import type {
  TableDisplayPreferences,
  TableDisplayPreferencesByTableId,
} from "@/domain/models/types";

export const TABLE_DISPLAY_PREFERENCES_UI_STATE_ID = "table-display-preferences";
export const LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID = "tech-info-organisation";
export const TECH_INFO_ORGANISATION_TABLE_ID = "tech-info/organisation-vm-drilldown";
export const TABLE_DISPLAY_PREFERENCES_CHANGED_EVENT = "rvtools:table-display-preferences-changed";

export function notifyTableDisplayPreferencesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TABLE_DISPLAY_PREFERENCES_CHANGED_EVENT));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTableDisplayPreferences(value: unknown): TableDisplayPreferences | null {
  if (!isRecord(value) || !isRecord(value.columnVisibility)
    || !Array.isArray(value.columnOrder) || !Array.isArray(value.sorting)) return null;

  const columnVisibility = Object.entries(value.columnVisibility).reduce<Record<string, boolean>>((result, [id, visible]) => {
    const normalizedId = id.trim();
    if (normalizedId && typeof visible === "boolean") result[normalizedId] = visible;
    return result;
  }, {});
  const columnOrder = [...new Set(value.columnOrder
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim()))];
  const sorting: TableDisplayPreferences["sorting"] = [];
  for (const item of value.sorting) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || typeof item.desc !== "boolean") continue;
    const id = item.id.trim();
    if (!sorting.some((entry) => entry.id === id)) sorting.push({ id, desc: item.desc });
  }

  return { columnVisibility, columnOrder, sorting };
}

export function normalizeTableDisplayPreferencesByTableId(value: unknown): TableDisplayPreferencesByTableId | null {
  if (!isRecord(value)) return null;
  const result: TableDisplayPreferencesByTableId = {};
  for (const [tableId, preferences] of Object.entries(value)) {
    const normalizedTableId = tableId.trim();
    const normalizedPreferences = normalizeTableDisplayPreferences(preferences);
    if (normalizedTableId && normalizedPreferences) result[normalizedTableId] = normalizedPreferences;
  }
  return result;
}

export function cloneTableDisplayPreferences(preferences: TableDisplayPreferences): TableDisplayPreferences {
  return {
    columnVisibility: { ...preferences.columnVisibility },
    columnOrder: [...preferences.columnOrder],
    sorting: preferences.sorting.map((entry) => ({ ...entry })),
  };
}

export function tableDisplayPreferencesEqual(
  left: TableDisplayPreferences | undefined,
  right: TableDisplayPreferences,
): boolean {
  if (!left) return false;
  if (left.columnOrder.length !== right.columnOrder.length
    || left.sorting.length !== right.sorting.length
    || Object.keys(left.columnVisibility).length !== Object.keys(right.columnVisibility).length) return false;

  if (left.columnOrder.some((id, index) => id !== right.columnOrder[index])) return false;
  if (left.sorting.some((entry, index) => entry.id !== right.sorting[index]?.id || entry.desc !== right.sorting[index]?.desc)) return false;
  return Object.entries(right.columnVisibility).every(([id, visible]) => left.columnVisibility[id] === visible);
}
