import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => vi.clearAllMocks());

  it("protokolliert alle Rückmeldungen eines nicht gespeicherten Dateisatzes", async () => {
    importVropsTimeSeriesFileSet.mockImplementation(async (_files, _snapshotIds, onProgress) => {
      onProgress?.({ step: "Zeitreihen im Worker parsen", percent: 30, detail: "VM, Cluster und Host" });
      return {
        success: false,
        warnings: ["Eine optionale Host-Metrik fehlt."],
        errors: ["Stundenraster der HOST-CSV passt nicht zur VM-CSV: 1 fehlende und 1 zusätzliche Stunde(n)."],
        gridDiagnostics: [
          { objectType: "vm", slotCount: 168, rangeStartUtc: Date.parse("2026-07-21T00:00:00Z"), rangeEndUtc: Date.parse("2026-07-27T23:00:00Z"), missingHourlySlots: 0, missingFromVmCount: 0, additionalToVmCount: 0, missingFromVmSamples: [], additionalToVmSamples: [] },
          { objectType: "cluster", slotCount: 168, rangeStartUtc: Date.parse("2026-07-21T00:00:00Z"), rangeEndUtc: Date.parse("2026-07-27T23:00:00Z"), missingHourlySlots: 0, missingFromVmCount: 0, additionalToVmCount: 0, missingFromVmSamples: [], additionalToVmSamples: [] },
          { objectType: "host", slotCount: 168, rangeStartUtc: Date.parse("2026-07-21T00:00:00Z"), rangeEndUtc: Date.parse("2026-07-28T00:00:00Z"), missingHourlySlots: 0, missingFromVmCount: 1, additionalToVmCount: 1, missingFromVmSamples: [Date.parse("2026-07-25T05:00:00Z")], additionalToVmSamples: [Date.parse("2026-07-28T00:00:00Z")] },
        ],
      };
    });
    const secondSnapshot = { ...snapshot, snapshotId: "snapshot-2", vcenterId: "vc-2", vcenterDisplayName: "vCenter 2" };
    render(<MemoryRouter><VropsTimeSeriesImportDialog snapshots={[snapshot, secondSnapshot]} onImported={vi.fn()} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "vROps-Zeitreihen importieren" }));
    fireEvent.click(screen.getByLabelText("vCenter 1 auswählen"));
    fireEvent.click(screen.getByLabelText("vCenter 2 auswählen"));
    for (const slot of ["vm", "cluster", "host"]) {
      fireEvent.change(document.getElementById(`vrops-timeseries-${slot}`)!, { target: { files: [new File(["csv"], `${slot}.csv`, { type: "text/csv" })] } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Dateisatz prüfen und speichern" }));

    await waitFor(() => expect(screen.getByRole("group", { name: "vROps-Importprotokoll" })).toBeInTheDocument());
    expect(importVropsTimeSeriesFileSet).toHaveBeenCalledWith(expect.anything(), ["snapshot-1", "snapshot-2"], expect.any(Function));
    const log = screen.getByRole("group", { name: "vROps-Importprotokoll" });
    expect(within(log).getByText("Zeitreihen im Worker parsen")).toBeInTheDocument();
    expect(within(log).getByText("Eine optionale Host-Metrik fehlt.")).toBeInTheDocument();
    expect(within(log).getByText("Stundenraster der HOST-CSV passt nicht zur VM-CSV: 1 fehlende und 1 zusätzliche Stunde(n).")).toBeInTheDocument();
    expect(screen.getAllByText("Import nicht gespeichert")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Importfehler" })).toHaveTextContent("Stundenraster der HOST-CSV passt nicht zur VM-CSV");
    const gridDetails = screen.getByLabelText("Stundenraster-Details");
    expect(within(gridDetails).getByText("Host · 168 Zeitpunkte")).toBeInTheDocument();
    expect(within(gridDetails).getByText(/Abgleich mit VM: 1 fehlend · 1 zusätzlich/)).toBeInTheDocument();
  });
});
