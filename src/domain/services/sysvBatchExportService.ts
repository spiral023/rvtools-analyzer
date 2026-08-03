import type {
  SysvBatchReport,
  SysvBatchReportSkip,
  SysvDataPackageScope,
} from "@/domain/models/types";
import {
  buildSysvDataPackageFileName,
  loadSysvDataPackageSource,
  resolveSysvDataPackageFromSource,
  sysvScopeSlug,
  type SysvDataPackagePreview,
  type SysvDataPackageSource,
} from "@/domain/services/sysvDataPackageService";
import { buildSysvDataPackageScopeDirectory, sysvDataPackageScopeKey, type SysvDataPackageScopeNode } from "@/lib/sysvDataPackageScope";
import { serializeSysvDataPackage, zipSysvDataPackage, MAX_SYSV_PACKAGE_COMPRESSED_BYTES } from "@/lib/export/sysvDataPackageFormat";
import { buildSysvBatchReportCsv, MAX_SYSV_CONTAINER_COMPRESSED_BYTES } from "@/lib/export/sysvDataPackageContainer";

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

export interface SysvBatchScopePreview {
  target: SysvBatchScopeTarget;
  preview: SysvDataPackagePreview;
  parentDepartmentPreview?: SysvDataPackagePreview;
}

export interface SysvBatchPreviewResult {
  level: SysvBatchExportRequest["level"];
  rootLabel: string;
  targets: SysvBatchScopePreview[];
  skipped: SysvBatchReportSkip[];
  estimatedCompressedBytes: number;
  estimatedUncompressedBytes: number;
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

function buildPreviewForTargets(
  source: SysvDataPackageSource,
  targets: readonly SysvBatchScopeTarget[],
  request: SysvBatchExportRequest,
  onProgress?: (progress: SysvBatchProgress) => void,
): SysvBatchPreviewResult {
  const previewByScope = new Map<string, SysvDataPackagePreview>();
  const skippedByScope = new Map<string, SysvBatchReportSkip>();
  const previews: SysvBatchScopePreview[] = [];
  let estimatedCompressedBytes = 0;
  let estimatedUncompressedBytes = 0;
  const uniqueVmKeys = new Set<string>();

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const key = sysvDataPackageScopeKey(target.scope);
    let preview = previewByScope.get(key);
    if (!preview) {
      preview = resolveSysvDataPackageFromSource(source, target.scope, {
        includeVropsTimeSeries: request.includeVropsTimeSeries,
        packageId: `sysv-batch-${key.replace(/[^a-z0-9]+/giu, "-")}`,
      }).preview;
      previewByScope.set(key, preview);
    }
    if (!preview.canExport) {
      skippedByScope.set(key, {
        scopeKind: target.scope.kind,
        scopeLabel: target.scope.displayName,
        reason: preview.errors.map((error) => error.message).join(" ") || "Scope kann nicht exportiert werden.",
      });
    } else {
      const parentDepartmentPreview = target.parentDepartmentScope
        ? previewByScope.get(sysvDataPackageScopeKey(target.parentDepartmentScope))
          ?? resolveSysvDataPackageFromSource(source, target.parentDepartmentScope, { includeVropsTimeSeries: false }).preview
        : undefined;
      if (target.parentDepartmentScope && parentDepartmentPreview) previewByScope.set(sysvDataPackageScopeKey(target.parentDepartmentScope), parentDepartmentPreview);
      previews.push({ target, preview, parentDepartmentPreview });
      estimatedCompressedBytes += preview.estimatedCompressedBytes;
      estimatedUncompressedBytes += preview.estimatedUncompressedBytes;
      preview.vms.forEach((vm) => uniqueVmKeys.add(vm.vmKey));
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
    skipped: [...skippedByScope.values()],
    estimatedCompressedBytes,
    estimatedUncompressedBytes,
    uniqueVmCount: uniqueVmKeys.size,
  };
}

export async function buildSysvDataPackageBatchPreview(
  request: SysvBatchExportRequest,
  options: { onProgress?: (progress: SysvBatchProgress) => void; signal?: AbortSignal } = {},
): Promise<SysvBatchPreviewResult> {
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
  const targets = buildSysvBatchScopeTargets(source, request, new Date());
  return buildPreviewForTargets(source, targets, request, options.onProgress);
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

function crossesParentScope(preview: SysvDataPackagePreview, parent: SysvDataPackagePreview | undefined): boolean {
  if (!parent) return false;
  const parentVmKeys = new Set(parent.vms.map((vm) => vm.vmKey));
  return preview.vms.some((vm) => !parentVmKeys.has(vm.vmKey));
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
  const previews = buildPreviewForTargets(source, targets, request, options.onProgress);
  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  const claimedPaths = new Set<string>();
  const builtByScope = new Map<string, { zipBytes: Uint8Array<ArrayBuffer>; preview: SysvDataPackagePreview; packageId: string }>();
  const entries: SysvBatchReport["entries"] = [];
  const skipped = [...previews.skipped];
  let totalLeafBytes = 0;
  const packageTargets = previews.targets;

  for (let index = 0; index < packageTargets.length; index += 1) {
    throwIfAborted(options.signal);
    const { target, preview, parentDepartmentPreview } = packageTargets[index];
    const key = sysvDataPackageScopeKey(target.scope);
    let built = builtByScope.get(key);
    if (!built) {
      const resolved = resolveSysvDataPackageFromSource(source, target.scope, {
        includeVropsTimeSeries: request.includeVropsTimeSeries,
        packageId: preview.packageId,
        createdAt: createdAt.toISOString(),
        appVersion: appVersion(),
      });
      if (!resolved.payload || !resolved.preview.canExport) {
        skipped.push({
          scopeKind: target.scope.kind,
          scopeLabel: target.scope.displayName,
          reason: resolved.preview.errors.map((error) => error.message).join(" ") || "Scope kann nicht exportiert werden.",
        });
        continue;
      }
      const serialized = await serializeSysvDataPackage(resolved.payload, {
        packageId: resolved.preview.packageId,
        createdAt: createdAt.toISOString(),
        scope: target.scope,
        warnings: resolved.preview.warnings.map(({ code, message, count }) => count === undefined ? { code, message } : { code, message, count }),
        appVersion: appVersion(),
      });
      const zipBytes = await zipSysvDataPackage(serialized.files);
      if (zipBytes.byteLength > MAX_SYSV_PACKAGE_COMPRESSED_BYTES) {
        throw new Error(`Das Blattpaket „${target.scope.displayName}“ überschreitet das komprimierte Größenlimit.`);
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
    const crosses = crossesParentScope(built.preview, parentDepartmentPreview);
    entries.push({
      path,
      packageId: built.packageId,
      scopeKind: target.scope.kind,
      scopeLabel: target.scope.displayName,
      vmCount: built.preview.vms.length,
      compressedBytes: built.zipBytes.byteLength,
      crossesParentScope: crosses,
      warningCodes: [...new Set([
        ...built.preview.warnings.map((warning) => warning.code),
        ...(crosses ? ["crosses-parent-scope"] : []),
      ])],
    });
    options.onProgress?.({
      step: "Paket erzeugen",
      percent: packageTargets.length === 0 ? 100 : Math.round(((index + 1) / packageTargets.length) * 85),
      detail: target.scope.displayName,
      completedPackages: index + 1,
      totalPackages: packageTargets.length,
    });
  }

  if (entries.length === 0) {
    const reason = skipped.map((skip) => `${skip.scopeLabel}: ${skip.reason}`).join(" · ");
    throw new Error(`Der Batch enthält kein exportierbares Paket.${reason ? ` ${reason}` : ""}`);
  }

  const uniqueVmKeys = new Set<string>();
  let vmReferences = 0;
  for (const entry of entries) vmReferences += entry.vmCount;
  for (const item of builtByScope.values()) {
    item.preview.vms.forEach((vm) => uniqueVmKeys.add(vm.vmKey));
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
