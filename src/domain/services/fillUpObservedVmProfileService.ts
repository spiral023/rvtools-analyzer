import type { FillUpObservedVmProfile } from "@/domain/models/types";

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

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}
