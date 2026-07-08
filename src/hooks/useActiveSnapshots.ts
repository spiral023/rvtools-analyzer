import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds, getRawSheetRows, getTechInfoLatestByVmNames, getAllTechInfoClientLatest } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { buildVmJoinKey, hasGlobalFilterDefinition } from "@/lib/globalFilter";
import { applyVmScopeToVms } from "@/lib/vmScope";
import type {
  NormalizedVm, NormalizedHost, NormalizedCluster,
  NormalizedDatastore, NormalizedSnapshot, NormalizedHealth,
  TechInfoLatest,
} from "@/domain/models/types";

// Shared staleTime: avoid refetching unchanged data on every page switch
const STALE_MS = 5 * 60 * 1000; // 5 min
const RAW_QUERY_GC_MS = 10 * 1000;

export function useActiveSnapshotIds() {
  const { filters } = useFilterState();
  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: getSnapshots,
    staleTime: STALE_MS,
  });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const vcenterIdSet = new Set(filters.vcenterIds);
    const filtered = filters.vcenterIds.length
      ? snapshots.filter((s) => vcenterIdSet.has(s.vcenterId))
      : snapshots;
    for (const s of filtered) {
      const e = latestMap.get(s.vcenterId);
      if (!e || s.exportTs > e.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters.snapshotIds, filters.vcenterIds]);

  return { snapshots, activeSnapshotIds, filters };
}

export function useBaseVms(enabled = true) {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { data: vms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds),
    enabled: enabled && activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });

  return { vms, allVms: vms };
}

export function useVms() {
  const { filters } = useActiveSnapshotIds();
  const { allVms: vms } = useBaseVms();
  const { hasActiveFilter, matchingVmKeys } = useGlobalVmFilterEngine(hasGlobalFilterDefinition(filters.globalFilter));

  const filtered = useMemo(() => {
    let result = vms;
    if (hasActiveFilter && matchingVmKeys) {
      result = result.filter((vm) => matchingVmKeys.has(vm.vmKey));
    }
    result = applyVmScopeToVms(result, filters);
    if (filters.clusters.length) {
      const clusterSet = new Set(filters.clusters);
      result = result.filter((v) => v.cluster && clusterSet.has(v.cluster));
    }
    if (filters.hosts.length) {
      const hostSet = new Set(filters.hosts);
      result = result.filter((v) => v.host && hostSet.has(v.host));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) =>
        v.vmName.toLowerCase().includes(q) ||
        v.host?.toLowerCase().includes(q) ||
        v.cluster?.toLowerCase().includes(q) ||
        v.osConfig?.toLowerCase().includes(q) ||
        v.osTools?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [filters, hasActiveFilter, matchingVmKeys, vms]);

  return { vms: filtered, allVms: vms };
}

export function useHosts() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["hosts", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHost>("entities_host", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useClusters() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["clusters", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedCluster>("entities_cluster", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useDatastores() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["datastores", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useVmSnapshots() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["vmSnapshots", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedSnapshot>("entities_snapshot", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useHealthEvents() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const query = useQuery({
    queryKey: ["health", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHealth>("entities_health", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });

  const filteredData = useMemo(() => {
    const events = query.data ?? [];
    if (!matchingVmJoinKeys) return events;
    return events.filter((event) =>
      matchingVmJoinKeys.has(buildVmJoinKey(event.snapshotId, String(event.entity ?? ""))),
    );
  }, [matchingVmJoinKeys, query.data]);

  return { ...query, data: filteredData };
}

export function useRawSheet(sheetName: string, enabled = true) {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["rawSheet", sheetName, activeSnapshotIds],
    queryFn: () => getRawSheetRows(activeSnapshotIds, sheetName),
    enabled: activeSnapshotIds.length > 0 && enabled,
    staleTime: STALE_MS,
    gcTime: RAW_QUERY_GC_MS,
  });
}

export function useTechInfoLatestByVmNames(vmNames: string[], enabled = true) {
  const normalizedVmNames = useMemo(
    () => {
      const names = new Set<string>();
      for (const name of vmNames) {
        const trimmed = name.trim();
        if (trimmed) names.add(trimmed);
      }
      return [...names].sort();
    },
    [vmNames],
  );

  return useQuery({
    queryKey: ["techInfoLatestByVmNames", normalizedVmNames],
    queryFn: () => getTechInfoLatestByVmNames(normalizedVmNames),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });
}

export function useAllTechInfoClientLatest() {
  return useQuery({
    queryKey: ["techInfoClientLatestAll"],
    queryFn: getAllTechInfoClientLatest,
    staleTime: STALE_MS,
  });
}

export function useVmsWithTechInfo() {
  const { vms, allVms } = useVms();
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(vms.map((vm) => vm.vmName));

  const byVmName = useMemo(() => {
    const map = new Map<string, TechInfoLatest>();
    for (const entry of techInfoLatest) {
      map.set(entry.vmNameNorm, entry);
    }
    return map;
  }, [techInfoLatest]);

  const vmsWithTechInfo = useMemo(
    () =>
      vms.map((vm) => ({
        ...vm,
        techInfo: byVmName.get(vm.vmName.trim().toLowerCase()) ?? null,
      })),
    [vms, byVmName],
  );

  return { vmsWithTechInfo, vms, allVms, techInfoLatest };
}
