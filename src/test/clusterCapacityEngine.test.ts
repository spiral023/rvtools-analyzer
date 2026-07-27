import { describe, expect, it } from "vitest";
import {
  aggregateCluster,
  applyVmMoves,
  classifyVmFailoverGroup,
  computeHostFailureCapacity,
  computeMaxHostFailures,
  computeSiteFailoverRisk,
  estimateVmLoad,
  emptyAggregate,
  groupVHostRowsByCluster,
  metricsFromAggregate,
  VROPS_RISK_THRESHOLDS,
  type VropsRiskInput,
} from "@/domain/services/clusterCapacityEngine";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import { clusterScopeKey, type ClusterIdentity } from "@/lib/clusterIdentity";

function hostRow(overrides: Record<string, unknown>): SheetRow {
  const { snapshotId = "snap-1", ...dataOverrides } = overrides;
  return {
    snapshotId: String(snapshotId),
    sheetName: "vHost",
    rowIndex: 0,
    data: {
      Cluster: "A",
      Host: "esx-1",
      Datacenter: "DC1",
      "# Cores": 10,
      "# Memory": 100000,
      "CPU usage %": 50,
      "Memory usage %": 60,
      "# VMs": 5,
      "# vCPUs": 20,
      vRAM: 80000,
      "VM Used memory": 50000,
      "VM Memory Swapped": 0,
      "VM Memory Ballooned": 0,
      "HT Available": true,
      "HT Active": true,
      ...dataOverrides,
    },
  };
}

function vm(overrides: Partial<NormalizedVm>): NormalizedVm {
  return {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-x", vmUuid: null,
    vmName: "VM-X", cluster: "A", host: "esx-1", powerState: "poweredOn",
    cpuCount: 4, memoryMiB: 16000, provisionedMiB: 40000, inUseMiB: 20000,
    configStatus: null, connectionState: null, consolidationNeeded: null,
    osConfig: null, osTools: null, hwVersion: null, toolsStatus: null,
    toolsVersion: null, datacenter: null, folder: null, resourcePool: null,
    annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
    ...overrides,
  };
}

describe("clusterCapacityEngine – aggregate & metrics (Vorher)", () => {
  const rows: SheetRow[] = [
    hostRow({ Host: "esx-1" }),
    hostRow({ Host: "esx-2" }),
  ];

  it("aggregiert Host-Zeilen korrekt", () => {
    const agg = aggregateCluster("A", rows);
    expect(agg.hosts).toBe(2);
    expect(agg.totalCores).toBe(20);
    expect(agg.totalMemoryMiB).toBe(200000);
    expect(agg.vcpus).toBe(40);
    expect(agg.vRamMiB).toBe(160000);
    expect(agg.vmActiveMiB).toBe(100000);
    expect(agg.cpuUsedCoreEquiv).toBeCloseTo(10, 6); // 2 × (0.5 × 10)
    expect(agg.memConsumedMiB).toBeCloseTo(120000, 3); // 2 × (0.6 × 100000)
  });

  it("berechnet Vorher-Metriken", () => {
    const agg = aggregateCluster("A", rows);
    const m = metricsFromAggregate(agg, { clusterName: "A", projected: false });
    expect(m.cpuUsagePct).toBeCloseTo(50, 3);
    expect(m.memoryUsagePct).toBeCloseTo(60, 3);
    expect(m.vcpuPerCore).toBeCloseTo(2, 3);
    expect(m.ramCommitPct).toBeCloseTo(80, 3);
    expect(m.ramActivePct).toBeCloseTo(50, 3);
    expect(m.swapBalloonPct).toBeCloseTo(0, 3);
    expect(m.risk).toBe("niedrig");
    expect(m.projected).toBe(false);
  });

  it("ignoriert Zeilen fremder Cluster", () => {
    const mixed = [...rows, hostRow({ Cluster: "B", Host: "esx-9" })];
    const agg = aggregateCluster("A", mixed);
    expect(agg.hosts).toBe(2);
  });
});

describe("groupVHostRowsByCluster", () => {
  it("trennt gleichnamige Cluster nach vCenter und Datacenter", () => {
    const rows: SheetRow[] = [
      hostRow({ snapshotId: "snap-1", Cluster: "A", Datacenter: "DC1", Host: "esx-vc-1" }),
      hostRow({ snapshotId: "snap-2", Cluster: "A", Datacenter: "DC1", Host: "esx-vc-2" }),
      hostRow({ snapshotId: "snap-3", Cluster: "A", Datacenter: "DC2", Host: "esx-vc-1-dc-2" }),
    ];
    const vcenterBySnapshot = new Map([
      ["snap-1", "vc-1"],
      ["snap-2", "vc-2"],
      ["snap-3", "vc-1"],
    ]);
    const vc1Identity = { vcenterId: "vc-1", datacenter: "DC1", clusterName: "A" };

    const grouped = groupVHostRowsByCluster(rows, vcenterBySnapshot);
    const vc1Key = clusterScopeKey("vc-1", "DC1", "A");

    expect([...grouped.keys()].sort()).toEqual([
      vc1Key,
      clusterScopeKey("vc-1", "DC2", "A"),
      clusterScopeKey("vc-2", "DC1", "A"),
    ]);
    expect(aggregateCluster(vc1Identity, rows, vcenterBySnapshot).hosts).toBe(1);
    expect(grouped.get(vc1Key)?.map((row) => row.data["Host"])).toEqual(["esx-vc-1"]);
  });

  it("überspringt im sicheren Pfad Zeilen ohne vCenter-Zuordnung", () => {
    const rows: SheetRow[] = [
      hostRow({ snapshotId: "snap-known", Cluster: "A", Datacenter: "DC1", Host: "esx-known" }),
      hostRow({ snapshotId: "snap-unknown", Cluster: "A", Datacenter: "DC1", Host: "esx-unknown" }),
    ];

    const grouped = groupVHostRowsByCluster(rows, new Map([["snap-known", "vc-1"]]));

    expect([...grouped.keys()]).toEqual([clusterScopeKey("vc-1", "DC1", "A")]);
    expect(grouped.get(clusterScopeKey("vc-1", "DC1", "A"))?.map((row) => row.data["Host"])).toEqual(["esx-known"]);
  });

  it("aggregiert nicht zugeordnete Zeilen auch nicht für eine leere vCenter-Identity", () => {
    const rows = [hostRow({ snapshotId: "snap-unknown", Cluster: "A", Datacenter: "DC1", Host: "esx-unknown" })];

    const aggregate = aggregateCluster(
      { vcenterId: "", datacenter: "DC1", clusterName: "A" },
      rows,
      new Map(),
    );

    expect(aggregate.hosts).toBe(0);
  });

  it("verlangt einen vCenter-Index für Identity-Aggregationen", () => {
    const aggregateWithoutVcenterIndex = aggregateCluster as unknown as (
      cluster: ClusterIdentity,
      rawVHostRows: SheetRow[],
      vcenterBySnapshot?: ReadonlyMap<string, string>,
    ) => ReturnType<typeof aggregateCluster>;

    expect(() => aggregateWithoutVcenterIndex(
      { vcenterId: "vc-1", datacenter: "DC1", clusterName: "A" },
      [hostRow({ Cluster: "A", Datacenter: "DC1", Host: "esx-1" })],
    )).toThrow("vCenter-Index");
  });

  it("gruppiert Host-Zeilen nach getrimmtem Cluster-Namen", () => {
    const rows: SheetRow[] = [
      hostRow({ Cluster: "A", Host: "esx-1" }),
      hostRow({ Cluster: " B ", Host: "esx-2" }),
      hostRow({ Cluster: "A", Host: "esx-3" }),
    ];

    const grouped = groupVHostRowsByCluster(rows);

    expect([...grouped.keys()].sort()).toEqual(["A", "B"]);
    expect(grouped.get("A")?.map((r) => r.data["Host"])).toEqual(["esx-1", "esx-3"]);
    expect(grouped.get("B")?.map((r) => r.data["Host"])).toEqual(["esx-2"]);
  });

  it("ignoriert Zeilen ohne Cluster-Namen", () => {
    const rows: SheetRow[] = [
      hostRow({ Cluster: "", Host: "esx-1" }),
      hostRow({ Cluster: "   ", Host: "esx-2" }),
    ];

    const grouped = groupVHostRowsByCluster(rows);

    expect(grouped.size).toBe(0);
  });

  it("liefert pro Cluster dieselbe Aggregation wie ein voller Scan über alle Zeilen", () => {
    const rows: SheetRow[] = [
      hostRow({ Cluster: "A", Host: "esx-1" }),
      hostRow({ Cluster: "B", Host: "esx-2", "# Cores": 6 }),
      hostRow({ Cluster: "A", Host: "esx-3" }),
    ];

    const grouped = groupVHostRowsByCluster(rows);
    const aggFromGroup = aggregateCluster("A", grouped.get("A") ?? []);
    const aggFromFullScan = aggregateCluster("A", rows);

    expect(aggFromGroup).toEqual(aggFromFullScan);
  });
});

describe("clusterCapacityEngine – Lastschätzung & Verschiebung (Nachher)", () => {
  // Quell-Aggregat A: 2 Hosts, cpuUsedCoreEquiv=10, vmActiveMiB=100000, vRamMiB=160000, vcpus=40
  const sourceAgg = {
    hosts: 2, totalCores: 20, totalMemoryMiB: 200000, totalVms: 10, vcpus: 40,
    vRamMiB: 160000, vmActiveMiB: 100000, swapBalloonMiB: 0, cpuUsedCoreEquiv: 10,
    memConsumedMiB: 120000, hotHosts: 0, htInactiveHosts: 0,
    cpuMin: 50, cpuMax: 50, memMin: 60, memMax: 60,
  };

  it("schätzt VM-Last proportional zur Konfiguration", () => {
    const load = estimateVmLoad(sourceAgg, vm({ cpuCount: 4, memoryMiB: 16000 }));
    // Anteil RAM: 16000/160000 = 0.1
    expect(load.activeMiB).toBeCloseTo(10000, 3);   // 100000 × 0.1
    expect(load.consumedMiB).toBeCloseTo(12000, 3); // 120000 × 0.1
    expect(load.swapBalloonMiB).toBeCloseTo(0, 3);
    // Anteil CPU: 4/40 = 0.1 → 10 × 0.1
    expect(load.usedCoreEquiv).toBeCloseTo(1, 3);
  });

  it("gibt Nulllast zurück, wenn Bezugsgrößen 0 sind", () => {
    const empty = emptyAggregate();
    const load = estimateVmLoad(empty, vm({}));
    expect(load).toEqual({ activeMiB: 0, consumedMiB: 0, swapBalloonMiB: 0, usedCoreEquiv: 0 });
  });

  it("zieht ausgehende VMs ab und addiert eingehende", () => {
    const movedVm = vm({ vmKey: "vm-1", cpuCount: 4, memoryMiB: 16000 });
    const load = estimateVmLoad(sourceAgg, movedVm);

    const sourceAfter = applyVmMoves(sourceAgg, { incoming: [], outgoing: [{ vm: movedVm, load }] });
    expect(sourceAfter.vcpus).toBe(36);
    expect(sourceAfter.vRamMiB).toBe(144000);
    expect(sourceAfter.vmActiveMiB).toBeCloseTo(90000, 3);
    expect(sourceAfter.cpuUsedCoreEquiv).toBeCloseTo(9, 3);
    expect(sourceAfter.totalVms).toBe(9);
    // Denominatoren unverändert (Hosts bleiben)
    expect(sourceAfter.totalCores).toBe(20);

    const emptyTarget = { ...emptyAggregate(), hosts: 1, totalCores: 10, totalMemoryMiB: 100000 };
    const targetAfter = applyVmMoves(emptyTarget, { incoming: [{ vm: movedVm, load }], outgoing: [] });
    expect(targetAfter.vcpus).toBe(4);
    expect(targetAfter.vRamMiB).toBe(16000);
    expect(targetAfter.vmActiveMiB).toBeCloseTo(10000, 3);
    expect(targetAfter.cpuUsedCoreEquiv).toBeCloseTo(1, 3);
    expect(targetAfter.totalVms).toBe(1);
  });
});

describe("classifyVmFailoverGroup", () => {
  it("erkennt HIGH- und STD-Pools am letzten Pfadsegment, unabhängig vom Cluster-Präfix", () => {
    expect(classifyVmFailoverGroup("/LNZ9910/CL_LNZ_SRV_9910_Linux02/Resources/HIGH")).toBe("high");
    expect(classifyVmFailoverGroup("/LNZ9910/CL_LNZ_SRV_9910_Linux02/Resources/STD")).toBe("std");
    expect(classifyVmFailoverGroup("high")).toBe("high");
  });

  it("stuft VMs außerhalb von HIGH/STD sowie fehlende Werte als unknown ein", () => {
    expect(classifyVmFailoverGroup("/LNZ9910/CL_LNZ_SRV_9910_Linux02/Resources")).toBe("unknown");
    expect(classifyVmFailoverGroup(null)).toBe("unknown");
    expect(classifyVmFailoverGroup("")).toBe("unknown");
  });
});

describe("computeMaxHostFailures", () => {
  it("liefert 0 ohne bzw. mit nur einem Host", () => {
    expect(computeMaxHostFailures({ ...emptyAggregate(), hosts: 0 })).toBe(0);
    expect(computeMaxHostFailures({ ...emptyAggregate(), hosts: 1, totalCores: 10, totalMemoryMiB: 100000 })).toBe(0);
  });

  it("liefert 0, wenn schon ein einzelner Host-Ausfall CPU % über die 50%-Rot-Grenze treibt", () => {
    // 2 Hosts × 10 Cores/100000 MiB, CPU 50 %/RAM 60 % Ist-Auslastung → nach 1 Ausfall CPU 100 %.
    const rows: SheetRow[] = [hostRow({ Host: "esx-1" }), hostRow({ Host: "esx-2" })];
    const agg = aggregateCluster("A", rows);
    expect(computeMaxHostFailures(agg)).toBe(0);
  });

  it("findet die Metrik, die zuerst über ihre Rot-Grenze kippt (hier RAM Commit % bei 3 von 4 Ausfällen)", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 4, totalCores: 40, totalMemoryMiB: 400000,
      cpuUsedCoreEquiv: 4, memConsumedMiB: 40000, vcpus: 32, vRamMiB: 80000,
    };
    // 1 Ausfall: CPU 13,3 %, RAM 13,3 %, vCPU/Core 1,07, RAM Commit 26,7 % — alle grün.
    // 2 Ausfälle: CPU 20 %, RAM 20 %, vCPU/Core 1,6, RAM Commit 40 % — alle grün.
    // 3 Ausfälle: RAM Commit 80 % ≥ 70 % Rot-Grenze → maximal 2 Ausfälle verkraftbar.
    expect(computeMaxHostFailures(agg)).toBe(2);
  });

  it("liefert hosts - 1, wenn selbst der Ausfall aller bis auf einen Host grün bleibt", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 3, totalCores: 300, totalMemoryMiB: 3_000_000,
      cpuUsedCoreEquiv: 1, memConsumedMiB: 1000, vcpus: 10, vRamMiB: 10000,
    };
    expect(computeMaxHostFailures(agg)).toBe(2);
  });
});

describe("computeHostFailureCapacity", () => {
  it("nennt die auslösende Metrik samt Wert und Rot-Grenze für den nächsten Host-Ausfall", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 4, totalCores: 40, totalMemoryMiB: 400000,
      cpuUsedCoreEquiv: 4, memConsumedMiB: 40000, vcpus: 32, vRamMiB: 80000,
    };
    const result = computeHostFailureCapacity(agg);
    expect(result.maxHostFailures).toBe(2);
    expect(result.breaches).toEqual([
      { metric: "ramCommit", label: "RAM Commit %", value: 80, danger: 70 },
    ]);
  });

  it("liefert eine leere breaches-Liste, wenn keine Metrik kippt", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 3, totalCores: 300, totalMemoryMiB: 3_000_000,
      cpuUsedCoreEquiv: 1, memConsumedMiB: 1000, vcpus: 10, vRamMiB: 10000,
    };
    expect(computeHostFailureCapacity(agg).breaches).toEqual([]);
  });

  it("nennt mehrere Metriken, wenn sie beim selben Ausfall gemeinsam kippen", () => {
    // 2 Hosts, CPU 50 %/RAM 60 % Ist-Auslastung → nach 1 Ausfall CPU 100 %, RAM 120 %, RAM Commit 160 %.
    const rows: SheetRow[] = [hostRow({ Host: "esx-1" }), hostRow({ Host: "esx-2" })];
    const agg = aggregateCluster("A", rows);
    const result = computeHostFailureCapacity(agg);
    expect(result.maxHostFailures).toBe(0);
    expect(result.breaches.map((b) => b.metric).sort()).toEqual(["cpuUsage", "memoryUsage", "ramCommit"]);
  });

  it("berücksichtigt HIGH-RP CPU %/RAM-Nutzung % aus vROps, wenn übergeben", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 4, totalCores: 400, totalMemoryMiB: 4_000_000,
      cpuUsedCoreEquiv: 1, memConsumedMiB: 1000, vcpus: 10, vRamMiB: 10000,
    };
    // Ohne vROps-Werte bleiben alle Ist-Metriken grün bis hosts-1 Ausfälle.
    expect(computeHostFailureCapacity(agg).maxHostFailures).toBe(3);

    // HIGH-RP RAM genutzt 26 % → bei 1 Ausfall (factor 0,75) 34,7 %, bei 2 Ausfällen (factor 0,5) 52 % ≥ 50 % Rot-Grenze.
    const result = computeHostFailureCapacity(agg, { cpuUsageHighPct: null, ramUsageHighPct: 26 });
    expect(result.maxHostFailures).toBe(1);
    expect(result.breaches).toEqual([
      { metric: "ramUsageHigh", label: "HIGH-RP RAM genutzt % (RP)", value: 52, danger: 50 },
    ]);
  });

  it("ignoriert vROps-Werte, die null sind", () => {
    const agg = {
      ...emptyAggregate(),
      hosts: 3, totalCores: 300, totalMemoryMiB: 3_000_000,
      cpuUsedCoreEquiv: 1, memConsumedMiB: 1000, vcpus: 10, vRamMiB: 10000,
    };
    const result = computeHostFailureCapacity(agg, { cpuUsageHighPct: null, ramUsageHighPct: null });
    expect(result.maxHostFailures).toBe(2);
    expect(result.breaches).toEqual([]);
  });
});

describe("computeSiteFailoverRisk", () => {
  it("bewertet ok/warn/crit an den 45%/50%-Schwellen und null ohne vROps-Daten", () => {
    expect(computeSiteFailoverRisk(null)).toBeNull();
    expect(computeSiteFailoverRisk(30)).toBe("ok");
    expect(computeSiteFailoverRisk(46)).toBe("warn");
    expect(computeSiteFailoverRisk(51)).toBe("crit");
  });
});

function vropsRisk(overrides: Partial<VropsRiskInput> = {}): VropsRiskInput {
  return {
    ramAssignedHighPct: null, ramUsageHighPct: null, cpuUsageHighPct: null,
    clusterRamAssignedPct: null, clusterCpuUsagePct: null, avgVmsPerHost: null,
    cpuOvercommitRatio: null,
    ...overrides,
  };
}

describe("metricsFromAggregate – vROps-Gewichtung", () => {
  // 2 Hosts, CPU 50 %, RAM 60 % → Basis-riskScore 0, risk "niedrig" (siehe erste describe-Gruppe oben).
  function lowRiskAgg() {
    const rows: SheetRow[] = [hostRow({ Host: "esx-1" }), hostRow({ Host: "esx-2" })];
    return aggregateCluster("A", rows);
  }

  it("verhält sich ohne vrops-Feld exakt wie bisher (kein Breaking Change)", () => {
    const m = metricsFromAggregate(lowRiskAgg(), { clusterName: "A", projected: false });
    expect(m.riskScore).toBe(0);
    expect(m.risk).toBe("niedrig");
    expect(m.riskFactors).toEqual([]);
    expect(m.siteFailoverOverride).toBe(false);
  });

  it("ignoriert ein vrops-Objekt, in dem alle Felder null sind", () => {
    const m = metricsFromAggregate(lowRiskAgg(), { clusterName: "A", projected: false, vrops: vropsRisk() });
    expect(m.riskScore).toBe(0);
    expect(m.risk).toBe("niedrig");
  });

  it("HIGH-RP RAM zugewiesen %: warn +18, danger +35, danger erzwingt zusätzlich risk=hoch (Hard-Override)", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1 }),
    });
    expect(warn.riskScore).toBe(18);
    expect(warn.risk).toBe("niedrig");

    expect(warn.riskFactors).toEqual([
      { label: `HIGH-RP RAM zugewiesen % ${VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1} % (> ${VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn} %)`, points: 18 },
    ]);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.danger + 1 }),
    });
    expect(danger.riskScore).toBe(35);
    // Score allein (35) läge unter der 60er-Schwelle — die Hard-Override-Regel erzwingt "hoch" trotzdem.
    expect(danger.risk).toBe("hoch");
    expect(danger.siteFailoverOverride).toBe(true);
    expect(danger.riskFactors).toEqual([
      { label: `HIGH-RP RAM zugewiesen % ${VROPS_RISK_THRESHOLDS.ramAssignedHigh.danger + 1} % (> ${VROPS_RISK_THRESHOLDS.ramAssignedHigh.danger} %)`, points: 35 },
    ]);
  });

  it("CPU-Overcommit (vROps Ist) beeinflusst den Score nicht — dieselbe Kennzahl wie vCPU/Core, nur mit anderer Datenquelle", () => {
    const withoutOvercommit = metricsFromAggregate(lowRiskAgg(), { clusterName: "A", projected: false, vrops: vropsRisk() });
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.warn + 0.5 }),
    });
    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.danger + 0.5 }),
    });
    expect(warn.riskScore).toBe(withoutOvercommit.riskScore);
    expect(danger.riskScore).toBe(withoutOvercommit.riskScore);
    expect(danger.riskFactors).toEqual([]);
    expect(danger.risk).toBe("niedrig");
  });

  it("HIGH-RP CPU %: warn +9, danger +18", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.warn + 5 }),
    });
    expect(warn.riskScore).toBe(9);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.danger + 5 }),
    });
    expect(danger.riskScore).toBe(18);
  });

  it("HIGH-RP RAM genutzt im eigenen RP: warn +5, danger +10", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.warn + 5 }),
    });
    expect(warn.riskScore).toBe(5);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.danger + 5 }),
    });
    expect(danger.riskScore).toBe(10);
  });

  it("Cluster-RAM-Zuweisung gesamt: warn +4, danger +8", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.warn + 5 }),
    });
    expect(warn.riskScore).toBe(4);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.danger + 5 }),
    });
    expect(danger.riskScore).toBe(8);
  });

  it("Cluster-CPU-Nutzung gesamt: warn +4, danger +8", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.warn + 5 }),
    });
    expect(warn.riskScore).toBe(4);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.danger + 5 }),
    });
    expect(danger.riskScore).toBe(8);
  });

  it("Ø VMs/Host Ist: warn +2, danger +5", () => {
    const warn = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.warn + 5 }),
    });
    expect(warn.riskScore).toBe(2);

    const danger = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.danger + 5 }),
    });
    expect(danger.riskScore).toBe(5);
  });

  it("summiert mehrere Danger-Faktoren (CPU-Overcommit zählt bewusst nicht mit, siehe oben)", () => {
    // 18 (HIGH-RP CPU) + 10 (HIGH-RP RAM genutzt) + 8 (Cluster-RAM) + 8 (Cluster-CPU) + 5 (VMs/Host) = 49
    // cpuOvercommitRatio wird trotzdem mitgegeben, um zu belegen, dass es die Summe nicht verändert.
    const m = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({
        ramAssignedHighPct: null,
        cpuOvercommitRatio: VROPS_RISK_THRESHOLDS.cpuOvercommit.danger + 1,
        cpuUsageHighPct: VROPS_RISK_THRESHOLDS.cpuUsageHigh.danger + 1,
        ramUsageHighPct: VROPS_RISK_THRESHOLDS.ramUsageHigh.danger + 1,
        clusterRamAssignedPct: VROPS_RISK_THRESHOLDS.clusterRamAssigned.danger + 1,
        clusterCpuUsagePct: VROPS_RISK_THRESHOLDS.clusterCpuUsage.danger + 1,
        avgVmsPerHost: VROPS_RISK_THRESHOLDS.avgVmsPerHost.danger + 1,
      }),
    });
    expect(m.riskScore).toBe(49);
    expect(m.risk).toBe("mittel");
  });

  it("erzwingt risk=hoch NICHT bei Site-Failover-Warn (nur bei crit)", () => {
    const m = metricsFromAggregate(lowRiskAgg(), {
      clusterName: "A", projected: false,
      vrops: vropsRisk({ ramAssignedHighPct: VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1 }),
    });
    expect(computeSiteFailoverRisk(VROPS_RISK_THRESHOLDS.ramAssignedHigh.warn + 1)).toBe("warn");
    expect(m.risk).toBe("niedrig");
  });
});
