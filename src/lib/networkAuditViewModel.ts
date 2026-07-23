import type { CdpMacRow, L2Classification, L2DiscoveryRow, PortAuditRow, PortMatchStatus } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";

export type NetworkAuditSourceKey = "rvtools" | "cdp" | "eramonIface" | "eramonL2" | "ipam" | "techInfo";
export type NetworkAuditCheckId = "ports" | "hosts" | "mac" | "discovery";
export type NetworkAuditCheckRoute = "overview" | NetworkAuditCheckId;
export type NetworkAuditScope = "attention" | "passed" | "all";
export type NetworkAuditReadiness = "ready" | "limited" | "unavailable";
export type NetworkAuditStatus = "critical" | "review" | "passed" | "unavailable";

export interface NetworkAuditSourceFact {
  count: number;
  importedAt: string | null;
}

export type NetworkAuditSourceFacts = Record<NetworkAuditSourceKey, NetworkAuditSourceFact>;

export interface NetworkAuditCounts {
  critical: number;
  review: number;
  passed: number;
}

export interface NetworkAuditCheckSummary {
  id: NetworkAuditCheckId;
  readiness: NetworkAuditReadiness;
  status: NetworkAuditStatus;
  counts: NetworkAuditCounts;
  missingRequired: NetworkAuditSourceKey[];
  missingOptional: NetworkAuditSourceKey[];
}

export interface NetworkAuditViewModel {
  sources: NetworkAuditSourceFacts;
  checks: Record<NetworkAuditCheckId, NetworkAuditCheckSummary>;
  totals: NetworkAuditCounts;
  nextCheck: NetworkAuditCheckId | null;
  hasExecutableChecks: boolean;
}

export interface BuildNetworkAuditViewModelInput {
  sources: NetworkAuditSourceFacts;
  portRows: PortAuditRow[];
  hostQuality: {
    rvtoolsRows: RvtoolsHostQualityRow[];
    techInfoRows: TechInfoHostQualityRow[];
  };
  cdpMacRows: CdpMacRow[];
  l2DiscoveryRows: L2DiscoveryRow[];
}

const CHECK_ORDER: NetworkAuditCheckId[] = ["ports", "hosts", "mac", "discovery"];

const CHECK_SOURCES: Record<NetworkAuditCheckId, { required: NetworkAuditSourceKey[]; optional: NetworkAuditSourceKey[] }> = {
  ports: { required: ["eramonIface"], optional: ["cdp", "rvtools", "techInfo", "ipam"] },
  hosts: { required: ["rvtools"], optional: ["techInfo", "ipam"] },
  mac: { required: ["cdp", "eramonL2"], optional: [] },
  discovery: { required: ["eramonL2"], optional: ["cdp", "ipam"] },
};

const PORT_MATCH_CATEGORIES = {
  "confirmed-cdp": "passed",
  "no-target": "passed",
  "text-match": "review",
  "documented-only": "review",
  unknown: "review",
} satisfies Record<PortMatchStatus, keyof NetworkAuditCounts>;

const L2_CLASSIFICATION_CATEGORIES = {
  "esxi-cdp": "passed",
  ipam: "passed",
  unknown: "review",
} satisfies Record<L2Classification, keyof NetworkAuditCounts>;

const emptyCounts = (): NetworkAuditCounts => ({ critical: 0, review: 0, passed: 0 });

function countRows<T>(rows: T[], getCategory: (row: T) => keyof NetworkAuditCounts): NetworkAuditCounts {
  return rows.reduce((counts, row) => {
    counts[getCategory(row)] += 1;
    return counts;
  }, emptyCounts());
}

function getPortCategory(row: PortAuditRow): keyof NetworkAuditCounts {
  if (row.labelConflict || row.statusConflict) return "critical";
  const category = PORT_MATCH_CATEGORIES[row.matchStatus];
  if (!category) throw new Error(`Unexpected port match status: ${row.matchStatus}`);
  return category;
}

function getDiscoveryCategory(row: L2DiscoveryRow): keyof NetworkAuditCounts {
  const category = L2_CLASSIFICATION_CATEGORIES[row.classification];
  if (!category) throw new Error(`Unexpected L2 classification: ${row.classification}`);
  return category;
}

function summarizeCheck(
  id: NetworkAuditCheckId,
  sources: NetworkAuditSourceFacts,
  counts: NetworkAuditCounts,
): NetworkAuditCheckSummary {
  const sourceRequirements = CHECK_SOURCES[id];
  const isMissing = (source: NetworkAuditSourceKey) => sources[source].count === 0;
  const missingRequired = sourceRequirements.required.filter(isMissing);
  const missingOptional = sourceRequirements.optional.filter(isMissing);
  const readiness: NetworkAuditReadiness = missingRequired.length > 0
    ? "unavailable"
    : missingOptional.length > 0
      ? "limited"
      : "ready";
  const status: NetworkAuditStatus = readiness === "unavailable"
    ? "unavailable"
    : counts.critical > 0
      ? "critical"
      : counts.review > 0
        ? "review"
        : "passed";

  return { id, readiness, status, counts, missingRequired, missingOptional };
}

function totalCounts(checks: Record<NetworkAuditCheckId, NetworkAuditCheckSummary>): NetworkAuditCounts {
  return CHECK_ORDER.reduce((totals, id) => {
    const check = checks[id];
    if (check.readiness === "unavailable") return totals;
    totals.critical += check.counts.critical;
    totals.review += check.counts.review;
    totals.passed += check.counts.passed;
    return totals;
  }, emptyCounts());
}

export function buildNetworkAuditViewModel(input: BuildNetworkAuditViewModelInput): NetworkAuditViewModel {
  const checks: Record<NetworkAuditCheckId, NetworkAuditCheckSummary> = {
    ports: summarizeCheck("ports", input.sources, countRows(input.portRows, getPortCategory)),
    hosts: summarizeCheck("hosts", input.sources, countRows(
      [...input.hostQuality.rvtoolsRows, ...input.hostQuality.techInfoRows],
      (row) => row.finding !== null ? "review" : "passed",
    )),
    mac: summarizeCheck("mac", input.sources, countRows(input.cdpMacRows, (row) => {
      if (row.topologyMismatch) return "critical";
      return row.inL2 ? "passed" : "review";
    })),
    discovery: summarizeCheck("discovery", input.sources, countRows(input.l2DiscoveryRows, getDiscoveryCategory)),
  };

  const nextCheck = CHECK_ORDER.find((id) => checks[id].status === "critical")
    ?? CHECK_ORDER.find((id) => checks[id].status === "review")
    ?? null;

  return {
    sources: input.sources,
    checks,
    totals: totalCounts(checks),
    nextCheck,
    hasExecutableChecks: CHECK_ORDER.some((id) => checks[id].readiness !== "unavailable"),
  };
}
