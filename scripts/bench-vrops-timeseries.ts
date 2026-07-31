/**
 * Messbasis für den vROps-Zeitreihenimport.
 *
 * Erzeugt synthetische VM-/Cluster-/Host-CSVs im exakten Format der echten
 * vROps-Exporte und misst Laufzeit und Heap-Bedarf der aktuellen Pipeline
 * (gestreamter Matrixparser gegen den zeilenbasierten Parser).
 *
 * Aufruf:
 *   npx vite-node --options.transformMode.ssr='.*' scripts/bench-vrops-timeseries.ts -- --vms=1000 --days=7
 *   node --max-old-space-size=8192 node_modules/vite-node/dist/cli.mjs scripts/bench-vrops-timeseries.ts -- --vms=5000 --days=30
 */
import { openAsBlob } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseVropsTimeSeriesCsv } from "@/domain/services/vropsTimeSeriesParser";
import { parseVropsTimeSeriesMatrix } from "@/domain/services/vropsTimeSeriesMatrixParser";
import type { VropsTimeSeriesObjectType } from "@/domain/models/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const VM_HEADER = '"Name","Interval Breakdown","VM|CPU|Demand (MHz)|Avg","VM|CPU|Ready (%)|Max"';
const CLUSTER_HEADER = '"Name","Interval Breakdown","Cluster|CPU|Demand|Avg","Cluster|CPU|Demand|Max",'
  + '"Cluster|Memory|Utilization (MB)|Avg","Cluster|Memory|Utilization (MB)|Max",'
  + '"Cluster|CPU|Contention (%)|Avg","Cluster|CPU|Contention (%)|Max"';
const HOST_HEADER = '"Name","Interval Breakdown","Host|CPU|Demand|Avg","Host|CPU|Demand|Max",'
  + '"Host|CPU|Usage|Avg","Host|CPU|Usage|Max","Host|Memory|Utilization|Avg","Host|Memory|Utilization|Max",'
  + '"Host|CPU|Contention (%)|Avg","Host|CPU|Contention (%)|Max",'
  + '"Host|CPU|Capacity Available to VMs|Last","Host|Memory|Capacity Available to VMs|Last",'
  + '"Host|Runtime|Maintenance State|Last"';

/**
 * Startpunkt bewusst im Juli: innerhalb von 30 Tagen liegt keine Zeitumstellung,
 * damit der Generator keine mehrdeutigen lokalen Zeiten erzeugt.
 */
const START = { year: 2026, month: 7, day: 1 };

/** Formatiert eine Stunde ab Startpunkt als "12:00 AM 21 July 2026". */
function viennaLabel(hourOffset: number): string {
  const date = new Date(Date.UTC(START.year, START.month - 1, START.day, hourOffset));
  const hour24 = date.getUTCHours();
  const meridiem = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:00 ${meridiem} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Die Zeitstempel wiederholen sich je Objekt, daher einmalig pro Slot vorformatieren. */
function buildLabels(slots: number): string[] {
  return Array.from({ length: slots }, (_, slot) => viennaLabel(slot));
}

/** Englisches Zahlenformat mit Tausenderkomma, wie in den echten Exporten. */
function englishNumber(value: number, fractionDigits = 2): string {
  const fixed = value.toFixed(fractionDigits);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/**
 * Vorformatierte Wertepools: `toFixed`/Gruppierung je Zelle dominiert sonst die
 * Generierung und verfälscht das Verhältnis zur gemessenen Importdauer.
 */
function buildValuePool(size: number, minimum: number, span: number, fractionDigits = 2): string[] {
  return Array.from({ length: size }, (_, index) => englishNumber(minimum + pseudoRandom(index) * span, fractionDigits));
}

/** Deterministischer Pseudo-Zufall, damit Läufe vergleichbar bleiben. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10_000;
  return x - Math.floor(x);
}

const POOL_SIZE = 997;

function buildVmCsv(vmCount: number, slots: number): string {
  const labels = buildLabels(slots);
  const demandPool = buildValuePool(POOL_SIZE, 500, 8000);
  const readyPool = buildValuePool(POOL_SIZE, 0, 2);
  const parts: string[] = [VM_HEADER];
  for (let vm = 0; vm < vmCount; vm += 1) {
    const name = `servername${9000 + vm}`;
    for (let slot = 0; slot < slots; slot += 1) {
      const pick = (vm * 31 + slot) % POOL_SIZE;
      parts.push(`"${name}","${labels[slot]}","${demandPool[pick]}","${readyPool[pick]}"`);
    }
  }
  return parts.join("\r\n");
}

function buildClusterCsv(clusterCount: number, slots: number): string {
  const labels = buildLabels(slots);
  const demandPool = buildValuePool(POOL_SIZE, 200_000, 300_000);
  const memoryPool = buildValuePool(POOL_SIZE, 2_000_000, 1_000_000);
  const contentionPool = buildValuePool(POOL_SIZE, 0, 2);
  const parts: string[] = [CLUSTER_HEADER];
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const name = `CL-${String(cluster + 1).padStart(2, "0")}`;
    for (let slot = 0; slot < slots; slot += 1) {
      const pick = (cluster * 13 + slot) % POOL_SIZE;
      // Avg und Max teilen denselben Wert: der Generator soll Datenvolumen
      // erzeugen, nicht die Avg<=Max-Validierung auslösen.
      parts.push(
        `"${name}","${labels[slot]}",`
        + `"${demandPool[pick]}","${demandPool[pick]}",`
        + `"${memoryPool[pick]}","${memoryPool[pick]}",`
        + `"${contentionPool[pick]}","${contentionPool[pick]}"`,
      );
    }
  }
  return parts.join("\r\n");
}

function buildHostCsv(hostCount: number, slots: number): string {
  const labels = buildLabels(slots);
  const demandPool = buildValuePool(POOL_SIZE, 40_000, 20_000);
  const usagePool = buildValuePool(POOL_SIZE, 30_000, 15_000);
  const memoryPool = buildValuePool(POOL_SIZE, 500_000, 60_000);
  const contentionPool = buildValuePool(POOL_SIZE, 0, 1.5);
  const parts: string[] = [HOST_HEADER];
  for (let host = 0; host < hostCount; host += 1) {
    const name = `hostname${1000 + host}.domain.at`;
    for (let slot = 0; slot < slots; slot += 1) {
      const pick = (host * 11 + slot) % POOL_SIZE;
      // Wie im echten Export: der Zustand steht nur sporadisch, sonst "-".
      const maintenance = slot % 24 === 0 ? "notInMaintenance" : "-";
      parts.push(
        `"${name}","${labels[slot]}",`
        + `"${demandPool[pick]}","${demandPool[pick]}",`
        + `"${usagePool[pick]}","${usagePool[pick]}",`
        + `"${memoryPool[pick]}","${memoryPool[pick]}",`
        + `"${contentionPool[pick]}","${contentionPool[pick]}",`
        + `"124,544","1,536,409.75",`
        + `"${maintenance}"`,
      );
    }
  }
  return parts.join("\r\n");
}

interface Measurement {
  label: string;
  milliseconds: number;
  heapDeltaMiB: number;
  peakHeapMiB: number;
}

function heapUsedMiB(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function measure<T>(label: string, run: () => T): { value: T; measurement: Measurement } {
  global.gc?.();
  const heapBefore = heapUsedMiB();
  const started = performance.now();
  const value = run();
  const milliseconds = performance.now() - started;
  const peakHeapMiB = heapUsedMiB();
  return {
    value,
    measurement: { label, milliseconds, heapDeltaMiB: peakHeapMiB - heapBefore, peakHeapMiB },
  };
}

async function measureAsync<T>(label: string, run: () => Promise<T>): Promise<{ value: T; measurement: Measurement }> {
  global.gc?.();
  const heapBefore = heapUsedMiB();
  const started = performance.now();
  const value = await run();
  const milliseconds = performance.now() - started;
  const peakHeapMiB = heapUsedMiB();
  return {
    value,
    measurement: { label, milliseconds, heapDeltaMiB: peakHeapMiB - heapBefore, peakHeapMiB },
  };
}

function parseArgs(): { vms: number; days: number; hosts: number; clusters: number; mode: string } {
  const read = (name: string, fallback: number) => {
    const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`));
    return raw ? Number(raw.split("=")[1]) : fallback;
  };
  const rawMode = process.argv.find((argument) => argument.startsWith("--mode="));
  return {
    vms: read("vms", 1000),
    days: read("days", 7),
    hosts: read("hosts", 300),
    clusters: read("clusters", 30),
    mode: rawMode ? rawMode.split("=")[1] : "both",
  };
}

function printMeasurements(measurements: Measurement[]): void {
  console.log("Schritt".padEnd(38) + "Zeit".padStart(12) + "Heap Δ".padStart(14) + "Heap danach".padStart(14));
  for (const entry of measurements) {
    console.log(
      entry.label.padEnd(38)
      + `${(entry.milliseconds / 1000).toFixed(2)} s`.padStart(12)
      + `${entry.heapDeltaMiB.toFixed(0)} MiB`.padStart(14)
      + `${entry.peakHeapMiB.toFixed(0)} MiB`.padStart(14),
    );
  }
}

/**
 * Misst den zeilenbasierten Parser als Vergleichsbasis.
 *
 * Er wird produktiv nur noch für die Header-Erkennung kleiner Stichproben
 * genutzt; hier dient er dazu, den Speicherbedarf der materialisierten
 * Zeilenobjekte gegen den gestreamten Pfad zu stellen.
 */
function runLegacy(csvs: Record<VropsTimeSeriesObjectType, string>): Measurement[] {
  const measurements: Measurement[] = [];
  for (const type of ["vm", "cluster", "host"] as const) {
    const result = measure(`parseVropsTimeSeriesCsv (${type})`, () => parseVropsTimeSeriesCsv(csvs[type]));
    measurements.push(result.measurement);
    const errors = result.value.issues.filter((issue) => issue.severity === "error").length;
    console.log(`  ${type}: ${result.value.rows.length.toLocaleString("de-DE")} Zeilen, `
      + `${result.value.issues.length.toLocaleString("de-DE")} Issues (${errors} Fehler)`);
  }
  return measurements;
}

/** Misst den gestreamten Pfad: Datei -> Matrix, ohne Zeilenobjekte. */
async function runMatrix(files: Record<VropsTimeSeriesObjectType, string>): Promise<Measurement[]> {
  const measurements: Measurement[] = [];
  let payloadBytes = 0;
  for (const type of ["vm", "cluster", "host"] as const) {
    const result = await measureAsync(`parseVropsTimeSeriesMatrix (${type})`, async () => {
      const blob = await openAsBlob(files[type]);
      return parseVropsTimeSeriesMatrix(blob);
    });
    measurements.push(result.measurement);
    const matrix = result.value.matrix;
    if (!matrix) {
      console.log(`  ${type}: keine Matrix — ${result.value.issues.map((issue) => issue.code).join(", ")}`);
      continue;
    }
    payloadBytes += Object.values(matrix.metricValues)
      .reduce((sum, values) => sum + values.byteLength, 0);
    const errors = matrix.issues.filter((issue) => issue.severity === "error").length;
    console.log(`  ${type}: ${matrix.rowCount.toLocaleString("de-DE")} Zeilen, `
      + `${matrix.objectNames.length.toLocaleString("de-DE")} Objekte × ${matrix.timestampsUtc.length} Slots, `
      + `${matrix.issues.length} Issues (${errors} Fehler)`);
  }
  console.log(`  Float32-Nutzlast ${(payloadBytes / (1024 * 1024)).toFixed(1)} MiB`);
  return measurements;
}

function summarize(label: string, measurements: Measurement[]): { seconds: number; peak: number } {
  console.log(`\n--- ${label} ---`);
  printMeasurements(measurements);
  const seconds = measurements.reduce((total, entry) => total + entry.milliseconds, 0) / 1000;
  const peak = Math.max(...measurements.map((entry) => entry.peakHeapMiB));
  console.log(`Summe: ${seconds.toFixed(2)} s, Heap-Höchststand: ${peak.toFixed(0)} MiB`);
  return { seconds, peak };
}

async function main() {
  const { vms, days, hosts, clusters, mode } = parseArgs();
  const slots = days * 24;

  console.log(`\nvROps-Zeitreihen-Benchmark — ${vms} VMs, ${hosts} Hosts, ${clusters} Cluster, ${days} Tage (${slots} Slots)`);
  console.log(`Erwartete VM-Datenzeilen: ${(vms * slots).toLocaleString("de-DE")}\n`);

  const directory = await mkdtemp(path.join(tmpdir(), "vrops-bench-"));
  const files = {
    vm: path.join(directory, "vm.csv"),
    cluster: path.join(directory, "cluster.csv"),
    host: path.join(directory, "host.csv"),
  };

  try {
    // Die CSVs werden einzeln erzeugt und sofort geschrieben, damit der
    // Streaming-Pfad später wirklich von Platte liest.
    const generation = await measureAsync("CSV-Generierung + Schreiben", async () => {
      await writeFile(files.vm, buildVmCsv(vms, slots), "utf-8");
      await writeFile(files.cluster, buildClusterCsv(clusters, slots), "utf-8");
      await writeFile(files.host, buildHostCsv(hosts, slots), "utf-8");
    });
    printMeasurements([generation.measurement]);

    let legacy: { seconds: number; peak: number } | null = null;
    let matrix: { seconds: number; peak: number } | null = null;

    if (mode === "matrix" || mode === "both") {
      console.log("\nGestreamter Matrixparser:");
      matrix = summarize("Matrix (neu)", await runMatrix(files));
    }
    if (mode === "legacy" || mode === "both") {
      console.log("\nBestehende Pipeline:");
      const csvs = {
        vm: await readCsv(files.vm),
        cluster: await readCsv(files.cluster),
        host: await readCsv(files.host),
      };
      legacy = summarize("Legacy (bestehend)", runLegacy(csvs));
    }

    if (legacy && matrix) {
      console.log("\n=== Vergleich ===");
      console.log(`Zeit:  ${legacy.seconds.toFixed(2)} s  ->  ${matrix.seconds.toFixed(2)} s`);
      console.log(`Heap:  ${legacy.peak.toFixed(0)} MiB  ->  ${matrix.peak.toFixed(0)} MiB`
        + `  (Faktor ${(legacy.peak / matrix.peak).toFixed(1)})`);
    }
    console.log("");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readCsv(file: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf-8");
}

await main();
