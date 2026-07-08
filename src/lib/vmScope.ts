import type { FilterState, NormalizedVm, SheetRow } from "@/domain/models/types";
import { buildVmJoinKey } from "@/lib/globalFilter";

export function isPoweredOnVm(vm: NormalizedVm): boolean {
  const normalized = (vm.powerState || "").replace(/\s+/g, "").toLowerCase();
  return normalized === "poweredon" || normalized === "on";
}

export function isVclsVm(vm: NormalizedVm): boolean {
  const vmName = vm.vmName.trim().toLowerCase();
  const folder = (vm.folder || "").trim().toLowerCase();
  const resourcePool = (vm.resourcePool || "").trim().toLowerCase();

  return (
    /^vcls(?:[-_].*)?$/.test(vmName) ||
    /(^|[/\\])vcls($|[/\\])/.test(folder) ||
    /(^|[/\\])vcls($|[/\\])/.test(resourcePool) ||
    folder === "vcls" ||
    resourcePool === "vcls"
  );
}

export function hasVmScopeFilter(filters: Pick<FilterState, "vmPowerScope" | "excludeVclsVms">): boolean {
  return filters.vmPowerScope === "poweredOn" || filters.excludeVclsVms;
}

export function applyVmScopeToVms(
  vms: NormalizedVm[],
  filters: Pick<FilterState, "vmPowerScope" | "excludeVclsVms">,
): NormalizedVm[] {
  if (!hasVmScopeFilter(filters)) return vms;

  return vms.filter((vm) => {
    if (filters.vmPowerScope === "poweredOn" && !isPoweredOnVm(vm)) return false;
    if (filters.excludeVclsVms && isVclsVm(vm)) return false;
    return true;
  });
}

export function buildVmScopeJoinKeys(
  vms: NormalizedVm[],
  filters: Pick<FilterState, "vmPowerScope" | "excludeVclsVms">,
): Set<string> | null {
  if (!hasVmScopeFilter(filters)) return null;
  return new Set(applyVmScopeToVms(vms, filters).map((vm) => buildVmJoinKey(vm.snapshotId, vm.vmName)));
}

export function applyVmScopeToRows(
  rows: SheetRow[],
  vms: NormalizedVm[],
  filters: Pick<FilterState, "vmPowerScope" | "excludeVclsVms">,
): SheetRow[] {
  const matchingJoinKeys = buildVmScopeJoinKeys(vms, filters);
  if (!matchingJoinKeys) return rows;
  return rows.filter((row) => matchingJoinKeys.has(buildVmJoinKey(row.snapshotId, String(row.data["VM"] ?? ""))));
}
