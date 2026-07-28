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
import { buildFillUpPlanningResultsInWorker } from "@/domain/services/fillUpPlanningWorkerService";
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
  const calculationQuery = useQuery({
    queryKey: ["fillUpPlanningCalculation", selectedImport?.id, payloadQuery.dataUpdatedAt, policies.policies, policies.assignments, profiles, workloadMix, includeN2],
    enabled: Boolean(selectedImport && payloadQuery.data && policies.policies.length > 0),
    queryFn: ({ signal }) => buildFillUpPlanningResultsInWorker({
      import: selectedImport,
      ...payloadQuery.data,
      policies: policies.policies,
      assignments: policies.assignments,
      profiles,
      workloadMix,
      includeN2,
    }, signal),
  });
  const results = calculationQuery.data ?? [];

  return {
    imports: importsQuery.data ?? [],
    selectedImport,
    results,
    isLoading: importsQuery.isLoading || payloadQuery.isLoading || policies.isLoading || calculationQuery.isLoading,
    isCalculating: calculationQuery.isFetching,
    isError: importsQuery.isError || payloadQuery.isError || policies.isError || calculationQuery.isError,
    error: importsQuery.error ?? payloadQuery.error ?? policies.error ?? calculationQuery.error,
  };
}
