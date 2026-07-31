import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { findWeekTimeMarkerTimestamp } from "@/lib/weekTimeMarker";
import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";

type ChartUnit = "absolute" | "percent";

/** getDay(): 0 = Sonntag. */
const WEEKDAY_LABELS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];

function formatAxisTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${WEEKDAY_LABELS[date.getDay()]} ${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
}

function formatTooltipTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface VropsTrendChartProps {
  hourly: VropsObjectTrendPoint[];
  cpuCapacityMHz: number | null;
  secondaryCapacity: number | null;
  /** "pct": secondaryValue liegt bereits als Prozent vor (z.B. CPU Ready). "MiB": muss wie CPU über die Kapazität umgerechnet werden. Weggelassen: Chart zeigt nur CPU Demand. */
  secondaryUnit?: "pct" | "MiB";
  secondaryLabel?: string;
  hasImport: boolean;
  isMatched: boolean;
  isLoading: boolean;
  importedAt?: string | null;
}

/**
 * Historischer 7-Tage-Verlauf aus einem vROps-Zeitreihenimport. Bewusst als
 * eigenständige, umrandete Sektion (statt weiterer KPI-Kachel) gestaltet,
 * damit sie als Zeitverlauf statt als weiterer Momentaufnahme-Wert erkennbar
 * ist — das gleiche Muster wie in der Fill-Up-Planung.
 */
export function VropsTrendChart({
  hourly,
  cpuCapacityMHz,
  secondaryCapacity,
  secondaryUnit,
  secondaryLabel,
  hasImport,
  isMatched,
  isLoading,
  importedAt,
}: VropsTrendChartProps) {
  const [chartUnit, setChartUnit] = useState<ChartUnit>(cpuCapacityMHz ? "percent" : "absolute");

  if (!hasImport) return null;

  if (isLoading) {
    return (
      <section className="rounded-md border bg-muted/10 p-3">
        <p className="text-xs text-muted-foreground">vROps-Zeitreihe wird geladen…</p>
      </section>
    );
  }

  if (!isMatched) {
    return (
      <section className="rounded-md border border-dashed bg-muted/10 p-3">
        <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Auslastungsverlauf (vROps, 7 Tage)
        </h4>
        <p className="text-xs text-muted-foreground">Keine vROps-Zeitreihe für dieses Objekt gefunden.</p>
      </section>
    );
  }

  const hasSecondary = secondaryLabel !== undefined;
  const secondaryIsPct = secondaryUnit === "pct";
  const isPercent = chartUnit === "percent";
  const cpuDataKey = isPercent && cpuCapacityMHz ? "cpuPct" : "cpuAbs";
  const secondaryDataKey = secondaryIsPct ? "secondaryPct" : isPercent && secondaryCapacity ? "secondaryPct" : "secondaryAbs";
  const cpuName = cpuDataKey === "cpuPct" ? "CPU Demand %" : "CPU Demand GHz";
  const secondaryName = secondaryIsPct ? `${secondaryLabel} %` : secondaryDataKey === "secondaryPct" ? `${secondaryLabel} %` : `${secondaryLabel} GiB`;
  const percentUnavailable = hasSecondary ? !cpuCapacityMHz && (secondaryIsPct || !secondaryCapacity) : !cpuCapacityMHz;

  const chartData = hourly.map((point) => ({
    timestampMs: point.timestampUtc,
    cpuAbs: point.cpuDemandMHz === null ? null : point.cpuDemandMHz / 1_000,
    cpuPct: point.cpuDemandMHz === null || !cpuCapacityMHz ? null : (point.cpuDemandMHz / cpuCapacityMHz) * 100,
    secondaryAbs: point.secondaryValue === null ? null : secondaryIsPct ? point.secondaryValue : point.secondaryValue / 1_024,
    secondaryPct: point.secondaryValue === null
      ? null
      : secondaryIsPct
        ? point.secondaryValue
        : secondaryCapacity
          ? (point.secondaryValue / secondaryCapacity) * 100
          : null,
  }));

  // Der Import liegt in der Vergangenheit; markiert wird deshalb die gleiche Wochenzeit.
  const nowMarkerTimestamp = findWeekTimeMarkerTimestamp(chartData.map((point) => point.timestampMs));
  const peak = chartData.reduce<(typeof chartData)[number] | null>((current, point) => {
    const value = point[cpuDataKey] as number | null;
    const currentValue = current?.[cpuDataKey] as number | null | undefined;
    return value !== null && (currentValue === null || currentValue === undefined || value > currentValue) ? point : current;
  }, null);
  const weekendRanges = chartData.reduce<Array<{ start: number; end: number }>>((ranges, point) => {
    const date = new Date(point.timestampMs);
    if (![0, 6].includes(date.getDay())) return ranges;
    const last = ranges.at(-1);
    if (last && point.timestampMs - last.end <= 60 * 60 * 1_000) last.end = point.timestampMs;
    else ranges.push({ start: point.timestampMs, end: point.timestampMs });
    return ranges;
  }, []);

  return (
    <section className="rounded-xl bg-muted/15 p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Auslastungsverlauf (vROps, 7 Tage)
          </h4>
          <p className="text-[10px] text-muted-foreground">
            Stündliche Werte · Wochenende schattiert · Peak markiert · „Jetzt“ = gleicher Wochentag und Stunde
            {importedAt ? ` · Import vom ${new Date(importedAt).toLocaleString("de-DE")}` : ""}
          </p>
        </div>
        <ToggleGroup type="single" size="sm" value={chartUnit} onValueChange={(value) => value && setChartUnit(value as ChartUnit)}>
          <ToggleGroupItem value="absolute" aria-label="Absolute Werte anzeigen">Absolut</ToggleGroupItem>
          <ToggleGroupItem value="percent" aria-label="Prozent der Kapazität anzeigen" disabled={percentUnavailable}>Prozent</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
            {weekendRanges.map((range) => (
              <ReferenceArea
                key={range.start}
                yAxisId="cpu"
                x1={range.start}
                x2={range.end + 60 * 60 * 1_000}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.07}
                strokeOpacity={0}
              />
            ))}
            <XAxis
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              dataKey="timestampMs"
              minTickGap={46}
              tick={{ fontSize: 10 }}
              tickFormatter={formatAxisTimestamp}
            />
            <YAxis
              yAxisId="cpu"
              tick={{ fontSize: 10 }}
              width={46}
              tickFormatter={cpuDataKey === "cpuPct" ? (value: number) => `${value} %` : undefined}
            />
            {hasSecondary && (
              <YAxis
                yAxisId="secondary"
                orientation="right"
                tick={{ fontSize: 10 }}
                width={46}
                tickFormatter={secondaryDataKey === "secondaryPct" ? (value: number) => `${value} %` : undefined}
              />
            )}
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={(value: number, name: string) => [value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name]}
              labelFormatter={(value: number) => formatTooltipTimestamp(value)}
            />
            {hasSecondary && <Legend wrapperStyle={{ fontSize: 12 }} />}
            <Line yAxisId="cpu" dataKey={cpuDataKey} name={cpuName} type="monotone" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls />
            {hasSecondary && <Line yAxisId="secondary" dataKey={secondaryDataKey} name={secondaryName} type="monotone" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} connectNulls />}
            {peak && (
              <ReferenceDot
                yAxisId="cpu"
                x={peak.timestampMs}
                y={peak[cpuDataKey] as number}
                r={4}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                label={{ value: "Peak", position: "top", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
              />
            )}
            {nowMarkerTimestamp !== null && (
              <ReferenceLine
                yAxisId="cpu"
                x={nowMarkerTimestamp}
                stroke="hsl(var(--foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{ value: "Jetzt", position: "top", fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 600 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {peak && (
        <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          Peak: {(peak[cpuDataKey] as number).toLocaleString("de-DE", { maximumFractionDigits: 2 })}{cpuDataKey === "cpuPct" ? " %" : " GHz"} · {formatTooltipTimestamp(peak.timestampMs)}
        </p>
      )}
    </section>
  );
}
