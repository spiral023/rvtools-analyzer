import { describe, expect, it } from "vitest";
import type { NormalizedHost, VmWorkloadProfile, VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { buildVmRightsizingCandidates, isNotableRightsizingCandidate, summarizeReclaimableVcpuByBehaviorClass, summarizeReclaimableVcpuByCluster } from "./vmRightsizingService";

function metricStats(overrides: Partial<VmWorkloadProfileMetricStats>): VmWorkloadProfileMetricStats {
  return { expectedSlots: 168, sampleCount: 168, coverageRatio: 1, average: null, p50: null, p95: null, maximum: null, ...overrides };
}

function profile(overrides: Partial<VmWorkloadProfile> & { objectKey: string }): VmWorkloadProfile {
  return {
    rvtoolsObjectKey: overrides.objectKey,
    vmName: overrides.objectKey,
    clusterKey: "cluster-1",
    clusterName: "Cluster A",
    hostKey: "host-1",
    host: "esx01",
    vcpu: 4,
    configuredMemoryMiB: 8_192,
    powerState: "poweredOn",
    workloadClass: "std",
    hourly: [],
    demand: metricStats({}),
    ready: metricStats({}),
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    signals: { coefficientOfVariation: null, activeHourSharePct: null, dutyCyclePct: null, baselineRatio: null, utilizationP95Pct: null, dailyRepeatability: null, businessHoursConcentration: null, nightConcentration: null, weekendConcentration: null },
    ...overrides,
  };
}

const hosts: NormalizedHost[] = [{
  snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: "esx01", cluster: "Cluster A", datacenter: null,
  cpuModel: null, cpuTotalMHz: 20_000, cpuCores: 20, cpuThreads: 40, memoryTotalMiB: null, version: null, build: null,
  vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
}];

describe("buildVmRightsizingCandidates", () => {
  it("leitet mhzPerCore, genutztes vCPU-Äquivalent und rückgewinnbare vCPU ab", () => {
    // Host: 20 GHz / 20 Cores = 1000 MHz/Core. P95-Demand 2000 MHz => 2 genutzte vCPU-Äquivalente.
    // Bedarf aus P95 wäre 2 / 0.65 = 3.08, hier begrenzt die Halbierungsgrenze auf 4 vCPU.
    const candidates = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 8, demand: metricStats({ p95: 2_000 }) })],
      hosts,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ mhzPerCore: 1_000, usedVcpuEquivalentP95: 2, recommendedVcpu: 4, reclaimableVcpu: 4 });
    expect(candidates[0].flags.manyVcpuLowDemand).toBe(true);
  });

  it("markiert hohe CPU Ready unabhängig vom vCPU-Bedarf", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 2, demand: metricStats({ p95: 900 }), ready: metricStats({ p95: 8 }) })],
      hosts,
    });
    expect(candidates[0].flags.highCpuReady).toBe(true);
    expect(candidates[0].flags.manyVcpuLowDemand).toBe(false);
  });

  it("überspringt VMs ohne konfigurierte vCPU und liefert null ohne passenden Host", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-no-vcpu", vcpu: null }),
        profile({ objectKey: "vm-no-host", hostKey: "unknown-host" }),
      ],
      hosts,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ objectKey: "vm-no-host", mhzPerCore: null, recommendedVcpu: null, reclaimableVcpu: null });
  });

  it("sortiert absteigend nach rückgewinnbarer vCPU-Kapazität", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-small-gain", vcpu: 4, demand: metricStats({ p95: 1_800 }) }),
        profile({ objectKey: "vm-big-gain", vcpu: 8, demand: metricStats({ p95: 500 }) }),
      ],
      hosts,
    });
    expect(candidates.map((candidate) => candidate.objectKey)).toEqual(["vm-big-gain", "vm-small-gain"]);
  });
});

describe("buildVmRightsizingCandidates – Zurückhaltung der Empfehlung", () => {
  it("gibt vCPU ausschließlich in geraden Schritten zurück", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-8", vcpu: 8, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-12", vcpu: 12, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-16", vcpu: 16, demand: metricStats({ p95: 200 }) }),
        // Ungerade konfigurierte Größe: die Rückgabe bleibt trotzdem gerade.
        profile({ objectKey: "vm-9", vcpu: 9, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-3", vcpu: 3, demand: metricStats({ p95: 200 }) }),
      ],
      hosts,
    });

    for (const candidate of candidates) {
      expect(candidate.reclaimableVcpu! % 2).toBe(0);
      // Empfehlung und Rückgabe ergeben zusammen immer die konfigurierte Anzahl.
      expect(candidate.recommendedVcpu! + candidate.reclaimableVcpu!).toBe(candidate.vcpu);
    }
  });

  it("gibt nie mehr als die Hälfte der konfigurierten vCPU auf einmal zurück", () => {
    // Bedarf nahe null: ohne Begrenzung wären 15 der 16 vCPU rückgewinnbar.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 10 }) })],
      hosts,
    });
    expect(candidate.reclaimableVcpu).toBe(8);
    expect(candidate.recommendedVcpu).toBe(8);
  });

  it("empfiehlt nie unter zwei vCPU", () => {
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 2, demand: metricStats({ p95: 10 }) })],
      hosts,
    });
    expect(candidate.recommendedVcpu).toBe(2);
    expect(candidate.reclaimableVcpu).toBe(0);
  });

  it("berücksichtigt das beobachtete Maximum, nicht nur den P95", () => {
    // P95 stündlicher Mittelwerte verbirgt kurze Spitzen. 12.000 MHz Maximum entsprechen
    // 12 vCPU-Äquivalenten, bei 90 % Zielauslastung also mindestens 14 empfohlene vCPU.
    const [withPeak] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 1_000, maximum: 12_000 }) })],
      hosts,
    });
    const [withoutPeak] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 1_000 }) })],
      hosts,
    });

    expect(withPeak.usedVcpuEquivalentPeak).toBe(12);
    expect(withPeak.reclaimableVcpu).toBe(2);
    // Ohne bekanntes Maximum begrenzt allein die Halbierungsgrenze.
    expect(withoutPeak.reclaimableVcpu).toBe(8);
  });
});

describe("isNotableRightsizingCandidate", () => {
  it("ist unauffällig ohne Flags und ohne rückgewinnbare Kapazität", () => {
    const [candidate] = buildVmRightsizingCandidates({ profiles: [profile({ objectKey: "vm-1", vcpu: 2, demand: metricStats({ p95: 1_300 }) })], hosts });
    expect(candidate.reclaimableVcpu).toBe(0);
    expect(isNotableRightsizingCandidate(candidate)).toBe(false);
  });
});

describe("summarizeReclaimableVcpuByCluster / summarizeReclaimableVcpuByBehaviorClass", () => {
  it("summiert je Cluster bzw. Verhaltensklasse", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-1", clusterKey: "cluster-1", clusterName: "Cluster A", vcpu: 8, demand: metricStats({ p95: 500 }), behaviorClass: "low-utilization" }),
        profile({ objectKey: "vm-2", clusterKey: "cluster-2", clusterName: "Cluster B", vcpu: 4, demand: metricStats({ p95: 2_000 }), behaviorClass: "constant-load" }),
      ],
      hosts,
    });

    const byCluster = summarizeReclaimableVcpuByCluster(candidates);
    expect(byCluster.map((entry) => entry.label)).toEqual(["Cluster A", "Cluster B"]);
    expect(byCluster[0]).toMatchObject({ vmCount: 1, totalVcpu: 8 });
    expect(byCluster[0].reclaimableVcpu).toBeGreaterThan(byCluster[1].reclaimableVcpu);

    const byBehavior = summarizeReclaimableVcpuByBehaviorClass(candidates);
    expect(byBehavior.map((entry) => entry.label)).toEqual(["Gering genutzt", "Dauerlast"]);
  });
});
