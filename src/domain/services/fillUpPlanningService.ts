import type {
  CapacityPolicy,
  ClusterCapacityPolicyAssignment,
  FillUpCapacityAnalysis,
  FillUpHour,
  FillUpHost,
  FillUpRecommendationAnalysis,
  FillUpVm,
  FillUpWorkloadMix,
  FillUpWorkloadProfile,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SnapshotMeta,
  VropsDataQualityReport,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesMetricKey,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { resolveEffectiveCapacityPolicy } from "@/domain/services/capacityPolicyService";
import { analyzeFillUpCapacity } from "@/domain/services/fillUpCapacityEngine";
import { calculateFillUpRecommendations } from "@/domain/services/fillUpRecommendationEngine";
import { evaluateVropsDataQuality } from "@/domain/services/vropsDataQualityService";

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
}

export interface FillUpPlanningClusterResult {
  cluster: NormalizedCluster;
  policy: CapacityPolicy;
  capacity: FillUpCapacityAnalysis;
  recommendation: FillUpRecommendationAnalysis;
  quality: VropsDataQualityReport;
  hours: FillUpHour[];
  hostCount: number;
  siteCount: number;
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
    const hours = toFillUpHours(input.import, clusterObject.objectKey, hosts, vms, input.chunks);
    const capacity = analyzeFillUpCapacity({
      policy,
      hosts,
      vms,
      hours,
      confidence: quality.confidence,
      includeN2: input.includeN2,
    });
    rows.push({
      cluster,
      policy,
      capacity,
      recommendation: calculateFillUpRecommendations({ capacityAnalysis: capacity, profiles: input.profiles, workloadMix: input.workloadMix }),
      quality,
      hours,
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
): FillUpHour[] {
  const hostCpu = new Map(hosts.map((host) => [host.hostKey, readMetricSeries(chunks, host.timeSeriesObjectKey ?? `host:${host.name.toLocaleLowerCase("en-US")}`, "hostCpuCapacityAvailableLastMHz")]));
  const hostMemory = new Map(hosts.map((host) => [host.hostKey, readMetricSeries(chunks, host.timeSeriesObjectKey ?? `host:${host.name.toLocaleLowerCase("en-US")}`, "hostMemoryCapacityAvailableLastMiB")]));
  const vmDemand = new Map(vms.map((vm) => [vm.objectKey, readMetricSeries(chunks, vm.objectKey, "vmCpuDemandAvgMHz")]));
  const vmReady = new Map(vms.map((vm) => [vm.objectKey, readMetricSeries(chunks, vm.objectKey, "vmCpuReadyMaxPct")]));
  const clusterDemand = readMetricSeries(chunks, clusterObjectKey, "clusterCpuDemandAvgMHz");
  const clusterMemory = readMetricSeries(chunks, clusterObjectKey, "clusterMemoryUtilizationAvgMiB");
  const clusterContention = readMetricSeries(chunks, clusterObjectKey, "clusterCpuContentionAvgPct");
  return Array.from({ length: importMeta.expectedSlots }, (_, index) => {
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
}

function readMetricSeries(chunks: readonly VropsTimeSeriesChunk[], objectKey: string, metric: VropsTimeSeriesMetricKey): Map<number, number> {
  const valuesByTimestamp = new Map<number, number>();
  for (const chunk of chunks) {
    const objectIndex = chunk.objectKeys.indexOf(objectKey);
    const buffer = chunk.metricValues[metric];
    if (objectIndex < 0 || !buffer) continue;
    const values = new Float32Array(buffer);
    for (let slot = 0; slot < chunk.slotCount; slot += 1) valuesByTimestamp.set(chunk.startUtc + slot * HOUR_MS, values[objectIndex * chunk.slotCount + slot]);
  }
  return valuesByTimestamp;
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}
