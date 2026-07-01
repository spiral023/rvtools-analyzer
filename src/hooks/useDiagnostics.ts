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
    const cacheCounts = new Map<string, number>();
    for (const q of queryClient.getQueryCache().getAll()) {
      const key = String(Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey);
      const data = q.state.data;
      const count = Array.isArray(data) ? data.length : data ? 1 : 0;
      cacheCounts.set(key, (cacheCounts.get(key) ?? 0) + count);
    }
    const cache: CacheDiagnostics[] = [...cacheCounts.entries()]
      .map(([queryKey, entryCount]) => ({ queryKey, entryCount }))
      .sort((a, b) => b.entryCount - a.entryCount);

    return { snapshots, stores, storage, sampleQuery, memory, cache };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["diagnostics", fetchTrigger],
    queryFn: collect,
    enabled,
    staleTime: Infinity,
    gcTime: 0,
  });

  const refresh = useCallback(() => {
    setFetchTrigger((n) => n + 1);
  }, []);

  return { data: query.data, isFetching: query.isFetching, refresh };
}
