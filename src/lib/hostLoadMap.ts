import type { NormalizedHost, SheetRow, SnapshotMeta } from "@/domain/models/types";
import { toNumber } from "@/lib/xlsx/parseHelpers";

export type HostLoadSeverity = "normal" | "warning" | "critical";
export type HostOperationalState = "connected" | "maintenance" | "disconnected" | "poweredOff" | "unknown";

export interface HostLoadPoint {
  hostKey: string;
  host: string;
  cluster: string | null;
  vcenterId: string;
  vcenterDisplayName: string;
  cpuUsagePct: number;
  memoryUsagePct: number;
  vmCount: number | null;
  /** Garantiert positiver Skalierungswert für Recharts, auch wenn RVTools keine VM-Anzahl liefert. */
  bubbleValue: number;
  vcpuCount: number | null;
  cpuCores: number | null;
  vcpuPerCore: number | null;
  severity: HostLoadSeverity;
  operationalState: HostOperationalState;
}

export interface HostWithoutLoadData {
  hostKey: string;
  host: string;
  cluster: string | null;
  vcenterDisplayName: string;
  operationalState: HostOperationalState;
  missingMetrics: Array<"CPU" | "RAM">;
}

export interface HostLoadMapData {
  points: HostLoadPoint[];
  missingHosts: HostWithoutLoadData[];
  visibleHostCount: number;
}

export interface HostLoadMapFilters {
  clusters: readonly string[];
  hosts: readonly string[];
  search: string;
}

const CPU_WARNING_PCT = 75;
const CPU_CRITICAL_PCT = 85;
const MEMORY_WARNING_PCT = 80;
const MEMORY_CRITICAL_PCT = 90;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("de-DE");
}

function hostRowKey(snapshotId: string, host: string): string {
  return `${snapshotId}::${normalize(host)}`;
}

function isTrue(value: string | null | undefined): boolean {
  return ["true", "yes", "1"].includes(normalize(value));
}

function operationalState(host: NormalizedHost): HostOperationalState {
  if (isTrue(host.maintenanceMode)) return "maintenance";

  const connection = normalize(host.connectionState).replace(/[\s_-]/g, "");
  if (connection && connection !== "connected") return "disconnected";

  const power = normalize(host.powerState).replace(/[\s_-]/g, "");
  if (power && power !== "poweredon" && power !== "on") return "poweredOff";

  if (connection === "connected" || power === "poweredon" || power === "on") return "connected";
  return "unknown";
}

function severity(cpuUsagePct: number, memoryUsagePct: number): HostLoadSeverity {
  if (cpuUsagePct >= CPU_CRITICAL_PCT || memoryUsagePct >= MEMORY_CRITICAL_PCT) return "critical";
  if (cpuUsagePct >= CPU_WARNING_PCT || memoryUsagePct >= MEMORY_WARNING_PCT) return "warning";
  return "normal";
}

function matchesFilters(
  host: NormalizedHost,
  vcenterDisplayName: string,
  filters: HostLoadMapFilters,
): boolean {
  if (filters.clusters.length > 0 && (!host.cluster || !filters.clusters.includes(host.cluster))) return false;
  if (filters.hosts.length > 0 && !filters.hosts.includes(host.host)) return false;

  const search = normalize(filters.search);
  if (!search) return true;
  const searchable = [
    host.host,
    host.cluster,
    host.datacenter,
    host.vcenterId,
    vcenterDisplayName,
    host.vendor,
    host.model,
    host.cpuModel,
    host.version,
    host.build,
    host.connectionState,
    host.powerState,
  ].map(normalize).join(" ");
  return searchable.includes(search);
}

function severityRank(value: HostLoadSeverity): number {
  if (value === "critical") return 2;
  if (value === "warning") return 1;
  return 0;
}

export function buildHostLoadMapData(
  hosts: readonly NormalizedHost[],
  rawVHostRows: readonly SheetRow[],
  snapshots: readonly SnapshotMeta[],
  filters: HostLoadMapFilters,
): HostLoadMapData {
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
  const rawByHost = new Map<string, SheetRow>();

  for (const row of rawVHostRows) {
    const host = String(row.data["Host"] ?? row.data["Name"] ?? "").trim();
    if (host) rawByHost.set(hostRowKey(row.snapshotId, host), row);
  }

  const points: HostLoadPoint[] = [];
  const missingHosts: HostWithoutLoadData[] = [];
  let visibleHostCount = 0;

  for (const host of hosts) {
    const snapshot = snapshotById.get(host.snapshotId);
    const vcenterDisplayName = snapshot?.vcenterDisplayName || host.vcenterId;
    if (!matchesFilters(host, vcenterDisplayName, filters)) continue;
    visibleHostCount += 1;

    const raw = rawByHost.get(hostRowKey(host.snapshotId, host.host));
    const cpuUsagePct = toNumber(raw?.data["CPU usage %"]);
    const memoryUsagePct = toNumber(raw?.data["Memory usage %"]);

    if (cpuUsagePct === null || memoryUsagePct === null) {
      const missingMetrics: Array<"CPU" | "RAM"> = [];
      if (cpuUsagePct === null) missingMetrics.push("CPU");
      if (memoryUsagePct === null) missingMetrics.push("RAM");
      missingHosts.push({
        hostKey: host.hostKey,
        host: host.host,
        cluster: host.cluster,
        vcenterDisplayName,
        operationalState: operationalState(host),
        missingMetrics,
      });
      continue;
    }

    const vcpuCount = toNumber(raw?.data["# vCPUs"]);
    const cpuCores = toNumber(raw?.data["# Cores"]) ?? host.cpuCores;
    const vmCount = toNumber(raw?.data["# VMs"]) ?? host.vmCount;
    points.push({
      hostKey: host.hostKey,
      host: host.host,
      cluster: host.cluster,
      vcenterId: host.vcenterId,
      vcenterDisplayName,
      cpuUsagePct,
      memoryUsagePct,
      vmCount,
      bubbleValue: Math.max(vmCount ?? 1, 1),
      vcpuCount,
      cpuCores,
      vcpuPerCore: vcpuCount !== null && cpuCores !== null && cpuCores > 0 ? vcpuCount / cpuCores : null,
      severity: severity(cpuUsagePct, memoryUsagePct),
      operationalState: operationalState(host),
    });
  }

  points.sort((left, right) =>
    severityRank(left.severity) - severityRank(right.severity)
    || Math.max(left.cpuUsagePct, left.memoryUsagePct) - Math.max(right.cpuUsagePct, right.memoryUsagePct)
    || left.host.localeCompare(right.host, "de-DE", { numeric: true }),
  );
  missingHosts.sort((left, right) => left.host.localeCompare(right.host, "de-DE", { numeric: true }));

  return { points, missingHosts, visibleHostCount };
}
