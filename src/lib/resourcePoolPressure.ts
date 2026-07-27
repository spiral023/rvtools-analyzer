import type { SheetRow } from "@/domain/models/types";

export interface ResourcePoolPressureRow {
  name: string;
  path: string;
  status: string;
  vms: number;
  cpuLimit: string;
  cpuReservation: number;
  cpuExpandable: boolean;
  memLimit: string;
  memReservation: number;
  memExpandable: boolean;
  risk: string;
}

export function buildResourcePoolPressureRows(rawResourcePools: SheetRow[]): ResourcePoolPressureRow[] {
  return rawResourcePools.map((row) => {
    const data = row.data;
    const cpuLimit = Number(data["CPU limit"] ?? -1);
    const memLimit = Number(data["Mem limit"] ?? -1);
    const cpuExpandable = String(data["CPU expandableReservation"] || "").toLowerCase() === "true";
    const memExpandable = String(data["Mem expandableReservation"] || "").toLowerCase() === "true";
    const cpuReservation = Number(data["CPU reservation"] || 0);
    const memReservation = Number(data["Mem reservation"] || 0);
    let risk = "niedrig";
    if ((cpuLimit > 0 && cpuLimit !== -1) || (memLimit > 0 && memLimit !== -1) || !cpuExpandable || !memExpandable) risk = "mittel";
    if ((cpuLimit > 0 && cpuLimit !== -1 && !cpuExpandable) || (memLimit > 0 && memLimit !== -1 && !memExpandable)) risk = "hoch";
    return {
      name: String(data["Resource Pool name"] || ""), path: String(data["Resource Pool path"] || ""), status: String(data.Status || ""), vms: Number(data["# VMs"] || 0),
      cpuLimit: cpuLimit === -1 ? "Unlimited" : String(cpuLimit), cpuReservation, cpuExpandable,
      memLimit: memLimit === -1 ? "Unlimited" : String(memLimit), memReservation, memExpandable, risk,
    };
  }).sort((left, right) => (left.risk === "hoch" ? 0 : left.risk === "mittel" ? 1 : 2) - (right.risk === "hoch" ? 0 : right.risk === "mittel" ? 1 : 2));
}
