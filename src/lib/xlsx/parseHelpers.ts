/**
 * Convert Excel serial date number to ISO string.
 * Excel serial dates: days since 1899-12-30 (with the Lotus 123 bug).
 */
export function excelSerialToIso(serial: number): string {
  if (serial <= 0) return "";
  // Excel epoch is 1899-12-30, but serial 1 = 1900-01-01
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = epoch.getTime() + serial * 86400000;
  return new Date(ms).toISOString();
}

export interface ParsedRvtoolsFileName {
  vcenterName: string;
  exportTs: string;
}

export type ParsedFileKind = "rvtools" | "tech-info";

const RVTOOLS_CANONICAL_SHEETS = new Set([
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork",
  "vCD", "vUSB", "vSnapshot", "vTools", "vSource", "vRP",
  "vCluster", "vHost", "vHBA", "vNIC", "vSwitch", "vPort",
  "dvSwitch", "dvPort", "vSC_VMK", "vDatastore", "vMultiPath",
  "vLicense", "vFileInfo", "vHealth", "vMetaData",
]);

const TECH_INFO_REQUIRED_HEADERS = ["Name", "Wartungsfenster", "Betriebssystem"] as const;

export interface SheetShapeForDetection {
  sheetName: string;
  headers: string[];
}

export interface TechInfoDisplayFields {
  maintenanceWindow: string | null;
  operatingSystem: string | null;
  comment: string | null;
  sysv: string | null;
  sysvDepartment: string | null;
  sysvDeputy: string | null;
  sysvDeputyDepartment: string | null;
  bz: string | null;
  clusterFromTechInfo: string | null;
  cvBackup: boolean | null;
  az: string | null;
}

export function detectParsedFileKind(sheets: SheetShapeForDetection[]): ParsedFileKind {
  const hasRvtoolsSheet = sheets.some((sheet) => RVTOOLS_CANONICAL_SHEETS.has(sheet.sheetName));
  if (hasRvtoolsSheet) return "rvtools";

  const hasTechInfoHeaders = sheets.some((sheet) =>
    TECH_INFO_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasTechInfoHeaders) return "tech-info";

  return "rvtools";
}

export function normalizeVmNameForMatch(vmName: string): string {
  return vmName.trim().toLowerCase();
}

export function mapTechInfoDisplayFields(row: Record<string, unknown>): TechInfoDisplayFields {
  return {
    maintenanceWindow: toStr(row["Wartungsfenster"]),
    operatingSystem: toStr(row["Betriebssystem"]),
    comment: toStr(row["Kommentar"]),
    sysv: toStr(row["SysV"]),
    sysvDepartment: toStr(row["SysV Abteilung"]),
    sysvDeputy: toStr(row["SysVStv"]),
    sysvDeputyDepartment: toStr(row["SysVStv Abteilung"]),
    bz: toStr(row["BZ"]),
    clusterFromTechInfo: toStr(row["Schrankreihe"]),
    cvBackup: toBool(row["CV-Backup"]),
    az: toStr(row["AZ"]),
  };
}

export function isTechInfoNewerOrEqual(candidateImportedAt: string, currentImportedAt: string | null | undefined): boolean {
  if (!currentImportedAt) return true;
  return candidateImportedAt >= currentImportedAt;
}

/**
 * Parse RVTools export file names like:
 * RVTools_export_all_2026_02_22_07_05_vcenter9910.xlsx
 */
export function parseRvtoolsExportFileName(fileName: string): ParsedRvtoolsFileName | null {
  const baseName = fileName.split(/[\\/]/).pop() || fileName;
  const match = baseName.match(
    /^RVTools_export_all_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(.+)\.(xlsx|xls)$/i,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const vcenterName = match[6]?.trim();
  if (!vcenterName) return null;

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    dt.getHours() !== hour ||
    dt.getMinutes() !== minute
  ) {
    return null;
  }

  return { vcenterName, exportTs: dt.toISOString() };
}

/** Try to parse a value as a number. Returns null if not parseable. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** Parse boolean-ish values */
export function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return null;
}

/** Safely get string value */
export function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
}

/** Compute SHA-256 checksum of an ArrayBuffer */
export async function computeChecksum(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Format bytes to human-readable */
export function formatBytes(mib: number | null): string {
  if (mib === null || mib === undefined) return "—";
  if (mib >= 1048576) return `${(mib / 1048576).toFixed(1)} TiB`;
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GiB`;
  return `${mib.toFixed(0)} MiB`;
}

/** Format percentage */
export function formatPct(pct: number | null, decimals = 1): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct.toFixed(decimals)}%`;
}

/** Format large numbers with locale */
export function formatNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("de-DE");
}
