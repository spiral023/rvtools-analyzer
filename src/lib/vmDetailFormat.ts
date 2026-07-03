import type { SheetRow } from "@/domain/models/types";

export function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function boolLabel(value: unknown): string {
  const raw = str(value).toLowerCase();
  if (!raw) return "—";
  if (raw === "true" || raw === "1" || raw === "yes") return "Ja";
  if (raw === "false" || raw === "0" || raw === "no") return "Nein";
  return str(value);
}

export function compactValue(value: string | null | undefined): string {
  const v = (value || "").trim();
  return v || "—";
}

export function statusTextClass(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, "").toLowerCase();
  if (normalized === "poweredon" || normalized === "connected" || normalized === "green") return "text-success";
  if (normalized === "poweredoff") return "text-muted-foreground";
  if (normalized === "yellow" || normalized === "warning") return "text-warning";
  if (normalized === "red") return "text-destructive";
  return "text-muted-foreground";
}

export function sheetRowKey(row: SheetRow, fallback: string): string {
  return `${row.snapshotId}:${row.sheetName}:${row.rowIndex}:${fallback}`;
}
