/** Misst die Exportgröße des echten Codecs gegen den vorhandenen Produktionsexport. */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  MHZ_ENCODING,
  PERCENT_ENCODING,
  encodeAnalysisSeries,
  decodeAnalysisSeries,
} from "@/lib/export/analysisSeriesCodec";

const path = "c:/Users/asi/Documents/GitHub/rvtools-analyzer/rvtools-export (5).csv";
const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
const lines = text.split(/\r?\n/);

const series: (number | null)[][] = [];
for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  // Die Rohdatenspalte ist in Anführungszeichen und enthält selbst Semikolon.
  const quoteStart = line.indexOf('"');
  if (quoteStart < 0) continue;
  const quoteEnd = line.lastIndexOf('"');
  const payload = line.slice(quoteStart + 1, quoteEnd);
  const values: (number | null)[] = [];
  for (const part of payload.split(";")) {
    const raw = part.slice(part.indexOf("=") + 1).trim();
    values.push(raw === "" ? null : Number(raw));
  }
  if (values.length > 100) series.push(values);
}

const vmCount = series.length;
const slotCount = series[0].length;
console.log(`Quelle: ${vmCount} VMs × ${slotCount} Slots`);

// Genauigkeitsprüfung nach Größenordnung: Der relative Fehler darf nicht davon
// abhängen, ob eine VM 5 oder 5.000 MHz zieht.
function measureError(encoding: typeof MHZ_ENCODING, label: string) {
  const buckets = new Map<string, number>();
  for (const values of series.slice(0, 800)) {
    const decoded = decodeAnalysisSeries(encodeAnalysisSeries(values, encoding), encoding);
    values.forEach((value, index) => {
      if (value === null || value === 0) return;
      const bucket = value < 10 ? "< 10 MHz" : value < 100 ? "10–100" : value < 1000 ? "100–1.000" : "> 1.000";
      const error = Math.abs((decoded[index] as number) - value) / value;
      buckets.set(bucket, Math.max(buckets.get(bucket) ?? 0, error));
    });
  }
  const parts = [...buckets.entries()].map(([bucket, error]) => `${bucket}: ${(error * 100).toFixed(3)} %`);
  console.log(`${label.padEnd(22)} max. relativer Fehler — ${parts.join(", ")}`);
}

measureError(MHZ_ENCODING, "MHz aktuell");
measureError({ scale: 10, significantDigits: 4 }, "MHz scale=10 sig=4");
measureError({ scale: 10, significantDigits: 3 }, "MHz scale=10 sig=3");
console.log();

const encodedMhz = series.map((values) => encodeAnalysisSeries(values, MHZ_ENCODING)).join("\n");
const encodedMhz10 = series.map((values) => encodeAnalysisSeries(values, { scale: 10, significantDigits: 4 })).join("\n");
const encodedMhz10sig3 = series.map((values) => encodeAnalysisSeries(values, { scale: 10, significantDigits: 3 })).join("\n");

/**
 * Prozentreihen nachbilden. Entscheidend ist die Autokorrelation: Reale
 * Ready-Werte liegen über Stunden bei nahezu demselben Wert, weshalb Delta und
 * RLE stark greifen. Eine Simulation aus unabhängigem Rauschen wäre ein
 * unrealistischer Worst Case und würde die Dateigröße massiv überschätzen.
 */
function makePercentSeries(noiseAmplitude: number): (number | null)[][] {
  return series.map((values, vmIndex) => {
    let level = 0.1 + (vmIndex % 5) * 0.05;
    return values.map((value) => {
      if (value === null) return null;
      level = Math.max(0, level + (Math.sin(vmIndex + value / 900) * noiseAmplitude));
      return Math.round(level * 1000) / 1000;
    });
  });
}

const encodedPercentSmooth = makePercentSeries(0.01)
  .map((values) => encodeAnalysisSeries(values, PERCENT_ENCODING)).join("\n");
const encodedPercentNoisy = makePercentSeries(0.08)
  .map((values) => encodeAnalysisSeries(values, PERCENT_ENCODING)).join("\n");

const scale = (5000 / vmCount) * (744 / slotCount);

function report(label: string, content: string, factor: number) {
  const raw = Buffer.byteLength(content);
  const gz = gzipSync(Buffer.from(content), { level: 9 }).length;
  console.log(
    `${label.padEnd(28)} roh ${(raw / 1e6).toFixed(2).padStart(6)} MB  gzip ${(gz / 1e6).toFixed(2).padStart(6)} MB` +
    `  →  5.000 VMs / 31 Tage: ${((gz * scale * factor) / 1e6).toFixed(2)} MB`,
  );
  return (gz * scale * factor) / 1e6;
}

report("Demand MHz aktuell", encodedMhz, 1);
report("Demand MHz s=10 sig=4", encodedMhz10, 1);
const demandAvg = report("Demand MHz s=10 sig=3", encodedMhz10sig3, 1);
const percentSmooth = report("Prozentreihe, ruhig", encodedPercentSmooth, 1);
const percentNoisy = report("Prozentreihe, unruhig", encodedPercentNoisy, 1);
// Total Capacity und vCPU-Anzahl ändern sich nur bei Rekonfiguration.
const constantSeries = series
  .map((values) => values.map(() => 31128))
  .map((values) => encodeAnalysisSeries(values, MHZ_ENCODING)).join("\n");
const constant = report("konstante Reihe", constantSeries, 1);

console.log();
console.log("Gesamtexport, 6 Reihen + Stammdaten:");
for (const [label, percent] of [["günstig (ruhige Prozentwerte)", percentSmooth], ["ungünstig (unruhige)", percentNoisy]] as const) {
  const total = demandAvg * 2 + percent * 3 + constant * 2 + 1.5;
  console.log(`  ${label.padEnd(32)} ${total.toFixed(1)} MB`);
}
