import { useMemo } from "react";
import { Activity, Boxes, Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { NormalizedDatastore, NormalizedHost, NormalizedVm } from "@/domain/models/types";
import type { ClusterDetailDialogProps } from "@/components/cluster/ClusterDetailDialog";
import { clusterScopeKey, isSameCluster, resolveClusterIdentity, type ClusterIdentity } from "@/lib/clusterIdentity";
import { toNumLoose } from "@/lib/conversion";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { useVropsObjectSeries } from "@/hooks/useVropsObjectSeries";
import { VropsTrendChart } from "@/components/vrops/VropsTrendChart";
import type { DetailDossier, DetailField, DetailKpi, DetailTable } from "@/lib/detailExport";
import { CLUSTER_DETAIL_FIELDS, SYSTEM_DETAIL_SECTIONS } from "@/lib/glossaries/systemDetails";
import {
  DetailCountBadge,
  DetailFieldGrid,
  DetailKpiGrid,
  DetailNarrative,
  DetailSection,
  DetailTableView,
  DetailUnavailable,
  SystemDetailContent,
} from "@/components/detail/SystemDetailLayout";

function poweredOn(vm: NormalizedVm): boolean {
  return ["poweredon", "on"].includes((vm.powerState || "").replace(/\s+/g, "").toLowerCase());
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function scopedDatastoresForCluster(
  datastores: NormalizedDatastore[],
  hosts: NormalizedHost[],
  snapshotIds: Set<string>,
  vcenterId: string,
): NormalizedDatastore[] {
  const hostNames = new Set(hosts.map((host) => host.host.trim().toLowerCase()));
  return datastores.filter((datastore) =>
    snapshotIds.has(datastore.snapshotId)
    && datastore.vcenterId === vcenterId
    && datastore.hostNames.some((host) => hostNames.has(host.trim().toLowerCase())),
  );
}

export function ClusterSystemDetailDialog({
  clusterKey,
  vcenterDisplayName,
  open,
  onClose,
  clusters,
  hosts,
  vms,
  datastores,
  rawVHostRows,
}: ClusterDetailDialogProps) {
  const identities = useMemo<ClusterIdentity[]>(() => [
    ...hosts.map((host) => ({ vcenterId: host.vcenterId, datacenter: host.datacenter, clusterName: host.cluster })),
    ...vms.map((vm) => ({ vcenterId: vm.vcenterId, datacenter: vm.datacenter, clusterName: vm.cluster })),
  ], [hosts, vms]);
  const cluster = useMemo(() => clusters.find((entry) => {
    const identity = resolveClusterIdentity({ vcenterId: entry.vcenterId, datacenter: entry.datacenter, clusterName: entry.name }, identities);
    return entry.clusterKey === clusterKey || clusterScopeKey(identity.vcenterId, identity.datacenter, identity.clusterName) === clusterKey;
  }) ?? null, [clusterKey, clusters, identities]);
  const identity = useMemo(() => cluster ? resolveClusterIdentity({
    vcenterId: cluster.vcenterId,
    datacenter: cluster.datacenter,
    clusterName: cluster.name,
  }, identities) : null, [cluster, identities]);
  const scopedClusters = useMemo(() => identity ? clusters.filter((entry) => isSameCluster({
    vcenterId: entry.vcenterId,
    datacenter: entry.datacenter,
    clusterName: entry.name,
  }, identity)) : [], [clusters, identity]);
  const scopedHosts = useMemo(() => identity ? hosts.filter((host) => isSameCluster({
    vcenterId: host.vcenterId,
    datacenter: host.datacenter,
    clusterName: host.cluster,
  }, identity)) : [], [hosts, identity]);
  const scopedVms = useMemo(() => identity ? vms.filter((vm) => isSameCluster({
    vcenterId: vm.vcenterId,
    datacenter: vm.datacenter,
    clusterName: vm.cluster,
  }, identity)) : [], [identity, vms]);
  const runningVms = useMemo(() => scopedVms.filter(poweredOn).sort((a, b) => a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true })), [scopedVms]);
  const snapshotIds = useMemo(() => new Set(scopedClusters.map((entry) => entry.snapshotId)), [scopedClusters]);
  const scopedDatastores = useMemo(
    () => identity ? scopedDatastoresForCluster(datastores, scopedHosts, snapshotIds, identity.vcenterId) : [],
    [datastores, identity, scopedHosts, snapshotIds],
  );
  const rawHosts = useMemo(() => identity ? rawVHostRows.filter((row) =>
    snapshotIds.has(row.snapshotId)
    && String(row.data["Cluster"] ?? "").trim() === (identity.clusterName || "").trim()
    && String(row.data["Datacenter"] ?? "").trim() === (identity.datacenter || "").trim(),
  ) : [], [identity, rawVHostRows, snapshotIds]);
  const vrops = useVropsObjectSeries({
    objectType: "cluster",
    rvtoolsObjectKey: cluster?.clusterKey ?? null,
    cpuCapacityMHz: cluster?.totalCpuMHz ?? null,
    secondaryCapacity: cluster?.totalMemoryMiB ?? null,
  });
  if (!cluster || !identity) return null;

  const hostCount = scopedHosts.length || cluster.numHosts || 0;
  const totalCores = scopedHosts.reduce((sum, host) => sum + (host.cpuCores ?? 0), 0) || cluster.numCpuCores || 0;
  const totalThreads = scopedHosts.reduce((sum, host) => sum + (host.cpuThreads ?? 0), 0) || cluster.numCpuThreads || 0;
  const totalMemory = scopedHosts.reduce((sum, host) => sum + (host.memoryTotalMiB ?? 0), 0) || cluster.totalMemoryMiB || 0;
  const totalVcpu = runningVms.reduce((sum, vm) => sum + (vm.cpuCount ?? 0), 0);
  const totalVram = runningVms.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0);
  const vcpuPerCore = totalCores ? totalVcpu / totalCores : null;
  const ramCommit = totalMemory ? totalVram / totalMemory * 100 : null;
  const cpuUsage = average(rawHosts.map((row) => toNumLoose(row.data["CPU usage %"])));
  const memoryUsage = average(rawHosts.map((row) => toNumLoose(row.data["Memory usage %"])));
  const criticalDatastores = scopedDatastores.filter((datastore) => (datastore.freePct ?? 100) < 10).length;
  const avgFree = average(scopedDatastores.flatMap((datastore) => datastore.freePct === null ? [] : [datastore.freePct]));
  const vmCounts = scopedHosts.map((host) => ({
    host: host.host,
    count: runningVms.filter((vm) => vm.host === host.host).length,
  })).sort((a, b) => b.count - a.count);
  const trendExample = vrops.isMatched
    ? `Für dieses Cluster sind ${vrops.hourly.length.toLocaleString("de-DE")} Stunden importiert. Die Ansicht zeigt CPU Demand und RAM-Auslastung als Verlauf; die aktuelle Momentaufnahme ist davon getrennt zu lesen.`
    : "Für dieses Cluster liegt noch keine passende vROps-Zeitreihe vor; die Inventarwerte bleiben trotzdem auswertbar.";
  const vcpuPerCoreExample = vcpuPerCore === null
    ? undefined
    : `Hier: ${formatNum(totalVcpu)} konfigurierte vCPU geteilt durch ${formatNum(totalCores)} physische Cores = ${vcpuPerCore.toLocaleString("de-DE", { maximumFractionDigits: 2 })}:1. Das ist Overcommit, nicht die aktuelle CPU-Usage.`;
  const ramCommitExample = ramCommit === null
    ? undefined
    : `Hier: ${formatBytes(totalVram)} konfigurierter VM-RAM gegenüber ${formatBytes(totalMemory)} physischem RAM = ${formatPct(ramCommit)}. Erst aktive Nutzung, Ballooning oder Swapping zeigen echten RAM-Druck.`;

  const kpis: DetailKpi[] = [
    { label: "Hosts", value: formatNum(hostCount), hint: `${formatNum(cluster.numEffectiveHosts)} effektiv`, tone: (cluster.numEffectiveHosts ?? hostCount) < hostCount ? "warning" : "neutral", info: CLUSTER_DETAIL_FIELDS.hosts, infoExample: `Hier: ${formatNum(hostCount)} Hosts, davon ${formatNum(cluster.numEffectiveHosts)} als effektiv gemeldet.` },
    { label: "Laufende VMs", value: formatNum(runningVms.length), hint: `${formatNum(totalVcpu)} vCPU`, info: CLUSTER_DETAIL_FIELDS.runningVms },
    { label: "CPU-Auslastung", value: formatPct(cpuUsage), hint: "RVTools Momentaufnahme", tone: (cpuUsage ?? 0) > 75 ? "warning" : "neutral", info: CLUSTER_DETAIL_FIELDS.cpuUsage, infoExample: `Hier: Durchschnitt ${formatPct(cpuUsage)} über ${formatNum(scopedHosts.length)} Hosts aus dem RVTools-Snapshot.` },
    { label: "RAM-Auslastung", value: formatPct(memoryUsage), hint: "RVTools Momentaufnahme", tone: (memoryUsage ?? 0) > 80 ? "warning" : "neutral", info: CLUSTER_DETAIL_FIELDS.memoryUsage, infoExample: `Hier: Durchschnitt ${formatPct(memoryUsage)} über ${formatNum(scopedHosts.length)} Hosts aus dem RVTools-Snapshot.` },
    { label: "vCPU / Core", value: vcpuPerCore === null ? "—" : vcpuPerCore.toLocaleString("de-DE", { maximumFractionDigits: 2 }), hint: "laufende VMs", tone: (vcpuPerCore ?? 0) > 6 ? "warning" : "neutral", info: CLUSTER_DETAIL_FIELDS.vcpuPerCore, infoExample: vcpuPerCoreExample },
    { label: "Datastore frei", value: formatPct(avgFree), hint: criticalDatastores ? `${criticalDatastores} kritisch` : "keine kritischen", tone: criticalDatastores ? "critical" : "good", info: CLUSTER_DETAIL_FIELDS.datastoreFree, infoExample: `Hier: ${formatPct(avgFree)} Durchschnitt über ${formatNum(scopedDatastores.length)} Datastores; ${formatNum(criticalDatastores)} liegen unter 10 % frei.` },
  ];
  const overviewFields: DetailField[] = [
    { label: "vCenter", value: vcenterDisplayName?.trim() || identity.vcenterId, sensitivity: "identifier" },
    { label: "Datacenter", value: identity.datacenter || "—", sensitivity: "identifier" },
    { label: "HA", value: cluster.haEnabled === null ? "—" : cluster.haEnabled ? "Aktiv" : "Aus", info: CLUSTER_DETAIL_FIELDS.ha },
    { label: "DRS", value: cluster.drsEnabled === null ? "—" : cluster.drsEnabled ? "Aktiv" : "Aus", info: CLUSTER_DETAIL_FIELDS.drs },
    { label: "Hosts", value: formatNum(hostCount), info: CLUSTER_DETAIL_FIELDS.hosts },
    { label: "Effektive Hosts", value: formatNum(cluster.numEffectiveHosts), info: CLUSTER_DETAIL_FIELDS.effectiveHosts },
    { label: "CPU-Kerne", value: formatNum(totalCores), info: CLUSTER_DETAIL_FIELDS.cpuCores },
    { label: "CPU-Threads", value: formatNum(totalThreads), info: CLUSTER_DETAIL_FIELDS.cpuThreads },
    { label: "CPU-Kapazität", value: cluster.totalCpuMHz ? `${formatNum(cluster.totalCpuMHz)} MHz` : "—", info: CLUSTER_DETAIL_FIELDS.cpuCapacity },
    { label: "Physischer RAM", value: formatBytes(totalMemory), info: CLUSTER_DETAIL_FIELDS.physicalMemory },
    { label: "Konfigurierter VM-RAM", value: formatBytes(totalVram), info: CLUSTER_DETAIL_FIELDS.configuredVmRam },
    { label: "RAM Commit", value: formatPct(ramCommit), info: CLUSTER_DETAIL_FIELDS.ramCommit, infoExample: ramCommitExample },
  ];
  const hostTable: DetailTable = {
    headers: ["Host", "Modell", "Cores", "RAM", "VMs", "ESXi", "Power", "Connection"],
    rows: scopedHosts.map((host) => [
      host.host,
      host.model || "—",
      formatNum(host.cpuCores),
      formatBytes(host.memoryTotalMiB),
      formatNum(vmCounts.find((entry) => entry.host === host.host)?.count),
      [host.version, host.build].filter(Boolean).join(" · ") || "—",
      host.powerState || "—",
      host.connectionState || "—",
    ]),
    sensitiveColumns: { 0: "identifier" },
  };
  const datastoreTable: DetailTable = {
    headers: ["Datastore", "Typ", "Kapazität", "Belegt", "Frei", "Frei %"],
    rows: [...scopedDatastores].sort((a, b) => (a.freePct ?? 101) - (b.freePct ?? 101)).map((datastore) => [
      datastore.name,
      datastore.type || "—",
      formatBytes(datastore.capacityMiB),
      formatBytes(datastore.inUseMiB),
      formatBytes(datastore.freeMiB),
      formatPct(datastore.freePct),
    ]),
    sensitiveColumns: { 0: "identifier" },
  };
  const vmTable: DetailTable = {
    headers: ["VM", "Host", "vCPU", "RAM", "OS", "Resource Pool"],
    rows: runningVms.map((vm) => [
      vm.vmName,
      vm.host || "—",
      formatNum(vm.cpuCount),
      formatBytes(vm.memoryMiB),
      vm.osConfig || vm.osTools || "—",
      vm.resourcePool || "—",
    ]),
    sensitiveColumns: { 0: "identifier", 1: "identifier", 5: "identifier" },
    maxRows: 50,
  };
  const narrative = `Das Cluster betreibt ${formatNum(runningVms.length)} laufende VMs auf ${formatNum(hostCount)} Hosts. Dafür sind ${formatNum(totalVcpu)} vCPU und ${formatBytes(totalVram)} VM-RAM konfiguriert. ${cluster.haEnabled ? "HA" : "HA ist nicht"} und ${cluster.drsEnabled ? "DRS sind" : "DRS ist nicht"} aktiviert.${criticalDatastores ? ` ${criticalDatastores} Datastore${criticalDatastores === 1 ? "" : "s"} liegen unter 10 % freiem Speicher.` : ""}`;
  const dossier: DetailDossier = {
    kind: "Cluster",
    title: cluster.name,
    titleSensitivity: "identifier",
    subtitle: [vcenterDisplayName || identity.vcenterId, identity.datacenter].filter(Boolean).join(" · "),
    summary: narrative,
    kpis,
    trend: vrops.isMatched ? { title: "Cluster-Auslastung · sieben Tage", points: vrops.hourly, cpuCapacityMHz: vrops.cpuCapacityMHz, importedAt: vrops.importedAt } : undefined,
    sections: [
      { title: "Kapazität & Services", fields: overviewFields },
      { title: "ESXi Hosts", table: hostTable },
      { title: "Datastores", table: datastoreTable },
      { title: "Laufende virtuelle Maschinen", table: vmTable },
    ],
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SystemDetailContent
        icon={<Boxes className="size-6" />}
        eyebrow="Cluster-Systemakte"
        title={cluster.name}
        subtitle={[vcenterDisplayName || identity.vcenterId, identity.datacenter].filter(Boolean).join(" · ")}
        badges={
          <>
            <Badge variant={cluster.haEnabled ? "secondary" : "destructive"} className="rounded-full text-[10px]">HA {cluster.haEnabled ? "aktiv" : "aus"}</Badge>
            <Badge variant={cluster.drsEnabled ? "secondary" : "outline"} className="rounded-full text-[10px]">DRS {cluster.drsEnabled ? "aktiv" : "aus"}</Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">{hostCount} Hosts</Badge>
          </>
        }
        dossier={dossier}
      >
        <DetailNarrative source="RVTools · vROps optional">{narrative}</DetailNarrative>
        <DetailKpiGrid items={kpis} />
        <DetailSection icon={<Activity className="size-4" />} title="Auslastung · sieben Tage" description="CPU Demand und Speicherauslastung aus der optionalen vROps-Zeitreihe." info={SYSTEM_DETAIL_SECTIONS.utilizationTrend} infoExample={trendExample}>
          <VropsTrendChart {...vrops} />
          {!vrops.hasImport && <DetailUnavailable title="Keine vROps-Zeitreihe importiert" description="Kapazitäts- und Inventardaten bleiben sichtbar. Der Verlauf wird automatisch ergänzt, sobald passende Daten vorliegen." />}
        </DetailSection>
        <DetailSection icon={<Cpu className="size-4" />} title="Kapazität & Cluster-Services" description="Physische Kapazität, Belegung und Verfügbarkeitsfunktionen." info={SYSTEM_DETAIL_SECTIONS.clusterCapacity} infoExample={ramCommitExample}>
          <DetailFieldGrid fields={overviewFields} />
        </DetailSection>
        <DetailSection icon={<Server className="size-4" />} title="ESXi Hosts" description="Hardware, Belegung und Verbindungszustand der Cluster-Nodes." info={SYSTEM_DETAIL_SECTIONS.clusterHosts} infoExample={`Hier: ${formatNum(scopedHosts.length)} Hosts und ${formatNum(runningVms.length)} laufende VMs im Cluster.`} aside={<DetailCountBadge>{scopedHosts.length}</DetailCountBadge>}>
          <DetailTableView table={hostTable} />
        </DetailSection>
        <DetailSection icon={<HardDrive className="size-4" />} title="Datastores" description="Gemeinsam erreichbare Storage-Kapazität, nach freiem Anteil sortiert." info={SYSTEM_DETAIL_SECTIONS.clusterDatastores} infoExample={`Hier: ${formatNum(scopedDatastores.length)} Datastores, im Mittel ${formatPct(avgFree)} frei.`} aside={<DetailCountBadge>{scopedDatastores.length}</DetailCountBadge>}>
          <DetailTableView table={datastoreTable} />
        </DetailSection>
        <DetailSection icon={<MemoryStick className="size-4" />} title={`Laufende VMs (${runningVms.length})`} description="Aktive Workloads und ihre konfigurierte Ressourcenbelegung." info={SYSTEM_DETAIL_SECTIONS.clusterVms} infoExample={`Hier: ${formatNum(runningVms.length)} VMs mit zusammen ${formatNum(totalVcpu)} vCPU und ${formatBytes(totalVram)} konfiguriertem RAM.`} aside={<DetailCountBadge>{runningVms.length}</DetailCountBadge>}>
          <DetailTableView table={vmTable} />
        </DetailSection>
      </SystemDetailContent>
    </Dialog>
  );
}
