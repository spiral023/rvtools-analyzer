import { describe, expect, it } from "vitest";
import type { CapacityPolicy, FillUpClusterRecommendationRankInput, FillUpHost, FillUpHour, FillUpVm, FillUpWorkloadProfile } from "@/domain/models/types";
import { createInitialCapacityPolicies } from "./capacityPolicyService";
import { analyzeFillUpCapacity, type FillUpCapacityEngineInput } from "./fillUpCapacityEngine";
import { calculateFillUpRecommendations, rankFillUpClusterRecommendations } from "./fillUpRecommendationEngine";

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
