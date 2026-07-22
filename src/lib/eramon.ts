/** Formatiert eine Bandbreite in bps human-readable (z. B. 100000000000 → "100 Gbit/s"). */
function formatBwNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatBandwidth(bps: number | null): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return "—";
  if (bps >= 1_000_000_000) return `${formatBwNumber(bps / 1_000_000_000)} Gbit/s`;
  if (bps >= 1_000_000) return `${formatBwNumber(bps / 1_000_000)} Mbit/s`;
  if (bps >= 1_000) return `${formatBwNumber(bps / 1_000)} kbit/s`;
  return `${bps} bit/s`;
}
