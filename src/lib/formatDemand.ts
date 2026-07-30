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
