import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBySnapshotIds,
  getSnapshots,
  getVropsTimeSeriesChunks,
  getVropsTimeSeriesImports,
  getVropsTimeSeriesObjects,
  getVropsTimeSeriesSummaries,
} from "@/data/db";
import type { FillUpWorkloadMix, FillUpWorkloadProfile, NormalizedCluster, NormalizedHost, NormalizedVm } from "@/domain/models/types";
import { buildFillUpPlanningResults } from "@/domain/services/fillUpPlanningService";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";

export function useFillUpPlanning(
  importId: string | null,
  profiles: readonly FillUpWorkloadProfile[],
  workloadMix: FillUpWorkloadMix | undefined,
  includeN2: boolean,
) {
  const importsQuery = useQuery({ queryKey: ["vropsTimeSeriesImports"], queryFn: getVropsTimeSeriesImports, staleTime: 30_000 });
  const selectedImport = useMemo(() => (importsQuery.data ?? []).find((entry) => entry.id === importId) ?? null, [importId, importsQuery.data]);
  const payloadQuery = useQuery({
    queryKey: ["fillUpPlanningPayload", selectedImport?.id],
    enabled: Boolean(selectedImport),
    queryFn: async () => {
      const importMeta = selectedImport!;
      const [objects, chunks, summaries, snapshots, hosts, vms, clusters] = await Promise.all([
        getVropsTimeSeriesObjects(importMeta.id),
        getVropsTimeSeriesChunks(importMeta.id),
        getVropsTimeSeriesSummaries(importMeta.id),
        getSnapshots(),
        getBySnapshotIds<NormalizedHost>("entities_host", importMeta.rvtoolsSnapshotIds),
        getBySnapshotIds<NormalizedVm>("entities_vm", importMeta.rvtoolsSnapshotIds),
        getBySnapshotIds<NormalizedCluster>("entities_cluster", importMeta.rvtoolsSnapshotIds),
      ]);
      return { objects, chunks, summaries, snapshots, hosts, vms, clusters };
    },
  });
  const policies = useCapacityPolicies();
  const results = useMemo(() => {
    if (!selectedImport || !payloadQuery.data || policies.policies.length === 0) return [];
    return buildFillUpPlanningResults({
      import: selectedImport,
      ...payloadQuery.data,
      policies: policies.policies,
      assignments: policies.assignments,
      profiles,
      workloadMix,
      includeN2,
    });
  }, [includeN2, payloadQuery.data, policies.assignments, policies.policies, profiles, selectedImport, workloadMix]);

  return {
    imports: importsQuery.data ?? [],
    selectedImport,
    results,
    isLoading: importsQuery.isLoading || payloadQuery.isLoading || policies.isLoading,
    isError: importsQuery.isError || payloadQuery.isError || policies.isError,
    error: importsQuery.error ?? payloadQuery.error ?? policies.error,
  };
}
