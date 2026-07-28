import { describe, expect, it } from "vitest";
import type { CapacityPolicy, FillUpClusterRecommendationRankInput, FillUpHost, FillUpHour, FillUpVm, FillUpWorkloadProfile } from "@/domain/models/types";
import { createInitialCapacityPolicies } from "./capacityPolicyService";
import { analyzeFillUpCapacity, type FillUpCapacityEngineInput } from "./fillUpCapacityEngine";
import { calculateFillUpRecommendations, rankFillUpClusterRecommendations, resolveCpuDemandMHz } from "./fillUpRecommendationEngine";

const policy = (): CapacityPolicy => ({
  ...createInitialCapacityPolicies("2026-07-28T00:00:00.000Z").find((entry) => entry.id === "standard-server-windows")!,
  cpuSafetyBufferPct: 0,
  ramSafetyBufferPct: 0,
  ramSystemReserveMiBPerHost: 0,
});

function host(hostKey: string, siteId: string): FillUpHost {
  return { hostKey, name: hostKey, siteId, cpuCores: 10, fallbackCpuCapacityMHz: 1_000, fallbackMemoryCapacityMiB: 1_000 };
}

function hour(hosts: readonly FillUpHost[]): FillUpHour {
  return {
    timestampUtc: 1,
    hostCapacities: Object.fromEntries(hosts.map((entry) => [entry.hostKey, { cpuCapacityMHz: 1_000, memoryCapacityMiB: 1_000 }])),
    clusterCpuDemandMHz: 100,
    clusterMemoryUtilizationMiB: 100,
    clusterCpuContentionPct: 0,
    vmCpuDemandMHzByVm: { "vm:existing": 100 },
    vmCpuReadyPctByVm: { "vm:existing": 0 },
  };
}

function capacityAnalysis(overrides: Partial<FillUpCapacityEngineInput> = {}) {
  const hosts = overrides.hosts ?? [host("h1", "site-a"), host("h2", "site-b")];
  const vms: readonly FillUpVm[] = overrides.vms ?? [{ objectKey: "vm:existing", hostKey: "h1", workloadClass: "high", powerState: "poweredOn", vcpu: 2, configuredMemoryMiB: 100, fallbackCpuDemandMHz: 100 }];
  return analyzeFillUpCapacity({
    policy: overrides.policy ?? policy(),
    hosts,
    vms,
    hours: overrides.hours ?? [hour(hosts)],
    confidence: "high",
    includeN2: false,
  });
}

const highProfile: FillUpWorkloadProfile = { id: "high-small", name: "HIGH klein", workloadClass: "high", vcpu: 4, memoryMiB: 100, cpuDemandP95MHz: 100 };
const stdProfile: FillUpWorkloadProfile = { id: "std-small", name: "STD klein", workloadClass: "std", vcpu: 2, memoryMiB: 100, cpuDemandP95MHz: 50 };

describe("calculateFillUpRecommendations", () => {
  it("liefert unabhängige vCPU-, Demand- und RAM-Headrooms und begrenzt Profile am kleinsten Guardrail", () => {
    const result = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis(),
      profiles: [highProfile, stdProfile],
      workloadMix: { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct: 50 },
    });

    expect(result.independentHeadroom.vcpu).toMatchObject({ value: 28, unit: "vCPU", limitingScenarioId: "n1:h1" });
    expect(result.independentHeadroom.cpuDemand).toMatchObject({ value: 700, unit: "MHz" });
    expect(result.independentHeadroom.memory).toMatchObject({ value: 800, unit: "MiB" });
    expect(result.profileRecommendations.find((entry) => entry.profile.id === highProfile.id)).toMatchObject({ maxAdditionalVms: 4, limitingGuardrail: { metricKey: "high-ram-assigned" } });
    expect(result.profileRecommendations.find((entry) => entry.profile.id === stdProfile.id)).toMatchObject({ maxAdditionalVms: 8, limitingGuardrail: { metricKey: "total-ram-assigned" } });
    expect(result.workloadMixRecommendation).toMatchObject({ maxAdditionalVms: 8, highVmCount: 4, stdVmCount: 4, relativeN1LossPct: expect.closeTo(52.941, 2) });
  });

  it("rundet den HIGH-Anteil konservativ auf, damit ein Site-Guardrail nie überzogen wird", () => {
    const constrainedPolicy = { ...policy(), highRamAssignedDangerPct: 20 };
    const result = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis({ policy: constrainedPolicy }),
      profiles: [highProfile, stdProfile],
      workloadMix: { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct: 33 },
    });

    expect(result.workloadMixRecommendation).toMatchObject({ maxAdditionalVms: 3, highVmCount: 1, stdVmCount: 2, limitingGuardrail: { metricKey: "high-ram-assigned" } });
  });

  it("fordert ein explizites positives Demand-je-vCPU-Profil statt freie vCPUs zu überinterpretieren", () => {
    const result = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis(),
      profiles: [{ ...highProfile, id: "invalid", cpuDemandP95MHz: 0 }],
    });

    expect(result.profileRecommendations).toEqual([]);
    expect(result.warnings).toContainEqual(expect.stringContaining("Ungültiges"));
  });

  it("gibt bei roter Ausgangslage keine zusätzliche VM frei", () => {
    const redPolicy = { ...policy(), cpuDemandDangerPctN1: 5, requireHighSiteFailover: false };
    const result = calculateFillUpRecommendations({ capacityAnalysis: capacityAnalysis({ policy: redPolicy }), profiles: [stdProfile] });

    expect(result.profileRecommendations[0]).toMatchObject({ maxAdditionalVms: 0, normalOnlyMaxAdditionalVms: 0 });
    expect(result.warnings).toContainEqual(expect.stringContaining("bereits rot"));
  });
});

describe("CPU-Gleichzeitigkeitsfaktor", () => {
  /** CPU-limitiertes Profil: 1 vCPU und 1 MiB lassen ausschließlich den Demand begrenzen. */
  const cpuBound: FillUpWorkloadProfile = { id: "cpu-bound", name: "CPU-gebunden", workloadClass: "std", vcpu: 1, memoryMiB: 1, cpuDemandP95MHz: 100, cpuDemandAverageMHz: 20 };

  function maximumAt(concurrencyPct: number | undefined, profile = cpuBound) {
    return calculateFillUpRecommendations({ capacityAnalysis: capacityAnalysis(), profiles: [profile], cpuDemandConcurrencyPct: concurrencyPct }).profileRecommendations[0];
  }

  it("interpoliert den angesetzten CPU-Demand linear zwischen Durchschnitt und P95", () => {
    expect(resolveCpuDemandMHz(cpuBound, 100)).toBe(100);
    expect(resolveCpuDemandMHz(cpuBound, 50)).toBe(60);
    expect(resolveCpuDemandMHz(cpuBound, 0)).toBe(20);
  });

  it("übersetzt den Faktor in mehr zulässige VMs, sobald der CPU-Demand begrenzt", () => {
    // 700 MHz Demand-Headroom, danach begrenzen 28 freie vCPU die Menge.
    expect(maximumAt(100)).toMatchObject({ maxAdditionalVms: 7, appliedCpuDemandMHz: 100, limitingGuardrail: { metricKey: "cpu-demand" } });
    expect(maximumAt(50)).toMatchObject({ maxAdditionalVms: 11, appliedCpuDemandMHz: 60 });
    expect(maximumAt(0)).toMatchObject({ maxAdditionalVms: 28, appliedCpuDemandMHz: 20, limitingGuardrail: { metricKey: "vcpu-per-core" } });
  });

  it("weist neben dem Ergebnis immer den reinen P95-Vergleichswert aus", () => {
    expect(maximumAt(0)).toMatchObject({ maxAdditionalVms: 28, peakOnlyMaxAdditionalVms: 7 });
    expect(maximumAt(100)).toMatchObject({ maxAdditionalVms: 7, peakOnlyMaxAdditionalVms: 7 });
  });

  it("rechnet ohne gesetzten Faktor und ohne Durchschnitt unverändert mit dem P95", () => {
    expect(maximumAt(undefined)).toMatchObject({ maxAdditionalVms: 7, appliedCpuDemandMHz: 100 });
    expect(maximumAt(0, { ...cpuBound, cpuDemandAverageMHz: null })).toMatchObject({ maxAdditionalVms: 7, appliedCpuDemandMHz: 100 });
  });

  it("verwirft einen Durchschnitt über dem P95 und warnt, statt die Planung zu beschönigen", () => {
    const result = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis(),
      profiles: [{ ...cpuBound, cpuDemandAverageMHz: 500 }],
      cpuDemandConcurrencyPct: 0,
    });

    expect(result.profileRecommendations[0]).toMatchObject({ maxAdditionalVms: 7, appliedCpuDemandMHz: 100 });
    expect(result.profileRecommendations[0].profile.cpuDemandAverageMHz).toBeNull();
    expect(result.warnings).toContainEqual(expect.stringContaining("CPU-Durchschnitt"));
  });

  it("fällt bei einem Faktor außerhalb von 0 bis 100 Prozent auf den P95-Ansatz zurück", () => {
    const result = calculateFillUpRecommendations({ capacityAnalysis: capacityAnalysis(), profiles: [cpuBound], cpuDemandConcurrencyPct: 140 });

    expect(result.profileRecommendations[0]).toMatchObject({ maxAdditionalVms: 7, appliedCpuDemandMHz: 100 });
    expect(result.warnings).toContainEqual(expect.stringContaining("Gleichzeitigkeitsfaktor"));
  });

  it("wirkt auch dann, wenn der HIGH-Site-Failover die engste Guardrail ist", () => {
    const highCpuBound: FillUpWorkloadProfile = { ...cpuBound, id: "high-cpu-bound", name: "HIGH CPU-gebunden", workloadClass: "high" };
    // 20 % von 1.000 MHz Restkapazität minus 100 MHz HIGH-Demand lassen 100 MHz am Standort-Failover übrig.
    const sitePolicy = { ...policy(), highCpuSiteDangerPct: 20 };
    const at = (concurrencyPct: number) => calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis({ policy: sitePolicy }),
      profiles: [highCpuBound],
      cpuDemandConcurrencyPct: concurrencyPct,
    }).profileRecommendations[0];

    expect(at(100)).toMatchObject({ maxAdditionalVms: 1, limitingGuardrail: { metricKey: "high-cpu-site" } });
    expect(at(0)).toMatchObject({ maxAdditionalVms: 5, peakOnlyMaxAdditionalVms: 1, limitingGuardrail: { metricKey: "high-cpu-site" } });
  });

  it("gewichtet den angesetzten Demand im gemeinsamen Mix nach dem HIGH-Anteil", () => {
    const high: FillUpWorkloadProfile = { ...cpuBound, id: "mix-high", name: "Mix HIGH", workloadClass: "high", cpuDemandP95MHz: 200, cpuDemandAverageMHz: 100 };
    const result = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis(),
      profiles: [high, cpuBound],
      workloadMix: { highProfileId: high.id, stdProfileId: cpuBound.id, highSharePct: 50 },
      cpuDemandConcurrencyPct: 50,
    });

    // HIGH 100 + 0,5 × 100 = 150, STD 20 + 0,5 × 80 = 60, davon je die Hälfte.
    expect(result.workloadMixRecommendation!.appliedCpuDemandPerVmMHz).toBeCloseTo(105, 6);
    expect(result.workloadMixRecommendation!.peakOnlyMaxAdditionalVms!).toBeLessThan(result.workloadMixRecommendation!.maxAdditionalVms!);
  });
});

describe("rankFillUpClusterRecommendations", () => {
  it("bevorzugt bei gleicher Zusatzmenge den geringeren relativen N-1-Verlust", () => {
    const base = calculateFillUpRecommendations({
      capacityAnalysis: capacityAnalysis(),
      profiles: [highProfile, stdProfile],
      workloadMix: { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct: 50 },
    }).workloadMixRecommendation!;
    const candidates: FillUpClusterRecommendationRankInput[] = [
      { clusterKey: "smaller", clusterName: "Kleiner", recommendation: { ...base, maxAdditionalVms: 8, relativeN1LossPct: 60 } },
      { clusterKey: "larger", clusterName: "Größer", recommendation: { ...base, maxAdditionalVms: 8, relativeN1LossPct: 40 } },
      { clusterKey: "more", clusterName: "Mehr", recommendation: { ...base, maxAdditionalVms: 9, relativeN1LossPct: 70 } },
    ];

    expect(rankFillUpClusterRecommendations(candidates).map((entry) => entry.clusterKey)).toEqual(["more", "larger", "smaller"]);
  });
});
