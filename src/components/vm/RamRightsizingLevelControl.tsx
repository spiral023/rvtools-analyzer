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

const LEVEL_WARNING: Partial<Record<RamRightsizingLevel, { className: string; label: string }>> = {
  balanced: {
    className: "text-warning",
    label: "Achtung: nur 10 % Reserve, setzt bekannte Lastspitzen voraus",
  },
  offensive: {
    className: "text-destructive",
    label: "Warnung: geringste Sicherheitsreserve, nur bei gut verstandener Workload sinnvoll",
  },
};

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
          const warning = LEVEL_WARNING[entry];
          return (
            <ToggleGroupItem key={entry} value={entry} className="h-auto min-h-14 flex-col px-3 py-2">
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
                Avg {statisticLabel(policy.normalStatistic)} · Max {statisticLabel(policy.peakStatistic)} · Ziel {policy.targetWorkloadFactor * 100} % · {formatBytes(policy.roundingStepMiB)}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
import { TriangleAlert } from "lucide-react";
