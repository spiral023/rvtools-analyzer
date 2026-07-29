export type SnapshotId = string;
export type VCenterId = string;
export type ImportFileKind = "rvtools" | "tech-info" | "tech-info-client" | "cdp" | "ipam" | "eramon-iface" | "eramon-l2" | "vrops" | "vrops-timeseries" | "maintenance-windows";

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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
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

export type VropsClusterScope = "cluster" | "high-rp";

export interface VropsImportMeta {
  vropsImportId: string;
  importedAt: string;
  fileName: string;
  fileChecksum: string;
  /** Originalgröße der importierten Datei in Bytes. Fehlt bei älteren Imports. */
  fileSizeBytes?: number;
  rowCount: number;
  columnCount: number;
  /** Zeitstempel der vROps-Erfassung aus der Quelldatei ("Erfasst am"), informativ. */
  capturedAt: string | null;
}

export interface VropsRow {
  vropsImportId: string;
  rowIndex: number;
  clusterName: string;
  clusterNorm: string;
  scope: VropsClusterScope;
  panelNumber: number;
  importedAt: string;
  rawData: Record<string, string | number | boolean | null>;
}

/**
 * Zusammengeführter Ausfallskonzept-Stand je Cluster: die Panels 1–7 des vROps-Exports
 * verteilen sich auf mehrere Rohzeilen (HIGH-RP- und Cluster-Objekte) und werden hier zu
 * einem Datensatz pro Cluster zusammengeführt.
 */
export interface VropsLatest {
  clusterNorm: string;
  clusterName: string;
  importedAt: string;
  vropsImportId: string;
  capturedAt: string | null;
  /** Panel 1: RAM-Nutzung der HIGH-RP-VMs relativ zum eigenen RP-Kontingent. */
  ramUsageHighPct: number | null;
  /** Panel 2: RAM-Zuweisung der HIGH-RP-VMs relativ zur Gesamt-Cluster-Kapazität. */
  ramAssignedHighPct: number | null;
  /** Panel 3: RAM-Zuweisung des gesamten Clusters (HIGH + STD). */
  clusterRamAssignedPct: number | null;
  /** Panel 4: CPU-Nutzung der HIGH-RP-VMs relativ zur Gesamt-Cluster-CPU-Leistung. */
  cpuUsageHighPct: number | null;
  /** Panel 5: Gesamte Cluster-CPU-Nutzung. */
  clusterCpuUsagePct: number | null;
  /** Panel 6: Durchschnittliche Anzahl laufender VMs je Host (vROps-Ist-Wert). */
  avgVmsPerHost: number | null;
  /** Panel 7: CPU-Überbuchungsverhältnis (vROps-Ist-Wert). */
  cpuOvercommitRatio: number | null;
}

/**
 * Eigenständiger, stündlicher vROps-Export für die Kapazitätsplanung.
 *
 * Diese Verträge sind bewusst von `VropsImportMeta`, `VropsRow` und
 * `VropsLatest` getrennt: Letztere modellieren den bisherigen panelbasierten
 * vROps-Import für das Ausfallskonzept.
 */
export type VropsTimeSeriesObjectType = "vm" | "cluster" | "host";

export type VropsTimeSeriesMetricKey =
  | "vmCpuDemandAvgMHz"
  | "vmCpuReadyMaxPct"
  | "clusterCpuDemandAvgMHz"
  | "clusterCpuDemandMaxMHz"
  | "clusterMemoryUtilizationAvgMiB"
  | "clusterMemoryUtilizationMaxMiB"
  | "clusterCpuContentionAvgPct"
  | "clusterCpuContentionMaxPct"
  | "hostCpuCapacityAvailableLastMHz"
  | "hostMemoryCapacityAvailableLastMiB"
  | "hostCpuDemandAvgMHz"
  | "hostCpuDemandMaxMHz"
  | "hostCpuUsageAvgMHz"
  | "hostCpuUsageMaxMHz"
  | "hostMemoryUtilizationAvgMiB"
  | "hostMemoryUtilizationMaxMiB"
  | "hostCpuContentionAvgPct"
  | "hostCpuContentionMaxPct"
  | "hostMaintenanceStateLast";

export type VropsTimeSeriesIssueSeverity = "error" | "warning";

export interface VropsTimeSeriesValidationIssue {
  code: string;
  severity: VropsTimeSeriesIssueSeverity;
  message: string;
  row?: number;
  column?: number;
  header?: string;
  objectName?: string;
  intervalStartUtc?: number;
  metric?: VropsTimeSeriesMetricKey;
  details?: Record<string, string | number | boolean | null>;
}

/** Ein normalisierter Punkt aus einer vROps-Zeitreihen-CSV, noch ohne Persistenzbezug. */
export interface VropsTimeSeriesParsedRow {
  objectName: string;
  intervalStartUtc: number;
  values: Partial<Record<VropsTimeSeriesMetricKey, number | string | null>>;
  /** Nur für Host-Maintenance: aus dem letzten bekannten Zustand fortgeschrieben. */
  derivedMetrics?: Partial<Record<VropsTimeSeriesMetricKey, boolean>>;
  sourceRow: number;
}

export interface VropsTimeSeriesSchemaMatch {
  version: number;
  objectType: VropsTimeSeriesObjectType;
  objectNameHeader: string;
  intervalHeader: string;
  metricHeaders: Partial<Record<VropsTimeSeriesMetricKey, string>>;
}

export interface VropsTimeSeriesParseResult {
  schema: VropsTimeSeriesSchemaMatch | null;
  rows: VropsTimeSeriesParsedRow[];
  issues: VropsTimeSeriesValidationIssue[];
}

export interface VropsTimeSeriesSourceFile {
  objectType: VropsTimeSeriesObjectType;
  fileName: string;
  fileSizeBytes: number;
  fileChecksum: string;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  status: "accepted" | "rejected";
}

export interface VropsTimeSeriesQualitySummary {
  objectCountByType: Record<VropsTimeSeriesObjectType, number>;
  expectedSlots: number;
  errorCount: number;
  warningCount: number;
  missingValueCount: number;
}

/** Metadaten eines atomar gespeicherten VM-, Cluster- und Host-Dateisatzes. */
export interface VropsTimeSeriesImport {
  id: string;
  importedAt: string;
  timezone: "Europe/Vienna";
  intervalMinutes: 60;
  rangeStartUtc: number;
  rangeEndUtc: number;
  expectedSlots: number;
  rvtoolsSnapshotIds: string[];
  files: VropsTimeSeriesSourceFile[];
  fileSetChecksum: string;
  schemaVersion: number;
  validationStatus: "schema-valid" | "relationships-partial" | "relationships-valid" | "manually-verified";
  qualitySummary: VropsTimeSeriesQualitySummary;
  /** Beim Import ermittelte Kollisions- und Site-Hinweise für spätere Qualitätsberichte. */
  relationshipIssues?: VropsRelationshipIssue[];
}

export interface VropsTimeSeriesImportedObject {
  importId: string;
  objectKey: string;
  objectType: VropsTimeSeriesObjectType;
  vropsName: string;
  vcenterId: VCenterId | null;
  rvtoolsSnapshotId: SnapshotId | null;
  rvtoolsObjectKey: string | null;
  clusterKey: string | null;
  hostKey: string | null;
  /** Aus dem letzten RVTools-Resource-Pool-Segment am Importzeitpunkt. */
  workloadClass: "high" | "std" | "unknown" | null;
  /** Eingefrorener RVTools-Power-State; nur für VMs belegt. */
  powerState: string | null;
  /** Aus einer konfigurierbaren Hostnamenregel abgeleitete Site; nur für Hosts belegt. */
  siteId: string | null;
  matchStatus: "matched" | "unmatched" | "ambiguous";
  matchMethod: "name" | "none";
}

export interface VropsTimeSeriesSiteRule {
  id: string;
  siteId: string;
  /** Regulärer Ausdruck gegen den Hostnamen, etwa `^esxsrv1`. */
  hostNamePattern: string;
}

export type VropsRelationshipIssueCode =
  | "unmatched-object"
  | "name-collision-within-vcenter"
  | "name-collision-across-vcenters"
  | "invalid-site-rule"
  | "unknown-site";

export interface VropsRelationshipIssue {
  code: VropsRelationshipIssueCode;
  objectKey?: string;
  objectType?: VropsTimeSeriesObjectType;
  severity: "warning" | "blocking";
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export type VropsTimeSeriesConfidenceLevel = "high" | "medium" | "low" | "not-computable";

export type VropsDataQualityFindingCode =
  | VropsRelationshipIssueCode
  | "missing-required-capacity"
  | "missing-vm-relationship"
  | "unknown-resource-pool"
  | "missing-optional-host-diagnostic"
  | "incomplete-vm-coverage"
  | "cluster-demand-mismatch"
  | "cluster-demand-comparison-unavailable"
  | "rvtools-time-distance";

export interface VropsDataQualityFinding {
  code: VropsDataQualityFindingCode;
  severity: "info" | "warning" | "blocking";
  message: string;
  affectedObjectKeys: string[];
  metric?: VropsTimeSeriesMetricKey;
  details?: Record<string, string | number | boolean | null>;
}

export interface VropsTimeSeriesMetricCoverage {
  objectKey: string;
  objectType: VropsTimeSeriesObjectType;
  metric: VropsTimeSeriesMetricKey;
  expectedSlots: number;
  presentSlots: number;
  missingSlots: number;
  coverageRatio: number;
}

export interface VropsClusterDemandComparison {
  clusterObjectKey: string;
  clusterKey: string | null;
  status: "compared" | "insufficient-vm-coverage" | "missing-direct-cluster-series";
  expectedSlots: number;
  comparedSlots: number;
  vmCoverageRatio: number;
  clusterCoverageRatio: number;
  meanAbsoluteRelativeDifference: number | null;
  maximumAbsoluteRelativeDifference: number | null;
}

export interface VropsDataQualityReport {
  importId: string;
  confidence: VropsTimeSeriesConfidenceLevel;
  findings: VropsDataQualityFinding[];
  metricCoverage: VropsTimeSeriesMetricCoverage[];
  clusterDemandComparisons: VropsClusterDemandComparison[];
  rvtoolsTimeDistanceMs: number | null;
}

export type CapacityProfileKind =
  | "realtime-telephony"
  | "standard-server-windows"
  | "standard-server-linux"
  | "vdi"
  | "preproduction-test"
  | "special"
  | "sap"
  | "paas-openshift"
  | "data-warehouse"
  | "vmware-management";

/** Alle fachlichen Grenzwerte einer versionierten Fill-Up-Policy. */
export interface CapacityPolicyValues {
  lookbackDays: number;
  planningPercentile: number;
  maxVcpuPerCoreNormal: number;
  maxVcpuPerCoreN1: number;
  maxVcpuPerCoreN2: number | null;
  cpuDemandWarnPctNormal: number;
  cpuDemandDangerPctNormal: number;
  cpuDemandWarnPctN1: number;
  cpuDemandDangerPctN1: number;
  cpuDemandWarnPctN2: number | null;
  cpuDemandDangerPctN2: number | null;
  cpuReadyWarnPct: number;
  cpuReadyDangerPct: number;
  cpuContentionWarnPct: number;
  cpuContentionDangerPct: number;
  totalRamAssignedWarnPct: number;
  totalRamAssignedDangerPct: number;
  memoryUtilizationWarnPct: number;
  memoryUtilizationDangerPct: number;
  highRamAssignedWarnPct: number;
  highRamAssignedDangerPct: number;
  highCpuSiteWarnPct: number;
  highCpuSiteDangerPct: number;
  cpuSafetyBufferPct: number;
  ramSafetyBufferPct: number;
  ramSystemReserveMiBPerHost: number;
  requireN1: boolean;
  useN2AsHardLimit: boolean;
  requireHighSiteFailover: boolean;
  maxSingleVmHostCpuPct: number;
  maxSingleVmHostRamPct: number;
}

/** Eine Version wird niemals überschrieben; `id` bleibt die fachliche Profilidentität. */
export interface CapacityPolicy extends CapacityPolicyValues {
  id: CapacityProfileKind | string;
  version: number;
  name: string;
  profileKind: CapacityProfileKind | "custom";
  createdAt: string;
  updatedAt: string;
}

export interface ClusterCapacityPolicyAssignment {
  vcenterId: VCenterId;
  clusterKey: string;
  clusterName: string;
  policyId: CapacityPolicy["id"];
  /** Nur abweichende Werte; das Basisprofil bleibt jederzeit erkennbar. */
  overrides: Partial<CapacityPolicyValues>;
  updatedAt: string;
}

export type CapacityStatus = "green" | "yellow" | "red" | "unknown";
export type CapacityScenario = "normal" | "n1" | "n2" | "site-failover";

export interface CapacityThreshold {
  warning: number | null;
  danger: number | null;
  unit: "%" | "ratio" | "MiB";
}

export interface CapacityMetricObservation {
  key: string;
  label: string;
  value: number | null;
  threshold: CapacityThreshold;
  scenario: CapacityScenario;
  dataSource: string;
  affectedObjectKeys: string[];
}

export interface CapacityFinding {
  id: string;
  status: CapacityStatus;
  title: string;
  metricKey: string;
  actualValue: number | null;
  threshold: CapacityThreshold;
  scenario: CapacityScenario;
  dataSource: string;
  affectedObjectKeys: string[];
  confidence: VropsTimeSeriesConfidenceLevel;
  policyId: CapacityPolicy["id"];
  policyVersion: number;
}

export interface FillUpHost {
  hostKey: string;
  name: string;
  /** Eingefrorener vROps-Objekt-Key; fehlt nur bei synthetischen Engine-Inputs. */
  timeSeriesObjectKey?: string;
  siteId: string | null;
  cpuCores: number | null;
  /** RVTools-Fallback, wenn die historische Hostkapazität fehlt. */
  fallbackCpuCapacityMHz: number | null;
  fallbackMemoryCapacityMiB: number | null;
}

export interface FillUpVm {
  objectKey: string;
  hostKey: string | null;
  /** Eingefrorener RVTools-Resource-Pool, für beobachtete Referenzprofile. */
  resourcePool?: string | null;
  workloadClass: "high" | "std" | "unknown";
  powerState: string | null;
  vcpu: number;
  configuredMemoryMiB: number;
  /** Konservativer Fallback, wenn eine stündliche VM-Demand-Reihe fehlt. */
  fallbackCpuDemandMHz: number | null;
}

export interface FillUpHostCapacity {
  cpuCapacityMHz: number | null;
  memoryCapacityMiB: number | null;
}

export interface FillUpHour {
  timestampUtc: number;
  hostCapacities: Record<string, FillUpHostCapacity>;
  /** Direkte Clusterreihe ist für Gesamt-Demand autoritativ. */
  clusterCpuDemandMHz: number | null;
  clusterMemoryUtilizationMiB: number | null;
  clusterCpuContentionPct: number | null;
  /** VM-Aggregate dienen der HIGH-/STD-Aufteilung und als transparenter Fallback. */
  vmCpuDemandMHzByVm?: Record<string, number | null>;
  vmCpuReadyPctByVm?: Record<string, number | null>;
}

export type FillUpScenarioKind = "normal" | "n1" | "n2" | "site-failover";

export interface FillUpScenarioDefinition {
  id: string;
  kind: FillUpScenarioKind;
  removedHostKeys: string[];
  failedSiteId?: string;
  /** Bei Site-Ausfall ist STD nur informativ; HIGH bleibt verpflichtend. */
  workloadScope: "all" | "high";
  hardLimit: boolean;
}

export interface FillUpPlacementResult {
  placeable: boolean;
  unplacedVmKeys: string[];
  oversizedVmKeys: string[];
}

export interface FillUpScenarioResult {
  definition: FillUpScenarioDefinition;
  status: CapacityStatus;
  worstTimestampUtc: number | null;
  findings: CapacityFinding[];
  placement: FillUpPlacementResult;
  usedRvtoolsFallback: boolean;
  /** Summe der verbleibenden physischen Cores im ungünstigsten Stunden-Slot. */
  cpuCores: number | null;
  cpuCapacityMHz: number | null;
  memoryCapacityMiB: number | null;
  cpuDemandMHz: number | null;
  highCpuDemandMHz: number | null;
  stdCpuDemandMHz: number | null;
  assignedMemoryMiB: number | null;
  highAssignedMemoryMiB: number | null;
}

export interface FillUpCapacityAnalysis {
  normal: FillUpScenarioResult;
  n1: FillUpScenarioResult | null;
  n2: FillUpScenarioResult | null;
  siteFailover: FillUpScenarioResult[];
  warnings: string[];
}

/** Ein typisches, planbares VM-Profil für eine Fill-Up-Empfehlung. */
export interface FillUpWorkloadProfile {
  id: string;
  name: string;
  workloadClass: "high" | "std";
  vcpu: number;
  memoryMiB: number;
  /** Expliziter P95-CPU-Demand je zusätzlicher VM in MHz. */
  cpuDemandP95MHz: number;
  /**
   * Mittlerer CPU-Demand je zusätzlicher VM in MHz. Zusammen mit dem P95 spannt
   * er das Intervall auf, in dem der Gleichzeitigkeitsfaktor den tatsächlich
   * angesetzten Verbrauch wählt. `null` oder fehlend bedeutet: Es wird
   * unverändert mit dem P95 gerechnet.
   */
  cpuDemandAverageMHz?: number | null;
}

/**
 * Aus dem eingefrorenen RVTools-Inventar und den zugehörigen VM-Zeitreihen
 * abgeleitetes Referenzprofil. Es ist ausschließlich eine Beobachtung; erst
 * beim Übernehmen entsteht ein editierbares Fill-Up-Workloadprofil.
 */
export interface FillUpObservedVmProfile {
  id: string;
  clusterKey: string;
  clusterName: string;
  /** `cluster` steht für alle zugeordneten VMs, `resource-pool` für eine einzelne RP-Gruppe. */
  scope: "cluster" | "resource-pool";
  resourcePool: string | null;
  /** HIGH wird nur vorgeschlagen, wenn der gesamte beobachtete Scope als HIGH zugeordnet ist. */
  suggestedWorkloadClass: "high" | "std";
  vmCount: number;
  /** VMs mit mindestens einem verwertbaren CPU-Demand-Wert. */
  vmWithCpuDemandCount: number;
  averageVcpu: number | null;
  /** Konfigurierter, nicht historisch gemessener VM-RAM. */
  averageConfiguredMemoryMiB: number | null;
  /** Über alle verwertbaren VM-Stunden gemittelter CPU-Demand. */
  averageCpuDemandMHz: number | null;
  /** P95 über alle verwertbaren VM-Stunden; verwendbar als konservativer Planungswert. */
  cpuDemandP95MHz: number | null;
  /** P95 der VM-CPU-Ready-Werte, nur zur Einordnung – kein Profilverbrauch. */
  cpuReadyP95Pct: number | null;
  sampleCount: number;
}

/**
 * Wie `FillUpObservedVmProfile`, aber über ALLE VMs des Imports je HIGH/STD
 * gemittelt statt je Cluster/Resource Pool. Aufrufer filtert vorab auf
 * eingeschaltete, nicht-vCLS-VMs; dient als Vorschlag für die Standardwerte
 * der „typischen zusätzlichen VM“ in der Fill-Up-Planung.
 */
export interface GlobalWorkloadClassProfile {
  workloadClass: "high" | "std";
  vmCount: number;
  vmWithCpuDemandCount: number;
  averageVcpu: number | null;
  averageConfiguredMemoryMiB: number | null;
  averageCpuDemandMHz: number | null;
  cpuDemandP95MHz: number | null;
  cpuReadyP95Pct: number | null;
  sampleCount: number;
}

/**
 * Verhaltensklassen einer VM auf Basis ihres Sieben-Tage-CPU-Demand-Profils.
 * Gemeinsame Basis für VM-Profile, Rightsizing und spätere Korrelations-/
 * Placement-Auswertungen; siehe `vmWorkloadProfileService`.
 */
export type VmBehaviorClass =
  | "unclassified"
  | "constant-load"
  | "business-hours"
  | "night-batch"
  | "weekend-load"
  | "bursty"
  | "variable-load"
  | "low-utilization"
  | "irregular";

/**
 * Zeitliches Lastmuster einer VM – bewusst **unabhängig vom Auslastungsniveau**.
 *
 * `VmBehaviorClass` vermischte beides: weil die Low-Utilization-Prüfung vor allen
 * Musterregeln stand, verlor jede schwach ausgelastete VM ihr Muster. Eine Messung
 * an 3.950 VMs zeigte, dass dadurch 1.381 konstante und 194 kalendergeprägte VMs
 * unter einem einzigen Label verschwanden. Form und Niveau sind deshalb getrennt.
 */
export type VmWorkloadShape =
  | "unclassified"
  | "constant"
  /**
   * Geringe Streuung *und* dominantes Kalenderfenster. Gemessen an 3.950 VMs bildet das
   * eine eigene Population: Grundlastanteil 0,30–0,44 gegenüber 0,60 bei reiner Dauerlast
   * und 0,16 bei echten Kalenderlasten. Diese VMs haben einen belastbaren Rhythmus, fallen
   * aber nie unter etwa ein Drittel ihres P95 – „business-hours“ würde eine Parkbarkeit
   * suggerieren, die nicht besteht, „constant“ würde den Rhythmus verschweigen.
   */
  | "constant-with-peak"
  | "business-hours"
  | "night-batch"
  | "weekend"
  | "bursty"
  | "irregular"
  | "variable";

/**
 * Auslastungsniveau einer VM – bewusst **unabhängig vom zeitlichen Muster**.
 * Die Stufen folgen der beobachteten Verteilung des Bestands, damit keine Grenze
 * im dichtesten Bereich liegt und schon kleine Messunterschiede Hunderte VMs
 * umsortieren. `unknown`, solange die konfigurierte CPU-Kapazität fehlt.
 */
export type VmWorkloadIntensity =
  | "unknown"
  | "idle"
  | "very-low"
  | "low"
  | "moderate"
  | "elevated"
  | "high";

export interface VmWorkloadProfileMetricStats {
  expectedSlots: number;
  sampleCount: number;
  coverageRatio: number;
  average: number | null;
  p50: number | null;
  p95: number | null;
  maximum: number | null;
}

/** Nachvollziehbare Kennzahlen, aus denen `behaviorClass` abgeleitet wurde. */
export interface VmWorkloadClassificationSignals {
  coefficientOfVariation: number | null;
  /**
   * Anteil der Stunden über 10 % des eigenen P95. Messungen an 3.950 VMs zeigen für
   * nahezu jede Klasse einen Median von 100 % – die Kennzahl trennt nicht und wird
   * nur noch informativ mitgeführt. Für Aussagen zur Aktivität `dutyCyclePct` nutzen.
   */
  activeHourSharePct: number | null;
  /**
   * Anteil der Stunden, in denen der Demand 5 % der konfigurierten Kapazität übersteigt –
   * absolutes Maß dafür, wie viel der Woche die VM tatsächlich arbeitet. `null` ohne
   * bekannte Kapazität.
   */
  dutyCyclePct: number | null;
  /**
   * p10/p95 der Stundenwerte: wie stark die VM von Grundlast dominiert wird. Nahe 1 =
   * flaches Profil, nahe 0 = ausgeprägte Spitzen über ruhender Basis. Niveauunabhängig
   * und damit brauchbar zur Formunterscheidung.
   */
  baselineRatio: number | null;
  /** P95-Demand relativ zur konfigurierten CPU-Kapazität, sofern Hostfrequenz und vCPU bekannt sind. */
  utilizationP95Pct: number | null;
  /** Median der Korrelation zwischen Tagesprofilen; 1 = sehr ähnlich, 0 = ohne erkennbaren Zusammenhang. */
  dailyRepeatability: number | null;
  /** Anteil der Demand-Summe während Mo–Fr 08–18 Uhr relativ zum Anteil verfügbarer Stunden; 1 = gleichverteilt. */
  businessHoursConcentration: number | null;
  /** Wie `businessHoursConcentration`, für Mo–Fr 00–06 Uhr. */
  nightConcentration: number | null;
  /** Wie `businessHoursConcentration`, für Samstag/Sonntag. */
  weekendConcentration: number | null;
}

export interface VmWorkloadHourlyPoint {
  timestampUtc: number;
  cpuDemandMHz: number | null;
  cpuReadyPct: number | null;
}

/**
 * Aus einer vROps-Zeitreihe abgeleitetes Sieben-Tage-Auslastungsprofil einer
 * einzelnen VM. Ausschließlich eine Beobachtung, keine Empfehlung; wird von
 * VM-Profilen und Rightsizing-Kandidaten gemeinsam genutzt.
 */
export interface VmWorkloadProfile {
  objectKey: string;
  rvtoolsObjectKey: string | null;
  vmName: string;
  clusterKey: string | null;
  clusterName: string | null;
  hostKey: string | null;
  host: string | null;
  vcpu: number | null;
  configuredMemoryMiB: number | null;
  powerState: string | null;
  workloadClass: "high" | "std" | "unknown";
  hourly: VmWorkloadHourlyPoint[];
  demand: VmWorkloadProfileMetricStats;
  ready: VmWorkloadProfileMetricStats;
  /** Zeitliches Muster, niveauunabhängig. Zusammen mit `intensity` die primäre Einordnung. */
  shape: VmWorkloadShape;
  /** Auslastungsniveau, musterunabhängig. Zusammen mit `shape` die primäre Einordnung. */
  intensity: VmWorkloadIntensity;
  /**
   * Aus `shape` und `intensity` abgeleitete Einzelklasse. Erhalten, damit bestehende
   * Auswertungen weiterlaufen; für neue Auswertungen sind die beiden Achsen genauer.
   */
  behaviorClass: VmBehaviorClass;
  confidence: VropsTimeSeriesConfidenceLevel;
  signals: VmWorkloadClassificationSignals;
}

/**
 * Prüfpflichtiger CPU-Rightsizing-Kandidat: vergleicht konfigurierte vCPU mit
 * beobachtetem CPU Demand/Ready. Ändert niemals automatisch VM-Ressourcen.
 */
export interface VmRightsizingCandidate {
  objectKey: string;
  vmName: string;
  clusterKey: string | null;
  clusterName: string | null;
  hostName: string | null;
  vcpu: number | null;
  shape: VmWorkloadShape;
  intensity: VmWorkloadIntensity;
  behaviorClass: VmBehaviorClass;
  confidence: VropsTimeSeriesConfidenceLevel;
  demand: VmWorkloadProfileMetricStats;
  ready: VmWorkloadProfileMetricStats;
  /** MHz pro Core des zum Importzeitpunkt zugeordneten Hosts; Näherung, da VMs migrieren können. */
  mhzPerCore: number | null;
  /** Aus P95-Demand und `mhzPerCore` abgeleiteter, tatsächlich genutzter vCPU-Bedarf. */
  usedVcpuEquivalentP95: number | null;
  /**
   * Dasselbe für das beobachtete Maximum. Begrenzt die Empfehlung nach unten, damit
   * kurze Lastspitzen nicht abgeschnitten werden – der P95 stündlicher Mittelwerte
   * allein verbirgt sie.
   */
  usedVcpuEquivalentPeak: number | null;
  /** Empfohlene vCPU-Zielgröße mit Sicherheitsaufschlag; nur eine prüfpflichtige Kandidatengröße. */
  recommendedVcpu: number | null;
  /** `vcpu - recommendedVcpu`, nie negativ. */
  reclaimableVcpu: number | null;
  flags: {
    /** Viele vCPU bei gleichzeitig geringem genutztem vCPU-Äquivalent. */
    manyVcpuLowDemand: boolean;
    /** CPU Ready P95 über dem Hotspot-Grenzwert – Rightsizing könnte Ready sogar verschlechtern. */
    highCpuReady: boolean;
  };
}

/** Je Cluster oder Verhaltensklasse aufsummierte, potenziell rückgewinnbare vCPU-Kapazität. */
export interface VmRightsizingGroupSummary {
  key: string;
  label: string;
  vmCount: number;
  candidateCount: number;
  totalVcpu: number;
  reclaimableVcpu: number;
}

/** Zusammensetzung einer gemeinsamen zusätzlichen HIGH-/STD-Workloadmenge. */
export interface FillUpWorkloadMix {
  highProfileId: string;
  stdProfileId: string;
  /** HIGH-Anteil der zusätzlichen VM-Menge; der Wert wird konservativ aufgerundet. */
  highSharePct: number;
}

export interface FillUpHeadroomValue {
  value: number | null;
  unit: "vCPU" | "MHz" | "MiB";
  limitingScenarioId: string | null;
  limitingMetricKey: string | null;
}

/** Unabhängige Grenzwerte; sie dürfen nicht zu einer gemeinsamen VM-Zahl addiert werden. */
export interface FillUpIndependentHeadroom {
  vcpu: FillUpHeadroomValue;
  cpuDemand: FillUpHeadroomValue;
  memory: FillUpHeadroomValue;
}

export interface FillUpGuardrailHeadroom {
  scenarioId: string;
  scenario: FillUpScenarioKind;
  hardLimit: boolean;
  metricKey: "vcpu-per-core" | "cpu-demand" | "total-ram-assigned" | "high-cpu-site" | "high-ram-assigned";
  label: string;
  workloadScope: "all" | "high";
  available: number | null;
  unit: "vCPU" | "MHz" | "MiB";
  currentStatus: CapacityStatus;
}

export interface FillUpProfileRecommendation {
  profile: FillUpWorkloadProfile;
  maxAdditionalVms: number | null;
  /** Nur Normalbetrieb – zur transparenten Einordnung gegenüber N-1. */
  normalOnlyMaxAdditionalVms: number | null;
  /** Derselbe Lauf mit reinem P95-Ansatz; macht den Effekt des Faktors sichtbar. */
  peakOnlyMaxAdditionalVms: number | null;
  /** Tatsächlich angesetzter CPU-Demand je zusätzlicher VM in MHz. */
  appliedCpuDemandMHz: number;
  limitingGuardrail: FillUpGuardrailHeadroom | null;
  nextGuardrails: FillUpGuardrailHeadroom[];
}

export interface FillUpWorkloadMixRecommendation {
  mix: FillUpWorkloadMix;
  maxAdditionalVms: number | null;
  normalOnlyMaxAdditionalVms: number | null;
  /** Dieselbe Mischung mit reinem P95-Ansatz; Vergleichsbasis für den Faktor. */
  peakOnlyMaxAdditionalVms: number | null;
  /** Mit dem HIGH-Anteil gewichteter, angesetzter CPU-Demand je zusätzlicher VM in MHz. */
  appliedCpuDemandPerVmMHz: number | null;
  highVmCount: number | null;
  stdVmCount: number | null;
  /** Geringerer Verlust bevorzugt größere, N-1-robustere Cluster bei gleicher VM-Zahl. */
  relativeN1LossPct: number | null;
  limitingGuardrail: FillUpGuardrailHeadroom | null;
  nextGuardrails: FillUpGuardrailHeadroom[];
}

/** Reines, UI- und IndexedDB-unabhängiges Ergebnis der Fill-Up-Mengenkalkulation. */
export interface FillUpRecommendationAnalysis {
  independentHeadroom: FillUpIndependentHeadroom;
  guardrails: FillUpGuardrailHeadroom[];
  profileRecommendations: FillUpProfileRecommendation[];
  workloadMixRecommendation: FillUpWorkloadMixRecommendation | null;
  warnings: string[];
}

export interface FillUpClusterRecommendationRankInput {
  clusterKey: string;
  clusterName: string;
  recommendation: FillUpWorkloadMixRecommendation;
}

/** Unveränderliches, kompaktes Ergebnis eines lokalen Fill-Up-Laufs. */
export interface FillUpAnalysisRunClusterResult {
  clusterKey: string;
  clusterName: string;
  vcenterId: VCenterId;
  policy: CapacityPolicy;
  normalStatus: CapacityStatus;
  n1Status: CapacityStatus;
  n2Status: CapacityStatus | null;
  siteFailoverStatus: CapacityStatus;
  mixAdditionalVms: number | null;
  independentHeadroom: FillUpIndependentHeadroom;
  limitingMetric: string | null;
  warnings: string[];
}

export interface FillUpAnalysisRun {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  calculationVersion: 1;
  importId: string;
  importFileSetChecksum: string;
  rvtoolsSnapshotIds: string[];
  includeN2: boolean;
  workloadProfiles: FillUpWorkloadProfile[];
  workloadMix: FillUpWorkloadMix | null;
  /**
   * Gleichzeitigkeitsfaktor des Laufs in Prozent. Fehlt der Wert, stammt der Run
   * aus einem Stand vor der Einführung und wurde mit reinem P95 gerechnet.
   */
  cpuDemandConcurrencyPct?: number;
  results: FillUpAnalysisRunClusterResult[];
}

export interface VropsTimeSeriesMetricSummary {
  expectedSlots: number;
  presentSlots: number;
  missingSlots: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
}

export interface VropsTimeSeriesSummary {
  importId: string;
  objectKey: string;
  objectType: VropsTimeSeriesObjectType;
  metricStats: Partial<Record<VropsTimeSeriesMetricKey, VropsTimeSeriesMetricSummary>>;
}

/** Kompakter rechteckiger Block, zeilenweise Object × Hour; numerische Reihen sind Float32-ArrayBuffers. */
export interface VropsTimeSeriesChunk {
  importId: string;
  objectType: VropsTimeSeriesObjectType;
  chunkKey: string;
  clusterKey: string | null;
  startUtc: number;
  slotCount: number;
  objectKeys: string[];
  metricValues: Partial<Record<VropsTimeSeriesMetricKey, ArrayBuffer>>;
  maintenanceStates?: Array<string | null>;
  maintenanceDerived?: ArrayBuffer;
}

export interface VropsTimeSeriesWorkerResult {
  parsedFiles: VropsTimeSeriesParseResult[];
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
  /** ESXi-Hostnamen (aus der vDatastore-Spalte "Hosts"), die diesen Datastore verbunden haben. */
  hostNames: string[];
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
  excludeDummyVms: boolean;
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

/** Lokal gespeicherte Spaltenauswahl des Export Studios. */
export type ExportStudioSource = "vms" | "hosts" | "clusters" | "fill-up";

export interface ExportStudioTemplate {
  id: string;
  name: string;
  source: ExportStudioSource;
  columnIds: string[];
  pseudonymize: boolean;
  createdAt: string;
  updatedAt: string;
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
  exportStudioTemplates?: ExportStudioTemplate[];
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
