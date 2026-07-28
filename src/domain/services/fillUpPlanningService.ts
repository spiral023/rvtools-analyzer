import type {
  CapacityPolicy,
  ClusterCapacityPolicyAssignment,
  FillUpCapacityAnalysis,
  FillUpObservedVmProfile,
  FillUpHour,
  FillUpHost,
  FillUpRecommendationAnalysis,
  FillUpVm,
  FillUpWorkloadMix,
  FillUpWorkloadProfile,
  GlobalWorkloadClassProfile,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SnapshotMeta,
  VropsDataQualityReport,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { resolveEffectiveCapacityPolicy } from "@/domain/services/capacityPolicyService";
import { analyzeFillUpCapacity } from "@/domain/services/fillUpCapacityEngine";
import { calculateFillUpRecommendations } from "@/domain/services/fillUpRecommendationEngine";
import { evaluateVropsDataQuality } from "@/domain/services/vropsDataQualityService";
import { readVropsTimeSeriesMetric } from "@/domain/services/vropsTimeSeriesSeriesReader";
import { buildGlobalWorkloadClassProfiles, buildObservedVmProfiles } from "@/domain/services/fillUpObservedVmProfileService";
import { isPoweredOnVm, isVclsVm } from "@/lib/vmScope";

const HOUR_MS = 60 * 60 * 1000;

export interface BuildFillUpPlanningResultsInput {
  import: VropsTimeSeriesImport;
  objects: readonly VropsTimeSeriesImportedObject[];
  chunks: readonly VropsTimeSeriesChunk[];
  summaries: readonly VropsTimeSeriesSummary[];
  snapshots: readonly SnapshotMeta[];
  hosts: readonly NormalizedHost[];
  vms: readonly NormalizedVm[];
  clusters: readonly NormalizedCluster[];
  policies: readonly CapacityPolicy[];
  assignments: readonly ClusterCapacityPolicyAssignment[];
  profiles: readonly FillUpWorkloadProfile[];
  workloadMix?: FillUpWorkloadMix;
  includeN2?: boolean;
  /** Gleichzeitigkeitsfaktor für CPU-Demand-Guardrails; siehe Recommendation-Engine. */
  cpuDemandConcurrencyPct?: number;
}

export interface FillUpPlanningClusterResult {
  cluster: NormalizedCluster;
  policy: CapacityPolicy;
  capacity: FillUpCapacityAnalysis;
  recommendation: FillUpRecommendationAnalysis;
  quality: VropsDataQualityReport;
  chartHours: FillUpChartHour[];
  observedVmProfiles: FillUpObservedVmProfile[];
  hostCount: number;
  siteCount: number;
}

/** Nur die für den Verlauf benötigten Clusterwerte; VM-/Host-Daten bleiben im Rechenkontext. */
export interface FillUpChartHour {
  timestampUtc: number;
  clusterCpuDemandMHz: number | null;
  clusterMemoryUtilizationMiB: number | null;
}

/**
 * Verbindet ausschließlich bereits normalisierte, eingefrorene Importdaten mit
 * den reinen Phase-5/6-Engines. Die Zeitreihen werden dabei einmal pro
 * ausgewähltem Import in die für die Engine benötigten Stundenwerte gelesen.
 */
export function buildFillUpPlanningResults(input: BuildFillUpPlanningResultsInput): FillUpPlanningClusterResult[] {
  const quality = evaluateVropsDataQuality({
    import: input.import,
    objects: input.objects,
    summaries: input.summaries,
    chunks: input.chunks,
    snapshots: input.snapshots,
  });
  const objectsByCluster = groupByCluster(input.objects);
  const hostByKey = new Map(input.hosts.map((host) => [host.hostKey, host]));
  const vmByKey = new Map(input.vms.map((vm) => [vm.vmKey, vm]));
  const rows: FillUpPlanningClusterResult[] = [];

  for (const clusterObject of input.objects.filter((object) => object.objectType === "cluster" && object.matchStatus === "matched" && object.clusterKey)) {
    const cluster = input.clusters.find((entry) => entry.clusterKey === clusterObject.clusterKey && entry.vcenterId === clusterObject.vcenterId);
    if (!cluster) continue;
    const clusterObjects = objectsByCluster.get(cluster.clusterKey) ?? [];
    const hosts = toFillUpHosts(clusterObjects, hostByKey);
    const vms = toFillUpVms(clusterObjects, vmByKey, input.summaries);
    const assignment = input.assignments.find((entry) => entry.vcenterId === cluster.vcenterId && entry.clusterKey === cluster.clusterKey);
    const policy = resolveEffectiveCapacityPolicy(input.policies, assignment) ?? input.policies[0];
    if (!policy) continue;
    const hourlyData = toFillUpHours(input.import, clusterObject.objectKey, hosts, vms, input.chunks, cluster.clusterKey, cluster.name);
    const capacity = analyzeFillUpCapacity({
      policy,
      hosts,
      vms,
      hours: hourlyData.hours,
      confidence: quality.confidence,
      includeN2: input.includeN2,
    });
    rows.push({
      cluster,
      policy,
      capacity,
      recommendation: calculateFillUpRecommendations({ capacityAnalysis: capacity, profiles: input.profiles, workloadMix: input.workloadMix, cpuDemandConcurrencyPct: input.cpuDemandConcurrencyPct }),
      quality,
      chartHours: hourlyData.hours.map(({ timestampUtc, clusterCpuDemandMHz, clusterMemoryUtilizationMiB }) => ({
        timestampUtc,
        clusterCpuDemandMHz,
        clusterMemoryUtilizationMiB,
      })),
      observedVmProfiles: hourlyData.observedVmProfiles,
      hostCount: hosts.length,
      siteCount: new Set(hosts.map((host) => host.siteId).filter(Boolean)).size,
    });
  }
  return rows.sort((left, right) => left.cluster.name.localeCompare(right.cluster.name, "de-DE"));
}

function groupByCluster(objects: readonly VropsTimeSeriesImportedObject[]): Map<string, VropsTimeSeriesImportedObject[]> {
  const grouped = new Map<string, VropsTimeSeriesImportedObject[]>();
  for (const object of objects) {
    if (!object.clusterKey) continue;
    grouped.set(object.clusterKey, [...(grouped.get(object.clusterKey) ?? []), object]);
  }
  return grouped;
}

function toFillUpHosts(objects: readonly VropsTimeSeriesImportedObject[], hostByKey: ReadonlyMap<string, NormalizedHost>): FillUpHost[] {
  return objects
    .filter((object) => object.objectType === "host" && object.matchStatus === "matched" && object.hostKey)
    .flatMap((object) => {
      const host = hostByKey.get(object.hostKey!);
      return host ? [{
        hostKey: object.hostKey!,
        name: host.host,
        timeSeriesObjectKey: object.objectKey,
        siteId: object.siteId,
        cpuCores: host.cpuCores,
        fallbackCpuCapacityMHz: host.cpuTotalMHz,
        fallbackMemoryCapacityMiB: host.memoryTotalMiB,
      }] : [];
    });
}

function toFillUpVms(
  objects: readonly VropsTimeSeriesImportedObject[],
  vmByKey: ReadonlyMap<string, NormalizedVm>,
  summaries: readonly VropsTimeSeriesSummary[],
): FillUpVm[] {
  return objects
    .filter((object) => object.objectType === "vm" && object.matchStatus === "matched" && object.rvtoolsObjectKey)
    .flatMap((object) => {
      const vm = vmByKey.get(object.rvtoolsObjectKey!);
      if (!vm) return [];
      const summary = summaries.find((entry) => entry.objectKey === object.objectKey);
      return [{
        objectKey: object.objectKey,
        hostKey: object.hostKey,
        resourcePool: vm.resourcePool,
        workloadClass: object.workloadClass ?? "unknown",
        powerState: object.powerState,
        vcpu: vm.cpuCount ?? 0,
        configuredMemoryMiB: vm.memoryMiB ?? 0,
        fallbackCpuDemandMHz: summary?.metricStats.vmCpuDemandAvgMHz?.maximum ?? null,
      }];
    });
}

function toFillUpHours(
  importMeta: VropsTimeSeriesImport,
  clusterObjectKey: string,
  hosts: readonly FillUpHost[],
  vms: readonly FillUpVm[],
  chunks: readonly VropsTimeSeriesChunk[],
  clusterKey: string,
  clusterName: string,
): { hours: FillUpHour[]; observedVmProfiles: FillUpObservedVmProfile[] } {
  const hostCpu = new Map(hosts.map((host) => [host.hostKey, readVropsTimeSeriesMetric(chunks, host.timeSeriesObjectKey ?? `host:${host.name.toLocaleLowerCase("en-US")}`, "hostCpuCapacityAvailableLastMHz")]));
  const hostMemory = new Map(hosts.map((host) => [host.hostKey, readVropsTimeSeriesMetric(chunks, host.timeSeriesObjectKey ?? `host:${host.name.toLocaleLowerCase("en-US")}`, "hostMemoryCapacityAvailableLastMiB")]));
  const vmDemand = new Map(vms.map((vm) => [vm.objectKey, readVropsTimeSeriesMetric(chunks, vm.objectKey, "vmCpuDemandAvgMHz")]));
  const vmReady = new Map(vms.map((vm) => [vm.objectKey, readVropsTimeSeriesMetric(chunks, vm.objectKey, "vmCpuReadyMaxPct")]));
  const clusterDemand = readVropsTimeSeriesMetric(chunks, clusterObjectKey, "clusterCpuDemandAvgMHz");
  const clusterMemory = readVropsTimeSeriesMetric(chunks, clusterObjectKey, "clusterMemoryUtilizationAvgMiB");
  const clusterContention = readVropsTimeSeriesMetric(chunks, clusterObjectKey, "clusterCpuContentionAvgPct");
  const hours = Array.from({ length: importMeta.expectedSlots }, (_, index) => {
    const timestampUtc = importMeta.rangeStartUtc + index * HOUR_MS;
    return {
      timestampUtc,
      hostCapacities: Object.fromEntries(hosts.map((host) => [host.hostKey, {
        cpuCapacityMHz: finiteOrNull(hostCpu.get(host.hostKey)?.get(timestampUtc)),
        memoryCapacityMiB: finiteOrNull(hostMemory.get(host.hostKey)?.get(timestampUtc)),
      }])),
      clusterCpuDemandMHz: finiteOrNull(clusterDemand.get(timestampUtc)),
      clusterMemoryUtilizationMiB: finiteOrNull(clusterMemory.get(timestampUtc)),
      clusterCpuContentionPct: finiteOrNull(clusterContention.get(timestampUtc)),
      vmCpuDemandMHzByVm: Object.fromEntries(vms.map((vm) => [vm.objectKey, finiteOrNull(vmDemand.get(vm.objectKey)?.get(timestampUtc))])),
      vmCpuReadyPctByVm: Object.fromEntries(vms.map((vm) => [vm.objectKey, finiteOrNull(vmReady.get(vm.objectKey)?.get(timestampUtc))])),
    };
  });
  return {
    hours,
    observedVmProfiles: buildObservedVmProfiles({
      clusterKey,
      clusterName,
      vms: vms.map((vm) => ({ objectKey: vm.objectKey, resourcePool: vm.resourcePool ?? null, workloadClass: vm.workloadClass, vcpu: vm.vcpu, configuredMemoryMiB: vm.configuredMemoryMiB })),
      cpuDemandByVm: vmDemand,
      cpuReadyByVm: vmReady,
    }),
  };
}

export interface BuildGlobalWorkloadClassAveragesInput {
  objects: readonly VropsTimeSeriesImportedObject[];
  vms: readonly NormalizedVm[];
  chunks: readonly VropsTimeSeriesChunk[];
}

/**
 * HIGH-/STD-Durchschnittswerte über ALLE eindeutig zugeordneten, eingeschalteten,
 * nicht-vCLS-VMs des Imports – unabhängig vom Cluster. Grundlage für die
 * Standardwerte der „typischen zusätzlichen VM“ in der Fill-Up-Planung.
 */
export function buildGlobalWorkloadClassAverages(input: BuildGlobalWorkloadClassAveragesInput): GlobalWorkloadClassProfile[] {
  const vmByKey = new Map(input.vms.map((vm) => [vm.vmKey, vm]));
  const sources = input.objects.flatMap((object) => {
    if (object.objectType !== "vm" || object.matchStatus !== "matched" || !object.rvtoolsObjectKey) return [];
    if (object.workloadClass !== "high" && object.workloadClass !== "std") return [];
    const vm = vmByKey.get(object.rvtoolsObjectKey);
    if (!vm || !isPoweredOnVm(vm) || isVclsVm(vm)) return [];
    return [{ objectKey: object.objectKey, workloadClass: object.workloadClass, vcpu: vm.cpuCount, configuredMemoryMiB: vm.memoryMiB }];
  });
  return buildGlobalWorkloadClassProfiles({
    vms: sources,
    cpuDemandByVm: new Map(sources.map((vm) => [vm.objectKey, readVropsTimeSeriesMetric(input.chunks, vm.objectKey, "vmCpuDemandAvgMHz")])),
    cpuReadyByVm: new Map(sources.map((vm) => [vm.objectKey, readVropsTimeSeriesMetric(input.chunks, vm.objectKey, "vmCpuReadyMaxPct")])),
  });
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}
