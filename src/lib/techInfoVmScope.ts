import type { NormalizedVm, TechInfoClientLatest, TechInfoLatest } from "@/domain/models/types";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";

export interface ActiveVmTechInfoPartition {
  serverVms: NormalizedVm[];
  clientRows: TechInfoClientLatest[];
  vmsWithoutTechInfo: NormalizedVm[];
}

export function partitionTechInfoByActiveVms(
  vms: NormalizedVm[],
  serverRows: TechInfoLatest[],
  clientRows: TechInfoClientLatest[],
): ActiveVmTechInfoPartition {
  const activeVmNames = new Set(vms.map((vm) => normalizeVmNameForMatch(vm.vmName)));
  const serverNames = new Set(serverRows.map((row) => normalizeVmNameForMatch(row.vmName)));
  const clientNames = new Set(clientRows.map((row) => normalizeVmNameForMatch(row.clientName)));

  return {
    serverVms: vms.filter((vm) => serverNames.has(normalizeVmNameForMatch(vm.vmName))),
    clientRows: clientRows.filter((row) => activeVmNames.has(normalizeVmNameForMatch(row.clientName))),
    vmsWithoutTechInfo: vms.filter((vm) => {
      const name = normalizeVmNameForMatch(vm.vmName);
      return !serverNames.has(name) && !clientNames.has(name);
    }),
  };
}
