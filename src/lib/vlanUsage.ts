import type { SheetRow } from "@/domain/models/types";

/** Eine Zeile der VLAN-Nutzungstabelle: aktives VLAN innerhalb eines Clusters. */
export interface VlanUsageRow {
  cluster: string;
  /** VLAN-ID; "0 (untagged)" bei 0/leer, "?" wenn die Portgruppe kein VLAN-Match hat. */
  vlan: string;
  /** Kommaseparierte, deduplizierte Portgruppen-Namen. */
  portgroups: string;
  /** Anzahl distinct VMs mit verbundenem Adapter in diesem (Cluster, VLAN). */
  vmCount: number;
  /** Anzahl distinct Hosts dieser VMs. */
  hostCount: number;
}

const s = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** `Connected` kann Boolean oder String sein (vgl. src/pages/DailyOps.tsx). */
const isConnected = (v: unknown): boolean => v === true || s(v).toLowerCase() === "true";

/** Leere oder 0-VLAN als "untagged" kennzeichnen. */
const normalizeVlan = (raw: string): string => (raw === "" || raw === "0" ? "0 (untagged)" : raw);

interface Acc {
  portgroups: Set<string>;
  vms: Set<string>;
  hosts: Set<string>;
}

/**
 * Aggregiert die aktiv genutzten VLANs je Cluster.
 * Join: vNetwork.Network → vPort."Port Group" / dvPort.Port → VLAN-ID.
 * Cluster: vNetwork.Cluster, sonst Fallback über vInfo (VM → Cluster).
 */
export function buildVlanUsage(
  vNetwork: SheetRow[],
  vPort: SheetRow[],
  dvPort: SheetRow[],
  vInfo: SheetRow[],
): VlanUsageRow[] {
  const pgToVlan = new Map<string, string>();
  for (const r of vPort) {
    const name = s(r.data["Port Group"]);
    if (name) pgToVlan.set(name, s(r.data["VLAN"]));
  }
  for (const r of dvPort) {
    const name = s(r.data["Port"]);
    if (name) pgToVlan.set(name, s(r.data["VLAN"]));
  }

  const vmToCluster = new Map<string, string>();
  for (const r of vInfo) {
    const vm = s(r.data["VM"]);
    if (vm) vmToCluster.set(vm, s(r.data["Cluster"]));
  }

  const groups = new Map<string, Acc>();
  for (const r of vNetwork) {
    if (!isConnected(r.data["Connected"])) continue;
    const pg = s(r.data["Network"]);
    const vlan = pgToVlan.has(pg) ? normalizeVlan(pgToVlan.get(pg)!) : "?";
    const vm = s(r.data["VM"]);
    let cluster = s(r.data["Cluster"]);
    if (!cluster && vm) cluster = vmToCluster.get(vm) ?? "";
    if (!cluster) cluster = "Unbekannt";
    const host = s(r.data["Host"]);

    const key = `${cluster} ${vlan}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = { portgroups: new Set(), vms: new Set(), hosts: new Set() };
      groups.set(key, acc);
    }
    if (pg) acc.portgroups.add(pg);
    if (vm) acc.vms.add(vm);
    if (host) acc.hosts.add(host);
  }

  const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
  return [...groups.entries()]
    .map(([key, acc]) => {
      const spaceIndex = key.indexOf(" ");
      const cluster = key.substring(0, spaceIndex);
      const vlan = key.substring(spaceIndex + 1);
      return {
        cluster,
        vlan,
        portgroups: [...acc.portgroups].sort((a, b) => collator.compare(a, b)).join(", "),
        vmCount: acc.vms.size,
        hostCount: acc.hosts.size,
      };
    })
    .sort((a, b) => collator.compare(a.cluster, b.cluster) || b.vmCount - a.vmCount);
}
