import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type {
  SnapshotMeta,
  SheetRow,
  RawSheetBlob,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  AnalysisMetric,
  UiState,
  TechInfoImportMeta,
  TechInfoRow,
  TechInfoLatest,
  TechInfoClientImportMeta,
  TechInfoClientRow,
  TechInfoClientLatest,
  CdpImportMeta,
  CdpRow,
  CdpLatest,
  IpamImportMeta,
  IpamRow,
  IpamLatest,
  EramonIfaceImportMeta,
  EramonIfaceRow,
  EramonIfaceLatest,
  EramonL2ImportMeta,
  EramonL2Row,
  EramonL2Latest,
  MaintenanceSettings,
  MaintenanceClusterAssignment,
  MaintenanceWindowDefinition,
  Scenario,
  VCenterGroup,
} from "@/domain/models/types";
import { isTechInfoNewerOrEqual, mapTechInfoDisplayFields, mapTechInfoClientDisplayFields, mapCdpDisplayFields, mapIpamDisplayFields, mapEramonIfaceDisplayFields, mapEramonL2DisplayFields, toStr } from "@/lib/xlsx/parseHelpers";
import { gunzipJson } from "@/lib/compression";
import { assertWeeklySlots, normalizeMaintenanceAbbreviation } from "@/lib/maintenanceWindows";

/* ---------- schema ---------- */
interface RVToolsDBSchema extends DBSchema {
  snapshots: {
    key: string;
    value: SnapshotMeta;
    indexes: { vcenterId: string; exportTs: string; fileChecksum: string };
  };
  rawSheetBlobs: {
    key: [string, string];
    // Ein gzip-komprimierter Blob pro Snapshot+Sheet (ab v19) statt einer Zeile pro Record —
    // siehe docs/superpowers/specs/2026-07-17-rawsheet-compressed-blobs-design.md.
    value: RawSheetBlob;
    indexes: { snapshotId: string };
  };
  entities_vm: { key: string; value: NormalizedVm; indexes: { snapshotId: string } };
  entities_host: { key: string; value: NormalizedHost; indexes: { snapshotId: string } };
  entities_cluster: { key: string; value: NormalizedCluster; indexes: { snapshotId: string } };
  entities_datastore: { key: string; value: NormalizedDatastore; indexes: { snapshotId: string } };
  entities_snapshot: { key: number; value: NormalizedSnapshot & { id?: number }; indexes: { snapshotId: string } };
  entities_health: { key: number; value: NormalizedHealth & { id?: number }; indexes: { snapshotId: string } };
  metrics_cache: { key: [string, string]; value: AnalysisMetric; indexes: { snapshotId: string } };
  ui_state: { key: string; value: UiState };
  techinfo_imports: {
    key: string;
    value: TechInfoImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  techinfo_rows: {
    key: [string, number];
    value: TechInfoRow;
    indexes: { techInfoImportId: string; vmNameNorm: string };
  };
  techinfo_latest: {
    key: string;
    value: TechInfoLatest;
    indexes: { importedAt: string };
  };
  techinfo_client_imports: {
    key: string;
    value: TechInfoClientImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  techinfo_client_rows: {
    key: [string, number];
    value: TechInfoClientRow;
    indexes: { techInfoClientImportId: string; clientNameNorm: string };
  };
  techinfo_client_latest: {
    key: string;
    value: TechInfoClientLatest;
    indexes: { importedAt: string };
  };
  cdp_imports: {
    key: string;
    value: CdpImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  cdp_rows: {
    key: [string, number];
    value: CdpRow;
    indexes: { cdpImportId: string; hostAdapterKey: string };
  };
  cdp_latest: {
    key: string;
    value: CdpLatest;
    indexes: { hostNorm: string };
  };
  ipam_imports: {
    key: string;
    value: IpamImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  ipam_rows: {
    key: [string, number];
    value: IpamRow;
    indexes: { ipamImportId: string; ipAddress: string };
  };
  ipam_latest: {
    key: string;
    value: IpamLatest;
    indexes: { ipAddress: string };
  };
  eramon_iface_imports: {
    key: string;
    value: EramonIfaceImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  eramon_iface_rows: {
    key: [string, number];
    value: EramonIfaceRow;
    indexes: { ifaceImportId: string; switchPortKey: string };
  };
  eramon_iface_latest: {
    key: string;
    value: EramonIfaceLatest;
    indexes: { switchNorm: string };
  };
  eramon_l2_imports: {
    key: string;
    value: EramonL2ImportMeta;
    indexes: { fileChecksum: string; importedAt: string };
  };
  eramon_l2_rows: {
    key: [string, number];
    value: EramonL2Row;
    indexes: { l2ImportId: string; l2EntryKey: string };
  };
  eramon_l2_latest: {
    key: string;
    value: EramonL2Latest;
    indexes: { switchNorm: string };
  };
  maintenance_settings: {
    key: string;
    value: MaintenanceSettings;
  };
  maintenance_cluster_assignments: {
    key: [string, string];
    value: MaintenanceClusterAssignment;
    indexes: { vcenterId: string; clusterName: string };
  };
  maintenance_windows: {
    key: string;
    value: MaintenanceWindowDefinition;
    indexes: { normalizedAbbreviation: string; updatedAt: string };
  };
  scenarios: {
    key: string;
    value: Scenario;
    indexes: { updatedAt: string };
  };
  vcenter_groups: {
    key: string;
    value: VCenterGroup;
    indexes: { updatedAt: string };
  };
}

export type StoreName = "snapshots" | "rawSheetBlobs" | "entities_vm" | "entities_host"
  | "entities_cluster" | "entities_datastore" | "entities_snapshot"
  | "entities_health" | "metrics_cache" | "ui_state" | "techinfo_imports"
  | "techinfo_rows" | "techinfo_latest"
  | "techinfo_client_imports" | "techinfo_client_rows" | "techinfo_client_latest"
  | "cdp_imports" | "cdp_rows" | "cdp_latest"
  | "ipam_imports" | "ipam_rows" | "ipam_latest"
  | "eramon_iface_imports" | "eramon_iface_rows" | "eramon_iface_latest"
  | "eramon_l2_imports" | "eramon_l2_rows" | "eramon_l2_latest"
  | "maintenance_settings"
  | "maintenance_cluster_assignments" | "maintenance_windows" | "scenarios" | "vcenter_groups";
type SnapshotScopedStoreName = "rawSheetBlobs" | "entities_vm" | "entities_host" | "entities_cluster"
  | "entities_datastore" | "entities_snapshot" | "entities_health" | "metrics_cache";

const DB_NAME = "rvtools-analyzer";
const DB_VERSION = 25;
const ALL_STORES: StoreName[] = [
  "snapshots", "rawSheetBlobs", "entities_vm", "entities_host",
  "entities_cluster", "entities_datastore", "entities_snapshot",
  "entities_health", "metrics_cache", "ui_state",
  "techinfo_imports", "techinfo_rows", "techinfo_latest",
  "techinfo_client_imports", "techinfo_client_rows", "techinfo_client_latest",
  "cdp_imports", "cdp_rows", "cdp_latest",
  "ipam_imports", "ipam_rows", "ipam_latest",
  "eramon_iface_imports", "eramon_iface_rows", "eramon_iface_latest",
  "eramon_l2_imports", "eramon_l2_rows", "eramon_l2_latest",
  "maintenance_settings", "maintenance_cluster_assignments", "maintenance_windows", "scenarios", "vcenter_groups",
];

let dbPromise: Promise<IDBPDatabase<RVToolsDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<RVToolsDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RVToolsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // Clean slate migration from old Dexie or older idb versions
        if (oldVersion < 12) {
          const existing = Array.from(db.objectStoreNames);
          for (const name of existing) db.deleteObjectStore(name);
        }

        // v19: rawSheets/rawSheetHeaders (eine Zeile pro Record) weichen komprimierten
        // Sheet-Blobs (rawSheetBlobs, ein Record pro Snapshot+Sheet). Migrationscode lohnt
        // sich für dieses interne Tool nicht — bestehende RVTools-Snapshots werden geleert,
        // Tech-Info/CDP/Wartung/Szenarien bleiben erhalten. Nutzer importieren neu.
        if (oldVersion > 0 && oldVersion < 19) {
          const storesToClear = [
            "snapshots", "entities_vm", "entities_host", "entities_cluster",
            "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
          ] as const;
          for (const storeName of storesToClear) {
            if (db.objectStoreNames.contains(storeName)) {
              transaction.objectStore(storeName).clear();
            }
          }
          // Legacy-Stores existieren nicht mehr im aktuellen Schema-Typ, daher `any`-Cast für
          // deleteObjectStore/contains — zur Laufzeit sind sie in älteren DBs vorhanden.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- s.o.
          const anyDb = db as any;
          if (anyDb.objectStoreNames.contains("rawSheets")) anyDb.deleteObjectStore("rawSheets");
          if (anyDb.objectStoreNames.contains("rawSheetHeaders")) anyDb.deleteObjectStore("rawSheetHeaders");
        }

        if (!db.objectStoreNames.contains("snapshots")) {
          const snap = db.createObjectStore("snapshots", { keyPath: "snapshotId" });
          snap.createIndex("vcenterId", "vcenterId");
          snap.createIndex("exportTs", "exportTs");
          snap.createIndex("fileChecksum", "fileChecksum");
        }
        if (!db.objectStoreNames.contains("rawSheetBlobs")) {
          const blobs = db.createObjectStore("rawSheetBlobs", { keyPath: ["snapshotId", "sheetName"] });
          blobs.createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_vm")) {
          db.createObjectStore("entities_vm", { keyPath: "vmKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_host")) {
          db.createObjectStore("entities_host", { keyPath: "hostKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_cluster")) {
          db.createObjectStore("entities_cluster", { keyPath: "clusterKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_datastore")) {
          db.createObjectStore("entities_datastore", { keyPath: "dsKey" }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_snapshot")) {
          db.createObjectStore("entities_snapshot", { keyPath: "id", autoIncrement: true }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("entities_health")) {
          db.createObjectStore("entities_health", { keyPath: "id", autoIncrement: true }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("metrics_cache")) {
          db.createObjectStore("metrics_cache", { keyPath: ["snapshotId", "id"] }).createIndex("snapshotId", "snapshotId");
        }
        if (!db.objectStoreNames.contains("ui_state")) {
          db.createObjectStore("ui_state", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("techinfo_imports")) {
          const imports = db.createObjectStore("techinfo_imports", { keyPath: "techInfoImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_rows")) {
          const rows = db.createObjectStore("techinfo_rows", { keyPath: ["techInfoImportId", "rowIndex"] });
          rows.createIndex("techInfoImportId", "techInfoImportId");
          rows.createIndex("vmNameNorm", "vmNameNorm");
        }
        if (!db.objectStoreNames.contains("techinfo_latest")) {
          const latest = db.createObjectStore("techinfo_latest", { keyPath: "vmNameNorm" });
          latest.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_client_imports")) {
          const imports = db.createObjectStore("techinfo_client_imports", { keyPath: "techInfoClientImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("techinfo_client_rows")) {
          const rows = db.createObjectStore("techinfo_client_rows", { keyPath: ["techInfoClientImportId", "rowIndex"] });
          rows.createIndex("techInfoClientImportId", "techInfoClientImportId");
          rows.createIndex("clientNameNorm", "clientNameNorm");
        }
        if (!db.objectStoreNames.contains("techinfo_client_latest")) {
          const latest = db.createObjectStore("techinfo_client_latest", { keyPath: "clientNameNorm" });
          latest.createIndex("importedAt", "importedAt");
        }
        // v18: CDP-Netzwerkdaten (CSV-Import) — Muster wie Tech-Info.
        if (!db.objectStoreNames.contains("cdp_imports")) {
          const imports = db.createObjectStore("cdp_imports", { keyPath: "cdpImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("cdp_rows")) {
          const rows = db.createObjectStore("cdp_rows", { keyPath: ["cdpImportId", "rowIndex"] });
          rows.createIndex("cdpImportId", "cdpImportId");
          rows.createIndex("hostAdapterKey", "hostAdapterKey");
        }
        if (!db.objectStoreNames.contains("cdp_latest")) {
          const latest = db.createObjectStore("cdp_latest", { keyPath: "hostAdapterKey" });
          latest.createIndex("hostNorm", "hostNorm");
        }
        // v21: IPAM-Netzwerkdaten (CSV-Import) — Muster wie CDP.
        if (!db.objectStoreNames.contains("ipam_imports")) {
          const imports = db.createObjectStore("ipam_imports", { keyPath: "ipamImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("ipam_rows")) {
          const rows = db.createObjectStore("ipam_rows", { keyPath: ["ipamImportId", "rowIndex"] });
          rows.createIndex("ipamImportId", "ipamImportId");
          rows.createIndex("ipAddress", "ipAddress");
        }
        if (!db.objectStoreNames.contains("ipam_latest")) {
          const latest = db.createObjectStore("ipam_latest", { keyPath: "ipAddress" });
          latest.createIndex("ipAddress", "ipAddress");
        }
        // v24: Eramon-Netzwerkdaten (CSV-Import) — Muster wie CDP.
        if (!db.objectStoreNames.contains("eramon_iface_imports")) {
          const imports = db.createObjectStore("eramon_iface_imports", { keyPath: "ifaceImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("eramon_iface_rows")) {
          const rows = db.createObjectStore("eramon_iface_rows", { keyPath: ["ifaceImportId", "rowIndex"] });
          rows.createIndex("ifaceImportId", "ifaceImportId");
          rows.createIndex("switchPortKey", "switchPortKey");
        }
        if (!db.objectStoreNames.contains("eramon_iface_latest")) {
          const latest = db.createObjectStore("eramon_iface_latest", { keyPath: "switchPortKey" });
          latest.createIndex("switchNorm", "switchNorm");
        }
        if (!db.objectStoreNames.contains("eramon_l2_imports")) {
          const imports = db.createObjectStore("eramon_l2_imports", { keyPath: "l2ImportId" });
          imports.createIndex("fileChecksum", "fileChecksum");
          imports.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains("eramon_l2_rows")) {
          const rows = db.createObjectStore("eramon_l2_rows", { keyPath: ["l2ImportId", "rowIndex"] });
          rows.createIndex("l2ImportId", "l2ImportId");
          rows.createIndex("l2EntryKey", "l2EntryKey");
        }
        if (!db.objectStoreNames.contains("eramon_l2_latest")) {
          const latest = db.createObjectStore("eramon_l2_latest", { keyPath: "l2EntryKey" });
          latest.createIndex("switchNorm", "switchNorm");
        }
        if (!db.objectStoreNames.contains("maintenance_settings")) {
          db.createObjectStore("maintenance_settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("maintenance_cluster_assignments")) {
          const assignments = db.createObjectStore("maintenance_cluster_assignments", { keyPath: ["vcenterId", "clusterName"] });
          assignments.createIndex("vcenterId", "vcenterId");
          assignments.createIndex("clusterName", "clusterName");
        }
        if (!db.objectStoreNames.contains("maintenance_windows")) {
          const windows = db.createObjectStore("maintenance_windows", { keyPath: "id" });
          windows.createIndex("normalizedAbbreviation", "normalizedAbbreviation", { unique: true });
          windows.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("scenarios")) {
          const scenarios = db.createObjectStore("scenarios", { keyPath: "id" });
          scenarios.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("vcenter_groups")) {
          const groups = db.createObjectStore("vcenter_groups", { keyPath: "id" });
          groups.createIndex("updatedAt", "updatedAt");
        }
        // v25: Cisco-TXT-Import wird vollständig durch Eramon-Exporte ersetzt.
        if (oldVersion < 25) {
          for (const storeName of ["switch_imports", "switch_rows", "switch_latest"]) {
            if (db.objectStoreNames.contains(storeName)) db.deleteObjectStore(storeName);
          }
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- query helpers ---------- */

export async function getSnapshots(): Promise<SnapshotMeta[]> {
  const db = await getDb();
  return db.getAll("snapshots");
}

export async function getSnapshotsByChecksum(checksum: string): Promise<SnapshotMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("snapshots", "fileChecksum", checksum);
}

export async function getSnapshotsByVcenterId(vcenterId: string): Promise<SnapshotMeta[]> {
  const db = await getDb();
  return db.getAllFromIndex("snapshots", "vcenterId", vcenterId);
}

export async function putSnapshot(snap: SnapshotMeta): Promise<void> {
  const db = await getDb();
  await db.put("snapshots", snap);
}

export async function getTechInfoImportByChecksum(checksum: string): Promise<TechInfoImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("techinfo_imports", "fileChecksum", checksum);
}

export async function getTechInfoImports(): Promise<TechInfoImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("techinfo_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putTechInfoImport(meta: TechInfoImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("techinfo_imports", meta);
}

export async function getTechInfoClientImportByChecksum(checksum: string): Promise<TechInfoClientImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("techinfo_client_imports", "fileChecksum", checksum);
}

export async function getTechInfoClientImports(): Promise<TechInfoClientImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("techinfo_client_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putTechInfoClientImport(meta: TechInfoClientImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("techinfo_client_imports", meta);
}

export async function getUiState(id: string): Promise<UiState | undefined> {
  const db = await getDb();
  return db.get("ui_state", id);
}

export async function putUiState(state: UiState): Promise<void> {
  const db = await getDb();
  await db.put("ui_state", state);
}

export async function getScenarios(): Promise<Scenario[]> {
  const db = await getDb();
  const all = await db.getAll("scenarios");
  const clusters = await db.getAll("entities_cluster");
  const clusterKeysByLegacyTarget = new Map<string, Set<string>>();
  const clusterKeysByName = new Map<string, Set<string>>();
  for (const cluster of clusters) {
    const legacyTarget = `${cluster.name}::${cluster.vcenterId}`;
    const legacyCandidates = clusterKeysByLegacyTarget.get(legacyTarget) ?? new Set<string>();
    legacyCandidates.add(cluster.clusterKey);
    clusterKeysByLegacyTarget.set(legacyTarget, legacyCandidates);
    const nameCandidates = clusterKeysByName.get(cluster.name) ?? new Set<string>();
    nameCandidates.add(cluster.clusterKey);
    clusterKeysByName.set(cluster.name, nameCandidates);
  }

  const migrated = all.map((scenario) => {
    let changed = false;
    const groups = scenario.groups.map((group) => {
      const candidates = clusterKeysByLegacyTarget.get(group.targetClusterKey)
        ?? clusterKeysByName.get(group.targetClusterKey);
      if (!candidates || candidates.size !== 1) return group;
      changed = true;
      return { ...group, targetClusterKey: [...candidates][0] };
    });
    return changed ? { ...scenario, groups } : scenario;
  });
  await Promise.all(migrated.filter((scenario, index) => scenario !== all[index]).map((scenario) => db.put("scenarios", scenario)));

  return migrated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putScenario(scenario: Scenario): Promise<void> {
  const db = await getDb();
  await db.put("scenarios", scenario);
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("scenarios", id);
}

export async function getVcenterGroups(): Promise<VCenterGroup[]> {
  const db = await getDb();
  const all = await db.getAll("vcenter_groups");
  return all.sort((a, b) => a.name.localeCompare(b.name, "de-DE", { numeric: true, sensitivity: "base" }));
}

export async function putVcenterGroup(group: VCenterGroup): Promise<void> {
  const db = await getDb();
  await db.put("vcenter_groups", group);
}

export async function deleteVcenterGroup(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("vcenter_groups", id);
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings | undefined> {
  const db = await getDb();
  return db.get("maintenance_settings", "default");
}

export async function putMaintenanceSettings(settings: MaintenanceSettings): Promise<void> {
  const db = await getDb();
  await db.put("maintenance_settings", settings);
}

export async function getMaintenanceAssignments(): Promise<MaintenanceClusterAssignment[]> {
  const db = await getDb();
  return db.getAll("maintenance_cluster_assignments");
}

export async function getMaintenanceAssignmentsByVcenterIds(vcenterIds: string[]): Promise<MaintenanceClusterAssignment[]> {
  if (vcenterIds.length === 0) return [];
  const db = await getDb();
  const uniqueIds = [...new Set(vcenterIds)];
  const perVcenter = await Promise.all(
    uniqueIds.map((vcenterId) => db.getAllFromIndex("maintenance_cluster_assignments", "vcenterId", vcenterId)),
  );
  return perVcenter.flat();
}

export async function putMaintenanceAssignment(assignment: MaintenanceClusterAssignment): Promise<void> {
  const db = await getDb();
  await db.put("maintenance_cluster_assignments", {
    ...assignment,
    id: assignment.id ?? `${assignment.vcenterId}::${assignment.clusterName}`,
  });
}

const VALID_MAINTENANCE_WINDOW_HANDLINGS = new Set<MaintenanceWindowDefinition["handling"]>([
  "regular",
  "always",
  "approval-required",
  "external",
]);

function isValidCalendarOccurrence(value: unknown): boolean {
  return value === "last" || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
}

function cloneValidatedMaintenanceWindow(value: MaintenanceWindowDefinition): MaintenanceWindowDefinition {
  if (!value || typeof value !== "object") {
    throw new Error("Ungültiges Wartungsfenster.");
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("Die ID des Wartungsfensters darf nicht leer sein.");
  }
  if (typeof value.abbreviation !== "string" || !value.abbreviation.trim()) {
    throw new Error("Die Abkürzung darf nicht leer sein.");
  }
  if (typeof value.description !== "string") {
    throw new Error("Die Beschreibung des Wartungsfensters ist ungültig.");
  }
  if (!VALID_MAINTENANCE_WINDOW_HANDLINGS.has(value.handling)) {
    throw new Error("Die Behandlung des Wartungsfensters ist ungültig.");
  }
  assertWeeklySlots(value.weeklySlots);
  if (!Array.isArray(value.calendarRules) || value.calendarRules.some((rule) =>
    !rule
    || !Number.isInteger(rule.weekday)
    || rule.weekday < 0
    || rule.weekday > 6
    || !Array.isArray(rule.occurrences)
    || rule.occurrences.some((occurrence) => !isValidCalendarOccurrence(occurrence)))) {
    throw new Error("Die Kalenderregeln des Wartungsfensters sind ungültig.");
  }
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()
    || typeof value.updatedAt !== "string" || !value.updatedAt.trim()) {
    throw new Error("Die Zeitstempel des Wartungsfensters sind ungültig.");
  }

  return {
    id: value.id,
    abbreviation: value.abbreviation,
    normalizedAbbreviation: normalizeMaintenanceAbbreviation(value.abbreviation),
    description: value.description,
    handling: value.handling,
    weeklySlots: value.weeklySlots.map((day) => [...day]) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: value.calendarRules.map((rule) => ({
      weekday: rule.weekday,
      occurrences: [...rule.occurrences],
    })),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function mapMaintenanceWindowConstraintError(error: unknown): never {
  if (error instanceof DOMException && error.name === "ConstraintError") {
    throw new Error("Abkürzung ist bereits vorhanden.");
  }
  if (typeof error === "object" && error !== null && "name" in error && error.name === "ConstraintError") {
    throw new Error("Abkürzung ist bereits vorhanden.");
  }
  throw error;
}

export async function getMaintenanceWindows(): Promise<MaintenanceWindowDefinition[]> {
  const db = await getDb();
  const values = await db.getAll("maintenance_windows");
  return values.sort((left, right) => left.abbreviation.localeCompare(
    right.abbreviation,
    "de-DE",
    { numeric: true, sensitivity: "base" },
  ));
}

export async function putMaintenanceWindow(value: MaintenanceWindowDefinition): Promise<void> {
  const definition = cloneValidatedMaintenanceWindow(value);
  const db = await getDb();
  try {
    await db.put("maintenance_windows", definition);
  } catch (error) {
    mapMaintenanceWindowConstraintError(error);
  }
}

export async function deleteMaintenanceWindow(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("maintenance_windows", id);
}

/** Validiert und klont eine Importmenge ohne IndexedDB-Mutation. */
export function validateMaintenanceWindowUpsertInput(
  values: MaintenanceWindowDefinition[],
): MaintenanceWindowDefinition[] {
  const definitions = values.map(cloneValidatedMaintenanceWindow);
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`ID ist mehrfach enthalten: ${definition.id}.`);
    }
    ids.add(definition.id);
  }
  const normalizedAbbreviations = new Set<string>();
  for (const definition of definitions) {
    if (normalizedAbbreviations.has(definition.normalizedAbbreviation)) {
      throw new Error(`Abkürzung ist mehrfach enthalten: ${definition.abbreviation}.`);
    }
    normalizedAbbreviations.add(definition.normalizedAbbreviation);
  }
  return definitions;
}

export async function upsertMaintenanceWindows(values: MaintenanceWindowDefinition[]): Promise<void> {
  const definitions = validateMaintenanceWindowUpsertInput(values);

  const db = await getDb();
  const transaction = db.transaction("maintenance_windows", "readwrite");
  try {
    await Promise.all(definitions.map(async (definition) => {
      const existing = await transaction.store.index("normalizedAbbreviation").get(
        definition.normalizedAbbreviation,
      );
      await transaction.store.put(existing
        ? { ...definition, id: existing.id, createdAt: existing.createdAt }
        : definition);
    }));
    await transaction.done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // Die fehlgeschlagene IndexedDB-Anfrage kann die Transaktion bereits abgebrochen haben.
    }
    mapMaintenanceWindowConstraintError(error);
  }
}

export async function getBySnapshotIds<T>(
  store: "entities_vm" | "entities_host" | "entities_cluster" | "entities_datastore" | "entities_snapshot" | "entities_health",
  snapshotIds: string[],
): Promise<T[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map((sid) => db.getAllFromIndex(store, "snapshotId", sid)),
  );
  return perId.flat() as unknown as T[];
}

/** Bildet die entkomprimierten Werte-Zeilen eines Blobs auf die hydratisierte {@link SheetRow}-Form ab. */
function hydrateSheetRows(
  snapshotId: string,
  sheetName: string,
  headers: readonly string[],
  values: readonly (string | number | boolean | null)[][],
): SheetRow[] {
  return values.map((rowValues, rowIndex) => {
    const data: SheetRow["data"] = {};
    for (let i = 0; i < headers.length; i++) {
      data[headers[i]] = rowValues[i] ?? null;
    }
    return { snapshotId, sheetName, rowIndex, data };
  });
}

export async function putRawSheetBlob(blob: RawSheetBlob): Promise<void> {
  const db = await getDb();
  await db.put("rawSheetBlobs", blob);
}

/** Get raw sheet rows for specific snapshot+sheet combinations */
export async function getRawSheetRows(
  snapshotIds: string[],
  sheetName: string,
): Promise<SheetRow[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const perId = await Promise.all(
    snapshotIds.map(async (sid) => {
      const blob = await db.get("rawSheetBlobs", [sid, sheetName]);
      if (!blob) return [];
      const values = await gunzipJson<(string | number | boolean | null)[][]>(blob.data);
      return hydrateSheetRows(sid, sheetName, blob.headers, values);
    }),
  );
  return perId.flat();
}

export async function getRawSheetFieldNames(
  snapshotIds: string[],
  sheetName: string,
): Promise<string[]> {
  if (snapshotIds.length === 0) return [];
  const db = await getDb();
  const keys = new Set<string>();

  await Promise.all(
    snapshotIds.map(async (sid) => {
      const blob = await db.get("rawSheetBlobs", [sid, sheetName]);
      if (!blob) return;
      for (const key of blob.headers) keys.add(key);
    }),
  );

  return [...keys].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }));
}

export async function getAllTechInfoLatest(): Promise<TechInfoLatest[]> {
  const db = await getDb();
  const values = await db.getAll("techinfo_latest");
  return Promise.all(values.map((value) => hydrateTechInfoLatest(db, value)));
}

export async function getTechInfoLatestByVmNames(vmNames: string[]): Promise<TechInfoLatest[]> {
  if (vmNames.length === 0) return [];
  const db = await getDb();
  const uniqueNorm = new Set<string>();
  for (const name of vmNames) {
    const normalized = name.trim().toLowerCase();
    if (normalized) uniqueNorm.add(normalized);
  }
  const values = await Promise.all([...uniqueNorm].map((vmNameNorm) => db.get("techinfo_latest", vmNameNorm)));
  const presentValues = values.filter((v): v is TechInfoLatest => Boolean(v));
  return Promise.all(presentValues.map((value) => hydrateTechInfoLatest(db, value)));
}

async function hydrateTechInfoLatest(
  db: IDBPDatabase<RVToolsDBSchema>,
  value: TechInfoLatest,
): Promise<TechInfoLatest> {
  if (value.serverType !== undefined) {
    return { ...value, serverType: value.serverType ?? null };
  }

  const rawRow = await db.get("techinfo_rows", [value.techInfoImportId, value.rowIndex]);
  return {
    ...value,
    serverType: toStr(rawRow?.rawData?.["Servertyp"]),
  };
}

export async function batchPut<S extends StoreName>(
  storeName: S,
  items: RVToolsDBSchema[S]["value"][],
  batchSize = 5000,
): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  const batches: RVToolsDBSchema[S]["value"][][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  await runSequential(batches, async (batch) => {
    const tx = db.transaction(storeName, "readwrite");
    for (const item of batch) {
      tx.store.put(item);
    }
    await tx.done;
  });
}

export async function batchPutTechInfoImports(items: TechInfoImportMeta[], batchSize = 1000): Promise<void> {
  await batchPut("techinfo_imports", items, batchSize);
}

export async function batchPutTechInfoRows(items: TechInfoRow[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_rows", items, batchSize);
}

export async function batchPutTechInfoLatest(items: TechInfoLatest[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_latest", items, batchSize);
}

export async function getAllTechInfoClientLatest(): Promise<TechInfoClientLatest[]> {
  const db = await getDb();
  return db.getAll("techinfo_client_latest");
}

export async function getTechInfoClientLatestByClientNames(clientNames: string[]): Promise<TechInfoClientLatest[]> {
  if (clientNames.length === 0) return [];
  const db = await getDb();
  const uniqueNorm = new Set<string>();
  for (const name of clientNames) {
    const normalized = name.trim().toLowerCase();
    if (normalized) uniqueNorm.add(normalized);
  }
  const values = await Promise.all([...uniqueNorm].map((clientNameNorm) => db.get("techinfo_client_latest", clientNameNorm)));
  return values.filter((v): v is TechInfoClientLatest => Boolean(v));
}

export async function batchPutTechInfoClientRows(items: TechInfoClientRow[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_client_rows", items, batchSize);
}

export async function batchPutTechInfoClientLatest(items: TechInfoClientLatest[], batchSize = 5000): Promise<void> {
  await batchPut("techinfo_client_latest", items, batchSize);
}

export async function getCdpImportByChecksum(checksum: string): Promise<CdpImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("cdp_imports", "fileChecksum", checksum);
}

export async function getCdpImports(): Promise<CdpImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("cdp_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putCdpImport(meta: CdpImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("cdp_imports", meta);
}

export async function batchPutCdpRows(items: CdpRow[], batchSize = 5000): Promise<void> {
  await batchPut("cdp_rows", items, batchSize);
}

export async function batchPutCdpLatest(items: CdpLatest[], batchSize = 5000): Promise<void> {
  await batchPut("cdp_latest", items, batchSize);
}

export async function getAllCdpLatest(): Promise<CdpLatest[]> {
  const db = await getDb();
  return db.getAll("cdp_latest");
}

export async function getCdpLatestByHostAdapterKeys(keys: string[]): Promise<CdpLatest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("cdp_latest", key)));
  return values.filter((v): v is CdpLatest => Boolean(v));
}

export async function getEramonIfaceImportByChecksum(checksum: string): Promise<EramonIfaceImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("eramon_iface_imports", "fileChecksum", checksum);
}

export async function getEramonIfaceImports(): Promise<EramonIfaceImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("eramon_iface_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putEramonIfaceImport(meta: EramonIfaceImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("eramon_iface_imports", meta);
}

export async function batchPutEramonIfaceRows(items: EramonIfaceRow[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_iface_rows", items, batchSize);
}

export async function batchPutEramonIfaceLatest(items: EramonIfaceLatest[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_iface_latest", items, batchSize);
}

export async function getAllEramonIfaceLatest(): Promise<EramonIfaceLatest[]> {
  const db = await getDb();
  return db.getAll("eramon_iface_latest");
}

export async function getEramonIfaceLatestByKeys(keys: string[]): Promise<EramonIfaceLatest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("eramon_iface_latest", key)));
  return values.filter((v): v is EramonIfaceLatest => Boolean(v));
}

export async function getEramonL2ImportByChecksum(checksum: string): Promise<EramonL2ImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("eramon_l2_imports", "fileChecksum", checksum);
}

export async function getEramonL2Imports(): Promise<EramonL2ImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("eramon_l2_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putEramonL2Import(meta: EramonL2ImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("eramon_l2_imports", meta);
}

export async function batchPutEramonL2Rows(items: EramonL2Row[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_l2_rows", items, batchSize);
}

export async function batchPutEramonL2Latest(items: EramonL2Latest[], batchSize = 5000): Promise<void> {
  await batchPut("eramon_l2_latest", items, batchSize);
}

export async function getAllEramonL2Latest(): Promise<EramonL2Latest[]> {
  const db = await getDb();
  return db.getAll("eramon_l2_latest");
}

export async function getEramonL2LatestByKeys(keys: string[]): Promise<EramonL2Latest[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(keys)].map((key) => db.get("eramon_l2_latest", key)));
  return values.filter((v): v is EramonL2Latest => Boolean(v));
}

export async function getIpamImportByChecksum(checksum: string): Promise<IpamImportMeta | undefined> {
  const db = await getDb();
  return db.getFromIndex("ipam_imports", "fileChecksum", checksum);
}

export async function getIpamImports(): Promise<IpamImportMeta[]> {
  const db = await getDb();
  const imports = await db.getAll("ipam_imports");
  return imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function putIpamImport(meta: IpamImportMeta): Promise<void> {
  const db = await getDb();
  await db.put("ipam_imports", meta);
}

export async function batchPutIpamRows(items: IpamRow[], batchSize = 5000): Promise<void> {
  await batchPut("ipam_rows", items, batchSize);
}

export async function batchPutIpamLatest(items: IpamLatest[], batchSize = 5000): Promise<void> {
  await batchPut("ipam_latest", items, batchSize);
}

export async function getAllIpamLatest(): Promise<IpamLatest[]> {
  const db = await getDb();
  return db.getAll("ipam_latest");
}

export async function getIpamLatestByIpAddresses(ips: string[]): Promise<IpamLatest[]> {
  if (ips.length === 0) return [];
  const db = await getDb();
  const values = await Promise.all([...new Set(ips)].map((ip) => db.get("ipam_latest", ip)));
  return values.filter((v): v is IpamLatest => Boolean(v));
}

/* ---------- diagnostics ---------- */

/**
 * Byte-Schätzung eines Store-Eintrags. `rawSheetBlobs` enthält ein `ArrayBuffer` in `data`,
 * das `JSON.stringify` nicht sinnvoll erfasst (ergibt `"{}"`) — dafür wird `byteLength` direkt
 * verwendet, was einen nahezu exakten statt geschätzten Wert liefert (der Aufschlag
 * `+ JSON.stringify(blob.headers).length + 64` für Header/Metadaten bleibt eine Näherung).
 */
function estimateEntryBytes(storeName: StoreName, value: unknown): number {
  if (storeName === "rawSheetBlobs") {
    const blob = value as RawSheetBlob;
    return blob.data.byteLength + JSON.stringify(blob.headers).length + 64;
  }
  return JSON.stringify(value).length;
}

export interface StoreDiagnostics {
  storeName: StoreName;
  count: number;
  /** Hochgerechnete Schätzung basierend auf einer Stichprobe — kein exakter Byte-Wert (Ausnahme: `rawSheetBlobs`, dort exakt). */
  estimatedSizeBytes: number;
}

export async function getStoreDiagnostics(sampleSize = 50): Promise<StoreDiagnostics[]> {
  const db = await getDb();
  const results: StoreDiagnostics[] = [];

  for (const storeName of ALL_STORES) {
    const count = await db.count(storeName);
    let estimatedSizeBytes = 0;

    if (count > 0) {
      const tx = db.transaction(storeName, "readonly");
      const sample: unknown[] = [];
      let cursor = await tx.store.openCursor();
      while (cursor && sample.length < sampleSize) {
        sample.push(cursor.value);
        cursor = await cursor.continue();
      }
      await tx.done;

      if (sample.length > 0) {
        const sampleBytes = sample.reduce<number>((sum, value) => sum + estimateEntryBytes(storeName, value), 0);
        const avgBytesPerEntry = sampleBytes / sample.length;
        estimatedSizeBytes = Math.round(avgBytesPerEntry * count);
      }
    }

    results.push({ storeName, count, estimatedSizeBytes });
  }

  return results;
}

export interface StorageEstimateResult {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
    return { supported: false, usageBytes: null, quotaBytes: null };
  }
  const estimate = await navigator.storage.estimate();
  return {
    supported: true,
    usageBytes: estimate.usage ?? null,
    quotaBytes: estimate.quota ?? null,
  };
}

const SIZE_SAMPLE_COUNT = 40;

/**
 * Hochgerechnete Größenschätzung pro Gruppe (z. B. Snapshot oder Tech-Info-Import):
 * Stichprobe der ersten Einträge × Gesamtanzahl im Index — kein exakter Byte-Wert.
 */
async function estimateSizeByIndex(
  db: IDBPDatabase<RVToolsDBSchema>,
  storeName: SnapshotScopedStoreName | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "ipam_rows" | "eramon_iface_rows" | "eramon_l2_rows",
  indexName: "snapshotId" | "techInfoImportId" | "techInfoClientImportId" | "cdpImportId" | "ipamImportId" | "ifaceImportId" | "l2ImportId",
  key: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Store/Index-Kombination ist zur Laufzeit gültig, idb-Typen können die Union nicht abbilden
  const anyDb = db as any;
  const count: number = await anyDb.countFromIndex(storeName, indexName, key);
  if (count === 0) return 0;
  const sample: unknown[] = await anyDb.getAllFromIndex(storeName, indexName, key, SIZE_SAMPLE_COUNT);
  if (sample.length === 0) return 0;
  const sampleBytes = sample.reduce<number>((sum, value) => sum + estimateEntryBytes(storeName, value), 0);
  return Math.round((sampleBytes / sample.length) * count);
}

/** Geschätzte IndexedDB-Größe je RVTools-Snapshot über alle snapshot-bezogenen Stores. */
export async function estimateSnapshotSizesBytes(snapshotIds: string[]): Promise<Record<string, number>> {
  if (snapshotIds.length === 0) return {};
  const db = await getDb();
  const scopedStores: SnapshotScopedStoreName[] = [
    "rawSheetBlobs", "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health", "metrics_cache",
  ];
  const entries = await Promise.all(snapshotIds.map(async (snapshotId) => {
    const perStore = await Promise.all(
      scopedStores.map((store) => estimateSizeByIndex(db, store, "snapshotId", snapshotId)),
    );
    return [snapshotId, perStore.reduce((sum, bytes) => sum + bytes, 0)] as const;
  }));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je Tech-Info-Import (Server). */
export async function estimateTechInfoImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "techinfo_rows", "techInfoImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je Tech-Info-Client-Import. */
export async function estimateTechInfoClientImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "techinfo_client_rows", "techInfoClientImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je CDP-Import. */
export async function estimateCdpImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "cdp_rows", "cdpImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

/** Geschätzte IndexedDB-Größe je IPAM-Import. */
export async function estimateIpamImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "ipam_rows", "ipamImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

export async function estimateEramonIfaceImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "eramon_iface_rows", "ifaceImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

export async function estimateEramonL2ImportSizesBytes(importIds: string[]): Promise<Record<string, number>> {
  if (importIds.length === 0) return {};
  const db = await getDb();
  const entries = await Promise.all(importIds.map(async (id) => [
    id,
    await estimateSizeByIndex(db, "eramon_l2_rows", "l2ImportId", id),
  ] as const));
  return Object.fromEntries(entries);
}

export interface SampleQueryTiming {
  store: "entities_vm";
  snapshotCount: number;
  durationMs: number;
  rowCount: number;
}

export async function timeSampleVmQuery(): Promise<SampleQueryTiming> {
  const snapshots = await getSnapshots();
  const snapshotIds = snapshots.map((s) => s.snapshotId);
  const start = performance.now();
  const rows = await getBySnapshotIds<unknown>("entities_vm", snapshotIds);
  const durationMs = Math.round(performance.now() - start);
  return { store: "entities_vm", snapshotCount: snapshotIds.length, durationMs, rowCount: rows.length };
}

/* ---------- delete helpers ---------- */

export interface DeleteProgress {
  step: string;
  percent: number;
  detail?: string;
}

export type DeleteProgressCallback = (progress: DeleteProgress) => void;

const DELETE_CHUNK_SIZE = 5000;

const STORE_DELETE_LABELS: Record<StoreName, string> = {
  snapshots: "Snapshot-Metadaten",
  rawSheetBlobs: "Rohdaten (Sheets)",
  entities_vm: "VMs",
  entities_host: "Hosts",
  entities_cluster: "Cluster",
  entities_datastore: "Datastores",
  entities_snapshot: "VM-Snapshots",
  entities_health: "Health-Einträge",
  metrics_cache: "Metrik-Cache",
  ui_state: "UI-Einstellungen",
  techinfo_imports: "Tech-Info Importe",
  techinfo_rows: "Tech-Info Zeilen",
  techinfo_latest: "Tech-Info Latest",
  techinfo_client_imports: "Tech-Info Client Importe",
  techinfo_client_rows: "Tech-Info Client Zeilen",
  techinfo_client_latest: "Tech-Info Client Latest",
  cdp_imports: "CDP Importe",
  cdp_rows: "CDP Zeilen",
  cdp_latest: "CDP Latest",
  ipam_imports: "IPAM Importe",
  ipam_rows: "IPAM Zeilen",
  ipam_latest: "IPAM Latest",
  eramon_iface_imports: "Eramon Switch-Port Importe",
  eramon_iface_rows: "Eramon Switch-Port Zeilen",
  eramon_iface_latest: "Eramon Switch-Port Latest",
  eramon_l2_imports: "Eramon MAC-Tabelle Importe",
  eramon_l2_rows: "Eramon MAC-Tabelle Zeilen",
  eramon_l2_latest: "Eramon MAC-Tabelle Latest",
  maintenance_settings: "Wartungseinstellungen",
  maintenance_cluster_assignments: "Cluster-Zuordnungen",
  maintenance_windows: "Wartungsfenster",
  scenarios: "Szenarien",
  vcenter_groups: "vCenter-Gruppen",
};

async function runSequential<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  if (index >= items.length) return;
  await task(items[index], index);
  await runSequential(items, task, index + 1);
}

/**
 * Löscht alle Einträge, deren Array-Primärschlüssel mit `prefix` beginnt, in Chunks.
 * Deutlich schneller als zeilenweises Cursor-Löschen: pro Chunk werden nur die Keys
 * gelesen und der Bereich mit einem einzigen delete(range) entfernt (~6× schneller
 * bei 60k+ Zeilen). `[prefix, []]` ist die exklusive Obergrenze, weil Arrays in der
 * IndexedDB-Sortierung hinter allen Strings und Zahlen liegen.
 */
async function deleteByKeyPrefix(
  storeName: "rawSheetBlobs" | "metrics_cache" | "techinfo_rows" | "techinfo_client_rows" | "cdp_rows" | "ipam_rows" | "eramon_iface_rows" | "eramon_l2_rows",
  prefix: string,
  onChunkDeleted?: (deletedCount: number) => void,
): Promise<void> {
  const db = await getDb();
  const fullRange = IDBKeyRange.bound([prefix], [prefix, []], false, true);
  for (;;) {
    const tx = db.transaction(storeName, "readwrite");
    const keys = await tx.store.getAllKeys(fullRange, DELETE_CHUNK_SIZE);
    if (keys.length > 0) {
      await tx.store.delete(IDBKeyRange.bound(keys[0], keys[keys.length - 1]));
    }
    await tx.done;
    if (keys.length > 0) onChunkDeleted?.(keys.length);
    if (keys.length < DELETE_CHUNK_SIZE) return;
  }
}

/**
 * Löscht alle Einträge eines Stores, deren `snapshotId`-Index auf `snapshotId` zeigt,
 * in Chunks über die Primärschlüssel (für Stores ohne snapshotId-Präfix im Key).
 */
async function deleteBySnapshotIdIndex(
  storeName: Exclude<SnapshotScopedStoreName, "rawSheetBlobs" | "metrics_cache">,
  snapshotId: string,
  onChunkDeleted?: (deletedCount: number) => void,
): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex(storeName, "snapshotId", snapshotId) as Array<string | number>;
  const chunks: Array<Array<string | number>> = [];
  for (let i = 0; i < keys.length; i += DELETE_CHUNK_SIZE) {
    chunks.push(keys.slice(i, i + DELETE_CHUNK_SIZE));
  }
  await runSequential(chunks, async (chunk) => {
    const tx = db.transaction(storeName, "readwrite");
    for (const key of chunk) tx.store.delete(key);
    await tx.done;
    onChunkDeleted?.(chunk.length);
  });
}

export async function deleteAllData(onProgress?: DeleteProgressCallback): Promise<void> {
  const db = await getDb();
  const counts = await Promise.all(ALL_STORES.map((s) => db.count(s)));
  const totalRows = counts.reduce((sum, c) => sum + c, 0);
  let clearedRows = 0;

  await runSequential(ALL_STORES, async (storeName, i) => {
    onProgress?.({
      step: "Alle Daten löschen",
      percent: totalRows === 0 ? 0 : Math.min(99, Math.round((clearedRows / totalRows) * 100)),
      detail: `${STORE_DELETE_LABELS[storeName]} (${counts[i].toLocaleString("de-DE")} Einträge)`,
    });
    await db.clear(storeName);
    clearedRows += counts[i];
  });
  onProgress?.({ step: "Alle Daten löschen", percent: 100, detail: "Abgeschlossen" });
}

export async function deleteSnapshot(snapshotId: string, onProgress?: DeleteProgressCallback): Promise<void> {
  const db = await getDb();
  const prefixStores = ["rawSheetBlobs", "metrics_cache"] as const;
  const indexStores = [
    "entities_vm", "entities_host", "entities_cluster",
    "entities_datastore", "entities_snapshot", "entities_health",
  ] as const;
  const scopedStores: readonly SnapshotScopedStoreName[] = [...prefixStores, ...indexStores];

  const counts = await Promise.all(
    scopedStores.map((store) => db.countFromIndex(store, "snapshotId", snapshotId)),
  );
  const totalRows = counts.reduce((sum, c) => sum + c, 0);
  let deletedRows = 0;
  const report = (detail: string) => {
    onProgress?.({
      step: "Snapshot löschen",
      percent: totalRows === 0 ? 99 : Math.min(99, Math.round((deletedRows / totalRows) * 100)),
      detail,
    });
  };
  report(`${totalRows.toLocaleString("de-DE")} Einträge gefunden`);

  await runSequential(prefixStores, async (store) => {
    await deleteByKeyPrefix(store, snapshotId, (n) => {
      deletedRows += n;
      report(STORE_DELETE_LABELS[store]);
    });
  });
  await runSequential(indexStores, async (store) => {
    await deleteBySnapshotIdIndex(store, snapshotId, (n) => {
      deletedRows += n;
      report(STORE_DELETE_LABELS[store]);
    });
  });

  // Metadaten zuletzt löschen: bricht der Vorgang ab, bleibt der Snapshot in der
  // Liste sichtbar und das Löschen kann erneut angestoßen werden.
  await db.delete("snapshots", snapshotId);
  onProgress?.({ step: "Snapshot löschen", percent: 100, detail: "Abgeschlossen" });
}

async function deleteTechInfoRowsByImportId(techInfoImportId: string): Promise<void> {
  await deleteByKeyPrefix("techinfo_rows", techInfoImportId);
}

function buildTechInfoLatestFromRow(row: TechInfoRow): TechInfoLatest {
  return {
    vmNameNorm: row.vmNameNorm,
    vmName: row.vmName,
    importedAt: row.importedAt,
    techInfoImportId: row.techInfoImportId,
    rowIndex: row.rowIndex,
    ...mapTechInfoDisplayFields(row.rawData),
  };
}

async function rebuildTechInfoLatestForVm(vmNameNorm: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_rows", "vmNameNorm", vmNameNorm);
  const latestRow = rows.reduce<TechInfoRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("techinfo_latest", vmNameNorm);
    return;
  }

  await db.put("techinfo_latest", buildTechInfoLatestFromRow(latestRow));
}

export async function deleteTechInfoImport(techInfoImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_rows", "techInfoImportId", techInfoImportId);
  const affectedVmNames = new Set<string>();
  for (const row of rows) {
    if (row.vmNameNorm) affectedVmNames.add(row.vmNameNorm);
  }

  await db.delete("techinfo_imports", techInfoImportId);
  await deleteTechInfoRowsByImportId(techInfoImportId);
  await Promise.all([...affectedVmNames].map((vmNameNorm) => rebuildTechInfoLatestForVm(vmNameNorm)));
}

async function deleteTechInfoClientRowsByImportId(techInfoClientImportId: string): Promise<void> {
  await deleteByKeyPrefix("techinfo_client_rows", techInfoClientImportId);
}

function buildTechInfoClientLatestFromRow(row: TechInfoClientRow): TechInfoClientLatest {
  return {
    clientNameNorm: row.clientNameNorm,
    clientName: row.clientName,
    importedAt: row.importedAt,
    techInfoClientImportId: row.techInfoClientImportId,
    rowIndex: row.rowIndex,
    ...mapTechInfoClientDisplayFields(row.rawData),
  };
}

async function rebuildTechInfoClientLatestForClient(clientNameNorm: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_client_rows", "clientNameNorm", clientNameNorm);
  const latestRow = rows.reduce<TechInfoClientRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("techinfo_client_latest", clientNameNorm);
    return;
  }

  await db.put("techinfo_client_latest", buildTechInfoClientLatestFromRow(latestRow));
}

export async function deleteTechInfoClientImport(techInfoClientImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("techinfo_client_rows", "techInfoClientImportId", techInfoClientImportId);
  const affectedClientNames = new Set<string>();
  for (const row of rows) {
    if (row.clientNameNorm) affectedClientNames.add(row.clientNameNorm);
  }

  await db.delete("techinfo_client_imports", techInfoClientImportId);
  await deleteTechInfoClientRowsByImportId(techInfoClientImportId);
  await Promise.all([...affectedClientNames].map((clientNameNorm) => rebuildTechInfoClientLatestForClient(clientNameNorm)));
}

function buildCdpLatestFromRow(row: CdpRow): CdpLatest {
  return {
    hostAdapterKey: row.hostAdapterKey,
    hostNorm: row.hostNorm,
    host: row.host,
    adapter: row.adapter,
    importedAt: row.importedAt,
    cdpImportId: row.cdpImportId,
    rowIndex: row.rowIndex,
    ...mapCdpDisplayFields(row.rawData),
  };
}

async function rebuildCdpLatestForKey(hostAdapterKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("cdp_rows", "hostAdapterKey", hostAdapterKey);
  const latestRow = rows.reduce<CdpRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("cdp_latest", hostAdapterKey);
    return;
  }

  await db.put("cdp_latest", buildCdpLatestFromRow(latestRow));
}

export async function deleteCdpImport(cdpImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("cdp_rows", "cdpImportId", cdpImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.hostAdapterKey) affectedKeys.add(row.hostAdapterKey);
  }

  await db.delete("cdp_imports", cdpImportId);
  await deleteByKeyPrefix("cdp_rows", cdpImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildCdpLatestForKey(key)));
}

function buildEramonIfaceLatestFromRow(row: EramonIfaceRow): EramonIfaceLatest {
  return {
    switchPortKey: row.switchPortKey,
    switchNorm: row.switchNorm,
    deviceName: row.deviceName,
    portName: row.portName,
    importedAt: row.importedAt,
    ifaceImportId: row.ifaceImportId,
    rowIndex: row.rowIndex,
    ...mapEramonIfaceDisplayFields(row.rawData),
  };
}

async function rebuildEramonIfaceLatestForKey(switchPortKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_iface_rows", "switchPortKey", switchPortKey);
  const latestRow = rows.reduce<EramonIfaceRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);
  if (!latestRow) {
    await db.delete("eramon_iface_latest", switchPortKey);
    return;
  }
  await db.put("eramon_iface_latest", buildEramonIfaceLatestFromRow(latestRow));
}

export async function deleteEramonIfaceImport(ifaceImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_iface_rows", "ifaceImportId", ifaceImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.switchPortKey) affectedKeys.add(row.switchPortKey);
  }
  await db.delete("eramon_iface_imports", ifaceImportId);
  await deleteByKeyPrefix("eramon_iface_rows", ifaceImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildEramonIfaceLatestForKey(key)));
}

function buildEramonL2LatestFromRow(row: EramonL2Row): EramonL2Latest {
  return {
    l2EntryKey: row.l2EntryKey,
    switchNorm: row.switchNorm,
    switchName: row.switchName,
    interface: row.interface,
    mac: row.mac,
    vlan: row.vlan,
    importedAt: row.importedAt,
    l2ImportId: row.l2ImportId,
    rowIndex: row.rowIndex,
    ...mapEramonL2DisplayFields(row.rawData),
  };
}

async function rebuildEramonL2LatestForKey(l2EntryKey: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_l2_rows", "l2EntryKey", l2EntryKey);
  const latestRow = rows.reduce<EramonL2Row | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);
  if (!latestRow) {
    await db.delete("eramon_l2_latest", l2EntryKey);
    return;
  }
  await db.put("eramon_l2_latest", buildEramonL2LatestFromRow(latestRow));
}

export async function deleteEramonL2Import(l2ImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("eramon_l2_rows", "l2ImportId", l2ImportId);
  const affectedKeys = new Set<string>();
  for (const row of rows) {
    if (row.l2EntryKey) affectedKeys.add(row.l2EntryKey);
  }
  await db.delete("eramon_l2_imports", l2ImportId);
  await deleteByKeyPrefix("eramon_l2_rows", l2ImportId);
  await Promise.all([...affectedKeys].map((key) => rebuildEramonL2LatestForKey(key)));
}

function buildIpamLatestFromRow(row: IpamRow): IpamLatest {
  return {
    ipAddress: row.ipAddress,
    importedAt: row.importedAt,
    ipamImportId: row.ipamImportId,
    rowIndex: row.rowIndex,
    ...mapIpamDisplayFields(row.rawData),
  };
}

async function rebuildIpamLatestForIp(ipAddress: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("ipam_rows", "ipAddress", ipAddress);
  const latestRow = rows.reduce<IpamRow | null>((latest, row) => {
    if (!latest || isTechInfoNewerOrEqual(row.importedAt, latest.importedAt)) return row;
    return latest;
  }, null);

  if (!latestRow) {
    await db.delete("ipam_latest", ipAddress);
    return;
  }

  await db.put("ipam_latest", buildIpamLatestFromRow(latestRow));
}

export async function deleteIpamImport(ipamImportId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("ipam_rows", "ipamImportId", ipamImportId);
  const affectedIps = new Set<string>();
  for (const row of rows) {
    if (row.ipAddress) affectedIps.add(row.ipAddress);
  }

  await db.delete("ipam_imports", ipamImportId);
  await deleteByKeyPrefix("ipam_rows", ipamImportId);
  await Promise.all([...affectedIps].map((ip) => rebuildIpamLatestForIp(ip)));
}
