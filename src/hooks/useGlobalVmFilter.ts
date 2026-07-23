import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getAllTechInfoClientLatest, getAllTechInfoLatest, getBySnapshotIds, getRawSheetFieldNamesBySnapshot, getRawSheetRows, getSnapshots } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import {
  buildGlobalFilterFields,
  buildVmJoinKey,
  collectRawFieldNamesForSnapshots,
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
import { QUERY_CACHE_DURATION_MS, RAW_QUERY_GC_MS } from "@/lib/queryCache";

const STALE_MS = QUERY_CACHE_DURATION_MS;

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

  const allSnapshotIds = useMemo(() => snapshots.map((snapshot) => snapshot.snapshotId), [snapshots]);

  const { data: importedVms = [] } = useQuery({
    queryKey: ["vms", allSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", allSnapshotIds),
    enabled: enabled && allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const allVms = useMemo(() => {
    const activeSnapshotIdSet = new Set(activeSnapshotIds);
    return importedVms.filter((vm) => activeSnapshotIdSet.has(vm.snapshotId));
  }, [activeSnapshotIds, importedVms]);
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

  const { data: allTechInfoLatest = [] } = useQuery({
    queryKey: ["techInfoLatestAll"],
    queryFn: getAllTechInfoLatest,
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });
  const techInfoLatest = useMemo(() => {
    const nameSet = new Set(normalizedVmNames.map((name) => name.toLocaleLowerCase("de-DE")));
    return allTechInfoLatest.filter((entry) => nameSet.has(entry.vmNameNorm));
  }, [allTechInfoLatest, normalizedVmNames]);

  const { data: allTechInfoClientLatest = [] } = useQuery({
    queryKey: ["techInfoClientLatestAll"],
    queryFn: getAllTechInfoClientLatest,
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });
  const techInfoClientLatest = useMemo(() => {
    const nameSet = new Set(normalizedVmNames.map((name) => name.toLocaleLowerCase("de-DE")));
    return allTechInfoClientLatest.filter((entry) => nameSet.has(entry.clientNameNorm));
  }, [allTechInfoClientLatest, normalizedVmNames]);

  const referencedRawSources = useMemo(
    () => collectReferencedRawFilterSources(filters.globalFilter, previewFilter),
    [filters.globalFilter, previewFilter],
  );

  const referencedRawSourceList = useMemo(
    () => RAW_VM_FILTER_SOURCES.filter((source) => referencedRawSources.has(source)),
    [referencedRawSources],
  );

  const shouldLoadAllRawFieldNames = enabled && allSnapshotIds.length > 0 && previewFilter !== undefined;

  const rawFieldNameSourceList = shouldLoadAllRawFieldNames ? RAW_VM_FILTER_SOURCES : referencedRawSourceList;

  const rawFieldNameQueryResults = useQueries({
    queries: rawFieldNameSourceList.map((source) => ({
      queryKey: ["rawSheetFieldsBySnapshot", source, allSnapshotIds],
      queryFn: () => getRawSheetFieldNamesBySnapshot(allSnapshotIds, source),
      enabled: enabled && allSnapshotIds.length > 0,
      staleTime: STALE_MS,
    })),
  });

  const rawQueryResults = useQueries({
    queries: referencedRawSourceList.map((source) => ({
      queryKey: ["rawSheet", source, allSnapshotIds],
      queryFn: () => getRawSheetRows(allSnapshotIds, source),
      enabled: enabled && allSnapshotIds.length > 0,
      staleTime: STALE_MS,
      gcTime: RAW_QUERY_GC_MS,
    })),
  });

  const rawFieldNamesBySource = useMemo(
    () =>
      rawFieldNameSourceList.reduce<Partial<Record<VmRawFilterSource, string[]>>>((acc, source, index) => {
        const bySnapshot = (rawFieldNameQueryResults[index]?.data as Record<string, string[]> | undefined) ?? {};
        acc[source] = collectRawFieldNamesForSnapshots(bySnapshot, activeSnapshotIds);
        return acc;
      }, {}),
    [activeSnapshotIds, rawFieldNameQueryResults, rawFieldNameSourceList],
  );

  const rawRowsBySource = useMemo(
    () =>
      referencedRawSourceList.reduce<Partial<Record<VmRawFilterSource, SheetRow[]>>>((acc, source, index) => {
        const rows = (rawQueryResults[index]?.data as SheetRow[] | undefined) ?? [];
        const activeSnapshotIdSet = new Set(activeSnapshotIds);
        acc[source] = rows.filter((row) => activeSnapshotIdSet.has(row.snapshotId));
        return acc;
      }, {}),
    [activeSnapshotIds, rawQueryResults, referencedRawSourceList],
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
