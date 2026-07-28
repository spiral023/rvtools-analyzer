import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotMeta } from "@/domain/models/types";
import { VropsTimeSeriesImportDialog } from "./VropsTimeSeriesImportDialog";

const { importVropsTimeSeriesFileSet } = vi.hoisted(() => ({
  importVropsTimeSeriesFileSet: vi.fn(),
}));

vi.mock("@/domain/services/vropsTimeSeriesImportService", () => ({ importVropsTimeSeriesFileSet }));

const snapshot: SnapshotMeta = {
  snapshotId: "snapshot-1",
  vcenterId: "vc-1",
  vcenterDisplayName: "vCenter 1",
  exportTs: "2026-07-28T10:00:00.000Z",
  importedAt: "2026-07-28T10:01:00.000Z",
  fileName: "rvtools.xlsx",
  fileChecksum: "checksum",
  sheetStats: {},
};

describe("VropsTimeSeriesImportDialog", () => {
  it("protokolliert alle Rückmeldungen eines nicht gespeicherten Dateisatzes", async () => {
    importVropsTimeSeriesFileSet.mockImplementation(async (_files, _snapshotIds, onProgress) => {
      onProgress?.({ step: "Zeitreihen im Worker parsen", percent: 30, detail: "VM, Cluster und Host" });
      return { success: false, warnings: ["Eine optionale Host-Metrik fehlt."], errors: ["Zeile 42: Ungültiger Zeitstempel."] };
    });
    render(<MemoryRouter><VropsTimeSeriesImportDialog snapshots={[snapshot]} onImported={vi.fn()} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "vROps-Zeitreihen importieren" }));
    fireEvent.change(screen.getByLabelText("RVTools-Snapshot / vCenter-Scope"), { target: { value: snapshot.snapshotId } });
    for (const slot of ["vm", "cluster", "host"]) {
      fireEvent.change(document.getElementById(`vrops-timeseries-${slot}`)!, { target: { files: [new File(["csv"], `${slot}.csv`, { type: "text/csv" })] } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Dateisatz prüfen und speichern" }));

    await waitFor(() => expect(screen.getByRole("group", { name: "vROps-Importprotokoll" })).toBeInTheDocument());
    const log = screen.getByRole("group", { name: "vROps-Importprotokoll" });
    expect(within(log).getByText("Zeitreihen im Worker parsen")).toBeInTheDocument();
    expect(within(log).getByText("Eine optionale Host-Metrik fehlt.")).toBeInTheDocument();
    expect(within(log).getByText("Zeile 42: Ungültiger Zeitstempel.")).toBeInTheDocument();
    expect(screen.getAllByText("Import nicht gespeichert")).toHaveLength(2);
  });
});
