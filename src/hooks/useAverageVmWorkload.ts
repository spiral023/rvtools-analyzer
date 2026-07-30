import { useMemo } from "react";
import { buildAverageVmWorkload, type AverageVmWorkload } from "@/domain/services/averageVmWorkloadService";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";

/**
 * Beobachtete Last der Durchschnitts-VM für die aktuell gefilterten VMs.
 *
 * Der Join läuft über `vmKey` (`vmUuid::vcenterId`) und ist damit unabhängig davon,
 * auf welchen RVTools-Snapshot der vROps-Import eingefroren ist – nur dasselbe
 * vCenter muss im Scope liegen. `hasImport` unterscheidet „kein Import vorhanden"
 * von „Import vorhanden, aber keine VM des Filters darin".
 */
export function useAverageVmWorkload(scopedVmKeys: ReadonlySet<string>): {
  workload: AverageVmWorkload | null;
  hasImport: boolean;
  isLoading: boolean;
} {
  const { selectedImport, profiles, isLoading } = useVmWorkloadProfiles(null);

  const workload = useMemo(() => {
    if (!selectedImport || profiles.length === 0 || scopedVmKeys.size === 0) return null;
    const scopedProfiles = profiles.filter(
      (profile) => profile.rvtoolsObjectKey !== null && scopedVmKeys.has(profile.rvtoolsObjectKey),
    );
    return buildAverageVmWorkload({
      import: selectedImport,
      profiles: scopedProfiles,
      scopedVmCount: scopedVmKeys.size,
    });
  }, [profiles, scopedVmKeys, selectedImport]);

  return { workload, hasImport: Boolean(selectedImport), isLoading };
}
