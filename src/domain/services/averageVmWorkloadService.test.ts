import { describe, expect, it } from "vitest";
import type { VmWorkloadHourlyPoint, VmWorkloadProfile, VropsTimeSeriesImport } from "@/domain/models/types";
import { buildAverageVmWorkload, resolveWeekSlot } from "./averageVmWorkloadService";
import { buildHourGrid } from "./vmWorkloadProfileService";

const HOUR_MS = 60 * 60 * 1000;
/** 2024-01-07 23:00 UTC = Montag, 08.01.2024 00:00 in Europe/Vienna. */
const MONDAY_MIDNIGHT_UTC = Date.UTC(2024, 0, 7, 23, 0, 0);

describe("buildAverageVmWorkload", () => {
  it("gibt null zurück, wenn kein Profil im Filter liegt", () => {
    expect(
      buildAverageVmWorkload({ import: makeImport(24), profiles: [], scopedVmCount: 12 }),
    ).toBeNull();
  });

  it("mittelt je Stundenschlitz nur über VMs mit Messwert", () => {
    const importMeta = makeImport(3);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100, 200, 300]),
        makeProfile("vm-b", timestamps, [300, null, 500]),
      ],
      scopedVmCount: 4,
    })!;

    expect(workload.vmCount).toBe(2);
    expect(workload.scopedVmCount).toBe(4);
    expect(workload.slots.map((slot) => slot.cpuDemandMHz)).toEqual([200, 200, 400]);
    expect(workload.slots.map((slot) => slot.vmSampleCount)).toEqual([2, 1, 2]);
    expect(workload.timeline).toMatchObject({ max: 400 });
    expect(workload.timeline.average).toBeCloseTo((200 + 200 + 400) / 3, 6);
  });

  it("führt die Streuung über VMs, nicht über die Zeit", () => {
    const importMeta = makeImport(2);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100, 300], { readyP95: 2 }),
        makeProfile("vm-b", timestamps, [700, 900], { readyP95: 9 }),
      ],
      scopedVmCount: 2,
    })!;

    expect(workload.demandPerVm).toMatchObject({ count: 2, min: 200, max: 800, average: 500 });
    expect(workload.readyP95PerVm).toMatchObject({ count: 2, min: 2, max: 9 });
  });

  it("faltet die Stunden auf Wochentag × Stunde und behält Lücken als null", () => {
    const importMeta = makeImport(26);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    // Montag 00:00 = 100 MHz, Dienstag 00:00 = 300 MHz, alles andere ohne Messwert.
    const values = timestamps.map((_, index) => (index === 0 ? 100 : index === 24 ? 300 : null));
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, values)],
      scopedVmCount: 1,
    })!;

    expect(workload.weekGrid).toHaveLength(7 * 24);
    expect(cell(workload.weekGrid, 0, 0)).toMatchObject({ cpuDemandMHz: 100, slotCount: 1 });
    expect(cell(workload.weekGrid, 1, 0)).toMatchObject({ cpuDemandMHz: 300, slotCount: 1 });
    expect(cell(workload.weekGrid, 3, 12)).toMatchObject({ cpuDemandMHz: null, slotCount: 0 });
  });

  it("markiert die laufende Stunde am jüngsten passenden Slot", () => {
    const importMeta = makeImport(24 * 14); // zwei Wochen
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, timestamps.map(() => 100))],
      scopedVmCount: 1,
      // Mittwoch, 24.01.2024 10:30 Ortszeit – Wochentag 2, Stunde 10.
      now: new Date(Date.UTC(2024, 0, 24, 9, 30, 0)),
    })!;

    expect(workload.now).toEqual({ weekdayIndex: 2, hour: 10 });
    const marked = workload.slots[workload.nowSlotIndex!];
    expect(marked).toMatchObject({ weekdayIndex: 2, hour: 10 });
    // Die zweite Woche muss gewinnen: Mi 10:00 des zweiten Durchlaufs liegt bei Index 24 * 9 + 10.
    expect(workload.nowSlotIndex).toBe(24 * 9 + 10);
  });

  it("mittelt die konfigurierte CPU-Kapazität nur über VMs mit bekannter Hostfrequenz", () => {
    const importMeta = makeImport(2);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100, 200], { configuredCpuCapacityMHz: 4_000 }),
        makeProfile("vm-b", timestamps, [100, 200], { configuredCpuCapacityMHz: 8_000 }),
        makeProfile("vm-c", timestamps, [100, 200], { configuredCpuCapacityMHz: null }),
      ],
      scopedVmCount: 3,
    })!;

    expect(workload.configuredCpuCapacityMHz).toBe(6_000);
  });

  it("lässt die Bezugsgröße offen, wenn keine VM eine Hostfrequenz hat", () => {
    const importMeta = makeImport(2);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, [100, 200], { configuredCpuCapacityMHz: null })],
      scopedVmCount: 1,
    })!;

    expect(workload.configuredCpuCapacityMHz).toBeNull();
  });

  it("liefert keinen Marker, wenn der Import die laufende Stunde nicht enthält", () => {
    const importMeta = makeImport(6); // Montag 00:00–05:00
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const workload = buildAverageVmWorkload({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, timestamps.map(() => 100))],
      scopedVmCount: 1,
      now: new Date(Date.UTC(2024, 0, 24, 9, 30, 0)),
    })!;

    expect(workload.nowSlotIndex).toBeNull();
    expect(workload.now).toEqual({ weekdayIndex: 2, hour: 10 });
  });
});

describe("resolveWeekSlot", () => {
  it("rechnet UTC in die Zeitzone des Imports um", () => {
    // 2024-01-07 23:30 UTC ist in Wien bereits Montag 00:30.
    expect(resolveWeekSlot("Europe/Vienna", new Date(Date.UTC(2024, 0, 7, 23, 30, 0)))).toEqual({ weekdayIndex: 0, hour: 0 });
    // Sommerzeit: +2 Stunden Versatz.
    expect(resolveWeekSlot("Europe/Vienna", new Date(Date.UTC(2024, 6, 7, 23, 30, 0)))).toEqual({ weekdayIndex: 0, hour: 1 });
  });
});

function cell(grid: { weekdayIndex: number; hour: number }[], weekdayIndex: number, hour: number) {
  return grid.find((entry) => entry.weekdayIndex === weekdayIndex && entry.hour === hour);
}

function makeImport(expectedSlots: number): VropsTimeSeriesImport {
  return {
    id: "ts-1",
    importedAt: "2024-01-08T00:00:00.000Z",
    timezone: "Europe/Vienna",
    intervalMinutes: 60,
    rangeStartUtc: MONDAY_MIDNIGHT_UTC,
    rangeEndUtc: MONDAY_MIDNIGHT_UTC + expectedSlots * HOUR_MS,
    expectedSlots,
    rvtoolsSnapshotIds: ["snap-1"],
    files: [],
    fileSetChecksum: "checksum",
    schemaVersion: 1,
    validationStatus: "schema-valid",
    qualitySummary: { objectCountByType: { vm: 1, cluster: 0, host: 0 }, expectedSlots, errorCount: 0, warningCount: 0, missingValueCount: 0 },
  };
}

function makeProfile(
  vmName: string,
  timestamps: readonly number[],
  demand: readonly (number | null)[],
  options: { readyP95?: number | null; configuredCpuCapacityMHz?: number | null } = {},
): VmWorkloadProfile {
  const finite = demand.filter((value): value is number => value !== null);
  return {
    objectKey: vmName,
    rvtoolsObjectKey: vmName,
    vmName,
    clusterKey: null,
    clusterName: null,
    hostKey: null,
    host: null,
    vcpu: 4,
    configuredCpuCapacityMHz: options.configuredCpuCapacityMHz === undefined ? 4_000 : options.configuredCpuCapacityMHz,
    configuredMemoryMiB: 8_192,
    powerState: "poweredOn",
    workloadClass: "std",
    hourly: timestamps.map((timestampUtc, index): VmWorkloadHourlyPoint => ({
      timestampUtc,
      cpuDemandMHz: demand[index] ?? null,
      cpuReadyPct: null,
    })),
    demand: {
      expectedSlots: timestamps.length,
      sampleCount: finite.length,
      coverageRatio: timestamps.length > 0 ? finite.length / timestamps.length : 0,
      average: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
      p50: null,
      p95: null,
      maximum: finite.length ? Math.max(...finite) : null,
    },
    ready: {
      expectedSlots: timestamps.length,
      sampleCount: options.readyP95 === undefined || options.readyP95 === null ? 0 : timestamps.length,
      coverageRatio: options.readyP95 === undefined || options.readyP95 === null ? 0 : 1,
      average: null,
      p50: null,
      p95: options.readyP95 ?? null,
      maximum: null,
    },
    shape: "constant",
    intensity: "low",
    behaviorClass: "constant-load",
    confidence: "high",
    signals: {
      coefficientOfVariation: null,
      activeHourSharePct: null,
      dutyCyclePct: null,
      baselineRatio: null,
      utilizationP95Pct: null,
      dailyRepeatability: null,
      businessHoursConcentration: null,
      nightConcentration: null,
      weekendConcentration: null,
    },
  };
}
