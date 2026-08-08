import { describe, expect, it } from "vitest";
import type { NormalizedHost, VmWorkloadProfile, VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { capacitySignalsFixture, classificationSignalsFixture, metricStatsFixture, vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";
import { buildVmRightsizingCandidates, filterRightsizingCandidatesBySearch, filterRightsizingCandidatesByVmScope, isComputableRightsizingCandidate, isNotableRightsizingCandidate, summarizeReclaimableVcpuByBehaviorClass, summarizeReclaimableVcpuByCluster } from "./vmRightsizingService";

function metricStats(overrides: Partial<VmWorkloadProfileMetricStats>): VmWorkloadProfileMetricStats {
  return metricStatsFixture(overrides);
}

function profile(overrides: Partial<VmWorkloadProfile> & { objectKey: string }): VmWorkloadProfile {
  return vmWorkloadProfileFixture(overrides);
}

const hosts: NormalizedHost[] = [{
  snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: "esx01", cluster: "Cluster A", datacenter: null,
  cpuModel: null, cpuTotalMHz: 20_000, cpuCores: 20, cpuThreads: 40, memoryTotalMiB: null, version: null, build: null,
  vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
}];

describe("buildVmRightsizingCandidates", () => {
  it("leitet mhzPerCore, genutztes vCPU-Äquivalent und rückgewinnbare vCPU ab", () => {
    // Host: 20 GHz / 20 Cores = 1000 MHz/Core. P95-Demand 2000 MHz => 2 genutzte vCPU-Äquivalente.
    // Bedarfsgerecht sind ceil(2 / 0.65) = 3, aufgerundet auf gerade 4 vCPU – also 4 vCPU
    // rückgewinnbar.
    const candidates = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 8, demand: metricStats({ p95: 2_000 }) })],
      hosts,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ mhzPerCore: 1_000, usedVcpuEquivalentP95: 2, demandBasedVcpu: 4, recommendedVcpu: 4, reclaimableVcpu: 4 });
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
  it("führt immer auf eine gerade Zielgröße, auch von ungerader Ausgangszahl aus", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-8", vcpu: 8, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-12", vcpu: 12, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-16", vcpu: 16, demand: metricStats({ p95: 200 }) }),
        // Ungerade konfigurierte Größe: das Ziel bleibt trotzdem gerade.
        profile({ objectKey: "vm-9", vcpu: 9, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-3", vcpu: 3, demand: metricStats({ p95: 200 }) }),
      ],
      hosts,
    });

    for (const candidate of candidates) {
      expect(candidate.recommendedVcpu! % 2).toBe(0);
      // Empfehlung und Rückgabe ergeben zusammen immer die konfigurierte Anzahl.
      expect(candidate.recommendedVcpu! + candidate.reclaimableVcpu!).toBe(candidate.vcpu);
    }
  });

  it("weist die vollständige Rückgabe bis zur empfohlenen Zielgröße aus", () => {
    // „Rückgewinnbar“ ist die Planungszahl und nennt den ganzen Betrag. Solange eine
    // Schrittgrenze darin steckte, verdeckte sie am gemessenen Bestand knapp die Hälfte
    // des Potenzials und traf ausgerechnet die breiten VMs.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 10 }) })],
      hosts,
    });
    expect(candidate.demandBasedVcpu).toBe(2);
    expect(candidate.reclaimableVcpu).toBe(14);
    expect(candidate.recommendedVcpu).toBe(2);
  });

  it("empfiehlt auch unter acht konfigurierten vCPU die volle Zielgröße", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-4", vcpu: 4, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-6", vcpu: 6, demand: metricStats({ p95: 200 }) }),
        profile({ objectKey: "vm-7", vcpu: 7, demand: metricStats({ p95: 200 }) }),
      ],
      hosts,
    });

    for (const candidate of candidates) {
      expect(candidate.recommendationWithheldReason).toBeNull();
      expect(candidate.recommendedVcpu).toBe(2);
      expect(candidate.reclaimableVcpu).toBe(candidate.vcpu! - 2);
    }
  });

  it("bleibt bei 0, wenn schon der bedarfsgerechte Zielwert kein Paar freigibt", () => {
    // 4 vCPU bei 1,8 genutzten vCPU-Äquivalenten: bedarfsgerecht sind bereits 4 vCPU,
    // es bleibt also nichts zurückzugewinnen.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-4", vcpu: 4, demand: metricStats({ p95: 1_800 }) })],
      hosts,
    });
    expect(candidate.demandBasedVcpu).toBe(4);
    expect(candidate.reclaimableVcpu).toBe(0);
    expect(candidate.recommendedVcpu).toBe(4);
  });

  it("hält die Empfehlung bei niedriger Datenqualität zurück, weist den Bedarf aber aus", () => {
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 10 }), confidence: "low" })],
      hosts,
    });
    expect(candidate.recommendationWithheldReason).toBe("low-confidence");
    expect(candidate.reclaimableVcpu).toBe(0);
    expect(candidate.recommendedVcpu).toBe(16);
    // Die bedarfsgerechte Zielgröße bleibt sichtbar, damit die Planung sie beurteilen kann.
    expect(candidate.demandBasedVcpu).toBe(2);
  });

  it("sperrt eine Verkleinerung bei steigender CPU-Tendenz", () => {
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-growing",
        vcpu: 16,
        demand: metricStats({ p95: 500 }),
        cpuTrend: { direction: "strongly-rising", days: 31, slopePerDay: 50, projectedChange: 1_500, relativeChangePct: 80, capacityChangePct: 10, rSquared: 0.9, firstWeekMedian: 500, lastWeekMedian: 1_800 },
      })],
      hosts,
    });
    expect(candidate.recommendationWithheldReason).toBe("rising-trend");
    expect(candidate.flags.risingTrend).toBe(true);
    expect(candidate.reclaimableVcpu).toBe(0);
  });

  it("hält die Empfehlung bei Mustern ohne reproduzierbaren Verlauf zurück", () => {
    const withheld = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-irregular", vcpu: 16, demand: metricStats({ p95: 10 }), shape: "irregular" }),
        profile({ objectKey: "vm-unclassified", vcpu: 16, demand: metricStats({ p95: 10 }), shape: "unclassified" }),
      ],
      hosts,
    });
    for (const candidate of withheld) {
      expect(candidate.recommendationWithheldReason).toBe("unreliable-shape");
      expect(candidate.reclaimableVcpu).toBe(0);
    }

    // Wochenendlast bleibt empfehlungsfähig: das Fenster liegt im Beobachtungszeitraum.
    const [weekend] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-weekend", vcpu: 16, demand: metricStats({ p95: 10 }), shape: "weekend" })],
      hosts,
    });
    expect(weekend.recommendationWithheldReason).toBeNull();
    expect(weekend.reclaimableVcpu).toBe(14);
  });

  it("gibt bursty erst frei, wenn sich die Spitze wochenweise wiederholt", () => {
    // 48 % der bursty-VMs wiederholen ihren Wochenverlauf; für sie ist die Spitze planbar
    // und eine Verkleinerung vertretbar. Für den Rest bleibt sie es nicht.
    const [notRepeatable] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-bursty-random",
        vcpu: 16,
        demand: metricStats({ p95: 10 }),
        shape: "bursty",
        signals: classificationSignalsFixture({ weeklyRepeatability: 0.2, weeklyPeakVariation: 0.9 }),
      })],
      hosts,
    });
    expect(notRepeatable.recommendationWithheldReason).toBe("burst-not-repeatable");
    expect(notRepeatable.reclaimableVcpu).toBe(0);

    const [repeatable] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-bursty-planbar",
        vcpu: 16,
        demand: metricStats({ p95: 10 }),
        shape: "bursty",
        signals: classificationSignalsFixture({ weeklyRepeatability: 0.8, weeklyPeakVariation: 0.1 }),
      })],
      hosts,
    });
    expect(repeatable.recommendationWithheldReason).toBeNull();
    expect(repeatable.reclaimableVcpu).toBe(14);

    // Ohne gemessene Wochensignale – etwa bei einem Sieben-Tage-Import – bleibt es bei
    // der Zurückhaltung, statt eine Wiederholbarkeit zu unterstellen.
    const [withoutSignals] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-bursty-7d", vcpu: 16, demand: metricStats({ p95: 10 }), shape: "bursty" })],
      hosts,
    });
    expect(withoutSignals.recommendationWithheldReason).toBe("burst-not-repeatable");
  });

  it("erkennt zu klein konfigurierte VMs, statt die Zielgröße auf die Ist-Größe zu deckeln", () => {
    // 3.400 MHz P95 bei 1.000 MHz je vCPU sind 3,4 vCPU; bei 65 % Zielauslastung
    // braucht die VM 6 vCPU, konfiguriert sind 4. Der frühere Math.min-Deckel hätte
    // daraus stumm „4“ gemacht und die Unterdimensionierung unsichtbar gelassen.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-klein",
        vcpu: 4,
        demand: metricStats({ p95: 3_400 }),
        capacitySignals: capacitySignalsFixture({ totalCapacityMHz: 4_000, configuredVcpu: 4, mhzPerVcpu: 1_000, hoursAboveCapacity75: 40 }),
      })],
      hosts,
    });
    expect(candidate.demandBasedVcpu).toBe(6);
    expect(candidate.additionalVcpu).toBe(2);
    expect(candidate.recommendedVcpu).toBe(6);
    expect(candidate.reclaimableVcpu).toBe(0);
    expect(candidate.recommendationWithheldReason).toBeNull();
    expect(candidate.flags.sustainedNearCapacity).toBe(true);
  });

  it("schlägt keine Vergrößerung vor, die nur an einer einzelnen Spitze hängt", () => {
    // Gleiche Bedarfsrechnung, aber ohne anhaltende Kapazitätsnähe: Das Monatsmaximum
    // von demandMax ist ein 20-Sekunden-Wert und träfe sonst 27,6 % des Bestands.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-spitze",
        vcpu: 4,
        demand: metricStats({ p95: 3_400 }),
        capacitySignals: capacitySignalsFixture({ totalCapacityMHz: 4_000, configuredVcpu: 4, mhzPerVcpu: 1_000, hoursAboveCapacity75: 3 }),
      })],
      hosts,
    });
    expect(candidate.demandBasedVcpu).toBe(6);
    expect(candidate.additionalVcpu).toBe(0);
    expect(candidate.recommendedVcpu).toBe(4);
    expect(candidate.recommendationWithheldReason).toBe("peak-only");
  });

  it("rechnet mit der je VM gemessenen Kapazität statt mit der Hostfrequenz", () => {
    // Der Host liefert 1.000 MHz je Kern, vROps meldet für diese VM 2.000 MHz je vCPU –
    // so sieht eine VM aus, die im Messzeitraum in eine andere Taktklasse migriert ist.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-migriert",
        vcpu: 8,
        demand: metricStats({ p95: 2_600 }),
        capacitySignals: capacitySignalsFixture({ totalCapacityMHz: 16_000, configuredVcpu: 8, mhzPerVcpu: 2_000 }),
      })],
      hosts,
      level: "balanced",
    });
    expect(candidate.mhzPerCore).toBe(1_000);
    expect(candidate.mhzPerVcpu).toBe(2_000);
    expect(candidate.usedVcpuEquivalentP95).toBe(1.3);
    expect(candidate.demandBasedVcpu).toBe(2);
  });

  it("nutzt den P99 des Demand-Maximums als Peak-Pfad, nicht dessen Monatsmaximum", () => {
    // Stufe „Ausgewogen“, weil nur sie den P99 als Peak-Statistik verwendet.
    // P95 von 1.000 MHz verlangt für sich 2 vCPU. Der P99 innerhalb der Stunde liegt bei
    // 5.400 MHz und hebt die Zielgröße über 5,4 / 0,9 = 6 vCPU; das einmalige
    // Monatsmaximum von 20.000 MHz bliebe mit 22 vCPU weit darüber und bleibt außen vor.
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-spitzenlast",
        vcpu: 16,
        demand: metricStats({ p95: 1_000, maximum: 1_200 }),
        demandMax: metricStats({ p95: 3_000, p99: 5_400, maximum: 20_000 }),
      })],
      hosts,
      level: "balanced",
    });
    expect(candidate.usedVcpuEquivalentPeak).toBe(5.4);
    expect(candidate.demandBasedVcpu).toBe(6);
  });

  it("wendet die vier globalen Stufen als geschlossene Kombinationen an", () => {
    const workload = profile({
      objectKey: "vm-stufen",
      vcpu: 20,
      demand: metricStats({ p95: 1_000 }),
      demandMax: metricStats({ p95: 4_500, p99: 7_200, p995: 9_000, maximum: 12_000 }),
    });
    const target = (level: "very-conservative" | "conservative" | "balanced" | "offensive") =>
      buildVmRightsizingCandidates({ profiles: [workload], hosts, level })[0];

    expect(target("very-conservative")).toMatchObject({ rightsizingLevel: "very-conservative", demandBasedVcpu: 16 });
    expect(target("conservative")).toMatchObject({ rightsizingLevel: "conservative", demandBasedVcpu: 12 });
    expect(target("balanced")).toMatchObject({ rightsizingLevel: "balanced", demandBasedVcpu: 8 });
    expect(target("offensive")).toMatchObject({ rightsizingLevel: "offensive", demandBasedVcpu: 6 });
  });

  it("markiert Co-Stop unter Last und Lastkonzentration auf wenige Kerne", () => {
    const [candidate] = buildVmRightsizingCandidates({
      profiles: [profile({
        objectKey: "vm-breit",
        vcpu: 24,
        demand: metricStats({ p95: 1_000 }),
        capacitySignals: capacitySignalsFixture({
          totalCapacityMHz: 24_000, configuredVcpu: 24, mhzPerVcpu: 1_000,
          costopUnderLoadP95Pct: 9.6, loadHourCount: 120, concentrationIndexP90: 0.52, effectiveCoresMax: 5.1,
        }),
      })],
      hosts,
    });
    expect(candidate.flags.costopUnderLoad).toBe(true);
    expect(candidate.flags.concentratedOnFewCores).toBe(true);
    expect(isNotableRightsizingCandidate(candidate)).toBe(true);
  });

  it("markiert den Einzelkern-Engpass ab 24 Stunden als eigenständiges Argument", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-23h", capacitySignals: capacitySignalsFixture({ singleCoreBoundHours: 23 }), demand: metricStats({ p95: 1_300 }) }),
        profile({ objectKey: "vm-24h", capacitySignals: capacitySignalsFixture({ singleCoreBoundHours: 24 }), demand: metricStats({ p95: 1_300 }) }),
      ],
      hosts,
    });
    expect(candidates.find((candidate) => candidate.objectKey === "vm-23h")?.flags.singleCoreBound).toBe(false);
    const flagged = candidates.find((candidate) => candidate.objectKey === "vm-24h")!;
    expect(flagged.flags.singleCoreBound).toBe(true);
    expect(isNotableRightsizingCandidate(flagged)).toBe(true);
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
      level: "balanced",
    });
    const [withoutPeak] = buildVmRightsizingCandidates({
      profiles: [profile({ objectKey: "vm-1", vcpu: 16, demand: metricStats({ p95: 1_000 }) })],
      hosts,
      level: "balanced",
    });

    expect(withPeak.usedVcpuEquivalentPeak).toBe(12);
    expect(withPeak.demandBasedVcpu).toBe(14);
    expect(withPeak.reclaimableVcpu).toBe(2);
    // Ohne bekanntes Maximum bleibt nur der P95.
    expect(withoutPeak.demandBasedVcpu).toBe(2);
    expect(withoutPeak.reclaimableVcpu).toBe(14);
  });
});

describe("isNotableRightsizingCandidate", () => {
  it("ist unauffällig ohne Flags und ohne rückgewinnbare Kapazität", () => {
    const [candidate] = buildVmRightsizingCandidates({ profiles: [profile({ objectKey: "vm-1", vcpu: 2, demand: metricStats({ p95: 1_300 }) })], hosts });
    expect(candidate.reclaimableVcpu).toBe(0);
    expect(isNotableRightsizingCandidate(candidate)).toBe(false);
  });
});

describe("Rightsizing-Scope und Berechenbarkeit", () => {
  it("übernimmt den globalen VM-Scope über den eindeutigen RVTools-Schlüssel", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vrops-app", rvtoolsObjectKey: "rv-app", vmName: "APP-01" }),
        profile({ objectKey: "vrops-db", rvtoolsObjectKey: "rv-db", vmName: "DB-01" }),
      ],
      hosts,
    });

    const scoped = filterRightsizingCandidatesByVmScope(candidates, [
      { vmKey: "rv-db", vmName: "DB-01" },
    ]);

    expect(scoped.map((candidate) => candidate.vmName)).toEqual(["DB-01"]);
  });

  it("trennt nicht berechenbare Lastmuster und unbekannte Niveaus vom Vergleich", () => {
    const candidates = buildVmRightsizingCandidates({
      profiles: [
        profile({ objectKey: "vm-computable" }),
        profile({ objectKey: "vm-unclassified", shape: "unclassified" }),
        profile({ objectKey: "vm-unknown-intensity", intensity: "unknown" }),
      ],
      hosts,
    });

    expect(candidates.filter(isComputableRightsizingCandidate).map((candidate) => candidate.objectKey)).toEqual(["vm-computable"]);
    expect(candidates.filter((candidate) => !isComputableRightsizingCandidate(candidate)).map((candidate) => candidate.objectKey)).toEqual(["vm-unclassified", "vm-unknown-intensity"]);
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
    expect(byCluster[0]).toMatchObject({ vmCount: 1, totalVcpu: 8, reclaimableVcpuPercent: 75 });
    expect(byCluster[0].reclaimableVcpu).toBeGreaterThan(byCluster[1].reclaimableVcpu);

    const byBehavior = summarizeReclaimableVcpuByBehaviorClass(candidates);
    expect(byBehavior.map((entry) => entry.label)).toEqual(["Gering genutzt", "Dauerlast"]);
  });
});

describe("filterRightsizingCandidatesBySearch", () => {
  const candidates = buildVmRightsizingCandidates({
    profiles: [
      profile({ objectKey: "APP01", vmName: "APP01", clusterKey: "cluster-1", clusterName: "Cluster A", vcpu: 8, demand: metricStats({ p95: 500 }) }),
      profile({ objectKey: "DB01", vmName: "DB01", clusterKey: "cluster-2", clusterName: "Cluster B", vcpu: 4, demand: metricStats({ p95: 2_000 }) }),
    ],
    hosts,
  });
  const techInfoIndex = new Map([
    ["app01", { sysv: "Müller, Anna", sysvDepartment: "RAITEC/IN-VIA" }],
    ["db01", { sysv: null, sysvDepartment: "RAITEC/BS-DBA" }],
  ]);
  const names = (query: string) => filterRightsizingCandidatesBySearch(candidates, query, techInfoIndex).map((entry) => entry.vmName);

  it("filtert nach VM-Name, Cluster und Systemverantwortlicher", () => {
    expect(names("app")).toEqual(["APP01"]);
    expect(names("cluster b")).toEqual(["DB01"]);
    expect(names("müller")).toEqual(["APP01"]);
    expect(names("cluster")).toHaveLength(2);
  });

  it("filtert über die Abteilung aus der Tech-Info", () => {
    expect(names("in-via")).toEqual(["APP01"]);
    // Auch ohne benannte Person bleibt die Abteilung suchbar.
    expect(names("dba")).toEqual(["DB01"]);
    // Der gemeinsame Organisationsanteil trifft beide.
    expect(names("raitec")).toHaveLength(2);
  });

  it("liefert ohne Suchbegriff den vollständigen Bestand", () => {
    expect(filterRightsizingCandidatesBySearch(candidates, "", techInfoIndex)).toHaveLength(candidates.length);
  });

  it("greift nicht auf Felder zu, die nicht durchsucht werden sollen", () => {
    // „Dauerlast“ ist das Label des Lastmusters – bewusst kein Suchtreffer.
    expect(filterRightsizingCandidatesBySearch(candidates, "dauerlast", techInfoIndex)).toHaveLength(0);
  });
});
