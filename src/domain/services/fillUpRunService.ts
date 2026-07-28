import type { FillUpAnalysisRun, FillUpWorkloadMix, FillUpWorkloadProfile, VropsTimeSeriesImport } from "@/domain/models/types";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";
import { DEFAULT_CPU_DEMAND_CONCURRENCY_PCT } from "@/domain/services/fillUpRecommendationEngine";

export function createFillUpAnalysisRun(input: { name: string; importMeta: VropsTimeSeriesImport; results: readonly FillUpPlanningClusterResult[]; profiles: readonly FillUpWorkloadProfile[]; workloadMix: FillUpWorkloadMix | null; includeN2: boolean; cpuDemandConcurrencyPct?: number; now?: string }): FillUpAnalysisRun {
  const now = input.now ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(), name: input.name.trim() || `Fill Up ${new Date(now).toLocaleString("de-DE")}`, createdAt: now, updatedAt: now, calculationVersion: 1,
    importId: input.importMeta.id, importFileSetChecksum: input.importMeta.fileSetChecksum, rvtoolsSnapshotIds: [...input.importMeta.rvtoolsSnapshotIds], includeN2: input.includeN2,
    cpuDemandConcurrencyPct: input.cpuDemandConcurrencyPct ?? DEFAULT_CPU_DEMAND_CONCURRENCY_PCT,
    workloadProfiles: input.profiles.map((profile) => ({ ...profile })), workloadMix: input.workloadMix ? { ...input.workloadMix } : null,
    results: input.results.map((row) => ({ clusterKey: row.cluster.clusterKey, clusterName: row.cluster.name, vcenterId: row.cluster.vcenterId, policy: { ...row.policy }, normalStatus: row.capacity.normal.status, n1Status: row.capacity.n1?.status ?? "unknown", n2Status: row.capacity.n2?.status ?? null, siteFailoverStatus: row.capacity.siteFailover.some((entry) => entry.status === "red") ? "red" : row.capacity.siteFailover.some((entry) => entry.status === "yellow") ? "yellow" : "green", mixAdditionalVms: row.recommendation.workloadMixRecommendation?.maxAdditionalVms ?? null, independentHeadroom: structuredClone(row.recommendation.independentHeadroom), limitingMetric: row.recommendation.workloadMixRecommendation?.limitingGuardrail?.label ?? null, warnings: [...row.capacity.warnings, ...row.recommendation.warnings] })),
  };
}

export function renameFillUpAnalysisRun(run: FillUpAnalysisRun, name: string, now = new Date().toISOString()): FillUpAnalysisRun { return { ...run, name: name.trim() || run.name, updatedAt: now }; }
export function duplicateFillUpAnalysisRun(run: FillUpAnalysisRun, now = new Date().toISOString()): FillUpAnalysisRun { return { ...structuredClone(run), id: crypto.randomUUID(), name: `${run.name} (Kopie)`, createdAt: now, updatedAt: now }; }
export function buildFillUpRunMarkdown(run: FillUpAnalysisRun): string { return [`# ${run.name}`, "", `Erstellt: ${new Date(run.createdAt).toLocaleString("de-DE")}`, `Import: ${run.importId}`, `CPU-Gleichzeitigkeit: ${(run.cpuDemandConcurrencyPct ?? DEFAULT_CPU_DEMAND_CONCURRENCY_PCT).toLocaleString("de-DE")} %`, "", "| Cluster | Mix +VM | N-1 | N-2 | Site | Limiter |", "|---|---:|---|---|---|---|", ...run.results.map((row) => `| ${row.clusterName} | ${row.mixAdditionalVms ?? "—"} | ${row.n1Status} | ${row.n2Status ?? "—"} | ${row.siteFailoverStatus} | ${row.limitingMetric ?? "—"} |`)].join("\n"); }
