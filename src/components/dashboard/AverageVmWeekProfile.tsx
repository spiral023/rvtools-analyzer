import { Fragment, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AverageVmWorkload, AverageVmWorkloadWeekCell } from "@/domain/services/averageVmWorkloadService";
import { WEEKDAY_LABELS } from "@/domain/services/averageVmWorkloadService";
import { CHART_AXIS_STYLE, CHART_GRID_STYLE } from "@/lib/chartStyles";
import { formatDemandAxisTick, formatDemandMHz, formatDemandPct, formatDemandPctAxisTick, toCapacityPct } from "@/lib/formatDemand";
import { buildHeatScale, heatCellColor, relativeToMedian } from "@/lib/heatScale";
import { OVERVIEW_SECTIONS } from "@/lib/glossary";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { cn } from "@/lib/utils";

interface SlotDatum {
  index: number;
  weekdayIndex: number;
  hour: number;
  cpuDemandMHz: number | null;
  /** Derselbe Wert als Anteil der konfigurierten CPU-Kapazität; `null` ohne bekannte Hostfrequenz. */
  cpuDemandPct: number | null;
  vmSampleCount: number;
}

/** Anzeigeeinheit des Wochenverlaufs: absolut in MHz/GHz oder als Anteil der zugeteilten CPU. */
type DemandUnit = "mhz" | "pct";

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Wochenverlauf der Durchschnitts-VM: stündlicher CPU Demand über den gesamten
 * Importzeitraum, darunter dasselbe Signal auf Wochentag × Stunde gefaltet. Die
 * Linie zeigt den konkreten Verlauf inklusive Datenlücken, das Raster das Muster.
 * Beide markieren die laufende Stunde, damit ablesbar ist, welche Last zu genau
 * diesem Wochentag und dieser Uhrzeit normal ist.
 */
export function AverageVmWeekProfile({ workload }: { workload: AverageVmWorkload }) {
  const capacityMHz = workload.configuredCpuCapacityMHz;
  const canShowPct = capacityMHz !== null && capacityMHz > 0;
  const [unit, setUnit] = useState<DemandUnit>("mhz");
  const activeUnit: DemandUnit = canShowPct ? unit : "mhz";

  const data = useMemo<SlotDatum[]>(
    () => workload.slots.map((slot, index) => ({
      index,
      weekdayIndex: slot.weekdayIndex,
      hour: slot.hour,
      cpuDemandMHz: slot.cpuDemandMHz,
      cpuDemandPct: toCapacityPct(slot.cpuDemandMHz, capacityMHz),
      vmSampleCount: slot.vmSampleCount,
    })),
    [workload.slots, capacityMHz],
  );

  /** Ein Tick je Tagesbeginn, zusätzlich der erste Slot, falls der Import mitten am Tag startet. */
  const dayTicks = useMemo(() => {
    const ticks = data.flatMap((slot) => (slot.hour === 0 ? [slot.index] : []));
    return data.length > 0 && ticks[0] !== 0 ? [0, ...ticks] : ticks;
  }, [data]);

  const weekendBands = useMemo(() => buildWeekendBands(data), [data]);
  const nowSlot = workload.nowSlotIndex !== null ? data[workload.nowSlotIndex] : null;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <InfoTooltip entry={OVERVIEW_SECTIONS.averageVmWeekProfile} side="bottom">
            <h4 className="w-fit cursor-help text-[10px] uppercase tracking-wider text-muted-foreground">
              Wochenverlauf · Ø CPU Demand {activeUnit === "pct" ? "in % der zugeteilten CPU" : "in MHz"}
            </h4>
          </InfoTooltip>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-mono-data text-[11px] text-muted-foreground">
              {nowSlot ? (
                <>
                  jetzt {WEEKDAY_LABELS[workload.now.weekdayIndex]} {formatHour(workload.now.hour)} ·{" "}
                  <span className="font-semibold text-warning">{formatSlotValue(nowSlot, activeUnit)}</span> üblich
                </>
              ) : (
                <>Der Import enthält die laufende Stunde nicht</>
              )}
            </p>
            {canShowPct && (
              <ToggleGroup
                type="single"
                value={activeUnit}
                onValueChange={(value) => {
                  if (value === "mhz" || value === "pct") setUnit(value);
                }}
                size="sm"
                variant="outline"
              >
                <ToggleGroupItem value="mhz" aria-label="Absolut in MHz" className="h-6 px-2 text-[10px]">MHz</ToggleGroupItem>
                <ToggleGroupItem value="pct" aria-label="Anteil der zugeteilten CPU in Prozent" className="h-6 px-2 text-[10px]">%</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </header>

        <ResponsiveContainer width="100%" height={168}>
          <AreaChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
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
            <Tooltip content={<SlotTooltip />} />
            <Area
              type="linear"
              dataKey={activeUnit === "pct" ? "cpuDemandPct" : "cpuDemandMHz"}
              stroke="hsl(var(--primary))"
              strokeWidth={1.75}
              fill="hsl(var(--primary))"
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {workload.nowSlotIndex !== null && (
              <ReferenceLine
                x={workload.nowSlotIndex}
                stroke="hsl(var(--warning))"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: "jetzt", position: "top", fill: "hsl(var(--warning))", fontSize: 10 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <WeekHeatmap workload={workload} />
    </div>
  );
}

/** Der aktive Modus bestimmt die Achse; im Tooltip stehen beide Einheiten, damit nichts umgerechnet werden muss. */
function formatSlotValue(slot: SlotDatum, unit: DemandUnit): string {
  return unit === "pct" ? formatDemandPct(slot.cpuDemandPct) : formatDemandMHz(slot.cpuDemandMHz);
}

function SlotTooltip({ active, payload }: { active?: boolean; payload?: { payload: SlotDatum }[] }) {
  const slot = payload?.[0]?.payload;
  if (!active || !slot) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-popover px-2.5 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-popover-foreground">
        {WEEKDAY_LABELS[slot.weekdayIndex]} {formatHour(slot.hour)}
      </p>
      <p className="font-mono-data text-xs text-popover-foreground">
        {formatDemandMHz(slot.cpuDemandMHz)}
        {slot.cpuDemandPct !== null && <span className="text-muted-foreground"> · {formatDemandPct(slot.cpuDemandPct)}</span>}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {slot.vmSampleCount > 0 ? `${formatNum(slot.vmSampleCount)} VMs gemessen` : "keine Messwerte"}
      </p>
    </div>
  );
}

/** Zusammenhängende Sa/So-Abschnitte, die im Verlauf hinterlegt werden. */
function buildWeekendBands(data: readonly SlotDatum[]): { start: number; end: number }[] {
  const bands: { start: number; end: number }[] = [];
  let start: number | null = null;
  data.forEach((slot, index) => {
    const isWeekend = slot.weekdayIndex === 5 || slot.weekdayIndex === 6;
    if (isWeekend && start === null) start = index;
    if (!isWeekend && start !== null) {
      bands.push({ start, end: index - 1 });
      start = null;
    }
  });
  if (start !== null) bands.push({ start, end: data.length - 1 });
  return bands;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Rückfallzeile, falls ein Wochentag gar nicht im Raster steht – bleibt vollständig grau. */
function emptyDay(weekdayIndex: number): AverageVmWorkloadWeekCell[] {
  return HOURS.map((hour): AverageVmWorkloadWeekCell => ({ weekdayIndex, hour, cpuDemandMHz: null, slotCount: 0 }));
}

/**
 * Wochenraster 7 × 24. Die Farbskala trennt am Median der Stundenwerte (siehe
 * `buildHeatScale`): überdurchschnittliche Stunden in der Primärfarbe, ruhige in
 * neutralem Grau. Stunden ohne Messwert bleiben leer statt „null Last".
 */
function WeekHeatmap({ workload }: { workload: AverageVmWorkload }) {
  const [hovered, setHovered] = useState<AverageVmWorkloadWeekCell | null>(null);
  const cellsByDay = useMemo(() => {
    const byDay = new Map<number, AverageVmWorkloadWeekCell[]>();
    for (const cell of workload.weekGrid) {
      const day = byDay.get(cell.weekdayIndex) ?? [];
      day.push(cell);
      byDay.set(cell.weekdayIndex, day);
    }
    return byDay;
  }, [workload.weekGrid]);
  const scale = useMemo(() => buildHeatScale(workload.weekGrid.map((cell) => cell.cpuDemandMHz)), [workload.weekGrid]);
  const hoveredDelta = hovered?.cpuDemandMHz !== null && hovered !== null && scale !== null ? relativeToMedian(hovered.cpuDemandMHz, scale) : null;
  const hoveredPct = toCapacityPct(hovered?.cpuDemandMHz, workload.configuredCpuCapacityMHz);
  const medianPct = toCapacityPct(scale?.median, workload.configuredCpuCapacityMHz);

  return (
    <section className="space-y-2" onMouseLeave={() => setHovered(null)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <InfoTooltip entry={OVERVIEW_SECTIONS.averageVmWeekGrid} side="bottom">
          <h4 className="w-fit cursor-help text-[10px] uppercase tracking-wider text-muted-foreground">
            Wochenraster · Wochentag × Stunde
          </h4>
        </InfoTooltip>
        <p className="font-mono-data text-[11px] text-muted-foreground">
          {hovered ? (
            <>
              {WEEKDAY_LABELS[hovered.weekdayIndex]} {formatHour(hovered.hour)} ·{" "}
              <span className="text-foreground/80">{formatDemandMHz(hovered.cpuDemandMHz)}</span>
              {hoveredPct !== null && <> · {formatDemandPct(hoveredPct)}</>}
              {hoveredDelta !== null && <> · {formatDelta(hoveredDelta)} zum Median</>}
            </>
          ) : scale !== null ? (
            <>
              Median {formatDemandMHz(scale.median)}
              {medianPct !== null && <> · {formatDemandPct(medianPct)}</>}
              {" · Spanne "}
              {formatDemandMHz(scale.min)}–{formatDemandMHz(scale.max)}
            </>
          ) : (
            <>keine Messwerte</>
          )}
        </p>
      </header>

      <div className="space-y-1">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "1.5rem repeat(24, minmax(0, 1fr))" }}>
          {WEEKDAY_LABELS.map((label, weekdayIndex) => (
            <Fragment key={label}>
              <span className="pr-1 text-right font-mono-data text-[10px] leading-4 text-muted-foreground">{label}</span>
              {(cellsByDay.get(weekdayIndex) ?? emptyDay(weekdayIndex)).map((cell) => {
                const isNow = workload.now.weekdayIndex === cell.weekdayIndex && workload.now.hour === cell.hour;
                return (
                  <div
                    key={cell.hour}
                    role="img"
                    aria-label={`${label} ${formatHour(cell.hour)}: ${formatDemandMHz(cell.cpuDemandMHz)}`}
                    onMouseEnter={() => setHovered(cell)}
                    className={cn(
                      "h-4 rounded-[2px] transition-[outline-color] duration-150",
                      cell.cpuDemandMHz === null && "bg-muted/50",
                      isNow && "relative z-10 outline outline-2 outline-offset-1 outline-warning",
                    )}
                    style={cell.cpuDemandMHz === null || scale === null ? undefined : { backgroundColor: heatCellColor(cell.cpuDemandMHz, scale) }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>

        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "1.5rem repeat(24, minmax(0, 1fr))" }} aria-hidden="true">
          <span />
          {HOURS.map((hour) => (
            <span key={hour} className="font-mono-data text-[9px] text-muted-foreground">
              {hour % 6 === 0 ? hour : ""}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 pt-0.5 text-[9px] text-muted-foreground" aria-hidden="true">
          <span>ruhig</span>
          {[0.06, 0.18, 0.3].map((alpha) => (
            <span key={alpha} className="h-2 w-3 rounded-[1px]" style={{ backgroundColor: `hsl(var(--muted-foreground) / ${alpha})` }} />
          ))}
          <span className="px-0.5 text-foreground/70">Median</span>
          {[0.18, 0.38, 0.58, 0.78, 0.95].map((alpha) => (
            <span key={alpha} className="h-2 w-3 rounded-[1px]" style={{ backgroundColor: `hsl(var(--primary) / ${alpha})` }} />
          ))}
          <span>Lastspitze</span>
        </div>
      </div>
    </section>
  );
}

/** Vorzeichenbehaftet, weil der Vergleich zum Median in beide Richtungen gelesen wird. */
function formatDelta(percent: number): string {
  const rounded = Math.round(percent);
  if (rounded === 0) return "±0 %";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString("de-DE")} %`;
}
