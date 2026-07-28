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
import { buildGlobalWorkloadClassAverages } from "@/domain/services/fillUpPlanningService";
import { buildFillUpPlanningResultsInWorker } from "@/domain/services/fillUpPlanningWorkerService";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";

export function useFillUpPlanning(
  importId: string | null,
  profiles: readonly FillUpWorkloadProfile[],
  workloadMix: FillUpWorkloadMix | undefined,
  includeN2: boolean,
  cpuDemandConcurrencyPct: number,
) {
  const importsQuery = useQuery({ queryKey: ["vropsTimeSeriesImports"], queryFn: getVropsTimeSeriesImports, staleTime: 30_000 });
  const selectedImport = useMemo(() => {
    const imports = importsQuery.data ?? [];
    if (importId !== null) return imports.find((entry) => entry.id === importId) ?? null;
    return imports[0] ?? null;
  }, [importId, importsQuery.data]);
  const policies = useCapacityPolicies();
  const calculationQuery = useQuery({
    queryKey: ["fillUpPlanningCalculation", selectedImport?.id, policies.policies, policies.assignments, profiles, workloadMix, includeN2, cpuDemandConcurrencyPct],
    enabled: Boolean(selectedImport && policies.policies.length > 0),
    queryFn: async ({ signal }) => {
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
      // Muss vor dem Worker-Aufruf laufen: Dieser transferiert die Chunk-ArrayBuffer statt sie zu
      // kopieren, wodurch sie im Hauptthread anschließend detached und unlesbar sind.
      const globalWorkloadClassProfiles = buildGlobalWorkloadClassAverages({ objects, vms, chunks });
      const results = await buildFillUpPlanningResultsInWorker({
        import: importMeta,
        objects,
        chunks,
        summaries,
        snapshots,
        hosts,
        vms,
        clusters,
        policies: policies.policies,
        assignments: policies.assignments,
        profiles,
        workloadMix,
        includeN2,
        cpuDemandConcurrencyPct,
      }, signal);
      return { results, globalWorkloadClassProfiles };
    },
  });

  return {
    imports: importsQuery.data ?? [],
    selectedImport,
    results: calculationQuery.data?.results ?? [],
    globalWorkloadClassProfiles: calculationQuery.data?.globalWorkloadClassProfiles ?? [],
    isLoading: importsQuery.isLoading || policies.isLoading || calculationQuery.isLoading,
    isCalculating: calculationQuery.isFetching,
    isError: importsQuery.isError || policies.isError || calculationQuery.isError,
    error: importsQuery.error ?? policies.error ?? calculationQuery.error,
  };
}
