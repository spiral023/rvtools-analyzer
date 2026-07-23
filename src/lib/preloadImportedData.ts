import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  getAllCdpLatest,
  getAllEramonIfaceLatest,
  getAllEramonL2Latest,
  getAllIpamLatest,
  getAllTechInfoClientLatest,
  getAllTechInfoLatest,
  getBySnapshotIds,
  getImportedStoreRecords,
  getRawSheetFieldNamesBySnapshot,
  getRawSheetRows,
  getSnapshots,
  getStoredRawSheetNames,
  IMPORT_DATA_STORE_NAMES,
  type ImportedDataStoreName,
} from "@/data/db";
import type { SnapshotMeta } from "@/domain/models/types";
import { QUERY_CACHE_DURATION_MS, RAW_QUERY_GC_MS } from "@/lib/queryCache";

type SnapshotEntityStore =
  | "entities_vm"
  | "entities_host"
  | "entities_cluster"
  | "entities_datastore"
  | "entities_snapshot"
  | "entities_health";

export interface PreloadDependencies {
  getSnapshots: () => Promise<Array<Pick<SnapshotMeta, "snapshotId"> & Partial<SnapshotMeta>>>;
  getStoredRawSheetNames: (snapshotIds: string[]) => Promise<string[]>;
  getBySnapshotIds: (storeName: SnapshotEntityStore, snapshotIds: string[]) => Promise<unknown[]>;
  getRawSheetRows: (snapshotIds: string[], sheetName: string) => Promise<unknown[]>;
  getRawSheetFieldNamesBySnapshot: (snapshotIds: string[], sheetName: string) => Promise<Record<string, string[]>>;
  getImportedStoreRecords: (storeName: ImportedDataStoreName) => Promise<unknown[]>;
  getAllTechInfoLatest: () => Promise<unknown[]>;
  getAllTechInfoClientLatest: () => Promise<unknown[]>;
  getAllCdpLatest: () => Promise<unknown[]>;
  getAllIpamLatest: () => Promise<unknown[]>;
  getAllEramonIfaceLatest: () => Promise<unknown[]>;
  getAllEramonL2Latest: () => Promise<unknown[]>;
}

export interface PreloadProgress {
  phase: "preparing" | "loading";
  currentLabel: string;
  completedSteps: number;
  totalSteps: number;
  processedRecords: number;
  percent: number;
}

interface PreloadStep {
  label: string;
  queryKey: QueryKey;
  load: () => Promise<unknown>;
  rawSheetName?: string;
}

const DEFAULT_DEPENDENCIES: PreloadDependencies = {
  getSnapshots,
  getStoredRawSheetNames,
  getBySnapshotIds: (storeName, snapshotIds) => getBySnapshotIds(storeName, snapshotIds),
  getRawSheetRows,
  getRawSheetFieldNamesBySnapshot,
  getImportedStoreRecords,
  getAllTechInfoLatest,
  getAllTechInfoClientLatest,
  getAllCdpLatest,
  getAllIpamLatest,
  getAllEramonIfaceLatest,
  getAllEramonL2Latest,
};

const ENTITY_STEPS: ReadonlyArray<{
  storeName: SnapshotEntityStore;
  queryName: string;
  label: string;
}> = [
  { storeName: "entities_vm", queryName: "vms", label: "Virtuelle Maschinen" },
  { storeName: "entities_host", queryName: "hosts", label: "Hosts" },
  { storeName: "entities_cluster", queryName: "clusters", label: "Cluster" },
  { storeName: "entities_datastore", queryName: "datastores", label: "Datastores" },
  { storeName: "entities_snapshot", queryName: "vmSnapshots", label: "VM-Snapshots" },
  { storeName: "entities_health", queryName: "health", label: "Health-Ereignisse" },
];

const IMPORT_STORE_LABELS: Record<ImportedDataStoreName, string> = {
  techinfo_imports: "Tech-Info-Dateien",
  techinfo_rows: "Tech-Info-Datensätze",
  techinfo_client_imports: "Tech-Info-Client-Dateien",
  techinfo_client_rows: "Tech-Info-Client-Datensätze",
  cdp_imports: "CDP-Dateien",
  cdp_rows: "CDP-Datensätze",
  ipam_imports: "IPAM-Dateien",
  ipam_rows: "IPAM-Datensätze",
  eramon_iface_imports: "Eramon-Interface-Dateien",
  eramon_iface_rows: "Eramon-Interface-Datensätze",
  eramon_l2_imports: "Eramon-L2-Dateien",
  eramon_l2_rows: "Eramon-L2-Datensätze",
};

function recordCount(value: unknown): number {
  return Array.isArray(value) ? value.length : value == null ? 0 : 1;
}

function progressPercent(completedSteps: number, totalSteps: number): number {
  return totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);
}

function normalizedVmNames(rows: unknown[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("vmName" in row)) continue;
    const name = String(row.vmName ?? "").trim();
    if (name) names.add(name);
  }
  return [...names].sort();
}

function filterLatestByNames(rows: unknown[], field: "vmNameNorm" | "clientNameNorm", names: string[]): unknown[] {
  const normalizedNames = new Set(names.map((name) => name.toLocaleLowerCase("de-DE")));
  return rows.filter((row) => {
    if (!row || typeof row !== "object" || !(field in row)) return false;
    const record = row as Record<string, unknown>;
    return normalizedNames.has(String(record[field] ?? "").toLocaleLowerCase("de-DE"));
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function buildStoredUploads(queryClient: QueryClient, snapshots: unknown[]): unknown[] {
  const uploads: Array<Record<string, unknown>> = snapshots.map((value) => {
    const snapshot = asRecord(value);
    return {
      kind: "rvtools",
      id: String(snapshot.snapshotId ?? ""),
      importedAt: String(snapshot.importedAt ?? ""),
      snapshot: value,
    };
  });
  const definitions = [
    { store: "techinfo_imports", kind: "tech-info", id: "techInfoImportId", field: "techInfo" },
    { store: "techinfo_client_imports", kind: "tech-info-client", id: "techInfoClientImportId", field: "techInfoClient" },
    { store: "cdp_imports", kind: "cdp", id: "cdpImportId", field: "cdp" },
    { store: "ipam_imports", kind: "ipam", id: "ipamImportId", field: "ipam" },
    { store: "eramon_iface_imports", kind: "eramon-iface", id: "ifaceImportId", field: "eramonIface" },
    { store: "eramon_l2_imports", kind: "eramon-l2", id: "l2ImportId", field: "eramonL2" },
  ] as const;

  for (const definition of definitions) {
    const records = queryClient.getQueryData<unknown[]>(["importedDataStore", definition.store]) ?? [];
    for (const value of records) {
      const record = asRecord(value);
      uploads.push({
        kind: definition.kind,
        id: String(record[definition.id] ?? ""),
        importedAt: String(record.importedAt ?? ""),
        [definition.field]: value,
      });
    }
  }

  return uploads.sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)));
}

export async function preloadImportedData(
  queryClient: QueryClient,
  options: {
    onProgress?: (progress: PreloadProgress) => void;
    dependencies?: PreloadDependencies;
  } = {},
): Promise<{ processedRecords: number; totalSteps: number }> {
  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES;
  const notify = options.onProgress ?? (() => undefined);
  notify({
    phase: "preparing",
    currentLabel: "Importierte Dateien werden ermittelt",
    completedSteps: 0,
    totalSteps: 0,
    processedRecords: 0,
    percent: 0,
  });

  let snapshots: unknown[];
  try {
    snapshots = await queryClient.fetchQuery({
      queryKey: ["snapshots"],
      queryFn: dependencies.getSnapshots,
      staleTime: QUERY_CACHE_DURATION_MS,
      gcTime: QUERY_CACHE_DURATION_MS,
      retry: false,
    });
  } catch (error) {
    throw new Error(`Snapshot-Dateien: ${error instanceof Error ? error.message : String(error)}`);
  }

  const snapshotIds = snapshots
    .map((snapshot) => snapshot && typeof snapshot === "object" && "snapshotId" in snapshot ? String(snapshot.snapshotId) : "")
    .filter(Boolean);

  let sheetNames: string[];
  try {
    sheetNames = await dependencies.getStoredRawSheetNames(snapshotIds);
  } catch (error) {
    throw new Error(`Raw-Sheet-Inventar: ${error instanceof Error ? error.message : String(error)}`);
  }

  const steps: PreloadStep[] = [
    ...ENTITY_STEPS.map(({ storeName, queryName, label }) => ({
      label: `RVTools: ${label}`,
      queryKey: [queryName, snapshotIds],
      load: () => dependencies.getBySnapshotIds(storeName, snapshotIds),
    })),
    ...sheetNames.map((sheetName) => ({
      label: `RVTools-Rohdaten: ${sheetName}`,
      queryKey: ["rawSheet", sheetName, snapshotIds],
      load: () => dependencies.getRawSheetRows(snapshotIds, sheetName),
      rawSheetName: sheetName,
    })),
    ...sheetNames.map((sheetName) => ({
      label: `RVTools-Felddefinitionen: ${sheetName}`,
      queryKey: ["rawSheetFieldsBySnapshot", sheetName, snapshotIds],
      load: () => dependencies.getRawSheetFieldNamesBySnapshot(snapshotIds, sheetName),
    })),
    ...IMPORT_DATA_STORE_NAMES.map((storeName) => ({
      label: IMPORT_STORE_LABELS[storeName],
      queryKey: ["importedDataStore", storeName],
      load: () => dependencies.getImportedStoreRecords(storeName),
    })),
    { label: "Aktuelle Tech-Info-Daten", queryKey: ["techInfoLatestAll"], load: dependencies.getAllTechInfoLatest },
    { label: "Aktuelle Tech-Info-Client-Daten", queryKey: ["techInfoClientLatestAll"], load: dependencies.getAllTechInfoClientLatest },
    { label: "Aktuelle CDP-Daten", queryKey: ["cdpLatestAll"], load: dependencies.getAllCdpLatest },
    { label: "Aktuelle IPAM-Daten", queryKey: ["ipamLatestAll"], load: dependencies.getAllIpamLatest },
    { label: "Aktuelle Eramon-Interface-Daten", queryKey: ["eramonIfaceLatestAll"], load: dependencies.getAllEramonIfaceLatest },
    { label: "Aktuelle Eramon-L2-Daten", queryKey: ["eramonL2LatestAll"], load: dependencies.getAllEramonL2Latest },
  ];

  const totalSteps = steps.length + 1;
  let completedSteps = 1;
  let processedRecords = recordCount(snapshots);
  notify({
    phase: "loading",
    currentLabel: "Snapshot-Dateien",
    completedSteps,
    totalSteps,
    processedRecords,
    percent: progressPercent(completedSteps, totalSteps),
  });

  for (const step of steps) {
    notify({
      phase: "loading",
      currentLabel: step.label,
      completedSteps,
      totalSteps,
      processedRecords,
      percent: progressPercent(completedSteps, totalSteps),
    });

    let data: unknown;
    try {
      data = await queryClient.fetchQuery({
        queryKey: step.queryKey,
        queryFn: step.load,
        staleTime: QUERY_CACHE_DURATION_MS,
        gcTime: step.rawSheetName ? RAW_QUERY_GC_MS : QUERY_CACHE_DURATION_MS,
        retry: false,
      });
    } catch (error) {
      throw new Error(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (step.rawSheetName) {
      queryClient.setQueryData(["globalVmFilterRawSheet", step.rawSheetName, snapshotIds], data);
    }

    processedRecords += recordCount(data);
    completedSteps += 1;
    notify({
      phase: "loading",
      currentLabel: step.label,
      completedSteps,
      totalSteps,
      processedRecords,
      percent: progressPercent(completedSteps, totalSteps),
    });
  }

  const vms = queryClient.getQueryData<unknown[]>(["vms", snapshotIds]) ?? [];
  const names = normalizedVmNames(vms);
  const techInfo = queryClient.getQueryData<unknown[]>(["techInfoLatestAll"]) ?? [];
  const techInfoClient = queryClient.getQueryData<unknown[]>(["techInfoClientLatestAll"]) ?? [];
  queryClient.setQueryData(["techInfoLatestByVmNames", names], filterLatestByNames(techInfo, "vmNameNorm", names));
  queryClient.setQueryData(
    ["techInfoClientLatestByClientNames", names],
    filterLatestByNames(techInfoClient, "clientNameNorm", names),
  );
  queryClient.setQueryData(["storedUploads"], buildStoredUploads(queryClient, snapshots));
  queryClient.setQueryData(["hasImportedData"], processedRecords > 0);

  return { processedRecords, totalSteps };
}
