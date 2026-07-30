import type { VmRightsizingCandidate, VmWorkloadProfile } from "@/domain/models/types";
import { normalizeVmName } from "@/lib/globalFilter";

export interface TechInfoOrgOptionalMetrics {
  cpuDemandAverageMHz: number | null;
  configuredCpuCapacityMHz: number | null;
  reclaimableVcpu: number | null;
}

function finiteOrNull(value: number | null | undefined, minimum = 0): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;
}

/**
 * Verknüpft den jüngsten vROps-Zeitreihenimport eindeutig über den VM-Namen.
 * Mehrdeutige Namen werden bewusst ausgelassen, damit Werte verschiedener vCenter
 * nicht versehentlich einer falschen Tech-Info-VM zugeschlagen werden.
 */
export function buildTechInfoOrgMetricsByVmName(
  profiles: readonly VmWorkloadProfile[],
  candidates: readonly VmRightsizingCandidate[],
): ReadonlyMap<string, TechInfoOrgOptionalMetrics> {
  const candidateByObjectKey = new Map(candidates.map((candidate) => [candidate.objectKey, candidate]));
  const metrics = new Map<string, TechInfoOrgOptionalMetrics>();
  const ambiguousNames = new Set<string>();

  for (const profile of profiles) {
    const vmName = normalizeVmName(profile.vmName);
    if (!vmName || ambiguousNames.has(vmName)) continue;
    if (metrics.has(vmName)) {
      metrics.delete(vmName);
      ambiguousNames.add(vmName);
      continue;
    }

    const candidate = candidateByObjectKey.get(profile.objectKey);
    metrics.set(vmName, {
      cpuDemandAverageMHz: finiteOrNull(profile.demand.average),
      configuredCpuCapacityMHz: finiteOrNull(profile.configuredCpuCapacityMHz, Number.EPSILON),
      reclaimableVcpu: finiteOrNull(candidate?.reclaimableVcpu),
    });
  }

  return metrics;
}
