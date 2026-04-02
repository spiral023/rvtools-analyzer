import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { FilterState, SnapshotId } from "@/domain/models/types";
import { getUiState, putUiState } from "@/data/db";

const defaultFilter: FilterState = {
  snapshotIds: [],
  vcenterIds: [],
  clusters: [],
  hosts: [],
  datastores: [],
  search: "",
  globalFilter: null,
};

const UI_STATE_ID = "app";

interface FilterContextValue {
  filters: FilterState;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;
  activeSnapshotIds: SnapshotId[];
}

const FilterContext = createContext<FilterContextValue>({
  filters: defaultFilter,
  setFilters: () => {},
  resetFilters: () => {},
  activeSnapshotIds: [],
});

export const useFilterState = () => useContext(FilterContext);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterState>(defaultFilter);
  const hydratedRef = useRef(false);

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilter);
  }, []);

  // activeSnapshotIds: use selected or empty (pages will handle fallback to latest)
  const activeSnapshotIds = filters.snapshotIds;

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const stored = await getUiState(UI_STATE_ID);
        if (!cancelled && stored?.lastFilter) {
          setFiltersState({
            ...defaultFilter,
            ...stored.lastFilter,
            globalFilter: stored.lastFilter.globalFilter ?? null,
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
    if (!hydratedRef.current) return;

    void (async () => {
      const existing = await getUiState(UI_STATE_ID);
      await putUiState({
        id: UI_STATE_ID,
        theme: existing?.theme ?? "dark",
        presets: existing?.presets,
        lastFilter: filters,
      });
    })();
  }, [filters]);

  return (
    <FilterContext.Provider
      value={{ filters, setFilters, resetFilters, activeSnapshotIds }}
    >
      {children}
    </FilterContext.Provider>
  );
}
