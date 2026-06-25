import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import { excelSerialToIso } from "@/lib/xlsx/parseHelpers";

export interface VmStorageSummary {
  diskCount: number;
  totalCapacityMiB: number;
}

export interface VmSnapshotSummary {
  snapshotCount: number;
  totalSizeMiB: number;
}

export function normalizeVmName(name: unknown): string {
  if (name == null) return "";
  return String(name).trim().toLowerCase();
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function matchRowsForVm(rows: SheetRow[], vm: NormalizedVm | null): SheetRow[] {
  if (!vm) return [];
  const vmName = normalizeVmName(vm.vmName);
  return rows.filter((row) => {
    if (row.snapshotId !== vm.snapshotId) return false;
    return normalizeVmName(row.data["VM"]) === vmName;
  });
}

export function resolveVmDetailTarget(row: unknown, vms: NormalizedVm[]): NormalizedVm | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Partial<NormalizedVm> & { vm?: unknown };
  if (typeof candidate.vmName === "string" && typeof candidate.vmKey === "string") return candidate as NormalizedVm;

  const vmName = normalizeVmName(candidate.vmName ?? candidate.vm);
  if (!vmName) return null;

  const snapshotId = typeof candidate.snapshotId === "string" ? candidate.snapshotId : null;
  return vms.find((vm) => normalizeVmName(vm.vmName) === vmName && (!snapshotId || vm.snapshotId === snapshotId)) ?? null;
}

export function formatRvtoolsDate(value: unknown): string {
  if (value == null || value === "") return "—";

  if (typeof value === "number") {
    const iso = excelSerialToIso(value);
    if (!iso) return "—";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("de-DE");
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "—";
    return value.toLocaleString("de-DE");
  }

  const raw = String(value).trim();
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("de-DE");
}

export function summarizeStorage(rows: SheetRow[]): VmStorageSummary {
  const totalCapacityMiB = rows.reduce((sum, row) => {
    const capacity = toNumberOrNull(row.data["Capacity MiB"]);
    return sum + (capacity ?? 0);
  }, 0);

  return {
    diskCount: rows.length,
    totalCapacityMiB,
  };
}

export function summarizeSnapshots(rows: SheetRow[]): VmSnapshotSummary {
  const totalSizeMiB = rows.reduce((sum, row) => {
    const size = toNumberOrNull(row.data["Size MiB (total)"]);
    return sum + (size ?? 0);
  }, 0);

  return {
    snapshotCount: rows.length,
    totalSizeMiB,
  };
}
