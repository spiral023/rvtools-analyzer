import { ChevronRight } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { MetricSpread } from "@/domain/services/averageVmInsightsService";
import type { GlossaryEntry } from "@/lib/glossary";
import { formatDemandPct, toCapacityPct } from "@/lib/formatDemand";
import { cn } from "@/lib/utils";

/** Ab hier gilt eine VM als nah an ihrer Zuteilung – dieselbe Grenze wie `hoursAboveCapacity75`. */
const NEAR_CAPACITY_PCT = 75;

export interface CapacityLadderRow {
  /** Kurzes Label der Zeitaggregation: „Ø", „P95", „Spitze". */
  label: string;
  spread: MetricSpread;
  info: GlossaryEntry;
  /** Satz, der die Zeile an den eigenen Zahlen vorrechnet. */
  example: React.ReactNode;
}

interface CapacityLadderProps {
  rows: CapacityLadderRow[];
  /** Bezugsgröße aller Prozentwerte: Ø konfigurierte CPU je VM in MHz. */
  capacityMHz: number | null;
}

/**
 * Drei Zeitaggregate derselben Kennzahl auf einer gemeinsamen Kapazitätsachse.
 *
 * Die Achse steht fest von 0 bis 100 % der zugeteilten CPU – nicht von Minimum bis
 * Maximum. Dass die Verteilungen dadurch links kleben und rechts Fläche frei bleibt,
 * ist die Aussage: dort liegt der ungenutzte Teil der Zuteilung. Zugleich bleiben die
 * Zeilen untereinander und über Filterwechsel hinweg vergleichbar.
 *
 * Die Formensprache ist die des `DistributionStrip`: Whisker von Minimum bis Maximum,
 * Box über die mittlere Hälfte, starker Strich als Median, Raute als P95. Unter
 * fünfzehn VMs treten an ihre Stelle die Einzelwerte als Punkte.
 */
export function CapacityLadder({ rows, capacityMHz }: CapacityLadderProps) {
  const hasCapacity = capacityMHz !== null && capacityMHz > 0;

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        {rows.map((row) => (
          <LadderRow key={row.label} row={row} capacityMHz={capacityMHz} />
        ))}
      </div>

      {/* Achse einmal unter allen Zeilen – sie gilt für die ganze Leiter. */}
      <div className="flex items-start gap-2" aria-hidden="true">
        <span className="w-11 shrink-0" />
        <div className="relative h-3 flex-1">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-1/2 font-mono-data text-[9px] text-muted-foreground"
              style={{ left: `${tick}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
        <span className="w-16 shrink-0 font-mono-data text-[9px] text-muted-foreground">% Kap.</span>
      </div>

      {!hasCapacity && (
        <p className="text-[11px] italic text-muted-foreground">
          Ohne bekannte Hostfrequenz lässt sich der Anteil an der Zuteilung nicht berechnen.
        </p>
      )}
    </div>
  );
}

function LadderRow({ row, capacityMHz }: { row: CapacityLadderRow; capacityMHz: number | null }) {
  const { stats, samples } = row.spread;
  const pctOf = (value: number | null | undefined) => toCapacityPct(value, capacityMHz);
  const medianPct = pctOf(stats?.p50);

  const label = (
    <span className="w-11 shrink-0 cursor-help font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
      {row.label}
    </span>
  );

  if (!stats || medianPct === null) {
    return (
      <div className="flex items-center gap-2">
        <InfoTooltip entry={row.info} side="top" example={row.example}>{label}</InfoTooltip>
        <p className="flex-1 text-[11px] italic text-muted-foreground">Keine Messwerte im Filter.</p>
      </div>
    );
  }

  const alert = medianPct >= NEAR_CAPACITY_PCT;
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const at = (value: number | null) => (value === null ? null : clamp(value));
  const overflow = (pctOf(stats.max) ?? 0) > 100;

  const minAt = at(pctOf(stats.min));
  const maxAt = at(pctOf(stats.max));
  const p25At = at(pctOf(stats.p25));
  const p75At = at(pctOf(stats.p75));
  const p95At = at(pctOf(stats.p95));
  const medianAt = clamp(medianPct);

  return (
    <div className="flex items-center gap-2">
      <InfoTooltip entry={row.info} side="top" example={row.example}>{label}</InfoTooltip>

      <div className="relative h-5 flex-1" aria-hidden="true">
        {/* Viertel-Raster als ruhige Orientierung – die Achse selbst steht unter der Leiter. */}
        {[25, 50, 75].map((tick) => (
          <div key={tick} className="absolute inset-y-0 w-px bg-border/40" style={{ left: `${tick}%` }} />
        ))}

        {samples ? (
          samples.map((value, index) => {
            const position = at(pctOf(value));
            if (position === null) return null;
            return (
              <div
                key={index}
                className={cn(
                  "absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border",
                  alert ? "border-warning/70 bg-warning/40" : "border-primary/70 bg-primary/40",
                )}
                style={{ left: `${position}%` }}
              />
            );
          })
        ) : (
          <>
            {minAt !== null && maxAt !== null && (
              <div
                className="absolute top-1/2 h-px -translate-y-1/2 bg-border"
                style={{ left: `${minAt}%`, right: `${100 - maxAt}%` }}
              />
            )}
            {[minAt, maxAt].map((position, index) => position !== null && (
              <div key={index} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border" style={{ left: `${position}%` }} />
            ))}
            {p25At !== null && p75At !== null && (
              <div
                className={cn(
                  "absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px] border",
                  alert ? "border-warning/50 bg-warning/15" : "border-primary/45 bg-primary/15",
                )}
                style={{ left: `${p25At}%`, width: `${Math.max(p75At - p25At, 1.2)}%` }}
              />
            )}
            {p95At !== null && (
              <div
                className={cn(
                  "absolute top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]",
                  alert ? "bg-warning" : "bg-primary/70",
                )}
                style={{ left: `${p95At}%` }}
              />
            )}
          </>
        )}

        <div
          className={cn(
            "absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full",
            alert ? "bg-warning" : "bg-primary",
          )}
          style={{ left: `${medianAt}%` }}
        />

        {/* Werte jenseits der Zuteilung enden nicht am Rand, sondern zeigen darüber hinaus. */}
        {overflow && (
          <ChevronRight className={cn("absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2", alert ? "text-warning" : "text-primary/70")} />
        )}
      </div>

      <InfoTooltip entry={row.info} side="top" align="end" example={row.example}>
        <span className={cn(
          "w-16 shrink-0 cursor-help text-right font-mono-data text-[11px] tabular-nums",
          alert ? "font-semibold text-warning" : "text-foreground/90",
        )}>
          {formatDemandPct(medianPct, 1)}
        </span>
      </InfoTooltip>
    </div>
  );
}
