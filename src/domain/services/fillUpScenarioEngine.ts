import type { CapacityPolicy, FillUpHost, FillUpScenarioDefinition } from "@/domain/models/types";

/** Erstellt die vollständigen, deterministisch sortierten Ausfallmengen für einen Cluster. */
export function createFillUpScenarioDefinitions(
  hosts: readonly FillUpHost[],
  policy: CapacityPolicy,
  includeN2 = policy.maxVcpuPerCoreN2 !== null && policy.cpuDemandDangerPctN2 !== null,
): {
  normal: FillUpScenarioDefinition;
  n1: FillUpScenarioDefinition[];
  n2: FillUpScenarioDefinition[];
  siteFailover: FillUpScenarioDefinition[];
} {
  const orderedHosts = [...hosts].sort((left, right) => left.hostKey.localeCompare(right.hostKey));
  const normal: FillUpScenarioDefinition = { id: "normal", kind: "normal", removedHostKeys: [], workloadScope: "all", hardLimit: true };
  const n1 = policy.requireN1
    ? orderedHosts.map((host) => ({ id: `n1:${host.hostKey}`, kind: "n1" as const, removedHostKeys: [host.hostKey], workloadScope: "all" as const, hardLimit: true }))
    : [];
  const n2 = includeN2
    ? orderedHosts.flatMap((first, index) => orderedHosts.slice(index + 1).map((second) => ({
      id: `n2:${first.hostKey}:${second.hostKey}`,
      kind: "n2" as const,
      removedHostKeys: [first.hostKey, second.hostKey],
      workloadScope: "all" as const,
      hardLimit: policy.useN2AsHardLimit,
    })))
    : [];
  const siteIds = [...new Set(orderedHosts.map((host) => host.siteId).filter((siteId): siteId is string => Boolean(siteId)))].sort();
  const siteFailover = siteIds.map((siteId) => ({
    id: `site-failover:${siteId}`,
    kind: "site-failover" as const,
    removedHostKeys: orderedHosts.filter((host) => host.siteId === siteId).map((host) => host.hostKey),
    failedSiteId: siteId,
    workloadScope: "high" as const,
    hardLimit: policy.requireHighSiteFailover,
  }));
  return { normal, n1, n2, siteFailover };
}
