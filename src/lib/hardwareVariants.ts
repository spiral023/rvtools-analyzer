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
