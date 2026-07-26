import { formatRvtoolsDate } from "@/lib/vmDetail";
import type { SheetRow } from "@/domain/models/types";

export interface LicenseRow {
  name: string;
  key: string;
  costUnit: string;
  total: number;
  used: number;
  usedPct: number;
  expiration: string;
  features: string;
}

export function getLicenseRows(rawLicense: SheetRow[]): LicenseRow[] {
  return rawLicense.map((row) => {
    const total = Number(row.data["Total"] || 0);
    const used = Number(row.data["Used"] || 0);
    return {
      name: String(row.data["Name"] || ""),
      key: String(row.data["Key"] || ""),
      costUnit: String(row.data["Cost Unit"] || ""),
      total,
      used,
      usedPct: total > 0 ? (used / total) * 100 : 0,
      expiration: formatRvtoolsDate(row.data["Expiration Date"]),
      features: String(row.data["Features"] || ""),
    };
  });
}
