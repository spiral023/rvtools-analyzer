import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVropsTimeSeriesChunks, getVropsTimeSeriesImports, getVropsTimeSeriesObjects } from "@/data/db";
import type { VropsTimeSeriesMetricKey, VropsTimeSeriesObjectType } from "@/domain/models/types";
import { buildHourGrid } from "@/domain/services/vmWorkloadProfileService";
import { readVropsTimeSeriesMetric } from "@/domain/services/vropsTimeSeriesSeriesReader";

export interface VropsObjectTrendPoint {
  timestampUtc: number;
  /** CPU-Demand in MHz; die primäre Kennzahl über alle drei Objekttypen hinweg. */
  cpuDemandMHz: number | null;
  /**
   * Höchster CPU-Demand innerhalb der Stunde, sofern die vROps-View ihn liefert.
   * Der Mittelwert allein glättet kurze Lastspitzen vollständig weg; erst mit
   * dieser Reihe wird im Chart sichtbar, wie stark eine VM innerhalb der Stunde
   * schwankt.
   */
  cpuDemandMaxMHz: number | null;
  /** VM: CPU-Ready in %; Host/Cluster: Memory-Utilization in MiB. */
  secondaryValue: number | null;
}

export interface UseVropsObjectSeriesInput {
  objectType: VropsTimeSeriesObjectType;
  /** VmKey/HostKey/ClusterKey des RVTools-Objekts; null solange dieses (noch) nicht auflösbar ist. */
  rvtoolsObjectKey: string | null;
  cpuCapacityMHz: number | null;
  secondaryCapacity: number | null;
}

const CPU_METRIC_BY_TYPE: Record<VropsTimeSeriesObjectType, VropsTimeSeriesMetricKey> = {
  vm: "vmCpuDemandAvgMHz",
  host: "hostCpuDemandAvgMHz",
  cluster: "clusterCpuDemandAvgMHz",
};

const SECONDARY_METRIC_BY_TYPE: Record<VropsTimeSeriesObjectType, VropsTimeSeriesMetricKey> = {
  vm: "vmCpuReadyMaxPct",
  host: "hostMemoryUtilizationAvgMiB",
  cluster: "clusterMemoryUtilizationAvgMiB",
};

/** Optional: fehlt die Spalte im Import, bleibt die Reihe leer und das Chart zeigt nur den Mittelwert. */
const CPU_MAX_METRIC_BY_TYPE: Record<VropsTimeSeriesObjectType, VropsTimeSeriesMetricKey> = {
  vm: "vmCpuDemandMaxMHz",
  host: "hostCpuDemandMaxMHz",
  cluster: "clusterCpuDemandMaxMHz",
};

/**
 * Lädt den zuletzt importierten vROps-Zeitreihenimport und leitet daraus die
 * Stundenreihe für ein einzelnes VM-, Host- oder Cluster-Objekt ab. Bewusst
 * unabhängig vom aktiven Session-Filter: Detaildialoge zeigen ein einzelnes
 * Objekt, unabhängig davon, welcher vCenter-Scope gerade aktiv ist.
 */
export function useVropsObjectSeries({
  objectType,
  rvtoolsObjectKey,
  cpuCapacityMHz,
  secondaryCapacity,
}: UseVropsObjectSeriesInput) {
  const importsQuery = useQuery({ queryKey: ["vropsTimeSeriesImports"], queryFn: getVropsTimeSeriesImports, staleTime: 30_000 });
  const latestImport = importsQuery.data?.[0] ?? null;

  const dataQuery = useQuery({
    queryKey: ["vropsObjectSeriesSource", latestImport?.id],
    enabled: Boolean(latestImport),
    queryFn: async () => {
      const importMeta = latestImport!;
      const [objects, chunks] = await Promise.all([
        getVropsTimeSeriesObjects(importMeta.id),
        getVropsTimeSeriesChunks(importMeta.id),
      ]);
      return { importMeta, objects, chunks };
    },
  });

  const resolved = useMemo(() => {
    if (!dataQuery.data || !rvtoolsObjectKey) return null;
    const { importMeta, objects, chunks } = dataQuery.data;
    const matched = objects.find(
      (object) => object.objectType === objectType && object.matchStatus === "matched" && object.rvtoolsObjectKey === rvtoolsObjectKey,
    );
    if (!matched) return null;

    const hourGrid = buildHourGrid(importMeta);
    const cpuSeries = readVropsTimeSeriesMetric(chunks, matched.objectKey, CPU_METRIC_BY_TYPE[objectType]);
    const cpuMaxSeries = readVropsTimeSeriesMetric(chunks, matched.objectKey, CPU_MAX_METRIC_BY_TYPE[objectType]);
    const secondarySeries = readVropsTimeSeriesMetric(chunks, matched.objectKey, SECONDARY_METRIC_BY_TYPE[objectType]);
    const hourly: VropsObjectTrendPoint[] = hourGrid.map((entry) => ({
      timestampUtc: entry.timestampUtc,
      cpuDemandMHz: finiteOrNull(cpuSeries.get(entry.timestampUtc)),
      cpuDemandMaxMHz: finiteOrNull(cpuMaxSeries.get(entry.timestampUtc)),
      secondaryValue: finiteOrNull(secondarySeries.get(entry.timestampUtc)),
    }));
    const hasAnyValue = hourly.some((point) => point.cpuDemandMHz !== null || point.secondaryValue !== null);
    return hasAnyValue ? { hourly, importedAt: importMeta.importedAt } : null;
  }, [dataQuery.data, objectType, rvtoolsObjectKey]);

  return {
    hourly: resolved?.hourly ?? [],
    importedAt: resolved?.importedAt ?? null,
    cpuCapacityMHz,
    secondaryCapacity,
    hasImport: Boolean(latestImport),
    isMatched: resolved !== null,
    isLoading: importsQuery.isLoading || dataQuery.isLoading,
  };
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}
