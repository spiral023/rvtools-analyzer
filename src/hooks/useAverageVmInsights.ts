import { useMemo } from "react";
import { buildAverageVmInsights, type AverageVmInsights } from "@/domain/services/averageVmInsightsService";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";

/**
 * Verteilungssicht der beobachteten Last für die aktuell gefilterten VMs.
 *
 * Join und Scoping laufen wie in `useAverageVmWorkload` über `rvtoolsObjectKey`; die
 * Auswertung selbst ist eine andere – hier zählen Quantile über die VMs statt eines
 * gemittelten Verlaufs.
 */
export function useAverageVmInsights(scopedVmKeys: ReadonlySet<string>): {
  insights: AverageVmInsights | null;
  hasImport: boolean;
  isLoading: boolean;
} {
  const { selectedImport, profiles, isLoading } = useVmWorkloadProfiles(null);

  const insights = useMemo(() => {
    if (!selectedImport || profiles.length === 0 || scopedVmKeys.size === 0) return null;
    const scopedProfiles = profiles.filter(
      (profile) => profile.rvtoolsObjectKey !== null && scopedVmKeys.has(profile.rvtoolsObjectKey),
    );
    return buildAverageVmInsights({
      import: selectedImport,
      profiles: scopedProfiles,
      scopedVmCount: scopedVmKeys.size,
    });
  }, [profiles, scopedVmKeys, selectedImport]);

  return { insights, hasImport: Boolean(selectedImport), isLoading };
}
