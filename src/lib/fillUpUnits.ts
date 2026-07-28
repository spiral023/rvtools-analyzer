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

export function fromFillUpDisplayValue(value: string, unit: "MHz" | "MiB"): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return parsed * (unit === "MHz" ? 1_000 : 1_024);
}
