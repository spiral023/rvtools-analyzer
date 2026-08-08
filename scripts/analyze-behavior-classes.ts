/**
 * Analyse-Harness für VM-Verhaltensklassen.
 *
 * Liest einen Export-Studio-CSV (Spalte "CPU Demand Rohdaten (7 Tage)" muss enthalten
 * sein), rekonstruiert daraus die Stundenreihen und ruft die *echte*
 * `classifyVmBehavior()` erneut auf. Der Vergleich gegen die exportierte Spalte
 * "Verhaltensklasse" validiert den Parser; danach werden die Signalverteilungen je
 * Klasse ausgewertet, um Schwellwerte beurteilen zu können.
 *
 * Aufruf:  npx vite-node scripts/analyze-behavior-classes.ts -- "<pfad zur csv>"
 */
import { readFileSync } from "node:fs";
import { VM_BEHAVIOR_CLASS_LABEL, VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL, classifyVmBehavior } from "@/domain/services/vmWorkloadProfileService";
import { buildVmRightsizingCandidates } from "@/domain/services/vmRightsizingService";
import { percentile } from "@/lib/statistics";
import type { NormalizedHost, VmBehaviorClass, VmRightsizingCandidate, VmWorkloadClassificationSignals, VmWorkloadIntensity, VmWorkloadProfile, VmWorkloadShape, VropsTimeSeriesConfidenceLevel } from "@/domain/models/types";

/* ------------------------------------------------------------------ */
/*  CSV-Parsing                                                        */
/* ------------------------------------------------------------------ */

/** Semikolon-getrennt mit `"`-Quoting und `""` als Escape – passend zu escapeCsvCell(). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/** Spiegelt CONFIDENCE_LABEL aus dem Export zurück auf die Aufzählung. */
const CONFIDENCE_BY_LABEL = new Map<string, VropsTimeSeriesConfidenceLevel>([
  ["hoch", "high"],
  ["mittel", "medium"],
  ["niedrig", "low"],
  ["nicht berechenbar", "not-computable"],
]);

/** de-DE-Zahl aus dem Export: "31.128" -> 31128, "0,07" -> 0.07, "69,9 %" -> 69.9, "—" -> null. */
function parseGermanNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s%]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned || cleaned === "—") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

interface ParsedRow {
  server: string;
  powerState: string;
  vcpu: number | null;
  /** Exportierte Verhaltensklasse (deutsches Label) – die Referenz, gegen die wir prüfen. */
  exportedClassLabel: string;
  /** Exportiertes Lastmuster bzw. Niveau; `null`, wenn der Export die Spalten noch nicht führt. */
  exportedShapeLabel: string | null;
  exportedIntensityLabel: string | null;
  /** Vertrauensniveau des Exports – steuert im Rightsizing, ob überhaupt empfohlen wird. */
  confidence: VropsTimeSeriesConfidenceLevel;
  /** Rightsizing-Werte des Exports; `null`, wenn die Spalten fehlen. */
  exportedUsedVcpuP95: number | null;
  exportedUsedVcpuPeak: number | null;
  exportedDemandBasedVcpu: number | null;
  exportedRecommendedVcpu: number | null;
  exportedReclaimableVcpu: number | null;
  /** Rohtext der Spalte „Keine Empfehlung, weil"; „—" bedeutet: Empfehlung ausgesprochen. */
  exportedWithheldLabel: string | null;
  hasRightsizingColumns: boolean;
  configuredCpuCapacityMHz: number | null;
  /** Alle Slots des Exports, auch Lücken (Wert null) – nötig für coverageRatio. */
  slots: { timestampUtc: number; dayKey: string; hour: number; isWeekend: boolean; value: number | null }[];
}

/**
 * Baut aus "2026-07-21 00:00" einen Slot. Die Zeitstempel liegen bereits in
 * Europe/Vienna-Lokalzeit (siehe serializeHourlyCpuDemand), daher werden Stunde,
 * Tagesschlüssel und Wochenendflag direkt aus dem String abgeleitet. Als
 * `timestampUtc` genügt ein konsistenter synthetischer Schlüssel – die
 * Klassifikation nutzt ihn nur zum Verknüpfen von Grid und Werten.
 */
function parseSlot(entry: string): { timestampUtc: number; dayKey: string; hour: number; isWeekend: boolean; value: number | null } | null {
  const separator = entry.indexOf("=");
  if (separator < 0) return null;
  const stamp = entry.slice(0, separator);
  const rawValue = entry.slice(separator + 1);
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(stamp);
  if (!match) return null;
  const [, year, month, day, hour] = match;
  const timestampUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour));
  const weekday = new Date(timestampUtc).getUTCDay();
  const value = rawValue.trim() === "" ? null : Number(rawValue);
  return {
    timestampUtc,
    dayKey: `${year}-${month}-${day}`,
    hour: Number(hour),
    isWeekend: weekday === 0 || weekday === 6,
    value: value !== null && Number.isFinite(value) ? value : null,
  };
}

function parseCsv(path: string): ParsedRow[] {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const columnIndex = (label: string): number => {
    const index = header.indexOf(label);
    if (index < 0) throw new Error(`Spalte "${label}" fehlt im CSV. Vorhanden: ${header.join(", ")}`);
    return index;
  };
  /** Für Spalten, die ältere Exporte noch nicht enthalten. */
  const optionalColumnIndex = (label: string): number | null => {
    const index = header.indexOf(label);
    return index < 0 ? null : index;
  };
  const idx = {
    server: columnIndex("Server"),
    powerState: columnIndex("Power-Status"),
    vcpu: columnIndex("vCPU"),
    behaviorClass: columnIndex("Verhaltensklasse"),
    shape: optionalColumnIndex("Lastmuster"),
    intensity: optionalColumnIndex("Auslastungsniveau"),
    confidence: optionalColumnIndex("Vertrauen (Profil)"),
    usedVcpuP95: optionalColumnIndex("Genutzt P95 (vCPU)"),
    usedVcpuPeak: optionalColumnIndex("Genutzt Maximum (vCPU)"),
    demandBasedVcpu: optionalColumnIndex("Bedarfsgerecht (vCPU)"),
    recommendedVcpu: optionalColumnIndex("Empfohlen (vCPU)"),
    reclaimableVcpu: optionalColumnIndex("Rückgewinnbar (vCPU)"),
    withheld: optionalColumnIndex("Keine Empfehlung, weil"),
    capacity: columnIndex("Konfigurierte CPU-Kapazität (MHz)"),
    raw: columnIndex("CPU Demand Rohdaten (7 Tage)"),
  };

  const rows: ParsedRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const raw = fields[idx.raw] ?? "";
    const slots = raw === "—" || raw === ""
      ? []
      : raw.split(";").flatMap((entry) => {
          const slot = parseSlot(entry);
          return slot ? [slot] : [];
        });
    rows.push({
      server: fields[idx.server] ?? "",
      powerState: fields[idx.powerState] ?? "",
      vcpu: parseGermanNumber(fields[idx.vcpu] ?? ""),
      exportedClassLabel: fields[idx.behaviorClass] ?? "",
      exportedShapeLabel: idx.shape !== null ? fields[idx.shape] ?? "" : null,
      exportedIntensityLabel: idx.intensity !== null ? fields[idx.intensity] ?? "" : null,
      confidence: CONFIDENCE_BY_LABEL.get(idx.confidence !== null ? fields[idx.confidence] ?? "" : "") ?? "high",
      exportedUsedVcpuP95: idx.usedVcpuP95 !== null ? parseGermanNumber(fields[idx.usedVcpuP95] ?? "") : null,
      exportedUsedVcpuPeak: idx.usedVcpuPeak !== null ? parseGermanNumber(fields[idx.usedVcpuPeak] ?? "") : null,
      exportedDemandBasedVcpu: idx.demandBasedVcpu !== null ? parseGermanNumber(fields[idx.demandBasedVcpu] ?? "") : null,
      exportedRecommendedVcpu: idx.recommendedVcpu !== null ? parseGermanNumber(fields[idx.recommendedVcpu] ?? "") : null,
      exportedReclaimableVcpu: idx.reclaimableVcpu !== null ? parseGermanNumber(fields[idx.reclaimableVcpu] ?? "") : null,
      exportedWithheldLabel: idx.withheld !== null ? fields[idx.withheld] ?? "" : null,
      hasRightsizingColumns: idx.reclaimableVcpu !== null,
      configuredCpuCapacityMHz: parseGermanNumber(fields[idx.capacity] ?? ""),
      slots,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Neuberechnung über die echte Produktionslogik                      */
/* ------------------------------------------------------------------ */

interface Recomputed {
  row: ParsedRow;
  /** Für Schwellwert-Sweeps aufbewahrt, damit nicht erneut geparst werden muss. */
  hourGrid: { timestampUtc: number; dayKey: string; hour: number; isWeekend: boolean }[];
  demandByTimestamp: Map<number, number>;
  behaviorClass: VmBehaviorClass;
  /** Zeitliches Muster, niveauunabhängig – kommt direkt aus der Produktionslogik. */
  shape: VmWorkloadShape;
  intensity: VmWorkloadIntensity;
  signals: VmWorkloadClassificationSignals;
  p95: number | null;
  median: number | null;
  /** Grundlast-Indikator: p10 der Stundenwerte. */
  p10: number | null;
  /* --- Kandidaten als Ersatz für das wirkungslose activeHourSharePct --- */
  /** A: Anteil Stunden über p10 + 0,25 · (p95 − p10) – Schwelle über der eigenen Grundlast. */
  dutyCycleOverBaselinePct: number | null;
  /** B: Anteil Stunden über 5 % der konfigurierten Kapazität – absolute Aktivität. */
  absoluteActivityPct: number | null;
  /** C: Verhältnis p10/p95 – wie stark die VM von Grundlast dominiert wird. */
  baselineRatio: number | null;
}

function recompute(row: ParsedRow): Recomputed {
  const hourGrid = row.slots.map(({ timestampUtc, dayKey, hour, isWeekend }) => ({ timestampUtc, dayKey, hour, isWeekend }));
  const demandByTimestamp = new Map<number, number>();
  for (const slot of row.slots) {
    if (slot.value !== null) demandByTimestamp.set(slot.timestampUtc, slot.value);
  }
  const { shape, intensity, behaviorClass, signals } = classifyVmBehavior(hourGrid, demandByTimestamp, {
    configuredCpuCapacityMHz: row.configuredCpuCapacityMHz,
  });

  const values = [...demandByTimestamp.values()];
  const p95 = percentile(values, 0.95);
  const p10 = percentile(values, 0.1);
  const capacity = row.configuredCpuCapacityMHz;
  const share = (predicate: (value: number) => boolean): number | null =>
    values.length ? (values.filter(predicate).length / values.length) * 100 : null;

  return {
    row,
    hourGrid,
    demandByTimestamp,
    behaviorClass,
    shape,
    intensity,
    signals,
    p95,
    median: percentile(values, 0.5),
    p10,
    dutyCycleOverBaselinePct:
      p95 !== null && p10 !== null ? share((value) => value > p10 + 0.25 * (p95 - p10)) : null,
    absoluteActivityPct: capacity && capacity > 0 ? share((value) => value > capacity * 0.05) : null,
    baselineRatio: p95 !== null && p95 > 0 ? (p10 ?? 0) / p95 : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Berichtshilfen                                                     */
/* ------------------------------------------------------------------ */

const LABEL_TO_CLASS = new Map(
  (Object.entries(VM_BEHAVIOR_CLASS_LABEL) as [VmBehaviorClass, string][]).map(([key, label]) => [label, key]),
);
const LABEL_TO_SHAPE = new Map(
  (Object.entries(VM_WORKLOAD_SHAPE_LABEL) as [VmWorkloadShape, string][]).map(([key, label]) => [label, key]),
);
const LABEL_TO_INTENSITY = new Map(
  (Object.entries(VM_WORKLOAD_INTENSITY_LABEL) as [VmWorkloadIntensity, string][]).map(([key, label]) => [label, key]),
);

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function quantileSummary(values: readonly (number | null)[]): string {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return "keine Werte";
  const q = (p: number) => formatNumber(percentile(finite, p));
  return `n=${finite.length}  p10=${q(0.1)}  p50=${q(0.5)}  p90=${q(0.9)}`;
}

function distribution(entries: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function printDistribution(title: string, entries: readonly string[]): void {
  const total = entries.length;
  console.log(`\n${title} (n=${total})`);
  for (const [key, count] of distribution(entries)) {
    console.log(`  ${key.padEnd(22)} ${String(count).padStart(6)}  ${((100 * count) / total).toFixed(1).padStart(5)}%`);
  }
}

/* ------------------------------------------------------------------ */
/*  Hauptlauf                                                          */
/* ------------------------------------------------------------------ */

function main(): void {
  const path = process.argv.slice(2).find((argument) => argument !== "--");
  if (!path) {
    console.error('Aufruf: npx vite-node scripts/analyze-behavior-classes.ts -- "<pfad zur csv>"');
    process.exit(1);
  }

  const rows = parseCsv(path);
  const profiled = rows.filter((row) => row.slots.length > 0);
  console.log(`CSV: ${path}`);
  console.log(`Zeilen: ${rows.length}   davon mit Rohdaten: ${profiled.length}`);

  const results = profiled.map(recompute);

  /* --- 1. Reproduktion: validiert Parser und deckt Drift auf --------- */
  let matched = 0;
  const mismatches: { server: string; exported: string; recomputed: string }[] = [];
  for (const entry of results) {
    const expected = LABEL_TO_CLASS.get(entry.row.exportedClassLabel);
    if (expected === entry.behaviorClass) matched += 1;
    else mismatches.push({ server: entry.row.server, exported: entry.row.exportedClassLabel, recomputed: VM_BEHAVIOR_CLASS_LABEL[entry.behaviorClass] });
  }
  console.log(`\n=== 1. Reproduktion der exportierten Klassen ===`);
  console.log(`Verhaltensklasse: ${matched}/${results.length}  (${((100 * matched) / results.length).toFixed(2)}%)`);
  if (mismatches.length) {
    console.log(`Abweichungen (erste 15 von ${mismatches.length}):`);
    for (const mismatch of mismatches.slice(0, 15)) {
      console.log(`  ${mismatch.server.padEnd(14)} export=${mismatch.exported.padEnd(20)} neu=${mismatch.recomputed}`);
    }
    printDistribution("Abweichungsmuster export -> neu", mismatches.map((mismatch) => `${mismatch.exported} -> ${mismatch.recomputed}`));
  }

  // Die beiden Achsen prüfen sich nur, wenn der Export sie schon führt. Erst damit ist
  // die vollständige Kette validiert und nicht nur das abgeleitete Altfeld.
  const verifyAxis = <T,>(name: string, exportedLabel: (row: ParsedRow) => string | null, labelToValue: Map<string, T>, actual: (entry: Recomputed) => T) => {
    const present = results.filter((entry) => exportedLabel(entry.row) !== null);
    if (present.length === 0) {
      console.log(`${name}: Spalte im Export nicht enthalten – nicht prüfbar`);
      return;
    }
    const deviations: string[] = [];
    let hits = 0;
    for (const entry of present) {
      const expected = labelToValue.get(exportedLabel(entry.row) ?? "");
      if (expected === actual(entry)) hits += 1;
      else deviations.push(`${exportedLabel(entry.row)} -> ${String(actual(entry))}`);
    }
    console.log(`${name}: ${hits}/${present.length}  (${((100 * hits) / present.length).toFixed(2)}%)`);
    if (deviations.length) {
      for (const [pattern, count] of distribution(deviations).slice(0, 10)) {
        console.log(`  ${pattern.padEnd(42)} ${String(count).padStart(5)}`);
      }
    }
  };
  verifyAxis("Lastmuster     ", (row) => row.exportedShapeLabel, LABEL_TO_SHAPE, (entry) => entry.shape);
  verifyAxis("Niveau         ", (row) => row.exportedIntensityLabel, LABEL_TO_INTENSITY, (entry) => entry.intensity);

  /* --- 2. Verteilung ------------------------------------------------ */
  printDistribution("=== 2. Verteilung der Verhaltensklassen ===", results.map((entry) => VM_BEHAVIOR_CLASS_LABEL[entry.behaviorClass]));

  /* --- 3. Signalverteilung je Klasse -------------------------------- */
  console.log(`\n=== 3. Signalverteilung je Klasse ===`);
  const byClass = new Map<VmBehaviorClass, Recomputed[]>();
  for (const entry of results) {
    byClass.set(entry.behaviorClass, [...(byClass.get(entry.behaviorClass) ?? []), entry]);
  }
  for (const [behaviorClass, entries] of [...byClass.entries()].sort((left, right) => right[1].length - left[1].length)) {
    console.log(`\n  ${VM_BEHAVIOR_CLASS_LABEL[behaviorClass]} (n=${entries.length})`);
    console.log(`    Variationskoeffizient  ${quantileSummary(entries.map((entry) => entry.signals.coefficientOfVariation))}`);
    console.log(`    Auslastung P95 %       ${quantileSummary(entries.map((entry) => entry.signals.utilizationP95Pct))}`);
    console.log(`    Aktive-Stunden %       ${quantileSummary(entries.map((entry) => entry.signals.activeHourSharePct))}`);
    console.log(`    Tages-Wiederholbarkeit ${quantileSummary(entries.map((entry) => entry.signals.dailyRepeatability))}`);
    console.log(`    Business-Konzentration ${quantileSummary(entries.map((entry) => entry.signals.businessHoursConcentration))}`);
    console.log(`    Nacht-Konzentration    ${quantileSummary(entries.map((entry) => entry.signals.nightConcentration))}`);
    console.log(`    Wochenend-Konz.        ${quantileSummary(entries.map((entry) => entry.signals.weekendConcentration))}`);
    console.log(`    Median/P95-Verhältnis  ${quantileSummary(entries.map((entry) => (entry.p95 && entry.p95 > 0 ? (entry.median ?? 0) / entry.p95 : null)))}`);
  }

  /* --- 4. Warum greift low-utilization? ----------------------------- */
  const lowUtilization = results.filter((entry) => entry.behaviorClass === "low-utilization");
  const viaAbsolute = lowUtilization.filter((entry) => (entry.p95 ?? 0) < 100);
  const viaCapacity = lowUtilization.filter((entry) => entry.signals.utilizationP95Pct !== null && entry.signals.utilizationP95Pct < 10);
  console.log(`\n=== 4. Auslöser der low-utilization-Regel ===`);
  console.log(`  Gesamt "Gering genutzt":            ${lowUtilization.length}`);
  console.log(`  davon P95 < 100 MHz (absolut):      ${viaAbsolute.length}`);
  console.log(`  davon P95 < 10 % Kapazität:         ${viaCapacity.length}`);
  console.log(`  nur absolut (nicht Kapazität):      ${viaAbsolute.filter((entry) => !viaCapacity.includes(entry)).length}`);
  console.log(`  nur Kapazität (nicht absolut):      ${viaCapacity.filter((entry) => !viaAbsolute.includes(entry)).length}`);
  console.log(`  ohne Kapazitätsangabe:              ${lowUtilization.filter((entry) => entry.row.configuredCpuCapacityMHz === null).length}`);

  /* --- 5. Welche Form verbirgt sich hinter "Gering genutzt"? --------- */
  printDistribution(
    '=== 5. Lastmuster der als "Gering genutzt" abgeleiteten VMs ===',
    lowUtilization.map((entry) => VM_WORKLOAD_SHAPE_LABEL[entry.shape]),
  );
  printDistribution("=== 5b. Lastmuster über den Gesamtbestand ===", results.map((entry) => VM_WORKLOAD_SHAPE_LABEL[entry.shape]));
  printDistribution("=== 5c. Auslastungsniveau über den Gesamtbestand ===", results.map((entry) => VM_WORKLOAD_INTENSITY_LABEL[entry.intensity]));

  /* --- 6. Niveau-Achse getrennt betrachtet -------------------------- */
  const intensityBucket = (entry: Recomputed): string => {
    const utilization = entry.signals.utilizationP95Pct;
    if (utilization === null) return "unbekannt";
    if (utilization < 2) return "a) < 2 %";
    if (utilization < 5) return "b) 2–5 %";
    if (utilization < 10) return "c) 5–10 %";
    if (utilization < 25) return "d) 10–25 %";
    if (utilization < 50) return "e) 25–50 %";
    if (utilization < 80) return "f) 50–80 %";
    return "g) >= 80 %";
  };
  printDistribution("=== 6. Auslastungsniveau über alle VMs (P95 vs. Kapazität) ===", results.map(intensityBucket));

  /* --- 7. Kollisionsdiagnose der Kalenderregel ---------------------- */
  const calendarNearMiss = results.filter((entry) => {
    const values = [entry.signals.businessHoursConcentration ?? 0, entry.signals.nightConcentration ?? 0, entry.signals.weekendConcentration ?? 0].sort((left, right) => right - left);
    return values[0] >= 1.35 && values[0] - values[1] < 0.15;
  });
  console.log(`\n=== 7. Kalenderregel: starkes Fenster ohne ausreichenden Abstand ===`);
  console.log(`  Betroffene VMs (fallen auf bursty/variabel durch): ${calendarNearMiss.length}`);
  printDistribution("  Landen stattdessen in", calendarNearMiss.map((entry) => VM_BEHAVIOR_CLASS_LABEL[entry.behaviorClass]));

  /* --- 8. Grundlast dämpft die Konzentration ------------------------ */
  console.log(`\n=== 8. Grundlastanteil (p10/p95) je Klasse ===`);
  console.log(`  Hohe Werte bedeuten: viel Grundlast, daher rechnerisch gedämpfte Kalender-Konzentration.`);
  for (const [behaviorClass, entries] of [...byClass.entries()].sort((left, right) => right[1].length - left[1].length)) {
    console.log(`  ${VM_BEHAVIOR_CLASS_LABEL[behaviorClass].padEnd(20)} ${quantileSummary(entries.map((entry) => entry.baselineRatio))}`);
  }

  /* --- 9. Kandidaten für eine tragfähige Aktivitätsmetrik ----------- */
  console.log(`\n=== 9. Aktivitätsmetrik: Ist-Zustand gegen Kandidaten ===`);
  console.log(`  Brauchbar ist die Metrik, deren Werte sich zwischen den Klassen unterscheiden.`);
  const metricCandidates: [string, (entry: Recomputed) => number | null][] = [
    ["IST  Aktive-Stunden %      ", (entry) => entry.signals.activeHourSharePct],
    ["A    Duty-Cycle > Grundlast", (entry) => entry.dutyCycleOverBaselinePct],
    ["B    Stunden > 5 % Kapazität", (entry) => entry.absoluteActivityPct],
    ["C    Grundlastanteil p10/p95", (entry) => entry.baselineRatio],
  ];
  for (const [name, accessor] of metricCandidates) {
    console.log(`\n  ${name}`);
    for (const [behaviorClass, entries] of [...byClass.entries()].sort((left, right) => right[1].length - left[1].length)) {
      console.log(`    ${VM_BEHAVIOR_CLASS_LABEL[behaviorClass].padEnd(20)} ${quantileSummary(entries.map(accessor))}`);
    }
    const medians = [...byClass.values()]
      .filter((entries) => entries.length >= 20)
      .flatMap((entries) => {
        const finite = entries.map(accessor).filter((value): value is number => value !== null && Number.isFinite(value));
        const median = percentile(finite, 0.5);
        return median !== null ? [median] : [];
      });
    const spread = medians.length > 1 ? Math.max(...medians) - Math.min(...medians) : null;
    console.log(`    -> Spannweite der Klassen-Mediane: ${formatNumber(spread)}  (grösser = trennschärfer)`);
  }

  /* --- 10. Sweep der Niveau-Schwelle -------------------------------- */
  console.log(`\n=== 10. Sweep: lowUtilizationP95CapacityMaxPct ===`);
  console.log(`  Zeigt, wie viele VMs die Schwelle verschiebt – und wie instabil sie im Modus der Verteilung liegt.`);
  console.log(`  ${"Schwelle".padEnd(10)} ${"Gering genutzt".padStart(15)} ${"Anteil".padStart(8)} ${"Delta zu 10 %".padStart(14)}`);
  const lowUtilizationAt = (maxPct: number): number =>
    results.filter(
      (entry) =>
        classifyVmBehavior(entry.hourGrid, entry.demandByTimestamp, {
          configuredCpuCapacityMHz: entry.row.configuredCpuCapacityMHz,
          thresholds: { lowUtilizationP95CapacityMaxPct: maxPct },
        }).behaviorClass === "low-utilization",
    ).length;
  const baseline = lowUtilizationAt(10);
  for (const maxPct of [0, 2, 5, 8, 10, 12, 15, 20, 25]) {
    const count = lowUtilizationAt(maxPct);
    const delta = count - baseline;
    console.log(
      `  ${`${maxPct} %`.padEnd(10)} ${String(count).padStart(15)} ${`${((100 * count) / results.length).toFixed(1)} %`.padStart(8)} ${(delta >= 0 ? `+${delta}` : String(delta)).padStart(14)}`,
    );
  }

  /* --- 11. Kreuztabelle Muster x Niveau ------------------------------ */
  console.log(`\n=== 11. Kreuztabelle: Lastmuster x Auslastungsniveau ===`);
  console.log(`  Die eigentliche Auswertung des zweiachsigen Modells. Jede Zelle war zuvor`);
  console.log(`  unsichtbar, weil ein niedriges Niveau das Muster überschrieb.`);
  const shapeOrder: VmWorkloadShape[] = ["constant", "business-hours", "night-batch", "weekend", "bursty", "variable", "irregular", "unclassified"];
  const intensityOrder: VmWorkloadIntensity[] = ["idle", "very-low", "low", "moderate", "elevated", "high", "unknown"];
  const cell = (shape: VmWorkloadShape, intensity: VmWorkloadIntensity): number =>
    results.filter((entry) => entry.shape === shape && entry.intensity === intensity).length;

  const header = intensityOrder.map((intensity) => VM_WORKLOAD_INTENSITY_LABEL[intensity].slice(0, 8).padStart(8)).join(" ");
  console.log(`\n  ${"Muster".padEnd(20)} ${header} ${"Summe".padStart(8)}`);
  for (const shape of shapeOrder) {
    const counts = intensityOrder.map((intensity) => cell(shape, intensity));
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total === 0) continue;
    console.log(`  ${VM_WORKLOAD_SHAPE_LABEL[shape].padEnd(20)} ${counts.map((count) => String(count).padStart(8)).join(" ")} ${String(total).padStart(8)}`);
  }
  const columnTotals = intensityOrder.map((intensity) => results.filter((entry) => entry.intensity === intensity).length);
  console.log(`  ${"Summe".padEnd(20)} ${columnTotals.map((count) => String(count).padStart(8)).join(" ")} ${String(results.length).padStart(8)}`);

  /* --- 12. Was die alte Einzelklasse verdeckte ----------------------- */
  console.log(`\n=== 12. Gewinn der Trennung ===`);
  const hiddenCalendar = lowUtilization.filter((entry) => entry.shape === "business-hours" || entry.shape === "night-batch" || entry.shape === "weekend");
  const hiddenConstant = lowUtilization.filter((entry) => entry.shape === "constant");
  const idle = results.filter((entry) => entry.intensity === "idle");
  console.log(`  Kalendergeprägte VMs, die in "Gering genutzt" verschwanden: ${hiddenCalendar.length}`);
  console.log(`    -> planbar über Zeitsteuerung, war zuvor nicht auswertbar`);
  console.log(`  Konstante VMs auf niedrigem Niveau:                        ${hiddenConstant.length}`);
  console.log(`    -> ${((100 * hiddenConstant.length) / results.length).toFixed(1)} % des Bestands, primäre Rightsizing-Zielgruppe`);
  console.log(`  Wirklich ruhende VMs (< 2 % Kapazität):                    ${idle.length}`);
  console.log(`    -> ${((100 * idle.length) / results.length).toFixed(1)} % des Bestands, engster Rückbau-Kandidatenkreis`);
  const idleConstant = idle.filter((entry) => entry.shape === "constant");
  console.log(`  davon zusätzlich mit Dauerlast-Muster:                      ${idleConstant.length}`);
  console.log(`    -> dauerhaft an, dauerhaft ohne Arbeit, ohne Spitzen: härtester Kandidatenkreis`);

  /* --- 13. Rauschverdacht bei signalarmen Mustern -------------------- */
  console.log(`\n=== 13. Sind "Unregelmäßig"/"Variable Last" nur signalarm? ===`);
  console.log(`  Hypothese: bei kleinem Absolut-Demand dominiert Rauschen die Stundenmittel,`);
  console.log(`  wodurch der Variationskoeffizient steigt und die Tageskorrelation einbricht.`);
  console.log(`  Bestätigt wäre sie, wenn diese Muster deutlich niedrigere absolute P95-Werte zeigen.`);
  console.log(`\n  ${"Muster".padEnd(20)} ${"P95 absolut (MHz)".padEnd(40)} Variationskoeffizient`);
  const byShape = new Map<VmWorkloadShape, Recomputed[]>();
  for (const entry of results) byShape.set(entry.shape, [...(byShape.get(entry.shape) ?? []), entry]);
  for (const [shape, entries] of [...byShape.entries()].sort((left, right) => right[1].length - left[1].length)) {
    const p95Summary = quantileSummary(entries.map((entry) => entry.p95));
    const cvSummary = quantileSummary(entries.map((entry) => entry.signals.coefficientOfVariation));
    console.log(`  ${VM_WORKLOAD_SHAPE_LABEL[shape].padEnd(20)} ${p95Summary.padEnd(40)} ${cvSummary}`);
  }
  const noisy = results.filter((entry) => entry.shape === "irregular" || entry.shape === "variable");
  const belowAbsolute = (limit: number) => noisy.filter((entry) => (entry.p95 ?? 0) < limit).length;
  console.log(`\n  Von ${noisy.length} VMs mit "Unregelmäßig"/"Variable Last" liegen unter absoluten P95-Grenzen:`);
  for (const limit of [100, 250, 500, 1_000, 2_000]) {
    console.log(`    < ${String(limit).padStart(5)} MHz: ${String(belowAbsolute(limit)).padStart(5)}  (${((100 * belowAbsolute(limit)) / noisy.length).toFixed(1)} %)`);
  }

  /* --- 14. Verdeckt die constant-Regel Kalendermuster? -------------- */
  console.log(`\n=== 14. Reihenfolge: "constant" wird vor den Kalenderregeln geprüft ===`);
  console.log(`  Betroffen sind VMs mit CV <= 0,5 (daher "Dauerlast"), die zugleich ein`);
  console.log(`  dominantes Kalenderfenster haben und ohne die Vorrangregel dort landen würden.`);
  const calendarMasked = results.filter((entry) => {
    if (entry.shape !== "constant") return false;
    const values = [
      { name: "Business-Hours", value: entry.signals.businessHoursConcentration ?? 0 },
      { name: "Nächtliche Last", value: entry.signals.nightConcentration ?? 0 },
      { name: "Wochenendlast", value: entry.signals.weekendConcentration ?? 0 },
    ].sort((left, right) => right.value - left.value);
    return values[0].value >= 1.35 && values[0].value - values[1].value >= 0.15;
  });
  console.log(`  Betroffene VMs: ${calendarMasked.length}  (${((100 * calendarMasked.length) / results.length).toFixed(1)} % des Bestands)`);
  if (calendarMasked.length) {
    printDistribution("  Würden stattdessen erkannt als", calendarMasked.map((entry) => {
      const values = [
        { name: "Business-Hours", value: entry.signals.businessHoursConcentration ?? 0 },
        { name: "Nächtliche Last", value: entry.signals.nightConcentration ?? 0 },
        { name: "Wochenendlast", value: entry.signals.weekendConcentration ?? 0 },
      ].sort((left, right) => right.value - left.value);
      return values[0].name;
    }));
    console.log(`  Variationskoeffizient dieser VMs: ${quantileSummary(calendarMasked.map((entry) => entry.signals.coefficientOfVariation))}`);
    console.log(`  Stärkste Konzentration:           ${quantileSummary(calendarMasked.map((entry) => Math.max(entry.signals.businessHoursConcentration ?? 0, entry.signals.nightConcentration ?? 0, entry.signals.weekendConcentration ?? 0)))}`);
    // Der Grundlastanteil entscheidet: nahe 0 fällt die VM nachts wirklich ab (dann ist das
    // Kalenderlabel richtig), nahe 1 liegt nur eine Tagesspitze über durchgehender Last.
    console.log(`  Grundlastanteil p10/p95:          ${quantileSummary(calendarMasked.map((entry) => entry.baselineRatio))}`);
    console.log(`  Vergleich Dauerlast insgesamt:    ${quantileSummary(results.filter((entry) => entry.shape === "constant").map((entry) => entry.baselineRatio))}`);
    console.log(`  Vergleich echte Business-Hours:   ${quantileSummary(results.filter((entry) => entry.shape === "business-hours").map((entry) => entry.baselineRatio))}`);
    printDistribution("  Niveau dieser VMs", calendarMasked.map((entry) => VM_WORKLOAD_INTENSITY_LABEL[entry.intensity]));
  }

  reportRightsizing(results);
}

/* ------------------------------------------------------------------ */
/*  Rightsizing                                                        */
/* ------------------------------------------------------------------ */

/**
 * Rechnet das Rightsizing über die echte `buildVmRightsizingCandidates()` nach. Dazu
 * genügt je VM ein synthetischer Host, dessen MHz/Core exakt der exportierten Kapazität
 * pro vCPU entspricht – so bleibt die Formel an einer Stelle.
 *
 * P95 und Maximum stammen aus den Rohdaten der Zeitreihe, nicht aus den Exportspalten:
 * das Maximum wird gar nicht exportiert, ist für die Empfehlung aber maßgeblich.
 */
function reportRightsizing(results: readonly Recomputed[]): void {
  console.log(`\n=== 15. Rightsizing: Reproduktion und Verteilung ===`);
  const usable = results.filter((entry) => entry.row.vcpu !== null && entry.row.vcpu > 0 && entry.row.configuredCpuCapacityMHz !== null);
  if (usable.length === 0) {
    console.log(`  Keine VMs mit vCPU und Kapazität – nicht auswertbar.`);
    return;
  }

  const emptyStats = { expectedSlots: 168, sampleCount: 0, coverageRatio: 0, average: null, p50: null, p95: null, maximum: null };
  const profiles: VmWorkloadProfile[] = [];
  const hosts: NormalizedHost[] = [];
  for (const entry of usable) {
    const vcpu = entry.row.vcpu!;
    const values = [...entry.demandByTimestamp.values()];
    const hostKey = `host:${entry.row.server}`;
    hosts.push({
      snapshotId: "csv", vcenterId: "csv", hostKey, host: hostKey, cluster: null, datacenter: null,
      cpuModel: null, cpuTotalMHz: entry.row.configuredCpuCapacityMHz, cpuCores: vcpu, cpuThreads: null, memoryTotalMiB: null,
      version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
    } as NormalizedHost);
    profiles.push({
      objectKey: entry.row.server, rvtoolsObjectKey: entry.row.server, vmName: entry.row.server,
      clusterKey: null, clusterName: null, hostKey, host: hostKey, vcpu,
      configuredMemoryMiB: null, powerState: entry.row.powerState, workloadClass: "unknown",
      hourly: [],
      demand: { ...emptyStats, sampleCount: values.length, coverageRatio: 1, p95: entry.p95, maximum: values.length ? Math.max(...values) : null },
      ready: emptyStats,
      shape: entry.shape, intensity: entry.intensity, behaviorClass: entry.behaviorClass,
      confidence: entry.row.confidence, signals: entry.signals,
    } as VmWorkloadProfile);
  }

  const candidates = new Map(buildVmRightsizingCandidates({ profiles, hosts }).map((candidate) => [candidate.objectKey, candidate]));

  console.log(`  Auswertbare VMs: ${usable.length}`);
  const oddReclaim = usable.filter((entry) => ((candidates.get(entry.row.server)?.reclaimableVcpu ?? 0) % 2) !== 0).length;
  console.log(`  Ungerade Rückgabewerte: ${oddReclaim}   (muss 0 sein)`);

  if (!usable[0].row.hasRightsizingColumns) {
    console.log(`  Export führt keine Rightsizing-Spalten – nur die neu berechneten Werte werden ausgewiesen.`);
  } else {
    // Der Export stammt aus derselben Logik, also muss jedes Feld exakt reproduzieren.
    // Abweichungen sind echte Funde – bei Gleitkommafeldern mit Toleranz, weil die
    // Kapazität im Export auf ganze MHz gerundet ist und mhzPerCore daraus abgeleitet wird.
    console.log(`\n  Feldweise Reproduktion gegen den Export:`);
    const verifyField = (name: string, exported: (row: ParsedRow) => number | null, actual: (candidate: VmRightsizingCandidate) => number | null, tolerance: number) => {
      let hits = 0;
      let comparable = 0;
      const examples: string[] = [];
      for (const entry of usable) {
        const candidate = candidates.get(entry.row.server);
        if (!candidate) continue;
        const expectedValue = exported(entry.row);
        if (expectedValue === null) continue;
        comparable += 1;
        const actualValue = actual(candidate);
        if (actualValue !== null && Math.abs(actualValue - expectedValue) <= tolerance) hits += 1;
        else if (examples.length < 5) examples.push(`${entry.row.server}: Export ${expectedValue} / neu ${actualValue ?? "—"}`);
      }
      if (comparable === 0) {
        console.log(`    ${name.padEnd(26)} Spalte fehlt`);
        return;
      }
      console.log(`    ${name.padEnd(26)} ${hits}/${comparable}  (${((100 * hits) / comparable).toFixed(2)} %)`);
      for (const example of examples) console.log(`      ${example}`);
    };
    verifyField("Genutzt P95 (vCPU)", (row) => row.exportedUsedVcpuP95, (candidate) => candidate.usedVcpuEquivalentP95, 0.01);
    verifyField("Genutzt Maximum (vCPU)", (row) => row.exportedUsedVcpuPeak, (candidate) => candidate.usedVcpuEquivalentPeak, 0.01);
    verifyField("Bedarfsgerecht (vCPU)", (row) => row.exportedDemandBasedVcpu, (candidate) => candidate.demandBasedVcpu, 0);
    verifyField("Empfohlen (vCPU)", (row) => row.exportedRecommendedVcpu, (candidate) => candidate.recommendedVcpu, 0);
    verifyField("Rückgewinnbar (vCPU)", (row) => row.exportedReclaimableVcpu, (candidate) => candidate.reclaimableVcpu, 0);

    // Der Zurückhaltungsgrund ist Text, daher gegen das Label des Exports geprüft.
    const withheldLabel: Record<string, string> = { "low-confidence": "Datenbasis zu dünn", "unreliable-shape": "Muster in 7 Tagen nicht verlässlich" };
    let withheldHits = 0;
    let withheldComparable = 0;
    const withheldExamples: string[] = [];
    for (const entry of usable) {
      const candidate = candidates.get(entry.row.server);
      if (!candidate || entry.row.exportedWithheldLabel === null) continue;
      withheldComparable += 1;
      const expectedLabel = candidate.recommendationWithheldReason === null ? "—" : withheldLabel[candidate.recommendationWithheldReason];
      if (entry.row.exportedWithheldLabel === expectedLabel) withheldHits += 1;
      else if (withheldExamples.length < 5) withheldExamples.push(`${entry.row.server}: Export "${entry.row.exportedWithheldLabel}" / neu "${expectedLabel}"`);
    }
    if (withheldComparable > 0) {
      console.log(`    ${"Keine Empfehlung, weil".padEnd(26)} ${withheldHits}/${withheldComparable}  (${((100 * withheldHits) / withheldComparable).toFixed(2)} %)`);
      for (const example of withheldExamples) console.log(`      ${example}`);
    }

    console.log(`\n  Rückgewinnbare vCPU gesamt (Export): ${usable.reduce((sum, entry) => sum + (entry.row.exportedReclaimableVcpu ?? 0), 0)}`);
  }

  const all = [...candidates.values()];
  const notable = all.filter((candidate) => (candidate.reclaimableVcpu ?? 0) > 0);
  console.log(`\n  VMs mit Empfehlung zur Verkleinerung: ${notable.length}  (${((100 * notable.length) / usable.length).toFixed(1)} %)`);

  /* --- Zurückhaltung: warum wird nichts empfohlen? ------------------ */
  printDistribution("  Grund der Zurückhaltung", all.map((candidate) => {
    if (candidate.recommendationWithheldReason === "low-confidence") return "Datenbasis zu dünn";
    if (candidate.recommendationWithheldReason === "unreliable-shape") return "Muster nicht verlässlich";
    if ((candidate.reclaimableVcpu ?? 0) > 0) return "– Empfehlung ausgesprochen";
    // Unterscheidet echte Bedarfsdeckung von reiner Schrittweiten-Granularität: bei
    // weniger als 8 vCPU rundet ein Viertel der Größe auf null gerade vCPU ab.
    if ((candidate.demandBasedVcpu ?? candidate.vcpu) === candidate.vcpu) return "bereits bedarfsgerecht";
    return "Potenzial, aber zu klein für einen Schritt";
  }));
  const tooSmall = all.filter((candidate) =>
    candidate.recommendationWithheldReason === null &&
    (candidate.reclaimableVcpu ?? 0) === 0 &&
    (candidate.demandBasedVcpu ?? candidate.vcpu) !== candidate.vcpu);
  printDistribution("  Konfigurierte vCPU der zu kleinen VMs", tooSmall.map((candidate) => `${String(candidate.vcpu).padStart(3)} vCPU`));

  /* --- Abstand zwischen Schritt und Endziel ------------------------- */
  console.log(`\n  Bedarfsgerechte Zielgröße gegen empfohlenen Schritt:`);
  const demandTotal = all.reduce((sum, candidate) => sum + (candidate.vcpu ?? 0) - (candidate.demandBasedVcpu ?? candidate.vcpu ?? 0), 0);
  const stepTotal = all.reduce((sum, candidate) => sum + (candidate.reclaimableVcpu ?? 0), 0);
  console.log(`    bedarfsgerecht rückgewinnbar (Endziel): ${demandTotal} vCPU`);
  console.log(`    im ersten Schritt empfohlen:            ${stepTotal} vCPU  (${demandTotal > 0 ? ((100 * stepTotal) / demandTotal).toFixed(1) : "—"} % des Endziels)`);
  console.log(`    verbleibt für weitere Runden:           ${demandTotal - stepTotal} vCPU`);

  console.log(`\n  Anteil der Rückgabe an der konfigurierten Größe:`);
  console.log(`    ${quantileSummary(all.map((candidate) => (candidate.vcpu ? (candidate.reclaimableVcpu ?? 0) / candidate.vcpu : null)))}`);
  printDistribution("  Rückgabe je Muster (Summe vCPU)", all.flatMap((candidate) => Array.from({ length: candidate.reclaimableVcpu ?? 0 }, () => VM_WORKLOAD_SHAPE_LABEL[candidate.shape])));
}

main();
