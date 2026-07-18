import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds, getRawSheetRows, getTechInfoLatestByVmNames, getAllTechInfoLatest, getAllTechInfoClientLatest, getTechInfoClientLatestByClientNames, getAllCdpLatest, getAllIpamLatest, getAllSwitchLatest } from "@/data/db";
import { buildPortAuditRows } from "@/lib/networkAudit";
import { useFilterState } from "@/hooks/useFilterState";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { buildVmJoinKey, hasGlobalFilterDefinition } from "@/lib/globalFilter";
import { applyVmScopeToVms } from "@/lib/vmScope";
import { timeQuery } from "@/lib/queryTiming";
import type {
  NormalizedVm, NormalizedHost, NormalizedCluster,
  NormalizedDatastore, NormalizedSnapshot, NormalizedHealth,
  TechInfoLatest,
} from "@/domain/models/types";

// Shared staleTime: avoid refetching unchanged data on every page switch
const STALE_MS = 5 * 60 * 1000; // 5 min
// Muss staleTime entsprechen: ein kürzeres gcTime verwirft die großen Raw-Sheet-
// Arrays bereits beim Seitenwechsel, sodass jede Rückkehr sie komplett neu aus
// IndexedDB lädt und hydratisiert (30–90 s eingefrorene UI bei vielen Snapshots).
const RAW_QUERY_GC_MS = STALE_MS;

export function useActiveSnapshotIds() {
  const { filters } = useFilterState();
  const { data: snapshots = [], isPending: snapshotsLoading } = useQuery({
    queryKey: ["snapshots"],
    queryFn: getSnapshots,
    staleTime: STALE_MS,
  });

  const activeSnapshotIds = useMemo(() => {
    const currentVcenterIds = new Set(snapshots.map((snapshot) => snapshot.vcenterId));
    const selectedVcenterIds = filters.vcenterIds.filter((vcenterId) => currentVcenterIds.has(vcenterId));
    const vcenterIdSet = new Set(selectedVcenterIds);
    const filtered = selectedVcenterIds.length
      ? snapshots.filter((s) => vcenterIdSet.has(s.vcenterId))
      : snapshots;
    // Pro vCenter existiert nur ein Stand. Die Reduktion je vcenterId ist defensiv:
    // falls doch mehrere vorhanden sind, gewinnt der neueste Export.
    const latestByVcenter = new Map<string, { id: string; ts: string }>();
    for (const s of filtered) {
      const e = latestByVcenter.get(s.vcenterId);
      if (!e || s.exportTs > e.ts) latestByVcenter.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestByVcenter.values()].map((v) => v.id);
  }, [snapshots, filters.vcenterIds]);

  return { snapshots, activeSnapshotIds, filters, snapshotsLoading };
}

export function useBaseVms(enabled = true) {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { data: vms = [], isLoading } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => timeQuery("vms", () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds)),
    enabled: enabled && activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });

  return { vms, allVms: vms, isLoading };
}

export function useVms() {
  const { filters } = useActiveSnapshotIds();
  const { allVms: vms, isLoading } = useBaseVms();
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

  return { vms: filtered, allVms: vms, isLoading };
}

export function useHosts() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["hosts", activeSnapshotIds],
    queryFn: () => timeQuery("hosts", () => getBySnapshotIds<NormalizedHost>("entities_host", activeSnapshotIds)),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useClusters() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["clusters", activeSnapshotIds],
    queryFn: () => timeQuery("clusters", () => getBySnapshotIds<NormalizedCluster>("entities_cluster", activeSnapshotIds)),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useDatastores() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["datastores", activeSnapshotIds],
    queryFn: () => timeQuery("datastores", () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", activeSnapshotIds)),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useVmSnapshots() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["vmSnapshots", activeSnapshotIds],
    queryFn: () => timeQuery("vmSnapshots", () => getBySnapshotIds<NormalizedSnapshot>("entities_snapshot", activeSnapshotIds)),
    enabled: activeSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
}

export function useHealthEvents() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  const { matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const query = useQuery({
    queryKey: ["health", activeSnapshotIds],
    queryFn: () => timeQuery("health", () => getBySnapshotIds<NormalizedHealth>("entities_health", activeSnapshotIds)),
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
    queryFn: () => timeQuery(`rawSheet/${sheetName}`, () => getRawSheetRows(activeSnapshotIds, sheetName)),
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
    queryFn: () => timeQuery("techInfoLatestByVmNames", () => getTechInfoLatestByVmNames(normalizedVmNames)),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });
}

export function useTechInfoClientLatestByClientNames(clientNames: string[], enabled = true) {
  const normalizedClientNames = useMemo(
    () => {
      const names = new Set<string>();
      for (const name of clientNames) {
        const trimmed = name.trim();
        if (trimmed) names.add(trimmed);
      }
      return [...names].sort();
    },
    [clientNames],
  );

  return useQuery({
    queryKey: ["techInfoClientLatestByClientNames", normalizedClientNames],
    queryFn: () => timeQuery("techInfoClientLatestByClientNames", () => getTechInfoClientLatestByClientNames(normalizedClientNames)),
    enabled: enabled && normalizedClientNames.length > 0,
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

/** Alle zuletzt importierten Tech-Info-Zeilen – unabhängig vom aktiven RVTools-Snapshot-Scope. */
export function useAllTechInfoLatest() {
  return useQuery({
    queryKey: ["techInfoLatestAll"],
    queryFn: getAllTechInfoLatest,
    staleTime: STALE_MS,
  });
}

export function useAllCdpLatest() {
  return useQuery({
    queryKey: ["cdpLatestAll"],
    queryFn: getAllCdpLatest,
    staleTime: STALE_MS,
  });
}

export function useAllIpamLatest() {
  return useQuery({
    queryKey: ["ipamLatestAll"],
    queryFn: getAllIpamLatest,
    staleTime: STALE_MS,
  });
}

export function useAllSwitchLatest() {
  return useQuery({
    queryKey: ["switchLatestAll"],
    queryFn: getAllSwitchLatest,
    staleTime: STALE_MS,
  });
}

export function useNetworkAudit() {
  const { data: switchRows = [], isLoading: switchLoading } = useAllSwitchLatest();
  const { data: cdpRows = [], isLoading: cdpLoading } = useAllCdpLatest();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: techInfo = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const { data: ipam = [], isLoading: ipamLoading } = useAllIpamLatest();

  const rows = useMemo(
    () => buildPortAuditRows({ switchRows, cdpRows, hosts, techInfo, ipam }),
    [switchRows, cdpRows, hosts, techInfo, ipam],
  );

  return {
    rows,
    isLoading: switchLoading || cdpLoading || hostsLoading || techInfoLoading || ipamLoading,
  };
}

export function useVmsWithTechInfo() {
  const { vms, allVms, isLoading } = useVms();
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

  return { vmsWithTechInfo, vms, allVms, techInfoLatest, isLoading };
}
