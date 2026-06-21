import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getBySnapshotIds, getRawSheetRows, getSnapshots, getTechInfoLatestByVmNames } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import {
  buildGlobalFilterFields,
  buildVmJoinKey,
  evaluateGlobalFilter,
  filterRowsByMatchingVmJoinKeys,
  hasGlobalFilterDefinition,
  RAW_VM_FILTER_SOURCES,
  summarizeGlobalFilter,
  type VmGlobalFilterContextEntry,
  type VmRawFilterSource,
} from "@/lib/globalFilter";
import type { GlobalFilterField, GlobalFilterGroup, NormalizedVm, SheetRow } from "@/domain/models/types";

const STALE_MS = 5 * 60 * 1000;

export interface GlobalVmFilterEngineResult {
  fields: GlobalFilterField[];
  matchingVmKeys: Set<string> | null;
  matchingVmJoinKeys: Set<string> | null;
  hasActiveFilter: boolean;
  summary: string;
  filterVmRows: (rows: SheetRow[]) => SheetRow[];
  totalVmCount: number;
  previewMatchingCount: number | null;
}

export function useGlobalVmFilterEngine(
  enabled = true,
  previewFilter?: GlobalFilterGroup | null,
): GlobalVmFilterEngineResult {
  const { filters } = useFilterState();
  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: getSnapshots,
    staleTime: STALE_MS,
  });
  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filteredSnapshots = filters.vcenterIds.length
      ? snapshots.filter((snapshot) => filters.vcenterIds.includes(snapshot.vcenterId))
      : snapshots;

    for (const snapshot of filteredSnapshots) {
      const existing = latestMap.get(snapshot.vcenterId);
      if (!existing || snapshot.exportTs > existing.ts) {
        latestMap.set(snapshot.vcenterId, { id: snapshot.snapshotId, ts: snapshot.exportTs });
      }
    }

    return [...latestMap.values()].map((entry) => entry.id);
  }, [filters.snapshotIds, filters.vcenterIds, snapshots]);

  const { data: allVms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds),
    enabled: enabled && activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const hasActiveFilter = hasGlobalFilterDefinition(filters.globalFilter);

  const normalizedVmNames = useMemo(
    () => [...new Set(allVms.map((vm) => vm.vmName.trim()).filter(Boolean))].sort(),
    [allVms],
  );

  const { data: techInfoLatest = [] } = useQuery({
    queryKey: ["techInfoLatestByVmNames", normalizedVmNames],
    queryFn: () => getTechInfoLatestByVmNames(normalizedVmNames),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });

  const rawQueryResults = useQueries({
    queries: RAW_VM_FILTER_SOURCES.map((source) => ({
      queryKey: ["globalVmFilterRawSheet", source, activeSnapshotIds],
      queryFn: () => getRawSheetRows(activeSnapshotIds, source),
      enabled: enabled && activeSnapshotIds.length > 0,
      staleTime: STALE_MS,
    })),
  });

  const rawRowsBySource = useMemo(
    () =>
      RAW_VM_FILTER_SOURCES.reduce<Partial<Record<VmRawFilterSource, SheetRow[]>>>((acc, source, index) => {
        acc[source] = (rawQueryResults[index]?.data as SheetRow[] | undefined) ?? [];
        return acc;
      }, {}),
    [rawQueryResults],
  );

  const contexts = useMemo(() => {
    const techInfoByVmName = new Map(techInfoLatest.map((entry) => [entry.vmNameNorm, entry]));
    const rowsBySourceAndJoinKey = RAW_VM_FILTER_SOURCES.reduce<Record<VmRawFilterSource, Map<string, SheetRow[]>>>(
      (acc, source) => {
        const grouped = new Map<string, SheetRow[]>();
        for (const row of rawRowsBySource[source] ?? []) {
          const joinKey = buildVmJoinKey(row.snapshotId, row.data["VM"] ?? "");
          const bucket = grouped.get(joinKey);
          if (bucket) bucket.push(row);
          else grouped.set(joinKey, [row]);
        }
        acc[source] = grouped;
        return acc;
      },
      {} as Record<VmRawFilterSource, Map<string, SheetRow[]>>,
    );

    return allVms.map<VmGlobalFilterContextEntry>((vm) => {
      const joinKey = buildVmJoinKey(vm.snapshotId, vm.vmName);
      const perSource = RAW_VM_FILTER_SOURCES.reduce<Partial<Record<VmRawFilterSource, SheetRow[]>>>((acc, source) => {
        acc[source] = rowsBySourceAndJoinKey[source].get(joinKey) ?? [];
        return acc;
      }, {});

      return {
        vm,
        techInfo: techInfoByVmName.get(vm.vmName.trim().toLowerCase()) ?? null,
        rawRowsBySource: perSource,
      };
    });
  }, [allVms, rawRowsBySource, techInfoLatest]);

  const fields = useMemo(
    () => buildGlobalFilterFields(allVms, techInfoLatest, rawRowsBySource),
    [allVms, techInfoLatest, rawRowsBySource],
  );

  const matchingVmKeys = useMemo(() => {
    if (!hasActiveFilter) return null;
    return new Set(
      contexts
        .filter((entry) => evaluateGlobalFilter(filters.globalFilter, entry, fields))
        .map((entry) => entry.vm.vmKey),
    );
  }, [contexts, fields, filters.globalFilter, hasActiveFilter]);

  const matchingVmJoinKeys = useMemo(() => {
    if (!hasActiveFilter || !matchingVmKeys) return null;
    return new Set(
      contexts
        .filter((entry) => matchingVmKeys.has(entry.vm.vmKey))
        .map((entry) => buildVmJoinKey(entry.vm.snapshotId, entry.vm.vmName)),
    );
  }, [contexts, hasActiveFilter, matchingVmKeys]);

  const summary = useMemo(
    () => summarizeGlobalFilter(filters.globalFilter, fields),
    [fields, filters.globalFilter],
  );

  const filterVmRows = useMemo(
    () => (rows: SheetRow[]) => filterRowsByMatchingVmJoinKeys(rows, matchingVmJoinKeys),
    [matchingVmJoinKeys],
  );

  const totalVmCount = allVms.length;

  const previewMatchingCount = useMemo(() => {
    if (previewFilter === undefined) return null;
    if (!hasGlobalFilterDefinition(previewFilter)) return totalVmCount;
    return contexts.filter((entry) => evaluateGlobalFilter(previewFilter, entry, fields)).length;
  }, [contexts, fields, previewFilter, totalVmCount]);

  return {
    fields,
    matchingVmKeys,
    matchingVmJoinKeys,
    hasActiveFilter,
    summary,
    filterVmRows,
    totalVmCount,
    previewMatchingCount,
  };
}
