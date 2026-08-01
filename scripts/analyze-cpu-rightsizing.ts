/**
 * Wertet den Analyse-Export gegen die offenen Fragen zum CPU-Rightsizing aus.
 *
 * Ausführen mit:
 *   npx vite-node --options.transformMode.ssr='.*' scripts/analyze-cpu-rightsizing.ts
 *
 * Das Skript liest ausschließlich den Export – keine App-Zustände, keine Datenbank.
 * Jede Kennzahl wird aus den Rohreihen neu berechnet, damit die Befunde unabhängig
 * von der aktuellen Produktionslogik belegbar sind.
 */
import { readFileSync } from "node:fs";
import { decodeAnalysisSeries, type SeriesEncoding } from "@/lib/export/analysisSeriesCodec";
import { buildHourGrid, classifyVmBehavior } from "@/domain/services/vmWorkloadProfileService";
import type { VropsTimeSeriesImport } from "@/domain/models/types";

const ROOT = process.argv[2] ?? "c:/Users/asi/Documents/GitHub/rvtools-analyzer/rvtools-analyse_2026-08-01";

/* ------------------------------------------------------------------ */
/*  Einlesen                                                           */
/* ------------------------------------------------------------------ */

interface Meta {
  timeSeries: { expectedSlots: number; rangeStartUtc: number; timezone: string };
  series: { metric: string; file: string; encoding: SeriesEncoding }[];
  rightsizing?: { level: string; label: string; peakPercentile: number; targetUtilizationP95: number; targetUtilizationPeak: number };
}
const meta: Meta = JSON.parse(readFileSync(`${ROOT}/meta.json`, "utf8"));
const SLOTS = meta.timeSeries.expectedSlots;

function readTable(file: string): { header: string[]; rows: string[][] } {
  const text = readFileSync(`${ROOT}/${file}`, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  const header = lines[0].split(";");
  return { header, rows: lines.slice(1).map((line) => line.split(";")) };
}

function columnIndex(header: string[], name: string): number {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Spalte fehlt: ${name}`);
  return index;
}

/** Eine Metrik als Map vmId → Float64Array(SLOTS); Lücken sind NaN. */
function readSeries(file: string, encoding: SeriesEncoding): Map<string, Float64Array> {
  const text = readFileSync(`${ROOT}/${file}`, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const result = new Map<string, Float64Array>();
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    const separator = line.indexOf(";");
    const vmId = line.slice(0, separator);
    const decoded = decodeAnalysisSeries(line.slice(separator + 1), encoding);
    const values = new Float64Array(SLOTS).fill(Number.NaN);
    for (let index = 0; index < Math.min(SLOTS, decoded.length); index += 1) {
      const value = decoded[index];
      if (value !== null) values[index] = value;
    }
    result.set(vmId, values);
  }
  return result;
}

const seriesByMetric = new Map<string, Map<string, Float64Array>>();
for (const entry of meta.series) seriesByMetric.set(entry.metric, readSeries(entry.file, entry.encoding));
const demandAvg = seriesByMetric.get("vmCpuDemandAvgMHz")!;
const demandMax = seriesByMetric.get("vmCpuDemandMaxMHz")!;
const readyMax = seriesByMetric.get("vmCpuReadyMaxPct")!;
const peakReady = seriesByMetric.get("vmCpuPeakReadyMaxPct")!;
const peakCostop = seriesByMetric.get("vmCpuPeakCostopMaxPct")!;
const disparity = seriesByMetric.get("vmCpuUsageDisparityAvgPct")!;
const capacitySeries = seriesByMetric.get("vmCpuTotalCapacityLastMHz")!;
const vcpuSeries = seriesByMetric.get("vmConfiguredVcpuLast")!;

const vmsTable = readTable("vms.csv");
const hostsTable = readTable("hosts.csv");

const hostMhzPerCore = new Map<string, number>();
{
  const idIndex = columnIndex(hostsTable.header, "hostId");
  const mhzIndex = columnIndex(hostsTable.header, "mhzPerCore");
  for (const row of hostsTable.rows) {
    const value = Number(row[mhzIndex]);
    if (Number.isFinite(value) && value > 0) hostMhzPerCore.set(row[idIndex], value);
  }
}

interface Vm {
  vmId: string;
  cluster: string;
  vcenter: string;
  resourcePool: string;
  vcpu: number;
  shape: string;
  intensity: string;
  confidence: string;
  mhzPerCore: number | null;
  appDemandP95: number | null;
  appCv: number | null;
  appReclaim: number | null;
  appDemandBased: number | null;
  appWithheld: string;
  appSingleCoreBoundHours: number | null;
  appSingleCoreBound: boolean | null;
  appRightsizingLevel: string;
}

const vms: Vm[] = [];
{
  const h = vmsTable.header;
  const col = (name: string) => columnIndex(h, name);
  const cId = col("vmId");
  const cHas = col("hasSeries");
  const cCluster = col("cluster");
  const cVcenter = col("vcenter");
  const cPool = col("resourcePool");
  const cVcpu = col("vcpu");
  const cShape = col("shape");
  const cIntensity = col("intensity");
  const cConfidence = col("confidence");
  const cMhz = col("mhzPerCore");
  const cP95 = col("demandP95MHz");
  const cCv = col("coefficientOfVariation");
  const cReclaim = col("reclaimableVcpu");
  const cDemandBased = col("demandBasedVcpu");
  const cWithheld = col("recommendationWithheldReason");
  const cSingleCoreHours = h.indexOf("singleCoreBoundHours");
  const cSingleCoreFlag = h.indexOf("flagSingleCoreBound");
  const cRightsizingLevel = h.indexOf("rightsizingLevel");
  const num = (raw: string): number | null => {
    if (raw === undefined || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  for (const row of vmsTable.rows) {
    if (row[cHas] !== "1") continue;
    vms.push({
      vmId: row[cId],
      cluster: row[cCluster],
      vcenter: row[cVcenter],
      resourcePool: row[cPool] ?? "",
      vcpu: Number(row[cVcpu]),
      shape: row[cShape] || "unclassified",
      intensity: row[cIntensity] || "unknown",
      confidence: row[cConfidence] || "",
      mhzPerCore: num(row[cMhz]),
      appDemandP95: num(row[cP95]),
      appCv: num(row[cCv]),
      appReclaim: num(row[cReclaim]),
      appDemandBased: num(row[cDemandBased]),
      appWithheld: row[cWithheld] ?? "",
      appSingleCoreBoundHours: cSingleCoreHours >= 0 ? num(row[cSingleCoreHours]) : null,
      appSingleCoreBound: cSingleCoreFlag >= 0 ? row[cSingleCoreFlag] === "1" : null,
      appRightsizingLevel: cRightsizingLevel >= 0 ? row[cRightsizingLevel] : "",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Hilfsfunktionen                                                    */
/* ------------------------------------------------------------------ */

/** Perzentil nach „nächster Rang“, identisch zu src/lib/statistics.ts. */
function quantile(sorted: readonly number[], fraction: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}
function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}
function quantiles(values: readonly number[], fractions: readonly number[]): (number | null)[] {
  const sorted = sortedCopy(values);
  return fractions.map((fraction) => quantile(sorted, fraction));
}
function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "–" : value.toFixed(digits);
}
function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)} %` : "–";
}
function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function stdDev(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length);
}
function section(title: string): void {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}
/** Gibt eine Tabelle mit rechtsbündigen Zahlenspalten aus. */
function table(header: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => (row[index] ?? "").length)));
  const line = (cells: readonly string[]) =>
    cells.map((cell, index) => (index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index]))).join("  ");
  console.log(line(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
}
function quantileRow(label: string, values: readonly number[], digits = 2): string[] {
  const sorted = sortedCopy(values);
  const q = [0.05, 0.25, 0.5, 0.75, 0.95, 0.99].map((fraction) => quantile(sorted, fraction));
  return [label, String(values.length), ...q.map((value) => fmt(value, digits)), fmt(sorted[sorted.length - 1], digits)];
}
const QUANTILE_HEADER = ["", "n", "p05", "p25", "p50", "p75", "p95", "p99", "max"];

/** Letzter bekannter Wert einer Reihe. */
function lastFinite(values: Float64Array | undefined): number | null {
  if (!values) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) if (Number.isFinite(values[index])) return values[index];
  return null;
}
function maxFinite(values: Float64Array | undefined): number | null {
  if (!values) return null;
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) if (Number.isFinite(value) && value > result) result = value;
  return result === Number.NEGATIVE_INFINITY ? null : result;
}

console.log(`Export ${ROOT.split("/").pop()} — ${SLOTS} Slots, ${vms.length} VMs mit Reihe (von ${vmsTable.rows.length} Zeilen in vms.csv).`);
console.log(`Rightsizing-Stufe: ${meta.rightsizing ? `${meta.rightsizing.label} (${meta.rightsizing.level})` : "nicht im Export enthalten"}.`);

/* ------------------------------------------------------------------ */
/*  0  Gegenprobe: stimmt die Dekodierung mit vms.csv überein?         */
/* ------------------------------------------------------------------ */

section("0  Gegenprobe der Dekodierung gegen die von der App exportierten Kennzahlen");
{
  const deviations: number[] = [];
  const cvDeviations: number[] = [];
  for (const vm of vms) {
    const values = demandAvg.get(vm.vmId);
    if (!values) continue;
    const finite = [...values].filter((value) => Number.isFinite(value));
    if (!finite.length) continue;
    const p95 = quantile(sortedCopy(finite), 0.95)!;
    if (vm.appDemandP95 !== null && vm.appDemandP95 > 0) deviations.push(Math.abs(p95 - vm.appDemandP95) / vm.appDemandP95);
    const m = mean(finite)!;
    const cv = m > 0 ? stdDev(finite)! / m : null;
    if (cv !== null && vm.appCv !== null && vm.appCv > 0) cvDeviations.push(Math.abs(cv - vm.appCv) / vm.appCv);
  }
  table(QUANTILE_HEADER, [
    quantileRow("rel. Abw. demandP95 (%)", deviations.map((value) => value * 100), 3),
    quantileRow("rel. Abw. CV (%)", cvDeviations.map((value) => value * 100), 3),
  ]);
}

/* ------------------------------------------------------------------ */
/*  1  vCPU-Umrechnung: gemessene Kapazität gegen mhzPerCore           */
/* ------------------------------------------------------------------ */

section("1  vCPU-Umrechnung — vmCpuTotalCapacityLastMHz / vCPU gegen mhzPerCore");
{
  const ratios: number[] = [];
  const perCoreValues: number[] = [];
  const mhzPerCoreValues: number[] = [];
  let missingCapacity = 0;
  let vcpuMismatch = 0;
  let capacityVaries = 0;
  const byMhzPerCore = new Map<number, number[]>();
  for (const vm of vms) {
    const capacity = lastFinite(capacitySeries.get(vm.vmId));
    const measuredVcpu = lastFinite(vcpuSeries.get(vm.vmId));
    if (capacity === null) { missingCapacity += 1; continue; }
    if (measuredVcpu !== null && measuredVcpu !== vm.vcpu) vcpuMismatch += 1;
    const capacityValues = [...capacitySeries.get(vm.vmId)!].filter((value) => Number.isFinite(value));
    if (new Set(capacityValues).size > 1) capacityVaries += 1;
    const vcpu = measuredVcpu ?? vm.vcpu;
    if (!vcpu) continue;
    const perCore = capacity / vcpu;
    perCoreValues.push(perCore);
    if (vm.mhzPerCore) {
      ratios.push(perCore / vm.mhzPerCore);
      mhzPerCoreValues.push(vm.mhzPerCore);
      const bucket = byMhzPerCore.get(vm.mhzPerCore) ?? [];
      bucket.push(perCore);
      byMhzPerCore.set(vm.mhzPerCore, bucket);
    }
  }
  console.log(`ohne Kapazitätsreihe: ${missingCapacity} VMs | vCPU-Abweichung Reihe vs. RVTools: ${vcpuMismatch} | Kapazität im Monat verändert: ${capacityVaries}`);
  table(QUANTILE_HEADER, [
    quantileRow("gemessen MHz/vCPU", perCoreValues, 0),
    quantileRow("hosts.csv mhzPerCore", mhzPerCoreValues, 0),
    quantileRow("Verhältnis gemessen/host", ratios, 4),
  ]);
  console.log("\nJe Host-Taktklasse:");
  table(["mhzPerCore (Host)", "VMs", "gemessen p05", "p50", "p95", "Faktor p50"],
    [...byMhzPerCore.entries()].sort((left, right) => right[1].length - left[1].length).map(([mhz, values]) => {
      const q = quantiles(values, [0.05, 0.5, 0.95]);
      return [String(mhz), String(values.length), fmt(q[0], 0), fmt(q[1], 0), fmt(q[2], 0), fmt((q[1] ?? 0) / mhz, 4)];
    }));
}

/* ------------------------------------------------------------------ */
/*  Kennzahlen je VM aufbauen (Basis für 2–6)                          */
/* ------------------------------------------------------------------ */

interface VmMetrics {
  vm: Vm;
  vcpu: number;
  capacity: number | null;
  /** Stundenwerte, Lücken als NaN. */
  avg: Float64Array;
  max: Float64Array | undefined;
  avgFinite: number[];
  avgSorted: number[];
  cv: number | null;
  p95: number;
  p50: number;
  peakOfAvg: number;
  peakOfMax: number;
  /** p95/max der stündlichen Verhältnisse max/avg, nur bei nennenswerter Last. */
  burstFactorP50: number | null;
  burstFactorP95: number | null;
  /** Lastgewichteter Konzentrationsindex und effektiv belastete Kerne. */
  concentrationP50: number | null;
  concentrationP90: number | null;
  effectiveCoresP95: number | null;
  effectiveCoresMax: number | null;
  readyP95: number | null;
  readyMaxV: number | null;
  peakReadyP95: number | null;
  peakReadyMaxV: number | null;
  costopMaxV: number | null;
  costopHours: number;
  /** Anteil der Kapazität in der Spitzenstunde. */
  utilP95Pct: number | null;
  utilMaxAvgPct: number | null;
  utilMaxOfMaxPct: number | null;
  hoursAbove75: number;
  hoursAbove90: number;
  weekCorrMedian: number | null;
  weeklyMaxCv: number | null;
  weeklyMaxMin: number | null;
  weeklyMaxMax: number | null;
}

/** Nur Stunden mit spürbarer Last taugen für Konzentrations- und Spitzenaussagen. */
const CONCENTRATION_MIN_CORE_PCT = 5;

const metrics: VmMetrics[] = [];
for (const vm of vms) {
  const avg = demandAvg.get(vm.vmId);
  if (!avg) continue;
  const max = demandMax.get(vm.vmId);
  const disp = disparity.get(vm.vmId);
  const capacity = lastFinite(capacitySeries.get(vm.vmId));
  const vcpu = lastFinite(vcpuSeries.get(vm.vmId)) ?? vm.vcpu;
  const avgFinite: number[] = [];
  for (const value of avg) if (Number.isFinite(value)) avgFinite.push(value);
  if (!avgFinite.length) continue;
  const avgSorted = sortedCopy(avgFinite);
  const m = mean(avgFinite)!;
  const burstFactors: number[] = [];
  const concentrations: number[] = [];
  const effectiveCores: number[] = [];
  let hoursAbove75 = 0;
  let hoursAbove90 = 0;
  let utilMaxOfMax = 0;
  const p95 = quantile(avgSorted, 0.95)!;
  const burstThreshold = Math.max(p95 * 0.2, 1);
  for (let slot = 0; slot < SLOTS; slot += 1) {
    const a = avg[slot];
    if (!Number.isFinite(a)) continue;
    const x = max?.[slot];
    if (Number.isFinite(x) && a > burstThreshold && a > 0) burstFactors.push(x! / a);
    if (capacity && capacity > 0) {
      const meanCorePct = (a / capacity) * 100;
      if (meanCorePct > 75) hoursAbove75 += 1;
      if (meanCorePct > 90) hoursAbove90 += 1;
      if (Number.isFinite(x)) utilMaxOfMax = Math.max(utilMaxOfMax, (x! / capacity) * 100);
      const d = disp?.[slot];
      if (Number.isFinite(d) && meanCorePct >= CONCENTRATION_MIN_CORE_PCT && vcpu > 1) {
        const index = (d! / meanCorePct) / vcpu;
        concentrations.push(index);
        const maxCorePct = Math.min(100, meanCorePct + (d! * (vcpu - 1)) / vcpu);
        if (maxCorePct > 0) effectiveCores.push((vcpu * meanCorePct) / maxCorePct);
      }
    }
  }
  const ready = readyMax.get(vm.vmId);
  const pready = peakReady.get(vm.vmId);
  const costop = peakCostop.get(vm.vmId);
  const readyFinite = ready ? [...ready].filter((value) => Number.isFinite(value)) : [];
  const preadyFinite = pready ? [...pready].filter((value) => Number.isFinite(value)) : [];
  const costopFinite = costop ? [...costop].filter((value) => Number.isFinite(value)) : [];
  const effSorted = sortedCopy(effectiveCores);
  const concSorted = sortedCopy(concentrations);
  const burstSorted = sortedCopy(burstFactors);

  // Wochenvergleich: vier volle 168-Stunden-Blöcke ab Slot 0, wochentagsgleich ausgerichtet.
  const weeks: number[][] = [];
  for (let week = 0; week < 4; week += 1) weeks.push([...avg.slice(week * 168, (week + 1) * 168)]);
  const correlations: number[] = [];
  const weeklyMaxima: number[] = [];
  for (const week of weeks) {
    const finite = week.filter((value) => Number.isFinite(value));
    if (finite.length >= 84) weeklyMaxima.push(Math.max(...finite));
  }
  for (let left = 0; left < weeks.length; left += 1) {
    for (let right = left + 1; right < weeks.length; right += 1) {
      const l: number[] = [];
      const r: number[] = [];
      for (let hour = 0; hour < 168; hour += 1) {
        if (Number.isFinite(weeks[left][hour]) && Number.isFinite(weeks[right][hour])) {
          l.push(weeks[left][hour]);
          r.push(weeks[right][hour]);
        }
      }
      if (l.length < 84) continue;
      const lm = mean(l)!;
      const rm = mean(r)!;
      let numerator = 0;
      let ls = 0;
      let rs = 0;
      for (let index = 0; index < l.length; index += 1) {
        numerator += (l[index] - lm) * (r[index] - rm);
        ls += (l[index] - lm) ** 2;
        rs += (r[index] - rm) ** 2;
      }
      const denominator = Math.sqrt(ls * rs);
      if (denominator > 0) correlations.push(numerator / denominator);
    }
  }
  const weeklyMaxMean = mean(weeklyMaxima);

  metrics.push({
    vm,
    vcpu,
    capacity,
    avg,
    max,
    avgFinite,
    avgSorted,
    cv: m > 0 ? stdDev(avgFinite)! / m : null,
    p95,
    p50: quantile(avgSorted, 0.5)!,
    peakOfAvg: avgSorted[avgSorted.length - 1],
    peakOfMax: maxFinite(max) ?? avgSorted[avgSorted.length - 1],
    burstFactorP50: quantile(burstSorted, 0.5),
    burstFactorP95: quantile(burstSorted, 0.95),
    concentrationP50: quantile(concSorted, 0.5),
    concentrationP90: quantile(concSorted, 0.9),
    effectiveCoresP95: quantile(effSorted, 0.95),
    effectiveCoresMax: effSorted.length ? effSorted[effSorted.length - 1] : null,
    readyP95: quantile(sortedCopy(readyFinite), 0.95),
    readyMaxV: readyFinite.length ? Math.max(...readyFinite) : null,
    peakReadyP95: quantile(sortedCopy(preadyFinite), 0.95),
    peakReadyMaxV: preadyFinite.length ? Math.max(...preadyFinite) : null,
    costopMaxV: costopFinite.length ? Math.max(...costopFinite) : null,
    costopHours: costopFinite.filter((value) => value > 0).length,
    utilP95Pct: capacity ? (p95 / capacity) * 100 : null,
    utilMaxAvgPct: capacity ? (avgSorted[avgSorted.length - 1] / capacity) * 100 : null,
    utilMaxOfMaxPct: capacity ? utilMaxOfMax : null,
    hoursAbove75,
    hoursAbove90,
    weekCorrMedian: quantile(sortedCopy(correlations), 0.5),
    weeklyMaxCv: weeklyMaxima.length >= 3 && weeklyMaxMean && weeklyMaxMean > 0 ? stdDev(weeklyMaxima)! / weeklyMaxMean : null,
    weeklyMaxMin: weeklyMaxima.length >= 3 ? Math.min(...weeklyMaxima) : null,
    weeklyMaxMax: weeklyMaxima.length >= 3 ? Math.max(...weeklyMaxima) : null,
  });
}

const SHAPES = ["constant", "constant-with-peak", "business-hours", "night-batch", "weekend", "variable", "bursty", "irregular", "unclassified"];
function byShape(): Map<string, VmMetrics[]> {
  const groups = new Map<string, VmMetrics[]>();
  for (const entry of metrics) {
    const list = groups.get(entry.vm.shape) ?? [];
    list.push(entry);
    groups.set(entry.vm.shape, list);
  }
  return groups;
}
const shapeGroups = byShape();

/* ------------------------------------------------------------------ */
/*  2  Wie weit unterschätzt der Stundenmittelwert die Spitze?         */
/* ------------------------------------------------------------------ */

section("2  Spitzenunterschätzung — vmCpuDemandMaxMHz gegen vmCpuDemandAvgMHz");
{
  const hourly: number[] = [];
  for (const entry of metrics) {
    const threshold = Math.max(entry.p95 * 0.2, 1);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const a = entry.avg[slot];
      const x = entry.max?.[slot];
      if (Number.isFinite(a) && Number.isFinite(x) && a > threshold) hourly.push(x! / a);
    }
  }
  table(QUANTILE_HEADER, [
    quantileRow("Stundenverhältnis max/avg", hourly, 2),
    quantileRow("VM: p50 des Verhältnisses", metrics.flatMap((entry) => (entry.burstFactorP50 === null ? [] : [entry.burstFactorP50])), 2),
    quantileRow("VM: p95 des Verhältnisses", metrics.flatMap((entry) => (entry.burstFactorP95 === null ? [] : [entry.burstFactorP95])), 2),
    quantileRow("VM: Monatsmax(max)/Monatsmax(avg)", metrics.flatMap((entry) => (entry.peakOfAvg > 0 ? [entry.peakOfMax / entry.peakOfAvg] : [])), 2),
  ]);
  console.log("\nJe Lastmuster (Verhältnis Monatsmax(max) / Monatsmax(avg)):");
  table(["shape", "VMs", "p50", "p90", "p99", "Stunden-p95 max/avg"],
    SHAPES.flatMap((shape) => {
      const group = shapeGroups.get(shape);
      if (!group?.length) return [];
      const ratios = group.flatMap((entry) => (entry.peakOfAvg > 0 ? [entry.peakOfMax / entry.peakOfAvg] : []));
      const q = quantiles(ratios, [0.5, 0.9, 0.99]);
      const hourlyP95 = quantile(sortedCopy(group.flatMap((entry) => (entry.burstFactorP95 === null ? [] : [entry.burstFactorP95]))), 0.5);
      return [[shape, String(group.length), fmt(q[0]), fmt(q[1]), fmt(q[2]), fmt(hourlyP95)]];
    }));
}

/* ------------------------------------------------------------------ */
/*  3  Konzentrationsindex                                             */
/* ------------------------------------------------------------------ */

section("3  Konzentrationsindex (Disparity / Auslastung) / vCPU");
{
  const hourly: number[] = [];
  for (const entry of metrics) {
    if (!entry.capacity || entry.vcpu <= 1) continue;
    const disp = disparity.get(entry.vm.vmId);
    if (!disp) continue;
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const a = entry.avg[slot];
      const d = disp[slot];
      if (!Number.isFinite(a) || !Number.isFinite(d)) continue;
      const meanCorePct = (a / entry.capacity) * 100;
      if (meanCorePct < CONCENTRATION_MIN_CORE_PCT) continue;
      hourly.push((d / meanCorePct) / entry.vcpu);
    }
  }
  console.log(`Lasthaltige Stunden (Kernauslastung ≥ ${CONCENTRATION_MIN_CORE_PCT} %): ${hourly.length}`);
  table(QUANTILE_HEADER, [
    quantileRow("Stundenindex", hourly, 3),
    quantileRow("VM p50", metrics.flatMap((entry) => (entry.concentrationP50 === null ? [] : [entry.concentrationP50])), 3),
    quantileRow("VM p90", metrics.flatMap((entry) => (entry.concentrationP90 === null ? [] : [entry.concentrationP90])), 3),
  ]);
  const buckets = new Array(20).fill(0);
  let above = 0;
  for (const value of hourly) {
    const bucket = Math.floor(value * 20);
    if (bucket >= 20) above += 1; else if (bucket >= 0) buckets[bucket] += 1;
  }
  console.log("\nHistogramm der Stundenwerte (Breite 0,05):");
  table(["Bereich", "Stunden", "Anteil", "Balken"],
    buckets.map((count, index) => [
      `${(index * 0.05).toFixed(2)}–${((index + 1) * 0.05).toFixed(2)}`,
      String(count),
      pct(count, hourly.length),
      "#".repeat(Math.round((count / Math.max(...buckets)) * 40)),
    ]).concat([[">1,00", String(above), pct(above, hourly.length), ""]]));

  console.log("\nEffektiv belastete Kerne (vCPU × mittlere / höchste Kernauslastung):");
  table(["shape", "VMs", "eff. Kerne p95: p50", "p90", "max eff. Kerne: p50", "p90", "konfig. vCPU p50"],
    SHAPES.flatMap((shape) => {
      const group = shapeGroups.get(shape)?.filter((entry) => entry.effectiveCoresP95 !== null) ?? [];
      if (!group.length) return [];
      const p95q = quantiles(group.map((entry) => entry.effectiveCoresP95!), [0.5, 0.9]);
      const maxq = quantiles(group.map((entry) => entry.effectiveCoresMax!), [0.5, 0.9]);
      const vcpuq = quantiles(group.map((entry) => entry.vcpu), [0.5]);
      return [[shape, String(group.length), fmt(p95q[0]), fmt(p95q[1]), fmt(maxq[0]), fmt(maxq[1]), fmt(vcpuq[0], 0)]];
    }));

  const withConcentration = metrics.filter((entry) => entry.concentrationP90 !== null);
  const singleThreaded = withConcentration.filter((entry) => (entry.effectiveCoresMax ?? 99) < 1.5);
  console.log(`\nVMs mit Konzentrationsmessung: ${withConcentration.length}`);
  console.log(`davon faktisch einkernig (max eff. Kerne < 1,5): ${singleThreaded.length} (${pct(singleThreaded.length, withConcentration.length)}), zusammen ${singleThreaded.reduce((sum, entry) => sum + entry.vcpu, 0)} konfigurierte vCPU`);
}

/* ------------------------------------------------------------------ */
/*  4  Gibt es Vergrößerungskandidaten?                                */
/* ------------------------------------------------------------------ */

section("4  Engpasssignale — Ready, Peak-Ready, Co-Stop, Kapazitätsnähe");
{
  table(QUANTILE_HEADER, [
    quantileRow("ready p95 je VM (%)", metrics.flatMap((entry) => (entry.readyP95 === null ? [] : [entry.readyP95])), 3),
    quantileRow("ready max je VM (%)", metrics.flatMap((entry) => (entry.readyMaxV === null ? [] : [entry.readyMaxV])), 3),
    quantileRow("peak-ready p95 je VM (%)", metrics.flatMap((entry) => (entry.peakReadyP95 === null ? [] : [entry.peakReadyP95])), 3),
    quantileRow("peak-ready max je VM (%)", metrics.flatMap((entry) => (entry.peakReadyMaxV === null ? [] : [entry.peakReadyMaxV])), 3),
    quantileRow("peak-costop max je VM (%)", metrics.flatMap((entry) => (entry.costopMaxV === null ? [] : [entry.costopMaxV])), 3),
    quantileRow("Auslastung p95 (% Kapazität)", metrics.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct])), 1),
    quantileRow("Auslastung max Stundenmittel (%)", metrics.flatMap((entry) => (entry.utilMaxAvgPct === null ? [] : [entry.utilMaxAvgPct])), 1),
    quantileRow("Auslastung max Spitzenwert (%)", metrics.flatMap((entry) => (entry.utilMaxOfMaxPct === null ? [] : [entry.utilMaxOfMaxPct])), 1),
  ]);
  const count = (predicate: (entry: VmMetrics) => boolean) => metrics.filter(predicate).length;
  const total = metrics.length;
  console.log();
  table(["Kriterium", "VMs", "Anteil"], [
    ["ready p95 > 5 %", String(count((entry) => (entry.readyP95 ?? 0) > 5)), pct(count((entry) => (entry.readyP95 ?? 0) > 5), total)],
    ["peak-ready p95 > 5 %", String(count((entry) => (entry.peakReadyP95 ?? 0) > 5)), pct(count((entry) => (entry.peakReadyP95 ?? 0) > 5), total)],
    ["peak-ready p95 > 10 %", String(count((entry) => (entry.peakReadyP95 ?? 0) > 10)), pct(count((entry) => (entry.peakReadyP95 ?? 0) > 10), total)],
    ["peak-ready max > 20 %", String(count((entry) => (entry.peakReadyMaxV ?? 0) > 20)), pct(count((entry) => (entry.peakReadyMaxV ?? 0) > 20), total)],
    ["costop max > 0", String(count((entry) => (entry.costopMaxV ?? 0) > 0)), pct(count((entry) => (entry.costopMaxV ?? 0) > 0), total)],
    ["costop max > 3 %", String(count((entry) => (entry.costopMaxV ?? 0) > 3)), pct(count((entry) => (entry.costopMaxV ?? 0) > 3), total)],
    ["≥ 1 Stunde > 75 % Kapazität", String(count((entry) => entry.hoursAbove75 > 0)), pct(count((entry) => entry.hoursAbove75 > 0), total)],
    ["≥ 24 Stunden > 75 % Kapazität", String(count((entry) => entry.hoursAbove75 >= 24)), pct(count((entry) => entry.hoursAbove75 >= 24), total)],
    ["≥ 1 Stunde > 90 % Kapazität", String(count((entry) => entry.hoursAbove90 > 0)), pct(count((entry) => entry.hoursAbove90 > 0), total)],
    ["≥ 24 Stunden > 90 % Kapazität", String(count((entry) => entry.hoursAbove90 >= 24)), pct(count((entry) => entry.hoursAbove90 >= 24), total)],
    ["p95-Auslastung > 65 %", String(count((entry) => (entry.utilP95Pct ?? 0) > 65)), pct(count((entry) => (entry.utilP95Pct ?? 0) > 65), total)],
  ]);

  const grow = metrics.filter((entry) => (entry.utilP95Pct ?? 0) > 65 || entry.hoursAbove90 >= 24 || (entry.peakReadyP95 ?? 0) > 10);
  console.log(`\nVergrößerungsverdacht (p95 > 65 % Kapazität ODER ≥ 24 h > 90 % ODER peak-ready p95 > 10 %): ${grow.length} VMs (${pct(grow.length, total)})`);
  console.log("Die zwanzig stärksten Fälle:");
  table(["vmId", "vCPU", "shape", "util p95 %", "h>90%", "peakReady p95", "costop max", "eff. Kerne max"],
    grow.sort((left, right) => (right.utilP95Pct ?? 0) - (left.utilP95Pct ?? 0)).slice(0, 20).map((entry) => [
      entry.vm.vmId, String(entry.vcpu), entry.vm.shape, fmt(entry.utilP95Pct, 1), String(entry.hoursAbove90),
      fmt(entry.peakReadyP95, 2), fmt(entry.costopMaxV, 2), fmt(entry.effectiveCoresMax, 2),
    ]));
}

/* ------------------------------------------------------------------ */
/*  5  Wochen-Wiederholbarkeit                                         */
/* ------------------------------------------------------------------ */

section("5  Wochen-Wiederholbarkeit — vier volle Wochen im Vergleich");
{
  table(["shape", "VMs", "Wochenkorr. p10", "p50", "p90", "CV der Wochenmaxima p50", "p90", "max/min Wochenmax p50"],
    SHAPES.flatMap((shape) => {
      const group = shapeGroups.get(shape) ?? [];
      const correlations = group.flatMap((entry) => (entry.weekCorrMedian === null ? [] : [entry.weekCorrMedian]));
      if (!correlations.length) return [];
      const cq = quantiles(correlations, [0.1, 0.5, 0.9]);
      const cvq = quantiles(group.flatMap((entry) => (entry.weeklyMaxCv === null ? [] : [entry.weeklyMaxCv])), [0.5, 0.9]);
      const spread = group.flatMap((entry) => (entry.weeklyMaxMin && entry.weeklyMaxMin > 0 ? [entry.weeklyMaxMax! / entry.weeklyMaxMin] : []));
      return [[shape, String(group.length), fmt(cq[0]), fmt(cq[1]), fmt(cq[2]), fmt(cvq[0]), fmt(cvq[1]), fmt(quantile(sortedCopy(spread), 0.5))]];
    }));

  for (const shape of ["bursty", "irregular"]) {
    const group = shapeGroups.get(shape) ?? [];
    const repeatable = group.filter((entry) => (entry.weekCorrMedian ?? -1) >= 0.7 && (entry.weeklyMaxCv ?? 9) <= 0.25);
    const moderate = group.filter((entry) => (entry.weekCorrMedian ?? -1) >= 0.5 && (entry.weeklyMaxCv ?? 9) <= 0.4);
    console.log(`\n${shape}: ${group.length} VMs | streng wiederholbar (Korr ≥ 0,7 und CV(Wochenmax) ≤ 0,25): ${repeatable.length} (${pct(repeatable.length, group.length)}) | moderat (≥ 0,5 / ≤ 0,4): ${moderate.length} (${pct(moderate.length, group.length)})`);
  }
}

/* ------------------------------------------------------------------ */
/*  6  Co-Stop nach vCPU-Breite                                        */
/* ------------------------------------------------------------------ */

section("6  Co-Stop und Ready nach vCPU-Anzahl");
{
  const widths = [...new Set(metrics.map((entry) => entry.vcpu))].sort((left, right) => left - right);
  table(["vCPU", "VMs", "costop>0", "Anteil", "costop max p95", "peakReady p95 (p50)", "eff. Kerne max p50", "util p95 % p50"],
    widths.map((width) => {
      const group = metrics.filter((entry) => entry.vcpu === width);
      const withCostop = group.filter((entry) => (entry.costopMaxV ?? 0) > 0);
      return [
        String(width), String(group.length), String(withCostop.length), pct(withCostop.length, group.length),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.costopMaxV === null ? [] : [entry.costopMaxV]))), 0.95), 2),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.peakReadyP95 === null ? [] : [entry.peakReadyP95]))), 0.5), 2),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.effectiveCoresMax === null ? [] : [entry.effectiveCoresMax]))), 0.5), 2),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct]))), 0.5), 1),
      ];
    }));
}

/* ------------------------------------------------------------------ */
/*  7  Variationskoeffizient — Grundlage für constantLoadCvMax         */
/* ------------------------------------------------------------------ */

section("7  Variationskoeffizient der stündlichen Demand-Reihe");
{
  const values = metrics.flatMap((entry) => (entry.cv === null ? [] : [entry.cv]));
  table(QUANTILE_HEADER, [quantileRow("CV alle VMs", values, 3)]);
  const buckets = new Array(24).fill(0);
  for (const value of values) {
    const bucket = Math.min(23, Math.floor(value / 0.1));
    buckets[bucket] += 1;
  }
  console.log("\nHistogramm (Breite 0,1; letzte Zeile = alles ≥ 2,3):");
  table(["CV", "VMs", "kumuliert", "Balken"], buckets.map((count, index) => {
    const cumulative = buckets.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
    return [`${(index * 0.1).toFixed(1)}`, String(count), pct(cumulative, values.length), "#".repeat(Math.round((count / Math.max(...buckets)) * 40))];
  }));
  console.log("\nWie viele VMs fielen bei welcher Schwelle auf constant/constant-with-peak?");
  table(["constantLoadCvMax", "VMs mit CV ≤ Schwelle", "Anteil"],
    [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].map((threshold) => {
      const count = values.filter((value) => value <= threshold).length;
      return [String(threshold), String(count), pct(count, values.length)];
    }));
  console.log("\nCV gegen Wochen-Wiederholbarkeit und Konzentration (zeigt, ob CV allein trennt):");
  table(["CV-Band", "VMs", "Wochenkorr. p50", "eff. Kerne max p50", "util p95 % p50", "max/avg p95 p50"],
    [[0, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.5], [0.5, 0.8], [0.8, 1.2], [1.2, 99]].map(([low, high]) => {
      const group = metrics.filter((entry) => entry.cv !== null && entry.cv >= low && entry.cv < high);
      return [
        `${low}–${high === 99 ? "∞" : high}`, String(group.length),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.weekCorrMedian === null ? [] : [entry.weekCorrMedian]))), 0.5)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.effectiveCoresMax === null ? [] : [entry.effectiveCoresMax]))), 0.5)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct]))), 0.5), 1),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.burstFactorP95 === null ? [] : [entry.burstFactorP95]))), 0.5)),
      ];
    }));
}

/* ------------------------------------------------------------------ */
/*  8  Simulation der Empfehlungslogik                                 */
/* ------------------------------------------------------------------ */

section("8  Simulation — bedarfsgerechte Größe unter verschiedenen Regelwerken");
{
  const ceilEven = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);
  const variants: { label: string; size: (entry: VmMetrics) => number | null }[] = [
    {
      label: "A Ist: mhzPerCore, p95/0,65 + max(avg)/0,9, Deckel",
      size: (entry) => {
        const mhz = entry.vm.mhzPerCore;
        if (!mhz) return null;
        return Math.min(entry.vcpu, ceilEven(Math.max(entry.p95 / mhz / 0.65, entry.peakOfAvg / mhz / 0.9, 2)));
      },
    },
    {
      label: "B wie A, aber gemessene Kapazität statt mhzPerCore",
      size: (entry) => {
        if (!entry.capacity) return null;
        const perCore = entry.capacity / entry.vcpu;
        return Math.min(entry.vcpu, ceilEven(Math.max(entry.p95 / perCore / 0.65, entry.peakOfAvg / perCore / 0.9, 2)));
      },
    },
    {
      label: "C wie B, aber demandMax statt max(avg), ohne Deckel",
      size: (entry) => {
        if (!entry.capacity) return null;
        const perCore = entry.capacity / entry.vcpu;
        return ceilEven(Math.max(entry.p95 / perCore / 0.65, entry.peakOfMax / perCore / 0.9, 2));
      },
    },
    {
      label: "D wie C, zusätzlich Parallelitätsgrenze (eff. Kerne max × 1,2)",
      size: (entry) => {
        if (!entry.capacity) return null;
        const perCore = entry.capacity / entry.vcpu;
        const demandDriven = Math.max(entry.p95 / perCore / 0.65, entry.peakOfMax / perCore / 0.9, 2);
        // Mehr vCPU als je gleichzeitig belastet werden, bringen nichts – deshalb Obergrenze.
        const parallelism = entry.effectiveCoresMax === null ? Number.POSITIVE_INFINITY : entry.effectiveCoresMax * 1.2;
        return ceilEven(Math.max(2, Math.min(demandDriven, parallelism)));
      },
    },
  ];
  const rows: string[][] = [];
  for (const variant of variants) {
    let down = 0;
    let up = 0;
    let reclaim = 0;
    let add = 0;
    let evaluated = 0;
    for (const entry of metrics) {
      const size = variant.size(entry);
      if (size === null) continue;
      evaluated += 1;
      if (size < entry.vcpu) { down += 1; reclaim += entry.vcpu - size; }
      if (size > entry.vcpu) { up += 1; add += size - entry.vcpu; }
    }
    rows.push([variant.label, String(evaluated), String(down), String(reclaim), String(up), String(add)]);
  }
  table(["Variante", "bewertet", "VMs kleiner", "vCPU frei", "VMs größer", "vCPU nötig"], rows);
  const totalVcpu = metrics.reduce((sum, entry) => sum + entry.vcpu, 0);
  console.log(`\nKonfigurierte vCPU im Bestand mit Reihe: ${totalVcpu}`);
  const withheld = metrics.filter((entry) => ["bursty", "irregular", "unclassified"].includes(entry.vm.shape));
  console.log(`Von SHAPES_WITHOUT_RECOMMENDATION betroffen: ${withheld.length} VMs (${pct(withheld.length, metrics.length)}), ${withheld.reduce((sum, entry) => sum + entry.vcpu, 0)} vCPU`);
  const withheldRepeatable = withheld.filter((entry) => (entry.weekCorrMedian ?? -1) >= 0.5 && (entry.weeklyMaxCv ?? 9) <= 0.4);
  console.log(`davon mit wiederholbarem Wochenmuster: ${withheldRepeatable.length} (${pct(withheldRepeatable.length, withheld.length)})`);
}

/* ------------------------------------------------------------------ */
/*  9  Druck-Signale je Auslastungsband — steigt Ready mit der Last?    */
/* ------------------------------------------------------------------ */

section("9  Reagieren Peak-Ready und Co-Stop überhaupt auf Auslastung und vCPU-Breite?");
{
  const UTIL_BANDS = [[0, 10], [10, 25], [25, 50], [50, 75], [75, 90], [90, 1e9]];
  const WIDTH_BANDS = [[1, 2], [4, 4], [6, 8], [10, 16], [17, 1e9]];
  const cells = new Map<string, { ready: number[]; costop: number[] }>();
  for (const entry of metrics) {
    if (!entry.capacity) continue;
    const pready = peakReady.get(entry.vm.vmId);
    const costop = peakCostop.get(entry.vm.vmId);
    if (!pready || !costop) continue;
    const widthBand = WIDTH_BANDS.findIndex(([low, high]) => entry.vcpu >= low && entry.vcpu <= high);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const a = entry.avg[slot];
      if (!Number.isFinite(a)) continue;
      const utilPct = (a / entry.capacity) * 100;
      const utilBand = UTIL_BANDS.findIndex(([low, high]) => utilPct >= low && utilPct < high);
      if (utilBand < 0 || widthBand < 0) continue;
      const key = `${utilBand}|${widthBand}`;
      const cell = cells.get(key) ?? { ready: [], costop: [] };
      if (Number.isFinite(pready[slot])) cell.ready.push(pready[slot]);
      if (Number.isFinite(costop[slot])) cell.costop.push(costop[slot]);
      cells.set(key, cell);
    }
  }
  const widthLabels = ["1–2 vCPU", "4 vCPU", "6–8 vCPU", "10–16 vCPU", "≥ 17 vCPU"];
  console.log("Peak-Ready p95 der Stundenwerte (%) — Zeilen Auslastungsband, Spalten vCPU-Breite:");
  table(["Auslastung", ...widthLabels], UTIL_BANDS.map(([low, high], utilBand) => [
    high > 1e8 ? "> 90 %" : `${low}–${high} %`,
    ...widthLabels.map((_, widthBand) => {
      const cell = cells.get(`${utilBand}|${widthBand}`);
      return cell?.ready.length ? fmt(quantile(sortedCopy(cell.ready), 0.95), 1) : "–";
    }),
  ]));
  console.log("\nPeak-Co-Stop p95 der Stundenwerte (%):");
  table(["Auslastung", ...widthLabels], UTIL_BANDS.map(([low, high], utilBand) => [
    high > 1e8 ? "> 90 %" : `${low}–${high} %`,
    ...widthLabels.map((_, widthBand) => {
      const cell = cells.get(`${utilBand}|${widthBand}`);
      return cell?.costop.length ? fmt(quantile(sortedCopy(cell.costop), 0.95), 1) : "–";
    }),
  ]));
  console.log("\nStundenzahl je Feld (Belastbarkeit der Felder oben):");
  table(["Auslastung", ...widthLabels], UTIL_BANDS.map(([low, high], utilBand) => [
    high > 1e8 ? "> 90 %" : `${low}–${high} %`,
    ...widthLabels.map((_, widthBand) => String(cells.get(`${utilBand}|${widthBand}`)?.ready.length ?? 0)),
  ]));
}

/* ------------------------------------------------------------------ */
/* 10  Co-Stop und Peak-Ready als Dauerbelastung statt Einzelausreißer  */
/* ------------------------------------------------------------------ */

section("10  Dauerhaftigkeit der Druck-Signale je VM");
{
  const rows: string[][] = [];
  const widths = [[1, 2], [4, 4], [6, 8], [10, 16], [17, 1e9]];
  const labels = ["1–2", "4", "6–8", "10–16", "≥ 17"];
  for (const [index, [low, high]] of widths.entries()) {
    const group = metrics.filter((entry) => entry.vcpu >= low && entry.vcpu <= high);
    const costopP95: number[] = [];
    const readyP95: number[] = [];
    let costopHeavy = 0;
    let readyHeavy = 0;
    for (const entry of group) {
      const costop = peakCostop.get(entry.vm.vmId);
      const pready = peakReady.get(entry.vm.vmId);
      const costopFinite = costop ? [...costop].filter((value) => Number.isFinite(value)) : [];
      const readyFinite = pready ? [...pready].filter((value) => Number.isFinite(value)) : [];
      if (costopFinite.length) {
        costopP95.push(quantile(sortedCopy(costopFinite), 0.95)!);
        if (costopFinite.filter((value) => value > 3).length >= 24) costopHeavy += 1;
      }
      if (readyFinite.length) {
        readyP95.push(quantile(sortedCopy(readyFinite), 0.95)!);
        if (readyFinite.filter((value) => value > 10).length >= 24) readyHeavy += 1;
      }
    }
    rows.push([
      labels[index], String(group.length),
      fmt(quantile(sortedCopy(costopP95), 0.5), 2), fmt(quantile(sortedCopy(costopP95), 0.9), 2),
      `${costopHeavy} (${pct(costopHeavy, group.length)})`,
      fmt(quantile(sortedCopy(readyP95), 0.5), 2), fmt(quantile(sortedCopy(readyP95), 0.9), 2),
      `${readyHeavy} (${pct(readyHeavy, group.length)})`,
    ]);
  }
  table(["vCPU", "VMs", "costop p95: p50", "p90", "≥ 24 h costop > 3 %", "peakReady p95: p50", "p90", "≥ 24 h ready > 10 %"], rows);
}

/* ------------------------------------------------------------------ */
/* 11  Rohverteilung der Disparity                                      */
/* ------------------------------------------------------------------ */

section("11  Rohverteilung vmCpuUsageDisparityAvgPct in lasthaltigen Stunden");
{
  const raw: number[] = [];
  const relative: number[] = [];
  for (const entry of metrics) {
    if (!entry.capacity || entry.vcpu <= 1) continue;
    const disp = disparity.get(entry.vm.vmId);
    if (!disp) continue;
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const a = entry.avg[slot];
      const d = disp[slot];
      if (!Number.isFinite(a) || !Number.isFinite(d)) continue;
      const meanCorePct = (a / entry.capacity) * 100;
      if (meanCorePct < CONCENTRATION_MIN_CORE_PCT) continue;
      raw.push(d);
      relative.push(d / meanCorePct);
    }
  }
  table(QUANTILE_HEADER, [
    quantileRow("Disparity roh (%)", raw, 2),
    quantileRow("Disparity / mittlere Kernlast", relative, 3),
  ]);
  console.log("\nJe vCPU-Breite (lasthaltige Stunden):");
  table(["vCPU", "Stunden", "Disparity p50", "p95", "Index p50", "Index p95"],
    [[1, 2], [4, 4], [6, 8], [10, 16], [17, 1e9]].map(([low, high]) => {
      const values: number[] = [];
      const indices: number[] = [];
      for (const entry of metrics) {
        if (!entry.capacity || entry.vcpu < low || entry.vcpu > high || entry.vcpu <= 1) continue;
        const disp = disparity.get(entry.vm.vmId);
        if (!disp) continue;
        for (let slot = 0; slot < SLOTS; slot += 1) {
          const a = entry.avg[slot];
          const d = disp[slot];
          if (!Number.isFinite(a) || !Number.isFinite(d)) continue;
          const meanCorePct = (a / entry.capacity) * 100;
          if (meanCorePct < CONCENTRATION_MIN_CORE_PCT) continue;
          values.push(d);
          indices.push((d / meanCorePct) / entry.vcpu);
        }
      }
      const q = quantiles(values, [0.5, 0.95]);
      const qi = quantiles(indices, [0.5, 0.95]);
      return [`${low}${high > 1e8 ? "+" : `–${high}`}`, String(values.length), fmt(q[0], 2), fmt(q[1], 2), fmt(qi[0], 3), fmt(qi[1], 3)];
    }));
}

/* ------------------------------------------------------------------ */
/* 12  Herleitung der CV-Schwelle aus einem unabhängigen Flachheitsmaß  */
/* ------------------------------------------------------------------ */

section("12  Welche CV-Schwelle trifft „wirklich flach“?");
{
  // Unabhängiges Kriterium, das ohne CV auskommt: die Reihe hat weder ein
  // ausgeprägtes Hoch (p95 nahe Median) noch verborgene Spitzen innerhalb der Stunde.
  const isFlat = (entry: VmMetrics): boolean => {
    if (entry.p50 <= 0) return false;
    const withinHour = entry.burstFactorP95 ?? 1;
    return entry.p95 / entry.p50 <= 1.5 && entry.peakOfAvg / entry.p50 <= 2.5 && withinHour <= 2;
  };
  const flatAll = metrics.filter(isFlat).length;
  console.log(`„wirklich flach“ (p95/p50 ≤ 1,5 UND max/p50 ≤ 2,5 UND Stunden-p95 max/avg ≤ 2): ${flatAll} VMs (${pct(flatAll, metrics.length)})`);
  console.log("\nAnteil wirklich flacher VMs je CV-Band – dort, wo er kippt, liegt die Schwelle:");
  table(["CV-Band", "VMs", "davon flach", "Anteil"],
    [[0, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, 0.25], [0.25, 0.3], [0.3, 0.35], [0.35, 0.4], [0.4, 0.5], [0.5, 0.7], [0.7, 99]].map(([low, high]) => {
      const group = metrics.filter((entry) => entry.cv !== null && entry.cv >= low && entry.cv < high);
      const flat = group.filter(isFlat).length;
      return [`${low}–${high === 99 ? "∞" : high}`, String(group.length), String(flat), pct(flat, group.length)];
    }));
  console.log("\nTrennschärfe je Schwellenwert (Sicht: „constant“ soll flach bedeuten):");
  table(["Schwelle", "als constant", "davon flach", "Präzision", "flache VMs erfasst", "Trefferquote"],
    [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5].map((threshold) => {
      const group = metrics.filter((entry) => entry.cv !== null && entry.cv <= threshold);
      const flat = group.filter(isFlat).length;
      return [String(threshold), String(group.length), String(flat), pct(flat, group.length), String(flat), pct(flat, flatAll)];
    }));
}

/* ------------------------------------------------------------------ */
/* 13  Bestandsaufteilung                                               */
/* ------------------------------------------------------------------ */

section("13  Bestandsaufteilung");
{
  const groupBy = (keyOf: (entry: VmMetrics) => string, title: string) => {
    const groups = new Map<string, VmMetrics[]>();
    for (const entry of metrics) {
      const key = keyOf(entry);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    console.log(`\n${title}:`);
    table(["Schlüssel", "VMs", "vCPU", "util p95 % p50", "CV p50", "costop p95 p50"],
      [...groups.entries()].sort((left, right) => right[1].length - left[1].length).slice(0, 12).map(([key, group]) => [
        key, String(group.length), String(group.reduce((sum, entry) => sum + entry.vcpu, 0)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct]))), 0.5), 1),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.cv === null ? [] : [entry.cv]))), 0.5)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.costopMaxV === null ? [] : [entry.costopMaxV]))), 0.5), 2),
      ]));
  };
  groupBy((entry) => entry.vm.vcenter, "Je vCenter");
  groupBy((entry) => entry.vm.resourcePool, "Je Ressourcenpool");
  const confidence = new Map<string, number>();
  for (const entry of metrics) confidence.set(entry.vm.confidence, (confidence.get(entry.vm.confidence) ?? 0) + 1);
  console.log(`\nConfidence: ${[...confidence.entries()].map(([key, count]) => `${key}=${count}`).join(", ")}`);
  const odd = metrics.filter((entry) => entry.vcpu % 2 === 1);
  console.log(`Ungerade vCPU-Anzahl: ${odd.length} VMs (${[...new Set(odd.map((entry) => entry.vcpu))].sort((a, b) => a - b).join(", ")})`);
}

/* ------------------------------------------------------------------ */
/* 14  Vergrößerung: was treibt sie, und ist sie durch Druck gedeckt?   */
/* ------------------------------------------------------------------ */

section("14  Vergrößerungskandidaten — Deckung durch unabhängige Drucksignale");
{
  const ceilEven = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);
  const rows: string[][] = [];
  const pressure = (entry: VmMetrics): boolean => {
    const pready = peakReady.get(entry.vm.vmId);
    const costop = peakCostop.get(entry.vm.vmId);
    const readyHeavy = pready ? [...pready].filter((value) => Number.isFinite(value) && value > 10).length >= 24 : false;
    const costopHeavy = costop ? [...costop].filter((value) => Number.isFinite(value) && value > 3).length >= 24 : false;
    return readyHeavy || costopHeavy;
  };
  const variants: { label: string; size: (entry: VmMetrics) => number | null }[] = [
    { label: "nur p95/0,65", size: (entry) => (entry.capacity ? ceilEven(entry.p95 / (entry.capacity / entry.vcpu) / 0.65) : null) },
    { label: "nur max(Stundenmittel)/0,9", size: (entry) => (entry.capacity ? ceilEven(entry.peakOfAvg / (entry.capacity / entry.vcpu) / 0.9) : null) },
    { label: "nur max(demandMax)/0,9", size: (entry) => (entry.capacity ? ceilEven(entry.peakOfMax / (entry.capacity / entry.vcpu) / 0.9) : null) },
    { label: "nur p95(demandMax)/0,9", size: (entry) => {
      if (!entry.capacity || !entry.max) return null;
      const finite = [...entry.max].filter((value) => Number.isFinite(value));
      return finite.length ? ceilEven(quantile(sortedCopy(finite), 0.95)! / (entry.capacity / entry.vcpu) / 0.9) : null;
    } },
  ];
  for (const variant of variants) {
    const grow = metrics.filter((entry) => {
      const size = variant.size(entry);
      return size !== null && size > entry.vcpu;
    });
    const withPressure = grow.filter(pressure);
    rows.push([
      variant.label, String(grow.length), pct(grow.length, metrics.length),
      String(grow.reduce((sum, entry) => sum + (variant.size(entry)! - entry.vcpu), 0)),
      `${withPressure.length} (${pct(withPressure.length, grow.length)})`,
    ]);
  }
  table(["Auslöser", "VMs größer", "Anteil", "vCPU nötig", "davon mit Dauerdruck"], rows);
  const anyPressure = metrics.filter(pressure);
  console.log(`\nVMs mit Dauerdruck (≥ 24 h peakReady > 10 % ODER ≥ 24 h costop > 3 %): ${anyPressure.length} (${pct(anyPressure.length, metrics.length)})`);
  const pressureAndLoad = anyPressure.filter((entry) => (entry.utilP95Pct ?? 0) > 40);
  console.log(`davon zugleich p95-Auslastung > 40 %: ${pressureAndLoad.length}`);
  console.log("Die zehn stärksten:");
  table(["vmId", "vCPU", "shape", "util p95 %", "peakReady p95", "costop p95", "eff. Kerne max"],
    pressureAndLoad.sort((left, right) => (right.utilP95Pct ?? 0) - (left.utilP95Pct ?? 0)).slice(0, 10).map((entry) => {
      const costop = peakCostop.get(entry.vm.vmId);
      const costopFinite = costop ? [...costop].filter((value) => Number.isFinite(value)) : [];
      return [entry.vm.vmId, String(entry.vcpu), entry.vm.shape, fmt(entry.utilP95Pct, 1), fmt(entry.peakReadyP95, 2),
        fmt(quantile(sortedCopy(costopFinite), 0.95), 2), fmt(entry.effectiveCoresMax, 2)];
    }));
}

/* ------------------------------------------------------------------ */
/* 15  Co-Stop unter Last und hohe Konzentration als eigene Kriterien   */
/* ------------------------------------------------------------------ */

section("15  Zwei eigenständige Verkleinerungs-Argumente");
{
  const LOAD_MIN_PCT = 25;
  const loadedCostop = new Map<string, number>();
  for (const entry of metrics) {
    if (!entry.capacity) continue;
    const costop = peakCostop.get(entry.vm.vmId);
    if (!costop) continue;
    const values: number[] = [];
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const a = entry.avg[slot];
      if (!Number.isFinite(a) || !Number.isFinite(costop[slot])) continue;
      if ((a / entry.capacity) * 100 >= LOAD_MIN_PCT) values.push(costop[slot]);
    }
    if (values.length >= 12) loadedCostop.set(entry.vm.vmId, quantile(sortedCopy(values), 0.95)!);
  }
  console.log(`VMs mit ≥ 12 Stunden über ${LOAD_MIN_PCT} % Kapazität: ${loadedCostop.size}`);
  table(["vCPU", "VMs", "costop p95 unter Last: p50", "p90", "> 5 %", "> 10 %"],
    [[1, 2], [4, 4], [6, 8], [10, 16], [17, 1e9]].map(([low, high]) => {
      const group = metrics.filter((entry) => entry.vcpu >= low && entry.vcpu <= high && loadedCostop.has(entry.vm.vmId));
      const values = group.map((entry) => loadedCostop.get(entry.vm.vmId)!);
      const above5 = values.filter((value) => value > 5).length;
      const above10 = values.filter((value) => value > 10).length;
      return [`${low}${high > 1e8 ? "+" : `–${high}`}`, String(group.length),
        fmt(quantile(sortedCopy(values), 0.5), 2), fmt(quantile(sortedCopy(values), 0.9), 2),
        `${above5} (${pct(above5, group.length)})`, `${above10} (${pct(above10, group.length)})`];
    }));

  console.log("\nHoch konzentrierte VMs (Konzentrationsindex p90 über Schwelle):");
  table(["Schwelle", "VMs", "vCPU gesamt", "eff. Kerne max p50", "vCPU − eff. Kerne p50", "util p95 % p50"],
    [0.3, 0.4, 0.5, 0.6].map((threshold) => {
      const group = metrics.filter((entry) => (entry.concentrationP90 ?? 0) >= threshold);
      return [String(threshold), String(group.length), String(group.reduce((sum, entry) => sum + entry.vcpu, 0)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.effectiveCoresMax === null ? [] : [entry.effectiveCoresMax]))), 0.5)),
        fmt(quantile(sortedCopy(group.map((entry) => entry.vcpu - (entry.effectiveCoresMax ?? entry.vcpu))), 0.5)),
        fmt(quantile(sortedCopy(group.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct]))), 0.5), 1)];
    }));
}

/* ------------------------------------------------------------------ */
/* 16  Perzentilwahl im Peak-Pfad und Gesamtwirkung der Zielregel       */
/* ------------------------------------------------------------------ */

section("16  Peak-Pfad: welches Perzentil von demandMax?");
{
  const ceilEven = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);
  const maxQuantile = new Map<string, Map<number, number>>();
  for (const entry of metrics) {
    if (!entry.max) continue;
    const finite = sortedCopy([...entry.max].filter((value) => Number.isFinite(value)));
    if (!finite.length) continue;
    const byFraction = new Map<number, number>();
    for (const fraction of [0.95, 0.99, 0.995, 1]) byFraction.set(fraction, quantile(finite, fraction)!);
    maxQuantile.set(entry.vm.vmId, byFraction);
  }
  table(["Peak-Perzentil", "VMs kleiner", "vCPU frei", "VMs größer", "vCPU nötig", "Median Zielgröße"],
    [0.95, 0.99, 0.995, 1].map((fraction) => {
      let down = 0; let up = 0; let reclaim = 0; let add = 0;
      const sizes: number[] = [];
      for (const entry of metrics) {
        const peak = maxQuantile.get(entry.vm.vmId)?.get(fraction);
        if (!entry.capacity || peak === undefined) continue;
        const perCore = entry.capacity / entry.vcpu;
        const size = ceilEven(Math.max(entry.p95 / perCore / 0.65, peak / perCore / 0.9, 2));
        sizes.push(size);
        if (size < entry.vcpu) { down += 1; reclaim += entry.vcpu - size; }
        if (size > entry.vcpu) { up += 1; add += size - entry.vcpu; }
      }
      return [fraction === 1 ? "Maximum" : `p${fraction * 100}`, String(down), String(reclaim), String(up), String(add), fmt(quantile(sortedCopy(sizes), 0.5), 0)];
    }));

  section("17  Zielregel im Vergleich zum Ist-Stand");
  const target = (entry: VmMetrics): { size: number; reason: string } | null => {
    const peak = maxQuantile.get(entry.vm.vmId)?.get(0.99);
    const perCore = entry.capacity ? entry.capacity / entry.vcpu : entry.vm.mhzPerCore;
    if (!perCore || peak === undefined) return null;
    const size = ceilEven(Math.max(entry.p95 / perCore / 0.65, peak / perCore / 0.9, 2));
    // Verkleinerung nur bei belastbarem Muster; bursty braucht zusätzlich einen
    // wiederholbaren Wochenverlauf, irregular bleibt ausgeschlossen.
    const shape = entry.vm.shape;
    const repeatable = (entry.weekCorrMedian ?? -1) >= 0.5 && (entry.weeklyMaxCv ?? 9) <= 0.4;
    if (size < entry.vcpu) {
      if (entry.vm.confidence !== "high") return { size: entry.vcpu, reason: "low-confidence" };
      if (shape === "irregular" || shape === "unclassified") return { size: entry.vcpu, reason: "unreliable-shape" };
      if (shape === "bursty" && !repeatable) return { size: entry.vcpu, reason: "burst-not-repeatable" };
    }
    // Vergrößerung nur bei anhaltender Nähe zur Kapazität, nicht bei einer einzelnen Spitze.
    if (size > entry.vcpu && entry.hoursAbove75 < 24) return { size: entry.vcpu, reason: "peak-only" };
    return { size, reason: "applied" };
  };
  const reasons = new Map<string, number>();
  let down = 0; let up = 0; let reclaim = 0; let add = 0;
  // Zusätzlich die Schrittweiten-Begrenzung des Service: höchstens ein Viertel der
  // konfigurierten vCPU je Runde, mindestens aber ein Paar. Das ist der Wert, den die
  // Oberfläche als „Rückgewinnbar“ ausweist.
  let steppedReclaim = 0;
  let steppedDown = 0;
  for (const entry of metrics) {
    const result = target(entry);
    if (!result) continue;
    reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
    if (result.size < entry.vcpu) {
      down += 1;
      reclaim += entry.vcpu - result.size;
      const step = Math.max(0, Math.floor(Math.min(entry.vcpu - result.size, Math.max(entry.vcpu * 0.25, 2)) / 2) * 2);
      if (step > 0) { steppedDown += 1; steppedReclaim += step; }
    }
    if (result.size > entry.vcpu) { up += 1; add += result.size - entry.vcpu; }
  }
  const istReclaim = metrics.reduce((sum, entry) => sum + (entry.vm.appReclaim ?? 0), 0);
  const istDown = metrics.filter((entry) => (entry.vm.appReclaim ?? 0) > 0).length;
  const istDemandBased = metrics.reduce((sum, entry) => sum + Math.max(0, entry.vcpu - (entry.vm.appDemandBased ?? entry.vcpu)), 0);
  table(["", "VMs kleiner", "vCPU frei", "VMs größer", "vCPU nötig"], [
    ["Ist: bedarfsgerechte Größe", String(metrics.filter((entry) => (entry.vm.appDemandBased ?? entry.vcpu) < entry.vcpu).length), String(istDemandBased), "0 (strukturell)", "0"],
    ["Ist: nach 25-%-Schrittgrenze", String(istDown), String(istReclaim), "0", "0"],
    ["Neu: bedarfsgerechte Größe", String(down), String(reclaim), String(up), String(add)],
    ["Neu: nach 25-%-Schrittgrenze", String(steppedDown), String(steppedReclaim), String(up), String(add)],
  ]);
  console.log(`Gründe: ${[...reasons.entries()].sort((left, right) => right[1] - left[1]).map(([key, count]) => `${key}=${count}`).join(", ")}`);
}

/* ------------------------------------------------------------------ */
/* 18  Umverteilung der Lastmuster bei geänderter CV-Schwelle           */
/* ------------------------------------------------------------------ */

section("18  Musterverteilung bei verschiedenen constantLoadCvMax (Produktions-Klassifikator)");
{
  const hourGrid = buildHourGrid({
    timezone: meta.timeSeries.timezone,
    expectedSlots: SLOTS,
    rangeStartUtc: meta.timeSeries.rangeStartUtc,
  } as VropsTimeSeriesImport);
  const demandMaps = new Map<string, Map<number, number>>();
  for (const entry of metrics) {
    const map = new Map<number, number>();
    for (let slot = 0; slot < SLOTS; slot += 1) {
      if (Number.isFinite(entry.avg[slot])) map.set(hourGrid[slot].timestampUtc, entry.avg[slot]);
    }
    demandMaps.set(entry.vm.vmId, map);
  }
  const thresholds = [0.5, 0.4, 0.3, 0.25, 0.2, 0.15];
  const counts = new Map<number, Map<string, number>>();
  for (const threshold of thresholds) {
    const byShape = new Map<string, number>();
    for (const entry of metrics) {
      const { shape } = classifyVmBehavior(hourGrid, demandMaps.get(entry.vm.vmId)!, {
        configuredCpuCapacityMHz: entry.capacity,
        thresholds: { constantLoadCvMax: threshold },
      });
      byShape.set(shape, (byShape.get(shape) ?? 0) + 1);
    }
    counts.set(threshold, byShape);
  }
  table(["shape", ...thresholds.map((threshold) => `cv≤${threshold}`)],
    SHAPES.map((shape) => [shape, ...thresholds.map((threshold) => String(counts.get(threshold)!.get(shape) ?? 0))]));
}

/* ------------------------------------------------------------------ */
/* 19  Was kostet die 25-%-Schrittgrenze?                               */
/* ------------------------------------------------------------------ */

section("19  Wirkung der Schrittweiten-Begrenzung MAX_RECLAIM_RATIO = 0,25");
{
  const ceilEven = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);
  const floorEven = (value: number) => Math.max(0, Math.floor(value / 2) * 2);
  const maxQuantile = new Map<string, number>();
  for (const entry of metrics) {
    if (!entry.max) continue;
    const finite = sortedCopy([...entry.max].filter((value) => Number.isFinite(value)));
    if (finite.length) maxQuantile.set(entry.vm.vmId, quantile(finite, 0.99)!);
  }
  /** Zielgröße nach der neuen Regel, ohne jede Schrittbegrenzung. */
  const targetSize = (entry: VmMetrics): number | null => {
    const peak = maxQuantile.get(entry.vm.vmId);
    const perCore = entry.capacity ? entry.capacity / entry.vcpu : entry.vm.mhzPerCore;
    if (!perCore || peak === undefined) return null;
    return ceilEven(Math.max(entry.p95 / perCore / 0.65, peak / perCore / 0.9, 2));
  };

  let cappedVms = 0;
  let hiddenVcpu = 0;
  let firstStepVcpu = 0;
  let fullVcpu = 0;
  const gaps: number[] = [];
  const roundCounts: number[] = [];
  const byVcpu = new Map<number, { vms: number; full: number; first: number; rounds: number[] }>();

  for (const entry of metrics) {
    const target = targetSize(entry);
    if (target === null || target >= entry.vcpu) continue;
    const full = entry.vcpu - target;
    const first = floorEven(Math.min(full, Math.max(entry.vcpu * 0.25, 2)));
    fullVcpu += full;
    firstStepVcpu += first;
    if (first < full) {
      cappedVms += 1;
      hiddenVcpu += full - first;
      gaps.push(full - first);
    }
    // Wie viele Runden – also Wartungsfenster – bis zur Zielgröße?
    let current = entry.vcpu;
    let rounds = 0;
    while (current > target && rounds < 50) {
      const step = floorEven(Math.min(current - target, Math.max(current * 0.25, 2)));
      if (step <= 0) break;
      current -= step;
      rounds += 1;
    }
    roundCounts.push(rounds);
    const bucket = byVcpu.get(entry.vcpu) ?? { vms: 0, full: 0, first: 0, rounds: [] };
    bucket.vms += 1;
    bucket.full += full;
    bucket.first += first;
    bucket.rounds.push(rounds);
    byVcpu.set(entry.vcpu, bucket);
  }

  console.log(`VMs mit Verkleinerungspotenzial: ${roundCounts.length}`);
  console.log(`bedarfsgerecht insgesamt: ${fullVcpu} vCPU | im ersten Schritt sichtbar: ${firstStepVcpu} vCPU (${pct(firstStepVcpu, fullVcpu)})`);
  console.log(`von der Schrittgrenze verdeckt: ${hiddenVcpu} vCPU bei ${cappedVms} VMs (${pct(cappedVms, roundCounts.length)} der Kandidaten)`);
  table(QUANTILE_HEADER, [
    quantileRow("verdeckte vCPU je gedeckelter VM", gaps, 0),
    quantileRow("Runden bis zur Zielgröße", roundCounts, 0),
  ]);

  console.log("\nJe konfigurierter Größe – „erster Schritt“ ist der heute angezeigte Wert:");
  table(["vCPU", "VMs", "bedarfsgerecht frei", "erster Schritt", "Anteil sichtbar", "Runden p50", "Runden max"],
    [...byVcpu.entries()].sort((left, right) => left[0] - right[0]).filter(([, bucket]) => bucket.vms >= 5).map(([vcpu, bucket]) => [
      String(vcpu), String(bucket.vms), String(bucket.full), String(bucket.first), pct(bucket.first, bucket.full),
      fmt(quantile(sortedCopy(bucket.rounds), 0.5), 0), String(Math.max(...bucket.rounds)),
    ]));

  const multiRound = roundCounts.filter((value) => value > 1).length;
  console.log(`\nVMs, die mehr als ein Wartungsfenster bräuchten: ${multiRound} (${pct(multiRound, roundCounts.length)})`);
  console.log(`Summe aller nötigen Wartungsfenster: ${roundCounts.reduce((sum, value) => sum + value, 0)} statt ${roundCounts.length} ohne Schrittgrenze`);
}

/* ------------------------------------------------------------------ */
/* 20  Wie stark wirken die Zielauslastungen? Kalibrierung eines Reglers */
/* ------------------------------------------------------------------ */

section("20  Empfindlichkeit gegenüber den Zielauslastungen");
{
  const ceilEven = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);
  const peakP99 = new Map<string, number>();
  for (const entry of metrics) {
    if (!entry.max) continue;
    const finite = sortedCopy([...entry.max].filter((value) => Number.isFinite(value)));
    if (finite.length) peakP99.set(entry.vm.vmId, quantile(finite, 0.99)!);
  }
  const evaluate = (targetP95: number, targetPeak: number) => {
    let down = 0; let reclaim = 0; let up = 0; let add = 0;
    for (const entry of metrics) {
      const peak = peakP99.get(entry.vm.vmId);
      const perCore = entry.capacity ? entry.capacity / entry.vcpu : entry.vm.mhzPerCore;
      if (!perCore || peak === undefined) continue;
      const size = ceilEven(Math.max(entry.p95 / perCore / targetP95, peak / perCore / targetPeak, 2));
      if (size < entry.vcpu) { down += 1; reclaim += entry.vcpu - size; }
      if (size > entry.vcpu) { up += 1; add += size - entry.vcpu; }
    }
    return { down, reclaim, up, add };
  };

  console.log("Rückgewinnbare vCPU (VMs kleiner) je Kombination — Zeilen P95-Ziel, Spalten Spitzen-Ziel:");
  const peakTargets = [0.8, 0.85, 0.9, 0.95, 1.0];
  table(["P95-Ziel", ...peakTargets.map((value) => `Spitze ${(value * 100).toFixed(0)} %`)],
    [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8].map((targetP95) => [
      `${(targetP95 * 100).toFixed(0)} %`,
      ...peakTargets.map((targetPeak) => {
        const result = evaluate(targetP95, targetPeak);
        return `${result.reclaim} (${result.down})`;
      }),
    ]));

  console.log("\nGegenrichtung — zusätzlich nötige vCPU (VMs größer), vor dem Dauerlast-Gate:");
  table(["P95-Ziel", ...peakTargets.map((value) => `Spitze ${(value * 100).toFixed(0)} %`)],
    [0.5, 0.65, 0.8].map((targetP95) => [
      `${(targetP95 * 100).toFixed(0)} %`,
      ...peakTargets.map((targetPeak) => {
        const result = evaluate(targetP95, targetPeak);
        return `${result.add} (${result.up})`;
      }),
    ]));

  // Der Peak-Pfad bewegt weit mehr als die Zielauslastungen, weil die Mehrzahl der VMs
  // ohnehin an der Untergrenze von zwei vCPU landet. Deshalb hier als eigene Achse.
  console.log("\nPeak-Perzentil als eigentliche Stellschraube (Zielauslastungen 65 % / 90 %):");
  const peakQuantiles = new Map<number, Map<string, number>>();
  for (const fraction of [0.9, 0.95, 0.99, 0.995, 1]) {
    const byVm = new Map<string, number>();
    for (const entry of metrics) {
      if (!entry.max) continue;
      const finite = sortedCopy([...entry.max].filter((value) => Number.isFinite(value)));
      if (finite.length) byVm.set(entry.vm.vmId, quantile(finite, fraction)!);
    }
    peakQuantiles.set(fraction, byVm);
  }
  const withPeak = (fraction: number, targetP95: number, targetPeak: number) => {
    let down = 0; let reclaim = 0; let up = 0; let add = 0;
    for (const entry of metrics) {
      const peak = peakQuantiles.get(fraction)!.get(entry.vm.vmId);
      const perCore = entry.capacity ? entry.capacity / entry.vcpu : entry.vm.mhzPerCore;
      if (!perCore || peak === undefined) continue;
      const size = ceilEven(Math.max(entry.p95 / perCore / targetP95, peak / perCore / targetPeak, 2));
      if (size < entry.vcpu) { down += 1; reclaim += entry.vcpu - size; }
      // Vergrößerung erst nach dem Dauerlast-Gate: eine einzelne Spitze genügt nicht.
      if (size > entry.vcpu && entry.hoursAbove75 >= 24) { up += 1; add += size - entry.vcpu; }
    }
    return { down, reclaim, up, add };
  };
  table(["Peak-Perzentil", "VMs kleiner", "vCPU frei", "VMs größer", "vCPU nötig"],
    [0.9, 0.95, 0.99, 0.995, 1].map((fraction) => {
      const result = withPeak(fraction, 0.65, 0.9);
      return [fraction === 1 ? "Maximum" : `p${fraction * 100}`, String(result.down), String(result.reclaim), String(result.up), String(result.add)];
    }));

  console.log("\nVorschlag für vier Stufen, jeweils als geschlossene Kombination:");
  table(["Stufe", "Peak", "P95-Ziel", "Spitzen-Ziel", "VMs kleiner", "vCPU frei", "VMs größer", "vCPU nötig"],
    ([
      ["Sehr vorsichtig", 1, 0.55, 0.8],
      ["Vorsichtig", 0.995, 0.6, 0.85],
      ["Ausgewogen", 0.99, 0.65, 0.9],
      ["Offensiv", 0.95, 0.7, 0.95],
    ] as const).map(([label, fraction, targetP95, targetPeak]) => {
      const result = withPeak(fraction, targetP95, targetPeak);
      return [label, fraction === 1 ? "Max" : `p${fraction * 100}`, `${targetP95 * 100} %`, `${targetPeak * 100} %`,
        String(result.down), String(result.reclaim), String(result.up), String(result.add)];
    }));

  console.log("\nWirkung der Rückhalte-Gründe – wie viele VMs und vCPU hängen an jedem Gate?");
  const blocked = (predicate: (entry: VmMetrics) => boolean) => {
    const group = metrics.filter((entry) => {
      const peak = peakP99.get(entry.vm.vmId);
      const perCore = entry.capacity ? entry.capacity / entry.vcpu : entry.vm.mhzPerCore;
      if (!perCore || peak === undefined) return false;
      const size = ceilEven(Math.max(entry.p95 / perCore / 0.65, peak / perCore / 0.9, 2));
      return size < entry.vcpu && predicate(entry);
    });
    return `${group.length} VMs / ${group.reduce((sum, entry) => sum + entry.vcpu, 0)} vCPU`;
  };
  table(["Gate", "betrifft"], [
    ["Vertrauen unter „hoch“", blocked((entry) => entry.vm.confidence !== "high")],
    ["Muster irregular/unclassified", blocked((entry) => ["irregular", "unclassified"].includes(entry.vm.shape))],
    ["bursty ohne Wochenwiederholung", blocked((entry) => entry.vm.shape === "bursty" && !((entry.weekCorrMedian ?? -1) >= 0.5 && (entry.weeklyMaxCv ?? 9) <= 0.4))],
  ]);
}

/* ------------------------------------------------------------------ */
/* 21  Einzelkern-Engpass: hilft ein schnellerer Takt statt mehr Kerne? */
/* ------------------------------------------------------------------ */

section("21  Einzelkern-Engpass — Kandidaten für einen höheren Takt statt mehr vCPU");
{
  // Der heißeste Kern ergibt sich aus mittlerer Kernlast und Abstand zwischen höchster
  // und niedrigster vCPU. Läuft er am Anschlag, während die VM insgesamt Luft hat,
  // bringen zusätzliche vCPU nichts – dann hilft nur ein Kern, der schneller ist.
  const SATURATED_CORE_PCT = 90;
  const HEADROOM_MAX_PCT = 60;
  interface CoreBound {
    vmId: string;
    vcpu: number;
    mhzPerVcpu: number;
    saturatedHours: number;
    boundHours: number;
    utilizationAtBound: number[];
    overEstimateHours: number;
  }
  const bound: CoreBound[] = [];
  let totalHours = 0;
  let overEstimate = 0;
  for (const entry of metrics) {
    if (!entry.capacity || entry.vcpu <= 1) continue;
    const disp = disparity.get(entry.vm.vmId);
    if (!disp) continue;
    let saturatedHours = 0;
    let boundHours = 0;
    let vmOverEstimate = 0;
    const utilizationAtBound: number[] = [];
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const demand = entry.avg[slot];
      const disparityPct = disp[slot];
      if (!Number.isFinite(demand) || !Number.isFinite(disparityPct)) continue;
      const utilizationPct = (demand / entry.capacity) * 100;
      if (utilizationPct < 1) continue;
      totalHours += 1;
      const rawHighestCore = utilizationPct + (disparityPct * (entry.vcpu - 1)) / entry.vcpu;
      if (rawHighestCore > 105) { vmOverEstimate += 1; overEstimate += 1; }
      const highestCorePct = Math.min(100, rawHighestCore);
      if (highestCorePct < SATURATED_CORE_PCT) continue;
      saturatedHours += 1;
      // Der Engpass zählt nur, wenn die VM als Ganzes noch Luft hat – sonst ist sie
      // schlicht ausgelastet und braucht mehr Kerne, nicht schnellere.
      if (utilizationPct <= HEADROOM_MAX_PCT) {
        boundHours += 1;
        utilizationAtBound.push(utilizationPct);
      }
    }
    if (saturatedHours > 0) {
      bound.push({
        vmId: entry.vm.vmId, vcpu: entry.vcpu,
        mhzPerVcpu: entry.capacity / entry.vcpu,
        saturatedHours, boundHours, utilizationAtBound, overEstimate: 0 as never, overEstimateHours: vmOverEstimate,
      } as CoreBound);
    }
  }
  console.log(`Modellprüfung: in ${pct(overEstimate, totalHours)} der lasthaltigen Stunden übersteigt die geschätzte höchste Kernlast 105 % – dort ist die Schätzung zu grob.`);
  console.log(`VMs mit mindestens einer Stunde gesättigtem Einzelkern: ${bound.length} von ${metrics.length}`);

  for (const minHours of [1, 24, 72, 168]) {
    const group = bound.filter((entry) => entry.boundHours >= minHours);
    console.log(`  davon einzelkern-begrenzt (Kern ≥ ${SATURATED_CORE_PCT} %, VM ≤ ${HEADROOM_MAX_PCT} %) in ≥ ${minHours} Stunden: ${group.length}`);
  }

  const candidates = bound.filter((entry) => entry.boundHours >= 24);
  if (candidates.length) {
    // Erreichbar ist nur, was in Clustern mit vergleichbaren Workloads tatsaechlich steht.
    const clockCounts = new Map();
    for (const item of metrics) {
      if (!item.capacity) continue;
      const clock = Math.round(item.capacity / item.vcpu / 10) * 10;
      clockCounts.set(clock, (clockCounts.get(clock) ?? 0) + 1);
    }
    const reachable = [...clockCounts.entries()].filter(([, count]) => count >= 50).map(([clock]) => clock).sort((left, right) => right - left);
    const fastest = reachable[0];
    console.log(`\nTaktklassen mit mindestens 50 vermessenen VMs: ${reachable.join(", ")} MHz je vCPU.`);
    console.log(`Als Ziel angesetzt: ${fastest} MHz. Schnellere Hosts im Bestand stehen fast ausschließlich in VDI-Clustern ohne Server-Workload.`);
    const byClock = new Map<number, number>();
    for (const entry of candidates) {
      const clock = Math.round(entry.mhzPerVcpu / 10) * 10;
      byClock.set(clock, (byClock.get(clock) ?? 0) + 1);
    }
    console.log("\nAusgangstakt der einzelkern-begrenzten VMs:");
    table(["MHz/vCPU", "VMs", "Gewinn bis " + fastest],
      [...byClock.entries()].sort((left, right) => right[0] - left[0]).map(([clock, count]) => [
        String(clock), String(count), clock >= fastest ? "—" : `+${(((fastest / clock) - 1) * 100).toFixed(0)} %`,
      ]));
    table(["vmId", "vCPU", "MHz/vCPU", "Std. Kern voll", "davon mit Luft", "Auslastung dabei p50", "Gewinn durch schnellsten Takt"],
      candidates
        .sort((left, right) => right.boundHours - left.boundHours)
        .slice(0, 25)
        .map((entry) => [
          entry.vmId, String(entry.vcpu), fmt(entry.mhzPerVcpu, 0),
          String(entry.saturatedHours), String(entry.boundHours),
          fmt(quantile(sortedCopy(entry.utilizationAtBound), 0.5), 1),
          entry.mhzPerVcpu >= fastest ? "—" : `+${(((fastest / entry.mhzPerVcpu) - 1) * 100).toFixed(0)} %`,
        ]));
    const gains = candidates.map((entry) => Math.max(1, fastest / entry.mhzPerVcpu));
    table(QUANTILE_HEADER, [quantileRow("möglicher Taktgewinn (Faktor)", gains, 3)]);
    const alreadyFastest = candidates.filter((entry) => Math.round(entry.mhzPerVcpu) >= fastest - 10).length;
    console.log(`bereits auf der schnellsten erreichbaren Klasse und damit ohne Hebel: ${alreadyFastest} von ${candidates.length}`);

    // Für eine einzelkern-begrenzte VM ist jede Vergrößerung wirkungslos – die
    // vorhandenen Kerne liegen ja bereits brach. Die Überschneidung mit den
    // Vergrößerungskandidaten zeigt, ob die Empfehlungslogik das schon berücksichtigt.
    const candidateIds = new Set(candidates.map((entry) => entry.vmId));
    const boundMetrics = metrics.filter((entry) => candidateIds.has(entry.vm.vmId));
    const alsoGrowing = boundMetrics.filter((entry) => entry.hoursAbove75 >= 24);
    console.log(`\ndavon zugleich dauerhaft nahe der Kapazität (und damit Vergrößerungskandidat): ${alsoGrowing.length}`);
    console.log(`Überdimensionierung dieser Gruppe: ${boundMetrics.reduce((sum, entry) => sum + entry.vcpu, 0)} konfigurierte vCPU bei einem einzigen tatsächlich belasteten Kern.`);
    table(QUANTILE_HEADER, [
      quantileRow("konfigurierte vCPU", boundMetrics.map((entry) => entry.vcpu), 0),
      quantileRow("Auslastung p95 (% Kapazität)", boundMetrics.flatMap((entry) => (entry.utilP95Pct === null ? [] : [entry.utilP95Pct])), 1),
    ]);
  }

  const exported = vms.filter((vm) => vm.appSingleCoreBoundHours !== null);
  if (exported.length > 0) {
    const computedByVm = new Map(bound.map((entry) => [entry.vmId, entry.boundHours]));
    const deviations = exported.map((vm) => Math.abs((computedByVm.get(vm.vmId) ?? 0) - vm.appSingleCoreBoundHours!));
    const flagMismatches = exported.filter((vm) => vm.appSingleCoreBound !== ((computedByVm.get(vm.vmId) ?? 0) >= 24));
    console.log(`\nGegenprobe Exportfeld singleCoreBoundHours: ${exported.length} VMs, maximale Abweichung ${Math.max(...deviations)} Stunden, Flag-Abweichungen ${flagMismatches.length}.`);
  }
}
