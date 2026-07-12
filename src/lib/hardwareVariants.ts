import type { HostDetail } from "@/lib/conversion";

export const DEFAULT_RAM_VARIANT_TOLERANCE_PERCENT = 1;

export interface HardwareVariantOptions {
  countRamAsVariant?: boolean;
  ramTolerancePercent?: number;
}

export interface HardwareModelGroup {
  signature: string;
  modelLabel: string;
  models: string[];
  vendor: string;
  cpuModel: string;
  cpuSockets: number;
  coresPerCpu: number;
  totalCores: number;
  speedMHz: number;
  memoryMiB: number;
  memoryValuesMiB: number[];
  hosts: HostDetail[];
  count: number;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeCpuClockForGrouping(mhz: number): number {
  if (!mhz) return 0;
  return Math.round((mhz / 1000) * 100) / 100;
}

function buildBaseSignature(host: HostDetail): string {
  return [
    normalizeText(host.vendor || "Unknown Vendor"),
    normalizeText(host.model || "Unknown Model"),
    normalizeText(host.cpuModel || "Unknown CPU"),
    host.totalCores || 0,
    normalizeCpuClockForGrouping(host.speedMHz || 0),
  ].join("|");
}

function isWithinRamTolerance(referenceMiB: number, candidateMiB: number, tolerancePercent: number): boolean {
  if (!referenceMiB || !candidateMiB) return referenceMiB === candidateMiB;
  const deltaPercent = Math.abs(candidateMiB - referenceMiB) / referenceMiB * 100;
  return deltaPercent <= tolerancePercent;
}

function addHostToGroup(group: HardwareModelGroup, host: HostDetail): void {
  group.hosts.push(host);
  group.count += 1;
  if (host.model && !group.models.includes(host.model)) {
    group.models.push(host.model);
    group.models.sort((a, b) => a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" }));
    group.modelLabel = group.models.join(" / ");
  }
  if (host.memoryMiB && !group.memoryValuesMiB.includes(host.memoryMiB)) {
    group.memoryValuesMiB.push(host.memoryMiB);
    group.memoryValuesMiB.sort((a, b) => a - b);
  }
}

function createGroup(host: HostDetail, baseSignature: string): HardwareModelGroup {
  return {
    signature: baseSignature,
    modelLabel: host.model || "Unknown",
    models: host.model ? [host.model] : ["Unknown"],
    vendor: host.vendor || "Unknown",
    cpuModel: host.cpuModel || "Unknown CPU",
    cpuSockets: host.cpuSockets || 0,
    coresPerCpu: host.coresPerCpu || 0,
    totalCores: host.totalCores || 0,
    speedMHz: host.speedMHz || 0,
    memoryMiB: host.memoryMiB || 0,
    memoryValuesMiB: host.memoryMiB ? [host.memoryMiB] : [],
    hosts: [host],
    count: 1,
  };
}

export function buildHardwareModelGroups(
  hosts: HostDetail[],
  options: HardwareVariantOptions = {},
): HardwareModelGroup[] {
  const countRamAsVariant = options.countRamAsVariant ?? false;
  const ramTolerancePercent = options.ramTolerancePercent ?? DEFAULT_RAM_VARIANT_TOLERANCE_PERCENT;
  const entries: Array<{ baseSignature: string; group: HardwareModelGroup }> = [];

  for (const host of hosts) {
    const baseSignature = buildBaseSignature(host);
    const existing = entries.find(({ baseSignature: groupBaseSignature, group }) => {
      if (groupBaseSignature !== baseSignature) return false;
      if (!countRamAsVariant) return true;
      return isWithinRamTolerance(group.memoryMiB, host.memoryMiB || 0, ramTolerancePercent);
    })?.group;

    if (existing) {
      addHostToGroup(existing, host);
      continue;
    }

    const signature = countRamAsVariant
      ? `${baseSignature}|ram~${host.memoryMiB || 0}`
      : baseSignature;
    entries.push({ baseSignature, group: createGroup(host, signature) });
  }

  return entries.map(({ group }) => group).sort(
    (a, b) => b.count - a.count || a.modelLabel.localeCompare(b.modelLabel, "de-DE", { numeric: true, sensitivity: "base" }),
  );
}

export const NO_CLUSTER_LABEL = "Ohne Cluster";

export interface VariantClusterBreakdown {
  cluster: string;
  hosts: number;
  cores: number;
  ramMiB: number;
  vms: number;
}

export interface VariantSummary {
  clusterBreakdown: VariantClusterBreakdown[];
  clusterNames: string[];
  totalCores: number;
  totalGhz: number;
  totalRamMiB: number;
  totalVms: number;
}

export function buildVariantSummary(group: HardwareModelGroup): VariantSummary {
  const byCluster = new Map<string, VariantClusterBreakdown>();
  let totalRamMiB = 0;
  let totalVms = 0;

  for (const host of group.hosts) {
    const cluster = host.cluster || NO_CLUSTER_LABEL;
    let entry = byCluster.get(cluster);
    if (!entry) {
      entry = { cluster, hosts: 0, cores: 0, ramMiB: 0, vms: 0 };
      byCluster.set(cluster, entry);
    }
    entry.hosts += 1;
    entry.cores += host.totalCores || 0;
    entry.ramMiB += host.memoryMiB || 0;
    entry.vms += host.vmCount || 0;
    totalRamMiB += host.memoryMiB || 0;
    totalVms += host.vmCount || 0;
  }

  const clusterBreakdown = [...byCluster.values()].sort((a, b) =>
    a.cluster.localeCompare(b.cluster, "de-DE", { numeric: true, sensitivity: "base" }),
  );
  const totalCores = (group.totalCores || 0) * group.count;
  const totalGhz = Math.round((totalCores * (group.speedMHz || 0)) / 100) / 10;

  return {
    clusterBreakdown,
    clusterNames: clusterBreakdown.map((c) => c.cluster),
    totalCores,
    totalGhz,
    totalRamMiB,
    totalVms,
  };
}
