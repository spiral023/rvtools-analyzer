import { describe, expect, it } from "vitest";
import {
  buildExportDataFromDataset,
  buildManagementMarkdown,
  pseudonymizeExportDataset,
  type ExportStudioDataset,
} from "./exportStudio";
import { buildCsvTable } from "./tableExport";

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
