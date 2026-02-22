import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshots, getBySnapshotIds, getRawSheetRows } from "@/data/db";
import { useFilterState } from "@/hooks/useFilterState";
import type {
  NormalizedVm, NormalizedHost, NormalizedCluster,
  NormalizedDatastore, NormalizedSnapshot, NormalizedHealth,
  SheetRow,
} from "@/domain/models/types";

export function useActiveSnapshotIds() {
  const { filters } = useFilterState();
  const { data: snapshots = [] } = useQuery({ queryKey: ["snapshots"], queryFn: getSnapshots });

  const activeSnapshotIds = useMemo(() => {
    if (filters.snapshotIds.length > 0) return filters.snapshotIds;
    const latestMap = new Map<string, { id: string; ts: string }>();
    const filtered = filters.vcenterIds.length
      ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId))
      : snapshots;
    for (const s of filtered) {
      const e = latestMap.get(s.vcenterId);
      if (!e || s.exportTs > e.ts) latestMap.set(s.vcenterId, { id: s.snapshotId, ts: s.exportTs });
    }
    return [...latestMap.values()].map((v) => v.id);
  }, [snapshots, filters.snapshotIds, filters.vcenterIds]);

  return { snapshots, activeSnapshotIds, filters };
}

export function useVms() {
  const { activeSnapshotIds, filters } = useActiveSnapshotIds();
  const { data: vms = [] } = useQuery({
    queryKey: ["vms", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedVm>("entities_vm", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });

  const filtered = useMemo(() => {
    let result = vms;
    if (filters.clusters.length) result = result.filter((v) => v.cluster && filters.clusters.includes(v.cluster));
    if (filters.hosts.length) result = result.filter((v) => v.host && filters.hosts.includes(v.host));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) =>
        v.vmName.toLowerCase().includes(q) ||
        v.host?.toLowerCase().includes(q) ||
        v.cluster?.toLowerCase().includes(q) ||
        v.osConfig?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [vms, filters]);

  return { vms: filtered, allVms: vms };
}

export function useHosts() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["hosts", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHost>("entities_host", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
}

export function useClusters() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["clusters", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedCluster>("entities_cluster", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
}

export function useDatastores() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["datastores", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedDatastore>("entities_datastore", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
}

export function useVmSnapshots() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["vmSnapshots", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedSnapshot>("entities_snapshot", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
}

export function useHealthEvents() {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["health", activeSnapshotIds],
    queryFn: () => getBySnapshotIds<NormalizedHealth>("entities_health", activeSnapshotIds),
    enabled: activeSnapshotIds.length > 0,
  });
}

export function useRawSheet(sheetName: string) {
  const { activeSnapshotIds } = useActiveSnapshotIds();
  return useQuery({
    queryKey: ["rawSheet", sheetName, activeSnapshotIds],
    queryFn: () => getRawSheetRows(activeSnapshotIds, sheetName),
    enabled: activeSnapshotIds.length > 0,
  });
}
