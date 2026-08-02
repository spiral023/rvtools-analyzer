import type { NormalizedDatastore, NormalizedHost, SheetRow } from "@/domain/models/types";
import { getDatastoreClusterName } from "@/lib/xlsx/parseHelpers";

export interface DatastoreDetailRow extends NormalizedDatastore {
  computeClusters: string[];
  computeClusterCount: number;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

function hostLookupKey(snapshotId: string, host: string): string {
  return `${snapshotId}::${normalized(host)}`;
}

function firstNonEmptyCell(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function buildDatastoreDetailRows(
  datastores: readonly NormalizedDatastore[],
  hosts: readonly NormalizedHost[],
  rawDatastoreRows: readonly SheetRow[] = [],
): DatastoreDetailRow[] {
  const clusterByHost = new Map<string, string>();
  for (const host of hosts) {
    if (host.cluster) clusterByHost.set(hostLookupKey(host.snapshotId, host.host), host.cluster);
  }
  const rawByDatastore = new Map<string, SheetRow>();
  for (const row of rawDatastoreRows) {
    const name = firstNonEmptyCell(row.data["Name"], row.data["Datastore"], row.data["Datastore name"]);
    if (name) rawByDatastore.set(`${row.snapshotId}::${normalized(name)}`, row);
  }

  return datastores.map((datastore) => {
    const raw = rawByDatastore.get(`${datastore.snapshotId}::${normalized(datastore.name)}`);
    const rawHostNames = String(raw?.data["Hosts"] ?? "")
      .split(/[,;\r\n]+/)
      .map((host) => host.trim())
      .filter(Boolean);
    const hostNames = datastore.hostNames.length > 0 ? datastore.hostNames : rawHostNames;
    const clusters = new Set<string>();
    const directCluster = datastore.clusterName
      || firstNonEmptyCell(raw?.data["Cluster"], raw?.data["Datacenter/Cluster"]);
    if (directCluster) clusters.add(directCluster);
    for (const host of hostNames) {
      const cluster = clusterByHost.get(hostLookupKey(datastore.snapshotId, host));
      if (cluster) clusters.add(cluster);
    }
    const computeClusters = [...clusters].sort((left, right) => left.localeCompare(right, "de-DE", { numeric: true }));
    return {
      ...datastore,
      hostNames,
      datastoreClusterName: datastore.datastoreClusterName
        || (raw ? getDatastoreClusterName(raw.data) : null)
        || null,
      computeClusters,
      computeClusterCount: computeClusters.length,
    };
  });
}
