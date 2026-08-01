import { useId, useState } from "react";
import { Check, Clock3, EyeOff, TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { findWeekTimeMarkerTimestamp } from "@/lib/weekTimeMarker";
import { aggregateTrendPoints, buildAverageWeekTrendPoints, cpuDemandAvoidanceThreshold, describeTrendRange } from "@/lib/trendDownsampling";
import { findAustrianPublicHolidayRanges } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";

type ChartUnit = "absolute" | "percent";
type ChartView = "timeline" | "average-week";
type WindowHours = 1 | 3;

/** getDay(): 0 = Sonntag. */
const WEEKDAY_LABELS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const HOUR_MS = 60 * 60 * 1_000;

function formatAxisTimestamp(timestampMs: number, view: ChartView): string {
  const date = new Date(timestampMs);
  if (view === "average-week") return `${WEEKDAY_LABELS[date.getDay()]} ${String(date.getHours()).padStart(2, "0")}:00`;
  return `${WEEKDAY_LABELS[date.getDay()]} ${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
}

function formatTooltipTimestamp(timestampMs: number, view: ChartView): string {
  const date = new Date(timestampMs);
  if (view === "average-week") return `${WEEKDAY_NAMES[date.getDay()]} · ${String(date.getHours()).padStart(2, "0")}:00 Uhr · durchschnittliche Woche`;
  return date.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function valuePeak<T extends Record<string, unknown>>(points: readonly T[], key: keyof T): T | null {
  return points.reduce<T | null>((current, point) => {
    const value = point[key];
    const currentValue = current?.[key];
    return typeof value === "number" && (typeof currentValue !== "number" || value > currentValue) ? point : current;
  }, null);
}

function toGigahertz(value: number | null): number | null {
  return value === null ? null : value / 1_000;
}

function formatNumber(value: number, unit: string): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
}

interface VropsTrendChartProps {
  hourly: VropsObjectTrendPoint[];
  cpuCapacityMHz: number | null;
  secondaryCapacity: number | null;
  /** "pct": secondaryValue liegt bereits als Prozent vor (z.B. CPU Ready). "MiB": muss wie CPU über die Kapazität umgerechnet werden. */
  secondaryUnit?: "pct" | "MiB";
  secondaryLabel?: string;
  hasImport: boolean;
  isMatched: boolean;
  isLoading: boolean;
  importedAt?: string | null;
}

/** Präzisionsansicht für historische Last: Durchschnitt und Peak bleiben getrennt ablesbar. */
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
  const gradientId = useId().replace(/:/g, "");
  const [chartUnit, setChartUnit] = useState<ChartUnit>(cpuCapacityMHz ? "percent" : "absolute");
  const [chartView, setChartView] = useState<ChartView>("timeline");
  const [windowHours, setWindowHours] = useState<WindowHours>(3);
  const [cpuVisible, setCpuVisible] = useState(true);
  // CPU Ready startet bewusst zurückhaltend; RAM und andere Sekundärmetriken
  // bleiben in den übrigen Detailansichten wie bisher direkt sichtbar.
  const [secondaryVisible, setSecondaryVisible] = useState(Boolean(secondaryLabel) && secondaryLabel !== "CPU Ready");
  const rangeLabel = describeTrendRange(hourly.length);

  if (!hasImport) return null;

  if (isLoading) {
    return (
      <section className="rounded-xl bg-muted/15 p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]">
        <p className="text-xs text-muted-foreground">vROps-Zeitreihe wird geladen…</p>
      </section>
    );
  }

  if (!isMatched) {
    return (
      <section className="rounded-xl bg-muted/15 p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]">
        <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="size-3.5" /> Auslastungsverlauf (vROps)
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
  const cpuUnit = cpuDataKey === "cpuPct" ? "%" : "GHz";
  const secondaryDisplayUnit = secondaryDataKey === "secondaryPct" ? "%" : "GiB";
  const percentUnavailable = !cpuCapacityMHz;

  const sourcePoints = hourly.map((point) => ({
    timestampMs: point.timestampUtc,
    cpu: point.cpuDemandMHz,
    cpuPeak: point.cpuDemandMaxMHz,
    secondary: point.secondaryValue,
  }));
  const sampled = chartView === "average-week"
    ? buildAverageWeekTrendPoints(sourcePoints)
    : aggregateTrendPoints(sourcePoints, windowHours);
  const hasBand = sampled.some((point) => point.sampleCount > 1 || point.cpuPeak !== null);
  const toPercent = (value: number | null) => (value === null || !cpuCapacityMHz ? null : (value / cpuCapacityMHz) * 100);

  const chartData = sampled.map((point) => {
    const low = isPercent && cpuCapacityMHz ? toPercent(point.cpuLow) : toGigahertz(point.cpuLow);
    const high = isPercent && cpuCapacityMHz ? toPercent(point.cpuHigh) : toGigahertz(point.cpuHigh);
    return {
      timestampMs: point.timestampMs,
      sampleCount: point.sampleCount,
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

  const now = new Date();
  const currentWeekHour = ((now.getDay() + 6) % 7) * 24 + now.getHours();
  const averageWeekNow = chartView === "average-week"
    ? sampled.find((point) => "weekHour" in point && point.weekHour === currentWeekHour)?.timestampMs ?? null
    : null;
  const nowMarkerTimestamp = chartView === "average-week"
    ? averageWeekNow
    : findWeekTimeMarkerTimestamp(chartData.map((point) => point.timestampMs));
  const cpuPeak = valuePeak(chartData, "cpuHigh");
  const secondaryPeak = hasSecondary ? valuePeak(chartData, secondaryDataKey) : null;
  const avoidanceThreshold = cpuDemandAvoidanceThreshold(cpuCapacityMHz, chartUnit);
  const avoidanceZoneMax = typeof cpuPeak?.cpuHigh === "number"
    && avoidanceThreshold !== null
    && cpuPeak.cpuHigh > avoidanceThreshold
    ? cpuPeak.cpuHigh
    : null;

  // Die Ø-Woche liegt immer auf der künstlichen Woche ab Montag, 01.01.2024.
  // Das Wochenende wird daher als vollständiger, fester Bereich eingezeichnet –
  // auch wenn einzelne Wochenstunden keine verwertbaren Messwerte enthalten.
  const weekendRanges = chartView === "average-week"
    ? [{ start: new Date(2024, 0, 6).getTime(), end: new Date(2024, 0, 8).getTime() }]
    // Im Zeitverlauf nur tatsächlich vorhandene Wochenendstunden hervorheben,
    // damit Lücken im Import nicht als Messdaten wirken.
    : hourly.map((point) => point.timestampUtc).reduce<Array<{ start: number; end: number }>>((ranges, timestamp) => {
      const date = new Date(timestamp);
      if (![0, 6].includes(date.getDay())) return ranges;
      const last = ranges.at(-1);
      if (last && timestamp - last.end <= HOUR_MS) last.end = timestamp;
      else ranges.push({ start: timestamp, end: timestamp });
      return ranges;
    }, []);
  const holidayRanges = chartView === "timeline" ? findAustrianPublicHolidayRanges(hourly.map((point) => point.timestampUtc)) : [];
  const holidayNames = [...new Set(holidayRanges.map((range) => range.name))];

  const formatTooltipValue = (value: number | [number, number], name: string) => {
    if (Array.isArray(value)) return [`${formatNumber(value[0], cpuUnit)} – ${formatNumber(value[1], cpuUnit)}`, "CPU-Bereich (Minimum–Peak)"];
    const unit = name.startsWith("CPU") ? cpuUnit : secondaryDisplayUnit;
    return [formatNumber(value, unit), name];
  };
  const cpuPeakLabel = cpuPeak?.cpuHigh === null || cpuPeak?.cpuHigh === undefined ? "—" : formatNumber(cpuPeak.cpuHigh, cpuUnit);
  const secondaryPeakValue = secondaryPeak?.[secondaryDataKey];
  const secondaryPeakLabel = typeof secondaryPeakValue === "number" ? formatNumber(secondaryPeakValue, secondaryDisplayUnit) : "—";

  const toggleMetric = (metric: "cpu" | "secondary") => {
    if (metric === "cpu") {
      if (cpuVisible && (!hasSecondary || !secondaryVisible)) return;
      setCpuVisible((visible) => !visible);
      return;
    }
    if (secondaryVisible && !cpuVisible) return;
    setSecondaryVisible((visible) => !visible);
  };

  const contextText = chartView === "average-week"
    ? "Linie = Mittelwert je Wochenstunde · Band = historisches Minimum bis Peak"
    : windowHours === 1
      ? "Stündliche Werte · Band = Stundenmittel bis Peak"
      : "3-Stunden-Fenster · Linie = Mittelwert · Band = Minimum bis Peak";

  return (
    <section className="rounded-2xl bg-muted/[0.12] p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65),0_1px_2px_hsl(var(--foreground)/0.03)] sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-balance">
                <TrendingUp className="size-3.5" /> Auslastungsverlauf
              </h4>
              <span className="rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]">{rangeLabel}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground text-pretty">
              {contextText}. Wochenende grau, österreichweite Feiertage gold markiert.
              {importedAt ? ` Import vom ${new Date(importedAt).toLocaleString("de-DE")}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" size="sm" value={chartView} onValueChange={(value) => value && setChartView(value as ChartView)} aria-label="Darstellung wählen" className="rounded-xl bg-background/70 p-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
              <ToggleGroupItem value="timeline" aria-label="Zeitverlauf anzeigen" className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Zeitverlauf</ToggleGroupItem>
              <ToggleGroupItem value="average-week" aria-label="Durchschnittliche Woche anzeigen" className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Ø Woche</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup type="single" size="sm" value={chartUnit} onValueChange={(value) => value && setChartUnit(value as ChartUnit)} aria-label="Einheit wählen" className="rounded-xl bg-background/70 p-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
              <ToggleGroupItem value="absolute" aria-label="Absolute Werte anzeigen" className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Absolut</ToggleGroupItem>
              <ToggleGroupItem value="percent" aria-label="Prozent der Kapazität anzeigen" disabled={percentUnavailable} className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Prozent</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" aria-label="Metriken ein- oder ausblenden">
            <button
              type="button"
              aria-pressed={cpuVisible}
              onClick={() => toggleMetric("cpu")}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-xl px-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)] transition-[scale,background-color,box-shadow] duration-150 ease-out active:scale-[0.96]",
                cpuVisible ? "bg-background text-foreground" : "bg-muted/30 text-muted-foreground",
              )}
            >
              <span className="grid size-5 place-items-center rounded-full bg-gradient-to-tr from-success via-warning to-destructive text-white">{cpuVisible ? <Check className="size-3" /> : <EyeOff className="size-3" />}</span>
              <span><span className="block text-xs font-semibold">CPU Demand</span><span className="block font-mono text-[10px] tabular-nums text-muted-foreground">Peak {cpuPeakLabel}</span></span>
            </button>
            {hasSecondary && (
              <button
                type="button"
                aria-pressed={secondaryVisible}
                onClick={() => toggleMetric("secondary")}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-xl px-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)] transition-[scale,background-color,box-shadow] duration-150 ease-out active:scale-[0.96]",
                  secondaryVisible ? "bg-background text-foreground" : "bg-muted/30 text-muted-foreground",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-white", secondaryVisible ? "bg-chart-6" : "bg-muted-foreground/35")}>{secondaryVisible ? <Check className="size-3" /> : <EyeOff className="size-3" />}</span>
                <span><span className="block text-xs font-semibold">{secondaryLabel}</span><span className="block font-mono text-[10px] tabular-nums text-muted-foreground">Peak {secondaryPeakLabel}</span></span>
              </button>
            )}
          </div>
          {chartView === "timeline" && (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex"><Clock3 className="size-3.5" /> Auflösung</span>
              <ToggleGroup type="single" size="sm" value={String(windowHours)} onValueChange={(value) => value && setWindowHours(Number(value) as WindowHours)} aria-label="Zeitfenster wählen" className="rounded-xl bg-background/70 p-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
                <ToggleGroupItem value="1" aria-label="Ein-Stunden-Fenster" className="min-h-10 rounded-lg px-3 font-mono tabular-nums active:scale-[0.96]">1 Std.</ToggleGroupItem>
                <ToggleGroupItem value="3" aria-label="Drei-Stunden-Fenster" className="min-h-10 rounded-lg px-3 font-mono tabular-nums active:scale-[0.96]">3 Std.</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 18, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`${gradientId}-load`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--success))" />
                <stop offset="52%" stopColor="hsl(var(--warning))" />
                <stop offset="100%" stopColor="hsl(var(--destructive))" />
              </linearGradient>
              <linearGradient id={`${gradientId}-band`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.08" />
                <stop offset="58%" stopColor="hsl(var(--warning))" stopOpacity="0.14" />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
            {weekendRanges.map((range) => (
              <ReferenceArea
                key={`weekend-${range.start}`}
                yAxisId="cpu"
                x1={range.start}
                x2={chartView === "average-week" ? range.end : range.end + HOUR_MS}
                // Das kanonische Ende der Ø-Woche liegt exakt nach Sonntag 23 Uhr.
                // Recharts verwirft eine Fläche außerhalb der Datenachse sonst komplett.
                ifOverflow={chartView === "average-week" ? "extendDomain" : "hidden"}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.065}
                strokeOpacity={0}
              />
            ))}
            {holidayRanges.map((range) => (
              <ReferenceArea key={`holiday-${range.start}`} yAxisId="cpu" x1={range.start} x2={range.end + HOUR_MS} fill="hsl(var(--warning))" fillOpacity={0.11} strokeOpacity={0} />
            ))}
            {cpuVisible && avoidanceZoneMax !== null && avoidanceThreshold !== null && (
              <>
                <ReferenceArea
                  yAxisId="cpu"
                  y1={avoidanceThreshold}
                  y2={avoidanceZoneMax}
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.085}
                  strokeOpacity={0}
                  label={{ value: "Vermeiden · > 80 %", position: "insideTopRight", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
                />
                <ReferenceLine
                  yAxisId="cpu"
                  y={avoidanceThreshold}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="3 4"
                  strokeOpacity={0.5}
                />
              </>
            )}
            <XAxis
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              dataKey="timestampMs"
              minTickGap={46}
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => formatAxisTimestamp(value, chartView)}
            />
            <YAxis
              yAxisId="cpu"
              hide={!cpuVisible}
              tick={{ fontSize: 10 }}
              width={46}
              tickFormatter={cpuDataKey === "cpuPct" ? (value: number) => `${value} %` : undefined}
            />
            {hasSecondary && (
              <YAxis
                yAxisId="secondary"
                hide={!secondaryVisible}
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
              formatter={formatTooltipValue}
              labelFormatter={(value: number) => formatTooltipTimestamp(value, chartView)}
            />
            {cpuVisible && hasBand && (
              <Area
                yAxisId="cpu"
                dataKey="cpuBand"
                name="CPU-Bereich"
                type="monotone"
                fill={`url(#${gradientId}-band)`}
                stroke="none"
                isAnimationActive={false}
                connectNulls
              />
            )}
            {cpuVisible && <Line yAxisId="cpu" dataKey={cpuDataKey} name={chartView === "average-week" ? "CPU Demand (Durchschnitt)" : windowHours === 3 ? "CPU Demand (3-Std.-Mittel)" : "CPU Demand (Stundenmittel)"} type="monotone" stroke={`url(#${gradientId}-load)`} dot={false} strokeWidth={2.25} connectNulls isAnimationActive={false} />}
            {hasSecondary && secondaryVisible && <Line yAxisId="secondary" dataKey={secondaryDataKey} name={chartView === "average-week" ? `${secondaryLabel} (Durchschnitt)` : `${secondaryLabel} (Maximum)`} type="monotone" stroke="hsl(var(--chart-6))" dot={false} strokeWidth={1.75} strokeDasharray="5 3" connectNulls isAnimationActive={false} />}
            {cpuVisible && cpuPeak && typeof cpuPeak.cpuHigh === "number" && (
              <ReferenceDot
                yAxisId="cpu"
                x={cpuPeak.timestampMs}
                y={cpuPeak.cpuHigh}
                r={4.5}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                label={{ value: `Peak · ${cpuPeakLabel}`, position: "top", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
              />
            )}
            {hasSecondary && secondaryVisible && secondaryPeak && typeof secondaryPeakValue === "number" && (
              <ReferenceDot
                yAxisId="secondary"
                x={secondaryPeak.timestampMs}
                y={secondaryPeakValue}
                r={3.5}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                label={{ value: `Peak · ${secondaryPeakLabel}`, position: "top", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
              />
            )}
            {nowMarkerTimestamp !== null && (
              <ReferenceLine
                yAxisId="cpu"
                x={nowMarkerTimestamp}
                stroke="hsl(var(--foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.62}
                label={{ value: "Jetzt", position: "top", fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 600 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />geringe Last</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />erhöhte Last</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />Spitzenlast</span>
          {avoidanceZoneMax !== null && <span className="flex items-center gap-1.5 font-medium text-destructive"><span className="h-2 w-4 rounded-sm bg-destructive/10 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.25)]" />Vermeidungszone &gt; 80 % CPU</span>}
          {holidayNames.length > 0 && <span>Feiertage: {holidayNames.join(", ")}</span>}
        </div>
        {cpuVisible && cpuPeak && typeof cpuPeak.cpuHigh === "number" && (
          <p className="font-mono tabular-nums">CPU-Peak {cpuPeakLabel} · {formatTooltipTimestamp(cpuPeak.timestampMs, chartView)}</p>
        )}
      </div>
    </section>
  );
}
