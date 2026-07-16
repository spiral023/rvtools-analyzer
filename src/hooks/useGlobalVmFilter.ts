import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getBySnapshotIds, getRawSheetFieldNames, getRawSheetRows, getSnapshots, getTechInfoLatestByVmNames, getTechInfoClientLatestByClientNames } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import {
  buildGlobalFilterFields,
  buildVmJoinKey,
  collectReferencedRawFilterSources,
  evaluateGlobalFilter,
  filterRowsByMatchingVmJoinKeys,
  hasGlobalFilterDefinition,
  RAW_VM_FILTER_SOURCES,
  summarizeGlobalFilter,
  type VmGlobalFilterContextEntry,
  type VmRawFilterSource,
} from "@/lib/globalFilter";
import { buildVmScopeJoinKeys } from "@/lib/vmScope";
import type { GlobalFilterField, GlobalFilterGroup, NormalizedVm, SheetRow } from "@/domain/models/types";

const STALE_MS = 5 * 60 * 1000;
// Muss staleTime entsprechen — siehe RAW_QUERY_GC_MS in useActiveSnapshots.ts.
const RAW_QUERY_GC_MS = STALE_MS;

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
    const vcenterIdSet = new Set(filters.vcenterIds);
    const filteredSnapshots = filters.vcenterIds.length
      ? snapshots.filter((snapshot) => vcenterIdSet.has(snapshot.vcenterId))
      : snapshots;

    // Pro vCenter existiert nur ein Stand; die Reduktion je vcenterId ist defensiv,
    // falls doch mehrere vorhanden sind, gewinnt der neueste Export.
    const latestByVcenter = new Map<string, { id: string; ts: string }>();
    for (const snapshot of filteredSnapshots) {
      const existing = latestByVcenter.get(snapshot.vcenterId);
      if (!existing || snapshot.exportTs > existing.ts) {
        latestByVcenter.set(snapshot.vcenterId, { id: snapshot.snapshotId, ts: snapshot.exportTs });
      }
    }

    return [...latestByVcenter.values()].map((entry) => entry.id);
  }, [filters.vcenterIds, snapshots]);

  const { data: allVms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds),
    enabled: enabled && activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const hasActiveFilter = hasGlobalFilterDefinition(filters.globalFilter);

  const normalizedVmNames = useMemo(
    () => {
      const names = new Set<string>();
      for (const vm of allVms) {
        const trimmed = vm.vmName.trim();
        if (trimmed) names.add(trimmed);
      }
      return [...names].sort();
    },
    [allVms],
  );

  const { data: techInfoLatest = [] } = useQuery({
    queryKey: ["techInfoLatestByVmNames", normalizedVmNames],
    queryFn: () => getTechInfoLatestByVmNames(normalizedVmNames),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });

  const { data: techInfoClientLatest = [] } = useQuery({
    queryKey: ["techInfoClientLatestByClientNames", normalizedVmNames],
    queryFn: () => getTechInfoClientLatestByClientNames(normalizedVmNames),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });

  const referencedRawSources = useMemo(
    () => collectReferencedRawFilterSources(filters.globalFilter, previewFilter),
    [filters.globalFilter, previewFilter],
  );

  const referencedRawSourceList = useMemo(
    () => RAW_VM_FILTER_SOURCES.filter((source) => referencedRawSources.has(source)),
    [referencedRawSources],
  );

  const shouldLoadAllRawFieldNames = enabled && activeSnapshotIds.length > 0 && previewFilter !== undefined;

  const rawFieldNameSourceList = shouldLoadAllRawFieldNames ? RAW_VM_FILTER_SOURCES : referencedRawSourceList;

  const rawFieldNameQueryResults = useQueries({
    queries: rawFieldNameSourceList.map((source) => ({
      queryKey: ["globalVmFilterRawSheetFields", source, activeSnapshotIds],
      queryFn: () => getRawSheetFieldNames(activeSnapshotIds, source),
      enabled: enabled && activeSnapshotIds.length > 0,
      staleTime: STALE_MS,
    })),
  });

  const rawQueryResults = useQueries({
    queries: referencedRawSourceList.map((source) => ({
      queryKey: ["globalVmFilterRawSheet", source, activeSnapshotIds],
      queryFn: () => getRawSheetRows(activeSnapshotIds, source),
      enabled: enabled && activeSnapshotIds.length > 0,
      staleTime: STALE_MS,
      gcTime: RAW_QUERY_GC_MS,
    })),
  });

  const rawFieldNamesBySource = useMemo(
    () =>
      rawFieldNameSourceList.reduce<Partial<Record<VmRawFilterSource, string[]>>>((acc, source, index) => {
        acc[source] = (rawFieldNameQueryResults[index]?.data as string[] | undefined) ?? [];
        return acc;
      }, {}),
    [rawFieldNameQueryResults, rawFieldNameSourceList],
  );

  const rawRowsBySource = useMemo(
    () =>
      referencedRawSourceList.reduce<Partial<Record<VmRawFilterSource, SheetRow[]>>>((acc, source, index) => {
        acc[source] = (rawQueryResults[index]?.data as SheetRow[] | undefined) ?? [];
        return acc;
      }, {}),
    [rawQueryResults, referencedRawSourceList],
  );

  const contexts = useMemo(() => {
    const techInfoByVmName = new Map(techInfoLatest.map((entry) => [entry.vmNameNorm, entry]));
    const techInfoClientByClientName = new Map(techInfoClientLatest.map((entry) => [entry.clientNameNorm, entry]));
    const rowsBySourceAndJoinKey = RAW_VM_FILTER_SOURCES.reduce<Record<VmRawFilterSource, Map<string, SheetRow[]>>>(
      (acc, source) => {
        const grouped = new Map<string, SheetRow[]>();
        for (const row of rawRowsBySource[source] ?? []) {
          const joinKey = buildVmJoinKey(row.snapshotId, String(row.data["VM"] ?? ""));
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
        techInfoClient: techInfoClientByClientName.get(vm.vmName.trim().toLowerCase()) ?? null,
        rawRowsBySource: perSource,
      };
    });
  }, [allVms, rawRowsBySource, techInfoLatest, techInfoClientLatest]);

  const scopedVmJoinKeys = useMemo(
    () =>
      buildVmScopeJoinKeys(allVms, {
        vmNameList: filters.vmNameList,
        vmPowerScope: filters.vmPowerScope,
        excludeVclsVms: filters.excludeVclsVms,
      }),
    [allVms, filters.excludeVclsVms, filters.vmNameList, filters.vmPowerScope],
  );

  const scopedContexts = useMemo(() => {
    if (!scopedVmJoinKeys) return contexts;
    return contexts.filter((entry) => scopedVmJoinKeys.has(buildVmJoinKey(entry.vm.snapshotId, entry.vm.vmName)));
  }, [contexts, scopedVmJoinKeys]);

  const fields = useMemo(
    () => buildGlobalFilterFields(allVms, techInfoLatest, techInfoClientLatest, rawRowsBySource, rawFieldNamesBySource),
    [allVms, rawFieldNamesBySource, rawRowsBySource, techInfoLatest, techInfoClientLatest],
  );

  const matchingVmKeys = useMemo(() => {
    if (!hasActiveFilter) return null;
    const keys = new Set<string>();
    for (const entry of scopedContexts) {
      if (evaluateGlobalFilter(filters.globalFilter, entry, fields)) {
        keys.add(entry.vm.vmKey);
      }
    }
    return keys;
  }, [scopedContexts, fields, filters.globalFilter, hasActiveFilter]);

  const matchingVmJoinKeys = useMemo(() => {
    if (!hasActiveFilter) return scopedVmJoinKeys;
    if (!matchingVmKeys) return scopedVmJoinKeys;
    const keys = new Set<string>();
    for (const entry of scopedContexts) {
      if (matchingVmKeys.has(entry.vm.vmKey)) {
        keys.add(buildVmJoinKey(entry.vm.snapshotId, entry.vm.vmName));
      }
    }
    return keys;
  }, [hasActiveFilter, matchingVmKeys, scopedContexts, scopedVmJoinKeys]);

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
    if (!hasGlobalFilterDefinition(previewFilter)) return scopedContexts.length;
    return scopedContexts.filter((entry) => evaluateGlobalFilter(previewFilter, entry, fields)).length;
  }, [scopedContexts, fields, previewFilter]);

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
