import { TriangleAlert } from "lucide-react";
import type { CpuRightsizingLevel } from "@/domain/models/types";
import { CPU_RIGHTSIZING_POLICIES } from "@/domain/services/vmRightsizingService";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";
import { CPU_RIGHTSIZING_LEVELS } from "@/lib/glossaries/workloadIntelligence";
import { formatPct } from "@/lib/xlsx/parseHelpers";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LEVEL_ORDER: readonly CpuRightsizingLevel[] = [
  "very-conservative",
  "conservative",
  "balanced",
  "offensive",
];

/**
 * Restreserve in der Lastspitze nach einer Verkleinerung. Ab „Ausgewogen“ wird sie so
 * knapp, dass die Stufe eine bewusste Entscheidung verlangt – die Warnung ist deshalb
 * abgestuft und nicht auf die offensivste Stufe beschränkt.
 */
const LEVEL_WARNING: Partial<Record<CpuRightsizingLevel, { className: string; label: string }>> = {
  balanced: {
    className: "text-warning",
    label: "Achtung: nur 10 % Reserve in der Spitze, setzt bekannte Lastspitzen voraus",
  },
  offensive: {
    className: "text-destructive",
    label: "Warnung: geringste Sicherheitsreserve, nur bei gut verstandener Workload sinnvoll",
  },
};

function peakLabel(level: CpuRightsizingLevel): string {
  const statistic = CPU_RIGHTSIZING_POLICIES[level].peakStatistic;
  if (statistic === "maximum") return "Max";
  if (statistic === "p995") return "p99,5";
  return statistic;
}

function formatPolicyPercent(value: number): string {
  return formatPct(value * 100, 0);
}

export function CpuRightsizingLevelControl() {
  const { level, setLevel } = useCpuRightsizingLevel();
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">Globale Rightsizing-Stufe</p>
        <p className="text-xs text-muted-foreground">
          Gilt in allen Ansichten und Exporten. Qualitäts- und Dauerlast-Gates bleiben unverändert.
        </p>
      </div>
      <ToggleGroup
        type="single"
        value={level}
        onValueChange={(value) => {
          if (value) setLevel(value as CpuRightsizingLevel);
        }}
        variant="outline"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        aria-label="Globale CPU-Rightsizing-Stufe"
      >
        {LEVEL_ORDER.map((entry) => {
          const policy = CPU_RIGHTSIZING_POLICIES[entry];
          const warning = LEVEL_WARNING[entry];
          return (
            /*
              Der TooltipTrigger sitzt bewusst auf einem Wrapper statt per asChild auf dem
              ToggleGroupItem: asChild überschreibt dessen data-state, womit die aktive Stufe
              ihre Hervorhebung verliert. Der Wrapper trägt den Tooltip, das Item seinen Zustand.
            */
            <InfoTooltip key={entry} entry={CPU_RIGHTSIZING_LEVELS[entry]} side="bottom" align="center">
              {/* Der Wrapper ist die Grid-Zelle; `h-full` hält alle vier Schaltflächen gleich hoch. */}
              <div className="h-full">
                <ToggleGroupItem value={entry} className="h-full min-h-14 w-full flex-col px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {policy.label}
                    {warning && (
                      <>
                        <TriangleAlert className={`h-3.5 w-3.5 shrink-0 ${warning.className}`} aria-hidden="true" />
                        <span className="sr-only">{warning.label}</span>
                      </>
                    )}
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {peakLabel(entry)} · P95 {formatPolicyPercent(policy.targetUtilizationP95)} · Spitze {formatPolicyPercent(policy.targetUtilizationPeak)}
                  </span>
                </ToggleGroupItem>
              </div>
            </InfoTooltip>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
