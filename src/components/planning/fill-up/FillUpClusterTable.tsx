import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { CapacityStatus, FillUpGuardrailHeadroom, FillUpScenarioResult } from "@/domain/models/types";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";
import { formatFillUpValue, formatWorstHour } from "@/lib/fillUpUnits";
import { FILL_UP_COLUMNS } from "@/lib/glossaries/planning";

const STATUS_LABEL: Record<CapacityStatus, string> = { green: "erfüllt", yellow: "knapp", red: "verletzt", unknown: "offen" };

export function FillUpClusterTable({ rows, onSelect }: { rows: readonly FillUpPlanningClusterResult[]; onSelect: (row: FillUpPlanningClusterResult) => void }) {
  const columns = useMemo<ColumnDef<FillUpPlanningClusterResult>[]>(() => [
    {
      id: "cluster", header: "Cluster", meta: { info: FILL_UP_COLUMNS.cluster }, accessorFn: (row) => `${row.cluster.name} ${row.cluster.vcenterId}`,
      cell: ({ row }) => <ValueTooltip title="Berechneter Cluster" description="Die Zeile fasst genau diesen vCenter-spezifischen RVTools-Cluster und seine zugeordneten vROps-Zeitreihen zusammen." details={[`vCenter: ${row.original.cluster.vcenterId}`, `Cluster-Key: ${row.original.cluster.clusterKey}`]}><div className="cursor-help"><p className="font-medium">{row.original.cluster.name}</p><p className="text-xs text-muted-foreground">{row.original.cluster.vcenterId}</p></div></ValueTooltip>,
    },
    {
      id: "scope", header: "Hosts / Sites", meta: { info: FILL_UP_COLUMNS.scope }, accessorFn: (row) => row.hostCount,
      cell: ({ row }) => <ValueTooltip title="Berechnungsscope" description="Nur eindeutig zugeordnete Hosts fließen in Kapazität, N-1/N-2 und die Platzierbarkeit ein. Die Site-Anzahl bestimmt, ob ein Standort-Failover geprüft werden kann." details={[`${row.original.hostCount} Hosts mit Zeitreihe`, `${row.original.siteCount} unterschiedliche Sites`]}><span className="cursor-help font-mono tabular-nums">{row.original.hostCount} / {row.original.siteCount}</span></ValueTooltip>,
    },
    {
      id: "policy", header: "Policy", meta: { info: FILL_UP_COLUMNS.policy }, accessorFn: (row) => row.policy.name,
      cell: ({ row }) => <ValueTooltip title="Wirksame Fill-Up-Policy" description="Die Policy liefert alle Grenzwerte für diesen Cluster. Eine Clusterzuweisung und vorhandene Einzel-Overrides sind bereits darin aufgelöst." details={[`Planungswert: P${formatPercentile(row.original.policy.planningPercentile)}`, `Rückblick: ${row.original.policy.lookbackDays} Tage`, `N-1 vCPU/Core: ${formatRatio(row.original.policy.maxVcpuPerCoreN1)}`, `CPU-Puffer: ${formatPercent(row.original.policy.cpuSafetyBufferPct)}`]}><span className="cursor-help text-xs">{row.original.policy.name}<br />v{row.original.policy.version}</span></ValueTooltip>,
    },
    {
      id: "mix", header: "Mix +VM", meta: { info: FILL_UP_COLUMNS.mix }, accessorFn: (row) => row.recommendation.workloadMixRecommendation?.maxAdditionalVms ?? -1,
      cell: ({ row }) => <MixValue recommendation={row.original.recommendation.workloadMixRecommendation} />,
    },
    {
      id: "headroom", header: "Unabhängig", meta: { info: FILL_UP_COLUMNS.headroom }, accessorFn: (row) => row.recommendation.independentHeadroom.vcpu.value ?? -1,
      cell: ({ row }) => <IndependentHeadroomValue result={row.original} />,
    },
    {
      id: "n1", header: "N-1", meta: { info: FILL_UP_COLUMNS.n1 }, accessorFn: (row) => row.capacity.n1?.status ?? "unknown",
      cell: ({ row }) => <ScenarioStatusValue title="N-1-Szenario" scenario={row.original.capacity.n1} description="Prüft den Ausfall des ungünstigsten einzelnen Hosts. Der Status bewertet die aktiven harten Guardrails in der ungünstigsten historischen Stunde." />,
    },
    {
      id: "n2", header: "N-2", meta: { info: FILL_UP_COLUMNS.n2 }, accessorFn: (row) => row.capacity.n2?.status ?? "unknown",
      cell: ({ row }) => row.original.capacity.n2 ? <ScenarioStatusValue title="N-2-Szenario" scenario={row.original.capacity.n2} description="Prüft den Ausfall zweier Hosts. Als „Info“ markiert, wenn die Policy N-2 nicht als harte Grenze verwendet." informational={!row.original.capacity.n2.definition.hardLimit} /> : <span className="text-xs text-muted-foreground">deaktiviert</span>,
    },
    {
      id: "site", header: "HIGH Site", meta: { info: FILL_UP_COLUMNS.site }, accessorFn: (row) => row.capacity.siteFailover.map((entry) => entry.status).join(),
      cell: ({ row }) => <SiteStatusValue scenarios={row.original.capacity.siteFailover} />,
    },
    {
      id: "limiter", header: "Limiter", meta: { info: FILL_UP_COLUMNS.limiter }, accessorFn: (row) => row.recommendation.workloadMixRecommendation?.limitingGuardrail?.label ?? "",
      cell: ({ row }) => <LimiterValue guardrail={row.original.recommendation.workloadMixRecommendation?.limitingGuardrail ?? null} />,
    },
  ], []);
  return <VirtualTable data={[...rows]} columns={columns} height={440} onRowClick={onSelect} getRowId={(row) => row.cluster.clusterKey} exportFileName="fill-up-cluster" emptyTitle="Keine berechenbaren Cluster" emptyDescription="Der gewählte Import benötigt eindeutige Clusterbeziehungen und einen passenden RVTools-Snapshot." />;
}

function MixValue({ recommendation }: { recommendation: FillUpPlanningClusterResult["recommendation"]["workloadMixRecommendation"] }) {
  const limit = recommendation?.limitingGuardrail ?? null;
  return <ValueTooltip title="Gemeinsamer zusätzlicher VM-Mix" description="Die VM-Zahl wird für den eingestellten HIGH/STD-Mix gemeinsam ermittelt. Sie ist die kleinste zulässige Anzahl über alle harten Guardrails und Szenarien hinweg." details={recommendation ? [`Zusätzliche VMs: ${formatAdditionalVms(recommendation.maxAdditionalVms)}`, `Davon HIGH / STD: ${formatOptionalNumber(recommendation.highVmCount)} / ${formatOptionalNumber(recommendation.stdVmCount)}`, `Limiter: ${limit ? `${limit.label} (${limit.scenarioId})` : "—"}`, limit ? `Rest am Limiter: ${formatFillUpValue(Math.max(0, limit.available ?? 0), limit.unit)}` : "Kein berechenbarer Limiter"] : ["Kein vollständiger Workload-Mix konfiguriert."]}><span className="cursor-help font-mono font-semibold tabular-nums">{formatAdditionalVms(recommendation?.maxAdditionalVms)}</span></ValueTooltip>;
}

function IndependentHeadroomValue({ result }: { result: FillUpPlanningClusterResult }) {
  const { independentHeadroom } = result.recommendation;
  return <div className="space-y-0.5 font-mono text-xs tabular-nums">
    <HeadroomLine label="vCPU" value={independentHeadroom.vcpu.value} unit="vCPU" scenarioId={independentHeadroom.vcpu.limitingScenarioId} metric={independentHeadroom.vcpu.limitingMetricKey} />
    <HeadroomLine label="CPU" value={independentHeadroom.cpuDemand.value} unit="MHz" scenarioId={independentHeadroom.cpuDemand.limitingScenarioId} metric={independentHeadroom.cpuDemand.limitingMetricKey} />
    <HeadroomLine label="RAM" value={independentHeadroom.memory.value} unit="MiB" scenarioId={independentHeadroom.memory.limitingScenarioId} metric={independentHeadroom.memory.limitingMetricKey} />
  </div>;
}

function HeadroomLine({ label, value, unit, scenarioId, metric }: { label: string; value: number | null; unit: "vCPU" | "MHz" | "MiB"; scenarioId: string | null; metric: string | null }) {
  const display = value === null ? "—" : `+${formatFillUpValue(value, unit)}`;
  return <ValueTooltip title={`Unabhängiger ${label}-Headroom`} description="Dies ist eine isolierte Obergrenze für genau diese Ressource. CPU, RAM und vCPU dürfen nicht addiert oder direkt in eine gemeinsame VM-Zahl übersetzt werden." details={[`Noch verfügbar: ${display}`, `Begrenzendes Szenario: ${scenarioId ?? "—"}`, `Begrenzende Guardrail: ${metric ?? "—"}`]}><p className="w-fit cursor-help">{display}</p></ValueTooltip>;
}

function ScenarioStatusValue({ title, scenario, description, informational = false }: { title: string; scenario: FillUpScenarioResult | null; description: string; informational?: boolean }) {
  if (!scenario) return <StatusBadge status="unknown" />;
  return <ValueTooltip title={title} description={description} details={scenarioDetails(scenario)}><span className="inline-flex cursor-help"><StatusBadge status={scenario.status} informational={informational} /></span></ValueTooltip>;
}

function SiteStatusValue({ scenarios }: { scenarios: readonly FillUpScenarioResult[] }) {
  const worst = [...scenarios].sort((left, right) => statusRank(left.status) - statusRank(right.status))[0] ?? null;
  if (!worst) return <ValueTooltip title="HIGH-Site-Failover" description="Kein Standort-Failover konnte berechnet werden. Dafür sind mindestens zwei eindeutig zugeordnete Sites erforderlich." details={["Keine berechenbaren Site-Szenarien."]}><span className="inline-flex cursor-help"><StatusBadge status="unknown" /></span></ValueTooltip>;
  return <ValueTooltip title="HIGH-Site-Failover" description="Geprüft wird, ob HIGH-Workloads nach dem Ausfall einer Site auf den verbleibenden Sites untergebracht werden können. Angezeigt wird der schlechteste Site-Failover." details={[`Berechnete Site-Ausfälle: ${scenarios.length}`, `Schlechtestes Szenario: ${worst.definition.id}`, ...scenarioDetails(worst)]}><span className="inline-flex cursor-help"><StatusBadge status={worst.status} /></span></ValueTooltip>;
}

function LimiterValue({ guardrail }: { guardrail: FillUpGuardrailHeadroom | null }) {
  if (!guardrail) return <span className="text-xs text-muted-foreground">—</span>;
  return <ValueTooltip title="Aktueller Mix-Limiter" description="Diese Guardrail lässt im gemeinsamen HIGH/STD-Mix zuerst keine weitere vollständige VM mehr zu. Die verfügbare Restmenge ist keine zusätzliche VM-Zahl, sondern die verbleibende Ressource dieser Guardrail." details={[`Szenario: ${guardrail.scenarioId}`, `Workload-Scope: ${guardrail.workloadScope === "high" ? "nur HIGH" : "alle Workloads"}`, `Verbleibend: ${formatFillUpValue(Math.max(0, guardrail.available ?? 0), guardrail.unit)}`, `Grenze: ${guardrail.hardLimit ? "hart" : "informativ"}`]}><span className="cursor-help text-xs">{guardrail.label}<br /><span className="text-muted-foreground">{guardrail.scenarioId}</span></span></ValueTooltip>;
}

function scenarioDetails(scenario: FillUpScenarioResult): string[] {
  return [
    `Ungünstigste Stunde: ${formatWorstHour(scenario.worstTimestampUtc)}`,
    `CPU Demand / Kapazität: ${formatFillUpValue(scenario.cpuDemandMHz, "MHz")} / ${formatFillUpValue(scenario.cpuCapacityMHz, "MHz")}`,
    `RAM zugewiesen / Kapazität: ${formatFillUpValue(scenario.assignedMemoryMiB, "MiB")} / ${formatFillUpValue(scenario.memoryCapacityMiB, "MiB")}`,
    `Verbleibende Cores: ${formatOptionalNumber(scenario.cpuCores)}`,
  ];
}

function ValueTooltip({ title, description, details, children }: { title: string; description: string; details: readonly string[]; children: ReactNode }) {
  return <Tooltip delayDuration={220}><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="top" align="start" className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal border-border/80 bg-popover p-0 shadow-lg"><div className="px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{title}</p><p className="mt-1 text-xs leading-relaxed text-popover-foreground/90">{description}</p><dl className="mt-2 space-y-1 border-t border-border/60 pt-2 font-mono-data text-[11px] leading-relaxed text-muted-foreground">{details.map((detail, index) => <div key={`${detail}-${index}`}>{detail}</div>)}</dl></div></TooltipContent></Tooltip>;
}

function StatusBadge({ status, informational = false }: { status: CapacityStatus; informational?: boolean }) {
  return <Badge variant={status === "red" ? "destructive" : status === "green" ? "default" : "secondary"}>{STATUS_LABEL[status]}{informational ? " · Info" : ""}</Badge>;
}

function formatAdditionalVms(value: number | null | undefined) { return value === null || value === undefined ? "—" : `+${value.toLocaleString("de-DE")} VMs`; }
function formatOptionalNumber(value: number | null | undefined) { return value === null || value === undefined ? "—" : value.toLocaleString("de-DE"); }
function formatPercent(value: number) { return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`; }
function formatPercentile(value: number) { return value.toLocaleString("de-DE", { maximumFractionDigits: 2 }); }
function formatRatio(value: number | null) { return value === null ? "—" : value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusRank(status: CapacityStatus) { return ({ red: 0, unknown: 1, yellow: 2, green: 3 })[status]; }
