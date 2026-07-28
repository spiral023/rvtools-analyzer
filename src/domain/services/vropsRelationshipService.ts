import type {
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  SnapshotMeta,
  VropsRelationshipIssue,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesObjectType,
  VropsTimeSeriesSiteRule,
} from "@/domain/models/types";
import { classifyVmFailoverGroup } from "@/domain/services/clusterCapacityEngine";

/** Defaultregeln aus der Fachspezifikation; Aufrufer können sie vollständig ersetzen. */
export const DEFAULT_VROPS_TIME_SERIES_SITE_RULES: readonly VropsTimeSeriesSiteRule[] = [
  { id: "site-1", siteId: "site-1", hostNamePattern: "^esxsrv1" },
  { id: "site-2", siteId: "site-2", hostNamePattern: "^esxsrv2" },
];

export interface VropsRelationshipInventory {
  vms: readonly NormalizedVm[];
  hosts: readonly NormalizedHost[];
  clusters: readonly NormalizedCluster[];
  snapshots: readonly SnapshotMeta[];
}

export interface BuildVropsTimeSeriesRelationshipsInput {
  importId: string;
  objectNames: ReadonlyMap<VropsTimeSeriesObjectType, readonly string[]>;
  inventory: VropsRelationshipInventory;
  siteRules?: readonly VropsTimeSeriesSiteRule[];
}

export interface VropsTimeSeriesRelationshipResult {
  objects: VropsTimeSeriesImportedObject[];
  issues: VropsRelationshipIssue[];
}

export function createVropsTimeSeriesObjectKey(type: VropsTimeSeriesObjectType, name: string): string {
  return `${type}:${normalizeName(name)}`;
}

/**
 * Ordnet CSV-Namen ausschließlich innerhalb des ausgewählten RVTools-Scopes zu.
 * Mehrdeutige Namen werden bewusst nicht aufgelöst, damit spätere Berechnungen
 * auf einem unveränderlichen, nachvollziehbaren Beziehungsstand beruhen.
 */
export function buildVropsTimeSeriesRelationships(
  input: BuildVropsTimeSeriesRelationshipsInput,
): VropsTimeSeriesRelationshipResult {
  const issues: VropsRelationshipIssue[] = [];
  const snapshotsById = new Map(input.inventory.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
  const compiledSiteRules = compileSiteRules(input.siteRules ?? DEFAULT_VROPS_TIME_SERIES_SITE_RULES, issues);
  const vmsByName = indexByName(input.inventory.vms, (vm) => vm.vmName);
  const hostsByName = indexByName(input.inventory.hosts, (host) => host.host);
  const clustersByName = indexByName(input.inventory.clusters, (cluster) => cluster.name);
  const hostsBySnapshotAndName = new Map(input.inventory.hosts.map((host) => [snapshotAndName(host.snapshotId, host.host), host]));
  const clustersBySnapshotAndName = new Map(input.inventory.clusters.map((cluster) => [snapshotAndName(cluster.snapshotId, cluster.name), cluster]));
  const objects: VropsTimeSeriesImportedObject[] = [];

  for (const type of ["vm", "cluster", "host"] as const) {
    for (const name of input.objectNames.get(type) ?? []) {
      const objectKey = createVropsTimeSeriesObjectKey(type, name);
      const common = { importId: input.importId, objectKey, objectType: type, vropsName: name } as const;
      if (type === "vm") {
        const match = resolveCandidate(common, vmsByName.get(normalizeName(name)) ?? [], snapshotsById, issues);
        if (!match) {
          objects.push(unmatchedObject(common, vmsByName.get(normalizeName(name))?.length ? "ambiguous" : "unmatched"));
          continue;
        }
        const cluster = match.cluster ? clustersBySnapshotAndName.get(snapshotAndName(match.snapshotId, match.cluster)) : undefined;
        const host = match.host ? hostsBySnapshotAndName.get(snapshotAndName(match.snapshotId, match.host)) : undefined;
        objects.push({
          ...common,
          vcenterId: snapshotsById.get(match.snapshotId)?.vcenterId ?? null,
          rvtoolsSnapshotId: match.snapshotId,
          rvtoolsObjectKey: match.vmKey,
          clusterKey: cluster?.clusterKey ?? null,
          hostKey: host?.hostKey ?? null,
          workloadClass: classifyVmFailoverGroup(match.resourcePool),
          powerState: match.powerState,
          siteId: null,
          matchStatus: "matched",
          matchMethod: "name",
        });
        continue;
      }
      if (type === "host") {
        const match = resolveCandidate(common, hostsByName.get(normalizeName(name)) ?? [], snapshotsById, issues);
        if (!match) {
          objects.push(unmatchedObject(common, hostsByName.get(normalizeName(name))?.length ? "ambiguous" : "unmatched"));
          continue;
        }
        const cluster = match.cluster ? clustersBySnapshotAndName.get(snapshotAndName(match.snapshotId, match.cluster)) : undefined;
        const siteId = resolveHostSite(match.host, compiledSiteRules);
        if (!siteId) {
          issues.push({
            code: "unknown-site",
            objectKey,
            objectType: type,
            severity: "blocking",
            message: `Für Host „${name}“ konnte keine Site bestimmt werden.`,
          });
        }
        objects.push({
          ...common,
          vcenterId: snapshotsById.get(match.snapshotId)?.vcenterId ?? null,
          rvtoolsSnapshotId: match.snapshotId,
          rvtoolsObjectKey: match.hostKey,
          clusterKey: cluster?.clusterKey ?? null,
          hostKey: match.hostKey,
          workloadClass: null,
          powerState: null,
          siteId,
          matchStatus: "matched",
          matchMethod: "name",
        });
        continue;
      }
      const match = resolveCandidate(common, clustersByName.get(normalizeName(name)) ?? [], snapshotsById, issues);
      if (!match) {
        objects.push(unmatchedObject(common, clustersByName.get(normalizeName(name))?.length ? "ambiguous" : "unmatched"));
        continue;
      }
      objects.push({
        ...common,
        vcenterId: snapshotsById.get(match.snapshotId)?.vcenterId ?? null,
        rvtoolsSnapshotId: match.snapshotId,
        rvtoolsObjectKey: match.clusterKey,
        clusterKey: match.clusterKey,
        hostKey: null,
        workloadClass: null,
        powerState: null,
        siteId: null,
        matchStatus: "matched",
        matchMethod: "name",
      });
    }
  }
  return { objects, issues };
}

function unmatchedObject(
  common: Pick<VropsTimeSeriesImportedObject, "importId" | "objectKey" | "objectType" | "vropsName">,
  matchStatus: "unmatched" | "ambiguous",
): VropsTimeSeriesImportedObject {
  return {
    ...common,
    vcenterId: null,
    rvtoolsSnapshotId: null,
    rvtoolsObjectKey: null,
    clusterKey: null,
    hostKey: null,
    workloadClass: null,
    powerState: null,
    siteId: null,
    matchStatus,
    matchMethod: "none",
  };
}

function resolveCandidate<T extends { snapshotId: string }>(
  object: Pick<VropsTimeSeriesImportedObject, "objectKey" | "objectType" | "vropsName">,
  candidates: readonly T[],
  snapshotsById: ReadonlyMap<string, SnapshotMeta>,
  issues: VropsRelationshipIssue[],
): T | null {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    issues.push({
      code: "unmatched-object",
      objectKey: object.objectKey,
      objectType: object.objectType,
      severity: "blocking",
      message: `„${object.vropsName}“ konnte im gewählten RVTools-Scope nicht zugeordnet werden.`,
    });
    return null;
  }
  const vcenterIds = new Set(candidates.map((candidate) => snapshotsById.get(candidate.snapshotId)?.vcenterId).filter(Boolean));
  const code = vcenterIds.size > 1 ? "name-collision-across-vcenters" : "name-collision-within-vcenter";
  issues.push({
    code,
    objectKey: object.objectKey,
    objectType: object.objectType,
    severity: "blocking",
    message: `„${object.vropsName}“ ist im gewählten RVTools-Scope nicht eindeutig (${candidates.length} Treffer).`,
    details: { candidateCount: candidates.length, vcenterCount: vcenterIds.size },
  });
  return null;
}

function compileSiteRules(
  rules: readonly VropsTimeSeriesSiteRule[],
  issues: VropsRelationshipIssue[],
): Array<{ rule: VropsTimeSeriesSiteRule; expression: RegExp }> {
  const compiled: Array<{ rule: VropsTimeSeriesSiteRule; expression: RegExp }> = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, expression: new RegExp(rule.hostNamePattern, "i") });
    } catch {
      issues.push({
        code: "invalid-site-rule",
        severity: "warning",
        message: `Die Site-Regel „${rule.id}“ enthält keinen gültigen regulären Ausdruck.`,
        details: { siteId: rule.siteId, pattern: rule.hostNamePattern },
      });
    }
  }
  return compiled;
}

function resolveHostSite(hostName: string, rules: readonly { rule: VropsTimeSeriesSiteRule; expression: RegExp }[]): string | null {
  return rules.find(({ expression }) => expression.test(hostName))?.rule.siteId ?? null;
}

function indexByName<T>(values: readonly T[], getName: (value: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const value of values) {
    const key = normalizeName(getName(value));
    index.set(key, [...(index.get(key) ?? []), value]);
  }
  return index;
}

function snapshotAndName(snapshotId: string, name: string): string {
  return `${snapshotId}\u0000${normalizeName(name)}`;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}
