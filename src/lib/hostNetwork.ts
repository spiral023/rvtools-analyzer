import type { SheetRow } from "@/domain/models/types";
import { toNumber } from "@/lib/xlsx/parseHelpers";

export interface DvsRow {
  name: string;
  version: string;
  maxMtu: number;
  ports: number;
  members: number;
  uplinksPerHost: string;
  consistent: boolean;
}

function textCell(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** Baut die vDS-Zeilen und verhindert NaN aus unvollständigen RVTools-Zahlenfeldern. */
export function buildDvsRows(
  rawDvSwitch: readonly SheetRow[],
  rawNIC: readonly SheetRow[],
): DvsRow[] {
  return rawDvSwitch.map((row) => {
    const name = textCell(row.data["Switch"]);
    const perHost = new Map<string, number>();
    for (const nic of rawNIC) {
      if (textCell(nic.data["Switch"]) !== name || !name) continue;
      const host = textCell(nic.data["Host"]);
      if (!host) continue;
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
    }

    const counts = [...perHost.values()];
    const consistent = counts.length > 0 && counts.every((count) => count === counts[0]);
    const uplinksPerHost = counts.length === 0
      ? "—"
      : consistent
        ? String(counts[0])
        : `${Math.min(...counts)}–${Math.max(...counts)}`;
    const rawMembers = toNumber(row.data["Host members"]);

    return {
      name,
      version: textCell(row.data["Version"]),
      maxMtu: toNumber(row.data["Max MTU"]) ?? 0,
      ports: toNumber(row.data["# Ports"]) ?? 0,
      // RVTools kann hier bei älteren/unvollständigen Exporten einen Text liefern.
      // Die vNIC-Zuordnung ist dann die verlässlichere Quelle für die Hostanzahl.
      members: rawMembers ?? perHost.size,
      uplinksPerHost,
      consistent,
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "de-DE"));
}
