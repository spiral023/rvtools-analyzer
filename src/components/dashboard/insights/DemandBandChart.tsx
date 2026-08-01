import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AverageVmInsights, DemandBandSlot } from "@/domain/services/averageVmInsightsService";
import { WEEKDAY_LABELS } from "@/domain/services/averageVmInsightsService";
import { CHART_AXIS_STYLE, CHART_GRID_STYLE } from "@/lib/chartStyles";
import { formatDemandAxisTick, formatDemandMHz, formatDemandPct, formatDemandPctAxisTick, toCapacityPct } from "@/lib/formatDemand";
import { INSIGHTS_GLOSSARY } from "@/lib/glossaries/averageVmInsights";
import { formatNum } from "@/lib/xlsx/parseHelpers";

type DemandUnit = "mhz" | "pct";

interface BandDatum {
  index: number;
  weekdayIndex: number;
  hour: number;
  /** Recharts zeichnet aus einem Wertepaar eine Fläche – hier die mittlere Hälfte der VMs. */
  middleHalf: [number, number] | null;
  median: number | null;
  p95: number | null;
  vmSampleCount: number;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Wochenverlauf als Verteilung statt als Mittelwert.
 *
 * Dieselbe Formensprache wie in der Leiter, nur über die Zeit ausgerollt: Die Box der
 * mittleren Hälfte wird zur Fläche, der Median zur Linie, der P95 zur gestrichelten
 * Kontur darüber. Damit bleibt der Verlauf bei jeder Filtergröße lesbar – bei einer
 * einzelnen VM fällt das Band auf die Linie zusammen und zeigt deren echtes Profil, bei
 * tausenden VMs bleibt der Median flach, während das Band die Spannweite trägt.
 */
export function DemandBandChart({ insights }: { insights: AverageVmInsights }) {
  const capacityMHz = insights.configuredCpuCapacityMHz;
  const canShowPct = capacityMHz !== null && capacityMHz > 0;
  const [unit, setUnit] = useState<DemandUnit>("pct");
  const activeUnit: DemandUnit = canShowPct ? unit : "mhz";

  const toUnit = useMemo(
    () => (value: number | null): number | null => {
      if (value === null) return null;
      return activeUnit === "pct" ? toCapacityPct(value, capacityMHz) : value;
    },
    [activeUnit, capacityMHz],
  );

  const data = useMemo<BandDatum[]>(
    () => insights.bands.map((slot) => {
      const p25 = toUnit(slot.p25);
      const p75 = toUnit(slot.p75);
      return {
        index: slot.index,
        weekdayIndex: slot.weekdayIndex,
        hour: slot.hour,
        middleHalf: p25 !== null && p75 !== null ? [p25, p75] : null,
        median: toUnit(slot.p50),
        p95: toUnit(slot.p95),
        vmSampleCount: slot.vmSampleCount,
      };
    }),
    [insights.bands, toUnit],
  );

  const dayTicks = useMemo(() => {
    const ticks = data.flatMap((slot) => (slot.hour === 0 ? [slot.index] : []));
    return data.length > 0 && ticks[0] !== 0 ? [0, ...ticks] : ticks;
  }, [data]);

  const weekendBands = useMemo(() => buildWeekendBands(insights.bands), [insights.bands]);
  const nowSlot = insights.nowSlotIndex !== null ? data[insights.nowSlotIndex] : null;
  const format = (value: number | null) => (activeUnit === "pct" ? formatDemandPct(value) : formatDemandMHz(value));

  return (
    <section className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <InfoTooltip
          entry={INSIGHTS_GLOSSARY.weekBands}
          side="bottom"
          example={
            <>
              Zur Spitzenstunde liegt die Hälfte der VMs unter {format(peakOf(data)?.median ?? null)},
              das aktivste Zwanzigstel aber über {format(peakOf(data)?.p95 ?? null)}.
            </>
          }
        >
          <h4 className="w-fit cursor-help text-[10px] uppercase tracking-wider text-muted-foreground">
            Wochenverlauf · Verteilung über die VMs {activeUnit === "pct" ? "in % der zugeteilten CPU" : "in MHz"}
          </h4>
        </InfoTooltip>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Legend />
          {nowSlot && (
            <p className="font-mono-data text-[11px] text-muted-foreground">
              jetzt {WEEKDAY_LABELS[insights.now.weekdayIndex]} {formatHour(insights.now.hour)} ·{" "}
              <span className="font-semibold text-warning">{format(nowSlot.median)}</span> üblich
            </p>
          )}
          {canShowPct && (
            <ToggleGroup
              type="single"
              value={activeUnit}
              onValueChange={(value) => { if (value === "mhz" || value === "pct") setUnit(value); }}
              size="sm"
              variant="outline"
            >
              <ToggleGroupItem value="mhz" aria-label="Absolut in MHz" className="h-6 px-2 text-[10px]">MHz</ToggleGroupItem>
              <ToggleGroupItem value="pct" aria-label="Anteil der zugeteilten CPU in Prozent" className="h-6 px-2 text-[10px]">%</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </header>

      <ResponsiveContainer width="100%" height={188}>
        <ComposedChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...CHART_GRID_STYLE} vertical={false} />
          {weekendBands.map((band) => (
            <ReferenceArea
              key={band.start}
              x1={band.start}
              x2={band.end}
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.07}
              strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          ))}
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, Math.max(data.length - 1, 1)]}
            ticks={dayTicks}
            tickFormatter={(value: number) => WEEKDAY_LABELS[data[value]?.weekdayIndex] ?? ""}
            tick={CHART_AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            width={40}
            tickFormatter={activeUnit === "pct" ? formatDemandPctAxisTick : formatDemandAxisTick}
            tick={CHART_AXIS_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<BandTooltip unit={activeUnit} />} />

          {/* Mittlere Hälfte als Fläche – dieselbe Aussage wie die Box in der Leiter. */}
          <Area
            dataKey="middleHalf"
            stroke="none"
            fill="hsl(var(--primary))"
            fillOpacity={0.18}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={false}
          />
          {/* P95 als Kontur: zeigt, wie weit die aktivsten VMs über dem Median liegen. */}
          <Line
            dataKey="p95"
            stroke="hsl(var(--primary))"
            strokeWidth={1}
            strokeDasharray="3 2"
            strokeOpacity={0.65}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 2.5, strokeWidth: 0, fill: "hsl(var(--primary))" }}
          />
          <Line
            dataKey="median"
            stroke="hsl(var(--primary))"
            strokeWidth={1.75}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
          />
          {insights.nowSlotIndex !== null && (
            <ReferenceLine
              x={insights.nowSlotIndex}
              stroke="hsl(var(--warning))"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "jetzt", position: "top", fill: "hsl(var(--warning))", fontSize: 10 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}

/** Erklärt die drei Marken einmal – ohne sie bleibt das Band eine hübsche Fläche. */
function Legend() {
  return (
    <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground" aria-hidden="true">
      <span className="flex items-center gap-1">
        <span className="h-[2px] w-3 rounded-full bg-primary" />Median
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-3 rounded-[1px] bg-primary/20" />mittlere Hälfte
      </span>
      <span className="flex items-center gap-1">
        <span className="h-px w-3 border-t border-dashed border-primary/65" />P95
      </span>
    </div>
  );
}

function peakOf(data: readonly BandDatum[]): BandDatum | null {
  return data.reduce<BandDatum | null>(
    (peak, slot) => (slot.p95 !== null && (peak === null || peak.p95 === null || slot.p95 > peak.p95) ? slot : peak),
    null,
  );
}

function BandTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: BandDatum }[]; unit: DemandUnit }) {
  const slot = payload?.[0]?.payload;
  if (!active || !slot) return null;
  const format = (value: number | null) => (unit === "pct" ? formatDemandPct(value) : formatDemandMHz(value));
  return (
    <div className="rounded-lg border border-border/80 bg-popover px-2.5 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-popover-foreground">
        {WEEKDAY_LABELS[slot.weekdayIndex]} {formatHour(slot.hour)}
      </p>
      {slot.vmSampleCount > 0 ? (
        <>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-2 font-mono-data text-xs text-popover-foreground">
            <dt className="text-muted-foreground">Median</dt>
            <dd className="text-right">{format(slot.median)}</dd>
            <dt className="text-muted-foreground">mittlere Hälfte</dt>
            <dd className="text-right">
              {slot.middleHalf ? `${format(slot.middleHalf[0])}–${format(slot.middleHalf[1])}` : "—"}
            </dd>
            <dt className="text-muted-foreground">P95</dt>
            <dd className="text-right">{format(slot.p95)}</dd>
          </dl>
          <p className="mt-1 text-[10px] text-muted-foreground">{formatNum(slot.vmSampleCount)} VMs gemessen</p>
        </>
      ) : (
        <p className="mt-1 text-[10px] text-muted-foreground">keine Messwerte</p>
      )}
    </div>
  );
}

/** Zusammenhängende Sa/So-Abschnitte, die im Verlauf hinterlegt werden. */
function buildWeekendBands(slots: readonly DemandBandSlot[]): { start: number; end: number }[] {
  const bands: { start: number; end: number }[] = [];
  let start: number | null = null;
  slots.forEach((slot, index) => {
    const isWeekend = slot.weekdayIndex === 5 || slot.weekdayIndex === 6;
    if (isWeekend && start === null) start = index;
    if (!isWeekend && start !== null) { bands.push({ start, end: index - 1 }); start = null; }
  });
  if (start !== null) bands.push({ start, end: slots.length - 1 });
  return bands;
}
