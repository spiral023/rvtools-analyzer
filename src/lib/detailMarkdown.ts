import type {
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
  TechInfoClientLatest,
} from "@/domain/models/types";
import type { HostDetail } from "@/lib/conversion";
import { buildVariantSummary, type HardwareModelGroup } from "@/lib/hardwareVariants";
import { formatIsoDateTime } from "@/lib/clientDetail";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";

type DetailVm = NormalizedVm & {
  sysv?: string | null;
};

interface HostHbaEntry {
  device: string;
  type: string;
  status: string;
  driver: string;
  model: string;
  wwn: string;
  pci: string;
}

interface HostNicEntry {
  device: string;
  driver: string;
  speed: string;
  duplex: boolean;
  mac: string;
  switchName: string;
  uplinkPort: string;
  pci: string;
  wakeOn: boolean;
}

interface VmMarkdownData {
  diskRows: SheetRow[];
  networkRows: SheetRow[];
  snapshotRows: SheetRow[];
  toolsRows: SheetRow[];
}

interface HostMarkdownData {
  hbas: HostHbaEntry[];
  nics: HostNicEntry[];
  runningVms: NormalizedVm[];
}

interface ClusterMarkdownData {
  clusters: NormalizedCluster[];
  hosts: NormalizedHost[];
  runningVms: NormalizedVm[];
  datastores: NormalizedDatastore[];
}

interface ClusterMarkdownScope {
  vcenterDisplayName: string;
  maxVmsPerHost: number | null;
  maxVmsHost: string | null;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).trim() || "—";
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value ? "Ja" : "Nein";
}

function tableValue(value: unknown): string {
  return text(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function section(title: string, rows: Array<[string, unknown]>): string {
  return [
    `## ${title}`,
    "",
    "| Feld | Wert |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${tableValue(label)} | ${tableValue(value)} |`),
    "",
  ].join("\n");
}

function markdownTable(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "_Keine Daten gefunden_\n";
  return [
    `| ${headers.map(tableValue).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(tableValue).join(" | ")} |`),
    "",
  ].join("\n");
}

function sortByName<T>(items: T[], pickName: (item: T) => string): T[] {
  return [...items].sort((a, b) => pickName(a).localeCompare(pickName(b), "de-DE", { numeric: true, sensitivity: "base" }));
}

export function buildVmDetailMarkdown(vm: DetailVm, data: VmMarkdownData): string {
  const diskRows = sortByName(data.diskRows, (row) => text(row.data["Disk"]));
  const networkRows = sortByName(data.networkRows, (row) => text(row.data["NIC label"]));
  const snapshotRows = sortByName(data.snapshotRows, (row) => text(row.data["Name"]));
  const tools = data.toolsRows[0]?.data ?? {};

  return [
    `# VM ${vm.vmName}`,
    "",
    section("Basis", [
      ["Datacenter", vm.datacenter],
      ["Cluster", vm.cluster],
      ["Host", vm.host],
      ["Power", vm.powerState],
      ["Config", vm.configStatus],
      ["Connection", vm.connectionState],
      ["SysV", vm.sysv],
      ["Folder", vm.folder],
      ["Resource Pool", vm.resourcePool],
      ["VM UUID", vm.vmUuid],
    ]),
    section("Ressourcen", [
      ["vCPU", vm.cpuCount],
      ["RAM", formatBytes(vm.memoryMiB)],
      ["Provisioned", formatBytes(vm.provisionedMiB)],
      ["In Use", formatBytes(vm.inUseMiB)],
      ["OS Config", vm.osConfig],
      ["OS Tools", vm.osTools],
      ["HW Version", vm.hwVersion],
      ["Firmware", vm.firmware],
      ["EFI Secure Boot", bool(vm.efiSecureBoot)],
      ["CBT", bool(vm.cbt)],
      ["Consolidation Needed", bool(vm.consolidationNeeded)],
    ]),
    "## VMware Tools",
    "",
    markdownTable(
      ["Status", "Version", "Required Version", "Upgradeable", "Upgrade Policy"],
      [[
        tools["Tools"] || vm.toolsStatus,
        tools["Tools Version"] || vm.toolsVersion,
        tools["Required Version"],
        tools["Upgradeable"],
        tools["Upgrade Policy"],
      ]],
    ),
    "## Disks",
    "",
    markdownTable(
      ["Disk", "Capacity", "Mode", "Thin", "Controller", "Path"],
      diskRows.map((row) => [
        row.data["Disk"],
        formatBytes(num(row.data["Capacity MiB"])),
        row.data["Disk Mode"],
        row.data["Thin"],
        row.data["Controller"],
        row.data["Disk Path"],
      ]),
    ),
    "## Netzwerk",
    "",
    markdownTable(
      ["NIC", "Adapter", "Network", "Switch", "Connected", "MAC", "IPv4"],
      networkRows.map((row) => [
        row.data["NIC label"],
        row.data["Adapter"],
        row.data["Network"],
        row.data["Switch"],
        row.data["Connected"],
        row.data["Mac Address"],
        row.data["IPv4 Address"],
      ]),
    ),
    "## Snapshots",
    "",
    markdownTable(
      ["Name", "Datum", "Größe", "State", "Quiesced"],
      snapshotRows.map((row) => [
        row.data["Name"],
        row.data["Date / time"],
        formatBytes(num(row.data["Size MiB (total)"])),
        row.data["State"],
        row.data["Quiesced"],
      ]),
    ),
  ].join("\n");
}

export function buildClientDetailMarkdown(client: TechInfoClientLatest): string {
  return [
    `# Client ${client.clientName}`,
    "",
    section("Basis & Identität", [
      ["BLZ", client.blz],
      ["Standort", client.standort],
      ["Site", client.site],
      ["Cluster", client.cluster],
      ["vCenter", client.vcenter],
      ["Domäne", client.domain],
      ["Poolname", client.poolName],
      ["User", client.user],
      ["Insider", client.insider],
    ]),
    section("Hardware & System", [
      ["Hardware", client.hardware],
      ["OS", client.os],
      ["HW Änderungen", client.hwChanges],
      ["Monitoring", client.monitoring],
    ]),
    section("Netzwerk", [
      ["IP", client.ip],
      ["MAC Adresse", client.macAddress],
    ]),
    section("Verwaltung", [
      ["Erstellt von", client.createdBy],
      ["Erstellungsdatum", formatIsoDateTime(client.createdAt)],
      ["Geändert von", client.modifiedBy],
      ["Änderungsdatum", formatIsoDateTime(client.modifiedAt)],
      ["Datenstand (Import)", formatIsoDateTime(client.importedAt)],
    ]),
  ].join("\n");
}

export function buildHostDetailMarkdown(host: HostDetail, data: HostMarkdownData): string {
  return [
    `# ESXi Host ${host.host}`,
    "",
    section("Identität", [
      ["Datacenter", host.datacenter],
      ["Cluster", host.cluster],
      ["Hersteller", host.vendor],
      ["Modell", host.model],
      ["Serial", host.serial],
      ["Service Tag", host.serviceTag],
      ["ESXi", host.esxVersion],
      ["BIOS", [host.biosVendor, host.biosVersion].filter(Boolean).join(" ")],
      ["Maintenance", bool(host.maintenanceMode)],
    ]),
    section("Ressourcen", [
      ["CPU Modell", host.cpuModel],
      ["Sockel", host.cpuSockets],
      ["Kerne/Sockel", host.coresPerCpu],
      ["Kerne gesamt", host.totalCores],
      ["Threads", host.threads],
      ["Takt", host.speedMHz ? `${formatNum(host.speedMHz)} MHz` : "—"],
      ["HT aktiv", bool(host.htActive)],
      ["RAM", formatBytes(host.memoryMiB)],
      ["VMs", host.vmCount],
    ]),
    "## Host Bus Adapter",
    "",
    markdownTable(
      ["Device", "Status", "Typ", "Driver", "Modell", "PCI", "WWN"],
      data.hbas.map((hba) => [hba.device, hba.status, hba.type, hba.driver, hba.model, hba.pci, hba.wwn]),
    ),
    "## Netzwerkadapter",
    "",
    markdownTable(
      ["Device", "Speed", "MAC", "Switch", "Uplink", "Driver", "PCI"],
      data.nics.map((nic) => [
        nic.device,
        nic.speed ? `${num(nic.speed) === null ? nic.speed : (num(nic.speed) || 0) / 1000} Gbps` : "—",
        nic.mac,
        nic.switchName,
        nic.uplinkPort,
        nic.driver,
        nic.pci,
      ]),
    ),
    "## Laufende VMs",
    "",
    markdownTable(
      ["VM", "Power", "vCPU", "RAM", "Cluster", "Resource Pool"],
      sortByName(data.runningVms, (vm) => vm.vmName).map((vm) => [
        vm.vmName,
        vm.powerState,
        vm.cpuCount,
        formatBytes(vm.memoryMiB),
        vm.cluster,
        vm.resourcePool,
      ]),
    ),
  ].join("\n");
}

export function buildHardwareVariantMarkdown(group: HardwareModelGroup): string {
  const summary = buildVariantSummary(group);

  return [
    `# Hardware-Variante ${group.modelLabel}`,
    "",
    section("Konfiguration", [
      ["Hersteller", group.vendor],
      ["Modell", group.modelLabel],
      ["CPU Modell", group.cpuModel],
      ["Sockel", group.cpuSockets],
      ["Kerne/Sockel", group.coresPerCpu],
      ["Takt", group.speedMHz ? `${formatNum(group.speedMHz)} MHz` : "—"],
      ["Hosts", group.count],
      ["CPU-Kerne gesamt", summary.totalCores],
      ["CPU-Leistung gesamt", `${formatNum(summary.totalGhz)} GHz`],
      ["RAM gesamt", formatBytes(summary.totalRamMiB)],
      ["VMs", summary.totalVms],
    ]),
    "## Cluster-Aufschlüsselung",
    "",
    markdownTable(
      ["Cluster", "Hosts", "Cores", "RAM", "VMs"],
      summary.clusterBreakdown.map((cluster) => [
        cluster.cluster,
        cluster.hosts,
        cluster.cores,
        formatBytes(cluster.ramMiB),
        cluster.vms,
      ]),
    ),
    "## Hosts",
    "",
    markdownTable(
      ["Host", "Cluster", "Cores", "RAM", "VMs"],
      sortByName(group.hosts, (host) => host.host).map((host) => [
        host.host,
        host.cluster,
        host.totalCores,
        formatBytes(host.memoryMiB),
        host.vmCount,
      ]),
    ),
  ].join("\n");
}

export function buildClusterDetailMarkdown(
  clusterName: string,
  data: ClusterMarkdownData,
  scope: ClusterMarkdownScope,
): string {
  const totalHostsByCluster = data.clusters.reduce((sum, cluster) => sum + (cluster.numHosts || 0), 0);
  const hostCount = data.hosts.length > 0 ? data.hosts.length : totalHostsByCluster;
  const totalCoresByHosts = data.hosts.reduce((sum, host) => sum + (host.cpuCores || 0), 0);
  const totalCoresByCluster = data.clusters.reduce((sum, cluster) => sum + (cluster.numCpuCores || 0), 0);
  const totalThreadsByHosts = data.hosts.reduce((sum, host) => sum + (host.cpuThreads || 0), 0);
  const totalThreadsByCluster = data.clusters.reduce((sum, cluster) => sum + (cluster.numCpuThreads || 0), 0);
  const totalMemoryByHostsMiB = data.hosts.reduce((sum, host) => sum + (host.memoryTotalMiB || 0), 0);
  const totalMemoryByClusterMiB = data.clusters.reduce((sum, cluster) => sum + (cluster.totalMemoryMiB || 0), 0);
  const totalCpuMHz = data.clusters.reduce((sum, cluster) => sum + (cluster.totalCpuMHz || 0), 0);
  const totalRunningVcpu = data.runningVms.reduce((sum, vm) => sum + (vm.cpuCount || 0), 0);
  const totalRunningVmRamMiB = data.runningVms.reduce((sum, vm) => sum + (vm.memoryMiB || 0), 0);
  const totalCores = totalCoresByHosts > 0 ? totalCoresByHosts : totalCoresByCluster;
  const totalThreads = totalThreadsByHosts > 0 ? totalThreadsByHosts : totalThreadsByCluster;
  const totalMemoryMiB = totalMemoryByHostsMiB > 0 ? totalMemoryByHostsMiB : totalMemoryByClusterMiB;
  const vcpuPerCore = totalCores > 0 ? totalRunningVcpu / totalCores : null;
  const ramCommitPct = totalMemoryMiB > 0 ? totalRunningVmRamMiB / totalMemoryMiB * 100 : null;

  return [
    `# Cluster ${clusterName}`,
    "",
    section("Übersicht", [
      ["vCenter", scope.vcenterDisplayName],
      ["Datacenter", collectClusterDatacenters(data.clusters).join(", ")],
      ["Hosts", hostCount],
      ["Laufende VMs", data.runningVms.length],
      ["Max. VMs/Host", scope.maxVmsPerHost === null
        ? "—"
        : scope.maxVmsHost
          ? `${formatNum(scope.maxVmsPerHost)} (${scope.maxVmsHost})`
          : formatNum(scope.maxVmsPerHost)],
      ["CPU Cores", totalCores],
      ["CPU Threads", totalThreads],
      ["Total RAM", formatBytes(totalMemoryMiB)],
      ["Total CPU MHz", totalCpuMHz ? formatNum(totalCpuMHz) : "—"],
      ["vCPUs laufend", totalRunningVcpu],
      ["vRAM laufend", formatBytes(totalRunningVmRamMiB)],
      ["vCPU/Core", vcpuPerCore === null ? "—" : vcpuPerCore.toFixed(2)],
      ["RAM Commit", formatPct(ramCommitPct)],
    ]),
    "## Hosts",
    "",
    markdownTable(
      ["Host", "Modell", "CPU Cores", "Threads", "RAM", "ESXi", "Power", "Connection"],
      sortByName(data.hosts, (host) => host.host).map((host) => [
        host.host,
        host.model,
        host.cpuCores,
        host.cpuThreads,
        formatBytes(host.memoryTotalMiB),
        host.version,
        host.powerState,
        host.connectionState,
      ]),
    ),
    "## Datastores",
    "",
    markdownTable(
      ["Datastore", "Typ", "Kapazität", "Frei", "Frei %"],
      sortByName(data.datastores, (ds) => ds.name).map((ds) => [
        ds.name,
        ds.type,
        formatBytes(ds.capacityMiB),
        formatBytes(ds.freeMiB),
        formatPct(ds.freePct),
      ]),
    ),
    "## Laufende VMs",
    "",
    markdownTable(
      ["VM", "Host", "vCPU", "RAM", "Config", "OS"],
      sortByName(data.runningVms, (vm) => vm.vmName).map((vm) => [
        vm.vmName,
        vm.host,
        vm.cpuCount,
        formatBytes(vm.memoryMiB),
        vm.configStatus,
        vm.osConfig || vm.osTools,
      ]),
    ),
  ].join("\n");
}

function collectClusterDatacenters(clusters: NormalizedCluster[]): string[] {
  const datacenters = new Set<string>();
  for (const cluster of clusters) {
    if (cluster.datacenter) datacenters.add(cluster.datacenter);
  }
  return [...datacenters];
}
