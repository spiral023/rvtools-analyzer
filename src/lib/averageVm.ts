import type { SheetRow } from "@/domain/models/types";
import { toNumber } from "@/lib/xlsx/parseHelpers";

/** Minimale VM-Sicht für die Durchschnittsberechnung (aus NormalizedVm ableitbar). */
export interface AverageVmSource {
  cpuCount: number | null;
  memoryMiB: number | null;
}

export interface AverageVmInput {
  /** Bereits gescopte VMs (vCenter-Auswahl, Suche, Cluster/Host-Filter, globaler Filter). */
  vms: AverageVmSource[];
  /** Roh-Sheets, identisch zur VM-Auswahl gescopt. */
  memoryRows: SheetRow[];
  diskRows: SheetRow[];
  partitionRows: SheetRow[];
  networkRows: SheetRow[];
}

/**
 * Kennzahlen einer synthetischen „Durchschnitts-VM". Alle Größen sind Mittelwerte je VM;
 * Kapazitäten in MiB, damit sie mit {@link formatBytes} formatiert werden können.
 */
export interface AverageVm {
  vmCount: number;
  cpuCores: number;
  memorySizeMiB: number;
  memoryActiveMiB: number;
  memoryConsumedMiB: number;
  disksPerVm: number;
  diskProvisionedMiB: number;
  partitionsPerVm: number;
  partitionCapacityMiB: number;
  partitionConsumedMiB: number;
  partitionFreeMiB: number;
  /** Freier Partitionsanteil, aggregiert (Summe frei / Summe Kapazität); null ohne Kapazität. */
  partitionFreePct: number | null;
  nicsPerVm: number;
}

function sumColumn(rows: SheetRow[], column: string): number {
  let total = 0;
  for (const row of rows) {
    total += toNumber(row.data[column]) ?? 0;
  }
  return total;
}

/**
 * Verdichtet die gescopten VMs und Roh-Sheets zu einer Durchschnitts-VM.
 * Gibt `null` zurück, wenn keine VM im Scope liegt (kein sinnvoller Mittelwert).
 */
export function buildAverageVm({
  vms,
  memoryRows,
  diskRows,
  partitionRows,
  networkRows,
}: AverageVmInput): AverageVm | null {
  const vmCount = vms.length;
  if (vmCount === 0) return null;

  const cpuTotal = vms.reduce((sum, vm) => sum + (vm.cpuCount ?? 0), 0);
  const memorySizeTotal = vms.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0);

  const partitionCapacityTotal = sumColumn(partitionRows, "Capacity MiB");
  const partitionFreeTotal = sumColumn(partitionRows, "Free MiB");

  return {
    vmCount,
    cpuCores: cpuTotal / vmCount,
    memorySizeMiB: memorySizeTotal / vmCount,
    memoryActiveMiB: sumColumn(memoryRows, "Active") / vmCount,
    memoryConsumedMiB: sumColumn(memoryRows, "Consumed") / vmCount,
    disksPerVm: diskRows.length / vmCount,
    diskProvisionedMiB: sumColumn(diskRows, "Capacity MiB") / vmCount,
    partitionsPerVm: partitionRows.length / vmCount,
    partitionCapacityMiB: partitionCapacityTotal / vmCount,
    partitionConsumedMiB: sumColumn(partitionRows, "Consumed MiB") / vmCount,
    partitionFreeMiB: partitionFreeTotal / vmCount,
    partitionFreePct: partitionCapacityTotal > 0 ? (partitionFreeTotal / partitionCapacityTotal) * 100 : null,
    nicsPerVm: networkRows.length / vmCount,
  };
}
