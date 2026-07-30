import type { VmRightsizingCandidate } from "@/domain/models/types";

/**
 * Ein Streudiagramm mit einem Punkt je VM ist bei Produktionsbeständen von mehreren
 * Tausend Systemen doppelt untauglich: Recharts erzeugt pro Punkt ein SVG-Element mit
 * eigenem Hover-Handling (Layout- und Event-Kosten skalieren linear), und die Punkte
 * überdecken sich so stark, dass die Dichte gar nicht mehr ablesbar ist.
 *
 * Stattdessen werden die VMs in ein festes Raster aus vCPU- und Auslastungsbändern
 * gezählt. Die Darstellungskosten hängen damit nur noch von der Rasterweite ab, und die
 * eigentliche Aussage – wo die Masse des Bestands sitzt – wird durch die Aggregation
 * sogar deutlicher.
 */

export interface RightsizingBand {
  key: string;
  label: string;
  /** Untergrenze, inklusive. */
  min: number;
  /** Obergrenze, exklusive; `null` bedeutet offen nach oben. */
  max: number | null;
}

/** Über 100 % ist die konfigurierte Kapazität erschöpft, ab 90 % wird sie knapp. */
export type RightsizingDemandSeverity = "critical" | "warn" | "neutral";

export interface RightsizingDemandBand extends RightsizingBand {
  severity: RightsizingDemandSeverity;
}

export interface RightsizingDensityCell {
  vcpuBandKey: string;
  demandBandKey: string;
  vmCount: number;
  /** Summe der rückgewinnbaren vCPU – ersetzt die Punktgröße des früheren Streudiagramms. */
  reclaimableVcpu: number;
  notableCount: number;
}

export interface RightsizingDensityGrid {
  /** Aufsteigend nach konfigurierter vCPU-Anzahl; leere Bänder am oberen Ende entfallen. */
  vcpuBands: RightsizingBand[];
  /** Absteigend nach Auslastung, damit die Zeile mit der höchsten Last oben steht. */
  demandBands: RightsizingDemandBand[];
  /** Zeilenweise in der Reihenfolge von `demandBands`, je Zeile eine Zelle pro vCPU-Band. */
  rows: RightsizingDensityCell[][];
  /** Höchste Zellbesetzung – Bezugsgröße für die Farbskala. */
  maxVmCount: number;
  vmCount: number;
  reclaimableVcpu: number;
}

/** vCPU-Zahlen sind in der Praxis Zweierpotenzen-nah verteilt, deshalb wachsende Bandbreiten. */
const VCPU_BANDS: readonly RightsizingBand[] = [
  { key: "1", label: "1", min: 1, max: 2 },
  { key: "2", label: "2", min: 2, max: 3 },
  { key: "3-4", label: "3–4", min: 3, max: 5 },
  { key: "5-8", label: "5–8", min: 5, max: 9 },
  { key: "9-16", label: "9–16", min: 9, max: 17 },
  { key: "17-32", label: "17–32", min: 17, max: 33 },
  { key: "33-64", label: "33–64", min: 33, max: 65 },
  { key: "65+", label: "> 64", min: 65, max: null },
];

/**
 * Die Bandgrenzen folgen den Stufen des Auslastungsniveaus aus dem VM-Profile
 * (`VM_WORKLOAD_INTENSITY_RANGE`), ergänzt um die beiden kritischen Bänder ab 90 %.
 */
const DEMAND_BANDS: readonly RightsizingDemandBand[] = [
  { key: "ge-100", label: "≥ 100 %", min: 100, max: null, severity: "critical" },
  { key: "90-100", label: "90–100 %", min: 90, max: 100, severity: "warn" },
  { key: "50-90", label: "50–90 %", min: 50, max: 90, severity: "neutral" },
  { key: "25-50", label: "25–50 %", min: 25, max: 50, severity: "neutral" },
  { key: "10-25", label: "10–25 %", min: 10, max: 25, severity: "neutral" },
  { key: "5-10", label: "5–10 %", min: 5, max: 10, severity: "neutral" },
  { key: "2-5", label: "2–5 %", min: 2, max: 5, severity: "neutral" },
  { key: "0-2", label: "< 2 %", min: 0, max: 2, severity: "neutral" },
];

/** Auch bei einem sehr kleinen Bestand bleibt die X-Achse als Skala lesbar. */
const MIN_VCPU_BANDS = 3;

/**
 * Das Band, in dessen Halbintervall `[min, max)` der Wert liegt – unabhängig davon, ob
 * die Bänder auf- oder absteigend definiert sind. Werte unterhalb aller Untergrenzen
 * fallen ins kleinste Band, damit kein Messwert aus dem Raster fällt.
 */
function bandIndexOf(bands: readonly RightsizingBand[], value: number): number {
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    if (value >= band.min && (band.max === null || value < band.max)) return index;
  }
  return bands.reduce((lowest, band, index) => (band.min < bands[lowest].min ? index : lowest), 0);
}

/**
 * Zählt alle Kandidaten mit gültiger vCPU-Angabe und berechenbarer Auslastung in das
 * Raster. Ein einziger Durchlauf über den Bestand, danach ist die Darstellung
 * unabhängig von der VM-Anzahl.
 */
export function buildRightsizingDensityGrid(candidates: readonly VmRightsizingCandidate[]): RightsizingDensityGrid {
  const counts = DEMAND_BANDS.map(() => VCPU_BANDS.map(() => ({ vmCount: 0, reclaimableVcpu: 0, notableCount: 0 })));
  let vmCount = 0;
  let reclaimableVcpu = 0;
  let highestVcpuBand = 0;

  for (const candidate of candidates) {
    if (candidate.vcpu === null || candidate.vcpu <= 0 || candidate.usedVcpuEquivalentP95 === null) continue;
    const demandPct = (candidate.usedVcpuEquivalentP95 / candidate.vcpu) * 100;
    if (!Number.isFinite(demandPct)) continue;

    const vcpuIndex = bandIndexOf(VCPU_BANDS, candidate.vcpu);
    const demandIndex = bandIndexOf(DEMAND_BANDS, demandPct);
    const cell = counts[demandIndex][vcpuIndex];
    cell.vmCount += 1;
    cell.reclaimableVcpu += candidate.reclaimableVcpu ?? 0;
    if (candidate.flags.manyVcpuLowDemand || candidate.flags.highCpuReady) cell.notableCount += 1;

    vmCount += 1;
    reclaimableVcpu += candidate.reclaimableVcpu ?? 0;
    if (vcpuIndex > highestVcpuBand) highestVcpuBand = vcpuIndex;
  }

  const vcpuBands = VCPU_BANDS.slice(0, Math.max(highestVcpuBand + 1, MIN_VCPU_BANDS));
  const rows = DEMAND_BANDS.map((demandBand, demandIndex) => vcpuBands.map((vcpuBand, vcpuIndex) => ({
    vcpuBandKey: vcpuBand.key,
    demandBandKey: demandBand.key,
    ...counts[demandIndex][vcpuIndex],
  })));
  const maxVmCount = rows.reduce((max, row) => row.reduce((rowMax, cell) => Math.max(rowMax, cell.vmCount), max), 0);

  return { vcpuBands, demandBands: [...DEMAND_BANDS], rows, maxVmCount, vmCount, reclaimableVcpu };
}
