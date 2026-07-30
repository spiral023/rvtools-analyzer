import { describe, expect, it } from "vitest";
import type { NormalizedHost, SheetRow, SnapshotMeta } from "@/domain/models/types";
import { buildHostLoadMapData, type HostLoadMapFilters } from "@/lib/hostLoadMap";

const snapshot: SnapshotMeta = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  vcenterDisplayName: "vCenter Wien",
  exportTs: "2026-07-30T10:00:00.000Z",
  importedAt: "2026-07-30T10:05:00.000Z",
  fileName: "rvtools.xlsx",
  fileChecksum: "checksum",
  sheetStats: {},
};

function host(overrides: Partial<NormalizedHost> = {}): NormalizedHost {
  return {
    snapshotId: "snap-1",
    vcenterId: "vc-1",
    hostKey: "esx-01::vc-1",
    host: "esx-01.example.at",
    cluster: "Production",
    datacenter: "Wien",
    cpuModel: "Xeon",
    cpuTotalMHz: 100_000,
    cpuCores: 32,
    cpuThreads: 64,
    memoryTotalMiB: 512_000,
    version: "8.0.3",
    build: "123",
    vendor: "Dell",
    model: "R760",
    connectionState: "connected",
    powerState: "poweredOn",
    maintenanceMode: "False",
    vmCount: 20,
    ...overrides,
  };
}

function raw(data: SheetRow["data"]): SheetRow {
  return { snapshotId: "snap-1", sheetName: "vHost", rowIndex: 0, data };
}

const noFilters: HostLoadMapFilters = { clusters: [], hosts: [], search: "" };

describe("buildHostLoadMapData", () => {
  it("verbindet normalisierte Hosts mit den aktuellen vHost-Auslastungswerten", () => {
    const result = buildHostLoadMapData(
      [host()],
      [raw({ Host: "esx-01.example.at", "CPU usage %": 62.5, "Memory usage %": 71, "# VMs": 24, "# vCPUs": 160, "# Cores": 32 })],
      [snapshot],
      noFilters,
    );

    expect(result.visibleHostCount).toBe(1);
    expect(result.missingHosts).toEqual([]);
    expect(result.points[0]).toMatchObject({
      host: "esx-01.example.at",
      vcenterDisplayName: "vCenter Wien",
      cpuUsagePct: 62.5,
      memoryUsagePct: 71,
      vmCount: 24,
      vcpuPerCore: 5,
      severity: "normal",
      operationalState: "connected",
    });
  });

  it("bewertet CPU und RAM mit den operativen Host-Schwellen", () => {
    const hosts = [
      host({ hostKey: "warn", host: "warn" }),
      host({ hostKey: "critical", host: "critical" }),
      host({ hostKey: "maintenance", host: "maintenance", maintenanceMode: "True" }),
    ];
    const rows = [
      raw({ Host: "warn", "CPU usage %": 75, "Memory usage %": 50 }),
      raw({ Host: "critical", "CPU usage %": 30, "Memory usage %": 90 }),
      raw({ Host: "maintenance", "CPU usage %": 10, "Memory usage %": 10 }),
    ];

    const result = buildHostLoadMapData(hosts, rows, [snapshot], noFilters);

    expect(result.points.find((point) => point.host === "warn")?.severity).toBe("warning");
    expect(result.points.find((point) => point.host === "critical")?.severity).toBe("critical");
    expect(result.points.find((point) => point.host === "maintenance")?.operationalState).toBe("maintenance");
  });

  it("führt fehlende Messwerte separat und zeichnet sie nicht als null Prozent", () => {
    const result = buildHostLoadMapData(
      [host()],
      [raw({ Host: "esx-01.example.at", "CPU usage %": 0, "Memory usage %": null })],
      [snapshot],
      noFilters,
    );

    expect(result.points).toEqual([]);
    expect(result.missingHosts).toEqual([
      expect.objectContaining({ host: "esx-01.example.at", missingMetrics: ["RAM"] }),
    ]);
  });

  it("wendet Cluster-, Host- und Suchfilter auf denselben sichtbaren Scope an", () => {
    const hosts = [
      host(),
      host({ hostKey: "esx-02::vc-1", host: "esx-02.example.at", cluster: "Test", model: "R650" }),
    ];
    const rows = [
      raw({ Host: "esx-01.example.at", "CPU usage %": 20, "Memory usage %": 30 }),
      raw({ Host: "esx-02.example.at", "CPU usage %": 40, "Memory usage %": 50 }),
    ];

    expect(buildHostLoadMapData(hosts, rows, [snapshot], { clusters: ["Test"], hosts: [], search: "" }).points.map((point) => point.host)).toEqual(["esx-02.example.at"]);
    expect(buildHostLoadMapData(hosts, rows, [snapshot], { clusters: [], hosts: ["esx-01.example.at"], search: "" }).points.map((point) => point.host)).toEqual(["esx-01.example.at"]);
    expect(buildHostLoadMapData(hosts, rows, [snapshot], { clusters: [], hosts: [], search: "r650" }).points.map((point) => point.host)).toEqual(["esx-02.example.at"]);
  });
});
