import { Fragment, useState } from "react";
import type { RightsizingDemandBand, RightsizingDensityCell, RightsizingDensityGrid, RightsizingDemandSeverity } from "@/lib/rightsizingDensity";
import { formatFillUpValue } from "@/lib/fillUpUnits";
import { cn } from "@/lib/utils";
import { formatNum } from "@/lib/xlsx/parseHelpers";

/** Ein Farbton je Schweregrad, Deckkraft nach Zellbesetzung. */
const SEVERITY_TOKEN: Record<RightsizingDemandSeverity, string> = {
  critical: "--destructive",
  warn: "--warning",
  neutral: "--primary",
};

/**
 * Logarithmisch, weil die Besetzung extrem schief verteilt ist: einzelne Zellen halten
 * die halbe Flotte, während die interessanten Randzellen sonst unsichtbar blieben.
 */
function cellColor(vmCount: number, maxVmCount: number, severity: RightsizingDemandSeverity): string | undefined {
  if (vmCount === 0) return undefined;
  const ratio = maxVmCount > 1 ? Math.log1p(vmCount) / Math.log1p(maxVmCount) : 1;
  const alpha = 0.14 + 0.78 * ratio;
  return `hsl(var(${SEVERITY_TOKEN[severity]}) / ${alpha.toFixed(3)})`;
}

export interface RightsizingDensitySelection {
  cell: RightsizingDensityCell;
  vcpuLabel: string;
  demandLabel: string;
}

type HoveredCell = RightsizingDensitySelection;

/**
 * Konfigurierte vCPU (X) gegen CPU Demand P95 in Prozent der konfigurierten Kapazität (Y),
 * als Dichteraster statt als Punktwolke. Gelesen wird wie das frühere Streudiagramm:
 * rechts unten – viele vCPU bei geringem Bedarf – sitzen die Rightsizing-Kandidaten,
 * die beiden oberen Zeilen sind der Gegenfall einer zu kleinen Konfiguration.
 */
export function VmRightsizingDensityGrid({
  grid,
  onCellClick,
}: {
  grid: RightsizingDensityGrid;
  onCellClick?: (selection: RightsizingDensitySelection) => void;
}) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);
  const columns = `4.75rem repeat(${grid.vcpuBands.length}, minmax(0, 1fr))`;

  return (
    <div className="space-y-2" onMouseLeave={() => setHovered(null)}>
      <p className="font-mono-data min-h-4 text-[11px] text-muted-foreground">
        {hovered ? (
          <>
            {hovered.vcpuLabel} vCPU · {hovered.demandLabel} ·{" "}
            <span className="text-foreground/80">{formatNum(hovered.cell.vmCount)} VMs</span>
            {hovered.cell.reclaimableVcpu > 0 && <> · {formatFillUpValue(hovered.cell.reclaimableVcpu, "vCPU")} rückgewinnbar</>}
          </>
        ) : (
          <>{formatNum(grid.vmCount)} VMs · {formatFillUpValue(grid.reclaimableVcpu, "vCPU")} rückgewinnbar gesamt</>
        )}
      </p>

      <div className="space-y-1">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: columns }}>
          {grid.demandBands.map((demandBand, rowIndex) => (
            <Fragment key={demandBand.key}>
              <span className={cn("font-mono-data pr-1 text-right text-[10px] leading-6", demandLabelClass(demandBand))}>
                {demandBand.label}
              </span>
              {grid.rows[rowIndex].map((cell, columnIndex) => {
                const vcpuLabel = grid.vcpuBands[columnIndex].label;
                return (
                  <button
                    key={cell.vcpuBandKey}
                    type="button"
                    disabled={cell.vmCount === 0}
                    aria-label={`${vcpuLabel} vCPU, ${demandBand.label} CPU Demand P95: ${formatNum(cell.vmCount)} VMs${cell.vmCount > 0 ? ", Details öffnen" : ""}`}
                    onMouseEnter={() => setHovered({ cell, vcpuLabel, demandLabel: demandBand.label })}
                    onFocus={() => setHovered({ cell, vcpuLabel, demandLabel: demandBand.label })}
                    onBlur={() => setHovered(null)}
                    onClick={() => {
                      if (cell.vmCount > 0) onCellClick?.({ cell, vcpuLabel, demandLabel: demandBand.label });
                    }}
                    className={cn(
                      "font-mono-data flex h-6 items-center justify-center rounded-[2px] text-[10px] tabular-nums outline-none",
                      cell.vmCount === 0
                        ? "cursor-default bg-muted/25 text-transparent"
                        : "cursor-pointer text-foreground/85 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    )}
                    style={{ backgroundColor: cellColor(cell.vmCount, grid.maxVmCount, demandBand.severity) }}
                  >
                    {cell.vmCount > 0 ? formatNum(cell.vmCount) : ""}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div className="grid gap-[2px]" style={{ gridTemplateColumns: columns }} aria-hidden="true">
          <span className="font-mono-data pr-1 text-right text-[9px] text-muted-foreground">vCPU</span>
          {grid.vcpuBands.map((band) => (
            <span key={band.key} className="font-mono-data text-center text-[9px] text-muted-foreground">{band.label}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          wenige
          {[0.14, 0.35, 0.56, 0.77, 0.92].map((alpha) => (
            <span key={alpha} className="h-2.5 w-3.5 rounded-[2px]" style={{ backgroundColor: `hsl(var(--primary) / ${alpha})` }} />
          ))}
          viele VMs
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3.5 rounded-[2px]" style={{ backgroundColor: "hsl(var(--warning) / 0.7)" }} />
          2–5 % oder 90–100 %
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3.5 rounded-[2px]" style={{ backgroundColor: "hsl(var(--destructive) / 0.7)" }} />
          unter 2 % oder ab 100 %
        </span>
      </div>
    </div>
  );
}

function demandLabelClass(band: RightsizingDemandBand): string {
  if (band.severity === "critical") return "font-semibold text-destructive";
  if (band.severity === "warn") return "font-semibold text-warning";
  return "text-muted-foreground";
}
