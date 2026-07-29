export type FillUpDisplayUnit = "vCPU" | "MHz" | "MiB";

const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

export function formatFillUpValue(value: number | null | undefined, unit: FillUpDisplayUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (unit === "MHz") return `${(value / 1_000).toLocaleString("de-DE", TWO_DECIMALS)} GHz`;
  if (unit === "MiB") return `${(value / 1_024).toLocaleString("de-DE", TWO_DECIMALS)} GiB`;
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} vCPU`;
}

export function toFillUpDisplayValue(value: number | null, unit: "MHz" | "MiB"): string {
  if (value === null || !Number.isFinite(value)) return "";
  const divisor = unit === "MHz" ? 1_000 : 1_024;
  return (value / divisor).toFixed(2);
}

const FILL_UP_UNIT_DIVISORS = { MHz: 1_000, MiB: 1_024, vCPU: 1 } as const;

/**
 * Wie `toFillUpDisplayValue`, behält aber bis zu drei Dezimalstellen und schneidet
 * überflüssige Nullen ab. Übernommene Beobachtungswerte wie 380 MHz bleiben so als
 * „0,38“ erhalten, statt auf eine feste Zweistelligkeit gerundet zu werden.
 */
export function toFillUpPreciseDisplayValue(value: number | null | undefined, unit: "MHz" | "MiB" | "vCPU"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const divisor = FILL_UP_UNIT_DIVISORS[unit];
  return String(Math.round(value / divisor * 1_000) / 1_000);
}

/** Wie `toFillUpPreciseDisplayValue`, aber mit Komma als Dezimaltrennzeichen für Text-Inputs im deutschen Format. */
export function toFillUpPreciseDisplayValueDe(value: number | null | undefined, unit: "MHz" | "MiB" | "vCPU"): string {
  return toFillUpPreciseDisplayValue(value, unit).replace(".", ",");
}

export function fromFillUpDisplayValue(value: string, unit: "MHz" | "MiB" | "vCPU"): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return parsed * FILL_UP_UNIT_DIVISORS[unit];
}

const WEEKDAY_LABELS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"] as const;

export function formatWorstHour(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const date = new Date(value);
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${weekday}, ${time}`;
}
