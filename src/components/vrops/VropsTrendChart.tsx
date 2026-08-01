import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { findWeekTimeMarkerTimestamp } from "@/lib/weekTimeMarker";
import { describeTrendRange, downsampleTrendPoints } from "@/lib/trendDownsampling";
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
 * Historischer Auslastungsverlauf aus einem vROps-Zeitreihenimport. Bewusst als
 * eigenständige, umrandete Sektion (statt weiterer KPI-Kachel) gestaltet,
 * damit sie als Zeitverlauf statt als weiterer Momentaufnahme-Wert erkennbar
 * ist — das gleiche Muster wie in der Fill-Up-Planung.
 *
 * Der Zeitraum ergibt sich aus dem Import und ist nicht auf eine Woche
 * festgelegt. Längere Zeiträume werden zu Fenstern verdichtet (siehe
 * `trendDownsampling.ts`); das Band um die Linie zeigt dann die Spanne
 * innerhalb des Fensters, ergänzt um die Stundenmaxima aus `Demand Max`.
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
  const rangeLabel = describeTrendRange(hourly.length);

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
          <TrendingUp className="h-3.5 w-3.5" /> Auslastungsverlauf (vROps)
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

  const sampled = downsampleTrendPoints(hourly.map((point) => ({
    timestampMs: point.timestampUtc,
    cpu: point.cpuDemandMHz,
    cpuPeak: point.cpuDemandMaxMHz,
    secondary: point.secondaryValue,
  })));
  /**
   * Das Band trägt nur dann eine Aussage, wenn es etwas zu zeigen gibt: entweder
   * wurden mehrere Stunden zu einem Fenster verdichtet, oder die Quelle liefert
   * Stundenmaxima. Andernfalls fielen Ober- und Untergrenze mit der Linie zusammen.
   */
  const hasBand = sampled.some((point) => point.sampleCount > 1 || point.cpuPeak !== null);
  const bucketHours = sampled[0]?.sampleCount ?? 1;
  const toPercent = (value: number | null) => (value === null || !cpuCapacityMHz ? null : (value / cpuCapacityMHz) * 100);
  const toGigahertz = (value: number | null) => (value === null ? null : value / 1_000);

  const chartData = sampled.map((point) => {
    const low = isPercent && cpuCapacityMHz ? toPercent(point.cpuLow) : toGigahertz(point.cpuLow);
    const high = isPercent && cpuCapacityMHz ? toPercent(point.cpuHigh) : toGigahertz(point.cpuHigh);
    return {
      timestampMs: point.timestampMs,
      cpuAbs: toGigahertz(point.cpu),
      cpuPct: toPercent(point.cpu),
      cpuBand: low === null || high === null ? null : ([low, high] as [number, number]),
      cpuHigh: high,
      secondaryAbs: point.secondary === null ? null : secondaryIsPct ? point.secondary : point.secondary / 1_024,
      secondaryPct: point.secondary === null
        ? null
        : secondaryIsPct
          ? point.secondary
          : secondaryCapacity
            ? (point.secondary / secondaryCapacity) * 100
            : null,
    };
  });

  // Der Import liegt in der Vergangenheit; markiert wird deshalb die gleiche Wochenzeit.
  const nowMarkerTimestamp = findWeekTimeMarkerTimestamp(chartData.map((point) => point.timestampMs));
  // Der Peak folgt der Bandobergrenze, sobald es eine gibt: Nach der Verdichtung
  // wäre das Maximum der Mittelwertlinie nicht mehr die tatsächliche Spitze.
  const peakKey = hasBand ? "cpuHigh" : cpuDataKey;
  const peak = chartData.reduce<(typeof chartData)[number] | null>((current, point) => {
    const value = point[peakKey] as number | null;
    const currentValue = current?.[peakKey] as number | null | undefined;
    return value !== null && (currentValue === null || currentValue === undefined || value > currentValue) ? point : current;
  }, null);
  // Bewusst aus den ungefilterten Stundenwerten: Nach der Verdichtung liegen die
  // Punkte mehrere Stunden auseinander, und die Wochenendflächen bekämen Lücken.
  const weekendRanges = hourly.reduce<Array<{ start: number; end: number }>>((ranges, point) => {
    const date = new Date(point.timestampUtc);
    if (![0, 6].includes(date.getDay())) return ranges;
    const last = ranges.at(-1);
    if (last && point.timestampUtc - last.end <= 60 * 60 * 1_000) last.end = point.timestampUtc;
    else ranges.push({ start: point.timestampUtc, end: point.timestampUtc });
    return ranges;
  }, []);

  return (
    <section className="rounded-xl bg-muted/15 p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Auslastungsverlauf (vROps, {rangeLabel})
          </h4>
          <p className="text-[10px] text-muted-foreground">
            {bucketHours > 1 ? `${bucketHours}-Stunden-Fenster` : "Stündliche Werte"}
            {hasBand ? " · Band = Spanne bis zum Höchstwert" : ""}
            {" · Wochenende schattiert · Peak markiert · „Jetzt“ = gleicher Wochentag und Stunde"}
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
          <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
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
            {hasBand && (
              <Area
                yAxisId="cpu"
                dataKey="cpuBand"
                name={cpuDataKey === "cpuPct" ? "Spanne %" : "Spanne GHz"}
                type="monotone"
                fill="hsl(var(--primary))"
                fillOpacity={0.16}
                stroke="none"
                isAnimationActive={false}
                connectNulls
              />
            )}
            <Line yAxisId="cpu" dataKey={cpuDataKey} name={cpuName} type="monotone" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls />
            {hasSecondary && <Line yAxisId="secondary" dataKey={secondaryDataKey} name={secondaryName} type="monotone" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} connectNulls />}
            {peak && (
              <ReferenceDot
                yAxisId="cpu"
                x={peak.timestampMs}
                y={peak[peakKey] as number}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {peak && peak[peakKey] !== null && (
        <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          Peak: {(peak[peakKey] as number).toLocaleString("de-DE", { maximumFractionDigits: 2 })}{cpuDataKey === "cpuPct" ? " %" : " GHz"} · {formatTooltipTimestamp(peak.timestampMs)}
        </p>
      )}
    </section>
  );
}
