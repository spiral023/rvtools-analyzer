export interface HostClusterReference {
  cluster: string | null;
}

export interface HostClusterDistributionBucket {
  hostCount: number;
  clusterCount: number;
}

export function buildHostClusterDistribution(
  hosts: HostClusterReference[],
): HostClusterDistributionBucket[] {
  const hostsPerCluster = new Map<string, number>();

  for (const host of hosts) {
    if (!host.cluster) continue;
    hostsPerCluster.set(host.cluster, (hostsPerCluster.get(host.cluster) ?? 0) + 1);
  }

  const clustersPerHostCount = new Map<number, number>();
  for (const hostCount of hostsPerCluster.values()) {
    clustersPerHostCount.set(hostCount, (clustersPerHostCount.get(hostCount) ?? 0) + 1);
  }

  return [...clustersPerHostCount.entries()]
    .map(([hostCount, clusterCount]) => ({ hostCount, clusterCount }))
    .sort((a, b) => a.hostCount - b.hostCount);
}
