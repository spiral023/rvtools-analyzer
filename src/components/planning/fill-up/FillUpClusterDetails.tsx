import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FillUpGuardrailList } from "@/components/planning/fill-up/FillUpGuardrailList";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";
import type { FillUpGuardrailHeadroom } from "@/domain/models/types";
import type { GlossaryEntry } from "@/lib/glossary";
import { FILL_UP_UI } from "@/lib/glossaries/planning";
import { formatFillUpValue, formatWorstHour } from "@/lib/fillUpUnits";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FillUpClusterDetails({ result, cpuDemandConcurrencyPct }: { result: FillUpPlanningClusterResult | null; cpuDemandConcurrencyPct: number }) {
  if (!result) return <Card className="border-dashed"><CardContent className="py-6 text-sm text-muted-foreground">Wähle einen Cluster in der Tabelle, um seine Kapazitätsbasis, Limiter und Szenarien zu prüfen.</CardContent></Card>;
  const mix = result.recommendation.workloadMixRecommendation;
  const baseline = result.capacity.normal;
  const consumptionByMetric = buildConsumptionByMetric(result.recommendation);
  const chartData = result.chartHours.map((hour) => ({
    timestamp: new Date(hour.timestampUtc).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit" }),
    cpuDemandGHz: hour.clusterCpuDemandMHz === null ? null : hour.clusterCpuDemandMHz / 1_000,
    memoryUtilizationGiB: hour.clusterMemoryUtilizationMiB === null ? null : hour.clusterMemoryUtilizationMiB / 1024,
  }));
  return <Card className="border-l-4 border-l-primary"><CardHeader className="border-b bg-muted/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><InfoTooltip entry={FILL_UP_UI.details} side="right"><CardTitle className="w-fit cursor-help">{result.cluster.name}</CardTitle></InfoTooltip><CardDescription>{result.policy.name} v{result.policy.version} · ungünstigster Normal-Slot {formatWorstHour(baseline.worstTimestampUtc)} · CPU-Gleichzeitigkeit {cpuDemandConcurrencyPct} %</CardDescription></div><Badge variant={baseline.status === "red" ? "destructive" : baseline.status === "green" ? "default" : "secondary"}>Baseline: {baseline.status}</Badge></div></CardHeader><CardContent className="space-y-5 pt-5"><div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]"><div className="grid grid-cols-2 gap-2 lg:grid-cols-1"><Fact label="Gemeinsamer Mix" entry={FILL_UP_UI.sharedMix} value={mix?.maxAdditionalVms === null || mix?.maxAdditionalVms === undefined ? "—" : `+${mix.maxAdditionalVms} VMs`} /><Fact label="N-1-Verlust" entry={FILL_UP_UI.n1Loss} value={mix?.relativeN1LossPct === null || mix?.relativeN1LossPct === undefined ? "—" : `${mix.relativeN1LossPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`} /><Fact label="CPU Demand" entry={FILL_UP_UI.cpuDemand} value={formatFillUpValue(baseline.cpuDemandMHz, "MHz")} /><Fact label="RAM zugewiesen" entry={FILL_UP_UI.assignedMemory} value={formatFillUpValue(baseline.assignedMemoryMiB, "MiB")} /></div><div className="space-y-2"><InfoTooltip entry={FILL_UP_UI.guardrails} side="left"><h3 className="w-fit cursor-help text-sm font-semibold">Aktive Guardrails</h3></InfoTooltip><FillUpGuardrailList guardrails={result.recommendation.guardrails.filter((entry) => entry.hardLimit)} consumptionByMetric={consumptionByMetric} /></div></div><section className="rounded-md border bg-muted/10 p-3"><div className="mb-2"><InfoTooltip entry={FILL_UP_UI.historicalTrend} side="right"><h3 className="w-fit cursor-help text-sm font-semibold">Historischer Verlauf</h3></InfoTooltip><p className="text-xs text-muted-foreground">Direkte Clusterzeitreihen aus dem ausgewählten Import; die gleiche Datenbasis steuert den ungünstigsten Szenario-Slot.</p></div><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><XAxis dataKey="timestamp" minTickGap={44} tick={{ fontSize: 10 }} /><YAxis yAxisId="cpu" tick={{ fontSize: 10 }} width={46} /><YAxis yAxisId="memory" orientation="right" tick={{ fontSize: 10 }} width={42} /><Tooltip formatter={(value: number, name: string) => [value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name]} /><Legend wrapperStyle={{ fontSize: 12 }} /><Line yAxisId="cpu" dataKey="cpuDemandGHz" name="CPU Demand GHz" type="monotone" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls /><Line yAxisId="memory" dataKey="memoryUtilizationGiB" name="Memory Util. GiB" type="monotone" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div></section></CardContent></Card>;
}

function Fact({ label, entry, value }: { label: string; entry: GlossaryEntry; value: string }) { return <div className="rounded-md border bg-muted/20 px-3 py-2"><InfoTooltip entry={entry} side="right"><p className="w-fit cursor-help text-xs text-muted-foreground">{label}</p></InfoTooltip><p className="font-mono text-sm font-semibold tabular-nums">{value}</p></div>; }

/**
 * Übersetzt die Guardrail-Metriken in den Verbrauch, den die beiden Mix-Profile je
 * zusätzlicher VM tatsächlich beisteuern. Bei CPU-Metriken ist das der über den
 * Gleichzeitigkeitsfaktor aufgelöste Wert, nicht mehr zwangsläufig der P95.
 */
function buildConsumptionByMetric(recommendation: FillUpPlanningClusterResult["recommendation"]): Map<FillUpGuardrailHeadroom["metricKey"], string> {
  const labels = new Map<FillUpGuardrailHeadroom["metricKey"], string>();
  const mix = recommendation.workloadMixRecommendation;
  if (!mix) return labels;
  const high = recommendation.profileRecommendations.find((entry) => entry.profile.id === mix.mix.highProfileId);
  const std = recommendation.profileRecommendations.find((entry) => entry.profile.id === mix.mix.stdProfileId);
  if (!high || !std) return labels;

  const both = (highValue: string, stdValue: string) => `HIGH ${highValue} · STD ${stdValue}`;
  labels.set("vcpu-per-core", both(formatVcpu(high.profile.vcpu), formatVcpu(std.profile.vcpu)));
  labels.set("cpu-demand", both(formatFillUpValue(high.appliedCpuDemandMHz, "MHz"), formatFillUpValue(std.appliedCpuDemandMHz, "MHz")));
  labels.set("total-ram-assigned", both(formatFillUpValue(high.profile.memoryMiB, "MiB"), formatFillUpValue(std.profile.memoryMiB, "MiB")));
  labels.set("high-cpu-site", `HIGH ${formatFillUpValue(high.appliedCpuDemandMHz, "MHz")}`);
  labels.set("high-ram-assigned", `HIGH ${formatFillUpValue(high.profile.memoryMiB, "MiB")}`);
  return labels;
}

/** Übernommene Profile können gebrochene vCPU-Mittelwerte tragen; die dürfen hier nicht verschwinden. */
function formatVcpu(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} vCPU`;
}
