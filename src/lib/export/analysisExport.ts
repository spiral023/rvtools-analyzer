/**
 * Speicheroptimierter Analyse-Export.
 *
 * Zweck ist die externe Auswertung des VM-CPU-Rightsizings: Der Export enthält
 * das Inventar, die von der App berechneten Kennzahlen und die stündlichen
 * Rohreihen aus vROps in einer Form, die auch bei 5.000 VMs und einem Monat
 * Messwerten wenige MB groß bleibt (Kodierung siehe `analysisSeriesCodec.ts`).
 *
 * Abgrenzung zum Export Studio: Jener Export richtet sich an Menschen und
 * formatiert deutsch (`16,00 GiB`, `100,0 %`). Dieser hier richtet sich an
 * Auswertungswerkzeuge und schreibt durchgängig maschinenlesbar — Punkt als
 * Dezimaltrennzeichen, ISO-Zeitstempel, keine Einheiten in den Werten.
 */
import type {
  CpuRightsizingLevel,
  NormalizedCluster,
  NormalizedHost,
  NormalizedVm,
  TechInfoLatest,
  VmRightsizingCandidate,
  VmWorkloadProfile,
  VropsTimeSeriesChunk,
  VropsTimeSeriesImport,
  VropsTimeSeriesImportedObject,
  VropsTimeSeriesMetricKey,
} from "@/domain/models/types";
import { CPU_RIGHTSIZING_POLICIES } from "@/domain/services/vmRightsizingService";
import {
  COUNT_ENCODING,
  MHZ_ENCODING,
  PERCENT_ENCODING,
  encodeAnalysisSeries,
  type SeriesEncoding,
} from "@/lib/export/analysisSeriesCodec";
import { austrianHolidaysInRange, type Holiday } from "@/lib/holidays";
import { IncrementalSha256 } from "@/lib/hash/incrementalSha256";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Version des Exportformats. Erhöhen, sobald sich Spalten oder Kodierung ändern —
 * Auswertungsskripte prüfen sie, statt Spaltenpositionen zu raten.
 */
export const ANALYSIS_EXPORT_FORMAT_VERSION = 4;

/** Metriken, die als Rohreihe ausgegeben werden, samt Kodierung und Einheit. */
const SERIES_METRICS: ReadonlyArray<{
  metric: VropsTimeSeriesMetricKey;
  fileName: string;
  unit: string;
  encoding: SeriesEncoding;
}> = [
  { metric: "vmCpuDemandAvgMHz", fileName: "cpu_demand_avg", unit: "MHz", encoding: MHZ_ENCODING },
  { metric: "vmCpuDemandMaxMHz", fileName: "cpu_demand_max", unit: "MHz", encoding: MHZ_ENCODING },
  { metric: "vmMemoryWorkloadAvgPct", fileName: "memory_workload_avg_pct", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmMemoryWorkloadMaxPct", fileName: "memory_workload_max_pct", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmCpuReadyMaxPct", fileName: "cpu_ready_max", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmCpuPeakReadyMaxPct", fileName: "cpu_peak_vcpu_ready_max", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmCpuPeakCostopMaxPct", fileName: "cpu_peak_vcpu_costop_max", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmCpuUsageDisparityAvgPct", fileName: "cpu_vcpu_usage_disparity_avg", unit: "%", encoding: PERCENT_ENCODING },
  { metric: "vmCpuTotalCapacityLastMHz", fileName: "cpu_total_capacity_last", unit: "MHz", encoding: MHZ_ENCODING },
  { metric: "vmConfiguredVcpuLast", fileName: "configured_vcpu_last", unit: "vCPU", encoding: COUNT_ENCODING },
];

export interface AnalysisExportFile {
  /** Pfad im Archiv, z. B. `series/cpu_demand_avg.csv`. */
  path: string;
  content: string;
}

export interface BuildAnalysisExportInput {
  vms: readonly NormalizedVm[];
  hosts: readonly NormalizedHost[];
  clusters: readonly NormalizedCluster[];
  techInfo: readonly TechInfoLatest[];
  timeSeriesImport: VropsTimeSeriesImport | null;
  objects: readonly VropsTimeSeriesImportedObject[];
  chunks: readonly VropsTimeSeriesChunk[];
  profiles: readonly VmWorkloadProfile[];
  candidates: readonly VmRightsizingCandidate[];
  /** Globale CPU-Rightsizing-Stufe, die Kandidaten und Export reproduzierbar macht. */
  rightsizingLevel: CpuRightsizingLevel;
  /** Rohreihen weglassen, wenn nur die verdichteten Kennzahlen gebraucht werden. */
  includeSeries: boolean;
  /** Namen durch stabile Kürzel ersetzen. */
  pseudonymize: boolean;
  /**
   * Über alle Exporte konstanter Zufallswert. Ohne ihn wären die Kürzel aus einer
   * Liste bekannter VM-UUIDs zurückrechenbar; mit ihm bleiben sie über
   * Exportläufe hinweg trotzdem identisch und damit vergleichbar.
   */
  pseudonymSalt: string;
  generatedAt: string;
  appVersion: string;
}

/* ------------------------------------------------------------------ */
/*  CSV-Schreiben                                                     */
/* ------------------------------------------------------------------ */

const SEPARATOR = ";";

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(cells: ReadonlyArray<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(SEPARATOR);
}

function csvDocument(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
): string {
  return [csvLine(headers), ...rows.map(csvLine)].join("\n");
}

/** Rundet auf feste Nachkommastellen, ohne aus 0 eine leere Zelle zu machen. */
function round(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ */
/*  Stabile Pseudonyme                                                */
/* ------------------------------------------------------------------ */

/**
 * Erzeugt ein über Exportläufe hinweg gleichbleibendes Kürzel.
 *
 * Die laufende Nummerierung des Export Studios (`server-001` = erste Zeile)
 * taugt hierfür nicht: Sobald eine VM hinzukommt oder wegfällt, verschiebt sie
 * sich für alle folgenden — ein Vorher/Nachher-Vergleich zweier Exporte wäre
 * damit unmöglich, und genau der ist der Zweck dieses Exports.
 */
export function stablePseudonym(prefix: string, value: string, salt: string): string {
  const hash = new IncrementalSha256();
  hash.update(new TextEncoder().encode(`${salt}:${prefix}:${value.trim().toLocaleLowerCase("de-DE")}`));
  return `${prefix}-${hash.digestHex().slice(0, 12)}`;
}

/** Bündelt die Namensersetzung, damit derselbe Klartext überall dasselbe Kürzel erhält. */
class PseudonymMap {
  private readonly cache = new Map<string, string>();

  constructor(private readonly enabled: boolean, private readonly salt: string) {}

  apply(prefix: string, value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return value ?? null;
    if (!this.enabled) return value;
    const cacheKey = `${prefix}:${value}`;
    const known = this.cache.get(cacheKey);
    if (known) return known;
    const replacement = stablePseudonym(prefix, value, this.salt);
    this.cache.set(cacheKey, replacement);
    return replacement;
  }
}

/* ------------------------------------------------------------------ */
/*  Zeitreihen                                                        */
/* ------------------------------------------------------------------ */

/** Chunk samt vorbereitetem Objektindex; vermeidet die Neuberechnung je VM und Metrik. */
interface IndexedChunk {
  chunk: VropsTimeSeriesChunk;
  objectIndexByKey: Map<string, number>;
  /** Position des Chunk-Beginns im Gesamtraster des Imports. */
  slotOffset: number;
}

function indexChunks(
  chunks: readonly VropsTimeSeriesChunk[],
  rangeStartUtc: number,
): IndexedChunk[] {
  return chunks
    .filter((chunk) => chunk.objectType === "vm")
    .map((chunk) => ({
      chunk,
      objectIndexByKey: new Map(chunk.objectKeys.map((key, index) => [key, index])),
      slotOffset: Math.round((chunk.startUtc - rangeStartUtc) / HOUR_MS),
    }));
}

/**
 * Liest eine Metrik einer VM in das lückenlose Raster des Imports.
 *
 * Bewusst nicht über `readVropsTimeSeriesMetric`: Jenes liefert eine Map je VM
 * und Metrik, was bei 5.000 VMs × 8 Metriken Millionen kurzlebiger Einträge
 * erzeugt. Hier wird direkt in ein vorbereitetes Feld geschrieben.
 */
function readSeries(
  indexedChunks: readonly IndexedChunk[],
  objectKey: string,
  metric: VropsTimeSeriesMetricKey,
  expectedSlots: number,
): (number | null)[] {
  const series: (number | null)[] = new Array(expectedSlots).fill(null);
  for (const { chunk, objectIndexByKey, slotOffset } of indexedChunks) {
    const objectIndex = objectIndexByKey.get(objectKey);
    const buffer = chunk.metricValues[metric];
    if (objectIndex === undefined || !buffer) continue;
    const values = new Float32Array(buffer);
    const base = objectIndex * chunk.slotCount;
    for (let slot = 0; slot < chunk.slotCount; slot += 1) {
      const target = slotOffset + slot;
      if (target < 0 || target >= expectedSlots) continue;
      const value = values[base + slot];
      if (Number.isFinite(value)) series[target] = value;
    }
  }
  return series;
}

/** Metriken, für die tatsächlich Werte vorliegen — fehlende Spalten sollen keine leeren Dateien erzeugen. */
function availableSeriesMetrics(chunks: readonly VropsTimeSeriesChunk[]): VropsTimeSeriesMetricKey[] {
  const available = new Set<VropsTimeSeriesMetricKey>();
  for (const chunk of chunks) {
    if (chunk.objectType !== "vm") continue;
    for (const metric of Object.keys(chunk.metricValues) as VropsTimeSeriesMetricKey[]) {
      available.add(metric);
    }
  }
  return SERIES_METRICS.filter((entry) => available.has(entry.metric)).map((entry) => entry.metric);
}

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

export function buildAnalysisExportFiles(input: BuildAnalysisExportInput): AnalysisExportFile[] {
  const pseudonyms = new PseudonymMap(input.pseudonymize, input.pseudonymSalt);
  const files: AnalysisExportFile[] = [];

  const vmByKey = new Map(input.vms.map((vm) => [vm.vmKey, vm]));
  const hostByName = new Map(input.hosts.flatMap((host) => (host.host ? [[host.host, host] as const] : [])));
  const profileByObjectKey = new Map(input.profiles.map((profile) => [profile.objectKey, profile]));
  const candidateByObjectKey = new Map(input.candidates.map((candidate) => [candidate.objectKey, candidate]));
  const techInfoByVmName = new Map(input.techInfo.map((entry) => [entry.vmNameNorm, entry]));
  const vmObjects = input.objects.filter((object) => object.objectType === "vm");
  // Ohne diesen Index liefe die VM-Schleife je Zeile erneut über alle Zeitreihenobjekte.
  const objectByVmKey = new Map(
    vmObjects.flatMap((object) => (object.rvtoolsObjectKey ? [[object.rvtoolsObjectKey, object] as const] : [])),
  );

  const importMeta = input.timeSeriesImport;
  const expectedSlots = importMeta?.expectedSlots ?? 0;
  const indexedChunks = importMeta ? indexChunks(input.chunks, importMeta.rangeStartUtc) : [];
  const seriesMetrics = importMeta ? availableSeriesMetrics(input.chunks) : [];

  /** Verbindet Inventar- und Reihenzeilen; entspricht `objectKey` des Zeitreihenimports. */
  const seriesIdByVmKey = new Map<string, string>();
  for (const object of vmObjects) {
    if (object.rvtoolsObjectKey) seriesIdByVmKey.set(object.rvtoolsObjectKey, object.objectKey);
  }

  files.push({ path: "vms.csv", content: buildVmsCsv() });
  files.push({ path: "hosts.csv", content: buildHostsCsv() });
  files.push({ path: "clusters.csv", content: buildClustersCsv() });

  if (input.includeSeries && importMeta && expectedSlots > 0) {
    for (const definition of SERIES_METRICS) {
      if (!seriesMetrics.includes(definition.metric)) continue;
      files.push({
        path: `series/${definition.fileName}.csv`,
        content: buildSeriesCsv(definition.metric, definition.encoding),
      });
    }
  }

  files.push({ path: "meta.json", content: buildMetaJson() });
  files.push({ path: "README.md", content: buildReadme() });

  return files;

  /* -------------------- Inventar -------------------- */

  function buildVmsCsv(): string {
    const headers = [
      "vmId", "hasSeries", "vcenter", "cluster", "host", "powerState",
      "vcpu", "memoryMiB", "provisionedMiB", "inUseMiB",
      "osConfig", "osTools", "hwVersion", "toolsStatus", "firmware",
      "folder", "resourcePool", "datacenter", "workloadClass", "matchStatus",
      "hostCpuTotalMHz", "hostCpuCores", "mhzPerCore", "configuredCpuCapacityMHz",
      "shape", "intensity", "behaviorClass", "confidence",
      "demandCoverageRatio", "demandSampleCount",
      "demandAvgMHz", "demandP50MHz", "demandP95MHz", "demandP99MHz", "demandP995MHz", "demandMaxMHz",
      "demandMaxP95MHz", "demandMaxP99MHz", "demandMaxP995MHz", "demandMaxMaximumMHz",
      "readyAvgPct", "readyP95Pct", "readyMaxPct",
      "measuredCapacityMHz", "measuredVcpu", "measuredMhzPerVcpu",
      "hoursAboveCapacity75", "hoursAboveCapacity90",
      "costopUnderLoadP95Pct", "loadHourCount", "concentrationIndexP90", "effectiveCoresMax", "singleCoreBoundHours",
      "coefficientOfVariation", "activeHourSharePct", "dutyCyclePct", "baselineRatio",
      "utilizationP95Pct", "dailyRepeatability", "weeklyRepeatability", "weeklyPeakVariation",
      "businessHoursConcentration", "nightConcentration", "weekendConcentration",
      "rightsizingLevel", "mhzPerVcpu", "usedVcpuEquivalentP95", "usedVcpuEquivalentPeak", "demandBasedVcpu",
      "recommendedVcpu", "reclaimableVcpu", "additionalVcpu", "recommendationWithheldReason",
      "flagManyVcpuLowDemand", "flagHighCpuReady",
      "flagCostopUnderLoad", "flagSingleCoreBound", "flagConcentratedOnFewCores", "flagSustainedNearCapacity",
      "techInfoServerType", "techInfoMaintenanceWindow", "techInfoOperatingSystem",
      "techInfoDepartment", "techInfoBz", "techInfoAz",
    ];

    const rows = input.vms.map((vm) => {
      const seriesId = seriesIdByVmKey.get(vm.vmKey) ?? null;
      const profile = seriesId ? profileByObjectKey.get(seriesId) : undefined;
      const candidate = seriesId ? candidateByObjectKey.get(seriesId) : undefined;
      const host = vm.host ? hostByName.get(vm.host) : undefined;
      const mhzPerCore = host?.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null;
      const techInfo = techInfoByVmName.get(vm.vmName.trim().toLowerCase());
      const signals = profile?.signals;
      const capacity = profile?.capacitySignals;

      return [
        pseudonyms.apply("vm", vm.vmName),
        seriesId !== null,
        pseudonyms.apply("vcenter", vm.vcenterId),
        pseudonyms.apply("cluster", vm.cluster),
        pseudonyms.apply("host", vm.host),
        vm.powerState,
        vm.cpuCount,
        vm.memoryMiB,
        round(vm.provisionedMiB, 1),
        round(vm.inUseMiB, 1),
        vm.osConfig,
        vm.osTools,
        vm.hwVersion,
        vm.toolsStatus,
        vm.firmware,
        pseudonyms.apply("folder", vm.folder),
        pseudonyms.apply("resource-pool", vm.resourcePool),
        pseudonyms.apply("datacenter", vm.datacenter),
        profile?.workloadClass ?? null,
        objectByVmKey.get(vm.vmKey)?.matchStatus ?? "unmatched",
        host?.cpuTotalMHz ?? null,
        host?.cpuCores ?? null,
        round(mhzPerCore, 2),
        round(profile?.configuredCpuCapacityMHz ?? null, 1),
        profile?.shape ?? null,
        profile?.intensity ?? null,
        profile?.behaviorClass ?? null,
        profile?.confidence ?? null,
        round(profile?.demand.coverageRatio ?? null, 4),
        profile?.demand.sampleCount ?? null,
        round(profile?.demand.average ?? null, 1),
        round(profile?.demand.p50 ?? null, 1),
        round(profile?.demand.p95 ?? null, 1),
        round(profile?.demand.p99 ?? null, 1),
        round(profile?.demand.p995 ?? null, 1),
        round(profile?.demand.maximum ?? null, 1),
        round(profile?.demandMax.p95 ?? null, 1),
        round(profile?.demandMax.p99 ?? null, 1),
        round(profile?.demandMax.p995 ?? null, 1),
        round(profile?.demandMax.maximum ?? null, 1),
        round(profile?.ready.average ?? null, 4),
        round(profile?.ready.p95 ?? null, 4),
        round(profile?.ready.maximum ?? null, 4),
        round(capacity?.totalCapacityMHz ?? null, 1),
        capacity?.configuredVcpu ?? null,
        round(capacity?.mhzPerVcpu ?? null, 2),
        capacity?.hoursAboveCapacity75 ?? null,
        capacity?.hoursAboveCapacity90 ?? null,
        round(capacity?.costopUnderLoadP95Pct ?? null, 4),
        capacity?.loadHourCount ?? null,
        round(capacity?.concentrationIndexP90 ?? null, 4),
        round(capacity?.effectiveCoresMax ?? null, 3),
        capacity?.singleCoreBoundHours ?? null,
        round(signals?.coefficientOfVariation ?? null, 4),
        round(signals?.activeHourSharePct ?? null, 2),
        round(signals?.dutyCyclePct ?? null, 2),
        round(signals?.baselineRatio ?? null, 4),
        round(signals?.utilizationP95Pct ?? null, 3),
        round(signals?.dailyRepeatability ?? null, 4),
        round(signals?.weeklyRepeatability ?? null, 4),
        round(signals?.weeklyPeakVariation ?? null, 4),
        round(signals?.businessHoursConcentration ?? null, 4),
        round(signals?.nightConcentration ?? null, 4),
        round(signals?.weekendConcentration ?? null, 4),
        candidate?.rightsizingLevel ?? input.rightsizingLevel,
        round(candidate?.mhzPerVcpu ?? null, 2),
        round(candidate?.usedVcpuEquivalentP95 ?? null, 3),
        round(candidate?.usedVcpuEquivalentPeak ?? null, 3),
        candidate?.demandBasedVcpu ?? null,
        candidate?.recommendedVcpu ?? null,
        candidate?.reclaimableVcpu ?? null,
        candidate?.additionalVcpu ?? null,
        candidate?.recommendationWithheldReason ?? null,
        candidate?.flags.manyVcpuLowDemand ?? null,
        candidate?.flags.highCpuReady ?? null,
        candidate?.flags.costopUnderLoad ?? null,
        candidate?.flags.singleCoreBound ?? null,
        candidate?.flags.concentratedOnFewCores ?? null,
        candidate?.flags.sustainedNearCapacity ?? null,
        techInfo?.serverType ?? null,
        techInfo?.maintenanceWindow ?? null,
        techInfo?.operatingSystem ?? null,
        // Abteilung bleibt als Gruppierungsmerkmal erhalten, aber pseudonymisiert:
        // Lastmuster korrelieren erfahrungsgemäß stark mit der betreuenden Einheit.
        pseudonyms.apply("abteilung", techInfo?.sysvDepartment ?? null),
        techInfo?.bz ?? null,
        techInfo?.az ?? null,
      ];
    });

    return csvDocument(headers, rows);
  }

  function buildHostsCsv(): string {
    const headers = [
      "hostId", "cluster", "datacenter", "cpuModel", "cpuTotalMHz", "cpuCores", "cpuThreads",
      "mhzPerCore", "memoryTotalMiB", "vendor", "model", "version", "connectionState",
      "powerState", "maintenanceMode", "vmCount",
    ];
    const rows = input.hosts.map((host) => [
      pseudonyms.apply("host", host.host),
      pseudonyms.apply("cluster", host.cluster),
      pseudonyms.apply("datacenter", host.datacenter),
      // Das CPU-Modell bleibt im Klartext: Es ist kein Identifikationsmerkmal, aber
      // die Grundlage dafür, MHz-Werte zwischen Clustern vergleichbar zu machen.
      host.cpuModel,
      host.cpuTotalMHz,
      host.cpuCores,
      host.cpuThreads,
      round(host.cpuTotalMHz && host.cpuCores ? host.cpuTotalMHz / host.cpuCores : null, 2),
      host.memoryTotalMiB,
      host.vendor,
      host.model,
      host.version,
      host.connectionState,
      host.powerState,
      host.maintenanceMode,
      host.vmCount,
    ]);
    return csvDocument(headers, rows);
  }

  function buildClustersCsv(): string {
    const headers = [
      "clusterId", "datacenter", "numHosts", "numEffectiveHosts", "numCpuCores", "numCpuThreads",
      "totalCpuMHz", "totalMemoryMiB", "haEnabled", "drsEnabled", "vmCount",
    ];
    const vmCountByCluster = new Map<string, number>();
    for (const vm of input.vms) {
      if (!vm.cluster) continue;
      vmCountByCluster.set(vm.cluster, (vmCountByCluster.get(vm.cluster) ?? 0) + 1);
    }
    const rows = input.clusters.map((cluster) => [
      pseudonyms.apply("cluster", cluster.name),
      pseudonyms.apply("datacenter", cluster.datacenter),
      cluster.numHosts,
      cluster.numEffectiveHosts,
      cluster.numCpuCores,
      cluster.numCpuThreads,
      cluster.totalCpuMHz,
      cluster.totalMemoryMiB,
      cluster.haEnabled,
      cluster.drsEnabled,
      vmCountByCluster.get(cluster.name) ?? 0,
    ]);
    return csvDocument(headers, rows);
  }

  /* -------------------- Zeitreihen -------------------- */

  function buildSeriesCsv(metric: VropsTimeSeriesMetricKey, encoding: SeriesEncoding): string {
    const lines = ["vmId;values"];
    for (const object of vmObjects) {
      if (!object.rvtoolsObjectKey) continue;
      const vm = vmByKey.get(object.rvtoolsObjectKey);
      if (!vm) continue;
      const series = readSeries(indexedChunks, object.objectKey, metric, expectedSlots);
      if (series.every((value) => value === null)) continue;
      lines.push(`${csvCell(pseudonyms.apply("vm", vm.vmName))};${encodeAnalysisSeries(series, encoding)}`);
    }
    return lines.join("\n");
  }

  /* -------------------- Metadaten -------------------- */

  function buildMetaJson(): string {
    const rangeStartIso = importMeta ? new Date(importMeta.rangeStartUtc).toISOString() : null;
    const rangeEndIso = importMeta ? new Date(importMeta.rangeEndUtc).toISOString() : null;
    const holidays: Holiday[] = importMeta
      ? austrianHolidaysInRange(localDateKey(importMeta.rangeStartUtc), localDateKey(importMeta.rangeEndUtc))
      : [];

    return `${JSON.stringify({
      formatVersion: ANALYSIS_EXPORT_FORMAT_VERSION,
      generatedAt: input.generatedAt,
      appVersion: input.appVersion,
      pseudonymized: input.pseudonymize,
      timeSeries: importMeta
        ? {
          importId: importMeta.id,
          importedAt: importMeta.importedAt,
          timezone: importMeta.timezone,
          intervalMinutes: importMeta.intervalMinutes,
          rangeStartUtc: importMeta.rangeStartUtc,
          rangeEndUtc: importMeta.rangeEndUtc,
          rangeStartIso,
          rangeEndIso,
          expectedSlots: importMeta.expectedSlots,
          days: round(importMeta.expectedSlots / 24, 2),
          schemaVersion: importMeta.schemaVersion,
          validationStatus: importMeta.validationStatus,
          qualitySummary: importMeta.qualitySummary,
        }
        : null,
      series: SERIES_METRICS.filter((entry) => seriesMetrics.includes(entry.metric)).map((entry) => ({
        metric: entry.metric,
        file: `series/${entry.fileName}.csv`,
        unit: entry.unit,
        encoding: entry.encoding,
      })),
      missingSeries: SERIES_METRICS
        .filter((entry) => !seriesMetrics.includes(entry.metric))
        .map((entry) => entry.metric),
      rightsizing: CPU_RIGHTSIZING_POLICIES[input.rightsizingLevel],
      counts: {
        vms: input.vms.length,
        hosts: input.hosts.length,
        clusters: input.clusters.length,
        timeSeriesVmObjects: vmObjects.length,
        matchedVmObjects: vmObjects.filter((object) => object.matchStatus === "matched").length,
        profiles: input.profiles.length,
      },
      holidays,
    }, null, 2)}\n`;
  }

  function localDateKey(timestampUtc: number): string {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: importMeta?.timezone ?? "Europe/Vienna",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(timestampUtc));
  }

  function buildReadme(): string {
    return [
      "# RVTools-Analyzer — Analyse-Export",
      "",
      `Format-Version ${ANALYSIS_EXPORT_FORMAT_VERSION}, erzeugt am ${input.generatedAt}.`,
      "",
      "## Dateien",
      "",
      "- `meta.json` — Zeitraum, Zeitzone, Rasterlänge, vorhandene Metriken samt Kodierung, Feiertage.",
      "- `vms.csv` — eine Zeile je VM: Inventar, Profilkennzahlen, Rightsizing-Bewertung der App.",
      "- `hosts.csv` — Hostkapazität; `mhzPerCore` ist die Umrechnungsbasis von MHz auf vCPU.",
      "- `clusters.csv` — Clusterkapazität.",
      "- `series/*.csv` — stündliche Rohreihen, eine Zeile je VM.",
      `- CPU-Rightsizing-Stufe: ${CPU_RIGHTSIZING_POLICIES[input.rightsizingLevel].label} (${input.rightsizingLevel}).`,
      "",
      "## Zeitreihenformat",
      "",
      "Jede Zeile ist `vmId;values`. `values` enthält genau `expectedSlots` Werte im",
      "Stundenraster; Slot 0 entspricht `timeSeries.rangeStartUtc` aus `meta.json`.",
      "",
      "Kodiert wird als Differenz zum vorigen Wert, nicht als Absolutwert. Ein leeres",
      "Feld ist eine Messlücke und unterbricht die Differenzkette nicht — Bezugspunkt",
      "bleibt der letzte bekannte Wert. `wert*anzahl` steht für Wiederholungen.",
      "",
      "Rückrechnung je Metrik mit `encoding` aus `meta.json`:",
      "",
      "```",
      "wert = laufende_summe_der_deltas / encoding.scale",
      "```",
      "",
      "Beispiel: `1000,10,10,,0*3` bei `scale = 1` sind die Werte",
      "1000, 1010, 1020, Lücke, 1020, 1020, 1020.",
      "",
      "## Verknüpfung",
      "",
      "`vms.csv.vmId` und die `vmId` der Reihendateien sind identisch. Bei aktiver",
      "Pseudonymisierung sind die Kürzel über Exportläufe hinweg stabil, sodass sich",
      "zwei Exporte desselben Bestands direkt vergleichen lassen.",
      "",
    ].join("\n");
  }
}
