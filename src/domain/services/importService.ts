import {
  getSnapshotsByChecksum,
  putSnapshot,
  batchPut,
  getTechInfoImportByChecksum,
  putTechInfoImport,
  batchPutTechInfoRows,
  batchPutTechInfoLatest,
  getTechInfoLatestByVmNames,
} from "@/data/db";
import {
  computeChecksum,
  toNumber,
  toBool,
  toStr,
  parseEsxVersionBuild,
  parseRvtoolsExportFileName,
  mapTechInfoDisplayFields,
  normalizeVmNameForMatch,
  isTechInfoNewerOrEqual,
} from "@/lib/xlsx/parseHelpers";
import type {
  ImportResult,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  SheetRow,
  SheetStats,
  ParsedSheetData,
  WorkerParseResult,
  TechInfoLatest,
  TechInfoRow,
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

const TECH_INFO_REQUIRED_HEADERS = ["Name", "Wartungsfenster", "Betriebssystem"] as const;
const TECH_INFO_UI_HEADERS = [
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

function normalizeSnapshots(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedSnapshot[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => ({
    snapshotId,
    vcenterId,
    vmName: String(row["VM"] || row["VM Name"] || "unknown"),
    snapshotName: toStr(row["Snapshot Name"] || row["Name"]),
    description: toStr(row["Description"]),
    dateTaken: toStr(row["Date / time"] || row["Date"]),
    sizeMiB: toNumber(row["Size MiB"] || row["Size MB"] || row["Size"]),
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
      return importTechInfoXlsx(file, checksum, parsed, warnings, errors, report);
    }

    return importRvtoolsParsed(file, checksum, parsed, warnings, errors, report);
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

  const snapshotId = crypto.randomUUID();
  const fileMeta = parseRvtoolsExportFileName(file.name);
  const vcenterDisplayName = (fileMeta?.vcenterName || parsed.vcenterName || "unknown-vcenter").trim();
  const exportTs = fileMeta?.exportTs || parsed.exportTs || new Date().toISOString();
  const vcenterId = vcenterDisplayName.toLowerCase().replace(/[^a-z0-9.-]/g, "_") || "unknown-vcenter";

  const sheetStats: Record<string, SheetStats> = {};
  for (const sheet of parsed.sheets) {
    sheetStats[sheet.sheetName] = { rowCount: sheet.rows.length, columnCount: sheet.headers.length };
  }

  report("Metadaten speichern", 35);
  await putSnapshot({
    snapshotId,
    vcenterId,
    vcenterDisplayName,
    exportTs,
    importedAt: new Date().toISOString(),
    fileName: file.name,
    fileChecksum: checksum,
    sheetStats,
  });

  report("Rohdaten speichern", 40, `${totalRows.toLocaleString("de-DE")} Zeilen...`);
  const CHUNK = 5000;
  const rawRows: SheetRow[] = [];
  for (const sheet of parsed.sheets) {
    for (let i = 0; i < sheet.rows.length; i++) {
      rawRows.push({
        snapshotId,
        sheetName: sheet.sheetName,
        rowIndex: i,
        data: sheet.rows[i] as Record<string, string | number | boolean | null>,
      });
    }
  }

  for (let i = 0; i < rawRows.length; i += CHUNK) {
    const batch = rawRows.slice(i, i + CHUNK);
    await batchPut("rawSheets", batch, CHUNK);
    const pct = 40 + Math.round((i / Math.max(rawRows.length, 1)) * 30);
    report(
      "Rohdaten speichern",
      Math.min(pct, 69),
      `${Math.min(i + CHUNK, rawRows.length).toLocaleString("de-DE")} / ${rawRows.length.toLocaleString("de-DE")}`,
    );
  }

  report("Normalisieren", 70, "VMs...");
  const vms = normalizeVms(findSheet(parsed.sheets, "vInfo"), snapshotId, vcenterId);

  report("Normalisieren", 75, "Hosts & Cluster...");
  const hosts = normalizeHosts(findSheet(parsed.sheets, "vHost"), snapshotId, vcenterId);
  const clusters = normalizeClusters(findSheet(parsed.sheets, "vCluster"), snapshotId, vcenterId);

  report("Normalisieren", 78, "Datastores...");
  const datastores = normalizeDatastores(findSheet(parsed.sheets, "vDatastore"), snapshotId, vcenterId);

  report("Normalisieren", 80, "Snapshots & Health...");
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

  for (const eb of entityBatches) {
    if (eb.items.length > 0) {
      report("Entitäten speichern", eb.pctStart, `${eb.items.length.toLocaleString("de-DE")} ${eb.name}`);
      if (eb.store === "entities_vm") await batchPut("entities_vm", eb.items, 3000);
      if (eb.store === "entities_host") await batchPut("entities_host", eb.items, 3000);
      if (eb.store === "entities_cluster") await batchPut("entities_cluster", eb.items, 3000);
      if (eb.store === "entities_datastore") await batchPut("entities_datastore", eb.items, 3000);
      if (eb.store === "entities_snapshot") await batchPut("entities_snapshot", eb.items, 3000);
      if (eb.store === "entities_health") await batchPut("entities_health", eb.items, 3000);
    }
  }

  report("Abgeschlossen", 100, `${vms.length.toLocaleString("de-DE")} VMs, ${hosts.length} Hosts`);

  return { success: true, fileKind: "rvtools", snapshotId, warnings, errors, sheetStats };
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
  const techInfoImportId = crypto.randomUUID();
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
