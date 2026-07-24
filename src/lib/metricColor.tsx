/** Ampel-Farbe ab den übergebenen Schwellwerten (inklusive, "ab X"). */
export function thresholdClass(value: number, warn: number, danger: number): string {
  if (value >= danger) return "text-destructive font-semibold";
  if (value >= warn) return "text-warning font-semibold";
  return "";
}

export function coloredPct(value: number | null, warn: number, danger: number, decimals = 1): string | JSX.Element {
  if (value === null) return "—";
  return <span className={thresholdClass(value, warn, danger)}>{value.toFixed(decimals)}%</span>;
}

export function coloredNum(value: number | null, warn: number, danger: number, decimals = 2): string | JSX.Element {
  if (value === null) return "—";
  return <span className={thresholdClass(value, warn, danger)}>{value.toFixed(decimals)}</span>;
}

export function coloredRatio(value: number | null, warn: number, danger: number, decimals = 2): string | JSX.Element {
  if (value === null) return "—";
  return <span className={thresholdClass(value, warn, danger)}>{`${value.toFixed(decimals)}:1`}</span>;
}

export function boolCell(value: boolean | null): string | JSX.Element {
  if (value === null) return "—";
  if (!value) return <span className="text-destructive font-semibold">Aus</span>;
  return "An";
}

export type Severity = "ok" | "warn" | "crit";

export function severityClass(severity: Severity): string {
  if (severity === "crit") return "text-destructive font-semibold";
  if (severity === "warn") return "text-warning font-semibold";
  return "text-success";
}

/** Rendert eine Ampel-Badge mit Label, z.B. für Site-Failover-Risiko oder Cluster-Risiko. */
export function severityBadge(label: string, severity: Severity): JSX.Element {
  return <span className={severityClass(severity)}>{label}</span>;
}

export function siteFailoverLabel(severity: Severity | null): string {
  if (severity === null) return "—";
  if (severity === "crit") return "kritisch";
  if (severity === "warn") return "knapp";
  return "ok";
}

export function siteFailoverBadge(severity: Severity | null): string | JSX.Element {
  if (severity === null) return "—";
  return severityBadge(siteFailoverLabel(severity), severity);
}
