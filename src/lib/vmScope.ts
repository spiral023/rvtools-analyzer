import type { FilterState, NormalizedHealth, NormalizedVm, SheetRow } from "@/domain/models/types";
import { buildVmJoinKey, normalizeVmName } from "@/lib/globalFilter";

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

export function isDummyVm(vm: NormalizedVm): boolean {
  return /^dummy-vm/.test(vm.vmName.trim().toLowerCase());
}

export function parseVmNameScopeList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const rawName of (value ?? "").split(/[\s,;]+/)) {
    const name = rawName.trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

type VmScopeFilters = Pick<FilterState, "vmNameList" | "vmPowerScope" | "excludeVclsVms" | "excludeDummyVms">;

export function hasVmScopeFilter(filters: VmScopeFilters): boolean {
  return filters.vmPowerScope === "poweredOn"
    || filters.excludeVclsVms
    || filters.excludeDummyVms
    || parseVmNameScopeList(filters.vmNameList).length > 0;
}

export function applyVmScopeToVms(
  vms: NormalizedVm[],
  filters: VmScopeFilters,
): NormalizedVm[] {
  if (!hasVmScopeFilter(filters)) return vms;
  const vmNameSet = new Set(parseVmNameScopeList(filters.vmNameList));

  return vms.filter((vm) => {
    if (vmNameSet.size > 0 && !vmNameSet.has(vm.vmName.trim().toLowerCase())) return false;
    if (filters.vmPowerScope === "poweredOn" && !isPoweredOnVm(vm)) return false;
    if (filters.excludeVclsVms && isVclsVm(vm)) return false;
    if (filters.excludeDummyVms && isDummyVm(vm)) return false;
    return true;
  });
}

export function buildVmScopeJoinKeys(
  vms: NormalizedVm[],
  filters: VmScopeFilters,
): Set<string> | null {
  if (!hasVmScopeFilter(filters)) return null;
  return new Set(applyVmScopeToVms(vms, filters).map((vm) => buildVmJoinKey(vm.snapshotId, vm.vmName)));
}

export function applyVmScopeToRows(
  rows: SheetRow[],
  vms: NormalizedVm[],
  filters: VmScopeFilters,
): SheetRow[] {
  const matchingJoinKeys = buildVmScopeJoinKeys(vms, filters);
  if (!matchingJoinKeys) return rows;
  return rows.filter((row) => matchingJoinKeys.has(buildVmJoinKey(row.snapshotId, String(row.data["VM"] ?? ""))));
}

/**
 * Überträgt den bereits angewandten VM-Scope auf Analysen, die auf vROps-Objekten statt auf dem
 * RVTools-Inventar aufsetzen (Auslastungsprofile, Rightsizing-Kandidaten). Erwartet die schon
 * gefilterte VM-Liste aus `useVms()`, damit Power-Zustand, vCLS-/Dummy-Ausschluss und VM-Namensliste
 * nur an einer Stelle ausgewertet werden. Der Join nutzt bevorzugt den eindeutigen
 * RVTools-Schlüssel und fällt nur bei alten oder unvollständig verknüpften Daten auf den
 * normalisierten VM-Namen zurück.
 */
export function filterByVmScope<T extends { rvtoolsObjectKey: string | null; vmName: string }>(
  items: readonly T[],
  scopedVms: readonly Pick<NormalizedVm, "vmKey" | "vmName">[],
): T[] {
  const scopedVmKeys = new Set(scopedVms.map((vm) => vm.vmKey));
  const scopedVmNames = new Set(scopedVms.map((vm) => normalizeVmName(vm.vmName)));

  return items.filter((item) => item.rvtoolsObjectKey !== null
    ? scopedVmKeys.has(item.rvtoolsObjectKey)
    : scopedVmNames.has(normalizeVmName(item.vmName)));
}

export function applyVmScopeToHealthEvents(
  events: NormalizedHealth[],
  vms: NormalizedVm[],
  filters: VmScopeFilters,
): NormalizedHealth[] {
  const matchingJoinKeys = buildVmScopeJoinKeys(vms, filters);
  if (!matchingJoinKeys) return events;
  return events.filter((event) =>
    matchingJoinKeys.has(buildVmJoinKey(event.snapshotId, String(event.entity ?? ""))),
  );
}
