/**
 * CPU-Demand-Werte einer einzelnen VM liegen meist deutlich unter 1 GHz. Die
 * Fill-Up-Ansicht rechnet Cluster-Summen und zeigt darum immer GHz; hier würde
 * das „0,32 GHz" statt „318 MHz" ergeben. Deshalb eine eigene, mitwachsende
 * Einheit: MHz bis 1 GHz, darüber GHz mit zwei Dezimalstellen.
 */
export function formatDemandMHz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1_000) return `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} MHz`;
  return `${(value / 1_000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`;
}

/** Kurzform für Achsenbeschriftungen: „318" bzw. „1,2k" – die Einheit steht im Achsentitel. */
export function formatDemandAxisTick(value: number): string {
  if (Math.abs(value) < 1_000) return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return `${(value / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k`;
}

/**
 * Demand als Anteil der konfigurierten CPU-Kapazität. Alle Prozentangaben der
 * Durchschnitts-VM nutzen dieselbe Bezugsgröße (`configuredCpuCapacityMHz`), damit
 * MHz-Wert und Prozentwert nebeneinander widerspruchsfrei bleiben.
 */
export function toCapacityPct(valueMHz: number | null | undefined, capacityMHz: number | null | undefined): number | null {
  if (valueMHz === null || valueMHz === undefined || !Number.isFinite(valueMHz)) return null;
  if (capacityMHz === null || capacityMHz === undefined || !Number.isFinite(capacityMHz) || capacityMHz <= 0) return null;
  return (valueMHz / capacityMHz) * 100;
}

export function formatDemandPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** Achsenbeschriftung im Prozentmodus – ohne Dezimalstellen, damit die Achse ruhig bleibt. */
export function formatDemandPctAxisTick(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
}
