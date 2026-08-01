import { describe, expect, it } from "vitest";
import type { VmWorkloadHourlyPoint, VmWorkloadProfile, VropsTimeSeriesImport } from "@/domain/models/types";
import { capacitySignalsFixture, classificationSignalsFixture, metricStatsFixture, vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";
import { buildAverageVmInsights, DISTRIBUTION_MIN_VMS_FOR_BOX } from "./averageVmInsightsService";
import { buildHourGrid } from "./vmWorkloadProfileService";

const HOUR_MS = 60 * 60 * 1000;
/** 2024-01-07 23:00 UTC = Montag, 08.01.2024 00:00 in Europe/Vienna. */
const MONDAY_MIDNIGHT_UTC = Date.UTC(2024, 0, 7, 23, 0, 0);

describe("buildAverageVmInsights", () => {
  it("gibt null zurück, wenn kein Profil im Filter liegt", () => {
    expect(buildAverageVmInsights({ import: makeImport(24), profiles: [], scopedVmCount: 12 })).toBeNull();
  });

  it("bildet je Stunde die Quantile über die VMs statt eines Mittelwerts", () => {
    const importMeta = makeImport(1);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    // Eine schiefe Stunde: drei ruhige VMs, eine sehr aktive. Der Mittelwert liegt bei
    // 2.575 MHz und damit über allen ruhigen VMs – genau der Fall, den der Median trennt.
    const insights = buildAverageVmInsights({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100]),
        makeProfile("vm-b", timestamps, [200]),
        makeProfile("vm-c", timestamps, [300]),
        makeProfile("vm-d", timestamps, [9_700]),
      ],
      scopedVmCount: 4,
    })!;

    const slot = insights.bands[0];
    expect(slot.vmSampleCount).toBe(4);
    expect(slot.p25).toBe(100);
    expect(slot.p50).toBe(200);
    expect(slot.p75).toBe(300);
    expect(slot.p95).toBe(9_700);
    expect(slot.mean).toBeCloseTo(2_575, 6);
  });

  it("hält Datenlücken als null, statt sie als Nulllast zu zählen", () => {
    const importMeta = makeImport(3);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const insights = buildAverageVmInsights({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100, null, 300]),
        makeProfile("vm-b", timestamps, [300, null, 500]),
      ],
      scopedVmCount: 2,
    })!;

    expect(insights.bands.map((slot) => slot.p50)).toEqual([100, null, 300]);
    expect(insights.bands.map((slot) => slot.vmSampleCount)).toEqual([2, 0, 2]);
  });

  it("führt die drei Zeitaggregate als getrennte Streuungen über die VMs", () => {
    const importMeta = makeImport(2);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const insights = buildAverageVmInsights({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100, 300], { demandP95: 280, demandMaxP99: 900 }),
        makeProfile("vm-b", timestamps, [700, 900], { demandP95: 880, demandMaxP99: 2_400 }),
      ],
      scopedVmCount: 2,
    })!;

    expect(insights.demandAvgPerVm.stats).toMatchObject({ count: 2, min: 200, max: 800 });
    expect(insights.demandP95PerVm.stats).toMatchObject({ count: 2, min: 280, max: 880 });
    expect(insights.demandPeakPerVm.stats).toMatchObject({ count: 2, min: 900, max: 2_400 });
  });

  it("liefert unter fünfzehn VMs die Einzelwerte, darüber nur die Verteilung", () => {
    const importMeta = makeImport(1);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const small = buildAverageVmInsights({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, [100]), makeProfile("vm-b", timestamps, [300])],
      scopedVmCount: 2,
    })!;
    expect(small.demandAvgPerVm.samples).toEqual([100, 300]);

    const large = buildAverageVmInsights({
      import: importMeta,
      profiles: Array.from({ length: DISTRIBUTION_MIN_VMS_FOR_BOX }, (_, index) =>
        makeProfile(`vm-${index}`, timestamps, [100 + index]),
      ),
      scopedVmCount: DISTRIBUTION_MIN_VMS_FOR_BOX,
    })!;
    expect(large.demandAvgPerVm.samples).toBeNull();
    expect(large.demandAvgPerVm.stats).toMatchObject({ count: DISTRIBUTION_MIN_VMS_FOR_BOX });
  });

  describe("Lastkonzentration", () => {
    it("zählt, wie viele der aktivsten VMs die Hälfte des Demands tragen", () => {
      const importMeta = makeImport(1);
      const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
      // 600 von 1.000 MHz entfallen auf eine einzige VM.
      const insights = buildAverageVmInsights({
        import: importMeta,
        profiles: [
          makeProfile("vm-a", timestamps, [600]),
          makeProfile("vm-b", timestamps, [200]),
          makeProfile("vm-c", timestamps, [100]),
          makeProfile("vm-d", timestamps, [100]),
        ],
        scopedVmCount: 4,
      })!;

      expect(insights.concentration).toMatchObject({ vmsForHalfOfDemand: 1 });
      expect(insights.concentration!.topVmSharePct).toBeCloseTo(60, 6);
    });

    it("meldet bei gleichmäßiger Last die halbe Flotte", () => {
      const importMeta = makeImport(1);
      const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
      const insights = buildAverageVmInsights({
        import: importMeta,
        profiles: Array.from({ length: 4 }, (_, index) => makeProfile(`vm-${index}`, timestamps, [500])),
        scopedVmCount: 4,
      })!;

      expect(insights.concentration).toMatchObject({ vmsForHalfOfDemand: 2 });
    });
  });

  describe("Auffälligkeiten", () => {
    it("zählt niedrige Auslastung, Kapazitätsnähe und Ready getrennt", () => {
      const importMeta = makeImport(1);
      const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
      const insights = buildAverageVmInsights({
        import: importMeta,
        profiles: [
          makeProfile("vm-idle", timestamps, [100], { utilizationP95Pct: 4 }),
          makeProfile("vm-busy", timestamps, [100], { utilizationP95Pct: 60, hoursAboveCapacity90: 12 }),
          makeProfile("vm-ready", timestamps, [100], { utilizationP95Pct: 30, readyP95: 7 }),
        ],
        scopedVmCount: 3,
      })!;

      expect(insights.findings).toEqual({
        lowUtilizationCount: 1,
        nearCapacityCount: 1,
        readyAlertCount: 1,
        ratedCount: 3,
      });
    });

    it("lässt VMs ohne Auslastungsangabe aus dem Nenner", () => {
      const importMeta = makeImport(1);
      const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
      const insights = buildAverageVmInsights({
        import: importMeta,
        profiles: [
          makeProfile("vm-a", timestamps, [100], { utilizationP95Pct: 4 }),
          makeProfile("vm-b", timestamps, [100], { utilizationP95Pct: null }),
        ],
        scopedVmCount: 2,
      })!;

      expect(insights.findings).toMatchObject({ lowUtilizationCount: 1, ratedCount: 1 });
    });
  });

  it("markiert die laufende Stunde am jüngsten passenden Slot", () => {
    const importMeta = makeImport(24 * 14);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const insights = buildAverageVmInsights({
      import: importMeta,
      profiles: [makeProfile("vm-a", timestamps, timestamps.map(() => 100))],
      scopedVmCount: 1,
      // Mittwoch, 24.01.2024 10:30 Ortszeit – Wochentag 2, Stunde 10.
      now: new Date(Date.UTC(2024, 0, 24, 9, 30, 0)),
    })!;

    expect(insights.now).toEqual({ weekdayIndex: 2, hour: 10 });
    expect(insights.nowSlotIndex).toBe(24 * 9 + 10);
  });

  it("mittelt die Bezugskapazität nur über VMs mit bekannter Hostfrequenz", () => {
    const importMeta = makeImport(1);
    const timestamps = buildHourGrid(importMeta).map((entry) => entry.timestampUtc);
    const insights = buildAverageVmInsights({
      import: importMeta,
      profiles: [
        makeProfile("vm-a", timestamps, [100], { configuredCpuCapacityMHz: 4_000 }),
        makeProfile("vm-b", timestamps, [100], { configuredCpuCapacityMHz: 8_000 }),
        makeProfile("vm-c", timestamps, [100], { configuredCpuCapacityMHz: null }),
      ],
      scopedVmCount: 3,
    })!;

    expect(insights.configuredCpuCapacityMHz).toBe(6_000);
  });
});

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

interface ProfileOptions {
  demandP95?: number | null;
  demandMaxP99?: number | null;
  readyP95?: number | null;
  configuredCpuCapacityMHz?: number | null;
  utilizationP95Pct?: number | null;
  hoursAboveCapacity90?: number | null;
}

function makeProfile(
  vmName: string,
  timestamps: readonly number[],
  demand: readonly (number | null)[],
  options: ProfileOptions = {},
): VmWorkloadProfile {
  const finite = demand.filter((value): value is number => value !== null);
  return vmWorkloadProfileFixture({
    objectKey: vmName,
    rvtoolsObjectKey: vmName,
    vmName,
    configuredCpuCapacityMHz: options.configuredCpuCapacityMHz === undefined ? 4_000 : options.configuredCpuCapacityMHz,
    hourly: timestamps.map((timestampUtc, index): VmWorkloadHourlyPoint => ({
      timestampUtc,
      cpuDemandMHz: demand[index] ?? null,
      cpuDemandMaxMHz: null,
      cpuReadyPct: null,
    })),
    demand: metricStatsFixture({
      expectedSlots: timestamps.length,
      sampleCount: finite.length,
      coverageRatio: timestamps.length > 0 ? finite.length / timestamps.length : 0,
      average: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
      p95: options.demandP95 ?? null,
      maximum: finite.length ? Math.max(...finite) : null,
    }),
    demandMax: metricStatsFixture({ p99: options.demandMaxP99 ?? null }),
    ready: metricStatsFixture({ p95: options.readyP95 ?? null }),
    capacitySignals: capacitySignalsFixture({ hoursAboveCapacity90: options.hoursAboveCapacity90 ?? null }),
    signals: classificationSignalsFixture({ utilizationP95Pct: options.utilizationP95Pct ?? null }),
  });
}
