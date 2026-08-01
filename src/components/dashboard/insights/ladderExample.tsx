import type { MetricSpread } from "@/domain/services/averageVmInsightsService";
import { formatDemandMHz, formatDemandPct, toCapacityPct } from "@/lib/formatDemand";
import { formatNum } from "@/lib/xlsx/parseHelpers";

/**
 * Rechnet eine Leiterzeile an den gerade gezeigten Zahlen vor.
 *
 * Bewusst aus den Daten erzeugt statt als fester Beispieltext im Glossar: Ein Satz aus
 * dem eigenen Bestand erklärt „Median" und „P95" schneller als eine abstrakte
 * Definition, und er bleibt bei jedem Filter richtig.
 */
export function ladderExample(
  spread: MetricSpread,
  capacityMHz: number | null,
  vmCount: number,
  subject: string,
): React.ReactNode {
  const { stats } = spread;
  if (!stats) return null;
  const hasCapacity = capacityMHz !== null && capacityMHz > 0;
  const show = (value: number) => (hasCapacity ? formatDemandPct(toCapacityPct(value, capacityMHz), 1) : formatDemandMHz(value));

  if (stats.count === 1) {
    return <>Die einzige gemessene VM liegt {subject} bei {show(stats.p50)}.</>;
  }
  return (
    <>
      Von {formatNum(vmCount)} VMs liegt die Hälfte {subject} unter {show(stats.p50)} · das aktivste
      Zwanzigstel über {show(stats.p95)}.
    </>
  );
}
