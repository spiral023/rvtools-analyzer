import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charts/recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CHART_AXIS_STYLE,
  CHART_COLORS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chartStyles";
import { DAY_LABELS } from "@/lib/maintenanceWindows";
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import {
  buildMaintenanceCoverage,
  excludedSystemsCount,
  findCurrentCoverageIndex,
  formatSlotTime,
  getCoverageRange,
  mondayBasedWeekday,
} from "@/lib/maintenanceWindowCoverage";
import type { CoverageSlot, CoverageView } from "@/lib/maintenanceWindowCoverage";
import { MaintenanceCoverageHeatmap } from "@/components/maintenance-windows/MaintenanceCoverageHeatmap";

const SLOTS_PER_DAY = 48;

function formatAxisTick(index: number, slots: readonly CoverageSlot[], view: CoverageView): string {
  const entry = slots[index];
  if (!entry) return "";
  if (view === "day") return formatSlotTime(entry.slot).slice(0, 5);
  return DAY_LABELS[mondayBasedWeekday(entry.date)].slice(0, 2);
}

function formatTooltipLabel(index: number, slots: readonly CoverageSlot[], view: CoverageView): string {
  const entry = slots[index];
  if (!entry) return "";
  const time = formatSlotTime(entry.slot);
  if (view === "day") return time;
  return `${DAY_LABELS[mondayBasedWeekday(entry.date)]} ${time}`;
}

function getAxisTicks(slotCount: number, view: CoverageView): number[] {
  if (view === "day") return Array.from({ length: 6 }, (_, i) => i * 8);
  const days = slotCount / SLOTS_PER_DAY;
  return Array.from({ length: days }, (_, day) => day * SLOTS_PER_DAY);
}

export interface MaintenanceCoverageChartProps {
  known: KnownMaintenanceWindowAssignment[];
}

export function MaintenanceCoverageChart({ known }: MaintenanceCoverageChartProps) {
  const [view, setView] = useState<CoverageView>("week");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const range = useMemo(() => getCoverageRange(view, now), [view, now]);
  const slots = useMemo(() => buildMaintenanceCoverage(known, range), [known, range]);
  const currentIndex = useMemo(() => findCurrentCoverageIndex(slots, now), [slots, now]);
  const excludedCount = useMemo(() => excludedSystemsCount(known), [known]);
  const hasCoverage = useMemo(() => slots.some((entry) => entry.count > 0), [slots]);
  const chartData = useMemo(() => slots.map((entry, index) => ({ index, count: entry.count })), [slots]);
  const axisTicks = useMemo(() => getAxisTicks(slots.length, view), [slots.length, view]);

  return (
    <section className="space-y-3" aria-labelledby="maintenance-coverage-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="maintenance-coverage-title" className="text-base font-semibold">Auslastung nach Uhrzeit</h2>
          <p className="text-xs text-muted-foreground">Anzahl Systeme mit offenem Wartungsfenster je Zeitpunkt.</p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "day" || value === "week" || value === "month") setView(value);
          }}
          size="sm"
          variant="outline"
          className="justify-start"
        >
          <ToggleGroupItem value="day" aria-label="Tagesansicht">Tag</ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Wochenansicht">Woche</ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Monatsansicht">Monat</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!hasCoverage ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-card/30 p-4 text-sm text-muted-foreground">
          Noch keine Systeme mit automatisch planbarem Wartungsfenster zugeordnet.
        </p>
      ) : view === "month" ? (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <MaintenanceCoverageHeatmap slots={slots} currentIndex={currentIndex} />
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke={CHART_GRID_STYLE.stroke} strokeDasharray={CHART_GRID_STYLE.strokeDasharray} vertical={false} />
              <XAxis
                dataKey="index"
                type="number"
                domain={[0, chartData.length - 1]}
                ticks={axisTicks}
                tickFormatter={(index: number) => formatAxisTick(index, slots, view)}
                tick={CHART_AXIS_STYLE}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                labelFormatter={(index: number) => formatTooltipLabel(index, slots, view)}
                formatter={(value: number) => [`${value} Systeme`, "Im Wartungsfenster"]}
              />
              <Area
                type="stepAfter"
                dataKey="count"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {currentIndex !== null && (
                <ReferenceLine
                  x={currentIndex}
                  stroke={CHART_COLORS.primary}
                  strokeDasharray="4 4"
                  label={{ value: "Jetzt", position: "top", fill: CHART_COLORS.primary, fontSize: 11 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {excludedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {excludedCount} {excludedCount === 1 ? "System ist" : "Systeme sind"} mit „Freigabe erforderlich“ oder „Extern verwaltet“ nicht enthalten, da kein automatisches Zeitfenster besteht.
        </p>
      )}
    </section>
  );
}
