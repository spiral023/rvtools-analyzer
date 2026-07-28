import type { FillUpObservedVmProfile, GlobalWorkloadClassProfile } from "@/domain/models/types";
import { average, percentile } from "@/lib/statistics";

export interface ObservedVmProfileSource {
  objectKey: string;
  resourcePool: string | null;
  workloadClass: "high" | "std" | "unknown";
  vcpu: number | null;
  configuredMemoryMiB: number | null;
}

export interface BuildObservedVmProfilesInput {
  clusterKey: string;
  clusterName: string;
  vms: readonly ObservedVmProfileSource[];
  cpuDemandByVm: ReadonlyMap<string, ReadonlyMap<number, number>>;
  cpuReadyByVm: ReadonlyMap<string, ReadonlyMap<number, number>>;
}

/**
 * Bildet beobachtete VM-Referenzprofile ohne UI- oder Persistenzbezug. CPU
 * wird über alle verfügbaren VM-Stunden eines Scopes gewichtet; damit bleibt
 * ein unvollständiger Einzelwert nicht gleich schwer wie eine vollständige
 * Zeitreihe. Der P95 wird als nächster Rang bestimmt und kann direkt als
 * konservativer Fill-Up-Planungswert übernommen werden.
 */
export function buildObservedVmProfiles(input: BuildObservedVmProfilesInput): FillUpObservedVmProfile[] {
  const groups = new Map<string, { scope: FillUpObservedVmProfile["scope"]; resourcePool: string | null; vms: ObservedVmProfileSource[] }>();
  groups.set("cluster", { scope: "cluster", resourcePool: null, vms: [...input.vms] });
  for (const vm of input.vms) {
    const resourcePool = normalizeResourcePool(vm.resourcePool);
    const key = `resource-pool\u0000${resourcePool ?? ""}`;
    const group = groups.get(key) ?? { scope: "resource-pool" as const, resourcePool, vms: [] };
    group.vms.push(vm);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => toObservedProfile(input, group)).sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === "cluster" ? -1 : 1;
    return (left.resourcePool ?? "").localeCompare(right.resourcePool ?? "", "de-DE");
  });
}

function toObservedProfile(
  input: BuildObservedVmProfilesInput,
  group: { scope: FillUpObservedVmProfile["scope"]; resourcePool: string | null; vms: readonly ObservedVmProfileSource[] },
): FillUpObservedVmProfile {
  const cpuDemandValues = group.vms.flatMap((vm) => finiteValues(input.cpuDemandByVm.get(vm.objectKey)?.values()));
  const cpuReadyValues = group.vms.flatMap((vm) => finiteValues(input.cpuReadyByVm.get(vm.objectKey)?.values()));
  const vcpu = group.vms.map((vm) => vm.vcpu).filter(isPositiveFinite);
  const memory = group.vms.map((vm) => vm.configuredMemoryMiB).filter(isPositiveFinite);
  return {
    id: `${input.clusterKey}\u0000${group.scope}\u0000${group.resourcePool ?? ""}`,
    clusterKey: input.clusterKey,
    clusterName: input.clusterName,
    scope: group.scope,
    resourcePool: group.resourcePool,
    suggestedWorkloadClass: group.scope === "resource-pool" && group.vms.length > 0 && group.vms.every((vm) => vm.workloadClass === "high") ? "high" : "std",
    vmCount: group.vms.length,
    vmWithCpuDemandCount: group.vms.filter((vm) => finiteValues(input.cpuDemandByVm.get(vm.objectKey)?.values()).length > 0).length,
    averageVcpu: average(vcpu),
    averageConfiguredMemoryMiB: average(memory),
    averageCpuDemandMHz: average(cpuDemandValues),
    cpuDemandP95MHz: percentile(cpuDemandValues, 0.95),
    cpuReadyP95Pct: percentile(cpuReadyValues, 0.95),
    sampleCount: cpuDemandValues.length,
  };
}

export interface GlobalWorkloadClassVmSource {
  objectKey: string;
  workloadClass: "high" | "std";
  vcpu: number | null;
  configuredMemoryMiB: number | null;
}

export interface BuildGlobalWorkloadClassProfilesInput {
  vms: readonly GlobalWorkloadClassVmSource[];
  cpuDemandByVm: ReadonlyMap<string, ReadonlyMap<number, number>>;
  cpuReadyByVm: ReadonlyMap<string, ReadonlyMap<number, number>>;
}

/**
 * Wie `buildObservedVmProfiles`, aber über ALLE VMs des Imports je HIGH/STD
 * gemittelt statt je Cluster/Resource Pool. Der Aufrufer filtert vorab auf
 * eingeschaltete, nicht-vCLS-VMs; diese Funktion kennt weder Power-State noch
 * vCLS-Erkennung.
 */
export function buildGlobalWorkloadClassProfiles(input: BuildGlobalWorkloadClassProfilesInput): GlobalWorkloadClassProfile[] {
  return (["high", "std"] as const).map((workloadClass) => {
    const vms = input.vms.filter((vm) => vm.workloadClass === workloadClass);
    const cpuDemandValues = vms.flatMap((vm) => finiteValues(input.cpuDemandByVm.get(vm.objectKey)?.values()));
    const cpuReadyValues = vms.flatMap((vm) => finiteValues(input.cpuReadyByVm.get(vm.objectKey)?.values()));
    const vcpu = vms.map((vm) => vm.vcpu).filter(isPositiveFinite);
    const memory = vms.map((vm) => vm.configuredMemoryMiB).filter(isPositiveFinite);
    return {
      workloadClass,
      vmCount: vms.length,
      vmWithCpuDemandCount: vms.filter((vm) => finiteValues(input.cpuDemandByVm.get(vm.objectKey)?.values()).length > 0).length,
      averageVcpu: average(vcpu),
      averageConfiguredMemoryMiB: average(memory),
      averageCpuDemandMHz: average(cpuDemandValues),
      cpuDemandP95MHz: percentile(cpuDemandValues, 0.95),
      cpuReadyP95Pct: percentile(cpuReadyValues, 0.95),
      sampleCount: cpuDemandValues.length,
    };
  });
}

function normalizeResourcePool(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function finiteValues(values: Iterable<number> | undefined): number[] {
  return values ? [...values].filter((value): value is number => Number.isFinite(value)) : [];
}

function isPositiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}
