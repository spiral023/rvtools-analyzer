import { toNumLoose } from "@/lib/conversion";
import type {
  MaintenanceClusterAssignment,
  MaintenanceClusterType,
  MaintenanceContact,
  MaintenanceSettings,
  MaintenanceWindow,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SheetRow,
} from "@/domain/models/types";

export const DEFAULT_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  id: "default",
  firstName: "",
  lastName: "",
  companyName: "",
  updatedAt: "",
};

export type MaintenanceType = "ESXi Update" | "Hardware Wartung" | "Konfigurationsänderung";
export type ChangeType = "Normal Change" | "Standard Change";

export interface MaintenanceClusterRow {
  key: string;
  vcenterId: string;
  snapshotId: string;
  name: string;
  hosts: number;
  cores: number;
  totalCpuGhz: number;
  totalRamMiB: number;
  totalVms: number;
  cpuAllocationPct: number | null;
  cpuUsagePct: number | null;
  ramAllocationPct: number | null;
  ramUsagePct: number | null;
  type: MaintenanceClusterType;
  windows: MaintenanceWindow[];
  contacts: MaintenanceContact[];
  additionalEmails: string[];
}

interface BuildMaintenanceRowsInput {
  clusters: NormalizedCluster[];
  hosts: NormalizedHost[];
  vms: NormalizedVm[];
  rawVHostRows: SheetRow[];
  assignments: MaintenanceClusterAssignment[];
}

interface MailClusterInput {
  clusterName: string;
  clusterType: MaintenanceClusterType;
  from: string;
  to: string;
  contacts: MaintenanceContact[];
  additionalEmails?: string[];
}

interface BuildMaintenanceMailTemplateInput {
  maintenanceType: MaintenanceType;
  settings: Pick<MaintenanceSettings, "firstName" | "lastName" | "companyName">;
  contactName: string;
  clusters: MailClusterInput[];
  change?: {
    id?: string;
    title?: string;
    type?: ChangeType;
  };
  links?: Array<{ label: string; url: string }>;
}

export interface MaintenanceMailTemplate {
  subject: string;
  to: string[];
  body: string;
}

const EMAIL_CHARS_TO_REMOVE = /[^a-z0-9.-]/g;

export function transliterateEmailPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(EMAIL_CHARS_TO_REMOVE, "");
}

export function deriveSettingsEmail(settings: Pick<MaintenanceSettings, "firstName" | "lastName" | "companyName">): string {
  const firstName = transliterateEmailPart(settings.firstName);
  const lastName = transliterateEmailPart(settings.lastName);
  const companyName = transliterateEmailPart(settings.companyName);
  if (!firstName || !lastName || !companyName) return "";
  return `${firstName}.${lastName}@${companyName}.at`;
}

export function deriveContactEmail(contact: MaintenanceContact, companyName: string): string {
  return deriveSettingsEmail({
    firstName: contact.firstName,
    lastName: contact.lastName,
    companyName,
  });
}

export function parseTechContactName(value: string): MaintenanceContact {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    lastName: parts[0],
    firstName: parts.slice(1).join(" "),
  };
}

export function createDefaultAssignment(vcenterId: string, clusterName: string): MaintenanceClusterAssignment {
  return {
    id: `${vcenterId}::${clusterName}`,
    vcenterId,
    clusterName,
    type: "Normal",
    windows: [],
    contacts: [],
    additionalEmails: [],
    updatedAt: new Date().toISOString(),
  };
}

export function formatMaintenanceWindow(window: MaintenanceWindow): string {
  if (window.label) return window.label;
  if (window.dayFrom && window.dayTo && window.startTime && window.endTime) {
    return `${window.dayFrom}-${window.dayTo} ${window.startTime}-${window.endTime}`;
  }
  return "—";
}

function isPoweredOn(powerState: string | null | undefined): boolean {
  const normalized = (powerState || "").replace(/\s+/g, "").toLowerCase();
  return normalized === "poweredon" || normalized === "on";
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function assignmentKey(vcenterId: string, clusterName: string): string {
  return `${vcenterId}::${clusterName}`;
}

export function buildMaintenanceRows({
  clusters,
  hosts,
  vms,
  rawVHostRows,
  assignments,
}: BuildMaintenanceRowsInput): MaintenanceClusterRow[] {
  const hostsByCluster = new Map<string, NormalizedHost[]>();
  for (const host of hosts) {
    if (!host.cluster) continue;
    const key = assignmentKey(host.vcenterId, host.cluster);
    const list = hostsByCluster.get(key);
    if (list) list.push(host);
    else hostsByCluster.set(key, [host]);
  }

  const runningVmAgg = new Map<string, { count: number; vCpu: number; vRamMiB: number }>();
  for (const vm of vms) {
    if (!vm.cluster || !isPoweredOn(vm.powerState)) continue;
    const key = assignmentKey(vm.vcenterId, vm.cluster);
    const agg = runningVmAgg.get(key) ?? { count: 0, vCpu: 0, vRamMiB: 0 };
    agg.count += 1;
    agg.vCpu += vm.cpuCount || 0;
    agg.vRamMiB += vm.memoryMiB || 0;
    runningVmAgg.set(key, agg);
  }

  const usageAgg = new Map<string, { weightedCpu: number; cpuWeight: number; weightedRam: number; ramWeight: number }>();
  for (const row of rawVHostRows) {
    const clusterName = String(row.data["Cluster"] || "").trim();
    if (!clusterName) continue;
    const cluster = clusters.find((candidate) => candidate.snapshotId === row.snapshotId && candidate.name === clusterName);
    const vcenterId = cluster?.vcenterId;
    if (!vcenterId) continue;
    const key = assignmentKey(vcenterId, clusterName);
    const cpuCores = toNumLoose(row.data["# Cores"]);
    const memoryMiB = toNumLoose(row.data["# Memory"]);
    const cpuUsagePct = toNumLoose(row.data["CPU usage %"]);
    const ramUsagePct = toNumLoose(row.data["Memory usage %"]);
    const agg = usageAgg.get(key) ?? { weightedCpu: 0, cpuWeight: 0, weightedRam: 0, ramWeight: 0 };
    const cpuWeight = cpuCores > 0 ? cpuCores : 1;
    const ramWeight = memoryMiB > 0 ? memoryMiB : 1;
    agg.weightedCpu += cpuUsagePct * cpuWeight;
    agg.cpuWeight += cpuWeight;
    agg.weightedRam += ramUsagePct * ramWeight;
    agg.ramWeight += ramWeight;
    usageAgg.set(key, agg);
  }

  const assignmentMap = new Map(assignments.map((assignment) => [assignmentKey(assignment.vcenterId, assignment.clusterName), assignment]));

  return clusters
    .map((cluster) => {
      const key = assignmentKey(cluster.vcenterId, cluster.name);
      const clusterHosts = hostsByCluster.get(key) ?? [];
      const vmAgg = runningVmAgg.get(key) ?? { count: 0, vCpu: 0, vRamMiB: 0 };
      const usage = usageAgg.get(key) ?? null;
      const assignment = assignmentMap.get(key);

      const hostCores = clusterHosts.reduce((sum, host) => sum + (host.cpuCores || 0), 0);
      const hostRamMiB = clusterHosts.reduce((sum, host) => sum + (host.memoryTotalMiB || 0), 0);
      const hostCpuMHz = clusterHosts.reduce((sum, host) => sum + (host.cpuTotalMHz || 0), 0);
      const cores = hostCores > 0 ? hostCores : cluster.numCpuCores || 0;
      const totalRamMiB = hostRamMiB > 0 ? hostRamMiB : cluster.totalMemoryMiB || 0;
      const totalCpuMhz = hostCpuMHz > 0 ? hostCpuMHz : cluster.totalCpuMHz || 0;

      return {
        key,
        vcenterId: cluster.vcenterId,
        snapshotId: cluster.snapshotId,
        name: cluster.name,
        hosts: clusterHosts.length > 0 ? clusterHosts.length : cluster.numHosts || 0,
        cores,
        totalCpuGhz: round(totalCpuMhz / 1000, 1),
        totalRamMiB,
        totalVms: vmAgg.count,
        cpuAllocationPct: cores > 0 ? round((vmAgg.vCpu / cores) * 100, 1) : null,
        cpuUsagePct: usage && usage.cpuWeight > 0 ? round(usage.weightedCpu / usage.cpuWeight, 1) : null,
        ramAllocationPct: totalRamMiB > 0 ? round((vmAgg.vRamMiB / totalRamMiB) * 100, 1) : null,
        ramUsagePct: usage && usage.ramWeight > 0 ? round(usage.weightedRam / usage.ramWeight, 1) : null,
        type: assignment?.type ?? "Normal",
        windows: assignment?.windows ?? [],
        contacts: assignment?.contacts ?? [],
        additionalEmails: assignment?.additionalEmails ?? [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de-DE", { numeric: true, sensitivity: "base" }));
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getIntro(maintenanceType: MaintenanceType): string {
  if (maintenanceType === "ESXi Update") {
    return "wir informieren über ein geplantes ESXi Update in den unten angeführten VMware-Clustern.";
  }
  if (maintenanceType === "Hardware Wartung") {
    return "wir informieren über eine geplante Hardware Wartung in den unten angeführten VMware-Clustern.";
  }
  return "wir informieren über eine geplante Konfigurationsänderung in den unten angeführten VMware-Clustern.";
}

export function buildMaintenanceMailTemplate({
  maintenanceType,
  settings,
  contactName,
  clusters,
  change,
  links = [],
}: BuildMaintenanceMailTemplateInput): MaintenanceMailTemplate {
  const changeId = change?.id?.trim();
  const subject = `Wartungsankündigung: ${maintenanceType}${changeId ? ` - ${changeId}` : ""}`;
  const contactEmails = clusters
    .flatMap((cluster) => cluster.contacts)
    .map((contact) => deriveContactEmail(contact, settings.companyName));
  const additionalEmails = clusters
    .flatMap((cluster) => cluster.additionalEmails ?? [])
    .map((email) => email.trim());
  const to = [...new Set([...contactEmails, ...additionalEmails].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "de-DE", { sensitivity: "base" }),
  );

  const clusterLines = clusters.map(
    (cluster) =>
      `- ${cluster.clusterName} | ${cluster.clusterType} | ${formatDateTime(cluster.from)} - ${formatDateTime(cluster.to)}`,
  );
  const hasSpecialCluster = clusters.some((cluster) => cluster.clusterType === "Spezial");
  const changeTitle = change?.title?.trim();
  const hasChangeInfo = Boolean(changeId || changeTitle);
  const changeLines = hasChangeInfo
    ? [
        changeId ? `Change ID: ${changeId}` : null,
        changeTitle ? `Change Titel: ${changeTitle}` : null,
        change?.type ? `Change Typ: ${change.type}` : null,
      ].filter((line): line is string => Boolean(line))
    : [];
  const linkLines = links
    .filter((link) => link.label.trim() && link.url.trim())
    .map((link) => `- ${link.label.trim()}: ${link.url.trim()}`);
  const effectiveContactName = contactName.trim() || `${settings.firstName} ${settings.lastName}`.trim() || "—";
  const signatureName = `${settings.firstName} ${settings.lastName}`.trim() || effectiveContactName;

  const body = [
    "Hallo,",
    "",
    getIntro(maintenanceType),
    "",
    "Betroffene Cluster:",
    ...clusterLines,
    "",
    "Die VMs werden live migriert. Es ist kein Betriebsausfall und keine Beeinträchtigung zu erwarten.",
    hasSpecialCluster ? "Für Spezial-Cluster bitten wir um Abstimmung und erhöhte Aufmerksamkeit während des Wartungsfensters." : null,
    changeLines.length > 0 ? "" : null,
    changeLines.length > 0 ? "Change-Information:" : null,
    ...changeLines,
    "",
    `Ansprechpartner: ${effectiveContactName}`,
    linkLines.length > 0 ? "" : null,
    linkLines.length > 0 ? "Links:" : null,
    ...linkLines,
    "",
    "LG,",
    signatureName,
  ].filter((line): line is string => line !== null);

  return {
    subject,
    to,
    body: body.join("\n"),
  };
}
