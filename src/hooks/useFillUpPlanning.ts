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
import type {
  CapacityPolicy,
  ClusterCapacityPolicyAssignment,
  FillUpWorkloadMix,
  FillUpWorkloadProfile,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
} from "@/domain/models/types";
import { buildGlobalWorkloadClassAverages } from "@/domain/services/fillUpPlanningService";
import { buildFillUpPlanningResultsInWorker } from "@/domain/services/fillUpPlanningWorkerService";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";

/**
 * Einzige Quelle für den Query-Key der Fill-Up-Berechnung. Ein vorab berechnetes Ergebnis (siehe
 * `preloadImportedData`) trifft nur, wenn dieser Key exakt reproduziert wird – daher hier zentral
 * statt an beiden Stellen dupliziert.
 */
export function buildFillUpPlanningQueryKey(
  importId: string | undefined,
  policies: readonly CapacityPolicy[],
  assignments: readonly ClusterCapacityPolicyAssignment[],
  profiles: readonly FillUpWorkloadProfile[],
  workloadMix: FillUpWorkloadMix | undefined,
  includeN2: boolean,
  cpuDemandConcurrencyPct: number,
) {
  return ["fillUpPlanningCalculation", importId, policies, assignments, profiles, workloadMix, includeN2, cpuDemandConcurrencyPct] as const;
}

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
    queryKey: buildFillUpPlanningQueryKey(selectedImport?.id, policies.policies, policies.assignments, profiles, workloadMix, includeN2, cpuDemandConcurrencyPct),
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
