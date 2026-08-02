import type { RamRightsizingLevel } from "@/domain/models/types";
import { RAM_RIGHTSIZING_POLICIES } from "@/domain/services/vmRamRightsizingService";
import { useRamRightsizingLevel } from "@/hooks/useRamRightsizingLevel";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LEVEL_ORDER: readonly RamRightsizingLevel[] = [
  "very-conservative",
  "conservative",
  "balanced",
  "offensive",
];

function statisticLabel(statistic: "p95" | "p99" | "p995"): string {
  return statistic === "p995" ? "P99,5" : statistic.toUpperCase();
}

export function RamRightsizingLevelControl() {
  const { level, setLevel } = useRamRightsizingLevel();

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">Globale RAM-Rightsizing-Stufe</p>
        <p className="text-xs text-muted-foreground">
          Steuert Perzentile und Zielauslastung nur für RAM. Die vorläufige Policy wird nach dem Memory-Export gegen die echte Verteilung validiert.
        </p>
      </div>
      <ToggleGroup
        type="single"
        value={level}
        onValueChange={(value) => {
          if (value) setLevel(value as RamRightsizingLevel);
        }}
        variant="outline"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        aria-label="Globale RAM-Rightsizing-Stufe"
      >
        {LEVEL_ORDER.map((entry) => {
          const policy = RAM_RIGHTSIZING_POLICIES[entry];
          return (
            <ToggleGroupItem key={entry} value={entry} className="h-auto min-h-14 flex-col px-3 py-2">
              <span className="text-xs font-semibold">{policy.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                Avg {statisticLabel(policy.normalStatistic)} · Max {statisticLabel(policy.peakStatistic)} · Ziel {policy.targetWorkloadFactor * 100} % · {formatBytes(policy.roundingStepMiB)}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
