import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FilterState, SnapshotId } from "@/domain/models/types";
import { getSnapshots, getUiState, putUiState } from "@/data/db";

const defaultFilter: FilterState = {
  snapshotIds: [],
  vcenterIds: [],
  clusters: [],
  hosts: [],
  datastores: [],
  search: "",
  globalFilter: null,
  vmNameList: "",
  vmPowerScope: "all",
  excludeVclsVms: false,
};

const UI_STATE_ID = "app";
const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

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
  const { data: snapshots = [], isSuccess: snapshotsLoaded } = useQuery({
    queryKey: ["snapshots"],
    queryFn: getSnapshots,
    staleTime: SNAPSHOT_STALE_MS,
  });

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilter);
  }, []);

  const effectiveFilters = useMemo(() => {
    if (!snapshotsLoaded) return filters;

    const validSnapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshotId));
    const validVcenterIds = new Set(snapshots.map((snapshot) => snapshot.vcenterId));
    const snapshotIds = filters.snapshotIds.filter((snapshotId) => validSnapshotIds.has(snapshotId));
    const vcenterIds = filters.vcenterIds.filter((vcenterId) => validVcenterIds.has(vcenterId));
    if (snapshotIds.length === filters.snapshotIds.length && vcenterIds.length === filters.vcenterIds.length) {
      return filters;
    }
    return { ...filters, snapshotIds, vcenterIds };
  }, [filters, snapshots, snapshotsLoaded]);

  // activeSnapshotIds: use selected or empty (pages will handle fallback to latest)
  const activeSnapshotIds = effectiveFilters.snapshotIds;

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
        lastFilter: effectiveFilters,
      });
    })();
  }, [effectiveFilters]);

  const contextValue = useMemo(
    () => ({ filters: effectiveFilters, setFilters, resetFilters, activeSnapshotIds }),
    [activeSnapshotIds, effectiveFilters, resetFilters, setFilters],
  );

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}
