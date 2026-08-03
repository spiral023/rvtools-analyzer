import { useMemo } from "react";
import type { RestrictedDatasetSource } from "@/domain/models/types";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";

export interface RestrictedDatasetState {
  /** Mindestens ein aktiver Snapshot stammt aus einem importierten SysV-Datenpaket. */
  isRestricted: boolean;
  /** Die Paketquellen der aktiven Snapshots, dedupliziert über die packageId. */
  sources: RestrictedDatasetSource[];
  /** Solange true, ist `isRestricted` noch nicht belastbar. */
  isPending: boolean;
}

/**
 * Einziger Erkennungspunkt für einen physisch eingeschränkten Analysedatenbestand.
 *
 * Bewusst nicht am App-Modus festgemacht: Der SysV-Modus ist eine reine
 * Navigationsvariante und kann auch auf einem vollständigen Datenbestand aktiv
 * sein. Ausgeblendet werden darf nur, was durch den Paketimport tatsächlich
 * unvollständig ist.
 */
export function useRestrictedDataset(): RestrictedDatasetState {
  const { snapshots, activeSnapshotIds, snapshotsLoading } = useActiveSnapshotIds();

  return useMemo(() => {
    const activeIds = new Set(activeSnapshotIds);
    const byPackageId = new Map<string, RestrictedDatasetSource>();
    for (const snapshot of snapshots) {
      if (!activeIds.has(snapshot.snapshotId)) continue;
      const restricted = snapshot.restrictedDataset;
      if (restricted?.kind !== "sysv-package") continue;
      if (!byPackageId.has(restricted.packageId)) byPackageId.set(restricted.packageId, restricted);
    }
    return {
      isRestricted: byPackageId.size > 0,
      sources: [...byPackageId.values()],
      isPending: snapshotsLoading,
    };
  }, [activeSnapshotIds, snapshots, snapshotsLoading]);
}
