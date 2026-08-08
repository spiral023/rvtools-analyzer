import { describe, expect, it } from "vitest";
import type { VropsTimeSeriesChunk, VropsTimeSeriesImport, VropsTimeSeriesImportedObject, VropsTimeSeriesMetricKey, NormalizedVm, VmWorkloadProfile } from "@/domain/models/types";
import { buildHourGrid, buildVmWorkloadProfiles, classifyVmBehavior, determineProfileConfidence, filterVmWorkloadProfilesBySearch } from "./vmWorkloadProfileService";

describe("buildHourGrid", () => {
  it("berechnet Lokalzeit-Stunde und Wochenendflag in Europe/Vienna", () => {
    // 2024-01-05 23:00 UTC = 2024-01-06 00:00 CET (Samstag).
    const rangeStartUtc = Date.UTC(2024, 0, 5, 23, 0, 0);
    const importMeta = makeImport({ rangeStartUtc, expectedSlots: 72 });
    const grid = buildHourGrid(importMeta);

    expect(grid).toHaveLength(72);
    expect(grid[0]).toMatchObject({ hour: 0, isWeekend: true }); // Samstag 00:00
    expect(grid[24]).toMatchObject({ hour: 0, isWeekend: true }); // Sonntag 00:00
    expect(grid[48]).toMatchObject({ hour: 0, isWeekend: false }); // Montag 00:00
    expect(grid[48 + 10]).toMatchObject({ hour: 10, isWeekend: false }); // Montag 10:00
  });
});

describe("classifyVmBehavior", () => {
  it("liefert „unclassified“ ohne jeden Messwert", () => {
    const grid = buildSyntheticWeek();
    const result = classifyVmBehavior(grid, new Map());
    expect(result.behaviorClass).toBe("unclassified");
    expect(result.signals.coefficientOfVariation).toBeNull();
  });

  it("liefert „unclassified“ bei zu geringer Datenabdeckung", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.slice(0, 20).map((entry) => [entry.timestampUtc, 1_000]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("unclassified");
  });

  it("erkennt gering genutzte VMs robust über den P95", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, index) => [entry.timestampUtc, index === 0 ? 2_000 : 20]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("low-utilization");
  });

  it("berücksichtigt die konfigurierte CPU-Kapazität bei geringer Nutzung", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, 500]));
    const result = classifyVmBehavior(grid, demand, { configuredCpuCapacityMHz: 10_000 });
    expect(result.behaviorClass).toBe("low-utilization");
    expect(result.signals.utilizationP95Pct).toBe(5);
  });

  it("erkennt eine konstante Dauerlast", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, index) => [entry.timestampUtc, 1000 + (index % 2 === 0 ? 10 : -10)]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("constant-load");
  });

  it("erkennt bursty VMs mit seltenen, aber deutlichen Spitzen", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, index) => [entry.timestampUtc, index % 20 === 0 ? 5_000 : 5]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("bursty");
  });

  it("erkennt Business-Hours-Lasten", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour >= 6 && entry.hour < 17 ? 3_000 : 200]));
    const result = classifyVmBehavior(grid, demand);
    expect(result.behaviorClass).toBe("business-hours");
    expect(result.signals.businessHoursConcentration ?? 0).toBeGreaterThan(1);
  });

  it("erkennt nächtlichen Batch", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour < 6 ? 3_000 : 200]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("night-batch");
  });

  it("erkennt regelmäßig wiederkehrende Abend-Batches ab 20 Uhr", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour >= 21 && entry.hour < 23 ? 4_000 : 100]));
    expect(classifyVmBehavior(grid, demand).shape).toBe("night-batch");
  });

  it("stuft breite Hochlastphasen nicht als bursty ein", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, index) => [entry.timestampUtc, index < 100 ? 4_000 : 50]));
    const result = classifyVmBehavior(grid, demand);
    expect(result.shape).not.toBe("bursty");
    expect(result.signals.recentPeakRunP90Hours ?? 0).toBeGreaterThan(6);
  });

  it("erkennt Wochenendlast", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, entry.isWeekend ? 3_000 : 200]));
    expect(classifyVmBehavior(grid, demand).behaviorClass).toBe("weekend-load");
  });

  it("ordnet wiederkehrende Mischlast als variable Last ein", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, entry.hour % 2 === 0 ? 300 : 1_500]));
    const result = classifyVmBehavior(grid, demand);
    expect(result.behaviorClass).toBe("variable-load");
    expect(result.signals.dailyRepeatability ?? 0).toBeGreaterThan(0.9);
  });

  it("verwendet „irregular“ nur für schlecht wiederholbare Tagesprofile", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, index) => [entry.timestampUtc, 200 + ((index * 73) % 19) * 200]));
    const result = classifyVmBehavior(grid, demand);
    expect(result.behaviorClass).toBe("irregular");
    expect(result.signals.dailyRepeatability ?? 1).toBeLessThan(0.3);
  });
});

describe("classifyVmBehavior – Trennung von Muster und Niveau", () => {
  /**
   * Der Kern des zweiachsigen Modells: früher überschrieb ein niedriges Niveau das
   * Muster ersatzlos. Eine schwach ausgelastete VM mit klarem Tagesrhythmus – etwa ein
   * sparsamer Nachtjob – muss ihr Muster behalten.
   */
  it("behält das Business-Hours-Muster trotz niedriger Auslastung", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour >= 6 && entry.hour < 17 ? 3_000 : 200]));
    const result = classifyVmBehavior(grid, demand, { configuredCpuCapacityMHz: 100_000 });

    expect(result.shape).toBe("business-hours");
    expect(result.intensity).toBe("very-low");
    // Die abgeleitete Einzelklasse verhält sich weiterhin wie früher.
    expect(result.behaviorClass).toBe("low-utilization");
  });

  it("behält das nächtliche Batch-Muster trotz niedriger Auslastung", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour < 6 ? 3_000 : 200]));
    const result = classifyVmBehavior(grid, demand, { configuredCpuCapacityMHz: 100_000 });

    expect(result.shape).toBe("night-batch");
    expect(result.behaviorClass).toBe("low-utilization");
  });

  /**
   * Grundlast mit zusätzlichem Lastfenster war einmal ein eigenes Mischmuster. Mit dem
   * produktiven `constantLoadCvMax = 0,2` lief es leer: Eine Business-Hours-Konzentration
   * von 1,35 setzt voraus, dass rund 30 % der Stunden deutlich über dem Rest liegen, was
   * den Variationskoeffizienten über 0,2 hebt. Solche Verläufe gehören deshalb in den
   * Kalenderpfad; unterhalb der Streuungsschwelle bleibt es reine Dauerlast.
   */
  it("ordnet Grundlast mit Lastfenster dem Kalenderfenster zu und trennt sie von reiner Dauerlast", () => {
    const grid = buildSyntheticWeek();
    // Grundlast 1.000 MHz, während der Geschäftszeiten 1.800 MHz: Konzentration 1,43 bei
    // einem Variationskoeffizienten von 0,30.
    const withPeak = new Map(grid.map((entry) => [entry.timestampUtc, !entry.isWeekend && entry.hour >= 6 && entry.hour < 17 ? 1_800 : 1_000]));
    const result = classifyVmBehavior(grid, withPeak, { configuredCpuCapacityMHz: 10_000 });

    expect(result.signals.coefficientOfVariation ?? 0).toBeGreaterThan(0.2);
    expect(result.signals.businessHoursConcentration ?? 0).toBeGreaterThanOrEqual(1.35);
    expect(result.shape).toBe("business-hours");

    // Ein klarer Kalenderbezug bleibt auch bei einer großzügigeren Dauerlast-Schwelle
    // erhalten: das Zeitfenster beschreibt die Reihe genauer als nur ihre Streuung.
    const lenient = classifyVmBehavior(grid, withPeak, { configuredCpuCapacityMHz: 10_000, thresholds: { constantLoadCvMax: 0.5 } });
    expect(lenient.shape).toBe("business-hours");
    expect(lenient.behaviorClass).toBe("business-hours");

    // Ohne Lastfenster bleibt es reine Dauerlast.
    const flat = new Map(grid.map((entry) => [entry.timestampUtc, 2_000]));
    expect(classifyVmBehavior(grid, flat, { configuredCpuCapacityMHz: 10_000 }).shape).toBe("constant");
  });

  it("erkennt ein schwaches, aber wiederholbares Business-Hours-Muster statt Dauerlast", () => {
    const grid = buildSyntheticWeek(4);
    const demand = new Map(grid.map((entry) => [
      entry.timestampUtc,
      !entry.isWeekend && entry.hour >= 6 && entry.hour < 17 ? 1_260 : 1_000,
    ]));
    const result = classifyVmBehavior(grid, demand, { configuredCpuCapacityMHz: 10_000 });

    expect(result.signals.coefficientOfVariation ?? 1).toBeLessThanOrEqual(0.2);
    expect(result.signals.businessHoursConcentration ?? 0).toBeGreaterThanOrEqual(1.15);
    expect(result.shape).toBe("business-hours");
  });

  it("lässt ein schwaches Kalenderfenster ohne Wiederholung als variable Last", () => {
    const grid = buildSyntheticWeek(4);
    const demand = new Map(grid.map((entry, index) => [
      entry.timestampUtc,
      !entry.isWeekend && entry.hour >= 6 && entry.hour < 17
        ? 1_600 + ((index * 97) % 17) * 70
        : 1_000 + ((index * 53) % 11) * 90,
    ]));
    const result = classifyVmBehavior(grid, demand, {
      configuredCpuCapacityMHz: 10_000,
      thresholds: { subtleCalendarRepeatabilityMin: 0.99 },
    });

    expect(result.signals.businessHoursConcentration ?? 0).toBeGreaterThan(1.15);
    expect(result.shape).not.toBe("business-hours");
  });

  it("stuft das Auslastungsniveau anhand des P95-Kapazitätsanteils ein", () => {
    const grid = buildSyntheticWeek();
    const intensityOf = (demandMHz: number) =>
      classifyVmBehavior(grid, new Map(grid.map((entry) => [entry.timestampUtc, demandMHz])), { configuredCpuCapacityMHz: 10_000 }).intensity;

    expect(intensityOf(100)).toBe("idle"); // 1 %
    expect(intensityOf(300)).toBe("very-low"); // 3 %
    expect(intensityOf(700)).toBe("low"); // 7 %
    expect(intensityOf(2_000)).toBe("moderate"); // 20 %
    expect(intensityOf(4_000)).toBe("elevated"); // 40 %
    expect(intensityOf(9_000)).toBe("high"); // 90 %
  });

  /**
   * Ohne Hostzuordnung ist kein Kapazitätsanteil berechenbar, dann greift allein der
   * absolute MHz-Schwellwert. In zwei aufeinanderfolgenden Live-Exporten kam dieser Fall
   * nicht vor (alle VMs hatten Kapazitätsangaben), deshalb hier gezielt abgedeckt.
   */
  it("stuft ohne bekannte Kapazität allein über den absoluten P95 als gering genutzt ein", () => {
    const grid = buildSyntheticWeek();
    const belowThreshold = new Map(grid.map((entry) => [entry.timestampUtc, 50]));
    const withoutCapacity = classifyVmBehavior(grid, belowThreshold);

    expect(withoutCapacity.signals.utilizationP95Pct).toBeNull();
    expect(withoutCapacity.intensity).toBe("unknown");
    expect(withoutCapacity.behaviorClass).toBe("low-utilization");
    // Das Muster bleibt trotzdem erkennbar – die Trennung der Achsen gilt auch hier.
    expect(withoutCapacity.shape).toBe("constant");

    // Oberhalb des absoluten Schwellwerts greift ohne Kapazität keine Low-Utilization-Regel.
    const aboveThreshold = new Map(grid.map((entry) => [entry.timestampUtc, 5_000]));
    expect(classifyVmBehavior(grid, aboveThreshold).behaviorClass).toBe("constant-load");
  });

  it("liefert „unknown“ als Niveau, solange die konfigurierte Kapazität fehlt", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry) => [entry.timestampUtc, 5_000]));
    const result = classifyVmBehavior(grid, demand);

    expect(result.intensity).toBe("unknown");
    expect(result.shape).toBe("constant");
  });

  it("berechnet Arbeitsstunden-Anteil und Grundlastanteil", () => {
    const grid = buildSyntheticWeek();
    // Konstant 600 MHz bei 10.000 MHz Kapazität: Schwelle 5 % = 500 MHz, alle Stunden darüber.
    const constant = classifyVmBehavior(grid, new Map(grid.map((entry) => [entry.timestampUtc, 600])), { configuredCpuCapacityMHz: 10_000 });
    expect(constant.signals.dutyCyclePct).toBe(100);
    expect(constant.signals.baselineRatio).toBe(1);

    // Ohne Kapazität ist der Arbeitsstunden-Anteil nicht berechenbar, der Grundlastanteil schon.
    const withoutCapacity = classifyVmBehavior(grid, new Map(grid.map((entry) => [entry.timestampUtc, 600])));
    expect(withoutCapacity.signals.dutyCyclePct).toBeNull();
    expect(withoutCapacity.signals.baselineRatio).toBe(1);
  });

  it("meldet Muster und Niveau als nicht berechenbar, wenn die Datenbasis fehlt", () => {
    const grid = buildSyntheticWeek();
    const result = classifyVmBehavior(grid, new Map());

    expect(result.shape).toBe("unclassified");
    expect(result.intensity).toBe("unknown");
    expect(result.behaviorClass).toBe("unclassified");
  });
});

describe("determineProfileConfidence", () => {
  it("ist nicht berechenbar ohne Messwerte", () => {
    expect(determineProfileConfidence(0, 0)).toBe("not-computable");
  });
  it("ist niedrig bei geringer Abdeckung oder wenigen Stunden", () => {
    expect(determineProfileConfidence(0.3, 50)).toBe("low");
    expect(determineProfileConfidence(0.95, 10)).toBe("low");
  });
  it("ist mittel bei mäßiger Abdeckung", () => {
    expect(determineProfileConfidence(0.7, 50)).toBe("medium");
  });
  it("ist hoch bei vollständiger Abdeckung über mehrere Tage", () => {
    expect(determineProfileConfidence(0.95, 160)).toBe("high");
  });
  it("senkt vollständige Reihen bei schwacher Mustergüte auf mittel", () => {
    const grid = buildSyntheticWeek();
    const classified = classifyVmBehavior(grid, new Map(grid.map((entry) => [entry.timestampUtc, entry.hour % 2 ? 1_000 : 300])));
    classified.signals.confidenceScore = 70;
    expect(determineProfileConfidence(1, 168, classified)).toBe("medium");
  });
});

describe("buildVmWorkloadProfiles", () => {
  it("verbindet Objekte, VMs und Zeitreihen zu sortierten Profilen", () => {
    const rangeStartUtc = Date.UTC(2024, 0, 8, 0, 0, 0);
    const importMeta = makeImport({ rangeStartUtc, expectedSlots: 4 });
    const objects: VropsTimeSeriesImportedObject[] = [
      makeVmObject({ objectKey: "vm:beta", rvtoolsObjectKey: "beta-key", clusterKey: "cluster-1", hostKey: "host-1" }),
      makeVmObject({ objectKey: "vm:alpha", rvtoolsObjectKey: "alpha-key", clusterKey: "cluster-1", hostKey: "host-1" }),
      makeVmObject({ objectKey: "vm:unmatched", rvtoolsObjectKey: null, matchStatus: "unmatched" }),
      makeVmObject({ objectKey: "vm:missing-vm", rvtoolsObjectKey: "does-not-exist" }),
    ];
    const chunks: VropsTimeSeriesChunk[] = [
      makeChunk({ objectKeys: ["vm:beta", "vm:alpha"], startUtc: rangeStartUtc, metric: "vmCpuDemandAvgMHz", values: [[100, 200, 300, 400], [10, 20, 30, 40]] }),
      makeChunk({ objectKeys: ["vm:beta", "vm:alpha"], startUtc: rangeStartUtc, metric: "vmCpuReadyMaxPct", values: [[1, 2, 3, 4], [0, 0, 0, 0]] }),
    ];
    const vms: NormalizedVm[] = [
      makeVm({ vmKey: "beta-key", vmName: "beta-vm", cluster: "Cluster A", host: "esx01", cpuCount: 4 }),
      makeVm({ vmKey: "alpha-key", vmName: "alpha-vm", cluster: "Cluster A", host: "esx01", cpuCount: 2 }),
    ];

    const profiles = buildVmWorkloadProfiles({ import: importMeta, objects, chunks, vms });

    expect(profiles).toHaveLength(2);
    expect(profiles.map((profile) => profile.vmName)).toEqual(["alpha-vm", "beta-vm"]);
    const beta = profiles.find((profile) => profile.vmName === "beta-vm")!;
    expect(beta).toMatchObject({ clusterKey: "cluster-1", clusterName: "Cluster A", resourcePool: null, hostKey: "host-1", host: "esx01", vcpu: 4 });
    expect(beta.demand).toMatchObject({ expectedSlots: 4, sampleCount: 4, coverageRatio: 1, average: 250, p50: 200, p95: 400, p995: 400, maximum: 400 });
    expect(beta.ready.average).toBe(2.5);
  });

  it("verdichtet Kapazität, Co-Stop unter Last und Lastkonzentration je VM", () => {
    // Zwölf Stunden bei 95 % der Kapazität mit geringer Streuung zwischen den Kernen,
    // zwölf Stunden bei 50 % mit voller Streuung – so sieht eine VM aus, die unter
    // Volllast sauber skaliert, im Teillastbetrieb aber auf wenigen Kernen läuft.
    const rangeStartUtc = Date.UTC(2024, 0, 8, 0, 0, 0);
    const importMeta = makeImport({ rangeStartUtc, expectedSlots: 24 });
    const highLoad = (value: number, low: number) => Array.from({ length: 24 }, (_, slot) => (slot < 12 ? value : low));
    const chunks: VropsTimeSeriesChunk[] = [
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuDemandAvgMHz", values: [highLoad(3_800, 2_000)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuTotalCapacityLastMHz", values: [Array.from({ length: 24 }, () => 4_000)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmConfiguredVcpuLast", values: [Array.from({ length: 24 }, () => 4)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuPeakCostopMaxPct", values: [highLoad(2, 10)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuUsageDisparityAvgPct", values: [highLoad(19, 100)] }),
    ];

    const [profile] = buildVmWorkloadProfiles({
      import: importMeta,
      objects: [makeVmObject({ objectKey: "vm:a", rvtoolsObjectKey: "a-key" })],
      chunks,
      vms: [makeVm({ vmKey: "a-key", vmName: "app-01", cpuCount: 4 })],
    });

    expect(profile.capacitySignals).toMatchObject({
      totalCapacityMHz: 4_000,
      configuredVcpu: 4,
      mhzPerVcpu: 1_000,
      hoursAboveCapacity75: 12,
      hoursAboveCapacity90: 12,
      loadHourCount: 24,
    });
    // 95 % Auslastung bei 19 Punkten Abstand ergeben (19/95)/4 = 0,05;
    // 50 % bei 100 Punkten Abstand ergeben (100/50)/4 = 0,50.
    expect(profile.capacitySignals.concentrationIndexP90).toBeCloseTo(0.5, 6);
    expect(profile.capacitySignals.costopUnderLoadP95Pct).toBe(10);
    // In der Spitzenstunde tragen 3,8 von 4 Kernen die Last.
    expect(profile.capacitySignals.effectiveCoresMax).toBeCloseTo(3.8, 6);
    expect(profile.capacitySignals.singleCoreBoundHours).toBe(12);
    // Die gemessene Kapazität ersetzt die Schätzung aus der Hostfrequenz.
    expect(profile.configuredCpuCapacityMHz).toBe(4_000);
  });

  it("zählt Einzelkern-Sättigung und behandelt Messlücken nicht als Null", () => {
    const rangeStartUtc = Date.UTC(2024, 0, 8, 0, 0, 0);
    const measured = Array.from({ length: 30 }, (_, slot) => slot < 6 ? Number.NaN : 40);
    const chunks: VropsTimeSeriesChunk[] = [
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuDemandAvgMHz", values: [Array.from({ length: 30 }, () => 2_400)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuTotalCapacityLastMHz", values: [Array.from({ length: 30 }, () => 4_000)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmConfiguredVcpuLast", values: [Array.from({ length: 30 }, () => 4)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuUsageDisparityAvgPct", values: [measured] }),
    ];
    const [profile] = buildVmWorkloadProfiles({
      import: makeImport({ rangeStartUtc, expectedSlots: 30 }),
      objects: [makeVmObject({ objectKey: "vm:a", rvtoolsObjectKey: "a-key" })],
      chunks,
      vms: [makeVm({ vmKey: "a-key", vmName: "app-01", cpuCount: 4 })],
    });

    // 60 % mittlere Last + 40 Punkte Disparity × 3/4 = 90 % am heißesten Kern.
    expect(profile.capacitySignals.singleCoreBoundHours).toBe(24);
  });

  it("zählt Kapazitätsnähe gegen die heutige Größe, nicht gegen die der Messstunde", () => {
    // Regression aus dem Vorher/Nachher-Vergleich zweier Analyse-Exporte: Eine VM lief
    // die erste Hälfte des Zeitraums mit 2 vCPU am Anschlag und wurde dann auf 4 vCPU
    // vergrößert. Gegen die Kapazität der jeweiligen Stunde gerechnet galt sie weiterhin
    // als dauerhaft überlastet und bekam einen weiteren Vergrößerungsvorschlag – obwohl
    // ihr höchster Demand nur die Hälfte der neuen Kapazität erreicht.
    const rangeStartUtc = Date.UTC(2024, 0, 8, 0, 0, 0);
    const half = <T,>(before: T, after: T) => Array.from({ length: 24 }, (_, slot) => (slot < 12 ? before : after));
    const chunks: VropsTimeSeriesChunk[] = [
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuDemandAvgMHz", values: [Array.from({ length: 24 }, () => 5_000)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuTotalCapacityLastMHz", values: [half(6_000, 12_000)] }),
      makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmConfiguredVcpuLast", values: [half(2, 4)] }),
    ];

    const [profile] = buildVmWorkloadProfiles({
      import: makeImport({ rangeStartUtc, expectedSlots: 24 }),
      objects: [makeVmObject({ objectKey: "vm:a", rvtoolsObjectKey: "a-key" })],
      chunks,
      vms: [makeVm({ vmKey: "a-key", vmName: "app-01", cpuCount: 4 })],
    });

    // 5.000 von 12.000 MHz sind 41,7 % – keine einzige Stunde erreicht die heutige Grenze.
    expect(profile.capacitySignals.totalCapacityMHz).toBe(12_000);
    expect(profile.capacitySignals.hoursAboveCapacity75).toBe(0);
    expect(profile.capacitySignals.hoursAboveCapacity90).toBe(0);
  });

  it("lässt die Kapazitätssignale leer, wenn vROps die optionalen Metriken nicht liefert", () => {
    const rangeStartUtc = Date.UTC(2024, 0, 8, 0, 0, 0);
    const [profile] = buildVmWorkloadProfiles({
      import: makeImport({ rangeStartUtc, expectedSlots: 4 }),
      objects: [makeVmObject({ objectKey: "vm:a", rvtoolsObjectKey: "a-key" })],
      chunks: [makeChunk({ objectKeys: ["vm:a"], startUtc: rangeStartUtc, metric: "vmCpuDemandAvgMHz", values: [[100, 200, 300, 400]] })],
      vms: [makeVm({ vmKey: "a-key", vmName: "app-01", cpuCount: 4 })],
    });

    expect(profile.capacitySignals.totalCapacityMHz).toBeNull();
    expect(profile.capacitySignals.costopUnderLoadP95Pct).toBeNull();
    expect(profile.capacitySignals.singleCoreBoundHours).toBeNull();
    // Die vCPU-Anzahl fällt auf RVTools zurück, damit die Umrechnung nicht ganz ausfällt.
    expect(profile.capacitySignals.configuredVcpu).toBe(4);
  });
});

describe("Wochen-Wiederholbarkeit", () => {
  /** Vier volle Wochen ab Montag – dieselbe Länge wie ein Monatsimport. */
  function buildFourWeekGrid() {
    return buildHourGrid(makeImport({ rangeStartUtc: Date.UTC(2024, 0, 8, 0, 0, 0), expectedSlots: 4 * 168 }));
  }

  it("erkennt einen wochenweise wiederkehrenden Verlauf", () => {
    const grid = buildFourWeekGrid();
    // Verlauf hängt allein von der Position innerhalb der Woche ab und wiederholt sich
    // damit exakt: volle Korrelation, keine Streuung der Wochenmaxima.
    const demand = new Map(grid.map((entry, slot) => [entry.timestampUtc, 1_000 + (slot % 168) * 5]));
    const { signals } = classifyVmBehavior(grid, demand);

    expect(signals.weeklyRepeatability).toBeCloseTo(1, 6);
    expect(signals.weeklyPeakVariation).toBeCloseTo(0, 6);
  });

  it("erkennt einen Verlauf ohne Wochenbezug", () => {
    const grid = buildFourWeekGrid();
    // Deterministische, aber wochenübergreifend unähnliche Folge: die Periode 167 ist zur
    // Wochenlänge teilerfremd, sodass sich kein Wochenmuster ergibt.
    const demand = new Map(grid.map((entry, slot) => [entry.timestampUtc, 100 + ((slot * 37) % 167) * 20]));
    const { signals } = classifyVmBehavior(grid, demand);

    expect(signals.weeklyRepeatability ?? 1).toBeLessThan(0.3);
  });

  it("trifft ohne zwei volle Wochen keine Aussage", () => {
    const grid = buildSyntheticWeek();
    const demand = new Map(grid.map((entry, slot) => [entry.timestampUtc, 1_000 + slot]));
    const { signals } = classifyVmBehavior(grid, demand);

    expect(signals.weeklyRepeatability).toBeNull();
    expect(signals.weeklyPeakVariation).toBeNull();
  });
});

function buildSyntheticWeek(weeks = 1) {
  return buildHourGrid(makeImport({ rangeStartUtc: Date.UTC(2024, 0, 8, 0, 0, 0), expectedSlots: 168 * weeks }));
}

function makeImport(overrides: Partial<VropsTimeSeriesImport>): VropsTimeSeriesImport {
  return {
    id: "ts-1",
    importedAt: "2024-01-01T00:00:00.000Z",
    timezone: "Europe/Vienna",
    intervalMinutes: 60,
    rangeStartUtc: 0,
    rangeEndUtc: 0,
    expectedSlots: 0,
    rvtoolsSnapshotIds: [],
    files: [],
    fileSetChecksum: "checksum",
    schemaVersion: 1,
    validationStatus: "schema-valid",
    qualitySummary: { objectCountByType: { vm: 0, cluster: 0, host: 0 }, expectedSlots: 0, errorCount: 0, warningCount: 0, missingValueCount: 0 },
    ...overrides,
  };
}

function makeVmObject(overrides: Partial<VropsTimeSeriesImportedObject> & { objectKey: string }): VropsTimeSeriesImportedObject {
  return {
    importId: "ts-1",
    objectKey: overrides.objectKey,
    objectType: "vm",
    vropsName: overrides.objectKey,
    vcenterId: "vc-1",
    rvtoolsSnapshotId: "snap-1",
    rvtoolsObjectKey: null,
    clusterKey: null,
    hostKey: null,
    workloadClass: "std",
    powerState: "poweredOn",
    siteId: null,
    matchStatus: "matched",
    matchMethod: "name",
    ...overrides,
  };
}

function makeChunk(input: { objectKeys: string[]; startUtc: number; metric: VropsTimeSeriesMetricKey; values: number[][] }): VropsTimeSeriesChunk {
  const slotCount = input.values[0]?.length ?? 0;
  const flat = input.values.flat();
  return {
    importId: "ts-1",
    objectType: "vm",
    chunkKey: "vm",
    clusterKey: null,
    startUtc: input.startUtc,
    slotCount,
    objectKeys: input.objectKeys,
    metricValues: { [input.metric]: new Float32Array(flat).buffer },
  };
}

function makeVm(overrides: Partial<NormalizedVm> & { vmKey: string }): NormalizedVm {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    vmUuid: null,
    vmName: overrides.vmKey,
    cluster: null,
    host: null,
    powerState: "poweredOn",
    cpuCount: null,
    memoryMiB: null,
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

describe("filterVmWorkloadProfilesBySearch", () => {
  const profiles = [
    { vmName: "APP01", clusterName: "Cluster A", host: "esx01.example.local" },
    { vmName: "DB01", clusterName: "Cluster B", host: "esx02.example.local" },
    { vmName: "WEB01", clusterName: null, host: null },
  ] as unknown as VmWorkloadProfile[];
  const techInfoIndex = new Map([
    ["app01", { sysv: "Mira Musterfrau", sysvDepartment: "RAITEC/IN-VIA" }],
    ["db01", { sysv: null, sysvDepartment: "RAITEC/BS-DBA" }],
  ]);
  const names = (query: string) => filterVmWorkloadProfilesBySearch(profiles, query, techInfoIndex).map((profile) => profile.vmName);

  it("filtert nach VM-Name, Cluster, Host und Systemverantwortlichen", () => {
    expect(names("app")).toEqual(["APP01"]);
    expect(names("cluster b")).toEqual(["DB01"]);
    expect(names("esx02")).toEqual(["DB01"]);
    expect(names("esx")).toEqual(["APP01", "DB01"]);
    expect(names("musterfrau")).toEqual(["APP01"]);
  });

  it("filtert über die Abteilung aus der Tech-Info", () => {
    expect(names("in-via")).toEqual(["APP01"]);
    // Auch ohne benannte Person bleibt die Abteilung suchbar.
    expect(names("dba")).toEqual(["DB01"]);
  });

  it("verträgt fehlende Cluster- und Hostangaben und liefert ohne Begriff alles", () => {
    expect(names("web")).toEqual(["WEB01"]);
    expect(names("")).toHaveLength(3);
  });
});
