export type SnapshotId = string;
export type VCenterId = string;
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam" | "switch" | "eramon-iface" | "eramon-l2";

export type SheetName =
  | "vInfo" | "vCPU" | "vMemory" | "vDisk" | "vPartition" | "vNetwork"
  | "vCD" | "vUSB" | "vSnapshot" | "vTools" | "vSource" | "vRP"
  | "vCluster" | "vHost" | "vHBA" | "vNIC" | "vSwitch" | "vPort"
  | "dvSwitch" | "dvPort" | "vSC_VMK" | "vDatastore" | "vMultiPath"
  | "vLicense" | "vFileInfo" | "vHealth" | "vMetaData";

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

/**
 * Hydratisierte Sheet-Zeile für die Leseseite (`getRawSheetRows`, alle `useRawSheet`-Consumer).
 * Die Rohdaten werden intern komprimiert als {@link RawSheetBlob} persistiert und beim
 * Lesen in diese Record-Form zurückgeführt.
 */
export interface SheetRow {
  snapshotId: SnapshotId;
  sheetName: string;
  rowIndex: number;
  data: Record<string, string | number | boolean | null>;
}

/**
 * Komprimierter Rohdaten-Blob eines Snapshot+Sheets (ab v19): ein Record statt einer
 * Zeile pro Record. `headers` bleibt unkomprimiert für Feldnamen-Abfragen ohne
 * Dekompression; `data` ist `gzipJson(values)` (siehe `src/lib/compression.ts`).
 */
export interface RawSheetBlob {
  snapshotId: SnapshotId;
  sheetName: string;
  headers: string[];
  rowCount: number;
  codec: "gzip-json-v1";
  data: ArrayBuffer;
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

export type MaintenanceWindowHandling = "regular" | "always" | "approval-required" | "external";

/** Wochentag mit Montag als Index 0 und Sonntag als Index 6. */
export type MaintenanceWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type MonthlyOccurrence = 1 | 2 | 3 | 4 | 5 | "last";

export interface MaintenanceCalendarRule {
  weekday: MaintenanceWeekday;
  occurrences: MonthlyOccurrence[];
}

export interface MaintenanceWindowDefinition {
  id: string;
  abbreviation: string;
  normalizedAbbreviation: string;
  description: string;
  handling: MaintenanceWindowHandling;
  weeklySlots: [boolean[], boolean[], boolean[], boolean[], boolean[], boolean[], boolean[]];
  calendarRules: MaintenanceCalendarRule[];
  createdAt: string;
  updatedAt: string;
}

export interface TechInfoClientImportMeta {
  techInfoClientImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
}

export interface TechInfoClientRow {
  techInfoClientImportId: string;
  rowIndex: number;
  clientName: string;
  clientNameNorm: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface TechInfoClientLatest {
  clientNameNorm: string;
  clientName: string;
  importedAt: string;
  techInfoClientImportId: string;
  rowIndex: number;
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

export interface CdpImportMeta {
  cdpImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
}

export interface CdpRow {
  cdpImportId: string;
  rowIndex: number;
  host: string;
  hostNorm: string;
  adapter: string;
  /** `${hostNorm}::${adapterNorm}` — Primärschlüssel in cdp_latest, Index in cdp_rows. */
  hostAdapterKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface CdpLatest {
  hostAdapterKey: string;
  hostNorm: string;
  host: string;
  adapter: string;
  importedAt: string;
  cdpImportId: string;
  rowIndex: number;
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

export interface EramonIfaceImportMeta {
  ifaceImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface EramonIfaceRow {
  ifaceImportId: string;
  rowIndex: number;
  deviceName: string;
  switchNorm: string;
  portName: string;
  /** `${switchNorm}::${portNorm}` — Primärschlüssel in eramon_iface_latest, Index in eramon_iface_rows. */
  switchPortKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface EramonIfaceLatest {
  switchPortKey: string;
  switchNorm: string;
  deviceName: string;
  portName: string;
  importedAt: string;
  ifaceImportId: string;
  rowIndex: number;
  portDesc: string | null;
  bandbreiteBps: number | null;
  portStatus: string | null;
  statusLabel: string | null;
}

export interface EramonL2ImportMeta {
  l2ImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface EramonL2Row {
  l2ImportId: string;
  rowIndex: number;
  switchName: string;
  switchNorm: string;
  interface: string;
  mac: string;
  vlan: string;
  /** `${switchNorm}::${ifaceNorm}::${macNorm}::${vlan}` — Primärschlüssel in eramon_l2_latest, Index in eramon_l2_rows. */
  l2EntryKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface EramonL2Latest {
  l2EntryKey: string;
  switchNorm: string;
  switchName: string;
  interface: string;
  mac: string;
  vlan: string;
  importedAt: string;
  l2ImportId: string;
  rowIndex: number;
  ip: string | null;
  dnsName: string | null;
  type: string | null;
  interfaceDescription: string | null;
}

export interface IpamImportMeta {
  ipamImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
}

export interface IpamRow {
  ipamImportId: string;
  rowIndex: number;
  ipAddress: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface IpamLatest {
  ipAddress: string;
  importedAt: string;
  ipamImportId: string;
  rowIndex: number;
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

export interface SwitchImportMeta {
  switchImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  rowCount: number;
  switchCount: number;
}

export interface SwitchRow {
  switchImportId: string;
  rowIndex: number;
  hostname: string;
  hostnameNorm: string;
  command: string;
  filter: string;
  interface: string;
  /** `${hostnameNorm}::${interfaceNorm}` — Primärschlüssel in switch_latest, Index in switch_rows. */
  switchInterfaceKey: string;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

export interface SwitchLatest {
  switchInterfaceKey: string;
  hostnameNorm: string;
  hostname: string;
  interface: string;
  importedAt: string;
  switchImportId: string;
  rowIndex: number;
  description: string | null;
  status: string | null;
  mode: string | null;
  duplex: string | null;
  speed: string | null;
  transceiver: string | null;
}

export interface MaintenanceSettings {
  id: "default";
  firstName: string;
  lastName: string;
  companyName: string;
  updatedAt: string;
}

export type MaintenanceClusterType = "Normal" | "Spezial";

export type LegacyMaintenanceWeekday = "MO" | "DI" | "MI" | "DO" | "FR" | "SA" | "SO";

export interface MaintenanceWindow {
  id: string;
  label: string;
  // Ältere Zuweisungen haben strukturierte Zeiten; neue Fenster sind reiner Freitext im Label.
  dayFrom?: LegacyMaintenanceWeekday;
  dayTo?: LegacyMaintenanceWeekday;
  startTime?: string;
  endTime?: string;
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
  // Zusätzliche Empfänger, z. B. Postkorb oder Teams-Kanal-Adresse.
  additionalEmails?: string[];
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
  | "techInfoClient"
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

export interface VmScopeSettings {
  vmPowerScope: "all" | "poweredOn";
  excludeVclsVms: boolean;
}

export interface FilterState extends VmScopeSettings {
  vcenterIds: VCenterId[];
  clusters: string[];
  hosts: string[];
  datastores: string[];
  search: string;
  globalFilter: GlobalFilterGroup | null;
  vmNameList: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
  createdAt: string;
}

/** Wiederverwendbare Auswahl mehrerer vCenter, referenziert über deren stabile vcenterId. */
export interface VCenterGroup {
  id: string;
  name: string;
  vcenterIds: VCenterId[];
  createdAt: string;
  updatedAt: string;
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
  selectionVmKeys?: string[];
}

export type ScenarioType = "cluster-migration";

export interface ScenarioGroup {
  id: string;
  label: string | null;
  targetClusterKey: string;
  vmKeys: string[];
}

export interface Scenario {
  id: string;
  name: string;
  type: ScenarioType;
  createdAt: string;
  updatedAt: string;
  vcenterScope: string[];
  groups: ScenarioGroup[];
  notes: string | null;
}

/** Anteilig geschätzte Ist-Last einer einzelnen VM (proportional zur Konfiguration). */
export interface VmLoadEstimate {
  activeMiB: number;
  consumedMiB: number;
  swapBalloonMiB: number;
  usedCoreEquiv: number;
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
