import type { NormalizedCluster, NormalizedHost } from "@/domain/models/types";
import { clusterScopeKey, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";
import type { HostDetail } from "@/lib/conversion";

export function findClusterForHost(
  host: HostDetail,
  normalizedHosts: NormalizedHost[],
  clusters: NormalizedCluster[],
): NormalizedCluster | null {
  if (!host.cluster) return null;

  const normalizedHost = normalizedHosts.find((candidate) =>
    candidate.host === host.host
    && candidate.cluster === host.cluster
    && candidate.datacenter === host.datacenter,
  );
  if (!normalizedHost) return null;

  const associationIdentities: ClusterIdentity[] = [
    ...clusters.map((cluster) => ({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name })),
    ...normalizedHosts.map((candidate) => ({ vcenterId: candidate.vcenterId, datacenter: candidate.datacenter, clusterName: candidate.cluster })),
  ];
  const hostIdentity = {
    vcenterId: normalizedHost.vcenterId,
    datacenter: normalizedHost.datacenter,
    clusterName: normalizedHost.cluster,
  };
  const hostKey = clusterScopeKey(hostIdentity.vcenterId, hostIdentity.datacenter, hostIdentity.clusterName);

  return clusters.find((candidate) => {
    if (candidate.vcenterId !== normalizedHost.vcenterId || candidate.name !== host.cluster) return false;
    const resolved = resolveClusterIdentity(
      { vcenterId: candidate.vcenterId, datacenter: candidate.datacenter, clusterName: candidate.name },
      associationIdentities,
    );
    return clusterScopeKey(resolved.vcenterId, resolved.datacenter, resolved.clusterName) === hostKey;
  }) ?? null;
}
