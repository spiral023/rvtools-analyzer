import type {
  ExportStudioSource,
  FillUpAnalysisRun,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedHost,
  NormalizedVm,
  SnapshotMeta,
  TechInfoLatest,
  VmWorkloadProfile,
  VropsTimeSeriesConfidenceLevel,
} from "@/domain/models/types";
import { buildVmRightsizingCandidates, isNotableRightsizingCandidate } from "@/domain/services/vmRightsizingService";
import { VM_BEHAVIOR_CLASS_LABEL, VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { buildMarkdownTable, type TableExportData } from "@/lib/export/tableExport";
import type { ClusterCapacityRow } from "@/lib/clusterCapacityWorkspace";

export type PseudonymKind = "vcenter" | "cluster" | "server" | "host" | "datacenter" | "datastore" | "resource-pool" | "person" | "department" | "text";

export interface ExportStudioColumn {
  id: string;
  label: string;
  pseudonymKind?: PseudonymKind;
  /** Trennt mehrwertige Bezeichner, damit jeder Wert einzeln und konsistent pseudonymisiert wird. */
  pseudonymSeparator?: string;
  /** Gruppiert die Spalte in der Export-Studio-Auswahl; Quellen ohne Kategorien zeigen eine flache Liste. */
  category?: string;
}

export const VM_EXPORT_CATEGORY = {
  inventory: "Inventar",
  techInfo: "Tech-Info",
  classification: "Lastmuster & Klassifikation",
  cpuMetrics: "CPU-Kennzahlen",
  rightsizingRecommendation: "Rightsizing-Empfehlung",
  rightsizingFlags: "Rightsizing-Flags",
} as const;

/**
 * Spaltenkatalog der Datenquelle „VM“. Bewusst außerhalb von `buildVmExportDataset`,
 * damit andere Ansichten dieselbe Spaltenauswahl anbieten können, ohne den vollen
 * Datensatz zu bauen – siehe Spaltenkonfiguration im Tech-Info-Organisations-Drill-down.
 */
export const VM_EXPORT_COLUMNS: ExportStudioColumn[] = [
  { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter", category: VM_EXPORT_CATEGORY.inventory }, { id: "server", label: "Server", pseudonymKind: "server", category: VM_EXPORT_CATEGORY.inventory },
  { id: "cluster", label: "Cluster", pseudonymKind: "cluster", category: VM_EXPORT_CATEGORY.inventory }, { id: "host", label: "Host", pseudonymKind: "host", category: VM_EXPORT_CATEGORY.inventory },
  { id: "powerState", label: "Power-Status", category: VM_EXPORT_CATEGORY.inventory }, { id: "vcpus", label: "vCPU", category: VM_EXPORT_CATEGORY.inventory }, { id: "memory", label: "RAM", category: VM_EXPORT_CATEGORY.inventory },
  { id: "os", label: "Betriebssystem", category: VM_EXPORT_CATEGORY.inventory }, { id: "resourcePool", label: "Resource Pool", pseudonymKind: "resource-pool", category: VM_EXPORT_CATEGORY.inventory },
  { id: "datacenter", label: "Datacenter", pseudonymKind: "datacenter", category: VM_EXPORT_CATEGORY.inventory }, { id: "tools", label: "VMware Tools", category: VM_EXPORT_CATEGORY.inventory }, { id: "annotation", label: "Notiz", pseudonymKind: "text", category: VM_EXPORT_CATEGORY.inventory },
  { id: "hwVersion", label: "HW-Version", category: VM_EXPORT_CATEGORY.inventory }, { id: "toolsVersion", label: "Tools-Version", category: VM_EXPORT_CATEGORY.inventory }, { id: "secureBoot", label: "Secure Boot", category: VM_EXPORT_CATEGORY.inventory },
  { id: "techInfoSysv", label: "Systemverantwortlicher", pseudonymKind: "person", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoSysvDepartment", label: "SysV Abteilung", pseudonymKind: "department", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "techInfoSysvDeputy", label: "SysVStv", pseudonymKind: "person", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoSysvDeputyDepartment", label: "SysVStv Abteilung", pseudonymKind: "department", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "techInfoServerType", label: "Servertyp (Tech-Info)", pseudonymKind: "text", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoMaintenanceWindow", label: "Wartungsfenster (Tech-Info)", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "techInfoOperatingSystem", label: "Betriebssystem (Tech-Info)", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoCluster", label: "Cluster (Tech-Info)", pseudonymKind: "cluster", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "techInfoBz", label: "BZ", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoAz", label: "AZ", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "techInfoCvBackup", label: "CV-Backup", category: VM_EXPORT_CATEGORY.techInfo }, { id: "techInfoComment", label: "Kommentar (Tech-Info)", pseudonymKind: "text", category: VM_EXPORT_CATEGORY.techInfo },
  { id: "shape", label: "Lastmuster", category: VM_EXPORT_CATEGORY.classification }, { id: "intensity", label: "Auslastungsniveau", category: VM_EXPORT_CATEGORY.classification },
  { id: "behaviorClass", label: "Verhaltensklasse", category: VM_EXPORT_CATEGORY.classification }, { id: "profileConfidence", label: "Vertrauen (Profil)", category: VM_EXPORT_CATEGORY.classification }, { id: "profileCoverage", label: "Datenabdeckung (Profil)", category: VM_EXPORT_CATEGORY.classification },
  { id: "coefficientOfVariation", label: "Variationskoeffizient", category: VM_EXPORT_CATEGORY.classification }, { id: "activeHourSharePct", label: "Aktive-Stunden-Anteil", category: VM_EXPORT_CATEGORY.classification }, { id: "utilizationP95Pct", label: "Auslastung P95 (Kapazität)", category: VM_EXPORT_CATEGORY.classification },
  { id: "dutyCyclePct", label: "Arbeitsstunden-Anteil", category: VM_EXPORT_CATEGORY.classification }, { id: "baselineRatio", label: "Grundlastanteil", category: VM_EXPORT_CATEGORY.classification },
  { id: "dailyRepeatability", label: "Tages-Wiederholbarkeit", category: VM_EXPORT_CATEGORY.classification }, { id: "businessHoursConcentration", label: "Business-Hours-Konzentration", category: VM_EXPORT_CATEGORY.classification }, { id: "nightConcentration", label: "Nacht-Konzentration", category: VM_EXPORT_CATEGORY.classification }, { id: "weekendConcentration", label: "Wochenend-Konzentration", category: VM_EXPORT_CATEGORY.classification },
  { id: "configuredCpuCapacity", label: "Konfigurierte CPU-Kapazität (MHz)", category: VM_EXPORT_CATEGORY.cpuMetrics }, { id: "cpuDemandRaw", label: "CPU Demand Rohdaten (7 Tage)", category: VM_EXPORT_CATEGORY.cpuMetrics },
  { id: "rightsizingDemandP95", label: "CPU Demand P95 (MHz)", category: VM_EXPORT_CATEGORY.cpuMetrics }, { id: "rightsizingReadyP95", label: "CPU Ready P95", category: VM_EXPORT_CATEGORY.cpuMetrics },
  { id: "usedVcpuEquivalentP95", label: "Genutzt P95 (vCPU)", category: VM_EXPORT_CATEGORY.rightsizingRecommendation }, { id: "usedVcpuEquivalentPeak", label: "Genutzt Maximum (vCPU)", category: VM_EXPORT_CATEGORY.rightsizingRecommendation },
  { id: "demandBasedVcpu", label: "Bedarfsgerecht (vCPU)", category: VM_EXPORT_CATEGORY.rightsizingRecommendation }, { id: "recommendedVcpu", label: "Empfohlen (vCPU)", category: VM_EXPORT_CATEGORY.rightsizingRecommendation },
  { id: "reclaimableVcpu", label: "Rückgewinnbar (vCPU)", category: VM_EXPORT_CATEGORY.rightsizingRecommendation }, { id: "recommendationWithheld", label: "Keine Empfehlung, weil", category: VM_EXPORT_CATEGORY.rightsizingRecommendation },
  { id: "rightsizingCandidate", label: "Rightsizing-Kandidat", category: VM_EXPORT_CATEGORY.rightsizingFlags },
  { id: "manyVcpuLowDemand", label: "Viele vCPU, geringer Bedarf", category: VM_EXPORT_CATEGORY.rightsizingFlags }, { id: "highCpuReady", label: "Auffälliges CPU Ready", category: VM_EXPORT_CATEGORY.rightsizingFlags },
];

export interface ExportStudioDataset {
  source: ExportStudioSource;
  title: string;
  columns: ExportStudioColumn[];
  rows: Record<string, string>[];
  dataStatus: string;
  scope: string;
  kpis: Array<{ label: string; value: string }>;
}

const number = (value: number | null, fractionDigits = 0) => value === null ? "—" : value.toLocaleString("de-DE", { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits });
const gib = (value: number | null) => value === null ? "—" : `${(value / 1024).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GiB`;
const text = (value: string | null) => value?.trim() || "—";
const pct = (value: number | null) => value === null ? "—" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ratio = (value: number | null) => value === null ? "—" : value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SITE_FAILOVER_RISK_LABEL: Record<string, string> = { ok: "OK", warn: "Warnung", crit: "Kritisch" };
const CONFIDENCE_LABEL: Record<VropsTimeSeriesConfidenceLevel, string> = { high: "hoch", medium: "mittel", low: "niedrig", "not-computable": "nicht berechenbar" };
const RECOMMENDATION_WITHHELD_LABEL: Record<"low-confidence" | "unreliable-shape", string> = {
  "low-confidence": "Datenbasis zu dünn",
  "unreliable-shape": "Muster in 7 Tagen nicht verlässlich",
};

function vcenterNames(snapshots: SnapshotMeta[]) {
  return new Map(snapshots.map((snapshot) => [snapshot.vcenterId, snapshot.vcenterDisplayName]));
}

/** Zeitstempel des vROps-Imports liegen fest in Europe/Vienna (siehe VropsTimeSeriesImport). */
const hourlyTimestampFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Maschinenlesbare Rohwerte (Zeitstempel=Wert-Paare), damit Lücken in der Datenabdeckung sichtbar bleiben. */
function serializeHourlyCpuDemand(hourly: VmWorkloadProfile["hourly"]): string {
  if (!hourly.length) return "—";
  return hourly
    .map((point) => `${hourlyTimestampFormatter.format(new Date(point.timestampUtc))}=${point.cpuDemandMHz !== null ? point.cpuDemandMHz.toFixed(2) : ""}`)
    .join(";");
}

export function buildVmExportDataset(vms: NormalizedVm[], snapshots: SnapshotMeta[], scope: string, workloadProfiles: readonly VmWorkloadProfile[] = [], workloadHosts: readonly NormalizedHost[] = [], techInfoLatest: readonly TechInfoLatest[] = []): ExportStudioDataset {
  const names = vcenterNames(snapshots);
  const techInfoByVmNameNorm = new Map(techInfoLatest.map((entry) => [entry.vmNameNorm, entry]));
  const profileByVmKey = new Map(workloadProfiles.flatMap((profile) => profile.rvtoolsObjectKey ? [[profile.rvtoolsObjectKey, profile] as const] : []));
  const rightsizingByProfileKey = new Map(buildVmRightsizingCandidates({ profiles: workloadProfiles, hosts: workloadHosts }).map((candidate) => [candidate.objectKey, candidate]));
  const hostByKey = new Map(workloadHosts.map((host) => [host.hostKey, host]));
  const configuredCpuCapacityMHz = (profile: VmWorkloadProfile): number | null => {
    const host = profile.hostKey ? hostByKey.get(profile.hostKey) : undefined;
    const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
    return mhzPerCore !== null && profile.vcpu ? mhzPerCore * profile.vcpu : null;
  };
  const rightsizingCandidates = [...rightsizingByProfileKey.values()];
  return {
    source: "vms", title: "VM", columns: VM_EXPORT_COLUMNS, scope,
    dataStatus: latestSnapshotStatus(snapshots),
    kpis: [{ label: "VMs", value: number(vms.length) }, { label: "Eingeschaltet", value: number(vms.filter((vm) => vm.powerState?.toLowerCase() === "poweredon").length) }, { label: "Konfigurierter RAM", value: gib(vms.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0)) }, { label: "Profilierte VMs", value: number(vms.filter((vm) => profileByVmKey.has(vm.vmKey)).length) }, { label: "Rightsizing-Kandidaten", value: number(rightsizingCandidates.filter(isNotableRightsizingCandidate).length) }, { label: "Rückgewinnbare vCPU", value: number(rightsizingCandidates.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0)) }],
    rows: vms.map((vm) => {
      const profile = profileByVmKey.get(vm.vmKey);
      const rightsizing = profile ? rightsizingByProfileKey.get(profile.objectKey) : undefined;
      const signals = profile?.signals ?? null;
      const techInfoEntry = techInfoByVmNameNorm.get(vm.vmName.trim().toLowerCase()) ?? null;
      return {
        vcenter: names.get(vm.vcenterId) ?? vm.vcenterId, server: vm.vmName, cluster: text(vm.cluster), host: text(vm.host), powerState: text(vm.powerState), vcpus: number(vm.cpuCount), memory: gib(vm.memoryMiB), os: text(vm.osConfig ?? vm.osTools), resourcePool: text(vm.resourcePool), datacenter: text(vm.datacenter), tools: text(vm.toolsStatus), annotation: text(vm.annotation),
        hwVersion: text(vm.hwVersion),
        toolsVersion: text(vm.toolsVersion),
        secureBoot: vm.efiSecureBoot === null ? "—" : vm.efiSecureBoot ? "Ja" : "Nein",
        techInfoSysv: text(techInfoEntry?.sysv ?? null),
        techInfoSysvDepartment: text(techInfoEntry?.sysvDepartment ?? null),
        techInfoSysvDeputy: text(techInfoEntry?.sysvDeputy ?? null),
        techInfoSysvDeputyDepartment: text(techInfoEntry?.sysvDeputyDepartment ?? null),
        techInfoServerType: text(techInfoEntry?.serverType ?? null),
        techInfoMaintenanceWindow: text(techInfoEntry?.maintenanceWindow ?? null),
        techInfoOperatingSystem: text(techInfoEntry?.operatingSystem ?? null),
        techInfoCluster: text(techInfoEntry?.clusterFromTechInfo ?? null),
        techInfoBz: text(techInfoEntry?.bz ?? null),
        techInfoAz: text(techInfoEntry?.az ?? null),
        techInfoCvBackup: techInfoEntry?.cvBackup === null || techInfoEntry?.cvBackup === undefined ? "—" : techInfoEntry.cvBackup ? "Ja" : "Nein",
        techInfoComment: text(techInfoEntry?.comment ?? null),
        shape: profile ? VM_WORKLOAD_SHAPE_LABEL[profile.shape] : "—",
        intensity: profile ? VM_WORKLOAD_INTENSITY_LABEL[profile.intensity] : "—",
        behaviorClass: profile ? VM_BEHAVIOR_CLASS_LABEL[profile.behaviorClass] : "—",
        profileConfidence: profile ? CONFIDENCE_LABEL[profile.confidence] : "—",
        profileCoverage: profile ? pct(profile.demand.coverageRatio * 100) : "—",
        coefficientOfVariation: signals ? ratio(signals.coefficientOfVariation) : "—",
        activeHourSharePct: signals ? pct(signals.activeHourSharePct) : "—",
        utilizationP95Pct: signals ? pct(signals.utilizationP95Pct) : "—",
        dutyCyclePct: signals ? pct(signals.dutyCyclePct) : "—",
        baselineRatio: signals ? ratio(signals.baselineRatio) : "—",
        dailyRepeatability: signals ? ratio(signals.dailyRepeatability) : "—",
        businessHoursConcentration: signals ? ratio(signals.businessHoursConcentration) : "—",
        nightConcentration: signals ? ratio(signals.nightConcentration) : "—",
        weekendConcentration: signals ? ratio(signals.weekendConcentration) : "—",
        configuredCpuCapacity: profile ? number(configuredCpuCapacityMHz(profile)) : "—",
        cpuDemandRaw: profile ? serializeHourlyCpuDemand(profile.hourly) : "—",
        rightsizingDemandP95: rightsizing ? number(rightsizing.demand.p95, 2) : "—",
        rightsizingReadyP95: rightsizing ? pct(rightsizing.ready.p95) : "—",
        usedVcpuEquivalentP95: rightsizing ? number(rightsizing.usedVcpuEquivalentP95, 2) : "—",
        usedVcpuEquivalentPeak: rightsizing ? number(rightsizing.usedVcpuEquivalentPeak, 2) : "—",
        demandBasedVcpu: rightsizing ? number(rightsizing.demandBasedVcpu) : "—",
        recommendationWithheld: rightsizing ? (rightsizing.recommendationWithheldReason === null ? "—" : RECOMMENDATION_WITHHELD_LABEL[rightsizing.recommendationWithheldReason]) : "—",
        recommendedVcpu: rightsizing ? number(rightsizing.recommendedVcpu) : "—",
        reclaimableVcpu: rightsizing ? number(rightsizing.reclaimableVcpu) : "—",
        rightsizingCandidate: rightsizing ? (isNotableRightsizingCandidate(rightsizing) ? "Ja" : "Nein") : "—",
        manyVcpuLowDemand: rightsizing ? (rightsizing.flags.manyVcpuLowDemand ? "Ja" : "Nein") : "—",
        highCpuReady: rightsizing ? (rightsizing.flags.highCpuReady ? "Ja" : "Nein") : "—",
      };
    }),
  };
}

export function buildHostExportDataset(hosts: NormalizedHost[], snapshots: SnapshotMeta[], scope: string, vms: readonly NormalizedVm[] = []): ExportStudioDataset {
  const names = vcenterNames(snapshots);
  const hostDensity = new Map<string, { vms: number; poweredOnVcpus: number }>();
  for (const vm of vms) {
    if (!vm.host) continue;
    const key = `${vm.vcenterId}\u0000${vm.host.trim().toLocaleLowerCase("de-DE")}`;
    const aggregate = hostDensity.get(key) ?? { vms: 0, poweredOnVcpus: 0 };
    aggregate.vms += 1;
    if (vm.powerState?.toLowerCase() === "poweredon") aggregate.poweredOnVcpus += vm.cpuCount ?? 0;
    hostDensity.set(key, aggregate);
  }
  const columns: ExportStudioColumn[] = [
    { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter" }, { id: "host", label: "Host", pseudonymKind: "host" }, { id: "cluster", label: "Cluster", pseudonymKind: "cluster" }, { id: "datacenter", label: "Datacenter", pseudonymKind: "datacenter" },
    { id: "cpuModel", label: "CPU-Modell" }, { id: "cores", label: "CPU-Kerne" }, { id: "cpu", label: "CPU-Leistung" }, { id: "mhzPerCore", label: "MHz pro Core" }, { id: "memory", label: "RAM" }, { id: "vms", label: "VMs" }, { id: "vmsPerCore", label: "VMs pro Core" }, { id: "vcpuPerCore", label: "vCPU/Core" }, { id: "esxi", label: "ESXi-Version" }, { id: "vendor", label: "Hersteller" }, { id: "model", label: "Hardware-Modell" }, { id: "maintenance", label: "Wartung" },
  ];
  return {
    source: "hosts", title: "Host-Inventar", columns, scope,
    dataStatus: latestSnapshotStatus(snapshots),
    kpis: [{ label: "Hosts", value: number(hosts.length) }, { label: "CPU-Kerne", value: number(hosts.reduce((sum, host) => sum + (host.cpuCores ?? 0), 0)) }, { label: "RAM", value: gib(hosts.reduce((sum, host) => sum + (host.memoryTotalMiB ?? 0), 0)) }],
    rows: hosts.map((host) => {
      const density = hostDensity.get(`${host.vcenterId}\u0000${host.host.trim().toLocaleLowerCase("de-DE")}`);
      const vmCount = density?.vms ?? host.vmCount;
      return {
        vcenter: names.get(host.vcenterId) ?? host.vcenterId, host: host.host, cluster: text(host.cluster), datacenter: text(host.datacenter),
        cpuModel: text(host.cpuModel), cores: number(host.cpuCores),
        cpu: host.cpuTotalMHz === null ? "—" : `${(host.cpuTotalMHz / 1000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`,
        mhzPerCore: host.cpuTotalMHz !== null && host.cpuCores ? number(host.cpuTotalMHz / host.cpuCores, 2) : "—",
        memory: gib(host.memoryTotalMiB), vms: number(vmCount),
        vmsPerCore: vmCount !== null && host.cpuCores ? ratio(vmCount / host.cpuCores) : "—",
        vcpuPerCore: density && host.cpuCores ? ratio(density.poweredOnVcpus / host.cpuCores) : "—",
        esxi: text(host.version), vendor: text(host.vendor), model: text(host.model), maintenance: text(host.maintenanceMode),
      };
    }),
  };
}

export function buildClusterExportDataset(clusters: NormalizedCluster[], snapshots: SnapshotMeta[], scope: string, capacityRows: ClusterCapacityRow[] = []): ExportStudioDataset {
  const names = vcenterNames(snapshots);
  const capacityByKey = new Map(capacityRows.map((row) => [row.clusterKey, row]));
  const capacityByName = new Map(capacityRows.map((row) => [`${row.vcenterDisplayName} ${row.cluster.trim().toLocaleLowerCase("de-DE")}`, row]));
  const capacityFor = (cluster: NormalizedCluster) => {
    const vcenterDisplayName = names.get(cluster.vcenterId) ?? cluster.vcenterId;
    return capacityByKey.get(cluster.clusterKey)
      ?? capacityByName.get(`${vcenterDisplayName} ${cluster.name.trim().toLocaleLowerCase("de-DE")}`)
      ?? null;
  };
  const columns: ExportStudioColumn[] = [
    { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter" }, { id: "cluster", label: "Cluster", pseudonymKind: "cluster" }, { id: "datacenter", label: "Datacenter", pseudonymKind: "datacenter" }, { id: "hosts", label: "Hosts" }, { id: "vms", label: "VM-Anzahl" }, { id: "vmsPerHost", label: "VMs pro Host" }, { id: "cores", label: "CPU-Kerne" }, { id: "cpu", label: "CPU-Leistung" }, { id: "memory", label: "RAM" }, { id: "ha", label: "HA" }, { id: "drs", label: "DRS" },
    { id: "cpuUsagePct", label: "CPU-Auslastung" }, { id: "memoryUsagePct", label: "RAM-Auslastung" }, { id: "vcpuPerCore", label: "vCPU/Core" }, { id: "ramCommitPct", label: "RAM Commit" }, { id: "ramActivePct", label: "RAM Active" }, { id: "swapBalloonPct", label: "Swap/Balloon" }, { id: "hotHosts", label: "Hot Hosts" }, { id: "maxHostFailures", label: "Ausfallskapazität (Hosts)" }, { id: "siteFailoverRisk", label: "Site-Failover-Risiko" }, { id: "riskScore", label: "Risk Score" }, { id: "risk", label: "Risiko" }, { id: "vropsMissing", label: "vROps fehlt" },
  ];
  return {
    source: "clusters",
    title: "Cluster",
    columns,
    scope,
    dataStatus: latestSnapshotStatus(snapshots),
    kpis: [
      { label: "Cluster", value: number(clusters.length) },
      { label: "Hosts", value: number(clusters.reduce((sum, cluster) => sum + (cluster.numHosts ?? 0), 0)) },
      { label: "RAM", value: gib(clusters.reduce((sum, cluster) => sum + (cluster.totalMemoryMiB ?? 0), 0)) },
      { label: "Cluster mit hohem Risiko", value: number(capacityRows.filter((row) => row.risk === "hoch").length) },
    ],
    rows: clusters.map((cluster) => {
      const capacity = capacityFor(cluster);
      return {
        vcenter: names.get(cluster.vcenterId) ?? cluster.vcenterId,
        cluster: cluster.name,
        datacenter: text(cluster.datacenter),
        hosts: number(cluster.numHosts),
        vms: capacity ? number(capacity.totalVms) : "—",
        vmsPerHost: capacity && capacity.hosts > 0 ? ratio(capacity.totalVms / capacity.hosts) : "—",
        cores: number(cluster.numCpuCores),
        cpu: cluster.totalCpuMHz === null ? "—" : `${(cluster.totalCpuMHz / 1000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`,
        memory: gib(cluster.totalMemoryMiB),
        ha: cluster.haEnabled === null ? "—" : cluster.haEnabled ? "Ja" : "Nein",
        drs: cluster.drsEnabled === null ? "—" : cluster.drsEnabled ? "Ja" : "Nein",
        cpuUsagePct: capacity ? pct(capacity.cpuUsagePct) : "—",
        memoryUsagePct: capacity ? pct(capacity.memoryUsagePct) : "—",
        vcpuPerCore: capacity ? ratio(capacity.vcpuPerCore) : "—",
        ramCommitPct: capacity ? pct(capacity.ramCommitPct) : "—",
        ramActivePct: capacity ? pct(capacity.ramActivePct) : "—",
        swapBalloonPct: capacity ? pct(capacity.swapBalloonPct) : "—",
        hotHosts: capacity ? number(capacity.hotHosts) : "—",
        maxHostFailures: capacity ? number(capacity.maxHostFailures) : "—",
        siteFailoverRisk: capacity?.siteFailoverRisk ? SITE_FAILOVER_RISK_LABEL[capacity.siteFailoverRisk] ?? capacity.siteFailoverRisk : "—",
        riskScore: capacity ? number(capacity.riskScore) : "—",
        risk: capacity ? capacity.risk : "—",
        vropsMissing: capacity ? (capacity.vropsMissing ? "Ja" : "Nein") : "—",
      };
    }),
  };
}

export function buildDatastoreExportDataset(datastores: NormalizedDatastore[], snapshots: SnapshotMeta[], scope: string): ExportStudioDataset {
  const names = vcenterNames(snapshots);
  const columns: ExportStudioColumn[] = [
    { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter" },
    { id: "datastore", label: "Datastore", pseudonymKind: "datastore" },
    { id: "cluster", label: "Datastore-Cluster", pseudonymKind: "cluster" },
    { id: "type", label: "Typ" },
    { id: "capacity", label: "Kapazität" },
    { id: "inUse", label: "Belegt" },
    { id: "free", label: "Frei" },
    { id: "usedPct", label: "Belegt (%)" },
    { id: "freePct", label: "Frei (%)" },
    { id: "status", label: "Kapazitätsstatus" },
    { id: "hostCount", label: "Angebundene Hosts" },
    { id: "hosts", label: "Hosts", pseudonymKind: "host", pseudonymSeparator: ", " },
    { id: "version", label: "Version" },
    { id: "sioc", label: "SIOC" },
  ];
  const status = (freePct: number | null) => {
    if (freePct === null) return "Unbekannt";
    if (freePct < 10) return "Kritisch";
    if (freePct < 20) return "Warnung";
    return "OK";
  };
  return {
    source: "datastores",
    title: "Datastores",
    columns,
    scope,
    dataStatus: latestSnapshotStatus(snapshots),
    kpis: [
      { label: "Datastores", value: number(datastores.length) },
      { label: "Gesamtkapazität", value: gib(datastores.reduce((sum, datastore) => sum + (datastore.capacityMiB ?? 0), 0)) },
      { label: "Freier Speicher", value: gib(datastores.reduce((sum, datastore) => sum + (datastore.freeMiB ?? 0), 0)) },
      { label: "Kritisch", value: number(datastores.filter((datastore) => datastore.freePct !== null && datastore.freePct < 10).length) },
      { label: "Warnung", value: number(datastores.filter((datastore) => datastore.freePct !== null && datastore.freePct >= 10 && datastore.freePct < 20).length) },
    ],
    rows: datastores.map((datastore) => {
      const usedPct = datastore.freePct !== null
        ? 100 - datastore.freePct
        : datastore.capacityMiB && datastore.inUseMiB !== null
          ? (datastore.inUseMiB / datastore.capacityMiB) * 100
          : null;
      return {
        vcenter: names.get(datastore.vcenterId) ?? datastore.vcenterId,
        datastore: datastore.name,
        cluster: text(datastore.clusterName),
        type: text(datastore.type),
        capacity: gib(datastore.capacityMiB),
        inUse: gib(datastore.inUseMiB),
        free: gib(datastore.freeMiB),
        usedPct: pct(usedPct),
        freePct: pct(datastore.freePct),
        status: status(datastore.freePct),
        hostCount: number(datastore.hostNames.length),
        hosts: datastore.hostNames.length ? [...datastore.hostNames].sort((left, right) => left.localeCompare(right, "de-DE")).join(", ") : "—",
        version: text(datastore.version),
        sioc: datastore.siocEnabled === null ? "—" : datastore.siocEnabled ? "Ja" : "Nein",
      };
    }),
  };
}

export function buildFillUpExportDataset(runs: FillUpAnalysisRun[], scope: string): ExportStudioDataset {
  const run = [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const columns: ExportStudioColumn[] = [{ id: "run", label: "Analyse-Run" }, { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter" }, { id: "cluster", label: "Cluster", pseudonymKind: "cluster" }, { id: "profile", label: "Basisprofil" }, { id: "normal", label: "Normalbetrieb" }, { id: "n1", label: "N-1" }, { id: "n2", label: "N-2" }, { id: "site", label: "Site-Failover" }, { id: "additional", label: "Zusätzliche VMs" }, { id: "limiter", label: "Limitierende Metrik" }];
  const results = run?.results ?? [];
  return { source: "fill-up", title: "Fill-Up-Ergebnis", columns, scope, dataStatus: run ? `Run „${run.name}“ vom ${new Date(run.updatedAt).toLocaleString("de-DE")}` : "Kein gespeicherter Fill-Up-Run", kpis: [{ label: "Cluster", value: number(results.length) }, { label: "Grün in N-1", value: number(results.filter((result) => result.n1Status === "green").length) }, { label: "Zusätzliche VMs", value: number(results.reduce((sum, result) => sum + (result.mixAdditionalVms ?? 0), 0)) }], rows: results.map((result) => ({ run: run?.name ?? "—", vcenter: result.vcenterId, cluster: result.clusterName, profile: result.policy.name, normal: result.normalStatus, n1: result.n1Status, n2: result.n2Status ?? "—", site: result.siteFailoverStatus, additional: result.mixAdditionalVms === null ? "—" : `+${result.mixAdditionalVms}`, limiter: result.limitingMetric ?? "—" })) };
}

function latestSnapshotStatus(snapshots: SnapshotMeta[]): string {
  if (!snapshots.length) return "Kein RVTools-Snapshot im aktiven Scope";
  const latest = [...snapshots].sort((left, right) => right.exportTs.localeCompare(left.exportTs))[0];
  return `${snapshots.length} vCenter-Scope${snapshots.length === 1 ? "" : "s"}; jüngster Export ${new Date(latest.exportTs).toLocaleString("de-DE")}`;
}

export function pseudonymizeExportDataset(dataset: ExportStudioDataset, enabledColumnIds?: readonly string[]): ExportStudioDataset {
  const mappings = new Map<string, string>();
  const counters = new Map<PseudonymKind, number>();
  const substitute = (value: string, kind: PseudonymKind) => {
    if (!value || value === "—") return value;
    const key = `${kind}:${value.trim().toLocaleLowerCase("de-DE")}`;
    const known = mappings.get(key);
    if (known) return known;
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    const prefix: Record<PseudonymKind, string> = {
      vcenter: "vcenter", cluster: "cluster", server: "server", host: "host", datacenter: "datacenter", datastore: "datastore", "resource-pool": "resource-pool",
      person: "person", department: "abteilung", text: "text",
    };
    const digits = kind === "vcenter" ? 2 : 3;
    const replacement = `${prefix[kind]}-${String(next).padStart(digits, "0")}`;
    mappings.set(key, replacement);
    return replacement;
  };
  /**
   * Resource Pools folgen der Namenskonvention „<Bezeichner>/<Profil>“ (z.B. „Team-X/HIGH“);
   * das Profilkürzel (HIGH, STD, …) steuert die Fill-Up-Zuordnung und ist kein Bezeichner.
   * Pseudonymisiert wird deshalb nur der Teil vor dem ersten „/“, das Profilkürzel bleibt
   * unverändert sichtbar. Ohne „/“ gilt der gesamte Wert als Bezeichner.
   */
  const substituteResourcePool = (value: string) => {
    if (!value || value === "—") return value;
    const slashIndex = value.indexOf("/");
    if (slashIndex < 0) return substitute(value, "resource-pool");
    const prefix = value.slice(0, slashIndex);
    const suffix = value.slice(slashIndex);
    return prefix.trim() ? `${substitute(prefix, "resource-pool")}${suffix}` : value;
  };
  return {
    ...dataset,
    rows: dataset.rows.map((row) => dataset.columns.reduce<Record<string, string>>((copy, column) => {
      const value = row[column.id] ?? "";
      if (!column.pseudonymKind || (enabledColumnIds && !enabledColumnIds.includes(column.id))) {
        copy[column.id] = value;
        return copy;
      }
      const kind = column.pseudonymKind;
      const substituteItem = kind === "resource-pool" ? substituteResourcePool : (item: string) => substitute(item, kind);
      if (!column.pseudonymSeparator || value === "—") {
        copy[column.id] = substituteItem(value);
        return copy;
      }
      const pseudonymizedValues = value
        .split(column.pseudonymSeparator)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => substituteItem(item));
      copy[column.id] = pseudonymizedValues.join(column.pseudonymSeparator);
      return copy;
    }, {})),
  };
}

export function buildExportDataFromDataset(dataset: ExportStudioDataset, selectedColumnIds: string[]): TableExportData {
  const columnsById = new Map(dataset.columns.map((column) => [column.id, column]));
  const columns = selectedColumnIds.flatMap((id) => {
    const column = columnsById.get(id);
    return column ? [column] : [];
  });
  return {
    headers: columns.map((column) => column.label),
    rows: dataset.rows.map((row) => columns.reduce<Record<string, string>>((result, column) => {
      result[column.label] = row[column.id] ?? "";
      return result;
    }, {})),
  };
}

export function buildManagementMarkdown(title: string, dataset: ExportStudioDataset, data: TableExportData, pseudonymized: boolean): string {
  const kpis = dataset.kpis.map((kpi) => `- **${kpi.label}:** ${kpi.value}`).join("\n");
  return [`# ${title.trim() || dataset.title}`, "", `**Datenstand:** ${dataset.dataStatus}`, `**Scope:** ${dataset.scope}`, `**Datenschutz:** ${pseudonymized ? "Pseudonymisierte Bezeichner im Export" : "Originalbezeichner"}`, "", "## Kennzahlen", kpis || "- Keine Kennzahlen verfügbar", "", "## Ausgewählte Daten", data.headers.length ? buildMarkdownTable(data) : "Keine Spalten ausgewählt."].join("\n");
}
