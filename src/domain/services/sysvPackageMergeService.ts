import type {
  ImportedSysvPackage,
  NormalizedHealth,
  NormalizedSnapshot,
  NormalizedVm,
  RawSheetBlob,
  RestrictedDatasetSource,
  SnapshotMeta,
  SysvDataPackageScope,
  TechInfoImportMeta,
  TechInfoLatest,
  TechInfoRow,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsRelationshipIssue,
  VropsTimeSeriesSummary,
} from "@/domain/models/types";
import { toVropsTimeSeriesMetricColumns } from "@/domain/services/vropsTimeSeriesSchema";
import {
  mergeVropsTimeSeriesChunksWithWarnings,
  type SysvDataPackagePayload,
  type SysvDataPackageVropsPayload,
  type ValidatedSysvDataPackagePayload,
  validateSysvDataPackageZip,
} from "@/lib/export/sysvDataPackageFormat";
import type { DiscoveredSysvPackage } from "@/lib/export/sysvDataPackageContainer";
import { sortedStrings } from "@/domain/services/sysvDataPackageService";
import { gzipJson } from "@/lib/compression";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import { shortId } from "@/lib/shortId";

export interface SysvPackageMergeInput {
  path: string;
  validated: ValidatedSysvDataPackagePayload;
}

export interface SysvPackageMergeResult {
  payload: SysvDataPackagePayload;
  rawSheetBlobs: RawSheetBlob[];
  techInfoImports: TechInfoImportMeta[];
  techInfoRows: TechInfoRow[];
  techInfoLatest: TechInfoLatest[];
  vrops: SysvDataPackageVropsPayload | undefined;
  importedPackages: ImportedSysvPackage[];
  warnings: string[];
}

const SCOPE_RANK: Record<SysvDataPackageScope["kind"], number> = {
  person: 1,
  department: 2,
  area: 3,
};

function sourceFromManifest(manifest: ValidatedSysvDataPackagePayload["manifest"]): RestrictedDatasetSource {
  return {
    kind: "sysv-package",
    packageId: manifest.packageId,
    packageVersion: 1,
    scopeKind: manifest.scope.kind,
    scopeLabel: manifest.scope.displayName,
    dataPolicy: "strict-vm-scope-v1",
    sharedCapacityContext: true,
  };
}

function compareSources(left: RestrictedDatasetSource, right: RestrictedDatasetSource): number {
  const rank = SCOPE_RANK[right.scopeKind] - SCOPE_RANK[left.scopeKind];
  if (rank !== 0) return rank;
  const label = left.scopeLabel.localeCompare(right.scopeLabel, "de-DE", { sensitivity: "base" });
  return label !== 0 ? label : left.packageId.localeCompare(right.packageId);
}

function snapshotEntityKey(row: NormalizedSnapshot): string {
  return [
    row.snapshotId,
    normalizeVmNameForMatch(row.vmName),
    row.snapshotName ?? "",
    row.dateTaken ?? "",
  ].join("\u0000");
}

function healthKey(row: NormalizedHealth): string {
  return [row.snapshotId, row.entity ?? "", row.messageType ?? "", row.message ?? ""].join("\u0000");
}

function rawSheetKey(snapshotId: string, sheetName: string): string {
  return `${snapshotId}\u0000${sheetName}`;
}

function metricMissingValueCount(chunk: VropsTimeSeriesChunk): number {
  let missing = 0;
  for (const buffer of Object.values(chunk.metricValues)) {
    if (!buffer) continue;
    const values = new Float32Array(buffer);
    for (let index = 0; index < values.length; index += 1) {
      if (Number.isNaN(values[index])) missing += 1;
    }
  }
  return missing;
}

function describeMergedVropsSource(importId: string, chunks: readonly VropsTimeSeriesChunk[]): VropsTimeSeriesImport["files"] {
  let sizeBytes = 0;
  let rowCount = 0;
  const metrics = new Set<string>();
  for (const chunk of chunks) {
    rowCount += chunk.objectKeys.length * chunk.slotCount;
    for (const [metric, buffer] of Object.entries(chunk.metricValues)) {
      if (!buffer) continue;
      metrics.add(metric);
      sizeBytes += buffer.byteLength;
    }
    sizeBytes += chunk.maintenanceCodes?.byteLength ?? 0;
    sizeBytes += chunk.maintenanceDerived?.byteLength ?? 0;
  }
  return [{
    objectType: "vm",
    fileName: `${importId}_vm-zeitreihen`,
    fileSizeBytes: sizeBytes,
    fileChecksum: importId,
    rowCount,
    columnCount: metrics.size,
    // Spaltennamen statt interner Schlüssel: Nur so erkennen die Ansichten die
    // enthaltenen Metriken wieder (siehe `toVropsTimeSeriesMetricColumns`).
    detectedColumns: toVropsTimeSeriesMetricColumns(metrics),
    status: "accepted",
  }];
}

function mergeVrops(
  inputs: readonly SysvPackageMergeInput[],
  warnings: string[],
): SysvDataPackageVropsPayload | undefined {
  const sources = inputs.filter((input) => input.validated.payload.vrops).map((input) => input.validated.payload.vrops!);
  if (sources.length === 0) return undefined;
  const importId = `sysv-merge:${shortId()}:vrops`;
  const first = sources[0].importMeta;
  const objectMap = new Map<string, VropsTimeSeriesImportedObject>();
  const summaryMap = new Map<string, VropsTimeSeriesSummary>();
  const chunks: VropsTimeSeriesChunk[] = [];
  const snapshotIds = new Set<string>();
  const relationshipIssues = new Map<string, VropsRelationshipIssue>();

  for (const source of sources) {
    source.importMeta.rvtoolsSnapshotIds.forEach((snapshotId) => snapshotIds.add(snapshotId));
    for (const object of source.objects) objectMap.set(object.objectKey, object);
    for (const summary of source.summaries) summaryMap.set(summary.objectKey, summary);
    chunks.push(...source.chunks);
    for (const issue of source.importMeta.relationshipIssues ?? []) {
      relationshipIssues.set(`${issue.code}\u0000${issue.objectKey ?? ""}\u0000${issue.message}`, issue);
    }
  }

  const mergedChunks = mergeVropsTimeSeriesChunksWithWarnings(chunks, importId);
  warnings.push(...mergedChunks.warnings);
  const mergedObjects = [...objectMap.values()].map((object) => ({ ...object, importId }));
  const mergedSummaries = [...summaryMap.values()].map((summary) => ({ ...summary, importId, metricStats: { ...summary.metricStats } }));
  const expectedSlots = first.expectedSlots;
  const qualitySummary = {
    objectCountByType: { vm: mergedObjects.length, cluster: 0, host: 0 } as Record<"vm" | "cluster" | "host", number>,
    expectedSlots,
    errorCount: 0,
    warningCount: mergedChunks.warnings.length,
    missingValueCount: mergedChunks.chunks.reduce((sum, chunk) => sum + metricMissingValueCount(chunk), 0),
  };
  const importMeta: VropsTimeSeriesImport = {
    ...first,
    id: importId,
    importedAt: new Date().toISOString(),
    rvtoolsSnapshotIds: sortedStrings(snapshotIds),
    rangeStartUtc: Math.min(...sources.map((source) => source.importMeta.rangeStartUtc)),
    rangeEndUtc: Math.max(...sources.map((source) => source.importMeta.rangeEndUtc)),
    fileSetChecksum: importId,
    validationStatus: "relationships-partial",
    qualitySummary,
    files: describeMergedVropsSource(importId, mergedChunks.chunks),
    relationshipIssues: [...relationshipIssues.values()].map((issue) => ({ ...issue })),
  };
  return { importMeta, objects: mergedObjects, chunks: mergedChunks.chunks, summaries: mergedSummaries };
}

function assertExportGeneration(inputs: readonly SysvPackageMergeInput[]): void {
  const snapshotByVcenter = new Map<string, string>();
  for (const input of inputs) {
    for (const snapshot of input.validated.payload.snapshots) {
      const previous = snapshotByVcenter.get(snapshot.vcenterId);
      if (previous && previous !== snapshot.snapshotId) {
        throw new Error("Die Pakete stammen aus unterschiedlichen Exportläufen.");
      }
      snapshotByVcenter.set(snapshot.vcenterId, snapshot.snapshotId);
    }
  }
}

function assertPackagePolicy(input: SysvPackageMergeInput): void {
  const { manifest } = input.validated;
  if (manifest.version !== 1) throw new Error(`Paket ${input.path || manifest.packageId} verwendet eine nicht unterstützte Formatversion.`);
  if (manifest.dataPolicy !== "strict-vm-scope-v1") throw new Error(`Paket ${input.path || manifest.packageId} verwendet eine abweichende Datenrichtlinie.`);
}

/** Validiert alle Blätter vor dem Merge und schreibt noch keine IndexedDB-Daten. */
export async function validateAndMergeSysvPackages(
  packages: readonly DiscoveredSysvPackage[],
): Promise<SysvPackageMergeResult> {
  if (packages.length === 0) throw new Error("Es wurde kein SysV-Datenpaket gefunden.");
  const uniquePackageMap = new Map<string, DiscoveredSysvPackage>();
  for (const packageFile of packages) {
    if (!uniquePackageMap.has(packageFile.manifest.packageId)) uniquePackageMap.set(packageFile.manifest.packageId, packageFile);
  }
  const uniquePackages = [...uniquePackageMap.values()];
  const inputs: SysvPackageMergeInput[] = [];
  for (const packageFile of uniquePackages) {
    let validated: ValidatedSysvDataPackagePayload;
    try {
      validated = await validateSysvDataPackageZip(packageFile.bytes);
    } catch (error) {
      throw new Error(`Paket ${packageFile.path} ist ungültig: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Die Policy wird bewusst am validierten Manifest geprüft, nicht am Discovery-Manifest.
    const input = { path: packageFile.path, validated };
    assertPackagePolicy(input);
    inputs.push(input);
  }
  return mergeValidatedSysvPackages(inputs);
}

/** Führt bereits validierte Paketpayloads deterministisch und atomar vorbereitbar zusammen. */
export async function mergeValidatedSysvPackages(
  inputs: readonly SysvPackageMergeInput[],
): Promise<SysvPackageMergeResult> {
  if (inputs.length === 0) throw new Error("Es wurde kein SysV-Datenpaket zur Vereinigung übergeben.");
  assertExportGeneration(inputs);
  const warnings: string[] = [];

  const snapshots = new Map<string, SnapshotMeta>();
  const sourcesBySnapshot = new Map<string, Map<string, RestrictedDatasetSource>>();
  const vms = new Map<string, NormalizedVm>();
  const vmScopes = new Map<string, Set<string>>();
  const hosts = new Map<string, SysvDataPackagePayload["hosts"][number]>();
  const clusters = new Map<string, SysvDataPackagePayload["clusters"][number]>();
  const datastores = new Map<string, SysvDataPackagePayload["datastores"][number]>();
  const snapshotEntities = new Map<string, NormalizedSnapshot & { id?: number }>();
  const health = new Map<string, NormalizedHealth & { id?: number }>();
  const rawSheets = new Map<string, { snapshotId: string; sheetName: string; headers: string[]; values: Array<Array<string | number | boolean | null>>; seen: Set<string> }>();
  const techInfoImports = new Map<string, TechInfoImportMeta>();
  const techInfoRows = new Map<string, TechInfoRow>();
  const latestByVm = new Map<string, { latest: TechInfoLatest; source: RestrictedDatasetSource }>();
  const importedPackages: ImportedSysvPackage[] = [];

  for (const input of inputs) {
    const { manifest, payload } = input.validated;
    const source = sourceFromManifest(manifest);
    const packageVmKeys = sortedStrings(payload.vms.map((vm) => vm.vmKey));
    importedPackages.push({
      packageId: manifest.packageId,
      scopeKind: manifest.scope.kind,
      scopeLabel: manifest.scope.displayName,
      createdAt: manifest.createdAt,
      importedAt: new Date().toISOString(),
      containerPath: input.path.includes("/") ? input.path : "",
      vmCount: packageVmKeys.length,
      vmKeys: packageVmKeys,
    });

    for (const snapshot of payload.snapshots) {
      const current = snapshots.get(snapshot.snapshotId);
      snapshots.set(snapshot.snapshotId, { ...(current ?? snapshot), ...snapshot });
      const sourceMap = sourcesBySnapshot.get(snapshot.snapshotId) ?? new Map<string, RestrictedDatasetSource>();
      sourceMap.set(source.packageId, source);
      sourcesBySnapshot.set(snapshot.snapshotId, sourceMap);
    }
    for (const vm of payload.vms) {
      vms.set(vm.vmKey, { ...vms.get(vm.vmKey), ...vm });
      const scopeSet = vmScopes.get(vm.vmKey) ?? new Set<string>();
      scopeSet.add(source.scopeLabel);
      vmScopes.set(vm.vmKey, scopeSet);
    }
    for (const host of payload.hosts) hosts.set(host.hostKey, host);
    for (const cluster of payload.clusters) clusters.set(cluster.clusterKey, cluster);
    for (const datastore of payload.datastores) datastores.set(datastore.dsKey, datastore);
    for (const row of payload.snapshotsEntities) snapshotEntities.set(snapshotEntityKey(row), row);
    for (const row of payload.health) health.set(healthKey(row), row);

    for (const sheet of payload.rawSheets) {
      const key = rawSheetKey(sheet.snapshotId, sheet.sheetName);
      const current = rawSheets.get(key);
      if (current && JSON.stringify(current.headers) !== JSON.stringify(sheet.headers)) {
        throw new Error(`Raw-Sheet ${sheet.sheetName} des Snapshots ${sheet.snapshotId} hat widersprüchliche Header.`);
      }
      const target = current ?? { snapshotId: sheet.snapshotId, sheetName: sheet.sheetName, headers: [...sheet.headers], values: [], seen: new Set<string>() };
      for (const values of sheet.values) {
        const rowKey = JSON.stringify(values);
        if (target.seen.has(rowKey)) continue;
        target.seen.add(rowKey);
        target.values.push(values);
      }
      rawSheets.set(key, target);
    }

    techInfoImports.set(payload.techInfo.importMeta.techInfoImportId, payload.techInfo.importMeta);
    for (const row of payload.techInfo.rows) techInfoRows.set(`${row.techInfoImportId}\u0000${row.rowIndex}`, row);
    for (const latest of payload.techInfo.latest) {
      const row = techInfoRows.get(`${latest.techInfoImportId}\u0000${latest.rowIndex}`);
      if (!row) throw new Error(`Tech-Info-Pointer für „${latest.vmName}“ zeigt auf keine übernommene Zeile.`);
      if (normalizeVmNameForMatch(row.vmName) !== normalizeVmNameForMatch(latest.vmName)) {
        throw new Error(`Tech-Info-Pointer für „${latest.vmName}“ zeigt auf eine fremde Zeile.`);
      }
      const existing = latestByVm.get(latest.vmNameNorm);
      if (!existing || compareSources(source, existing.source) < 0) latestByVm.set(latest.vmNameNorm, { latest, source });
    }
  }

  const mergedSnapshots = [...snapshots.values()].map((snapshot) => {
    const sources = [...(sourcesBySnapshot.get(snapshot.snapshotId)?.values() ?? [])]
      .sort(compareSources);
    return {
      ...snapshot,
      restrictedDataset: sources[0],
      restrictedDatasetSources: sources,
      sheetStats: {},
    };
  });
  const mergedRawSheets: SysvDataPackagePayload["rawSheets"] = [...rawSheets.values()]
    .map(({ seen: _seen, ...sheet }) => ({ ...sheet, sheetStats: { rowCount: sheet.values.length, columnCount: sheet.headers.length } }))
    .sort((left, right) => rawSheetKey(left.snapshotId, left.sheetName).localeCompare(rawSheetKey(right.snapshotId, right.sheetName)));
  const sheetStatsBySnapshot = new Map<string, Record<string, { rowCount: number; columnCount: number }>>();
  for (const sheet of mergedRawSheets) {
    const stats = sheetStatsBySnapshot.get(sheet.snapshotId) ?? {};
    stats[sheet.sheetName] = sheet.sheetStats!;
    sheetStatsBySnapshot.set(sheet.snapshotId, stats);
  }
  const finalSnapshots = mergedSnapshots.map((snapshot) => ({ ...snapshot, sheetStats: sheetStatsBySnapshot.get(snapshot.snapshotId) ?? {} }));
  const rawSheetBlobs: RawSheetBlob[] = await Promise.all(mergedRawSheets.map(async (sheet) => ({
    snapshotId: sheet.snapshotId,
    sheetName: sheet.sheetName,
    headers: [...sheet.headers],
    rowCount: sheet.values.length,
    codec: "gzip-json-v1" as const,
    data: await gzipJson(sheet.values),
  })));

  const mergedVms = [...vms.values()].map((vm) => ({
    ...vm,
    sysvPackageScopes: sortedStrings(vmScopes.get(vm.vmKey) ?? []),
  }));
  const mergedTechInfoRows = [...techInfoRows.values()];
  const mergedTechInfoLatest = [...latestByVm.values()]
    .map(({ latest }) => latest)
    .sort((left, right) => left.vmNameNorm.localeCompare(right.vmNameNorm, "de-DE"));
  const preferredImport = [...techInfoImports.values()].sort((left, right) => left.techInfoImportId.localeCompare(right.techInfoImportId))[0];
  const mergedVrops = mergeVrops(inputs, warnings);
  const payload: SysvDataPackagePayload = {
    snapshots: finalSnapshots,
    rawSheets: mergedRawSheets,
    vms: mergedVms,
    hosts: [...hosts.values()],
    clusters: [...clusters.values()],
    datastores: [...datastores.values()],
    snapshotsEntities: [...snapshotEntities.values()].map(({ id: _id, ...row }) => row),
    health: [...health.values()].map(({ id: _id, ...row }) => row),
    techInfo: {
      importMeta: preferredImport ?? ({} as TechInfoImportMeta),
      rows: mergedTechInfoRows,
      latest: mergedTechInfoLatest,
    },
    ...(mergedVrops ? { vrops: mergedVrops } : {}),
  };

  return {
    payload,
    rawSheetBlobs,
    techInfoImports: [...techInfoImports.values()],
    techInfoRows: mergedTechInfoRows,
    techInfoLatest: mergedTechInfoLatest,
    vrops: mergedVrops,
    importedPackages,
    warnings,
  };
}
