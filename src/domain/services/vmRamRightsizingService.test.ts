import { describe, expect, it } from "vitest";
import type { NormalizedVm, VmWorkloadHourlyPoint, VmWorkloadProfile } from "@/domain/models/types";
import { vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";
import {
  DEFAULT_RAM_RIGHTSIZING_POLICY,
  buildVmRamRightsizingCandidates,
  calculateVmMemoryWorkloadStats,
  deriveRamDemand,
  evaluateRamWorkloadConfidence,
  filterRamRightsizingCandidatesBySearch,
  summarizeRamRightsizingByCluster,
  summarizeRamRightsizingByDirection,
} from "@/domain/services/vmRamRightsizingService";

const TEST_POLICY = {
  ...DEFAULT_RAM_RIGHTSIZING_POLICY,
  minimumCoverageRatio: 0,
  minimumSampleCount: 1,
};

function hourlyPoints(avgValues: readonly (number | null | undefined)[], maxValues?: readonly (number | null | undefined)[]): VmWorkloadHourlyPoint[] {
  return avgValues.map((memoryWorkloadAvgPct, index): VmWorkloadHourlyPoint => ({
    timestampUtc: index * 60 * 60 * 1000,
    cpuDemandMHz: null,
    cpuDemandMaxMHz: null,
    cpuReadyPct: null,
    memoryWorkloadAvgPct,
    ...(maxValues ? { memoryWorkloadMaxPct: maxValues[index] } : {}),
  }));
}

function profileFixture(
  objectKey: string,
  avgValues: readonly (number | null | undefined)[],
  maxValues?: readonly (number | null | undefined)[],
  overrides: Partial<VmWorkloadProfile> = {},
): VmWorkloadProfile {
  return vmWorkloadProfileFixture({
    objectKey,
    vmName: objectKey.toUpperCase(),
    configuredMemoryMiB: 8_192,
    hourly: hourlyPoints(avgValues, maxValues),
    ...overrides,
  });
}

function vmFixture(vmKey: string, overrides: Partial<NormalizedVm> = {}): NormalizedVm {
  return {
    snapshotId: "snapshot-1",
    vcenterId: "vcenter-1",
    vmKey,
    vmUuid: null,
    vmName: vmKey.toUpperCase(),
    cluster: "Cluster A",
    host: "esx01",
    powerState: "poweredOn",
    cpuCount: 4,
    memoryMiB: 8_192,
    provisionedMiB: null,
    inUseMiB: null,
    configStatus: null,
    connectionState: null,
    consolidationNeeded: null,
    osConfig: null,
    osTools: null,
    hwVersion: null,
    toolsStatus: null,
    toolsVersion: null,
    datacenter: null,
    folder: null,
    resourcePool: null,
    annotation: null,
    cpuReady: null,
    firmware: null,
    efiSecureBoot: null,
    cbt: null,
    ...overrides,
  };
}

describe("VM-RAM-Workload-Statistik", () => {
  it("ignoriert fehlende Werte statt sie als 0 zu zählen und berechnet Coverage", () => {
    const stats = calculateVmMemoryWorkloadStats([10, null, 30, undefined, Number.NaN, 20], 6);

    expect(stats.expectedHours).toBe(6);
    expect(stats.presentHours).toBe(3);
    expect(stats.missingHours).toBe(3);
    expect(stats.coverageRatio).toBe(0.5);
    expect(stats.average).toBe(20);
    expect(stats.p50).toBe(20);
    expect(stats.p95).toBe(30);
    expect(stats.p99).toBe(30);
    expect(stats.p995).toBe(30);
    expect(stats.maximum).toBe(30);
  });

  it("bewertet leere oder zu lückenhafte Reihen nicht als belastbar", () => {
    expect(evaluateRamWorkloadConfidence({ presentHours: 0, coverageRatio: 0 }, TEST_POLICY)).toBe("not-computable");
    expect(evaluateRamWorkloadConfidence({ presentHours: 1, coverageRatio: 0.25 }, { ...TEST_POLICY, minimumCoverageRatio: 0.5 })).toBe("low");
  });
});

describe("VM-RAM-Bedarfsableitung", () => {
  it("rechnet Prozentpunkte in MiB um und behält Werte über 100 %", () => {
    const avg = calculateVmMemoryWorkloadStats([42.5]);
    const max = calculateVmMemoryWorkloadStats([125.5]);
    const result = deriveRamDemand(8_192, avg, max, TEST_POLICY);

    expect(result.normalDemandRequirementMiB).toBeCloseTo(3_481.6, 5);
    expect(result.peakRequirementMiB).toBeCloseTo(10_280.96, 5);
    expect(result.requiredMemoryMiB).toBeCloseTo(10_280.96, 5);
    expect(result.targetMemoryBeforeRoundingMiB).toBeCloseTo(11_423.2889, 4);
    expect(result.recommendedMemoryMiB).toBe(12_288);
  });

  it("rundet das Ziel auf und unterschreitet den berechneten Bedarf nicht", () => {
    const avg = calculateVmMemoryWorkloadStats([42.5]);
    const result = deriveRamDemand(8_192, avg, null, TEST_POLICY);

    expect(result.targetMemoryBeforeRoundingMiB).toBeCloseTo(3_868.4444, 4);
    expect(result.recommendedMemoryMiB).toBe(4_096);
    expect(result.recommendedMemoryMiB).toBeGreaterThanOrEqual(result.requiredMemoryMiB ?? 0);
  });
});

describe("VM-RAM-Rightsizing-Kandidaten", () => {
  it("erzeugt keine Empfehlung ohne Avg-Reihe", () => {
    const [candidate] = buildVmRamRightsizingCandidates({
      profiles: [profileFixture("vm-01", [null, undefined, Number.NaN])],
      expectedSlots: 3,
      policy: TEST_POLICY,
    });

    expect(candidate.direction).toBe("not-computable");
    expect(candidate.workloadAvg.presentHours).toBe(0);
    expect(candidate.recommendedMemoryMiB).toBeNull();
    expect(candidate.recommendationReason).toMatch(/keine verwertbaren/i);
  });

  it("verwendet Avg auch ohne Max, markiert das Peak-Signal aber als nicht vorhanden", () => {
    const [candidate] = buildVmRamRightsizingCandidates({
      profiles: [profileFixture("vm-01", Array(24).fill(50))],
      hasMemoryWorkloadMax: false,
      policy: TEST_POLICY,
    });

    expect(candidate.workloadMax).toBeNull();
    expect(candidate.peakRequirementMiB).toBeNull();
    expect(candidate.peakSignalUsed).toBe(false);
    expect(candidate.recommendedMemoryMiB).toBe(5_120);
    expect(candidate.direction).toBe("shrink");
  });

  it("bewertet einen vorhandenen, aber unvollständigen Max-Import als nicht berechenbar", () => {
    const [candidate] = buildVmRamRightsizingCandidates({
      profiles: [profileFixture("vm-01", Array(24).fill(50), [60, null, ...Array(22).fill(null)])],
      hasMemoryWorkloadMax: true,
      policy: { ...TEST_POLICY, minimumCoverageRatio: 0.5 },
    });

    expect(candidate.workloadAvg.presentHours).toBe(24);
    expect(candidate.workloadMax?.presentHours).toBe(1);
    expect(candidate.direction).toBe("not-computable");
    expect(candidate.recommendationReason).toMatch(/Max-Reihe/i);
  });

  it.each([
    { label: "Verkleinerung", avg: 50, max: 60, expectedDirection: "shrink" as const },
    { label: "Vergrößerung", avg: 110, max: 125, expectedDirection: "grow" as const },
    { label: "unveränderte Größe", avg: 90, max: 90, expectedDirection: "unchanged" as const },
  ])("ermittelt die Richtung: $label", ({ avg, max, expectedDirection }) => {
    const [candidate] = buildVmRamRightsizingCandidates({
      profiles: [profileFixture("vm-01", Array(24).fill(avg), Array(24).fill(max))],
      hasMemoryWorkloadMax: true,
      policy: TEST_POLICY,
    });

    expect(candidate.direction).toBe(expectedDirection);
    expect(candidate.workloadAvg.p95).toBe(avg);
    expect(candidate.workloadMax?.p995).toBe(max);
  });

  it("zeigt VMs ohne Profil separat als nicht berechenbar und verwendet kein 0%-Fallback", () => {
    const [matched, unmatched] = buildVmRamRightsizingCandidates({
      profiles: [profileFixture("vm-01", Array(24).fill(50))],
      vms: [vmFixture("vm-01"), vmFixture("vm-02", { vmName: "ORPHAN-02" })],
      expectedSlots: 24,
      policy: TEST_POLICY,
    });

    expect(matched.vmName).toBe("VM-01");
    expect(unmatched.vmName).toBe("ORPHAN-02");
    expect(unmatched.direction).toBe("not-computable");
    expect(unmatched.workloadAvg.average).toBeNull();
    expect(unmatched.recommendationReason).toMatch(/keine zugeordnete/i);
  });
});

describe("VM-RAM-Suche und Summen", () => {
  it("filtert über VM, Cluster und Tech-Info und fasst Richtungen zusammen", () => {
    const candidates = buildVmRamRightsizingCandidates({
      profiles: [
        profileFixture("app-01", Array(24).fill(50), undefined, { vmName: "APP-01", clusterName: "Cluster A" }),
        profileFixture("db-01", Array(24).fill(110), undefined, { vmName: "DB-01", clusterKey: "cluster-2", clusterName: "Cluster B" }),
      ],
      policy: TEST_POLICY,
    });
    const techInfo = new Map([
      ["app-01", { sysv: "Alice Admin", sysvDepartment: "IT/Apps" }],
    ]);

    expect(filterRamRightsizingCandidatesBySearch(candidates, "alice", techInfo).map((candidate) => candidate.vmName)).toEqual(["APP-01"]);
    expect(filterRamRightsizingCandidatesBySearch(candidates, "cluster b").map((candidate) => candidate.vmName)).toEqual(["DB-01"]);

    const directionSummary = summarizeRamRightsizingByDirection(candidates);
    expect(directionSummary.find((summary) => summary.key === "shrink")?.vmCount).toBe(1);
    expect(directionSummary.find((summary) => summary.key === "grow")?.vmCount).toBe(1);
    expect(summarizeRamRightsizingByCluster(candidates)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "cluster-1", vmCount: 1 }),
    ]));
  });
});
