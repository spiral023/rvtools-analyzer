import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getUiState, putUiState } from "@/data/db";
import type {
  TableDisplayPreferences,
  TableDisplayPreferencesByTableId,
} from "@/domain/models/types";
import {
  cloneTableDisplayPreferences,
  LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID,
  normalizeTableDisplayPreferences,
  normalizeTableDisplayPreferencesByTableId,
  TABLE_DISPLAY_PREFERENCES_CHANGED_EVENT,
  TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
  TECH_INFO_ORGANISATION_TABLE_ID,
  tableDisplayPreferencesEqual,
} from "@/lib/tableDisplayPreferences";

interface TableDisplayPreferencesContextValue {
  preferencesByTableId: TableDisplayPreferencesByTableId;
  updateTablePreferences: (tableId: string, preferences: TableDisplayPreferences) => void;
  reload: () => Promise<void>;
}

const TableDisplayPreferencesContext = createContext<TableDisplayPreferencesContextValue | null>(null);

function mergeLegacyPreferences(
  preferencesByTableId: TableDisplayPreferencesByTableId,
  legacyPreferences: TableDisplayPreferences | null | undefined,
): TableDisplayPreferencesByTableId {
  if (!legacyPreferences || preferencesByTableId[TECH_INFO_ORGANISATION_TABLE_ID]) return preferencesByTableId;
  return {
    ...preferencesByTableId,
    [TECH_INFO_ORGANISATION_TABLE_ID]: cloneTableDisplayPreferences(legacyPreferences),
  };
}

export function TableDisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferencesByTableId, setPreferencesByTableId] = useState<TableDisplayPreferencesByTableId>({});
  const preferencesRef = useRef<TableDisplayPreferencesByTableId>({});
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    try {
      const [sharedState, legacyState] = await Promise.all([
        getUiState(TABLE_DISPLAY_PREFERENCES_UI_STATE_ID),
        getUiState(LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID),
      ]);
      const loaded = normalizeTableDisplayPreferencesByTableId(sharedState?.tableDisplayPreferences) ?? {};
      const merged = mergeLegacyPreferences(
        loaded,
        normalizeTableDisplayPreferences(legacyState?.techInfoOrganisationTablePreferences),
      );
      preferencesRef.current = merged;
      setPreferencesByTableId(merged);
    } catch {
      // Ein temporärer IndexedDB-Fehler darf die Tabellenbedienung nicht blockieren.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleChange = () => { void load(); };
    window.addEventListener(TABLE_DISPLAY_PREFERENCES_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(TABLE_DISPLAY_PREFERENCES_CHANGED_EVENT, handleChange);
  }, [load]);

  const enqueueWrite = useCallback((next: TableDisplayPreferencesByTableId) => {
    writeQueueRef.current = writeQueueRef.current
      .then(async () => {
        const existing = await getUiState(TABLE_DISPLAY_PREFERENCES_UI_STATE_ID);
        await putUiState({
          ...(existing ?? { id: TABLE_DISPLAY_PREFERENCES_UI_STATE_ID, theme: "dark" as const }),
          id: TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
          tableDisplayPreferences: next,
        });

        const techInfoPreferences = next[TECH_INFO_ORGANISATION_TABLE_ID];
        if (techInfoPreferences) {
          const legacyExisting = await getUiState(LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID);
          await putUiState({
            ...(legacyExisting ?? { id: LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID, theme: "dark" as const }),
            id: LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID,
            techInfoOrganisationTablePreferences: techInfoPreferences,
          });
        }
      })
      .catch(() => {
        // Ein temporärer IndexedDB-Fehler darf die Tabellenbedienung nicht blockieren.
      });
  }, []);

  const updateTablePreferences = useCallback((tableId: string, preferences: TableDisplayPreferences) => {
    const normalized = normalizeTableDisplayPreferences(preferences);
    if (!tableId || !normalized || tableDisplayPreferencesEqual(preferencesRef.current[tableId], normalized)) return;

    const next = {
      ...preferencesRef.current,
      [tableId]: cloneTableDisplayPreferences(normalized),
    };
    preferencesRef.current = next;
    setPreferencesByTableId(next);
    enqueueWrite(next);
  }, [enqueueWrite]);

  const value = useMemo<TableDisplayPreferencesContextValue>(() => ({
    preferencesByTableId,
    updateTablePreferences,
    reload: load,
  }), [load, preferencesByTableId, updateTablePreferences]);

  return <TableDisplayPreferencesContext.Provider value={value}>{children}</TableDisplayPreferencesContext.Provider>;
}

export function useTableDisplayPreferences(
  tableId: string | undefined,
  defaults: TableDisplayPreferences,
): {
  tablePreferences: TableDisplayPreferences;
  onTablePreferencesChange?: (preferences: TableDisplayPreferences) => void;
} {
  const context = useContext(TableDisplayPreferencesContext);
  const tablePreferences = tableId && context?.preferencesByTableId[tableId]
    ? context.preferencesByTableId[tableId]
    : defaults;
  const onTablePreferencesChange = useCallback(
    (preferences: TableDisplayPreferences) => {
      if (tableId) context?.updateTablePreferences(tableId, preferences);
    },
    [context, tableId],
  );

  return { tablePreferences, onTablePreferencesChange: tableId ? onTablePreferencesChange : undefined };
}
