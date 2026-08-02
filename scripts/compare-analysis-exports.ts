/**
 * Vergleicht zwei Analyse-Exporte VM für VM.
 *
 * Ausführen mit:
 *   npx vite-node --options.transformMode.ssr='.*' scripts/compare-analysis-exports.ts <alt> <neu>
 *
 * Die Pseudonyme sind über Exportläufe hinweg stabil, sodass dieselbe VM ihr Kürzel
 * behält. Stammen beide Exporte aus derselben `importId`, ist der Vergleich ein reiner
 * Logikvergleich: gleiche Messdaten, andere Auswertung.
 *
 * Zusätzlich rechnet das Skript die neuen Kennzahlen unabhängig aus den Rohreihen nach.
 * Eine Kennzahl, die nur von der App gegen sich selbst geprüft wird, ist nicht geprüft.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeAnalysisSeries, type SeriesEncoding } from "@/lib/export/analysisSeriesCodec";

const [oldRoot, newRoot] = process.argv.slice(2).length >= 2
  ? process.argv.slice(2, 4)
  : [
    "c:/Users/asi/Documents/GitHub/rvtools-analyzer/rvtools-analyse_2026-08-01",
    "c:/Users/asi/Documents/GitHub/rvtools-analyzer/rvtools-analyse_2026-08-01 (1)",
  ];
for (const root of [oldRoot, newRoot]) {
  if (!existsSync(`${root}/vms.csv`)) throw new Error(`Kein Export unter ${root}`);
}

/* ------------------------------------------------------------------ */
/*  Hilfsfunktionen                                                    */
/* ------------------------------------------------------------------ */

function quantile(sorted: readonly number[], fraction: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}
function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}
function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "–" : value.toFixed(digits);
}
function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)} %` : "–";
}
function section(title: string): void {
  console.log(`\n${"=".repeat(80)}\n${title}\n${"=".repeat(80)}`);
}
function table(header: readonly string[], rows: readonly (readonly string[])[]): void {
  if (!rows.length) { console.log("(keine Zeilen)"); return; }
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => (row[index] ?? "").length)));
  const line = (cells: readonly string[]) =>
    cells.map((cell, index) => (index === 0 ? (cell ?? "").padEnd(widths[index]) : (cell ?? "").padStart(widths[index]))).join("  ");
  console.log(line(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
}

/* ------------------------------------------------------------------ */
/*  Einlesen                                                           */
/* ------------------------------------------------------------------ */

type Row = Record<string, string>;

/** Liest eine Exportdatei und entfernt eine führende Byte-Order-Mark. */
function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readVms(root: string): Map<string, Row> {
  const text = readText(`${root}/vms.csv`);
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  const header = lines[0].split(";");
  const result = new Map<string, Row>();
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    if (cells[header.indexOf("hasSeries")] !== "1") continue;
    const row: Row = {};
    header.forEach((name, index) => { row[name] = cells[index] ?? ""; });
    result.set(row.vmId, row);
  }
  return result;
}

const num = (row: Row | undefined, name: string): number | null => {
  const raw = row?.[name];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const oldVms = readVms(oldRoot);
const newVms = readVms(newRoot);
const oldMeta = JSON.parse(readFileSync(`${oldRoot}/meta.json`, "utf8"));
const newMeta = JSON.parse(readFileSync(`${newRoot}/meta.json`, "utf8"));
const exportedLevel = (meta: { rightsizing?: { level?: string } }, vms: Map<string, Row>) =>
  meta.rightsizing?.level ?? [...vms.values()].find((row) => row.rightsizingLevel)?.rightsizingLevel ?? "(nicht exportiert)";

console.log(`alt: ${oldRoot.split("/").pop()} — Format ${oldMeta.formatVersion}, Import ${oldMeta.timeSeries.importId}, ${oldVms.size} VMs mit Reihe`);
console.log(`neu: ${newRoot.split("/").pop()} — Format ${newMeta.formatVersion}, Import ${newMeta.timeSeries.importId}, ${newVms.size} VMs mit Reihe`);
console.log(`Rightsizing-Stufe: alt ${exportedLevel(oldMeta, oldVms)} → neu ${exportedLevel(newMeta, newVms)}`);
console.log(oldMeta.timeSeries.importId === newMeta.timeSeries.importId
  ? "Gleiche importId: identische Messdaten, jede Abweichung stammt aus der Auswertungslogik."
  : "ACHTUNG: verschiedene Importe – Unterschiede können auch aus den Messdaten stammen.");

const shared = [...newVms.keys()].filter((vmId) => oldVms.has(vmId));
console.log(`gemeinsame VMs: ${shared.length} | nur alt: ${oldVms.size - shared.length} | nur neu: ${newVms.size - shared.length}`);

/* ------------------------------------------------------------------ */
/*  1  Erwartung gegen Ist                                             */
/* ------------------------------------------------------------------ */

section("1  Vorhergesagte gegen tatsächliche Wirkung");
{
  const sum = (vms: Map<string, Row>, column: string) =>
    [...vms.values()].reduce((total, row) => total + (num(row, column) ?? 0), 0);
  const count = (vms: Map<string, Row>, predicate: (row: Row) => boolean) =>
    [...vms.values()].filter(predicate).length;

  const line = (label: string, valueOf: (vms: Map<string, Row>) => number): string[] => {
    const before = valueOf(oldVms);
    const after = valueOf(newVms);
    return [label, String(before), String(after), `${after - before >= 0 ? "+" : ""}${after - before}`];
  };
  table(["Kennzahl", "alt", "neu", "Δ"], [
    line("konfigurierte vCPU", (vms) => sum(vms, "vcpu")),
    line("rückgewinnbare vCPU", (vms) => sum(vms, "reclaimableVcpu")),
    line("VMs mit Verkleinerung", (vms) => count(vms, (row) => (num(row, "reclaimableVcpu") ?? 0) > 0)),
    line("zusätzlich nötige vCPU", (vms) => sum(vms, "additionalVcpu")),
    line("VMs mit Vergrößerung", (vms) => count(vms, (row) => (num(row, "additionalVcpu") ?? 0) > 0)),
    line("VMs mit Einzelkern-Engpass", (vms) => count(vms, (row) => row.flagSingleCoreBound === "1")),
    line("Grow mit Einzelkern-Warnung", (vms) => count(vms, (row) => row.flagSingleCoreBound === "1" && (num(row, "additionalVcpu") ?? 0) > 0)),
  ]);

  console.log("\nRückhaltegründe:");
  const reasons = new Map<string, { old: number; neu: number }>();
  for (const [source, vms] of [["old", oldVms], ["neu", newVms]] as const) {
    for (const row of vms.values()) {
      const reason = row.recommendationWithheldReason || "(keine)";
      const entry = reasons.get(reason) ?? { old: 0, neu: 0 };
      if (source === "old") entry.old += 1; else entry.neu += 1;
      reasons.set(reason, entry);
    }
  }
  table(["Grund", "alt", "neu"], [...reasons.entries()]
    .sort((left, right) => right[1].neu - left[1].neu)
    .map(([reason, entry]) => [reason, String(entry.old), String(entry.neu)]));
}

/* ------------------------------------------------------------------ */
/*  2  Musterübergänge                                                 */
/* ------------------------------------------------------------------ */

section("2  Wohin sind die Lastmuster gewandert?");
{
  /**
   * Bevorzugte Reihenfolge der heute bekannten Muster. Bewusst keine abgeschlossene
   * Liste: Der Vergleich läuft gerade dann, wenn sich die Klassifikation geändert hat –
   * ein im alten Export noch vorhandenes, inzwischen entfallenes Muster (etwa
   * `constant-with-peak`) muss auf der Alt-Achse sichtbar bleiben, sonst verschwindet
   * genau die Wanderung, die geprüft werden soll. Unbekannte Werte werden deshalb
   * angehängt statt verworfen.
   */
  const SHAPE_ORDER = ["constant", "business-hours", "night-batch", "weekend", "variable", "bursty", "irregular", "unclassified"];
  const transitions = new Map<string, Map<string, number>>();
  const observed = new Set<string>();
  for (const vmId of shared) {
    const from = oldVms.get(vmId)!.shape || "unclassified";
    const to = newVms.get(vmId)!.shape || "unclassified";
    observed.add(from);
    observed.add(to);
    const row = transitions.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + 1);
    transitions.set(from, row);
  }
  const SHAPES = [
    ...SHAPE_ORDER.filter((shape) => observed.has(shape)),
    ...[...observed].filter((shape) => !SHAPE_ORDER.includes(shape)).sort(),
  ];
  console.log("Zeilen = altes Muster, Spalten = neues Muster. Diagonale = unverändert.");
  table(["alt \\ neu", ...SHAPES.map((shape) => shape.slice(0, 10)), "Σ"],
    SHAPES.flatMap((from) => {
      const row = transitions.get(from);
      if (!row) return [];
      const total = [...row.values()].reduce((sum, value) => sum + value, 0);
      return [[from, ...SHAPES.map((to) => String(row.get(to) ?? 0)), String(total)]];
    }));
  const unchanged = shared.filter((vmId) => oldVms.get(vmId)!.shape === newVms.get(vmId)!.shape).length;
  console.log(`\nunverändertes Muster: ${unchanged} (${pct(unchanged, shared.length)})`);
}

/* ------------------------------------------------------------------ */
/*  3  Verkleinerung: wie stark hat sich die Zielgröße verschoben?     */
/* ------------------------------------------------------------------ */

section("3  Verschiebung der bedarfsgerechten Zielgröße");
{
  const deltas: number[] = [];
  let deeper = 0;
  let shallower = 0;
  let equal = 0;
  for (const vmId of shared) {
    const before = num(oldVms.get(vmId), "demandBasedVcpu");
    const after = num(newVms.get(vmId), "demandBasedVcpu");
    if (before === null || after === null) continue;
    deltas.push(after - before);
    if (after > before) shallower += 1; else if (after < before) deeper += 1; else equal += 1;
  }
  console.log(`Zielgröße unverändert: ${equal} | höher (vorsichtiger): ${shallower} | niedriger (schärfer): ${deeper}`);
  const sorted = sortedCopy(deltas);
  table(["", "p05", "p25", "p50", "p75", "p95", "min", "max"], [[
    "Δ Zielgröße (neu − alt)",
    ...[0.05, 0.25, 0.5, 0.75, 0.95].map((fraction) => fmt(quantile(sorted, fraction), 0)),
    fmt(sorted[0], 0), fmt(sorted[sorted.length - 1], 0),
  ]]);

  console.log("\nDie zwanzig VMs mit der stärksten Anhebung der Zielgröße – hier hat der Peak-Pfad gewirkt:");
  table(["vmId", "vCPU", "shape alt → neu", "Ziel alt → neu", "demandP95", "demandMax p99", "Faktor p99/P95"],
    shared
      .map((vmId) => ({ vmId, before: num(oldVms.get(vmId), "demandBasedVcpu"), after: num(newVms.get(vmId), "demandBasedVcpu") }))
      .filter((entry) => entry.before !== null && entry.after !== null && entry.after > entry.before)
      .sort((left, right) => (right.after! - right.before!) - (left.after! - left.before!))
      .slice(0, 20)
      .map(({ vmId, before, after }) => {
        const row = newVms.get(vmId)!;
        const p95 = num(row, "demandP95MHz");
        const peak = num(row, "demandMaxP99MHz");
        return [vmId, row.vcpu, `${oldVms.get(vmId)!.shape} → ${row.shape}`, `${before} → ${after}`,
          fmt(p95, 0), fmt(peak, 0), fmt(p95 && p95 > 0 && peak !== null ? peak / p95 : null)];
      }));
}

/* ------------------------------------------------------------------ */
/*  4  Vergrößerungskandidaten vollständig                             */
/* ------------------------------------------------------------------ */

section("4  Vergrößerungskandidaten — die neue Richtung, vollständig zur fachlichen Prüfung");
{
  const growing = [...newVms.values()]
    .filter((row) => (num(row, "additionalVcpu") ?? 0) > 0)
    .sort((left, right) => (num(right, "utilizationP95Pct") ?? 0) - (num(left, "utilizationP95Pct") ?? 0));
  console.log(`${growing.length} VMs, zusammen ${growing.reduce((sum, row) => sum + (num(row, "additionalVcpu") ?? 0), 0)} zusätzliche vCPU\n`);
  table(["vmId", "vCPU", "→", "shape", "util p95 %", "h>75%", "h>90%", "costop", "effK max", "Pool"],
    growing.map((row) => [
      row.vmId, row.vcpu, String((num(row, "vcpu") ?? 0) + (num(row, "additionalVcpu") ?? 0)),
      row.shape.slice(0, 12),
      fmt(num(row, "utilizationP95Pct"), 1),
      row.hoursAboveCapacity75, row.hoursAboveCapacity90,
      fmt(num(row, "costopUnderLoadP95Pct"), 1),
      fmt(num(row, "effectiveCoresMax"), 1),
      row.resourcePool.slice(-6),
    ]));

  // Gegenprobe: VMs, die dauerhaft nahe der Kapazität laufen, aber *keine* Vergrößerung
  // bekommen. Wenn hier viele stehen, ist das Gate zu eng oder die Zielgröße zu klein.
  const nearCapacityWithout = [...newVms.values()].filter((row) =>
    (num(row, "hoursAboveCapacity75") ?? 0) >= 24 && (num(row, "additionalVcpu") ?? 0) === 0);
  console.log(`\nDauerhaft nahe der Kapazität, aber ohne Vergrößerungsvorschlag: ${nearCapacityWithout.length}`);
  table(["vmId", "vCPU", "shape", "util p95 %", "h>75%", "Ziel", "Grund"],
    nearCapacityWithout
      .sort((left, right) => (num(right, "utilizationP95Pct") ?? 0) - (num(left, "utilizationP95Pct") ?? 0))
      .slice(0, 15)
      .map((row) => [row.vmId, row.vcpu, row.shape.slice(0, 12), fmt(num(row, "utilizationP95Pct"), 1),
        row.hoursAboveCapacity75, row.demandBasedVcpu, row.recommendationWithheldReason || "Ziel ≤ Ist"]));
}

/* ------------------------------------------------------------------ */
/*  5  Unabhängige Nachrechnung der neuen Kennzahlen                   */
/* ------------------------------------------------------------------ */

section("5  Nachrechnung der neuen Kennzahlen aus den Rohreihen");
{
  const meta = newMeta as { timeSeries: { expectedSlots: number }; series: { metric: string; file: string; encoding: SeriesEncoding }[] };
  const SLOTS = meta.timeSeries.expectedSlots;
  const readSeries = (file: string, encoding: SeriesEncoding): Map<string, Float64Array> => {
    const text = readText(`${newRoot}/${file}`);
    const result = new Map<string, Float64Array>();
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (line === "") continue;
      const separator = line.indexOf(";");
      const decoded = decodeAnalysisSeries(line.slice(separator + 1), encoding);
      const values = new Float64Array(SLOTS).fill(Number.NaN);
      for (let index = 0; index < Math.min(SLOTS, decoded.length); index += 1) {
        const value = decoded[index];
        if (value !== null) values[index] = value;
      }
      result.set(line.slice(0, separator), values);
    }
    return result;
  };
  const seriesOf = (metric: string) => {
    const entry = meta.series.find((item) => item.metric === metric);
    return entry ? readSeries(entry.file, entry.encoding) : new Map<string, Float64Array>();
  };
  const demandAvg = seriesOf("vmCpuDemandAvgMHz");
  const demandMax = seriesOf("vmCpuDemandMaxMHz");
  const capacity = seriesOf("vmCpuTotalCapacityLastMHz");
  const vcpuSeries = seriesOf("vmConfiguredVcpuLast");
  const costop = seriesOf("vmCpuPeakCostopMaxPct");
  const disparity = seriesOf("vmCpuUsageDisparityAvgPct");

  const lastFinite = (values: Float64Array | undefined): number | null => {
    if (!values) return null;
    for (let index = values.length - 1; index >= 0; index -= 1) if (Number.isFinite(values[index])) return values[index];
    return null;
  };

  const deviations = new Map<string, number[]>();
  const record = (name: string, expected: number | null, actual: number | null) => {
    if (expected === null || actual === null) return;
    const list = deviations.get(name) ?? [];
    // Absolute Abweichung bei Zählwerten, relative bei Messwerten – sonst dominiert
    // bei kleinen Nennern das Rauschen der Quantisierung.
    list.push(Math.abs(expected - actual));
    deviations.set(name, list);
  };

  let checked = 0;
  for (const [vmId, row] of newVms) {
    const avg = demandAvg.get(vmId);
    if (!avg) continue;
    checked += 1;
    const cap = lastFinite(capacity.get(vmId));
    const vcpu = lastFinite(vcpuSeries.get(vmId)) ?? num(row, "vcpu");
    record("measuredCapacityMHz", cap, num(row, "measuredCapacityMHz"));
    record("measuredVcpu", vcpu, num(row, "measuredVcpu"));

    // Peak-Pfad: alle von den geschlossenen Stufen verwendeten Perzentile.
    const maxSeries = demandMax.get(vmId);
    if (maxSeries) {
      const finite = sortedCopy([...maxSeries].filter((value) => Number.isFinite(value)));
      record("demandMaxP99MHz", quantile(finite, 0.99), num(row, "demandMaxP99MHz"));
      record("demandMaxP995MHz", quantile(finite, 0.995), num(row, "demandMaxP995MHz"));
    }

    if (!cap || cap <= 0 || !vcpu) continue;
    let above75 = 0;
    let above90 = 0;
    const costopUnderLoad: number[] = [];
    const concentration: number[] = [];
    let effectiveMax: number | null = null;
    let singleCoreBoundHours = 0;
    let hasSingleCoreObservations = false;
    const capSeries = capacity.get(vmId);
    const costopSeries = costop.get(vmId);
    const dispSeries = disparity.get(vmId);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const demand = avg[slot];
      if (!Number.isFinite(demand)) continue;
      const slotCapacity = capSeries && Number.isFinite(capSeries[slot]) ? capSeries[slot] : cap;
      if (slotCapacity <= 0) continue;
      const utilization = (demand / slotCapacity) * 100;
      if (utilization > 75) above75 += 1;
      if (utilization > 90) above90 += 1;
      if (utilization >= 25 && costopSeries && Number.isFinite(costopSeries[slot])) costopUnderLoad.push(costopSeries[slot]);
      const slotVcpu = vcpuSeries.get(vmId) && Number.isFinite(vcpuSeries.get(vmId)![slot]) ? vcpuSeries.get(vmId)![slot] : vcpu;
      if (!dispSeries || !Number.isFinite(dispSeries[slot]) || slotVcpu <= 1) continue;
      hasSingleCoreObservations = true;
      const highestCore = Math.min(100, utilization + (dispSeries[slot] * (slotVcpu - 1)) / slotVcpu);
      if (utilization >= 1 && highestCore >= 90 && utilization <= 60) singleCoreBoundHours += 1;
      if (utilization < 5) continue;
      concentration.push((dispSeries[slot] / utilization) / slotVcpu);
      if (highestCore > 0) {
        const effective = (slotVcpu * utilization) / highestCore;
        if (effectiveMax === null || effective > effectiveMax) effectiveMax = effective;
      }
    }
    record("hoursAboveCapacity75", above75, num(row, "hoursAboveCapacity75"));
    record("hoursAboveCapacity90", above90, num(row, "hoursAboveCapacity90"));
    record("loadHourCount", costopUnderLoad.length, num(row, "loadHourCount"));
    if (costopUnderLoad.length >= 12) record("costopUnderLoadP95Pct", quantile(sortedCopy(costopUnderLoad), 0.95), num(row, "costopUnderLoadP95Pct"));
    record("concentrationIndexP90", quantile(sortedCopy(concentration), 0.9), num(row, "concentrationIndexP90"));
    record("effectiveCoresMax", effectiveMax, num(row, "effectiveCoresMax"));
    if (hasSingleCoreObservations) record("singleCoreBoundHours", singleCoreBoundHours, num(row, "singleCoreBoundHours"));
  }

  console.log(`unabhängig nachgerechnet für ${checked} VMs; gezeigt ist die absolute Abweichung zur exportierten Kennzahl.`);
  table(["Kennzahl", "n", "p50", "p95", "max"],
    [...deviations.entries()].map(([name, values]) => {
      const sorted = sortedCopy(values);
      return [name, String(values.length), fmt(quantile(sorted, 0.5), 4), fmt(quantile(sorted, 0.95), 4), fmt(sorted[sorted.length - 1], 4)];
    }));
}

/* ------------------------------------------------------------------ */
/*  6  Plausibilität der größten Verkleinerungen                       */
/* ------------------------------------------------------------------ */

section("6  Die größten Verkleinerungen — zur Plausibilitätsprüfung");
{
  const shrinking = [...newVms.values()]
    .filter((row) => (num(row, "reclaimableVcpu") ?? 0) > 0)
    .sort((left, right) => (num(right, "reclaimableVcpu") ?? 0) - (num(left, "reclaimableVcpu") ?? 0));
  table(["vmId", "vCPU", "→", "frei", "shape", "util p95 %", "Peak %", "h>75%", "costop", "Pool"],
    shrinking.slice(0, 25).map((row) => {
      const cap = num(row, "measuredCapacityMHz");
      const peak = num(row, "demandMaxP99MHz");
      return [
        row.vmId, row.vcpu, row.recommendedVcpu, row.reclaimableVcpu,
        row.shape.slice(0, 12), fmt(num(row, "utilizationP95Pct"), 1),
        fmt(cap && peak !== null ? (peak / cap) * 100 : null, 1),
        row.hoursAboveCapacity75, fmt(num(row, "costopUnderLoadP95Pct"), 1),
        row.resourcePool.slice(-6),
      ];
    }));

  console.log("\nVerteilung der Verkleinerung nach konfigurierter Größe:");
  const byVcpu = new Map<number, { vms: number; reclaim: number; total: number }>();
  for (const row of newVms.values()) {
    const vcpu = num(row, "vcpu") ?? 0;
    const bucket = byVcpu.get(vcpu) ?? { vms: 0, reclaim: 0, total: 0 };
    bucket.vms += 1;
    bucket.total += vcpu;
    bucket.reclaim += num(row, "reclaimableVcpu") ?? 0;
    byVcpu.set(vcpu, bucket);
  }
  table(["vCPU", "VMs", "vCPU gesamt", "rückgewinnbar", "Anteil"],
    [...byVcpu.entries()].sort((left, right) => left[0] - right[0]).filter(([, bucket]) => bucket.vms >= 5)
      .map(([vcpu, bucket]) => [String(vcpu), String(bucket.vms), String(bucket.total), String(bucket.reclaim), pct(bucket.reclaim, bucket.total)]));

  // Ein Schnitt auf die Hälfte oder weniger bei einer breiten VM ist der Fall, bei dem
  // ein Fehler am teuersten wäre – deshalb gesondert ausgewiesen.
  const drastic = shrinking.filter((row) => (num(row, "vcpu") ?? 0) >= 8 && (num(row, "recommendedVcpu") ?? 0) * 2 <= (num(row, "vcpu") ?? 0));
  console.log(`\nVMs ab 8 vCPU, die auf die Hälfte oder weniger sollen: ${drastic.length}`);
  console.log(`davon mit Co-Stop unter Last über 5 %: ${drastic.filter((row) => (num(row, "costopUnderLoadP95Pct") ?? 0) > 5).length} (dort macht die Verkleinerung die VM messbar schneller)`);
  console.log(`davon mit Lastkonzentration ab 0,4: ${drastic.filter((row) => (num(row, "concentrationIndexP90") ?? 0) >= 0.4).length}`);
  const maxUtil = drastic.map((row) => num(row, "utilizationP95Pct") ?? 0);
  console.log(`höchste P95-Auslastung in dieser Gruppe: ${fmt(Math.max(...maxUtil, 0), 1)} %`);
}

/* ------------------------------------------------------------------ */
/*  8  Umkonfigurierte VMs: passen Auslastung und Stundenzahl zusammen? */
/* ------------------------------------------------------------------ */

section("8  VMs, die im Messzeitraum umkonfiguriert wurden");
{
  // `utilizationP95Pct` misst gegen die *zuletzt* gemeldete Kapazität, die Stundenzähler
  // gegen die Kapazität *der jeweiligen Stunde*. Für eine VM, die im Zeitraum vergrößert
  // wurde, widersprechen sich beide – und der Vergrößerungs-Gate stützt sich dann auf
  // einen Engpass, der längst behoben ist.
  const meta = newMeta as { timeSeries: { expectedSlots: number }; series: { metric: string; file: string; encoding: SeriesEncoding }[] };
  const SLOTS = meta.timeSeries.expectedSlots;
  const readSeries = (metric: string): Map<string, (number | null)[]> => {
    const entry = meta.series.find((item) => item.metric === metric);
    const result = new Map<string, (number | null)[]>();
    if (!entry) return result;
    const text = readText(`${newRoot}/${entry.file}`);
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (line === "") continue;
      const separator = line.indexOf(";");
      result.set(line.slice(0, separator), decodeAnalysisSeries(line.slice(separator + 1), entry.encoding).slice(0, SLOTS));
    }
    return result;
  };
  const capacitySeries = readSeries("vmCpuTotalCapacityLastMHz");
  const vcpuSeries = readSeries("vmConfiguredVcpuLast");

  const changed: { vmId: string; capacities: number[]; vcpus: number[] }[] = [];
  for (const vmId of newVms.keys()) {
    const capacities = [...new Set((capacitySeries.get(vmId) ?? []).filter((value): value is number => value !== null))];
    const vcpus = [...new Set((vcpuSeries.get(vmId) ?? []).filter((value): value is number => value !== null))];
    if (capacities.length > 1 || vcpus.length > 1) changed.push({ vmId, capacities, vcpus });
  }
  const vcpuChanged = changed.filter((entry) => entry.vcpus.length > 1);
  console.log(`Kapazität im Zeitraum verändert: ${changed.length} VMs | davon mit geänderter vCPU-Anzahl: ${vcpuChanged.length}`);

  const affectedGrowth = vcpuChanged.filter((entry) => (num(newVms.get(entry.vmId), "additionalVcpu") ?? 0) > 0);
  console.log(`davon mit Vergrößerungsvorschlag: ${affectedGrowth.length}`);
  if (vcpuChanged.length) {
    table(["vmId", "vCPU im Zeitraum", "vCPU heute", "util p95 %", "h>75%", "Ziel", "zusätzlich"],
      vcpuChanged
        .sort((left, right) => (num(newVms.get(right.vmId), "hoursAboveCapacity75") ?? 0) - (num(newVms.get(left.vmId), "hoursAboveCapacity75") ?? 0))
        .slice(0, 20)
        .map((entry) => {
          const row = newVms.get(entry.vmId)!;
          return [entry.vmId, entry.vcpus.join(" → "), row.vcpu, fmt(num(row, "utilizationP95Pct"), 1),
            row.hoursAboveCapacity75, row.demandBasedVcpu, row.additionalVcpu];
        }));
  }

  // Unabhängig von der Umkonfiguration: Wo widersprechen sich beide Kennzahlen?
  // Bei mehr als 5 % der Stunden über 75 % müsste auch der P95 deutlich höher liegen.
  const inconsistent = [...newVms.values()].filter((row) => {
    const hours = num(row, "hoursAboveCapacity75") ?? 0;
    const utilization = num(row, "utilizationP95Pct");
    const samples = num(row, "demandSampleCount") ?? 0;
    return samples > 0 && hours / samples > 0.05 && utilization !== null && utilization < 75;
  });
  console.log(`\nWidersprüchlich (über 5 % der Stunden über 75 % Kapazität, aber P95 unter 75 %): ${inconsistent.length} VMs`);
  table(["vmId", "vCPU", "util p95 %", "h>75%", "Stunden", "maxStundenmittel/Kapazität %", "zusätzlich"],
    inconsistent
      .sort((left, right) => (num(right, "hoursAboveCapacity75") ?? 0) - (num(left, "hoursAboveCapacity75") ?? 0))
      .slice(0, 15)
      .map((row) => {
        const capacity = num(row, "measuredCapacityMHz");
        const maxAvg = num(row, "demandMaxMHz");
        return [row.vmId, row.vcpu, fmt(num(row, "utilizationP95Pct"), 1), row.hoursAboveCapacity75,
          row.demandSampleCount, fmt(capacity && maxAvg !== null ? (maxAvg / capacity) * 100 : null, 1), row.additionalVcpu];
      }));
}

/* ------------------------------------------------------------------ */
/*  7  Datenvollständigkeit der neuen Spalten                          */
/* ------------------------------------------------------------------ */

section("7  Vollständigkeit der neuen Spalten");
{
  const columns = [
    "demandP99MHz", "demandP995MHz", "demandMaxP95MHz", "demandMaxP99MHz", "demandMaxP995MHz", "demandMaxMaximumMHz",
    "measuredCapacityMHz", "measuredVcpu", "measuredMhzPerVcpu",
    "hoursAboveCapacity75", "hoursAboveCapacity90", "costopUnderLoadP95Pct", "loadHourCount",
    "concentrationIndexP90", "effectiveCoresMax", "singleCoreBoundHours", "weeklyRepeatability", "weeklyPeakVariation",
    "mhzPerVcpu", "additionalVcpu",
  ];
  table(["Spalte", "belegt", "Anteil", "p50", "p95"],
    columns.map((column) => {
      const values = [...newVms.values()].flatMap((row) => { const value = num(row, column); return value === null ? [] : [value]; });
      const sorted = sortedCopy(values);
      return [column, String(values.length), pct(values.length, newVms.size), fmt(quantile(sorted, 0.5), 3), fmt(quantile(sorted, 0.95), 3)];
    }));
}
