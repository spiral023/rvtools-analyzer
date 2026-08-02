import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBySnapshotIds, getVropsTimeSeriesChunks, getVropsTimeSeriesImports, getVropsTimeSeriesObjects } from "@/data/db";
import type { NormalizedHost, NormalizedVm } from "@/domain/models/types";
import { buildVmWorkloadProfiles } from "@/domain/services/vmWorkloadProfileService";
import { findVropsTimeSeriesMetricHeader } from "@/domain/services/vropsTimeSeriesSchema";

/**
 * Lädt den ausgewählten vROps-Zeitreihenimport samt RVTools-Inventar und
 * leitet daraus VM-Auslastungsprofile ab. Bewusst unabhängig vom aktiven
 * Sitzungsfilter (vCenter-Auswahl): der Import bringt seine eigenen,
 * eingefrorenen Snapshot-IDs mit – analog zur Fill-Up-Planung.
 */
export function useVmWorkloadProfiles(importId: string | null, enabled = true) {
  const importsQuery = useQuery({ queryKey: ["vropsTimeSeriesImports"], queryFn: getVropsTimeSeriesImports, staleTime: 30_000, enabled });
  const selectedImport = useMemo(() => {
    if (!enabled) return null;
    const imports = importsQuery.data ?? [];
    if (importId !== null) return imports.find((entry) => entry.id === importId) ?? null;
    return imports[0] ?? null;
  }, [enabled, importId, importsQuery.data]);

  const memoryWorkloadMetrics = useMemo(() => {
    const vmFile = selectedImport?.files.find((file) => file.objectType === "vm");
    const headers = vmFile?.detectedColumns ?? [];
    return {
      hasAvg: Boolean(findVropsTimeSeriesMetricHeader(headers, "vmMemoryWorkloadAvgPct")),
      hasMax: Boolean(findVropsTimeSeriesMetricHeader(headers, "vmMemoryWorkloadMaxPct")),
    };
  }, [selectedImport]);

  const dataQuery = useQuery({
    queryKey: ["vmWorkloadProfiles", selectedImport?.id],
    enabled: enabled && Boolean(selectedImport),
    queryFn: async () => {
      const importMeta = selectedImport!;
      const [objects, chunks, vms, hosts] = await Promise.all([
        getVropsTimeSeriesObjects(importMeta.id),
        getVropsTimeSeriesChunks(importMeta.id),
        getBySnapshotIds<NormalizedVm>("entities_vm", importMeta.rvtoolsSnapshotIds),
        getBySnapshotIds<NormalizedHost>("entities_host", importMeta.rvtoolsSnapshotIds),
      ]);
      return {
        profiles: buildVmWorkloadProfiles({ import: importMeta, objects, chunks, vms, hosts }),
        hosts,
      };
    },
  });

  return {
    imports: importsQuery.data ?? [],
    selectedImport,
    hasMemoryWorkloadAvg: memoryWorkloadMetrics.hasAvg,
    hasMemoryWorkloadMax: memoryWorkloadMetrics.hasMax,
    profiles: dataQuery.data?.profiles ?? [],
    hosts: dataQuery.data?.hosts ?? [],
    isLoading: importsQuery.isLoading || dataQuery.isLoading,
    isCalculating: dataQuery.isFetching,
    isError: importsQuery.isError || dataQuery.isError,
    error: importsQuery.error ?? dataQuery.error,
  };
}
