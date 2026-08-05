import { useId, useState } from "react";
import { Check, Clock3, EyeOff, TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { findWeekTimeMarkerTimestamp } from "@/lib/weekTimeMarker";
import { CPU_DEMAND_AVOIDANCE_THRESHOLD_PCT, aggregateTrendPoints, buildAverageWeekTrendPoints, describeTrendRange, trendAvoidanceThreshold } from "@/lib/trendDownsampling";
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

function formatNumber(value: number, unit: string): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
}

/**
 * Kennzahl der Primärreihe. "cpu-demand" liest `hourly` als MHz-Reihe,
 * "memory-workload" als Prozentreihe des konfigurierten RAM — die vROps-Metrik
 * `Memory|Workload` ist bereits relativ zur RAM-Größe der VM.
 */
export type VropsTrendPrimaryMetric = "cpu-demand" | "memory-workload";

/**
 * Rechenregeln der Primärreihe. Beide Metriken kennen eine Prozent- und eine
 * Absolutansicht, nur die Richtung der Umrechnung unterscheidet sich: CPU liegt
 * absolut vor und wird über die Kapazität relativiert, RAM-Workload liegt
 * relativ vor und wird über die konfigurierte Größe absolut gemacht.
 */
interface PrimaryScale {
  /** Beschriftung in Legende, Linienname und Tooltip. */
  label: string;
  /** Kurzform für Peak-Zeile und Vermeidungszone. */
  shortLabel: string;
  absoluteUnit: string;
  absoluteAvailable: boolean;
  percentAvailable: boolean;
  toAbsolute: (raw: number) => number | null;
  toPercent: (raw: number) => number | null;
  /** Wert, der 100 % der Kapazität entspricht — je Achseneinheit. */
  capacityBound: (unit: ChartUnit) => number | null;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Höchster beobachteter CPU-Demand der Rohreihe in MHz, Mittel- und Spitzenwerte zusammen. Bewusst
 * über alle Punkte statt über den gerade sichtbaren Ausschnitt: sonst würde die Achseneinheit beim
 * Umschalten von Zeitfenster oder Wochenansicht springen.
 */
function peakDemandMHz(points: readonly VropsObjectTrendPoint[]): number | null {
  let peak: number | null = null;
  for (const point of points) {
    for (const value of [point.primaryValue, point.primaryPeakValue]) {
      if (value !== null && Number.isFinite(value) && (peak === null || value > peak)) peak = value;
    }
  }
  return peak;
}

/** Ab hier ist GHz die ruhigere Achse; darunter macht sie aus „318 MHz“ ein schlecht lesbares „0,32“. */
const GIGAHERTZ_THRESHOLD_MHZ = 1_000;

function buildPrimaryScale(
  metric: VropsTrendPrimaryMetric,
  cpuCapacityMHz: number | null,
  memoryCapacityMiB: number | null,
  cpuPeakMHz: number | null,
): PrimaryScale {
  if (metric === "memory-workload") {
    const capacityGiB = positiveOrNull(memoryCapacityMiB) === null ? null : memoryCapacityMiB! / 1_024;
    return {
      label: "Memory Workload",
      shortLabel: "RAM",
      absoluteUnit: "GiB",
      absoluteAvailable: capacityGiB !== null,
      percentAvailable: true,
      toAbsolute: (raw) => (capacityGiB === null ? null : (raw / 100) * capacityGiB),
      toPercent: (raw) => raw,
      capacityBound: (unit) => (unit === "percent" ? 100 : capacityGiB),
    };
  }
  const capacityMHz = positiveOrNull(cpuCapacityMHz);
  // Einzelne VMs bleiben meist unter 1 GHz; Hosts und Cluster liegen darüber. Die Absolutachse
  // folgt deshalb dem beobachteten Peak statt einer festen Einheit.
  const inGigahertz = cpuPeakMHz !== null && cpuPeakMHz > GIGAHERTZ_THRESHOLD_MHZ;
  const toAbsolute = (raw: number) => (inGigahertz ? raw / 1_000 : raw);
  return {
    label: "CPU Demand",
    shortLabel: "CPU",
    absoluteUnit: inGigahertz ? "GHz" : "MHz",
    absoluteAvailable: true,
    percentAvailable: capacityMHz !== null,
    toAbsolute,
    toPercent: (raw) => (capacityMHz === null ? null : (raw / capacityMHz) * 100),
    capacityBound: (unit) => (unit === "percent" ? 100 : capacityMHz === null ? null : toAbsolute(capacityMHz)),
  };
}

interface VropsTrendChartProps {
  hourly: VropsObjectTrendPoint[];
  /** Standard ist der CPU-Demand-Verlauf; siehe `VropsTrendPrimaryMetric`. */
  primaryMetric?: VropsTrendPrimaryMetric;
  cpuCapacityMHz: number | null;
  /** Nur für "memory-workload": konfigurierter RAM aus RVTools für die Absolutansicht. */
  memoryCapacityMiB?: number | null;
  secondaryCapacity: number | null;
  /** "pct": secondaryValue liegt bereits als Prozent vor (z.B. CPU Ready). "MiB": muss wie CPU über die Kapazität umgerechnet werden. */
  secondaryUnit?: "pct" | "MiB";
  secondaryLabel?: string;
  /** Überschrift der Chartkarte; ohne Angabe der neutrale Verlaufstitel. */
  title?: string;
  /** Beginn der markierten Vermeidungszone in Prozent der Kapazität. */
  avoidanceThresholdPct?: number;
  hasImport: boolean;
  isMatched: boolean;
  isLoading: boolean;
  importedAt?: string | null;
}

/** Präzisionsansicht für historische Last: Durchschnitt und Peak bleiben getrennt ablesbar. */
export function VropsTrendChart({
  hourly,
  primaryMetric = "cpu-demand",
  cpuCapacityMHz,
  memoryCapacityMiB = null,
  secondaryCapacity,
  secondaryUnit,
  secondaryLabel,
  title = "Auslastungsverlauf",
  avoidanceThresholdPct = CPU_DEMAND_AVOIDANCE_THRESHOLD_PCT,
  hasImport,
  isMatched,
  isLoading,
  importedAt,
}: VropsTrendChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const scale = buildPrimaryScale(primaryMetric, cpuCapacityMHz, memoryCapacityMiB, peakDemandMHz(hourly));
  const [chartUnit, setChartUnit] = useState<ChartUnit>(scale.percentAvailable ? "percent" : "absolute");
  const [chartView, setChartView] = useState<ChartView>("timeline");
  const [windowHours, setWindowHours] = useState<WindowHours>(3);
  const [primaryVisible, setPrimaryVisible] = useState(true);
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
          <TrendingUp className="size-3.5" /> {title} (vROps)
        </h4>
        <p className="text-xs text-muted-foreground">Keine vROps-Zeitreihe für dieses Objekt gefunden.</p>
      </section>
    );
  }

  const hasSecondary = secondaryLabel !== undefined;
  const secondaryIsPct = secondaryUnit === "pct";
  const isPercent = chartUnit === "percent" && scale.percentAvailable;
  const primaryDataKey = isPercent ? "primaryPct" : "primaryAbs";
  const secondaryDataKey = secondaryIsPct ? "secondaryPct" : isPercent && secondaryCapacity ? "secondaryPct" : "secondaryAbs";
  const primaryUnit = isPercent ? "%" : scale.absoluteUnit;
  const secondaryDisplayUnit = secondaryDataKey === "secondaryPct" ? "%" : "GiB";
  const bandLabel = `${scale.shortLabel}-Bereich`;

  const sourcePoints = hourly.map((point) => ({
    timestampMs: point.timestampUtc,
    cpu: point.primaryValue,
    cpuPeak: point.primaryPeakValue,
    secondary: point.secondaryValue,
  }));
  const sampled = chartView === "average-week"
    ? buildAverageWeekTrendPoints(sourcePoints)
    : aggregateTrendPoints(sourcePoints, windowHours);
  const hasBand = sampled.some((point) => point.sampleCount > 1 || point.cpuPeak !== null);
  const toAxisValue = (value: number | null) => (value === null ? null : isPercent ? scale.toPercent(value) : scale.toAbsolute(value));

  const chartData = sampled.map((point) => {
    const low = toAxisValue(point.cpuLow);
    const high = toAxisValue(point.cpuHigh);
    return {
      timestampMs: point.timestampMs,
      sampleCount: point.sampleCount,
      primaryAbs: point.cpu === null ? null : scale.toAbsolute(point.cpu),
      primaryPct: point.cpu === null ? null : scale.toPercent(point.cpu),
      primaryBand: low === null || high === null ? null : ([low, high] as [number, number]),
      primaryHigh: high,
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
  const primaryPeak = valuePeak(chartData, "primaryHigh");
  const secondaryPeak = hasSecondary ? valuePeak(chartData, secondaryDataKey) : null;
  // Die Vermeidungszone beschreibt den kompletten Bereich von der Schwelle bis
  // 100 % der Kapazität, nicht nur den Teil bis zum aktuell beobachteten Peak.
  // Peaks oberhalb der Kapazität sollen dabei weiterhin vollständig markiert
  // bleiben.
  const avoidanceScaleUpperBound = scale.capacityBound(isPercent ? "percent" : "absolute");
  const avoidanceThreshold = trendAvoidanceThreshold(avoidanceScaleUpperBound, avoidanceThresholdPct);
  const avoidanceZoneMax = typeof primaryPeak?.primaryHigh === "number"
    && avoidanceThreshold !== null
    && avoidanceScaleUpperBound !== null
    && primaryPeak.primaryHigh > avoidanceThreshold
    ? Math.max(avoidanceScaleUpperBound, primaryPeak.primaryHigh)
    : null;
  const avoidanceLabelPct = Math.round(avoidanceThresholdPct);

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
    if (Array.isArray(value)) return [`${formatNumber(value[0], primaryUnit)} – ${formatNumber(value[1], primaryUnit)}`, `${bandLabel} (Minimum–Peak)`];
    const unit = name.startsWith(scale.label) ? primaryUnit : secondaryDisplayUnit;
    return [formatNumber(value, unit), name];
  };
  const primaryPeakLabel = primaryPeak?.primaryHigh === null || primaryPeak?.primaryHigh === undefined ? "—" : formatNumber(primaryPeak.primaryHigh, primaryUnit);
  const secondaryPeakValue = secondaryPeak?.[secondaryDataKey];
  const secondaryPeakLabel = typeof secondaryPeakValue === "number" ? formatNumber(secondaryPeakValue, secondaryDisplayUnit) : "—";

  const toggleMetric = (metric: "primary" | "secondary") => {
    if (metric === "primary") {
      if (primaryVisible && (!hasSecondary || !secondaryVisible)) return;
      setPrimaryVisible((visible) => !visible);
      return;
    }
    if (secondaryVisible && !primaryVisible) return;
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
                <TrendingUp className="size-3.5" /> {title}
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
              <ToggleGroupItem value="absolute" aria-label="Absolute Werte anzeigen" disabled={!scale.absoluteAvailable} className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Absolut</ToggleGroupItem>
              <ToggleGroupItem value="percent" aria-label="Prozent der Kapazität anzeigen" disabled={!scale.percentAvailable} className="min-h-10 rounded-lg px-3 active:scale-[0.96]">Prozent</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" aria-label="Metriken ein- oder ausblenden">
            <button
              type="button"
              aria-pressed={primaryVisible}
              onClick={() => toggleMetric("primary")}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-xl px-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)] transition-[scale,background-color,box-shadow] duration-150 ease-out active:scale-[0.96]",
                primaryVisible ? "bg-background text-foreground" : "bg-muted/30 text-muted-foreground",
              )}
            >
              <span className="grid size-5 place-items-center rounded-full bg-gradient-to-tr from-success via-warning to-destructive text-white">{primaryVisible ? <Check className="size-3" /> : <EyeOff className="size-3" />}</span>
              <span><span className="block text-xs font-semibold">{scale.label}</span><span className="block font-mono text-[10px] tabular-nums text-muted-foreground">Peak {primaryPeakLabel}</span></span>
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
                yAxisId="primary"
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
              <ReferenceArea key={`holiday-${range.start}`} yAxisId="primary" x1={range.start} x2={range.end + HOUR_MS} fill="hsl(var(--warning))" fillOpacity={0.11} strokeOpacity={0} />
            ))}
            {primaryVisible && avoidanceZoneMax !== null && avoidanceThreshold !== null && (
              <>
                <ReferenceArea
                  yAxisId="primary"
                  y1={avoidanceThreshold}
                  y2={avoidanceZoneMax}
                  ifOverflow="extendDomain"
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.085}
                  strokeOpacity={0}
                  label={{ value: `Vermeiden · > ${avoidanceLabelPct} %`, position: "insideTopRight", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
                />
                <ReferenceLine
                  yAxisId="primary"
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
              yAxisId="primary"
              hide={!primaryVisible}
              tick={{ fontSize: 10 }}
              width={46}
              domain={["dataMin", avoidanceZoneMax ?? "dataMax"]}
              tickFormatter={isPercent ? (value: number) => formatNumber(value, "%") : undefined}
            />
            {hasSecondary && (
              <YAxis
                yAxisId="secondary"
                hide={!secondaryVisible}
                orientation="right"
                tick={{ fontSize: 10 }}
                width={46}
                tickFormatter={secondaryDataKey === "secondaryPct" ? (value: number) => formatNumber(value, "%") : undefined}
              />
            )}
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={formatTooltipValue}
              labelFormatter={(value: number) => formatTooltipTimestamp(value, chartView)}
            />
            {primaryVisible && hasBand && (
              <Area
                yAxisId="primary"
                dataKey="primaryBand"
                name={bandLabel}
                type="monotone"
                fill={`url(#${gradientId}-band)`}
                stroke="none"
                isAnimationActive={false}
                connectNulls
              />
            )}
            {primaryVisible && <Line yAxisId="primary" dataKey={primaryDataKey} name={chartView === "average-week" ? `${scale.label} (Durchschnitt)` : windowHours === 3 ? `${scale.label} (3-Std.-Mittel)` : `${scale.label} (Stundenmittel)`} type="monotone" stroke={`url(#${gradientId}-load)`} dot={false} strokeWidth={2.25} connectNulls isAnimationActive={false} />}
            {hasSecondary && secondaryVisible && <Line yAxisId="secondary" dataKey={secondaryDataKey} name={chartView === "average-week" ? `${secondaryLabel} (Durchschnitt)` : `${secondaryLabel} (Maximum)`} type="monotone" stroke="hsl(var(--chart-6))" dot={false} strokeWidth={1.75} strokeDasharray="5 3" connectNulls isAnimationActive={false} />}
            {primaryVisible && primaryPeak && typeof primaryPeak.primaryHigh === "number" && (
              <ReferenceDot
                yAxisId="primary"
                x={primaryPeak.timestampMs}
                y={primaryPeak.primaryHigh}
                r={4.5}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                label={{ value: `Peak · ${primaryPeakLabel}`, position: "top", fill: "hsl(var(--destructive))", fontSize: 10, fontWeight: 700 }}
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
                yAxisId="primary"
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
          {avoidanceZoneMax !== null && <span className="flex items-center gap-1.5 font-medium text-destructive"><span className="h-2 w-4 rounded-sm bg-destructive/10 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.25)]" />Vermeidungszone &gt; {avoidanceLabelPct} % {scale.shortLabel}</span>}
          {holidayNames.length > 0 && <span>Feiertage: {holidayNames.join(", ")}</span>}
        </div>
        {primaryVisible && primaryPeak && typeof primaryPeak.primaryHigh === "number" && (
          <p className="font-mono tabular-nums">{scale.shortLabel}-Peak {primaryPeakLabel} · {formatTooltipTimestamp(primaryPeak.timestampMs, chartView)}</p>
        )}
      </div>
    </section>
  );
}
