import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSnapshots,
  getStoreDiagnostics,
  getStorageEstimate,
  timeSampleVmQuery,
  type StoreDiagnostics,
  type StorageEstimateResult,
  type SampleQueryTiming,
} from "@/data/db";
import type { SnapshotMeta } from "@/domain/models/types";

export interface MemoryDiagnostics {
  supported: boolean;
  usedJSHeapSizeBytes: number | null;
  totalJSHeapSizeBytes: number | null;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

export function getMemoryDiagnostics(perf: Performance): MemoryDiagnostics {
  const memory = (perf as Performance & { memory?: PerformanceMemory }).memory;
  if (!memory) {
    return { supported: false, usedJSHeapSizeBytes: null, totalJSHeapSizeBytes: null };
  }
  return {
    supported: true,
    usedJSHeapSizeBytes: memory.usedJSHeapSize,
    totalJSHeapSizeBytes: memory.totalJSHeapSize,
  };
}

export interface CacheDiagnostics {
  queryKey: string;
  entryCount: number;
}

const TRACKED_QUERY_KEYS = ["vms", "hosts", "clusters", "datastores", "vmSnapshots", "health", "techInfoLatestByVmNames"];

export interface DiagnosticsResult {
  snapshots: SnapshotMeta[];
  stores: StoreDiagnostics[];
  storage: StorageEstimateResult;
  sampleQuery: SampleQueryTiming;
  memory: MemoryDiagnostics;
  cache: CacheDiagnostics[];
}

export function useDiagnostics(enabled: boolean) {
  const queryClient = useQueryClient();
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const collect = useCallback(async (): Promise<DiagnosticsResult> => {
    const [snapshots, stores, storage, sampleQuery] = await Promise.all([
      getSnapshots(),
      getStoreDiagnostics(),
      getStorageEstimate(),
      timeSampleVmQuery(),
    ]);
    const memory = getMemoryDiagnostics(performance);
    const cache: CacheDiagnostics[] = TRACKED_QUERY_KEYS.map((key) => {
      const queries = queryClient.getQueryCache().findAll({ queryKey: [key] });
      const entryCount = queries.reduce((sum, q) => {
        const data = q.state.data;
        return sum + (Array.isArray(data) ? data.length : data ? 1 : 0);
      }, 0);
      return { queryKey: key, entryCount };
    });

    return { snapshots, stores, storage, sampleQuery, memory, cache };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["diagnostics", fetchTrigger],
    queryFn: collect,
    enabled,
    staleTime: Infinity,
    gcTime: 0,
  });

  const refetchManually = useCallback(() => {
    setFetchTrigger((n) => n + 1);
  }, []);

  return { data: query.data, isFetching: query.isFetching, refetch: refetchManually };
}
