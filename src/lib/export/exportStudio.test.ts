import { describe, expect, it } from "vitest";
import {
  buildClusterExportDataset,
  buildExportDataFromDataset,
  buildManagementMarkdown,
  pseudonymizeExportDataset,
  type ExportStudioDataset,
} from "./exportStudio";
import { buildCsvTable } from "./tableExport";
import type { ClusterCapacityRow } from "@/lib/clusterCapacityWorkspace";
import type { NormalizedCluster, SnapshotMeta } from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";

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
  it("pseudonymisiert Bezeichner je Domäne konsistent und nur in markierten Spalten", () => {
    const result = pseudonymizeExportDataset(dataset);
    expect(result.rows[0]).toEqual({ vcenter: "vcenter-01", server: "server-001", cluster: "cluster-001", state: "poweredOn" });
    expect(result.rows[1]).toEqual({ vcenter: "vcenter-01", server: "server-002", cluster: "cluster-001", state: "poweredOff" });
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
      cluster: "Production", cpuUsagePct: "55,4 %", memoryUsagePct: "61,2 %", vcpuPerCore: "3,20",
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
