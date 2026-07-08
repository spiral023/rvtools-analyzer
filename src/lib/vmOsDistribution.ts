import type { NormalizedVm } from "@/domain/models/types";

export type VmOsSource = "tools" | "config";

export interface ClusterOsDistributionRow {
  cluster: string;
  operatingSystem: string;
  vmCount: number;
}

const UNKNOWN_CLUSTER = "Ohne Cluster";
const UNKNOWN_OS = "Unbekannt";

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || "").trim();
  return cleaned || fallback;
}

export function getVmOperatingSystem(vm: NormalizedVm, source: VmOsSource): string {
  return cleanLabel(source === "tools" ? vm.osTools : vm.osConfig, UNKNOWN_OS);
}

export function buildClusterOsDistributionRows(
  vms: NormalizedVm[],
  source: VmOsSource,
): ClusterOsDistributionRow[] {
  const grouped = new Map<string, ClusterOsDistributionRow>();

  for (const vm of vms) {
    const cluster = cleanLabel(vm.cluster, UNKNOWN_CLUSTER);
    const operatingSystem = getVmOperatingSystem(vm, source);
    const key = `${cluster}\u0000${operatingSystem}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.vmCount += 1;
    } else {
      grouped.set(key, { cluster, operatingSystem, vmCount: 1 });
    }
  }

  return [...grouped.values()].sort(
    (a, b) =>
      a.cluster.localeCompare(b.cluster, "de-DE", { numeric: true, sensitivity: "base" }) ||
      b.vmCount - a.vmCount ||
      a.operatingSystem.localeCompare(b.operatingSystem, "de-DE", { numeric: true, sensitivity: "base" }),
  );
}
