export interface ClusterIdentity {
  vcenterId: string;
  datacenter: string | null | undefined;
  clusterName: string | null | undefined;
}

const normalized = (value: string | null | undefined) => (value ?? "").trim();

export function clusterScopeKey(
  vcenterId: string,
  datacenter: string | null | undefined,
  clusterName: string | null | undefined,
): string {
  return `${normalized(vcenterId)}\u0000${normalized(datacenter)}\u0000${normalized(clusterName)}`;
}

export function isSameCluster(left: ClusterIdentity, right: ClusterIdentity): boolean {
  return clusterScopeKey(left.vcenterId, left.datacenter, left.clusterName)
    === clusterScopeKey(right.vcenterId, right.datacenter, right.clusterName);
}
