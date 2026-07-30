import { useMemo } from "react";
import type { NormalizedVm } from "@/domain/models/types";
import type { AverageVmWorkload } from "@/domain/services/averageVmWorkloadService";
import { useRawSheet } from "@/hooks/useActiveSnapshots";
import { useAverageVmWorkload } from "@/hooks/useAverageVmWorkload";
import { buildAverageVm, type AverageVm } from "@/lib/averageVm";
import { buildVmJoinKey, filterRowsByMatchingVmJoinKeys } from "@/lib/globalFilter";

export interface UseAverageVmResult {
  avg: AverageVm | null;
  /** Beobachtete Last derselben Auswahl; `null` ohne passende vROps-Zeitreihe. */
  workload: AverageVmWorkload | null;
  /** Unterscheidet „kein Import vorhanden“ von „Import ohne Treffer im Filter“. */
  hasVropsImport: boolean;
  /** Solange true, sind die Roh-Sheets unvollständig – die Kennzahlen wären zu niedrig. */
  isLoading: boolean;
}

/**
 * Durchschnitts-VM für eine bereits gefilterte VM-Auswahl: zugeteilte Kennzahlen aus den
 * RVTools-Roh-Sheets und, falls ein passender vROps-Zeitreihenimport vorliegt, die
 * beobachtete Last derselben Auswahl.
 *
 * Als Hook gebündelt, damit Overview und die VM-Seite dieselbe Auswertung zeigen, ohne die
 * Zusammenstellung der Roh-Sheets und der beiden Scope-Schlüsselmengen zu wiederholen. Die
 * Sheet-Abfragen teilen ihren Query-Cache seitenübergreifend, kosten also keine zweite Ladung.
 */
export function useAverageVm(vms: readonly NormalizedVm[]): UseAverageVmResult {
  const { data: rawMemoryRows = [], isLoading: memoryLoading } = useRawSheet("vMemory");
  const { data: rawDiskRows = [], isLoading: diskLoading } = useRawSheet("vDisk");
  const { data: rawPartitionRows = [], isLoading: partitionLoading } = useRawSheet("vPartition");
  const { data: rawNetworkRows = [], isLoading: networkLoading } = useRawSheet("vNetwork");

  // Roh-Sheets exakt auf die gefilterten VMs beschränken: der globale Filter allein kennt
  // Suche, Cluster- und Host-Auswahl nicht, deshalb wird der Scope aus den VMs selbst gebildet.
  const scopedVmJoinKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const vm of vms) keys.add(buildVmJoinKey(vm.snapshotId, vm.vmName));
    return keys;
  }, [vms]);

  // Der vROps-Import ist auf eigene Snapshots eingefroren; `vmKey` ist snapshotunabhängig
  // und verbindet die Zeitreihen daher verlustfrei mit der aktuellen VM-Auswahl.
  const scopedVmKeys = useMemo(() => new Set(vms.map((vm) => vm.vmKey)), [vms]);
  const { workload, hasImport, isLoading: workloadLoading } = useAverageVmWorkload(scopedVmKeys);

  const avg = useMemo(
    () => buildAverageVm({
      vms: [...vms],
      memoryRows: filterRowsByMatchingVmJoinKeys(rawMemoryRows, scopedVmJoinKeys),
      diskRows: filterRowsByMatchingVmJoinKeys(rawDiskRows, scopedVmJoinKeys),
      partitionRows: filterRowsByMatchingVmJoinKeys(rawPartitionRows, scopedVmJoinKeys),
      networkRows: filterRowsByMatchingVmJoinKeys(rawNetworkRows, scopedVmJoinKeys),
    }),
    [vms, rawMemoryRows, rawDiskRows, rawPartitionRows, rawNetworkRows, scopedVmJoinKeys],
  );

  return {
    avg,
    workload,
    hasVropsImport: hasImport,
    isLoading: memoryLoading || diskLoading || partitionLoading || networkLoading || workloadLoading,
  };
}
