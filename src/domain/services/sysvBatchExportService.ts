import type {
  SysvBatchReport,
  SysvBatchReportSkip,
  SysvDataPackageScope,
} from "@/domain/models/types";
import {
  buildSysvDataPackageFileName,
  loadSysvDataPackageSource,
  matchScopeVmsToRvtools,
  resolveSysvDataPackageFromSource,
  sysvScopeSlug,
  type SysvDataPackagePreview,
  type SysvDataPackageSource,
} from "@/domain/services/sysvDataPackageService";
import { buildSysvDataPackageScopeDirectory, resolveSysvDataPackageVmNames, sysvDataPackageScopeKey, type SysvDataPackageScopeNode } from "@/lib/sysvDataPackageScope";
import { serializeSysvDataPackage, zipSysvDataPackage, MAX_SYSV_PACKAGE_COMPRESSED_BYTES } from "@/lib/export/sysvDataPackageFormat";
import { buildSysvBatchReportCsv, MAX_SYSV_CONTAINER_COMPRESSED_BYTES } from "@/lib/export/sysvDataPackageContainer";
import { getAllTechInfoLatest, getBySnapshotIds, getSnapshots } from "@/data/db";
import { normalizeVmNameForMatch } from "@/lib/xlsx/parseHelpers";
import type { NormalizedVm } from "@/domain/models/types";

/** Dieselbe Grenze, die der Import in `sysvDataPackageContainer` durchsetzt. */
export const MAX_SYSV_BATCH_CONTAINER_BYTES = MAX_SYSV_CONTAINER_COMPRESSED_BYTES;
export const SYSV_BATCH_SIZE_WARNING_BYTES = 500_000_000;

export interface SysvBatchExportRequest {
  level: "person" | "department" | "area";
  /** Auf diesen Teilbaum begrenzen; leer bedeutet den gesamten Bestand. */
  root?: SysvDataPackageScope;
  includeVropsTimeSeries: boolean;
}

export type SysvBatchProgressStep =
  | "Datenbasis laden"
  | "Zielscopes bestimmen"
  | "Paket erzeugen"
  | "Container komprimieren"
  | "Download vorbereiten";

export interface SysvBatchProgress {
  step: SysvBatchProgressStep;
  percent: number;
  detail?: string;
  completedPackages?: number;
  totalPackages?: number;
}

export interface SysvBatchScopeTarget {
  scope: SysvDataPackageScope;
  path: string;
  parentDepartmentScope?: Extract<SysvDataPackageScope, { kind: "department" }>;
}

/** Schlanke Vorschau: Sie lädt keine Rohblätter und erzeugt keine Paketnutzlasten. */
export interface SysvBatchScopePreview {
  target: SysvBatchScopeTarget;
  vmCount: number;
}

export interface SysvBatchPreviewResult {
  level: SysvBatchExportRequest["level"];
  rootLabel: string;
  targets: SysvBatchScopePreview[];
  skipped: SysvBatchReportSkip[];
  /** Die exakte Größe wird erst im Worker beim Erzeugen bestimmt, ohne die Vorschau zu blockieren. */
  estimatedCompressedBytes: null;
  estimatedUncompressedBytes: null;
  uniqueVmCount: number;
}

function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Batch-Export wurde abgebrochen.");
}

function rootAllows(
  root: SysvDataPackageScope | undefined,
  ancestors: { area?: SysvDataPackageScope; department?: SysvDataPackageScope; person?: SysvDataPackageScope },
  current: SysvDataPackageScope,
): boolean {
  if (!root) return true;
  if (root.kind === "area") return sysvDataPackageScopeKey(root) === sysvDataPackageScopeKey(ancestors.area ?? current);
  if (root.kind === "department") return sysvDataPackageScopeKey(root) === sysvDataPackageScopeKey(ancestors.department ?? current);
  return current.kind === "person" && sysvDataPackageScopeKey(root) === sysvDataPackageScopeKey(current);
}

const SCOPE_DEPTH: Record<SysvDataPackageScope["kind"], number> = {
  area: 0,
  department: 1,
  person: 2,
};

/** Ordnerebene je Scope-Art; gleichzeitig der Marker, ab dem der Containerpfad beginnt. */
const SCOPE_FOLDER: Record<SysvDataPackageScope["kind"], string> = {
  area: "bereiche",
  department: "abteilungen",
  person: "systemverantwortliche",
};

function includesScopeAtLevel(kind: SysvDataPackageScope["kind"], level: SysvBatchExportRequest["level"]): boolean {
  return SCOPE_DEPTH[kind] >= SCOPE_DEPTH[level];
}

function targetPath(
  folders: readonly string[],
  scope: SysvDataPackageScope,
  level: SysvBatchExportRequest["level"],
  date: Date,
): string {
  const start = folders.indexOf(SCOPE_FOLDER[level]);
  const relativeFolders = start >= 0 ? folders.slice(start) : folders;
  return [...relativeFolders, buildSysvDataPackageFileName(scope, date)].join("/");
}

export function buildSysvBatchScopeTargets(
  source: SysvDataPackageSource,
  request: SysvBatchExportRequest,
  date: Date,
): SysvBatchScopeTarget[] {
  const directory = buildSysvDataPackageScopeDirectory(source.techInfoLatest);
  const targets: SysvBatchScopeTarget[] = [];
  const uniquePersonTargets = new Set<string>();
  const visit = (
    node: SysvDataPackageScopeNode,
    ancestors: { area?: SysvDataPackageScope; department?: SysvDataPackageScope; person?: SysvDataPackageScope },
    folderParts: string[],
  ) => {
    const nextAncestors = { ...ancestors };
    if (node.scope?.kind === "area") nextAncestors.area = node.scope;
    if (node.scope?.kind === "department") nextAncestors.department = node.scope;
    if (node.scope?.kind === "person") nextAncestors.person = node.scope;
    const folder = node.kind === "organisation" ? undefined : SCOPE_FOLDER[node.kind];
    const nextFolders = folder ? [...folderParts, folder, sysvScopeSlug(node.label)] : folderParts;

    const isInRequestedSubtree = node.scope && includesScopeAtLevel(node.scope.kind, request.level) && rootAllows(request.root, ancestors, node.scope);
    const personKey = node.scope?.kind === "person" ? sysvDataPackageScopeKey(node.scope) : null;
    const isDuplicatePersonTarget = request.level === "person" && personKey !== null && uniquePersonTargets.has(personKey);
    if (isInRequestedSubtree && !isDuplicatePersonTarget) {
      if (personKey) uniquePersonTargets.add(personKey);
      targets.push({
        scope: node.scope,
        path: targetPath(nextFolders, node.scope, request.level, date),
        ...(nextAncestors.department?.kind === "department" && node.scope.kind === "person"
          ? { parentDepartmentScope: nextAncestors.department }
          : {}),
      });
    }
    for (const child of node.children) visit(child, nextAncestors, nextFolders);
  };
  for (const node of directory.tree) visit(node, {}, []);
  return targets;
}

function buildVmNameIndex(vms: readonly NormalizedVm[]): Map<string, NormalizedVm[]> {
  const byName = new Map<string, NormalizedVm[]>();
  for (const vm of vms) {
    const key = normalizeVmNameForMatch(vm.vmName);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(vm);
    else byName.set(key, [vm]);
  }
  return byName;
}

/** Ermittelt nur Scope, VM-Zahlen und Lücken – ohne Rohblätter oder Paketnutzlasten zu laden. */
function buildLightweightPreviewForTargets(
  techInfoLatest: SysvDataPackageSource["techInfoLatest"],
  vmsByNormalizedName: ReadonlyMap<string, readonly NormalizedVm[]>,
  targets: readonly SysvBatchScopeTarget[],
  request: SysvBatchExportRequest,
  onProgress?: (progress: SysvBatchProgress) => void,
): SysvBatchPreviewResult {
  const previews: SysvBatchScopePreview[] = [];
  const skipped: SysvBatchReportSkip[] = [];
  const uniqueVmKeys = new Set<string>();

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const selectedNames = resolveSysvDataPackageVmNames(techInfoLatest, target.scope);
    const { selectedVms } = matchScopeVmsToRvtools(selectedNames, vmsByNormalizedName);
    if (selectedVms.length === 0) {
      skipped.push({
        scopeKind: target.scope.kind,
        scopeLabel: target.scope.displayName,
        reason: "Keine VM des Scopes konnte eindeutig RVTools zugeordnet werden.",
      });
    } else {
      previews.push({ target, vmCount: selectedVms.length });
      for (const vm of selectedVms) uniqueVmKeys.add(vm.vmKey);
    }
    onProgress?.({
      step: "Zielscopes bestimmen",
      percent: targets.length === 0 ? 100 : Math.round(((index + 1) / targets.length) * 100),
      detail: target.scope.displayName,
      completedPackages: index + 1,
      totalPackages: targets.length,
    });
  }

  return {
    level: request.level,
    rootLabel: request.root?.displayName ?? "Gesamter Bestand",
    targets: previews,
    skipped,
    estimatedCompressedBytes: null,
    estimatedUncompressedBytes: null,
    uniqueVmCount: uniqueVmKeys.size,
  };
}

export async function buildSysvDataPackageBatchPreview(
  request: SysvBatchExportRequest,
  options: { onProgress?: (progress: SysvBatchProgress) => void; signal?: AbortSignal } = {},
): Promise<SysvBatchPreviewResult> {
  throwIfAborted(options.signal);
  options.onProgress?.({ step: "Datenbasis laden", percent: 0, detail: "Scope- und VM-Verzeichnis wird geladen" });
  const [snapshots, techInfoLatest] = await Promise.all([getSnapshots(), getAllTechInfoLatest()]);
  const allVms = await getBySnapshotIds<NormalizedVm>("entities_vm", snapshots.map((snapshot) => snapshot.snapshotId));
  throwIfAborted(options.signal);
  const source = { techInfoLatest } as SysvDataPackageSource;
  const targets = buildSysvBatchScopeTargets(source, request, new Date());
  options.onProgress?.({ step: "Zielscopes bestimmen", percent: 0, detail: `${allVms.length.toLocaleString("de-DE")} RVTools-VMs verfügbar` });
  return buildLightweightPreviewForTargets(techInfoLatest, buildVmNameIndex(allVms), targets, request, options.onProgress);
}

function uniqueContainerFilePath(requestedPath: string, claimed: Set<string>): string {
  if (!claimed.has(requestedPath)) {
    claimed.add(requestedPath);
    return requestedPath;
  }
  const slash = requestedPath.lastIndexOf("/");
  const directory = slash >= 0 ? requestedPath.slice(0, slash + 1) : "";
  const fileName = slash >= 0 ? requestedPath.slice(slash + 1) : requestedPath;
  const extension = fileName.endsWith(".zip") ? ".zip" : "";
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  let index = 2;
  let candidate = `${directory}${stem}-${index}${extension}`;
  while (claimed.has(candidate)) {
    index += 1;
    candidate = `${directory}${stem}-${index}${extension}`;
  }
  claimed.add(candidate);
  return candidate;
}

function scopeVmKeys(source: SysvDataPackageSource, scope: SysvDataPackageScope): Set<string> {
  const selectedNames = resolveSysvDataPackageVmNames(source.techInfoLatest, scope);
  return new Set(matchScopeVmsToRvtools(selectedNames, source.vmsByNormalizedName).selectedVms.map((vm) => vm.vmKey));
}

function crossesParentScope(vms: readonly NormalizedVm[], parentVmKeys: ReadonlySet<string> | undefined): boolean {
  return parentVmKeys ? vms.some((vm) => !parentVmKeys.has(vm.vmKey)) : false;
}

export async function buildSysvDataPackageBatch(
  request: SysvBatchExportRequest,
  options: { onProgress?: (progress: SysvBatchProgress) => void; signal?: AbortSignal } = {},
): Promise<{ zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport }> {
  throwIfAborted(options.signal);
  options.onProgress?.({ step: "Datenbasis laden", percent: 0, detail: "Gemeinsame Datenbasis wird geladen" });
  const source = await loadSysvDataPackageSource({
    includeVropsTimeSeries: request.includeVropsTimeSeries,
    onProgress: (progress) => options.onProgress?.({
      step: "Datenbasis laden",
      percent: Math.min(40, Math.max(1, Math.round(progress.percent * 0.4))),
      detail: progress.detail,
    }),
  });
  throwIfAborted(options.signal);
  const createdAt = new Date();
  const targets = buildSysvBatchScopeTargets(source, request, createdAt);
  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  const claimedPaths = new Set<string>();
  const builtByScope = new Map<string, { zipBytes: Uint8Array<ArrayBuffer>; preview: SysvDataPackagePreview; packageId: string }>();
  const entries: SysvBatchReport["entries"] = [];
  const skipped: SysvBatchReportSkip[] = [];
  let totalLeafBytes = 0;
  const packageTargets = targets;
  const parentVmKeysByScope = new Map<string, Set<string>>();
  const uniqueVmKeys = new Set<string>();
  let vmReferences = 0;

  for (let index = 0; index < packageTargets.length; index += 1) {
    throwIfAborted(options.signal);
    const target = packageTargets[index];
    const scope = target.scope;
    const scopeLabel = scope.displayName;
    const key = sysvDataPackageScopeKey(scope);
    let built = builtByScope.get(key);
    if (!built) {
      const resolved = resolveSysvDataPackageFromSource(source, scope, {
        includeVropsTimeSeries: request.includeVropsTimeSeries,
        packageId: `sysv-batch-${key.replace(/[^a-z0-9]+/giu, "-")}`,
        createdAt: createdAt.toISOString(),
        appVersion: appVersion(),
      });
      if (!resolved.payload || !resolved.preview.canExport) {
        skipped.push({
          scopeKind: scope.kind,
          scopeLabel,
          reason: resolved.preview.errors.map((error) => error.message).join(" ") || "Scope kann nicht exportiert werden.",
        });
        continue;
      }
      // Absichtlich seriell: parallele Paketnutzlasten würden bei großen Rohdaten
      // mehrfach im Worker-Speicher liegen und den Export destabilisieren.
      const serialized = await serializeSysvDataPackage(resolved.payload, {
        packageId: resolved.preview.packageId,
        createdAt: createdAt.toISOString(),
        scope,
        warnings: resolved.preview.warnings.map(({ code, message, count }) => count === undefined ? { code, message } : { code, message, count }),
        appVersion: appVersion(),
      });
      const zipBytes = await zipSysvDataPackage(serialized.files);
      if (zipBytes.byteLength > MAX_SYSV_PACKAGE_COMPRESSED_BYTES) {
        throw new Error(`Das Blattpaket „${scopeLabel}“ überschreitet das komprimierte Größenlimit.`);
      }
      built = { zipBytes, preview: resolved.preview, packageId: serialized.manifest.packageId };
      builtByScope.set(key, built);
    }
    const path = uniqueContainerFilePath(target.path, claimedPaths);
    files[path] = built.zipBytes;
    totalLeafBytes += built.zipBytes.byteLength;
    if (totalLeafBytes > MAX_SYSV_BATCH_CONTAINER_BYTES) {
      throw new Error("Der SysV-Batch-Container würde das Größenlimit von 3 GB überschreiten.");
    }
    let parentVmKeys: Set<string> | undefined;
    if (target.parentDepartmentScope) {
      const parentKey = sysvDataPackageScopeKey(target.parentDepartmentScope);
      parentVmKeys = parentVmKeysByScope.get(parentKey);
      if (!parentVmKeys) {
        parentVmKeys = scopeVmKeys(source, target.parentDepartmentScope);
        parentVmKeysByScope.set(parentKey, parentVmKeys);
      }
    }
    const crosses = crossesParentScope(built.preview.vms, parentVmKeys);
    entries.push({
      path,
      packageId: built.packageId,
      scopeKind: scope.kind,
      scopeLabel,
      vmCount: built.preview.vms.length,
      compressedBytes: built.zipBytes.byteLength,
      crossesParentScope: crosses,
      warningCodes: [...new Set([
        ...built.preview.warnings.map((warning) => warning.code),
        ...(crosses ? ["crosses-parent-scope"] : []),
      ])],
    });
    vmReferences += built.preview.vms.length;
    for (const vm of built.preview.vms) uniqueVmKeys.add(vm.vmKey);
    options.onProgress?.({
      step: "Paket erzeugen",
      percent: packageTargets.length === 0 ? 100 : Math.round(((index + 1) / packageTargets.length) * 85),
      detail: scopeLabel,
      completedPackages: index + 1,
      totalPackages: packageTargets.length,
    });
  }

  if (entries.length === 0) {
    const reason = skipped.map((skip) => `${skip.scopeLabel}: ${skip.reason}`).join(" · ");
    throw new Error(`Der Batch enthält kein exportierbares Paket.${reason ? ` ${reason}` : ""}`);
  }

  const report: SysvBatchReport = {
    createdAt: createdAt.toISOString(),
    appVersion: appVersion(),
    level: request.level,
    rootLabel: request.root?.displayName ?? "Gesamter Bestand",
    includeVropsTimeSeries: request.includeVropsTimeSeries,
    entries,
    skipped,
    redundancyFactor: uniqueVmKeys.size === 0 ? 0 : vmReferences / uniqueVmKeys.size,
  };
  const reportJson = new TextEncoder().encode(JSON.stringify(report, null, 2)) as Uint8Array<ArrayBuffer>;
  const reportCsv = new TextEncoder().encode(buildSysvBatchReportCsv(report)) as Uint8Array<ArrayBuffer>;
  files["uebersicht.json"] = reportJson;
  files["uebersicht.csv"] = reportCsv;
  throwIfAborted(options.signal);
  options.onProgress?.({ step: "Container komprimieren", percent: 92, detail: `${entries.length} Blattpakete` });
  const zipBytes = await zipSysvDataPackage(files);
  if (zipBytes.byteLength > MAX_SYSV_BATCH_CONTAINER_BYTES) {
    throw new Error("Der SysV-Batch-Container überschreitet das Größenlimit von 3 GB.");
  }
  options.onProgress?.({ step: "Download vorbereiten", percent: 100, detail: "Batch-Container bereit" });
  return { zipBytes, report };
}

export function buildSysvDataPackageBatchFileName(
  request: SysvBatchExportRequest,
  date = new Date(),
): string {
  const label = sysvScopeSlug(request.root?.displayName ?? "gesamtbestand");
  return `rvtools-sysv-batch_${request.level}_${label}_${date.toISOString().slice(0, 10)}.zip`;
}
