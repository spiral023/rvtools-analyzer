import {
  getSnapshotsByChecksum,
  getSnapshotsByVcenterId,
  putSnapshot,
  batchPut,
  putRawSheetBlob,
  deleteSnapshot,
  getTechInfoImportByChecksum,
  putTechInfoImport,
  batchPutTechInfoRows,
  batchPutTechInfoLatest,
  getTechInfoLatestByVmNames,
  getTechInfoClientImportByChecksum,
  putTechInfoClientImport,
  batchPutTechInfoClientRows,
  batchPutTechInfoClientLatest,
  getTechInfoClientLatestByClientNames,
  getCdpImportByChecksum,
  putCdpImport,
  batchPutCdpRows,
  batchPutCdpLatest,
  getCdpLatestByHostAdapterKeys,
} from "@/data/db";
import {
  computeChecksum,
  toNumber,
  toBool,
  toStr,
  parseEsxVersionBuild,
  parseRvtoolsExportFileName,
  mapTechInfoDisplayFields,
  mapTechInfoClientDisplayFields,
  normalizeVmNameForMatch,
  normalizeVcenterId,
  isTechInfoNewerOrEqual,
  TECH_INFO_CLIENT_REQUIRED_HEADERS,
  CDP_REQUIRED_HEADERS,
  mapCdpDisplayFields,
  buildHostAdapterKey,
} from "@/lib/xlsx/parseHelpers";
import { gzipJson } from "@/lib/compression";
import { shortId } from "@/lib/shortId";
import type {
  ImportResult,
  SnapshotMeta,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  RawSheetBlob,
  SheetStats,
  ParsedSheetData,
  WorkerParseResult,
  TechInfoLatest,
  TechInfoRow,
  TechInfoClientLatest,
  TechInfoClientRow,
  CdpRow,
  CdpLatest,
} from "@/domain/models/types";

/* ---------- progress callback ---------- */

export interface ImportProgress {
  step: string;
  detail?: string;
  percent: number; // 0-100
}

export type ProgressCallback = (p: ImportProgress) => void;

/* ---------- worker ---------- */

function createWorker(): Worker {
  return new Worker(
    new URL("../../workers/parser.worker.ts", import.meta.url),
    { type: "module" },
  );
}

function workerParse(buffer: ArrayBuffer): Promise<WorkerParseResult> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.type === "PARSE_ERROR") reject(new Error(e.data.payload));
      else resolve(e.data.payload as WorkerParseResult);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ type: "PARSE_FILE", payload: { buffer } }, [buffer]);
  });
}

/* ---------- helpers ---------- */

/**
 * Sheets (kanonische Namen), deren Rohdaten im Frontend tatsächlich gelesen werden.
 * Quelle: alle `useRawSheet("...")`-Aufrufe in `src/pages/*`.
 *
 * Nur diese Sheets werden roh in `rawSheets` persistiert. Alle anderen Sheets
 * (unbekannte Extra-Sheets, `vFileInfo`, `vMetaData` sowie die roh nicht gelesenen,
 * aber normalisierten `vCluster`/`vHealth`) werden NICHT roh gespeichert – das
 * reduziert Schreibvolumen und Heap beim Import erheblich.
 *
 * WICHTIG: Wird in einer Seite ein neues `useRawSheet("xyz")` ergänzt, muss der
 * kanonische Sheet-Name hier eingetragen werden, sonst kommt die Abfrage leer zurück.
 * Die Normalisierung (entities_*) ist davon unabhängig – sie liest direkt aus den
 * geparsten Sheets, nicht aus `rawSheets`.
 */
const RAW_SHEET_ALLOWLIST: ReadonlySet<string> = new Set([
  "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork",
  "vCD", "vUSB", "vSnapshot", "vTools", "vSource", "vRP",
  "vHost", "vHBA", "vNIC", "vSwitch", "vPort", "dvSwitch",
  "dvPort", "vSC_VMK", "vDatastore", "vLicense", "vMultiPath",
]);

/**
 * Spalten, die pro vCenter konstant und in jeder Zeile jedes Sheets vorhanden, aber ohne
 * Analysewert sind — reiner Speicher-Overhead. `VI SDK Server` bleibt (wird für die
 * vCenter-Anzeige gebraucht, z. B. `src/pages/ComplianceLifecycle.tsx`).
 */
const RAW_SHEET_COLUMN_DENYLIST: ReadonlySet<string> = new Set([
  "VI SDK UUID",
  "VI SDK Server type",
  "VI SDK API Version",
]);

interface PersistRawSheetBlobsOptions {
  sheets: ParsedSheetData[];
  snapshotId: string;
  putBlob?: (blob: RawSheetBlob) => Promise<void>;
  onSheetPersisted?: (sheetName: string, sheetIndex: number, totalSheets: number) => void;
}

const TECH_INFO_REQUIRED_HEADERS = ["Name", "Wartungsfenster", "Betriebssystem"] as const;
const TECH_INFO_UI_HEADERS = [
  "Servertyp",
  "Wartungsfenster",
  "Betriebssystem",
  "Kommentar",
  "SysV",
  "SysV Abteilung",
  "SysVStv",
  "SysVStv Abteilung",
  "BZ",
  "Schrankreihe",
  "CV-Backup",
  "AZ",
] as const;

function findSheet(sheets: ParsedSheetData[], name: string): ParsedSheetData | undefined {
  return sheets.find((s) => s.sheetName === name);
}

function findTechInfoSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    TECH_INFO_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

/** Anzeigespalten der Client-Doku. CPU min/max und RAM min/max werden bewusst nicht importiert. */
const TECH_INFO_CLIENT_UI_HEADERS = [
  "BLZ",
  "Standort",
  "IP",
  "MAC Adresse",
  "Poolname",
  "Geändert von",
  "Änderungsdatum",
  "Erstellt von",
  "Erstellungsdatum",
  "User",
  "Hardware",
  "OS",
  "Cluster",
  "vCenter",
  "Site",
  "Insider",
  "HW Änderungen",
  "Monitoring",
  "Domäne",
] as const;

function findTechInfoClientSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    TECH_INFO_CLIENT_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

function toRawCellValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

function toRawRowData(row: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, val] of Object.entries(row)) {
    out[key] = toRawCellValue(val);
  }
  return out;
}

/**
 * Vollständige, geordnete Spaltenliste eines Sheets. `sheet.headers` stammt nur aus der
 * ersten Zeile (leere Zellen lässt der Parser weg), daher wird die Union über alle Zeilen
 * gebildet – sonst gingen Spalten verloren, die erst in späteren Zeilen auftreten.
 */
function buildRawHeaderUnion(sheet: ParsedSheetData): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  const add = (key: string) => {
    if (seen.has(key) || RAW_SHEET_COLUMN_DENYLIST.has(key)) return;
    seen.add(key);
    headers.push(key);
  };
  for (const header of sheet.headers) add(header);
  for (const row of sheet.rows) {
    for (const key of Object.keys(row)) add(key);
  }
  return headers;
}

async function runSequential<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  if (index >= items.length) return;
  await task(items[index], index);
  await runSequential(items, task, index + 1);
}

export async function persistRawSheetBlobs({
  sheets,
  snapshotId,
  putBlob = (blob) => putRawSheetBlob(blob),
  onSheetPersisted,
}: PersistRawSheetBlobsOptions): Promise<number> {
  const allowedSheets = sheets.filter((sheet) => RAW_SHEET_ALLOWLIST.has(sheet.sheetName));
  let persistedRows = 0;

  await runSequential(allowedSheets, async (sheet, index) => {
    const headers = buildRawHeaderUnion(sheet);
    const values = sheet.rows.map((row) => headers.map((header) => toRawCellValue(row[header])));
    const data = await gzipJson(values);
    await putBlob({
      snapshotId,
      sheetName: sheet.sheetName,
      headers,
      rowCount: sheet.rows.length,
      codec: "gzip-json-v1",
      data,
    });
    persistedRows += sheet.rows.length;
    onSheetPersisted?.(sheet.sheetName, index + 1, allowedSheets.length);
  });

  return persistedRows;
}

/* ---------- normalizers (rvtools) ---------- */

function normalizeVms(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedVm[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const vmUuid = toStr(row["VM UUID"]);
    const vmName = String(row["VM"] || row["Name"] || "unknown");
    return {
      snapshotId,
      vcenterId,
      vmKey: `${vmUuid || vmName}::${vcenterId}`,
      vmUuid,
      vmName,
      cluster: toStr(row["Cluster"]),
      host: toStr(row["Host"]),
      powerState: toStr(row["Powerstate"]),
      cpuCount: toNumber(row["CPUs"]),
      memoryMiB: toNumber(row["Memory"]),
      provisionedMiB: toNumber(row["Provisioned MiB"] || row["Provisioned MB"]),
      inUseMiB: toNumber(row["In Use MiB"] || row["In Use MB"]),
      configStatus: toStr(row["Config status"]),
      connectionState: toStr(row["Connection state"]),
      consolidationNeeded: toBool(row["Consolidation Needed"]),
      osConfig: toStr(row["OS according to the configuration file"]),
      osTools: toStr(row["OS according to the VMware Tools"]),
      hwVersion: toStr(row["HW version"]),
      toolsStatus: toStr(row["Tools status"] || row["VMware Tools Status"]),
      toolsVersion: toStr(row["Tools version string"]),
      datacenter: toStr(row["Datacenter"]),
      folder: toStr(row["Folder"]),
      resourcePool: toStr(row["Resource pool"] || row["Resource Pool"]),
      annotation: toStr(row["Annotation"]),
      cpuReady: toNumber(row["Overall Cpu Readiness"] || row["CPU Ready"]),
      firmware: toStr(row["Firmware"]),
      efiSecureBoot: toBool(row["EFI Secure boot"]),
      cbt: toBool(row["CBT"]),
    };
  });
}

function normalizeHosts(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedHost[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const host = String(row["Host"] || row["Name"] || "unknown");
    const esxVersion = toStr(row["ESX Version"]);
    const parsedEsx = parseEsxVersionBuild(esxVersion);
    return {
      snapshotId,
      vcenterId,
      hostKey: `${host}::${vcenterId}`,
      host,
      cluster: toStr(row["Cluster"]),
      datacenter: toStr(row["Datacenter"]),
      cpuModel: toStr(row["CPU Model"]),
      cpuTotalMHz: toNumber(row["Speed"] || row["CPU Speed"]),
      cpuCores: toNumber(row["# Cores"] || row["Cores"]),
      cpuThreads: toNumber(row["# Threads"]),
      memoryTotalMiB: toNumber(row["Memory"] || row["# Memory"]),
      version: toStr(row["Version"]) || parsedEsx.version,
      build: toStr(row["Build"]) || parsedEsx.build,
      vendor: toStr(row["Vendor"]),
      model: toStr(row["Model"]),
      connectionState: toStr(row["Connection state"]),
      powerState: toStr(row["Power state"]),
      maintenanceMode: toStr(row["Maintenance Mode"] || row["in Maintenance Mode"]),
      vmCount: toNumber(row["# VMs"]),
    };
  });
}

function normalizeClusters(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedCluster[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const name = String(row["Name"] || row["Cluster"] || "unknown");
    return {
      snapshotId,
      vcenterId,
      clusterKey: `${name}::${vcenterId}`,
      name,
      datacenter: toStr(row["Datacenter"]),
      haEnabled: toBool(row["HA enabled"]),
      drsEnabled: toBool(row["DRS enabled"]),
      numHosts: toNumber(row["NumHosts"] || row["# Hosts"]),
      numCpuCores: toNumber(row["NumCpuCores"] || row["# Cores"]),
      numCpuThreads: toNumber(row["NumCpuThreads"] || row["# CPU Threads"]),
      totalMemoryMiB: toNumber(row["TotalMemory"] || row["Total Memory"]),
      totalCpuMHz: toNumber(row["TotalCpu"] || row["Total CPU"]),
      numEffectiveHosts: toNumber(row["NumEffectiveHosts"]),
    };
  });
}

function normalizeDatastores(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedDatastore[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const name = String(row["Name"] || row["Datastore"] || "unknown");
    const capMiB = toNumber(row["Capacity MiB"] || row["Capacity MB"]);
    const freeMiB = toNumber(row["Free MiB"] || row["Free MB"]);
    const inUseMiB = toNumber(row["In Use MiB"] || row["In Use MB"]);
    const freePct = toNumber(row["Free %"]);
    return {
      snapshotId,
      vcenterId,
      dsKey: `${name}::${vcenterId}`,
      name,
      clusterName: toStr(row["Cluster"] || row["Datacenter/Cluster"]),
      type: toStr(row["Type"]),
      capacityMiB: capMiB,
      inUseMiB: inUseMiB ?? (capMiB && freeMiB ? capMiB - freeMiB : null),
      freeMiB,
      freePct: freePct ?? (capMiB && freeMiB ? (freeMiB / capMiB) * 100 : null),
      version: toStr(row["Version"]),
      siocEnabled: toBool(row["SIOC enabled"]),
    };
  });
}

export function normalizeSnapshots(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedSnapshot[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => ({
    snapshotId,
    vcenterId,
    vmName: String(row["VM"] || row["VM Name"] || "unknown"),
    snapshotName: toStr(row["Snapshot Name"] || row["Name"]),
    description: toStr(row["Description"]),
    dateTaken: toStr(row["Date / time"] || row["Date"]),
    sizeMiB: toNumber(row["Size MiB (total)"] || row["Size MiB"] || row["Size MB"] || row["Size"]),
    quiesced: toBool(row["Quiesced"]),
  }));
}

function normalizeHealth(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedHealth[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => ({
    snapshotId,
    vcenterId,
    entity: toStr(row["Entity"] || row["Name"]),
    messageType: toStr(row["Message type"] || row["Type"] || row["Status"]),
    message: toStr(row["Message"]),
  }));
}

/* ---------- main import with progress ---------- */

export async function importRvtoolsXlsx(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const report = (step: string, percent: number, detail?: string) =>
    onProgress?.({ step, percent, detail });
  const importStartedAt = performance.now();

  try {
    report("Datei lesen", 5, `${(file.size / 1024 / 1024).toFixed(1)} MB`);
    const buffer = await file.arrayBuffer();

    report("Prüfsumme berechnen", 10);
    const checksum = await computeChecksum(buffer);

    report("XLSX parsen", 15, "Web Worker aktiv...");
    const parsed = await workerParse(buffer);
    warnings.push(...parsed.warnings);
    errors.push(...parsed.errors);

    if (parsed.fileKind === "tech-info") {
      return await importTechInfoXlsx(file, checksum, parsed, warnings, errors, report);
    }

    if (parsed.fileKind === "tech-info-client") {
      return await importTechInfoClientXlsx(file, checksum, parsed, warnings, errors, report);
    }

    if (parsed.fileKind === "cdp") {
      return await importCdpCsv(file, checksum, parsed, warnings, errors, report);
    }

    // CSV-Dateien, die keine CDP-Struktur haben, dürfen nicht in den RVTools-Zweig laufen.
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (isCsv) {
      return {
        success: false,
        warnings,
        errors: [...errors, "Keine gültige CDP-CSV erkannt (erwartete Spalten: VMHost, PhysicalAdapter, CDPDeviceID, CDPAvailable)."],
      };
    }

    return await importRvtoolsParsed(file, checksum, parsed, warnings, errors, report, importStartedAt);
  } catch (err) {
    return { success: false, warnings, errors: [...errors, err instanceof Error ? err.message : String(err)] };
  }
}

async function importRvtoolsParsed(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
  importStartedAt: number,
): Promise<ImportResult> {
  const existing = await getSnapshotsByChecksum(checksum);
  if (existing) {
    return {
      success: false,
      fileKind: "rvtools",
      snapshotId: existing.snapshotId,
      warnings: [],
      errors: ["Diese Datei wurde bereits importiert."],
    };
  }

  const totalRows = parsed.sheets.reduce((s, sh) => s + sh.rows.length, 0);
  report("Sheets erkannt", 30, `${parsed.sheets.length} Sheets, ${totalRows.toLocaleString("de-DE")} Zeilen`);

  const snapshotId = shortId();
  const fileMeta = parseRvtoolsExportFileName(file.name);
  const vcenterDisplayName = (fileMeta?.vcenterName || parsed.vcenterName || "unknown-vcenter").trim();
  const exportTs = fileMeta?.exportTs || parsed.exportTs || new Date().toISOString();
  const vcenterId = normalizeVcenterId(vcenterDisplayName);

  const sheetStats: Record<string, SheetStats> = {};
  for (const sheet of parsed.sheets) {
    sheetStats[sheet.sheetName] = { rowCount: sheet.rows.length, columnCount: sheet.headers.length };
  }

  const snapshotMeta: SnapshotMeta = {
    snapshotId,
    vcenterId,
    vcenterDisplayName,
    exportTs,
    importedAt: new Date().toISOString(),
    fileName: file.name,
    fileChecksum: checksum,
    sheetStats,
    fileSizeBytes: file.size,
  };

  const replacedSnapshots = await getSnapshotsByVcenterId(vcenterId);
  if (replacedSnapshots.length > 0) {
    report(
      "Vorherige Exporte ersetzen",
      35,
      `${vcenterDisplayName}: ${replacedSnapshots.length} Export${replacedSnapshots.length === 1 ? "" : "e"} wird gelöscht`,
    );
    await runSequential(replacedSnapshots, async (snapshot, index) => {
      await deleteSnapshot(snapshot.snapshotId, (progress) => {
        const replacementProgress = Math.round(((index + progress.percent / 100) / replacedSnapshots.length) * 10);
        report(
          "Vorherige Exporte ersetzen",
          35 + replacementProgress,
          `${vcenterDisplayName}: Export ${index + 1}/${replacedSnapshots.length}, ${progress.detail ?? progress.step}`,
        );
      });
    });
  }

  const rawSheetsTotal = parsed.sheets.filter((sheet) => RAW_SHEET_ALLOWLIST.has(sheet.sheetName)).length;
  try {
    report("Rohdaten speichern", 45, `${vcenterDisplayName}: ${rawSheetsTotal} Sheets...`);
    await persistRawSheetBlobs({
      sheets: parsed.sheets,
      snapshotId,
      onSheetPersisted: (sheetName, sheetIndex, totalSheets) => {
        const pct = 45 + Math.round((sheetIndex / Math.max(totalSheets, 1)) * 25);
        report(
          "Rohdaten speichern",
          Math.min(pct, 69),
          `${vcenterDisplayName}: ${sheetName} (${sheetIndex}/${totalSheets})`,
        );
      },
    });

    report("Normalisieren", 70, `${vcenterDisplayName}: VMs...`);
    const vms = normalizeVms(findSheet(parsed.sheets, "vInfo"), snapshotId, vcenterId);

    report("Normalisieren", 75, `${vcenterDisplayName}: Hosts & Cluster...`);
    const hosts = normalizeHosts(findSheet(parsed.sheets, "vHost"), snapshotId, vcenterId);
    const clusters = normalizeClusters(findSheet(parsed.sheets, "vCluster"), snapshotId, vcenterId);

    report("Normalisieren", 78, `${vcenterDisplayName}: Datastores...`);
    const datastores = normalizeDatastores(findSheet(parsed.sheets, "vDatastore"), snapshotId, vcenterId);

    report("Normalisieren", 80, `${vcenterDisplayName}: Snapshots & Health...`);
    const vmSnapshots = normalizeSnapshots(findSheet(parsed.sheets, "vSnapshot"), snapshotId, vcenterId);
    const healthEvents = normalizeHealth(findSheet(parsed.sheets, "vHealth"), snapshotId, vcenterId);

    const entityBatches = [
      { name: "VMs", store: "entities_vm", items: vms, pctStart: 82 },
      { name: "Hosts", store: "entities_host", items: hosts, pctStart: 90 },
      { name: "Cluster", store: "entities_cluster", items: clusters, pctStart: 92 },
      { name: "Datastores", store: "entities_datastore", items: datastores, pctStart: 93 },
      { name: "Snapshots", store: "entities_snapshot", items: vmSnapshots, pctStart: 95 },
      { name: "Health", store: "entities_health", items: healthEvents, pctStart: 97 },
    ] as const;

    await runSequential(entityBatches, async (eb) => {
      if (eb.items.length > 0) {
        report("Entitäten speichern", eb.pctStart, `${vcenterDisplayName}: ${eb.items.length.toLocaleString("de-DE")} ${eb.name}`);
        if (eb.store === "entities_vm") await batchPut("entities_vm", eb.items, 3000);
        if (eb.store === "entities_host") await batchPut("entities_host", eb.items, 3000);
        if (eb.store === "entities_cluster") await batchPut("entities_cluster", eb.items, 3000);
        if (eb.store === "entities_datastore") await batchPut("entities_datastore", eb.items, 3000);
        if (eb.store === "entities_snapshot") await batchPut("entities_snapshot", eb.items, 3000);
        if (eb.store === "entities_health") await batchPut("entities_health", eb.items, 3000);
      }
    });

    report("Metadaten speichern", 99, `${vcenterDisplayName}: Import abschließen...`);
    await putSnapshot({
      ...snapshotMeta,
      importDurationMs: Math.round(performance.now() - importStartedAt),
    });

    report("Abgeschlossen", 100, `${vcenterDisplayName}: ${vms.length.toLocaleString("de-DE")} VMs, ${hosts.length} Hosts`);

    return { success: true, fileKind: "rvtools", snapshotId, warnings, errors, sheetStats };
  } catch (error) {
    report("Import bereinigen", 99, `${vcenterDisplayName}: Teilreste des fehlgeschlagenen Imports löschen...`);
    try {
      await deleteSnapshot(snapshotId);
    } catch {
      // Der ursprüngliche Importfehler ist für die Oberfläche aussagekräftiger.
    }
    const reason = error instanceof Error ? error.message : String(error);
    const replacementNotice = replacedSnapshots.length > 0
      ? " Bereits entfernte Exporte dieses vCenters können nicht wiederhergestellt werden."
      : "";
    throw new Error(`Import für ${vcenterDisplayName} fehlgeschlagen.${replacementNotice} Ursache: ${reason}`);
  }
}

async function importTechInfoXlsx(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getTechInfoImportByChecksum(checksum);
  if (existing) {
    return {
      success: false,
      fileKind: "tech-info",
      warnings: [],
      errors: ["Diese Tech-Info-Datei wurde bereits importiert."],
    };
  }

  const techSheet = findTechInfoSheet(parsed.sheets);
  if (!techSheet) {
    return {
      success: false,
      fileKind: "tech-info",
      warnings,
      errors: [...errors, "Keine gültige Tech-Info-Tabelle gefunden (erwartete Header: Name, Wartungsfenster, Betriebssystem)."],
    };
  }

  for (const header of TECH_INFO_UI_HEADERS) {
    if (!techSheet.headers.includes(header)) {
      warnings.push(`Tech-Info Spalte "${header}" fehlt. Wert wird als leer übernommen.`);
    }
  }

  const importedAt = new Date().toISOString();
  const techInfoImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [techSheet.sheetName]: { rowCount: techSheet.rows.length, columnCount: techSheet.headers.length },
  };

  report("Tech-Info Metadaten speichern", 35);
  await putTechInfoImport({
    techInfoImportId,
    importedAt,
    fileName: file.name,
    fileChecksum: checksum,
    sheetName: techSheet.sheetName,
    rowCount: techSheet.rows.length,
    columnCount: techSheet.headers.length,
  });

  report("Tech-Info Rohdaten speichern", 45, `${techSheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  const fullRows: TechInfoRow[] = [];
  const latestCandidates = new Map<string, TechInfoLatest>();
  for (let i = 0; i < techSheet.rows.length; i++) {
    const row = techSheet.rows[i];
    const vmName = toStr(row["Name"]);
    if (!vmName) {
      warnings.push(`Tech-Info Zeile ${i + 1}: Name ist leer, Zeile wurde übersprungen.`);
      continue;
    }

    const vmNameNorm = normalizeVmNameForMatch(vmName);
    const mappedFields = mapTechInfoDisplayFields(row);
    fullRows.push({
      techInfoImportId,
      rowIndex: i,
      vmName,
      vmNameNorm,
      importedAt,
      rawData: toRawRowData(row),
    });

    latestCandidates.set(vmNameNorm, {
      vmNameNorm,
      vmName,
      importedAt,
      techInfoImportId,
      rowIndex: i,
      ...mappedFields,
    });
  }

  await batchPutTechInfoRows(fullRows, 5000);

  report("Tech-Info Latest aktualisieren", 75);
  const vmNameNorms = [...latestCandidates.keys()];
  const existingLatest = await getTechInfoLatestByVmNames(vmNameNorms);
  const existingMap = new Map(existingLatest.map((entry) => [entry.vmNameNorm, entry]));
  const latestUpdates: TechInfoLatest[] = [];
  for (const [vmNameNorm, candidate] of latestCandidates.entries()) {
    const current = existingMap.get(vmNameNorm);
    const shouldReplace = isTechInfoNewerOrEqual(candidate.importedAt, current?.importedAt);
    if (shouldReplace) latestUpdates.push(candidate);
  }
  if (latestUpdates.length > 0) {
    await batchPutTechInfoLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} Tech-Info Zeilen`);
  return { success: true, fileKind: "tech-info", warnings, errors, sheetStats };
}

async function importTechInfoClientXlsx(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getTechInfoClientImportByChecksum(checksum);
  if (existing) {
    return {
      success: false,
      fileKind: "tech-info-client",
      warnings: [],
      errors: ["Diese Tech-Info-Client-Datei wurde bereits importiert."],
    };
  }

  const clientSheet = findTechInfoClientSheet(parsed.sheets);
  if (!clientSheet) {
    return {
      success: false,
      fileKind: "tech-info-client",
      warnings,
      errors: [...errors, "Keine gültige Tech-Info-Client-Tabelle gefunden (erwartete Header: Name, BLZ, MAC Adresse, Poolname)."],
    };
  }

  for (const header of TECH_INFO_CLIENT_UI_HEADERS) {
    if (!clientSheet.headers.includes(header)) {
      warnings.push(`Tech-Info-Client Spalte "${header}" fehlt. Wert wird als leer übernommen.`);
    }
  }

  const importedAt = new Date().toISOString();
  const techInfoClientImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [clientSheet.sheetName]: { rowCount: clientSheet.rows.length, columnCount: clientSheet.headers.length },
  };

  report("Tech-Info-Client Metadaten speichern", 35);
  await putTechInfoClientImport({
    techInfoClientImportId,
    importedAt,
    fileName: file.name,
    fileChecksum: checksum,
    sheetName: clientSheet.sheetName,
    rowCount: clientSheet.rows.length,
    columnCount: clientSheet.headers.length,
  });

  report("Tech-Info-Client Rohdaten speichern", 45, `${clientSheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  const fullRows: TechInfoClientRow[] = [];
  const latestCandidates = new Map<string, TechInfoClientLatest>();
  for (let i = 0; i < clientSheet.rows.length; i++) {
    const row = clientSheet.rows[i];
    const clientName = toStr(row["Name"]);
    if (!clientName) {
      warnings.push(`Tech-Info-Client Zeile ${i + 1}: Name ist leer, Zeile wurde übersprungen.`);
      continue;
    }

    const clientNameNorm = normalizeVmNameForMatch(clientName);
    const mappedFields = mapTechInfoClientDisplayFields(row);
    fullRows.push({
      techInfoClientImportId,
      rowIndex: i,
      clientName,
      clientNameNorm,
      importedAt,
      rawData: toRawRowData(row),
    });

    latestCandidates.set(clientNameNorm, {
      clientNameNorm,
      clientName,
      importedAt,
      techInfoClientImportId,
      rowIndex: i,
      ...mappedFields,
    });
  }

  await batchPutTechInfoClientRows(fullRows, 5000);

  report("Tech-Info-Client Latest aktualisieren", 75);
  const clientNameNorms = [...latestCandidates.keys()];
  const existingLatest = await getTechInfoClientLatestByClientNames(clientNameNorms);
  const existingMap = new Map(existingLatest.map((entry) => [entry.clientNameNorm, entry]));
  const latestUpdates: TechInfoClientLatest[] = [];
  for (const [clientNameNorm, candidate] of latestCandidates.entries()) {
    const current = existingMap.get(clientNameNorm);
    const shouldReplace = isTechInfoNewerOrEqual(candidate.importedAt, current?.importedAt);
    if (shouldReplace) latestUpdates.push(candidate);
  }
  if (latestUpdates.length > 0) {
    await batchPutTechInfoClientLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} Tech-Info-Client Zeilen`);
  return { success: true, fileKind: "tech-info-client", warnings, errors, sheetStats };
}

const CDP_UI_HEADERS = [
  "vCenter", "Cluster", "HostConnectionState", "LinkStatus", "MACAddress",
  "CDPPortID", "CDPManagementIP", "CDPSwitchAddress", "CDPHardwarePlatform",
  "CDPSoftwareVersion", "CDPNativeVLAN", "CDPMTU", "QueryStatus",
] as const;

function findCdpSheet(sheets: ParsedSheetData[]): ParsedSheetData | undefined {
  return sheets.find((sheet) =>
    CDP_REQUIRED_HEADERS.every((header) => sheet.headers.includes(header)),
  );
}

export async function importCdpCsv(
  file: File,
  checksum: string,
  parsed: WorkerParseResult,
  warnings: string[],
  errors: string[],
  report: (step: string, percent: number, detail?: string) => void,
): Promise<ImportResult> {
  const existing = await getCdpImportByChecksum(checksum);
  if (existing) {
    return {
      success: false,
      fileKind: "cdp",
      warnings: [],
      errors: ["Diese CDP-Datei wurde bereits importiert."],
    };
  }

  const cdpSheet = findCdpSheet(parsed.sheets);
  if (!cdpSheet) {
    return {
      success: false,
      fileKind: "cdp",
      warnings,
      errors: [...errors, "Keine gültige CDP-CSV erkannt (erwartete Spalten: VMHost, PhysicalAdapter, CDPDeviceID, CDPAvailable)."],
    };
  }

  for (const header of CDP_UI_HEADERS) {
    if (!cdpSheet.headers.includes(header)) {
      warnings.push(`CDP Spalte "${header}" fehlt. Wert wird als leer übernommen.`);
    }
  }

  const importedAt = new Date().toISOString();
  const cdpImportId = shortId();
  const sheetStats: Record<string, SheetStats> = {
    [cdpSheet.sheetName]: { rowCount: cdpSheet.rows.length, columnCount: cdpSheet.headers.length },
  };

  report("CDP Metadaten speichern", 35);
  await putCdpImport({
    cdpImportId,
    importedAt,
    fileName: file.name,
    fileChecksum: checksum,
    rowCount: cdpSheet.rows.length,
    columnCount: cdpSheet.headers.length,
  });

  report("CDP Zeilen speichern", 45, `${cdpSheet.rows.length.toLocaleString("de-DE")} Zeilen...`);
  const fullRows: CdpRow[] = [];
  const latestCandidates = new Map<string, CdpLatest>();
  for (let i = 0; i < cdpSheet.rows.length; i++) {
    const row = cdpSheet.rows[i];
    const host = toStr(row["VMHost"]);
    const adapter = toStr(row["PhysicalAdapter"]);
    if (!host || !adapter) {
      warnings.push(`CDP Zeile ${i + 1}: VMHost oder PhysicalAdapter ist leer, Zeile wurde übersprungen.`);
      continue;
    }

    const hostNorm = normalizeVmNameForMatch(host);
    const hostAdapterKey = buildHostAdapterKey(host, adapter);
    fullRows.push({
      cdpImportId,
      rowIndex: i,
      host,
      hostNorm,
      adapter,
      hostAdapterKey,
      importedAt,
      rawData: toRawRowData(row),
    });

    latestCandidates.set(hostAdapterKey, {
      hostAdapterKey,
      hostNorm,
      host,
      adapter,
      importedAt,
      cdpImportId,
      rowIndex: i,
      ...mapCdpDisplayFields(row),
    });
  }

  await batchPutCdpRows(fullRows, 5000);

  report("CDP Latest aktualisieren", 75);
  const existingLatest = await getCdpLatestByHostAdapterKeys([...latestCandidates.keys()]);
  const existingMap = new Map(existingLatest.map((entry) => [entry.hostAdapterKey, entry]));
  const latestUpdates: CdpLatest[] = [];
  for (const [key, candidate] of latestCandidates.entries()) {
    if (isTechInfoNewerOrEqual(candidate.importedAt, existingMap.get(key)?.importedAt)) {
      latestUpdates.push(candidate);
    }
  }
  if (latestUpdates.length > 0) {
    await batchPutCdpLatest(latestUpdates, 2000);
  }

  report("Abgeschlossen", 100, `${fullRows.length.toLocaleString("de-DE")} CDP Zeilen`);
  return { success: true, fileKind: "cdp", warnings, errors, sheetStats };
}
