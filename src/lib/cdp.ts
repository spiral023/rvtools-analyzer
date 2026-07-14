import { normalizeVcenterId, normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { CdpLatest, FilterState } from "@/domain/models/types";

export type CdpFilters = Pick<FilterState, "vcenterIds" | "clusters" | "hosts">;

/**
 * Wendet den globalen Filter auf CDP-Zeilen an. CDP-Daten hängen an keinem Snapshot,
 * daher erfolgt der Abgleich über Namen aus der CSV: vCenter über die vcenterId-Konvention
 * des RVTools-Imports, Cluster exakt, Hosts case-insensitiv. Leere Filterlisten = keine
 * Einschränkung (Konvention der übrigen Panels).
 */
export function filterCdpRows(rows: CdpLatest[], filters: CdpFilters): CdpLatest[] {
  let result = rows;
  if (filters.vcenterIds.length > 0) {
    const vcenterIdSet = new Set(filters.vcenterIds);
    result = result.filter((row) => row.vcenter !== null && vcenterIdSet.has(normalizeVcenterId(row.vcenter)));
  }
  if (filters.clusters.length > 0) {
    const clusterSet = new Set(filters.clusters);
    result = result.filter((row) => row.cluster !== null && clusterSet.has(row.cluster));
  }
  if (filters.hosts.length > 0) {
    const hostSet = new Set(filters.hosts.map((host) => normalizeVmNameForMatch(host)));
    result = result.filter((row) => hostSet.has(row.hostNorm));
  }
  return result;
}
