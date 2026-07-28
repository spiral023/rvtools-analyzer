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

  it("sortiert vCenter-Snapshots alphabetisch und ordnet mehrere CSVs über ihre Dateinamen zu", () => {
    const aSnapshot = { ...snapshot, snapshotId: "snapshot-a", vcenterId: "vc-a", vcenterDisplayName: "A vCenter" };
    const zSnapshot = { ...snapshot, snapshotId: "snapshot-z", vcenterId: "vc-z", vcenterDisplayName: "Z vCenter" };
    render(<MemoryRouter><VropsTimeSeriesImportDialog snapshots={[zSnapshot, aSnapshot]} onImported={vi.fn()} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "vROps-Zeitreihen importieren" }));
    expect(screen.getAllByRole("checkbox").map((input) => input.getAttribute("aria-label"))).toEqual([
      "A vCenter auswählen",
      "Z vCenter auswählen",
    ]);
    fireEvent.change(document.getElementById("vrops-timeseries-files")!, {
      target: { files: [
        new File(["csv"], "A VM vSphere World.csv", { type: "text/csv" }),
        new File(["csv"], "A Cluster vSphere World.csv", { type: "text/csv" }),
        new File(["csv"], "A Host vSphere World.csv", { type: "text/csv" }),
      ] },
    });

    expect(screen.getByText("A VM vSphere World.csv")).toBeInTheDocument();
    expect(screen.getByText("A Cluster vSphere World.csv")).toBeInTheDocument();
    expect(screen.getByText("A Host vSphere World.csv")).toBeInTheDocument();
  });

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
    fireEvent.change(document.getElementById("vrops-timeseries-files")!, {
      target: { files: [
        new File(["csv"], "export VM.csv", { type: "text/csv" }),
        new File(["csv"], "export Cluster.csv", { type: "text/csv" }),
        new File(["csv"], "export Host.csv", { type: "text/csv" }),
      ] },
    });
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
