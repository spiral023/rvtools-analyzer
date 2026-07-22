import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FilterState } from "@/domain/models/types";
import { getSnapshots, getUiState, putUiState } from "@/data/db";
import {
  DEFAULT_VM_SCOPE_SETTINGS,
  getStoredVmScopeSettings,
  getVmScopeSettingsFromEvent,
  saveVmScopeSettings,
  VM_SCOPE_SETTINGS_CHANGED_EVENT,
} from "@/lib/vmScopeSettings";

const defaultFilter: FilterState = {
  vcenterIds: [],
  clusters: [],
  hosts: [],
  datastores: [],
  search: "",
  globalFilter: null,
  vmNameList: "",
  ...DEFAULT_VM_SCOPE_SETTINGS,
};

const UI_STATE_ID = "app";
const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

interface FilterContextValue {
  filters: FilterState;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextValue>({
  filters: defaultFilter,
  setFilters: () => {},
  resetFilters: () => {},
});

export const useFilterState = () => useContext(FilterContext);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterState>(() => ({
    ...defaultFilter,
    ...getStoredVmScopeSettings(),
  }));
  const hydratedRef = useRef(false);
  const filtersTouchedRef = useRef(false);
  const { data: snapshots = [], isSuccess: snapshotsLoaded } = useQuery({
    queryKey: ["snapshots"],
    queryFn: getSnapshots,
    staleTime: SNAPSHOT_STALE_MS,
  });

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    filtersTouchedRef.current = true;
    setFiltersState((prev) => {
      const next = { ...prev, ...partial };
      if ("vmPowerScope" in partial || "excludeVclsVms" in partial) saveVmScopeSettings(next);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    filtersTouchedRef.current = true;
    setFiltersState(defaultFilter);
    saveVmScopeSettings(DEFAULT_VM_SCOPE_SETTINGS);
  }, []);

  const effectiveFilters = useMemo(() => {
    if (!snapshotsLoaded) return filters;

    const validVcenterIds = new Set(snapshots.map((snapshot) => snapshot.vcenterId));
    const vcenterIds = filters.vcenterIds.filter((vcenterId) => validVcenterIds.has(vcenterId));
    if (vcenterIds.length === filters.vcenterIds.length) {
      return filters;
    }
    return { ...filters, vcenterIds };
  }, [filters, snapshots, snapshotsLoaded]);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const stored = await getUiState(UI_STATE_ID);
        if (!cancelled && stored?.lastFilter && !filtersTouchedRef.current) {
          const vmScopeSettings = getStoredVmScopeSettings();
          setFiltersState({
            ...defaultFilter,
            ...stored?.lastFilter,
            globalFilter: stored?.lastFilter?.globalFilter ?? null,
            ...vmScopeSettings,
          });
        }
      } finally {
        hydratedRef.current = true;
      }
    }

    loadState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const applyStoredVmScopeSettings = (event: Event) => {
      const settings = getVmScopeSettingsFromEvent(event);
      if (settings) {
        filtersTouchedRef.current = true;
        setFiltersState((current) => ({ ...current, ...settings }));
      }
    };
    globalThis.addEventListener?.(VM_SCOPE_SETTINGS_CHANGED_EVENT, applyStoredVmScopeSettings);
    return () => globalThis.removeEventListener?.(VM_SCOPE_SETTINGS_CHANGED_EVENT, applyStoredVmScopeSettings);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;

    void (async () => {
      const existing = await getUiState(UI_STATE_ID);
      await putUiState({
        id: UI_STATE_ID,
        theme: existing?.theme ?? "dark",
        presets: existing?.presets,
        lastFilter: effectiveFilters,
      });
    })();
  }, [effectiveFilters]);

  const contextValue = useMemo(
    () => ({ filters: effectiveFilters, setFilters, resetFilters }),
    [effectiveFilters, resetFilters, setFilters],
  );

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}
