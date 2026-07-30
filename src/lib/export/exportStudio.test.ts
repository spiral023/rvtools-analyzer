import { describe, expect, it } from "vitest";
import {
  buildClusterExportDataset,
  buildDatastoreExportDataset,
  buildExportDataFromDataset,
  buildFillUpExportDataset,
  buildHostExportDataset,
  buildManagementMarkdown,
  buildVmExportDataset,
  pseudonymizeExportDataset,
  type ExportStudioDataset,
} from "./exportStudio";
import { buildCsvTable } from "./tableExport";
import type { ClusterCapacityRow } from "@/lib/clusterCapacityWorkspace";
import type { NormalizedCluster, NormalizedDatastore, NormalizedHost, NormalizedVm, SnapshotMeta, VmWorkloadProfile } from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";
import { getExportColumnInfo } from "@/lib/glossaries/exportStudio";

const dataset: ExportStudioDataset = {
  source: "vms",
  title: "VM-Inventar",
  dataStatus: "Export 28.07.2026",
  scope: "1 vCenter-Scope",
  kpis: [{ label: "VMs", value: "2" }],
  columns: [
    { id: "vcenter", label: "vCenter", pseudonymKind: "vcenter" },
    { id: "server", label: "Server", pseudonymKind: "server" },
    { id: "cluster", label: "Cluster", pseudonymKind: "cluster" },
    { id: "state", label: "Status" },
  ],
  rows: [
    { vcenter: "vc-prod", server: "sql-01", cluster: "cluster-a", state: "poweredOn" },
    { vcenter: "vc-prod", server: "web-01", cluster: "cluster-a", state: "poweredOff" },
  ],
};

describe("Export Studio domain helpers", () => {
  it("liefert für jede Exportspalte eine fachliche Tooltip-Erklärung", () => {
    const datasets = [
      buildVmExportDataset([], [], "Scope"),
      buildHostExportDataset([], [], "Scope"),
      buildClusterExportDataset([], [], "Scope"),
      buildDatastoreExportDataset([], [], "Scope"),
      buildFillUpExportDataset([], "Scope"),
    ];

    for (const exportDataset of datasets) {
      for (const column of exportDataset.columns) {
        expect(getExportColumnInfo(exportDataset.source, column)).toEqual(expect.objectContaining({
          term: column.label,
          description: expect.any(String),
          source: expect.any(String),
        }));
      }
    }
  });

  it("pseudonymisiert Bezeichner je Domäne konsistent und nur in markierten Spalten", () => {
    const result = pseudonymizeExportDataset(dataset);
    expect(result.rows[0]).toEqual({ vcenter: "vcenter-01", server: "server-001", cluster: "cluster-001", state: "poweredOn" });
    expect(result.rows[1]).toEqual({ vcenter: "vcenter-01", server: "server-002", cluster: "cluster-001", state: "poweredOff" });
  });

  it("pseudonymisiert mehrwertige Hostspalten wertweise", () => {
    const result = pseudonymizeExportDataset({
      ...dataset,
      source: "datastores",
      columns: [{ id: "hosts", label: "Hosts", pseudonymKind: "host", pseudonymSeparator: ", " }],
      rows: [{ hosts: "esx-01, esx-02" }, { hosts: "esx-02, esx-03" }],
    });
    expect(result.rows).toEqual([{ hosts: "host-001, host-002" }, { hosts: "host-002, host-003" }]);
  });

  it("schützt Personen-, Abteilungs- und Kommentarfelder standardmäßig und lässt einzelne Felder ausnehmen", () => {
    const sensitiveDataset: ExportStudioDataset = {
      ...dataset,
      columns: [
        { id: "owner", label: "Systemverantwortlicher", pseudonymKind: "person", category: "Tech-Info" },
        { id: "deputy", label: "Stellvertreter", pseudonymKind: "person", category: "Tech-Info" },
        { id: "department", label: "Abteilung", pseudonymKind: "department", category: "Tech-Info" },
        { id: "comment", label: "Kommentar", pseudonymKind: "text", category: "Tech-Info" },
      ],
      rows: [{ owner: "Erika Mustermann", deputy: "Max Beispiel", department: "IT Betrieb", comment: "Kritischer Fachserver" }],
    };

    expect(pseudonymizeExportDataset(sensitiveDataset).rows[0]).toEqual({ owner: "person-001", deputy: "person-002", department: "abteilung-001", comment: "text-001" });
    expect(pseudonymizeExportDataset(sensitiveDataset, ["owner", "department"]).rows[0]).toEqual({ owner: "person-001", deputy: "Max Beispiel", department: "abteilung-001", comment: "Kritischer Fachserver" });
  });

  it("pseudonymisiert bei Resource Pools nur den Teil vor dem Profilkürzel (\"/HIGH\", \"/STD\", …)", () => {
    const result = pseudonymizeExportDataset({
      ...dataset,
      columns: [{ id: "resourcePool", label: "Resource Pool", pseudonymKind: "resource-pool" }],
      rows: [
        { resourcePool: "Team-X/HIGH" },
        { resourcePool: "Team-X/STD" },
        { resourcePool: "Team-Y/HIGH" },
        { resourcePool: "Ohne Profil" },
        { resourcePool: "—" },
      ],
    });
    expect(result.rows).toEqual([
      { resourcePool: "resource-pool-001/HIGH" },
      // Derselbe Bezeichner vor dem "/" ergibt denselben Platzhalter, unabhängig vom Profilkürzel.
      { resourcePool: "resource-pool-001/STD" },
      { resourcePool: "resource-pool-002/HIGH" },
      // Ohne "/" gilt der gesamte Wert als Bezeichner.
      { resourcePool: "resource-pool-003" },
      { resourcePool: "—" },
    ]);
  });

  it("erhält die vom Nutzer festgelegte Spaltenreihenfolge", () => {
    const data = buildExportDataFromDataset(dataset, ["state", "server"]);
    expect(data.headers).toEqual(["Status", "Server"]);
    expect(data.rows[0]).toEqual({ Status: "poweredOn", Server: "sql-01" });
  });

  it("liefert einen Markdown-Management-Report mit Datenstand, Scope, Kennzahlen und Tabelle", () => {
    const data = buildExportDataFromDataset(dataset, ["server"]);
    expect(buildManagementMarkdown("Review-Export", dataset, data, true)).toContain("**Datenstand:** Export 28.07.2026");
    expect(buildManagementMarkdown("Review-Export", dataset, data, true)).toContain("**Datenschutz:** Pseudonymisierte Bezeichner im Export");
    expect(buildManagementMarkdown("Review-Export", dataset, data, true)).toContain("| Server |");
  });

  it("erstellt Excel-kompatible CSV mit Semikolon und sauber escaped Quotes", () => {
    expect(buildCsvTable({ headers: ["Name", "Kommentar"], rows: [{ Name: "server-001", Kommentar: "A; \"kritisch\"" }] })).toBe('Name;Kommentar\r\nserver-001;"A; ""kritisch"""');
  });
});

describe("buildVmExportDataset", () => {
  const snapshot: SnapshotMeta = {
    snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vCenter Prod", exportTs: "2026-07-28T00:00:00.000Z",
    importedAt: "2026-07-28T00:00:00.000Z", fileName: "export.xlsx", fileChecksum: "abc", sheetStats: {},
  };

  function vm(overrides: Partial<NormalizedVm> = {}): NormalizedVm {
    return {
      snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmUuid: null, vmName: "sql-01", cluster: "Production", host: "esx-01",
      powerState: "poweredOn", cpuCount: 4, memoryMiB: 8192, provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null,
      consolidationNeeded: null, osConfig: "Windows", osTools: null, hwVersion: "vmx-21", toolsStatus: null, toolsVersion: "12.5.0", datacenter: null,
      folder: null, resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: true, cbt: null,
      ...overrides,
    };
  }

  const emptyStats: VmWorkloadProfile["demand"] = { expectedSlots: 168, sampleCount: 0, coverageRatio: 0, average: null, p50: null, p95: null, maximum: null };

  function profile(overrides: Partial<VmWorkloadProfile> = {}): VmWorkloadProfile {
    return {
      objectKey: "obj-1", rvtoolsObjectKey: "vm-1", vmName: "sql-01", clusterKey: null, clusterName: "Production",
      hostKey: "host-1", host: "esx-01", vcpu: 4, configuredCpuCapacityMHz: 4_000, configuredMemoryMiB: 8192, powerState: "poweredOn", workloadClass: "unknown",
      hourly: [{ timestampUtc: Date.UTC(2026, 6, 1, 0, 0), cpuDemandMHz: 412.3, cpuReadyPct: 0.5 }],
      demand: { ...emptyStats, coverageRatio: 0.98, p95: 2_400 }, ready: { ...emptyStats, p95: 6.2 }, shape: "bursty", intensity: "elevated", behaviorClass: "bursty", confidence: "high",
      signals: { coefficientOfVariation: 1.2, activeHourSharePct: 18.5, dutyCyclePct: 31.5, baselineRatio: 0.12, utilizationP95Pct: 42.1, dailyRepeatability: 0.15, businessHoursConcentration: 0.9, nightConcentration: 1.1, weekendConcentration: 0.8 },
      ...overrides,
    };
  }

  function host(overrides: Partial<NormalizedHost> = {}): NormalizedHost {
    return {
      snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: "esx-01", cluster: "Production", datacenter: null,
      cpuModel: null, cpuTotalMHz: 76_800, cpuCores: 32, cpuThreads: null, memoryTotalMiB: null,
      version: null, build: null, vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null, vmCount: null,
      ...overrides,
    };
  }

  it("nennt die Datenquelle \"VM\" statt \"VM-Inventar\"", () => {
    const result = buildVmExportDataset([], [snapshot], "1 vCenter-Scope");
    expect(result.title).toBe("VM");
  });

  it("reichert eine VM-Zeile per vmKey mit Verhaltensklasse, Klassifikationssignalen und CPU-Demand-Rohdaten an", () => {
    const result = buildVmExportDataset([vm()], [snapshot], "1 vCenter-Scope", [profile()], [host()]);
    expect(result.rows[0]).toMatchObject({
      shape: "Bursty", intensity: "Erhöht",
      behaviorClass: "Bursty", cpuDemandRaw: "2026-07-01 02:00=412.30",
      profileConfidence: "hoch", profileCoverage: "98,0 %",
      coefficientOfVariation: "1,20", activeHourSharePct: "18,5 %", utilizationP95Pct: "42,1 %",
      dutyCyclePct: "31,5 %", baselineRatio: "0,12",
      dailyRepeatability: "0,15", businessHoursConcentration: "0,90", nightConcentration: "1,10", weekendConcentration: "0,80",
      // 76.800 MHz / 32 Kerne * 4 vCPU = 9.600 MHz konfigurierte Kapazität
      configuredCpuCapacity: "9.600",
      hwVersion: "vmx-21", toolsVersion: "12.5.0", secureBoot: "Ja",
      rightsizingDemandP95: "2.400,00", rightsizingReadyP95: "6,2 %",
      // Das Profil ist "bursty": die bedarfsgerechte Größe wird ausgewiesen, eine
      // Verkleinerung aber zurückgehalten, weil sieben Tage seltene Spitzen verfehlen können.
      usedVcpuEquivalentP95: "1,00", demandBasedVcpu: "2",
      recommendationWithheld: "Muster in 7 Tagen nicht verlässlich",
      recommendedVcpu: "4", reclaimableVcpu: "0",
      rightsizingCandidate: "Ja", manyVcpuLowDemand: "Ja", highCpuReady: "Ja",
    });
  });

  it("zeigt \"—\" für Profilspalten, wenn keine Zeitreihe zur VM passt", () => {
    const result = buildVmExportDataset([vm({ vmKey: "vm-2" })], [snapshot], "1 vCenter-Scope", [profile()], [host()]);
    expect(result.rows[0]).toMatchObject({ behaviorClass: "—", cpuDemandRaw: "—", coefficientOfVariation: "—", configuredCpuCapacity: "—", reclaimableVcpu: "—", rightsizingCandidate: "—" });
  });

  it("zählt profilierte VMs als eigene Kennzahl", () => {
    const result = buildVmExportDataset([vm(), vm({ vmKey: "vm-2", vmName: "web-01" })], [snapshot], "1 vCenter-Scope", [profile()]);
    expect(result.kpis.find((kpi) => kpi.label === "Profilierte VMs")?.value).toBe("1");
  });

  it("bietet Rightsizing-Metriken als auswählbare Exportspalten und Kennzahlen an", () => {
    // Dauerlast mit 16 vCPU: empfehlungsfähiges Muster und groß genug, dass ein Viertel
    // der Größe eine gerade Rückgabe zulässt (16 * 0,25 = 4).
    const result = buildVmExportDataset(
      [vm({ cpuCount: 16 })], [snapshot], "1 vCenter-Scope",
      [profile({ shape: "constant", behaviorClass: "constant-load", vcpu: 16 })], [host()],
    );
    expect(result.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "demandBasedVcpu", label: "Bedarfsgerecht (vCPU)" }),
      expect.objectContaining({ id: "reclaimableVcpu", label: "Rückgewinnbar (vCPU)" }),
      expect.objectContaining({ id: "recommendedVcpu", label: "Empfohlen (vCPU)" }),
      expect.objectContaining({ id: "recommendationWithheld", label: "Keine Empfehlung, weil" }),
      expect.objectContaining({ id: "rightsizingCandidate", label: "Rightsizing-Kandidat" }),
    ]));
    expect(result.rows[0]).toMatchObject({ demandBasedVcpu: "2", recommendedVcpu: "12", reclaimableVcpu: "4", recommendationWithheld: "—" });
    expect(result.kpis.find((kpi) => kpi.label === "Rightsizing-Kandidaten")?.value).toBe("1");
    expect(result.kpis.find((kpi) => kpi.label === "Rückgewinnbare vCPU")?.value).toBe("4");
  });

  it("bietet Cluster (Tech-Info), Servertyp und Notiz standardmäßig als pseudonymisierbare Spalten an", () => {
    const result = buildVmExportDataset(
      [vm({ cluster: "Production", annotation: "Kritischer Fachserver" })],
      [snapshot],
      "1 vCenter-Scope",
      [],
      [],
      [{
        vmNameNorm: "sql-01", vmName: "sql-01", importedAt: "2026-07-28T00:00:00.000Z", techInfoImportId: "ti-1", rowIndex: 0,
        serverType: "Applikationsserver", maintenanceWindow: null, operatingSystem: null, comment: null,
        sysv: null, sysvDepartment: null, sysvDeputy: null, sysvDeputyDepartment: null,
        bz: null, clusterFromTechInfo: "Production", cvBackup: null, az: null,
      }],
    );
    expect(result.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "annotation", pseudonymKind: "text" }),
      expect.objectContaining({ id: "techInfoServerType", pseudonymKind: "text" }),
      expect.objectContaining({ id: "techInfoCluster", pseudonymKind: "cluster" }),
    ]));
    const pseudonymized = pseudonymizeExportDataset(result);
    expect(pseudonymized.rows[0]).toMatchObject({
      annotation: "text-001",
      techInfoServerType: "text-002",
      // Dieselbe Zeichenkette wie im RVTools-Feld "Cluster" ergibt denselben Platzhalter.
      techInfoCluster: "cluster-001",
      cluster: "cluster-001",
    });
  });
});

describe("buildHostExportDataset", () => {
  const snapshot: SnapshotMeta = {
    snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vCenter Prod", exportTs: "2026-07-28T00:00:00.000Z",
    importedAt: "2026-07-28T00:00:00.000Z", fileName: "export.xlsx", fileChecksum: "abc", sheetStats: {},
  };
  const host: NormalizedHost = {
    snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: "esx-01", cluster: "Production", datacenter: "DC1",
    cpuModel: "Xeon", cpuTotalMHz: 76_800, cpuCores: 32, cpuThreads: 64, memoryTotalMiB: 1_048_576,
    version: "8.0.3", build: "123", vendor: "Dell Inc.", model: "PowerEdge", connectionState: "connected",
    powerState: "poweredOn", maintenanceMode: "False", vmCount: 2,
  };
  const vm = (name: string, cpuCount: number, powerState = "poweredOn"): NormalizedVm => ({
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: name, vmUuid: null, vmName: name, cluster: "Production", host: "esx-01",
    powerState, cpuCount, memoryMiB: 4096, provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null,
    consolidationNeeded: null, osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null, datacenter: "DC1",
    folder: null, resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
  });

  it("bietet Host-Hardware- und Dichtemetriken als Exportspalten an", () => {
    const result = buildHostExportDataset([host], [snapshot], "1 vCenter-Scope", [vm("vm-1", 4), vm("vm-2", 8, "poweredOff")]);
    expect(result.rows[0]).toMatchObject({
      mhzPerCore: "2.400,00", vendor: "Dell Inc.", vmsPerCore: "0,06", vcpuPerCore: "0,13",
    });
  });
});

describe("buildDatastoreExportDataset", () => {
  const snapshot: SnapshotMeta = {
    snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vCenter Prod", exportTs: "2026-07-28T00:00:00.000Z",
    importedAt: "2026-07-28T00:00:00.000Z", fileName: "export.xlsx", fileChecksum: "abc", sheetStats: {},
  };
  const datastore = (overrides: Partial<NormalizedDatastore> = {}): NormalizedDatastore => ({
    snapshotId: "snap-1", vcenterId: "vc-1", dsKey: "ds-1", name: "DS-Prod-01", clusterName: "Storage-Prod",
    hostNames: ["esx-02", "esx-01"], type: "VMFS", capacityMiB: 1_048_576, inUseMiB: 786_432,
    freeMiB: 262_144, freePct: 25, version: "6.82", siocEnabled: true,
    ...overrides,
  });

  it("liefert die wichtigsten Kapazitäts-, Host- und Lifecycle-Metriken", () => {
    const result = buildDatastoreExportDataset([datastore()], [snapshot], "1 vCenter-Scope");
    expect(result.title).toBe("Datastores");
    expect(result.rows[0]).toMatchObject({
      vcenter: "vCenter Prod", datastore: "DS-Prod-01", cluster: "Storage-Prod", type: "VMFS",
      capacity: "1.024,00 GiB", inUse: "768,00 GiB", free: "256,00 GiB",
      usedPct: "75,0 %", freePct: "25,0 %", status: "OK",
      hostCount: "2", hosts: "esx-01, esx-02", version: "6.82", sioc: "Ja",
    });
  });

  it("klassifiziert knappe Kapazität und fasst die wichtigsten Kennzahlen zusammen", () => {
    const result = buildDatastoreExportDataset([
      datastore(),
      datastore({ dsKey: "ds-2", name: "DS-Kritisch", freePct: 8, freeMiB: 81_920 }),
      datastore({ dsKey: "ds-3", name: "DS-Warnung", freePct: 15, freeMiB: 153_600 }),
    ], [snapshot], "1 vCenter-Scope");
    expect(result.rows.map((row) => row.status)).toEqual(["OK", "Kritisch", "Warnung"]);
    expect(result.kpis.find((kpi) => kpi.label === "Kritisch")?.value).toBe("1");
    expect(result.kpis.find((kpi) => kpi.label === "Warnung")?.value).toBe("1");
  });
});

describe("buildClusterExportDataset", () => {
  const snapshot: SnapshotMeta = {
    snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "vCenter Prod", exportTs: "2026-07-28T00:00:00.000Z",
    importedAt: "2026-07-28T00:00:00.000Z", fileName: "export.xlsx", fileChecksum: "abc", sheetStats: {},
  };

  function capacityRow(overrides: Partial<ClusterCapacityRow> = {}): ClusterCapacityRow {
    return {
      clusterKey: clusterScopeKey("vc-1", "DC1", "Production"),
      vcenterDisplayName: "vCenter Prod", datacenter: "DC1", cluster: "Production",
      hosts: 3, totalCores: 96, totalVms: 40,
      cpuUsagePct: 55.4, memoryUsagePct: 61.2, vcpuPerCore: 3.2, ramCommitPct: 120.5, ramActivePct: 40.1, swapBalloonPct: 0,
      hotHosts: 1, drsEnabled: true, haEnabled: true, clusterHostDelta: null, clusterMemoryDeltaPct: null,
      riskScore: 42, risk: "mittel", riskFactors: [], siteFailoverOverride: false, maxHostFailures: 1, hostFailureBreaches: [],
      vropsRamAssignedHighPct: null, vropsRamUsageHighPct: null, vropsCpuUsageHighPct: null,
      vropsClusterRamAssignedPct: null, vropsClusterCpuUsagePct: null, siteFailoverRisk: "warn", vropsMissing: false,
      ...overrides,
    };
  }

  function cluster(overrides: Partial<NormalizedCluster> = {}): NormalizedCluster {
    return {
      snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: clusterScopeKey("vc-1", "DC1", "Production"),
      name: "Production", datacenter: "DC1", haEnabled: true, drsEnabled: true,
      numHosts: 3, numCpuCores: 96, numCpuThreads: null, totalMemoryMiB: 1_048_576, totalCpuMHz: 200_000, numEffectiveHosts: 3,
      ...overrides,
    };
  }

  it("nennt die Datenquelle \"Cluster\" statt \"Cluster-Inventar\"", () => {
    const result = buildClusterExportDataset([], [snapshot], "1 vCenter-Scope");
    expect(result.title).toBe("Cluster");
  });

  it("reichert eine Cluster-Zeile per clusterKey mit Capacity-Health-Metriken an", () => {
    const result = buildClusterExportDataset([cluster()], [snapshot], "1 vCenter-Scope", [capacityRow()]);
    expect(result.rows[0]).toMatchObject({
      cluster: "Production", vms: "40", vmsPerHost: "13,33", cpuUsagePct: "55,4 %", memoryUsagePct: "61,2 %", vcpuPerCore: "3,20",
      ramCommitPct: "120,5 %", hotHosts: "1", maxHostFailures: "1", siteFailoverRisk: "Warnung",
      riskScore: "42", risk: "mittel", vropsMissing: "Nein",
    });
  });

  it("fällt auf den Abgleich über vCenter-Anzeigename und Clusternamen zurück, wenn der clusterKey abweicht", () => {
    // Simuliert den Fall, dass die Kapazitäts-Engine das Datacenter aus Host-/VM-Daten nachträglich ableitet
    // und der clusterKey dadurch vom unveränderten NormalizedCluster.clusterKey abweicht.
    const mismatchedRow = capacityRow({ clusterKey: "andere-kombination" });
    const result = buildClusterExportDataset([cluster()], [snapshot], "1 vCenter-Scope", [mismatchedRow]);
    expect(result.rows[0]?.risk).toBe("mittel");
  });

  it("zeigt \"—\" für Capacity-Spalten, wenn kein passender Cluster gefunden wird", () => {
    const orphanCluster = cluster({ name: "Ohne Kapazitätsdaten", clusterKey: clusterScopeKey("vc-1", "DC1", "Ohne Kapazitätsdaten") });
    const result = buildClusterExportDataset([orphanCluster], [snapshot], "1 vCenter-Scope", [capacityRow()]);
    expect(result.rows[0]).toMatchObject({ cpuUsagePct: "—", risk: "—", siteFailoverRisk: "—" });
  });

  it("zählt Cluster mit hohem Risiko als eigene Kennzahl", () => {
    const result = buildClusterExportDataset(
      [cluster({ name: "A" }), cluster({ name: "B", clusterKey: clusterScopeKey("vc-1", "DC1", "B") })],
      [snapshot],
      "1 vCenter-Scope",
      [capacityRow({ risk: "hoch" }), capacityRow({ clusterKey: clusterScopeKey("vc-1", "DC1", "B"), cluster: "B", risk: "niedrig" })],
    );
    expect(result.kpis.find((kpi) => kpi.label === "Cluster mit hohem Risiko")?.value).toBe("1");
  });
});
