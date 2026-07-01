export type SnapshotId = string;
export type VCenterId = string;
export type ImportFileKind = "rvtools" | "tech-info";

export type SheetName =
  | "vInfo" | "vCPU" | "vMemory" | "vDisk" | "vPartition" | "vNetwork"
  | "vCD" | "vUSB" | "vSnapshot" | "vTools" | "vSource" | "vRP"
  | "vCluster" | "vHost" | "vHBA" | "vNIC" | "vSwitch" | "vPort"
  | "dvSwitch" | "dvPort" | "vSC_VMK" | "vDatastore" | "vMultiPath"
  | "vLicense" | "vFileInfo" | "vHealth" | "vMetaData";

export const ALL_SHEET_NAMES: SheetName[] = [
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork",
  "vCD", "vUSB", "vSnapshot", "vTools", "vSource", "vRP",
  "vCluster", "vHost", "vHBA", "vNIC", "vSwitch", "vPort",
  "dvSwitch", "dvPort", "vSC_VMK", "vDatastore", "vMultiPath",
  "vLicense", "vFileInfo", "vHealth", "vMetaData",
];

export interface UploadFile {
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType: string;
}

export interface SheetStats {
  rowCount: number;
  columnCount: number;
}

export interface SnapshotMeta {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  vcenterDisplayName: string;
  exportTs: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  sheetStats: Record<string, SheetStats>;
  /** Größe der importierten Datei in Bytes. Fehlt bei Snapshots, die vor Einführung dieses Felds importiert wurden. */
  fileSizeBytes?: number;
  /** Gesamtdauer des Imports in Millisekunden (Start bis "Abgeschlossen"). Fehlt bei älteren Snapshots. */
  importDurationMs?: number;
}

export interface SheetRow {
  snapshotId: SnapshotId;
  sheetName: string;
  rowIndex: number;
  data: Record<string, string | number | boolean | null>;
}

export interface TechInfoImportMeta {
  techInfoImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
}

export interface TechInfoRow {
  techInfoImportId: string;
  rowIndex: number;
  vmName: string;
  vmNameNorm: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface TechInfoLatest {
  vmNameNorm: string;
  vmName: string;
  importedAt: string;
  techInfoImportId: string;
  rowIndex: number;
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

export interface MaintenanceSettings {
  id: "default";
  firstName: string;
  lastName: string;
  companyName: string;
  updatedAt: string;
}

export type MaintenanceClusterType = "Normal" | "Spezial";

export type MaintenanceWeekday = "MO" | "DI" | "MI" | "DO" | "FR" | "SA" | "SO";

export interface MaintenanceWindow {
  id: string;
  label: string;
  dayFrom: MaintenanceWeekday;
  dayTo: MaintenanceWeekday;
  startTime: string;
  endTime: string;
  presetId?: string;
}

export interface MaintenanceContact {
  firstName: string;
  lastName: string;
}

export interface MaintenanceClusterAssignment {
  vcenterId: VCenterId;
  clusterName: string;
  type: MaintenanceClusterType;
  windows: MaintenanceWindow[];
  contacts: MaintenanceContact[];
  updatedAt: string;
  id?: string;
}

export interface NormalizedVm {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  vmKey: string;
  vmUuid: string | null;
  vmName: string;
  cluster: string | null;
  host: string | null;
  powerState: string | null;
  cpuCount: number | null;
  memoryMiB: number | null;
  provisionedMiB: number | null;
  inUseMiB: number | null;
  configStatus: string | null;
  connectionState: string | null;
  consolidationNeeded: boolean | null;
  osConfig: string | null;
  osTools: string | null;
  hwVersion: string | null;
  toolsStatus: string | null;
  toolsVersion: string | null;
  datacenter: string | null;
  folder: string | null;
  resourcePool: string | null;
  annotation: string | null;
  cpuReady: number | null;
  firmware: string | null;
  efiSecureBoot: boolean | null;
  cbt: boolean | null;
}

export interface NormalizedHost {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  hostKey: string;
  host: string;
  cluster: string | null;
  datacenter: string | null;
  cpuModel: string | null;
  cpuTotalMHz: number | null;
  cpuCores: number | null;
  cpuThreads: number | null;
  memoryTotalMiB: number | null;
  version: string | null;
  build: string | null;
  vendor: string | null;
  model: string | null;
  connectionState: string | null;
  powerState: string | null;
  maintenanceMode: string | null;
  vmCount: number | null;
}

export interface NormalizedCluster {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  clusterKey: string;
  name: string;
  datacenter: string | null;
  haEnabled: boolean | null;
  drsEnabled: boolean | null;
  numHosts: number | null;
  numCpuCores: number | null;
  numCpuThreads: number | null;
  totalMemoryMiB: number | null;
  totalCpuMHz: number | null;
  numEffectiveHosts: number | null;
}

export interface NormalizedDatastore {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  dsKey: string;
  name: string;
  clusterName: string | null;
  type: string | null;
  capacityMiB: number | null;
  inUseMiB: number | null;
  freeMiB: number | null;
  freePct: number | null;
  version: string | null;
  siocEnabled: boolean | null;
}

export interface NormalizedSnapshot {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  vmName: string;
  snapshotName: string | null;
  description: string | null;
  dateTaken: string | null;
  sizeMiB: number | null;
  quiesced: boolean | null;
}

export interface NormalizedHealth {
  snapshotId: SnapshotId;
  vcenterId: VCenterId;
  entity: string | null;
  messageType: string | null;
  message: string | null;
}

export type GlobalFilterDataType = "text" | "number" | "boolean";

export type GlobalFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "wildcard"
  | "empty"
  | "not_empty"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "is_true"
  | "is_false";

export type GlobalFilterLogicalOperator = "and" | "or";

export type GlobalFilterSourceScope =
  | "root"
  | "vm"
  | "techInfo"
  | "vInfo"
  | "vCPU"
  | "vMemory"
  | "vDisk"
  | "vPartition"
  | "vNetwork"
  | "vSnapshot"
  | "vTools"
  | "vCD"
  | "vUSB";

export interface GlobalFilterRule {
  id: string;
  type: "rule";
  field: string;
  operator: GlobalFilterOperator;
  value?: string;
  valueTo?: string;
  unit?: "MiB" | "GiB" | "TiB";
}

export interface GlobalFilterGroup {
  id: string;
  type: "group";
  operator: GlobalFilterLogicalOperator;
  sourceScope: GlobalFilterSourceScope;
  children: GlobalFilterNode[];
}

export type GlobalFilterNode = GlobalFilterGroup | GlobalFilterRule;

export interface GlobalFilterField {
  source: Exclude<GlobalFilterSourceScope, "root">;
  key: string;
  label: string;
  dataType: GlobalFilterDataType;
  unit?: "MiB";
  isRepeated?: boolean;
}

export interface AnalysisMetric {
  id: string;
  category: string;
  snapshotId: SnapshotId;
  vcenterId?: VCenterId;
  value: number;
  unit?: string;
  dimensions?: Record<string, string>;
}

export interface KpiCardData {
  id: string;
  title: string;
  value: string;
  subtitle?: string;
  trend?: { delta: number; direction: "up" | "down" | "flat" };
  severity?: "ok" | "warn" | "crit";
}

export interface FilterState {
  snapshotIds: SnapshotId[];
  vcenterIds: VCenterId[];
  clusters: string[];
  hosts: string[];
  datastores: string[];
  search: string;
  globalFilter: GlobalFilterGroup | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
  createdAt: string;
}

export interface ImportResult {
  success: boolean;
  fileKind?: ImportFileKind;
  snapshotId?: SnapshotId;
  warnings: string[];
  errors: string[];
  sheetStats?: Record<string, SheetStats>;
}

export interface UiState {
  id: string;
  theme: "dark" | "light";
  lastFilter?: FilterState;
  presets?: FilterPreset[];
}

export interface ParsedSheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface WorkerParseResult {
  fileKind: ImportFileKind;
  vcenterName: string;
  exportTs: string;
  sheets: ParsedSheetData[];
  warnings: string[];
  errors: string[];
}
