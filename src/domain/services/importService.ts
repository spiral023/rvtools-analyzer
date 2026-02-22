import { getSnapshotsByChecksum, putSnapshot, batchPut } from "@/data/db";
import { computeChecksum, toNumber, toBool, toStr } from "@/lib/xlsx/parseHelpers";
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
} from "@/domain/models/types";

function createWorker(): Worker {
  return new Worker(
    new URL("../../workers/parser.worker.ts", import.meta.url),
    { type: "module" }
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
    worker.onerror = (err) => { worker.terminate(); reject(err); };
    worker.postMessage({ type: "PARSE_FILE", payload: { buffer } }, [buffer]);
  });
}

function findSheet(sheets: ParsedSheetData[], name: string): ParsedSheetData | undefined {
  return sheets.find((s) => s.sheetName === name);
}

function normalizeVms(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedVm[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const vmUuid = toStr(row["VM UUID"]);
    const vmName = String(row["VM"] || row["Name"] || "unknown");
    return {
      snapshotId, vcenterId,
      vmKey: `${vmUuid || vmName}::${vcenterId}`,
      vmUuid, vmName,
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
    return {
      snapshotId, vcenterId,
      hostKey: `${host}::${vcenterId}`, host,
      cluster: toStr(row["Cluster"]),
      datacenter: toStr(row["Datacenter"]),
      cpuModel: toStr(row["CPU Model"]),
      cpuTotalMHz: toNumber(row["Speed"] || row["CPU Speed"]),
      cpuCores: toNumber(row["# Cores"] || row["Cores"]),
      cpuThreads: toNumber(row["# Threads"]),
      memoryTotalMiB: toNumber(row["Memory"] || row["# Memory"]),
      version: toStr(row["Version"]),
      build: toStr(row["Build"]),
      vendor: toStr(row["Vendor"]),
      model: toStr(row["Model"]),
      connectionState: toStr(row["Connection state"]),
      powerState: toStr(row["Power state"]),
      maintenanceMode: toStr(row["Maintenance Mode"]),
      vmCount: toNumber(row["# VMs"]),
    };
  });
}

function normalizeClusters(sheet: ParsedSheetData | undefined, snapshotId: string, vcenterId: string): NormalizedCluster[] {
  if (!sheet) return [];
  return sheet.rows.map((row) => {
    const name = String(row["Name"] || row["Cluster"] || "unknown");
    return {
      snapshotId, vcenterId,
      clusterKey: `${name}::${vcenterId}`, name,
      datacenter: toStr(row["Datacenter"]),
      haEnabled: toBool(row["HA enabled"]),
      drsEnabled: toBool(row["DRS enabled"]),
      numHosts: toNumber(row["NumHosts"] || row["# Hosts"]),
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
      snapshotId, vcenterId,
      dsKey: `${name}::${vcenterId}`, name,
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
    snapshotId, vcenterId,
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
    snapshotId, vcenterId,
    entity: toStr(row["Entity"] || row["Name"]),
    messageType: toStr(row["Message type"] || row["Type"] || row["Status"]),
    message: toStr(row["Message"]),
  }));
}

export async function importRvtoolsXlsx(file: File): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const checksum = await computeChecksum(buffer);

    const existing = await getSnapshotsByChecksum(checksum);
    if (existing) {
      return { success: false, snapshotId: existing.snapshotId, warnings: [], errors: ["Diese Datei wurde bereits importiert."] };
    }

    const parsed = await workerParse(buffer);
    warnings.push(...parsed.warnings);
    errors.push(...parsed.errors);

    const snapshotId = crypto.randomUUID();
    const vcenterId = parsed.vcenterName.toLowerCase().replace(/[^a-z0-9.-]/g, "_");

    const sheetStats: Record<string, SheetStats> = {};
    for (const sheet of parsed.sheets) {
      sheetStats[sheet.sheetName] = { rowCount: sheet.rows.length, columnCount: sheet.headers.length };
    }

    await putSnapshot({
      snapshotId, vcenterId,
      vcenterDisplayName: parsed.vcenterName,
      exportTs: parsed.exportTs,
      importedAt: new Date().toISOString(),
      fileName: file.name,
      fileChecksum: checksum,
      sheetStats,
    });

    const rawRows: SheetRow[] = [];
    for (const sheet of parsed.sheets) {
      for (let i = 0; i < sheet.rows.length; i++) {
        rawRows.push({
          snapshotId, sheetName: sheet.sheetName, rowIndex: i,
          data: sheet.rows[i] as Record<string, string | number | boolean | null>,
        });
      }
    }
    await batchPut("rawSheets", rawRows);

    const vms = normalizeVms(findSheet(parsed.sheets, "vInfo"), snapshotId, vcenterId);
    const hosts = normalizeHosts(findSheet(parsed.sheets, "vHost"), snapshotId, vcenterId);
    const clusters = normalizeClusters(findSheet(parsed.sheets, "vCluster"), snapshotId, vcenterId);
    const datastores = normalizeDatastores(findSheet(parsed.sheets, "vDatastore"), snapshotId, vcenterId);
    const vmSnapshots = normalizeSnapshots(findSheet(parsed.sheets, "vSnapshot"), snapshotId, vcenterId);
    const healthEvents = normalizeHealth(findSheet(parsed.sheets, "vHealth"), snapshotId, vcenterId);

    await Promise.all([
      batchPut("entities_vm", vms),
      batchPut("entities_host", hosts),
      batchPut("entities_cluster", clusters),
      batchPut("entities_datastore", datastores),
      batchPut("entities_snapshot", vmSnapshots),
      batchPut("entities_health", healthEvents),
    ]);

    return { success: true, snapshotId, warnings, errors, sheetStats };
  } catch (err) {
    return { success: false, warnings, errors: [...errors, err instanceof Error ? err.message : String(err)] };
  }
}
