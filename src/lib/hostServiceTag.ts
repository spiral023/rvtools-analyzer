import type { SheetRow } from "@/domain/models/types";

/** Schlüssel des Joins auf die vHost-Rohzeilen: Snapshot plus normalisierter Hostname. */
function hostRowKey(snapshotId: string, host: string): string {
  return `${snapshotId}::${host.trim().toLocaleLowerCase("de-DE")}`;
}

/**
 * Service Tag (Seriennummer) je Host aus dem RVTools-Blatt vHost.
 *
 * Bewusst aus den Rohdaten und nicht aus `NormalizedHost`: die normalisierten
 * Host-Entities liegen bereits in IndexedDB und trügen das Feld erst nach einem
 * erneuten Upload. Über die Rohzeilen steht der Service Tag sofort für alle
 * importierten Snapshots zur Verfügung.
 */
export function buildHostServiceTagMap(rawVHostRows: readonly SheetRow[]): Map<string, string> {
  const serviceTagByHost = new Map<string, string>();
  for (const row of rawVHostRows) {
    const host = String(row.data["Host"] ?? row.data["Name"] ?? "").trim();
    if (!host) continue;
    // RVTools schreibt „Service tag“; die Großschreibvariante deckt abweichende Exporte ab.
    const serviceTag = String(row.data["Service tag"] ?? row.data["Service Tag"] ?? "").trim();
    if (serviceTag) serviceTagByHost.set(hostRowKey(row.snapshotId, host), serviceTag);
  }
  return serviceTagByHost;
}

/** Service Tag eines normalisierten Hosts; `null`, wenn der Export keinen liefert. */
export function findHostServiceTag(
  serviceTagByHost: ReadonlyMap<string, string>,
  host: { snapshotId: string; host: string },
): string | null {
  return serviceTagByHost.get(hostRowKey(host.snapshotId, host.host)) ?? null;
}
