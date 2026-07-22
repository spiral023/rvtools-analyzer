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

/**
 * Rehydrates a missing Datacenter only when the vCenter and cluster name identify
 * exactly one Datacenter in the associated inventory data. This keeps same-named
 * clusters in different Datacenters safely separated.
 */
export function resolveClusterIdentity(
  identity: ClusterIdentity,
  candidates: Iterable<ClusterIdentity>,
): ClusterIdentity {
  if (normalized(identity.datacenter)) return identity;

  const datacenters = new Set<string>();
  for (const candidate of candidates) {
    if (normalized(candidate.vcenterId) !== normalized(identity.vcenterId)
      || normalized(candidate.clusterName) !== normalized(identity.clusterName)) continue;
    const datacenter = normalized(candidate.datacenter);
    if (datacenter) datacenters.add(datacenter);
  }

  return datacenters.size === 1
    ? { ...identity, datacenter: [...datacenters][0] }
    : identity;
}
