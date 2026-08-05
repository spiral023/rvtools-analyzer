import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel } from "@/components/uploads/DiagnosticsPanel";
import type { DiagnosticsResult } from "@/hooks/useDiagnostics";

const diagnostics: DiagnosticsResult = {
  snapshots: [{
    snapshotId: "snap-1",
    fileName: "rvtools.xlsx",
    fileSizeBytes: 1024,
    importDurationMs: 1000,
    sheetStats: {},
  }] as unknown as DiagnosticsResult["snapshots"],
  stores: [
    { storeName: "entities_vms", count: 12, estimatedSizeBytes: 2048 },
    { storeName: "entities_hosts", count: 3, estimatedSizeBytes: 1024 },
  ],
  storage: { supported: true, usageBytes: 4096, quotaBytes: 8192 },
  sampleQuery: { rowCount: 12, durationMs: 4 },
  memory: { supported: false, usedJSHeapSizeBytes: null, totalJSHeapSizeBytes: null },
  cache: [{ queryKey: "vms", entryCount: 12 }, { queryKey: "hosts", entryCount: 3 }],
  queryTimings: [],
};

vi.mock("@/components/dashboard/KpiCard", () => ({
  KpiCard: ({ title }: { title: string }) => <div data-testid="diagnostics-kpi">{title}</div>,
}));
vi.mock("@/components/dashboard/KpiGrid", () => ({
  KpiGrid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("DiagnosticsPanel", () => {
  it("zeigt sechs Diagnose-KPIs", () => {
    render(<DiagnosticsPanel data={diagnostics} isFetching={false} />);

    expect(screen.getAllByTestId("diagnostics-kpi").map((card) => card.textContent)).toEqual([
      "Snapshots",
      "IndexedDB-Einträge",
      "Speicher belegt",
      "Daten-Stores",
      "Query-Cache",
      "Messungen",
    ]);
  });

  it("stellt die Kennzahlen an den Anfang, noch vor den Analyse-Export", () => {
    render(<DiagnosticsPanel data={diagnostics} isFetching={false} />);

    const kpiSection = screen.getByLabelText("Diagnose-Kennzahlen");
    const exportButton = screen.getByRole("button", { name: /Analyse-Export herunterladen/ });

    expect(kpiSection.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("bietet den Analyse-Export an", () => {
    // Dieses Panel ist der einzige erreichbare Einstieg in die Diagnose
    // (`/upload?tab=diagnostics`); die gleichnamige Seite unter `pages/` ist
    // nicht geroutet. Der Test hält fest, dass der Export hier hängt.
    render(<DiagnosticsPanel data={diagnostics} isFetching={false} />);

    expect(screen.getByRole("button", { name: /Analyse-Export herunterladen/ })).toBeInTheDocument();
  });

  it("enthält keinen eigenen Aktualisieren-Knopf – der steht in der Kopfzeile der Seite", () => {
    render(<DiagnosticsPanel data={diagnostics} isFetching={false} />);

    expect(screen.queryByRole("button", { name: "Aktualisieren" })).not.toBeInTheDocument();
  });

  it("meldet den laufenden Erstabruf, solange keine Messwerte vorliegen", () => {
    render(<DiagnosticsPanel data={undefined} isFetching />);

    expect(screen.getByText("Lade Diagnosedaten…")).toBeInTheDocument();
    expect(screen.queryAllByTestId("diagnostics-kpi")).toHaveLength(0);
  });
});
