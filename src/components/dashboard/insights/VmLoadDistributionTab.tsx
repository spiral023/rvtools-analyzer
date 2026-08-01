import { useMemo } from "react";
import { AverageVmInsightsPanel } from "@/components/dashboard/insights/AverageVmInsightsPanel";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import type { NormalizedVm } from "@/domain/models/types";
import { useAverageVmInsights } from "@/hooks/useAverageVmInsights";

/**
 * Eigene Komponente statt eines Hooks auf Seitenebene: Radix hängt inaktive Tabs aus,
 * damit läuft die Quantilberechnung über alle Stundenschlitze erst, wenn der Tab
 * tatsächlich geöffnet wird.
 */
export function VmLoadDistributionTab({ vms }: { vms: readonly NormalizedVm[] }) {
  // `vmKey` ist snapshotunabhängig und verbindet die Zeitreihen verlustfrei mit der Auswahl.
  const scopedVmKeys = useMemo(() => new Set(vms.map((vm) => vm.vmKey)), [vms]);
  const { insights, hasImport, isLoading } = useAverageVmInsights(scopedVmKeys);

  if (isLoading) return <PanelLoadingState />;
  return <AverageVmInsightsPanel insights={insights} hasVropsImport={hasImport} />;
}
