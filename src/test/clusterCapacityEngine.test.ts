import { describe, expect, it } from "vitest";
import {
  aggregateCluster,
  applyVmMoves,
  estimateVmLoad,
  emptyAggregate,
  groupVHostRowsByCluster,
  metricsFromAggregate,
} from "@/domain/services/clusterCapacityEngine";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";

function hostRow(overrides: Record<string, unknown>): SheetRow {
  return {
    snapshotId: "snap-1",
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
      ...overrides,
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