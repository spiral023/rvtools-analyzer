/**
 * CPU Demand der Durchschnitts-VM, durchgängig in GHz. Die Rohreihe liefert MHz;
 * eine mitwachsende Einheit hätte innerhalb derselben Ansicht mal „630 MHz“ und
 * mal „2,23 GHz“ nebeneinander gestellt und damit den direkten Größenvergleich
 * zwischen Kennzahl, Achse und Tooltip zerstört. Zwei Dezimalstellen halten auch
 * kleine VMs unter 1 GHz lesbar.
 */
export function formatDemandGHz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value / 1_000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`;
}

/** Kurzform für Achsenbeschriftungen: „0,32“ bzw. „2,23“ – die Einheit steht im Achsentitel. */
export function formatDemandAxisTick(value: number): string {
  return (value / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 2 });
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
