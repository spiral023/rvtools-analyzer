import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";

type ChartUnit = "absolute" | "percent";

interface VropsTrendChartProps {
  hourly: VropsObjectTrendPoint[];
  cpuCapacityMHz: number | null;
  secondaryCapacity: number | null;
  /** "pct": secondaryValue liegt bereits als Prozent vor (z.B. CPU Ready). "MiB": muss wie CPU über die Kapazität umgerechnet werden. */
  secondaryUnit: "pct" | "MiB";
  secondaryLabel: string;
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

  const secondaryIsPct = secondaryUnit === "pct";
  const isPercent = chartUnit === "percent";
  const cpuDataKey = isPercent && cpuCapacityMHz ? "cpuPct" : "cpuAbs";
  const secondaryDataKey = secondaryIsPct ? "secondaryPct" : isPercent && secondaryCapacity ? "secondaryPct" : "secondaryAbs";
  const cpuName = cpuDataKey === "cpuPct" ? "CPU Demand %" : "CPU Demand GHz";
  const secondaryName = secondaryIsPct ? `${secondaryLabel} %` : secondaryDataKey === "secondaryPct" ? `${secondaryLabel} %` : `${secondaryLabel} GiB`;
  const percentUnavailable = !cpuCapacityMHz && (secondaryIsPct || !secondaryCapacity);

  const chartData = hourly.map((point) => ({
    timestamp: new Date(point.timestampUtc).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit" }),
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

  return (
    <section className="rounded-md border bg-muted/10 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Auslastungsverlauf (vROps, 7 Tage)
          </h4>
          {importedAt && (
            <p className="text-[10px] text-muted-foreground">
              Stündliche Werte · Import vom {new Date(importedAt).toLocaleString("de-DE")}
            </p>
          )}
        </div>
        <ToggleGroup type="single" size="sm" value={chartUnit} onValueChange={(value) => value && setChartUnit(value as ChartUnit)}>
          <ToggleGroupItem value="absolute" aria-label="Absolute Werte anzeigen">Absolut</ToggleGroupItem>
          <ToggleGroupItem value="percent" aria-label="Prozent der Kapazität anzeigen" disabled={percentUnavailable}>Prozent</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="timestamp" minTickGap={44} tick={{ fontSize: 10 }} />
            <YAxis
              yAxisId="cpu"
              tick={{ fontSize: 10 }}
              width={46}
              tickFormatter={cpuDataKey === "cpuPct" ? (value: number) => `${value} %` : undefined}
            />
            <YAxis
              yAxisId="secondary"
              orientation="right"
              tick={{ fontSize: 10 }}
              width={46}
              tickFormatter={secondaryDataKey === "secondaryPct" ? (value: number) => `${value} %` : undefined}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={(value: number, name: string) => [value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="cpu" dataKey={cpuDataKey} name={cpuName} type="monotone" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls />
            <Line yAxisId="secondary" dataKey={secondaryDataKey} name={secondaryName} type="monotone" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
