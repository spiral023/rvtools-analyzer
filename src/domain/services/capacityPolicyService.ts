import type {
  CapacityPolicy,
  CapacityPolicyValues,
  CapacityProfileKind,
  CapacityScenario,
  CapacityStatus,
  CapacityThreshold,
  ClusterCapacityPolicyAssignment,
} from "@/domain/models/types";

export const CAPACITY_POLICY_THRESHOLD_CONTEXTS = {
  fillUp: "Versionierte historische Fill-Up-Guardrails. Sie werden ab Phase 5 für Szenarien und Findings verwendet.",
  operationalCapacity: "Bestehende Capacity-Health-Tabelle (`CAPACITY_THRESHOLDS`, `HEALTH_COLUMN_THRESHOLDS`); bleibt unverändert, bis eine fachliche Konsolidierung freigegeben ist.",
  vropsRisk: "Bestehender vROps-Risk-Score (`VROPS_RISK_THRESHOLDS`); eine Priorisierung und keine harte Fill-Up-Grenze.",
} as const;

const BASE_VALUES: CapacityPolicyValues = {
  lookbackDays: 7,
  planningPercentile: 95,
  maxVcpuPerCoreNormal: 4,
  maxVcpuPerCoreN1: 3,
  maxVcpuPerCoreN2: 2,
  cpuDemandWarnPctNormal: 70,
  cpuDemandDangerPctNormal: 80,
  cpuDemandWarnPctN1: 70,
  cpuDemandDangerPctN1: 80,
  cpuDemandWarnPctN2: 65,
  cpuDemandDangerPctN2: 75,
  cpuReadyWarnPct: 5,
  cpuReadyDangerPct: 10,
  cpuContentionWarnPct: 5,
  cpuContentionDangerPct: 10,
  totalRamAssignedWarnPct: 80,
  totalRamAssignedDangerPct: 90,
  memoryUtilizationWarnPct: 80,
  memoryUtilizationDangerPct: 90,
  highRamAssignedWarnPct: 45,
  highRamAssignedDangerPct: 50,
  highCpuSiteWarnPct: 80,
  highCpuSiteDangerPct: 100,
  cpuSafetyBufferPct: 0,
  ramSafetyBufferPct: 0,
  ramSystemReserveMiBPerHost: 0,
  requireN1: true,
  useN2AsHardLimit: false,
  requireHighSiteFailover: true,
  maxSingleVmHostCpuPct: 50,
  maxSingleVmHostRamPct: 50,
};

const PROFILE_DEFINITIONS: ReadonlyArray<{
  id: CapacityProfileKind;
  name: string;
  values: Partial<CapacityPolicyValues>;
}> = [
  { id: "realtime-telephony", name: "Realtime/Telefonie", values: { maxVcpuPerCoreNormal: 2, maxVcpuPerCoreN1: 1.5, maxVcpuPerCoreN2: 1.2, cpuDemandWarnPctNormal: 55, cpuDemandDangerPctNormal: 65, cpuDemandWarnPctN1: 55, cpuDemandDangerPctN1: 65, cpuReadyWarnPct: 2, cpuReadyDangerPct: 5, cpuContentionWarnPct: 2, cpuContentionDangerPct: 5 } },
  { id: "standard-server-windows", name: "Standard Server Windows", values: {} },
  { id: "standard-server-linux", name: "Standard Server Linux", values: { maxVcpuPerCoreNormal: 5, maxVcpuPerCoreN1: 4, maxVcpuPerCoreN2: 3 } },
  { id: "vdi", name: "VDI", values: { maxVcpuPerCoreNormal: 6, maxVcpuPerCoreN1: 5, maxVcpuPerCoreN2: 4, cpuDemandWarnPctNormal: 75, cpuDemandDangerPctNormal: 85, cpuDemandWarnPctN1: 75, cpuDemandDangerPctN1: 85 } },
  { id: "preproduction-test", name: "Vorzone/Test", values: { maxVcpuPerCoreNormal: 6, maxVcpuPerCoreN1: 5, maxVcpuPerCoreN2: null, cpuDemandWarnPctNormal: 75, cpuDemandDangerPctNormal: 85, cpuDemandWarnPctN1: 75, cpuDemandDangerPctN1: 85, cpuDemandWarnPctN2: null, cpuDemandDangerPctN2: null, useN2AsHardLimit: false, requireHighSiteFailover: false } },
  { id: "special", name: "Spezial", values: { maxVcpuPerCoreNormal: 3, maxVcpuPerCoreN1: 2.5, maxVcpuPerCoreN2: 2 } },
  { id: "sap", name: "SAP", values: { maxVcpuPerCoreNormal: 3, maxVcpuPerCoreN1: 2, maxVcpuPerCoreN2: 1.5, cpuDemandWarnPctNormal: 60, cpuDemandDangerPctNormal: 70, cpuDemandWarnPctN1: 60, cpuDemandDangerPctN1: 70, highRamAssignedWarnPct: 40, highRamAssignedDangerPct: 45 } },
  { id: "paas-openshift", name: "PaaS/OpenShift", values: { maxVcpuPerCoreNormal: 5, maxVcpuPerCoreN1: 4, maxVcpuPerCoreN2: 3, maxSingleVmHostCpuPct: 40, maxSingleVmHostRamPct: 40 } },
  { id: "data-warehouse", name: "RDW/Data Warehouse", values: { maxVcpuPerCoreNormal: 4, maxVcpuPerCoreN1: 3, maxVcpuPerCoreN2: 2, memoryUtilizationWarnPct: 75, memoryUtilizationDangerPct: 85, maxSingleVmHostRamPct: 40 } },
  { id: "vmware-management", name: "VMware Management", values: { maxVcpuPerCoreNormal: 3, maxVcpuPerCoreN1: 2, maxVcpuPerCoreN2: 1.5, cpuDemandWarnPctNormal: 60, cpuDemandDangerPctNormal: 70, cpuDemandWarnPctN1: 60, cpuDemandDangerPctN1: 70 } },
];

export function createInitialCapacityPolicies(now = new Date().toISOString()): CapacityPolicy[] {
  return PROFILE_DEFINITIONS.map((profile) => ({
    ...BASE_VALUES,
    ...profile.values,
    id: profile.id,
    version: 1,
    name: profile.name,
    profileKind: profile.id,
    createdAt: now,
    updatedAt: now,
  }));
}

export const BUILT_IN_CAPACITY_POLICY_IDS: ReadonlySet<string> = new Set(PROFILE_DEFINITIONS.map((profile) => profile.id));

export function isBuiltInCapacityPolicy(policy: CapacityPolicy): boolean {
  return BUILT_IN_CAPACITY_POLICY_IDS.has(policy.id);
}

export function createCustomCapacityPolicy(name: string, now = new Date().toISOString()): CapacityPolicy {
  return {
    ...BASE_VALUES,
    id: crypto.randomUUID(),
    version: 1,
    name,
    profileKind: "custom",
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateCapacityPolicy(policy: CapacityPolicy, name: string, now = new Date().toISOString()): CapacityPolicy {
  return {
    ...policy,
    id: crypto.randomUUID(),
    version: 1,
    name,
    profileKind: "custom",
    createdAt: now,
    updatedAt: now,
  };
}

export function getLatestCapacityPolicies(policies: readonly CapacityPolicy[]): CapacityPolicy[] {
  const byId = new Map<string, CapacityPolicy>();
  for (const policy of policies) {
    const current = byId.get(policy.id);
    if (!current || policy.version > current.version) byId.set(policy.id, policy);
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "de-DE"));
}

export function mergeInitialAndStoredCapacityPolicies(storedPolicies: readonly CapacityPolicy[], now?: string): CapacityPolicy[] {
  const byId = new Map(createInitialCapacityPolicies(now).map((policy) => [policy.id, policy]));
  for (const policy of getLatestCapacityPolicies(storedPolicies)) byId.set(policy.id, policy);
  return getLatestCapacityPolicies([...byId.values()]);
}

export function resolveEffectiveCapacityPolicy(
  policies: readonly CapacityPolicy[],
  assignment: ClusterCapacityPolicyAssignment | undefined,
): CapacityPolicy | undefined {
  const base = getLatestCapacityPolicies(policies).find((policy) => policy.id === assignment?.policyId);
  return base && assignment ? { ...base, ...assignment.overrides } : base;
}

export function createCapacityPolicyAssignment(
  cluster: Pick<ClusterCapacityPolicyAssignment, "vcenterId" | "clusterKey" | "clusterName">,
  policyId: CapacityPolicy["id"],
  overrides: Partial<CapacityPolicyValues> = {},
  now = new Date().toISOString(),
): ClusterCapacityPolicyAssignment {
  return {
    ...cluster,
    policyId,
    overrides,
    updatedAt: now,
  };
}

export function createNextCapacityPolicyVersion(
  policy: CapacityPolicy,
  changes: Partial<CapacityPolicyValues> & Pick<Partial<CapacityPolicy>, "name">,
  now = new Date().toISOString(),
): CapacityPolicy {
  return {
    ...policy,
    ...changes,
    version: policy.version + 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateCapacityPolicy(policy: CapacityPolicy): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(policy.lookbackDays) || policy.lookbackDays < 1) errors.push("Der Betrachtungszeitraum muss mindestens einen Tag betragen.");
  if (policy.planningPercentile < 50 || policy.planningPercentile > 100) errors.push("Das Planungsperzentil muss zwischen 50 und 100 liegen.");
  const requiredNumericFields: Array<keyof CapacityPolicyValues> = [
    "maxVcpuPerCoreNormal", "maxVcpuPerCoreN1", "cpuSafetyBufferPct", "ramSafetyBufferPct",
    "ramSystemReserveMiBPerHost", "maxSingleVmHostCpuPct", "maxSingleVmHostRamPct",
  ];
  for (const field of requiredNumericFields) {
    const value = policy[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errors.push(`„${field}“ muss eine nichtnegative Zahl sein.`);
  }
  const pairs: Array<[keyof CapacityPolicyValues, keyof CapacityPolicyValues, string]> = [
    ["cpuDemandWarnPctNormal", "cpuDemandDangerPctNormal", "CPU Demand Normalbetrieb"],
    ["cpuDemandWarnPctN1", "cpuDemandDangerPctN1", "CPU Demand N-1"],
    ["cpuReadyWarnPct", "cpuReadyDangerPct", "CPU Ready"],
    ["cpuContentionWarnPct", "cpuContentionDangerPct", "CPU Contention"],
    ["totalRamAssignedWarnPct", "totalRamAssignedDangerPct", "Gesamt-RAM"],
    ["memoryUtilizationWarnPct", "memoryUtilizationDangerPct", "Memory Utilization"],
    ["highRamAssignedWarnPct", "highRamAssignedDangerPct", "HIGH-RAM"],
    ["highCpuSiteWarnPct", "highCpuSiteDangerPct", "HIGH-Site-CPU"],
  ];
  if (policy.cpuDemandWarnPctN2 !== null && policy.cpuDemandDangerPctN2 !== null && policy.cpuDemandWarnPctN2 >= policy.cpuDemandDangerPctN2) errors.push("CPU Demand N-2: Warnwert muss kleiner als Danger sein.");
  for (const [warning, danger, label] of pairs) {
    const warningValue = policy[warning];
    const dangerValue = policy[danger];
    if (typeof warningValue !== "number" || typeof dangerValue !== "number" || warningValue < 0 || warningValue >= dangerValue) errors.push(`${label}: Warnwert muss nichtnegativ und kleiner als Danger sein.`);
  }
  if (policy.useN2AsHardLimit && (policy.maxVcpuPerCoreN2 === null || policy.cpuDemandDangerPctN2 === null)) errors.push("Eine harte N-2-Grenze benötigt vollständige N-2-Werte.");
  return errors;
}

export function getCapacityStatus(value: number | null, threshold: CapacityThreshold): CapacityStatus {
  if (value === null || !Number.isFinite(value) || threshold.danger === null) return "unknown";
  if (value >= threshold.danger) return "red";
  if (threshold.warning !== null && value >= threshold.warning) return "yellow";
  return "green";
}

export function getPolicyThreshold(policy: CapacityPolicy, metricKey: string, scenario: CapacityScenario): CapacityThreshold | null {
  const percent = (warning: number | null, danger: number | null): CapacityThreshold => ({ warning, danger, unit: "%" });
  if (metricKey === "vcpu-per-core") {
    const danger = scenario === "n1" ? policy.maxVcpuPerCoreN1 : scenario === "n2" ? policy.maxVcpuPerCoreN2 : policy.maxVcpuPerCoreNormal;
    return { warning: danger === null ? null : danger * 0.85, danger, unit: "ratio" };
  }
  if (metricKey === "cpu-demand") {
    if (scenario === "n1") return percent(policy.cpuDemandWarnPctN1, policy.cpuDemandDangerPctN1);
    if (scenario === "n2") return percent(policy.cpuDemandWarnPctN2, policy.cpuDemandDangerPctN2);
    return percent(policy.cpuDemandWarnPctNormal, policy.cpuDemandDangerPctNormal);
  }
  if (metricKey === "cpu-ready") return percent(policy.cpuReadyWarnPct, policy.cpuReadyDangerPct);
  if (metricKey === "cpu-contention") return percent(policy.cpuContentionWarnPct, policy.cpuContentionDangerPct);
  if (metricKey === "total-ram-assigned") return percent(policy.totalRamAssignedWarnPct, policy.totalRamAssignedDangerPct);
  if (metricKey === "memory-utilization") return percent(policy.memoryUtilizationWarnPct, policy.memoryUtilizationDangerPct);
  if (metricKey === "high-ram-assigned") return percent(policy.highRamAssignedWarnPct, policy.highRamAssignedDangerPct);
  if (metricKey === "high-cpu-site") return percent(policy.highCpuSiteWarnPct, policy.highCpuSiteDangerPct);
  if (metricKey === "single-vm-host-cpu") return percent(policy.maxSingleVmHostCpuPct * 0.85, policy.maxSingleVmHostCpuPct);
  if (metricKey === "single-vm-host-ram") return percent(policy.maxSingleVmHostRamPct * 0.85, policy.maxSingleVmHostRamPct);
  return null;
}
