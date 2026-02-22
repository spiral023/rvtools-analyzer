export type SnapshotId = string;
export type VCenterId = string;

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
}

export interface SheetRow {
  snapshotId: SnapshotId;
  sheetName: string;
  rowIndex: number;
  data: Record<string, string | number | boolean | null>;
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
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
  createdAt: string;
}

export interface ImportResult {
  success: boolean;
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
  vcenterName: string;
  exportTs: string;
  sheets: ParsedSheetData[];
  warnings: string[];
  errors: string[];
}
