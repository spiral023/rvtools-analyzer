import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { FilterState, SnapshotId } from "@/domain/models/types";

const defaultFilter: FilterState = {
  snapshotIds: [],
  vcenterIds: [],
  clusters: [],
  hosts: [],
  datastores: [],
  search: "",
};

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

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilter);
  }, []);

  // activeSnapshotIds: use selected or empty (pages will handle fallback to latest)
  const activeSnapshotIds = filters.snapshotIds;

  return (
    <FilterContext.Provider
      value={{ filters, setFilters, resetFilters, activeSnapshotIds }}
    >
      {children}
    </FilterContext.Provider>
  );
}
