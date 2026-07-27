import type { NormalizedDatastore, NormalizedVm } from "@/domain/models/types";

export function calculateDatastoreCapacityStats(datastores: NormalizedDatastore[], vms: NormalizedVm[]) {
  let sum = 0;
  let withPctCount = 0;
  let critical = 0;
  let warning = 0;
  for (const datastore of datastores) {
    if (datastore.freePct === null) continue;
    sum += datastore.freePct;
    withPctCount += 1;
    if (datastore.freePct < 10) critical += 1;
    else if (datastore.freePct < 20) warning += 1;
  }
  const provisionedMiB = vms.reduce((total, vm) => total + (vm.provisionedMiB || 0), 0);
  const inUseMiB = vms.reduce((total, vm) => total + (vm.inUseMiB || 0), 0);
  return {
    avgFreePct: withPctCount ? sum / withPctCount : null,
    critical,
    warning,
    storageEfficiency: { provisionedGiB: provisionedMiB / 1024, inUseGiB: inUseMiB / 1024, ratio: provisionedMiB > 0 ? Math.round((inUseMiB / provisionedMiB) * 1000) / 10 : 0 },
  };
}
