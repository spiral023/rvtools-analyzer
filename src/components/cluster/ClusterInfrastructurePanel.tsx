import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, Server, Wifi } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { NormalizedCluster, NormalizedHost, SheetRow } from "@/domain/models/types";
import { clusterScopeKey, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";
import { DRIVER_COLUMNS, HOST_COLUMNS, INFRASTRUCTURE_KPI, COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { formatNum } from "@/lib/xlsx/parseHelpers";

interface InfrastructureHostRow extends NormalizedHost {
  clusterKey: string;
}

interface DriverRow {
  clusterKey: string;
  vcenterId: string;
  datacenter: string;
  host: string;
  cluster: string;
  device: string;
  type: string;
  driver: string;
  model: string;
}

interface CpuMixRow {
  clusterKey: string;
  vcenterId: string;
  datacenter: string;
  cluster: string;
  models: number;
  list: string;
}

interface ClusterInfrastructurePanelProps {
  hosts: NormalizedHost[];
  clusters: NormalizedCluster[];
  rawHbaRows: SheetRow[];
  rawNicRows: SheetRow[];
  search: string;
}

const hostColumns: ColumnDef<InfrastructureHostRow, unknown>[] = [
  { accessorKey: "vcenterId", header: "vCenter" },
  { accessorKey: "datacenter", header: "Datacenter" },
  { accessorKey: "host", header: "Host", meta: { info: HOST_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: HOST_COLUMNS.cluster } },
  { accessorKey: "version", header: "ESXi Version", meta: { info: HOST_COLUMNS.version } },
  { accessorKey: "build", header: "Build", meta: { info: HOST_COLUMNS.build } },
  { accessorKey: "cpuModel", header: "CPU Model", meta: { info: HOST_COLUMNS.cpuModel } },
  { accessorKey: "vendor", header: "Vendor", meta: { info: HOST_COLUMNS.vendor } },
  { accessorKey: "model", header: "Model", meta: { info: HOST_COLUMNS.model } },
  { accessorKey: "maintenanceMode", header: "Maintenance", meta: { info: HOST_COLUMNS.maintenanceMode }, cell: ({ getValue }) => getValue() === "True" ? <span className="text-warning">Ja</span> : "Nein" },
];

const driverColumns: ColumnDef<DriverRow, unknown>[] = [
  { accessorKey: "vcenterId", header: "vCenter" },
  { accessorKey: "datacenter", header: "Datacenter" },
  { accessorKey: "host", header: "Host", meta: { info: DRIVER_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: DRIVER_COLUMNS.cluster } },
  { accessorKey: "device", header: "Device", meta: { info: DRIVER_COLUMNS.device } },
  { accessorKey: "type", header: "Typ", meta: { info: DRIVER_COLUMNS.type } },
  { accessorKey: "driver", header: "Treiber", meta: { info: DRIVER_COLUMNS.driver } },
  { accessorKey: "model", header: "Modell", meta: { info: DRIVER_COLUMNS.model } },
];

const normalized = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("de-DE");
const hostKey = (snapshotId: string, host: string) => `${snapshotId}\u0000${normalized(host)}`;

function matchesSearch(search: string, values: Array<string | null | undefined>): boolean {
  return !search || values.some((value) => normalized(value).includes(search));
}

export function ClusterInfrastructurePanel({ hosts, clusters, rawHbaRows, rawNicRows, search }: ClusterInfrastructurePanelProps) {
  const query = normalized(search);
  const associationIdentities = useMemo<ClusterIdentity[]>(() => [
    ...clusters.map((cluster) => ({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name })),
    ...hosts.map((host) => ({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster })),
  ], [clusters, hosts]);
  const clusterKeys = useMemo(
    () => new Set(clusters.map((cluster) => {
      const identity = resolveClusterIdentity({ vcenterId: cluster.vcenterId, datacenter: cluster.datacenter, clusterName: cluster.name }, associationIdentities);
      return clusterScopeKey(identity.vcenterId, identity.datacenter, identity.clusterName);
    })),
    [associationIdentities, clusters],
  );
  const scopedHosts = useMemo<InfrastructureHostRow[]>(
    () => hosts.flatMap((host) => {
      const identity = resolveClusterIdentity({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster }, associationIdentities);
      const clusterKey = clusterScopeKey(identity.vcenterId, identity.datacenter, identity.clusterName);
      if (!host.cluster || !clusterKeys.has(clusterKey)) return [];
      return [{ ...host, clusterKey }];
    }),
    [associationIdentities, clusterKeys, hosts],
  );
  const filteredHosts = useMemo(
    () => scopedHosts.filter((host) => matchesSearch(query, [host.vcenterId, host.datacenter, host.host, host.cluster, host.version, host.build, host.cpuModel, host.vendor, host.model])),
    [query, scopedHosts],
  );
  const hostsBySnapshotAndName = useMemo(
    () => new Map(scopedHosts.map((host) => [hostKey(host.snapshotId, host.host), host])),
    [scopedHosts],
  );
  const driverRows = useMemo<DriverRow[]>(() => {
    const toDriverRows = (rows: SheetRow[], nic: boolean) => rows.flatMap((row) => {
      const host = hostsBySnapshotAndName.get(hostKey(row.snapshotId, String(row.data["Host"] ?? "")));
      if (!host) return [];
      const driver: DriverRow = {
        clusterKey: host.clusterKey,
        vcenterId: host.vcenterId,
        datacenter: host.datacenter ?? "",
        host: host.host,
        cluster: host.cluster ?? "",
        device: String(row.data[nic ? "Network Device" : "Device"] ?? ""),
        type: nic ? "NIC" : String(row.data["Type"] ?? ""),
        driver: String(row.data["Driver"] ?? ""),
        model: nic ? "" : String(row.data["Model"] ?? ""),
      };
      return matchesSearch(query, [driver.vcenterId, driver.datacenter, driver.host, driver.cluster, driver.device, driver.type, driver.driver, driver.model]) ? [driver] : [];
    });
    return [...toDriverRows(rawHbaRows, false), ...toDriverRows(rawNicRows, true)];
  }, [hostsBySnapshotAndName, query, rawHbaRows, rawNicRows]);
  const cpuMix = useMemo<CpuMixRow[]>(() => {
    const byCluster = new Map<string, { host: InfrastructureHostRow; models: Set<string> }>();
    for (const host of filteredHosts) {
      if (!host.cpuModel) continue;
      const existing = byCluster.get(host.clusterKey);
      if (existing) existing.models.add(host.cpuModel);
      else byCluster.set(host.clusterKey, { host, models: new Set([host.cpuModel]) });
    }
    return [...byCluster.values()]
      .filter(({ models }) => models.size > 1)
      .map(({ host, models }) => ({
        clusterKey: host.clusterKey,
        vcenterId: host.vcenterId,
        datacenter: host.datacenter ?? "",
        cluster: host.cluster ?? "",
        models: models.size,
        list: [...models].sort((left, right) => left.localeCompare(right, "de-DE")).join(", "),
      }))
      .sort((left, right) => left.vcenterId.localeCompare(right.vcenterId, "de-DE") || left.datacenter.localeCompare(right.datacenter, "de-DE") || left.cluster.localeCompare(right.cluster, "de-DE"));
  }, [filteredHosts]);
  const maintenanceHosts = filteredHosts.filter((host) => host.maintenanceMode === "True").length;

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Maintenance" value={formatNum(maintenanceHosts)} severity={maintenanceHosts > 0 ? "warn" : "ok"} icon={<Server className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.maintenanceHosts} />
        <KpiCard title="Hosts" value={formatNum(filteredHosts.length)} severity="ok" icon={<Server className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.hosts} />
        <KpiCard title="Treiber-Einträge" value={formatNum(driverRows.length)} severity={driverRows.length > 0 ? "ok" : "warn"} icon={<Wifi className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.driverEntries} />
        <KpiCard title="CPU Mix Cluster" value={formatNum(cpuMix.length)} severity={cpuMix.length > 0 ? "warn" : "ok"} icon={<Cpu className="h-4 w-4" />} info={INFRASTRUCTURE_KPI.cpuMix} />
      </KpiGrid>

      <section>
        <InfoTooltip entry={COMPLIANCE_SECTIONS.cpuMix} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU-Generationen Mix je Cluster</h3></InfoTooltip>
        {cpuMix.length > 0 ? <div className="space-y-2 rounded-lg border border-border/50 bg-card/30 p-4">{cpuMix.map((row) => <div key={row.clusterKey} className="flex flex-wrap items-start gap-x-2 text-sm"><span className="font-medium text-warning">{row.vcenterId} · {row.datacenter} · {row.cluster}</span><span className="text-muted-foreground">— {row.models} Modelle: {row.list}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Keine gemischten CPU-Modelle im aktuellen Scope.</p>}
      </section>

      <section>
        <InfoTooltip entry={COMPLIANCE_SECTIONS.hostInventory} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Inventar ({filteredHosts.length})</h3></InfoTooltip>
        <VirtualTable data={filteredHosts} columns={hostColumns} globalFilter={search} height={350} />
      </section>

      <section>
        <InfoTooltip entry={COMPLIANCE_SECTIONS.driverInventory} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Wifi className="h-4 w-4" /> HBA/NIC Treiberinventar ({driverRows.length})</h3></InfoTooltip>
        <VirtualTable data={driverRows} columns={driverColumns} globalFilter={search} height={350} />
      </section>
    </div>
  );
}
