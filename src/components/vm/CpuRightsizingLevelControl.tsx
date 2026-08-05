import { TriangleAlert } from "lucide-react";
import type { CpuRightsizingLevel } from "@/domain/models/types";
import { CPU_RIGHTSIZING_POLICIES } from "@/domain/services/vmRightsizingService";
import { useCpuRightsizingLevel } from "@/hooks/useCpuRightsizingLevel";
import { formatPct } from "@/lib/xlsx/parseHelpers";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LEVEL_ORDER: readonly CpuRightsizingLevel[] = [
  "very-conservative",
  "conservative",
  "balanced",
  "offensive",
];

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
          return (
            <ToggleGroupItem key={entry} value={entry} className="h-auto min-h-14 flex-col px-3 py-2">
              {/*
                Kein InfoTooltip um das Item: dessen TooltipTrigger mit asChild überschreibt das
                data-state des ToggleGroupItem, womit die aktive Stufe nicht mehr hervorgehoben wird.
                Der Warnhinweis steht deshalb als sr-only-Text direkt neben dem Symbol.
              */}
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                {policy.label}
                {entry === "offensive" && (
                  <>
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                    <span className="sr-only">
                      Warnung: geringste Sicherheitsreserve, nur bei gut verstandener Workload sinnvoll
                    </span>
                  </>
                )}
              </span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {peakLabel(entry)} · P95 {formatPolicyPercent(policy.targetUtilizationP95)} · Spitze {formatPolicyPercent(policy.targetUtilizationPeak)}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
