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

export type ParsedFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam";

const RVTOOLS_CANONICAL_SHEETS = new Set([
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork",
  "vCD", "vUSB", "vSnapshot", "vTools", "vSource", "vRP",
  "vCluster", "vHost", "vHBA", "vNIC", "vSwitch", "vPort",
  "dvSwitch", "dvPort", "vSC_VMK", "vDatastore", "vMultiPath",
  "vLicense", "vFileInfo", "vHealth", "vMetaData",
]);

const TECH_INFO_REQUIRED_HEADERS = ["Name", "Wartungsfenster", "Betriebssystem"] as const;
export const TECH_INFO_CLIENT_REQUIRED_HEADERS = ["Name", "BLZ", "MAC Adresse", "Poolname"] as const;
export const CDP_REQUIRED_HEADERS = ["VMHost", "PhysicalAdapter", "CDPDeviceID", "CDPAvailable"] as const;
export const IPAM_REQUIRED_HEADERS = ["IP Address", "Status", "Type"] as const;

export interface SheetShapeForDetection {
  sheetName: string;
  headers: string[];
}

export interface TechInfoDisplayFields {
  serverType: string | null;
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

export interface TechInfoClientDisplayFields {
  blz: string | null;
  standort: string | null;
  ip: string | null;
  macAddress: string | null;
  poolName: string | null;
  modifiedBy: string | null;
  modifiedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  user: string | null;
  hardware: string | null;
  os: string | null;
  cluster: string | null;
  vcenter: string | null;
  site: string | null;
  insider: string | null;
  hwChanges: string | null;
  monitoring: string | null;
  domain: string | null;
}

export interface ParsedEsxVersionBuild {
  version: string | null;
  build: string | null;
}

export function detectParsedFileKind(sheets: SheetShapeForDetection[]): ParsedFileKind {
  const hasRvtoolsSheet = sheets.some((sheet) => RVTOOLS_CANONICAL_SHEETS.has(sheet.sheetName));
  if (hasRvtoolsSheet) return "rvtools";

  const hasTechInfoHeaders = sheets.some((sheet) =>
    TECH_INFO_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasTechInfoHeaders) return "tech-info";

  const hasTechInfoClientHeaders = sheets.some((sheet) =>
    TECH_INFO_CLIENT_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasTechInfoClientHeaders) return "tech-info-client";

  const hasCdpHeaders = sheets.some((sheet) =>
    CDP_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasCdpHeaders) return "cdp";

  const hasIpamHeaders = sheets.some((sheet) =>
    IPAM_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
  if (hasIpamHeaders) return "ipam";

  return "rvtools";
}

export function normalizeVmNameForMatch(vmName: string): string {
  return vmName.trim().toLowerCase();
}

export function hasIdenticalSysvAndDeputy(sysv: string | null | undefined, sysvDeputy: string | null | undefined): boolean {
  const normalizedSysv = sysv?.trim().toLowerCase() ?? "";
  const normalizedDeputy = sysvDeputy?.trim().toLowerCase() ?? "";
  return normalizedSysv !== "" && normalizedSysv === normalizedDeputy;
}

export function mapTechInfoDisplayFields(row: Record<string, unknown>): TechInfoDisplayFields {
  return {
    serverType: toStr(row["Servertyp"]),
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

/** Mapping der Client-Doku-Spalten. CPU min/max und RAM min/max werden bewusst nicht übernommen (nicht mehr genutzt). */
export function mapTechInfoClientDisplayFields(row: Record<string, unknown>): TechInfoClientDisplayFields {
  return {
    blz: toStr(row["BLZ"]),
    standort: toStr(row["Standort"]),
    ip: toStr(row["IP"]),
    macAddress: toStr(row["MAC Adresse"]),
    poolName: toStr(row["Poolname"]),
    modifiedBy: toStr(row["Geändert von"]),
    modifiedAt: toStr(row["Änderungsdatum"]),
    createdBy: toStr(row["Erstellt von"]),
    createdAt: toStr(row["Erstellungsdatum"]),
    user: toStr(row["User"]),
    hardware: toStr(row["Hardware"]),
    os: toStr(row["OS"]),
    cluster: toStr(row["Cluster"]),
    vcenter: toStr(row["vCenter"]),
    site: toStr(row["Site"]),
    insider: toStr(row["Insider"]),
    hwChanges: toStr(row["HW Änderungen"]),
    monitoring: toStr(row["Monitoring"]),
    domain: toStr(row["Domäne"]),
  };
}

export interface CdpDisplayFields {
  vcenter: string | null;
  cluster: string | null;
  hostConnectionState: string | null;
  linkStatus: string | null;
  mac: string | null;
  cdpDeviceId: string | null;
  cdpPortId: string | null;
  cdpMgmtIp: string | null;
  cdpSwitchAddress: string | null;
  cdpPlatform: string | null;
  cdpSoftware: string | null;
  nativeVlan: string | null;
  mtu: string | null;
  cdpAvailable: boolean | null;
  queryStatus: string | null;
}

export function mapCdpDisplayFields(row: Record<string, unknown>): CdpDisplayFields {
  return {
    vcenter: toStr(row["vCenter"]),
    cluster: toStr(row["Cluster"]),
    hostConnectionState: toStr(row["HostConnectionState"]),
    linkStatus: toStr(row["LinkStatus"]),
    mac: toStr(row["MACAddress"]),
    cdpDeviceId: toStr(row["CDPDeviceID"]),
    cdpPortId: toStr(row["CDPPortID"]),
    cdpMgmtIp: toStr(row["CDPManagementIP"]),
    cdpSwitchAddress: toStr(row["CDPSwitchAddress"]),
    cdpPlatform: toStr(row["CDPHardwarePlatform"]),
    cdpSoftware: toStr(row["CDPSoftwareVersion"]),
    nativeVlan: toStr(row["CDPNativeVLAN"]),
    mtu: toStr(row["CDPMTU"]),
    cdpAvailable: toBool(row["CDPAvailable"]),
    queryStatus: toStr(row["QueryStatus"]),
  };
}

export interface IpamDisplayFields {
  name: string | null;
  status: string | null;
  type: string | null;
  usage: string | null;
  firstDiscovered: string | null;
  lastDiscovered: string | null;
  comment: string | null;
  site: string | null;
  macAddress: string | null;
  os: string | null;
  netBiosName: string | null;
  deviceTypes: string | null;
  openPorts: string | null;
  fingerprint: string | null;
}

export function mapIpamDisplayFields(row: Record<string, unknown>): IpamDisplayFields {
  return {
    name: toStr(row["Name"]),
    status: toStr(row["Status"]),
    type: toStr(row["Type"]),
    usage: toStr(row["Usage"]),
    firstDiscovered: toStr(row["First Discovered"]),
    lastDiscovered: toStr(row["Last Discovered"]),
    comment: toStr(row["Comment"]),
    site: toStr(row["Site"]),
    macAddress: toStr(row["MAC Address"]),
    os: toStr(row["OS"]),
    netBiosName: toStr(row["NetBIOS Name"]),
    deviceTypes: toStr(row["Device Type(s)"]),
    openPorts: toStr(row["Open Port(s)"]),
    fingerprint: toStr(row["Fingerprint"]),
  };
}

const IPV4_OCTET = "(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})";
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`);

export function isValidIpv4(ip: string): boolean {
  return IPV4_PATTERN.test(ip);
}

export function buildHostAdapterKey(host: string, adapter: string): string {
  return `${normalizeVmNameForMatch(host)}::${adapter.trim().toLowerCase()}`;
}

/** vCenter-Anzeigename → vcenterId, identische Konvention wie beim RVTools-Import. */
export function normalizeVcenterId(vcenterName: string): string {
  return vcenterName.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "_") || "unknown-vcenter";
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

/**
 * Parse values like:
 * "VMware ESXi 8.0.3 build-24784735"
 * into version/build parts.
 */
export function parseEsxVersionBuild(v: unknown): ParsedEsxVersionBuild {
  const text = toStr(v);
  if (!text) return { version: null, build: null };

  const esxiToken = text.match(/\bESXi\s+([^\s]+)/i)?.[1] || null;
  const genericVersion = text.match(/\b([0-9]+\.[0-9]+(?:\.[0-9A-Za-z]+)?)\b/)?.[1] || null;
  const rawVersion = esxiToken || genericVersion;
  const version = rawVersion ? rawVersion.replace(/[),;]+$/, "") : null;
  const build = text.match(/\bbuild[-\s]*([0-9]+)\b/i)?.[1] || null;

  return { version, build };
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
