import { unzipSync } from "fflate";
import type { SysvBatchReport, SysvDataPackageManifestV1 } from "@/domain/models/types";
import {
  isSysvDataPackageManifest,
  SYSV_DATA_PACKAGE_KIND,
  MAX_SYSV_PACKAGE_ENTRIES,
  MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES,
} from "@/lib/export/sysvDataPackageFormat";
import { escapeCsvCell } from "@/lib/export/tableExport";

export const MAX_SYSV_DISCOVERED_PACKAGES = 500;
export const MAX_SYSV_CONTAINER_RECURSION_DEPTH = 4;
export const MAX_SYSV_CONTAINER_COMPRESSED_BYTES = 3_000_000_000;

export interface DiscoveredSysvPackage {
  /** Dateiname oder Pfad innerhalb eines Container-ZIPs. */
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
  manifest: SysvDataPackageManifestV1;
}

function isZipFileName(name: string): boolean {
  return name.toLocaleLowerCase("en-US").endsWith(".zip");
}

function isIgnorableEntry(path: string): boolean {
  if (path.endsWith("/")) return true;
  if (path.startsWith("__MACOSX/")) return true;
  const name = path.split("/").pop() ?? path;
  return !name || name.startsWith(".");
}

function joinDisplayPath(parent: string, child: string): string {
  return `${parent.replace(/\/$/u, "")}/${child.replace(/^\//u, "")}`;
}

/** Kopiert nur, wenn die View nicht bereits exakt ihren eigenen ArrayBuffer abdeckt. */
function exactBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) {
    return value as Uint8Array<ArrayBuffer>;
  }
  return value.slice() as Uint8Array<ArrayBuffer>;
}

function readRootManifest(entries: Record<string, Uint8Array>): SysvDataPackageManifestV1 | null {
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown;
    if (isSysvDataPackageManifest(value)) return value;
    if (value && typeof value === "object" && !Array.isArray(value) && (value as { kind?: unknown }).kind === SYSV_DATA_PACKAGE_KIND) {
      return value as SysvDataPackageManifestV1;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Entpackt nur die für die Discovery nötigen Einträge (Wurzelmanifest und
 * verschachtelte ZIPs). Die Limits werden dabei über die Verzeichniseinträge
 * geprüft, damit ein zu großer Container nicht erst vollständig inflatiert wird.
 */
function inspectZipBytes(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > MAX_SYSV_CONTAINER_COMPRESSED_BYTES) {
    throw new Error("Das SysV-Container-ZIP überschreitet das komprimierte Größenlimit von 3 GB.");
  }
  let entryCount = 0;
  let uncompressedBytes = 0;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (isIgnorableEntry(file.name)) return false;
      entryCount += 1;
      uncompressedBytes += file.originalSize;
      return file.name === "manifest.json" || isZipFileName(file.name);
    },
  }) as Record<string, Uint8Array>;
  if (entryCount > MAX_SYSV_PACKAGE_ENTRIES * 4) {
    throw new Error("Das SysV-Container-ZIP enthält zu viele Dateien.");
  }
  if (uncompressedBytes > MAX_SYSV_PACKAGE_UNCOMPRESSED_BYTES * 4) {
    throw new Error("Das SysV-Container-ZIP überschreitet das Entpacklimit.");
  }
  return entries;
}

async function discoverFromZip(
  bytes: Uint8Array<ArrayBuffer>,
  displayPath: string,
  depth: number,
  discovered: Map<string, DiscoveredSysvPackage>,
): Promise<void> {
  const entries = inspectZipBytes(bytes);
  const manifest = readRootManifest(entries);
  if (manifest) {
    if (!discovered.has(manifest.packageId)) {
      discovered.set(manifest.packageId, { path: displayPath, bytes: exactBytes(bytes), manifest });
    }
    if (discovered.size > MAX_SYSV_DISCOVERED_PACKAGES) {
      throw new Error(`Es dürfen höchstens ${MAX_SYSV_DISCOVERED_PACKAGES} SysV-Pakete gleichzeitig importiert werden.`);
    }
    return;
  }

  if (depth >= MAX_SYSV_CONTAINER_RECURSION_DEPTH) return;
  const nestedEntries = Object.entries(entries)
    .filter(([path]) => isZipFileName(path))
    .sort(([left], [right]) => left.localeCompare(right, "de-DE"));
  for (const [path, nestedBytes] of nestedEntries) {
    await discoverFromZip(exactBytes(nestedBytes), joinDisplayPath(displayPath, path), depth + 1, discovered);
  }
}

/** Sammelt reguläre SysV-Blattpakete aus Einzeldateien und rekursiv aus Containern. */
export async function discoverSysvPackages(files: File[]): Promise<DiscoveredSysvPackage[]> {
  const discovered = new Map<string, DiscoveredSysvPackage>();
  for (const file of files) {
    if (!isZipFileName(file.name)) continue;
    await discoverFromZip(new Uint8Array(await file.arrayBuffer()), file.name, 0, discovered);
  }
  return [...discovered.values()];
}

function csvValue(value: string | number | boolean | null | undefined): string {
  return escapeCsvCell(value == null ? "" : String(value));
}

/** Erzeugt die semikolongetrennte Schwesterdatei des JSON-Übersichtsberichts. */
export function buildSysvBatchReportCsv(report: SysvBatchReport): string {
  const header = [
    "type", "path", "packageId", "scopeKind", "scopeLabel", "vmCount",
    "compressedBytes", "crossesParentScope", "warningCodes", "reason",
  ].join(";");
  const rows = [
    ["meta", "", "", report.level, report.rootLabel, "", "", "", `createdAt=${report.createdAt}|appVersion=${report.appVersion}|includeVropsTimeSeries=${report.includeVropsTimeSeries}|redundancyFactor=${report.redundancyFactor ?? ""}`, ""],
    ...report.entries.map((entry) => [
      "entry", entry.path, entry.packageId, entry.scopeKind, entry.scopeLabel,
      entry.vmCount, entry.compressedBytes, entry.crossesParentScope,
      entry.warningCodes.join(","), "",
    ]),
    ...report.skipped.map((skip) => ["skip", "", "", skip.scopeKind, skip.scopeLabel, "", "", "", "", skip.reason]),
  ];
  return `${[header, ...rows.map((row) => row.map((value) => csvValue(value)).join(";"))].join("\r\n")}\r\n`;
}
