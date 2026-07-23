import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds, getRawSheetRows, getAllTechInfoLatest, getAllTechInfoClientLatest, getAllCdpLatest, getAllIpamLatest, getAllEramonIfaceLatest, getAllEramonL2Latest } from "@/data/db";
import { buildPortAuditRows, buildCdpMacRows, buildL2DiscoveryRows } from "@/lib/networkAudit";
import { buildHostDataQualityRows } from "@/lib/hostDataQualityAudit";
import { useFilterState } from "@/hooks/useFilterState";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { buildVmJoinKey, hasGlobalFilterDefinition } from "@/lib/globalFilter";
import { applyVmScopeToVms } from "@/lib/vmScope";
import { timeQuery } from "@/lib/queryTiming";
import { QUERY_CACHE_DURATION_MS, RAW_QUERY_GC_MS } from "@/lib/queryCache";
import type {
  NormalizedVm, NormalizedHost, NormalizedCluster,
  NormalizedDatastore, NormalizedSnapshot, NormalizedHealth,
  TechInfoLatest,
} from "@/domain/models/types";

// Shared staleTime: avoid refetching unchanged data on every page switch
const STALE_MS = QUERY_CACHE_DURATION_MS;

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

  const allSnapshotIds = useMemo(() => snapshots.map((snapshot) => snapshot.snapshotId), [snapshots]);

  return { snapshots, allSnapshotIds, activeSnapshotIds, filters, snapshotsLoading };
}

function filterBySnapshotIds<T extends { snapshotId: string }>(rows: T[], snapshotIds: string[]): T[] {
  if (rows.length === 0 || snapshotIds.length === 0) return [];
  const snapshotIdSet = new Set(snapshotIds);
  return rows.filter((row) => snapshotIdSet.has(row.snapshotId));
}

export function useBaseVms(enabled = true) {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const { data: importedVms = [], isLoading } = useQuery({
    queryKey: ["vms", allSnapshotIds],
    queryFn: () => timeQuery("vms", () => getBySnapshotIds<NormalizedVm>("entities_vm", allSnapshotIds)),
    enabled: enabled && allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const vms = useMemo(
    () => filterBySnapshotIds(importedVms, activeSnapshotIds),
    [activeSnapshotIds, importedVms],
  );

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
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const query = useQuery({
    queryKey: ["hosts", allSnapshotIds],
    queryFn: () => timeQuery("hosts", () => getBySnapshotIds<NormalizedHost>("entities_host", allSnapshotIds)),
    enabled: allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => filterBySnapshotIds(query.data ?? [], activeSnapshotIds), [activeSnapshotIds, query.data]);
  return { ...query, data };
}

export function useClusters() {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const query = useQuery({
    queryKey: ["clusters", allSnapshotIds],
    queryFn: () => timeQuery("clusters", () => getBySnapshotIds<NormalizedCluster>("entities_cluster", allSnapshotIds)),
    enabled: allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => filterBySnapshotIds(query.data ?? [], activeSnapshotIds), [activeSnapshotIds, query.data]);
  return { ...query, data };
}

export function useDatastores() {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const query = useQuery({
    queryKey: ["datastores", allSnapshotIds],
    queryFn: () => timeQuery("datastores", () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", allSnapshotIds)),
    enabled: allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => filterBySnapshotIds(query.data ?? [], activeSnapshotIds), [activeSnapshotIds, query.data]);
  return { ...query, data };
}

export function useVmSnapshots() {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const query = useQuery({
    queryKey: ["vmSnapshots", allSnapshotIds],
    queryFn: () => timeQuery("vmSnapshots", () => getBySnapshotIds<NormalizedSnapshot>("entities_snapshot", allSnapshotIds)),
    enabled: allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => filterBySnapshotIds(query.data ?? [], activeSnapshotIds), [activeSnapshotIds, query.data]);
  return { ...query, data };
}

export function useHealthEvents() {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const { matchingVmJoinKeys } = useGlobalVmFilterEngine();
  const query = useQuery({
    queryKey: ["health", allSnapshotIds],
    queryFn: () => timeQuery("health", () => getBySnapshotIds<NormalizedHealth>("entities_health", allSnapshotIds)),
    enabled: allSnapshotIds.length > 0,
    staleTime: STALE_MS,
  });

  const filteredData = useMemo(() => {
    const events = filterBySnapshotIds(query.data ?? [], activeSnapshotIds);
    if (!matchingVmJoinKeys) return events;
    return events.filter((event) =>
      matchingVmJoinKeys.has(buildVmJoinKey(event.snapshotId, String(event.entity ?? ""))),
    );
  }, [activeSnapshotIds, matchingVmJoinKeys, query.data]);

  return { ...query, data: filteredData };
}

export function useRawSheet(sheetName: string, enabled = true) {
  const { allSnapshotIds, activeSnapshotIds } = useActiveSnapshotIds();
  const query = useQuery({
    queryKey: ["rawSheet", sheetName, allSnapshotIds],
    queryFn: () => timeQuery(`rawSheet/${sheetName}`, () => getRawSheetRows(allSnapshotIds, sheetName)),
    enabled: allSnapshotIds.length > 0 && enabled,
    staleTime: STALE_MS,
    gcTime: RAW_QUERY_GC_MS,
  });
  const data = useMemo(() => filterBySnapshotIds(query.data ?? [], activeSnapshotIds), [activeSnapshotIds, query.data]);
  return { ...query, data };
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

  const query = useQuery({
    queryKey: ["techInfoLatestAll"],
    queryFn: () => timeQuery("techInfoLatestAll", getAllTechInfoLatest),
    enabled: enabled && normalizedVmNames.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => {
    const nameSet = new Set(normalizedVmNames.map((name) => name.toLocaleLowerCase("de-DE")));
    return (query.data ?? []).filter((entry) => nameSet.has(entry.vmNameNorm));
  }, [normalizedVmNames, query.data]);
  return { ...query, data };
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

  const query = useQuery({
    queryKey: ["techInfoClientLatestAll"],
    queryFn: () => timeQuery("techInfoClientLatestAll", getAllTechInfoClientLatest),
    enabled: enabled && normalizedClientNames.length > 0,
    staleTime: STALE_MS,
  });
  const data = useMemo(() => {
    const nameSet = new Set(normalizedClientNames.map((name) => name.toLocaleLowerCase("de-DE")));
    return (query.data ?? []).filter((entry) => nameSet.has(entry.clientNameNorm));
  }, [normalizedClientNames, query.data]);
  return { ...query, data };
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

export function useAllEramonIfaceLatest() {
  return useQuery({
    queryKey: ["eramonIfaceLatestAll"],
    queryFn: getAllEramonIfaceLatest,
    staleTime: STALE_MS,
  });
}

export function useAllEramonL2Latest() {
  return useQuery({
    queryKey: ["eramonL2LatestAll"],
    queryFn: getAllEramonL2Latest,
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

export function useNetworkAudit() {
  const { data: eramonIfaceRows = [], isLoading: eramonIfaceLoading } = useAllEramonIfaceLatest();
  const { data: l2Rows = [], isLoading: l2Loading } = useAllEramonL2Latest();
  const { data: cdpRows = [], isLoading: cdpLoading } = useAllCdpLatest();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: techInfo = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const { data: ipam = [], isLoading: ipamLoading } = useAllIpamLatest();

  const rows = useMemo(
    () => buildPortAuditRows({ eramonIfaceRows, cdpRows, hosts, techInfo, ipam }),
    [eramonIfaceRows, cdpRows, hosts, techInfo, ipam],
  );
  const hostQuality = useMemo(
    () => buildHostDataQualityRows({ hosts, techInfo, ipam }),
    [hosts, techInfo, ipam],
  );
  const cdpMacRows = useMemo(
    () => buildCdpMacRows({ cdpRows, l2Rows }),
    [cdpRows, l2Rows],
  );
  const l2DiscoveryRows = useMemo(
    () => buildL2DiscoveryRows({ l2Rows, cdpRows, ipam }),
    [l2Rows, cdpRows, ipam],
  );

  return {
    rows,
    hostQuality,
    cdpMacRows,
    l2DiscoveryRows,
    isLoading: eramonIfaceLoading || l2Loading || cdpLoading || hostsLoading || techInfoLoading || ipamLoading,
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
