import { useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
  GlobalWorkloadClassProfile,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  VropsTimeSeriesImport,
} from "@/domain/models/types";
import {
  buildGlobalWorkloadClassAverages,
  DEFAULT_FILL_UP_WORKLOAD_PROFILES,
  seedFillUpWorkloadProfilesWithGlobalAverages,
} from "@/domain/services/fillUpPlanningService";
import { buildFillUpPlanningResultsInWorker } from "@/domain/services/fillUpPlanningWorkerService";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";

export const VROPS_TIMESERIES_IMPORTS_QUERY_KEY = ["vropsTimeSeriesImports"] as const;

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

/**
 * Die gemessenen HIGH/STD-Durchschnitte liegen zusätzlich unter eigenem Key, damit
 * `FillUpPlanningPanel` seine Profile schon im ersten Render damit vorbelegen kann. Ohne das würde
 * das Panel zuerst mit den Standardwerten rechnen lassen und die vorberechnete Auswertung verfehlen.
 */
export function buildFillUpGlobalWorkloadProfilesQueryKey(importId: string | undefined) {
  return ["fillUpGlobalWorkloadClassProfiles", importId] as const;
}

/**
 * Liefert die Profile, mit denen das Panel starten muss, damit es die vorberechnete Auswertung des
 * neuesten vROps-Imports trifft. `null`, solange kein Vorladen gelaufen ist oder die Durchschnitte
 * nicht verwertbar sind – dann gelten die Standardprofile.
 */
export function readPreloadedFillUpWorkloadProfiles(queryClient: QueryClient): FillUpWorkloadProfile[] | null {
  const newestImport = queryClient.getQueryData<VropsTimeSeriesImport[]>(VROPS_TIMESERIES_IMPORTS_QUERY_KEY)?.[0];
  if (!newestImport) return null;
  const globalProfiles = queryClient.getQueryData<GlobalWorkloadClassProfile[]>(
    buildFillUpGlobalWorkloadProfilesQueryKey(newestImport.id),
  );
  if (!globalProfiles) return null;
  return seedFillUpWorkloadProfilesWithGlobalAverages(DEFAULT_FILL_UP_WORKLOAD_PROFILES, globalProfiles);
}

export function useFillUpPlanning(
  importId: string | null,
  profiles: readonly FillUpWorkloadProfile[],
  workloadMix: FillUpWorkloadMix | undefined,
  includeN2: boolean,
  cpuDemandConcurrencyPct: number,
) {
  const queryClient = useQueryClient();
  const importsQuery = useQuery({ queryKey: VROPS_TIMESERIES_IMPORTS_QUERY_KEY, queryFn: getVropsTimeSeriesImports, staleTime: 30_000 });
  const selectedImport = useMemo(() => {
    const imports = importsQuery.data ?? [];
    if (importId !== null) return imports.find((entry) => entry.id === importId) ?? null;
    return imports[0] ?? null;
  }, [importId, importsQuery.data]);
  const policies = useCapacityPolicies();
  const calculationQuery = useQuery({
    queryKey: buildFillUpPlanningQueryKey(selectedImport?.id, policies.policies, policies.assignments, profiles, workloadMix, includeN2, cpuDemandConcurrencyPct),
    enabled: Boolean(selectedImport && policies.policies.length > 0),
    // Der HIGH/STD-Seeding-Effekt in FillUpPlanningPanel ersetzt die Standardprofile durch die
    // gemessenen Durchschnitte, sobald diese vorliegen – das ändert den Query-Key und würde ohne
    // `placeholderData` Clustervergleich und beobachtete VM-Profile für die Dauer der (nicht
    // vorberechenbaren) Neuberechnung leerlaufen lassen statt weiterhin den letzten Stand zu zeigen.
    placeholderData: keepPreviousData,
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
      // Auch ohne Vorladen liegen die Durchschnitte damit ab dem ersten Besuch unter ihrem eigenen Key:
      // Ein erneutes Öffnen der Seite startet dann direkt mit den vorbelegten Profilen.
      queryClient.setQueryData(buildFillUpGlobalWorkloadProfilesQueryKey(importMeta.id), globalWorkloadClassProfiles);
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
