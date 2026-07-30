import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { GlossaryEntry } from "@/lib/glossary";
import type { DistributionStats } from "@/lib/distribution";
import { cn } from "@/lib/utils";

interface DistributionStripProps {
  label: string;
  stats: DistributionStats | null;
  /** Formatiert jeden Wert der Verteilung – vCPU, MiB, MHz oder Prozent. */
  format: (value: number) => string;
  info?: GlossaryEntry;
  /**
   * Färbt die Verteilung als Warnung, wenn ein Schwellenwert gerissen wird
   * (etwa Ready-P95 über 5 %). Ohne Prädikat bleibt der Streifen neutral.
   */
  exceedsThreshold?: (stats: DistributionStats) => boolean;
  emptyHint?: string;
}

/**
 * Signature-Element des Panels: der Mittelwert steht nie allein, sondern sitzt auf
 * seiner Streuung. Gelesen wird von links nach rechts – Whisker von Minimum bis
 * Maximum, die Box umschließt die mittlere Hälfte (P25–P75), der starke Strich ist
 * der Median, die Raute der P95.
 *
 * Die Skala ist linear von Minimum bis Maximum. Bei den typisch schiefen
 * VM-Beständen rutscht die Box damit weit nach links – genau die Aussage „die
 * meisten VMs sind klein, einzelne sehr groß".
 */
export function DistributionStrip({ label, stats, format, info, exceedsThreshold, emptyHint }: DistributionStripProps) {
  const heading = (
    <p className="w-fit text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
  );

  if (!stats) {
    return (
      <div className="space-y-1.5">
        {info ? <InfoTooltip entry={info} side="top">{withCursor(heading)}</InfoTooltip> : heading}
        <p className="text-[11px] italic text-muted-foreground">{emptyHint ?? "Keine Werte im Filter."}</p>
      </div>
    );
  }

  const alert = exceedsThreshold?.(stats) ?? false;
  const span = stats.max - stats.min;
  const position = (value: number) => (span > 0 ? ((value - stats.min) / span) * 100 : 50);
  const boxLeft = position(stats.p25);
  const boxWidth = Math.max(position(stats.p75) - boxLeft, 1.2);

  return (
    <div className="space-y-1.5">
      {info ? <InfoTooltip entry={info} side="top">{withCursor(heading)}</InfoTooltip> : heading}

      <div className="relative mx-1 h-6" aria-hidden="true">
        {/* Whisker Minimum–Maximum */}
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-border"
          style={{ left: `${position(stats.min)}%`, right: `${100 - position(stats.max)}%` }}
        />
        {[stats.min, stats.max].map((value, index) => (
          <div
            key={index}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-border"
            style={{ left: `${position(value)}%` }}
          />
        ))}
        {/* Mittlere Hälfte */}
        <div
          className={cn(
            "absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[3px] border",
            alert ? "border-warning/50 bg-warning/15" : "border-primary/45 bg-primary/15",
          )}
          style={{ left: `${boxLeft}%`, width: `${boxWidth}%` }}
        />
        {/* Median */}
        <div
          className={cn(
            "absolute top-1/2 h-[18px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full",
            alert ? "bg-warning" : "bg-primary",
          )}
          style={{ left: `${position(stats.p50)}%` }}
        />
        {/* P95 */}
        <div
          className={cn(
            "absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]",
            alert ? "bg-warning" : "bg-primary/70",
          )}
          style={{ left: `${position(stats.p95)}%` }}
        />
      </div>

      <p className="font-mono-data text-[11px] leading-relaxed text-muted-foreground">
        {span > 0 ? (
          <>
            <span className="text-foreground/80">Median {format(stats.p50)}</span>
            {" · Hälfte "}
            {format(stats.p25)}–{format(stats.p75)}
            {" · P95 "}
            <span className={alert ? "font-semibold text-warning" : undefined}>{format(stats.p95)}</span>
            {" · Spanne "}
            {format(stats.min)}–{format(stats.max)}
          </>
        ) : (
          <>Alle {stats.count.toLocaleString("de-DE")} VMs identisch bei {format(stats.p50)}</>
        )}
      </p>
    </div>
  );
}

/** Der Tooltip-Trigger muss als Hover-Ziel erkennbar sein, ohne die Typo zu ändern. */
function withCursor(heading: React.ReactElement) {
  return <span className="block w-fit cursor-help">{heading}</span>;
}
