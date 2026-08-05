import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailExportDialog } from "@/components/detail/DetailExportDialog";
import type { DetailDossier } from "@/lib/detailExport";

const writeText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const downloadDetailText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/detailExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/detailExport")>()),
  downloadDetailText,
}));

function dossier(withTrend: boolean): DetailDossier {
  return {
    kind: "VM",
    title: "srv-production-01",
    titleSensitivity: "identifier",
    summary: "Konstantes Lastmuster.",
    kpis: [{ label: "vCPU", value: "8" }],
    sections: [{
      title: "Verantwortung",
      fields: [{ label: "Systemverantwortlicher", value: "Max Mustermann", sensitivity: "person" }],
    }],
    trend: withTrend
      ? {
        title: "CPU-Auslastung",
        cpuCapacityMHz: 20_000,
        secondaryLabel: "CPU Ready (%)",
        points: [
          { timestampUtc: Date.UTC(2026, 6, 25, 12), primaryValue: 2_000, primaryPeakValue: null, secondaryValue: 0.2 },
          { timestampUtc: Date.UTC(2026, 6, 26, 12), primaryValue: 8_000, primaryPeakValue: null, secondaryValue: 0.8 },
        ],
      }
      : undefined,
  };
}

function openDialog(withTrend = true) {
  render(<DetailExportDialog dossier={dossier(withTrend)} />);
  fireEvent.click(screen.getByRole("button", { name: "Kopieren / Export" }));
}

describe("DetailExportDialog", () => {
  beforeEach(() => {
    writeText.mockClear();
    downloadDetailText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("führt Kopieren und Exportieren in einem Auslöser zusammen", () => {
    render(<DetailExportDialog dossier={dossier(true)} />);

    expect(screen.getByRole("button", { name: "Kopieren / Export" })).toBeInTheDocument();
    // Die früheren zwei getrennten Bedienelemente existieren nicht mehr.
    expect(screen.queryByRole("button", { name: "Exportieren" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /als Markdown kopieren/ })).not.toBeInTheDocument();
  });

  it("bietet Datei- und Zwischenablage-Formate samt PDF an", async () => {
    openDialog();

    expect(await screen.findByRole("button", { name: /Markdown \(\.md\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confluence Wiki \(\.txt\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JSON \(\.json\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PDF · A4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JSON" })).toBeInTheDocument();
  });

  it("exportiert JSON als Datei mit passender Endung", async () => {
    openDialog();

    fireEvent.click(await screen.findByRole("button", { name: /JSON \(\.json\)/ }));

    expect(downloadDetailText).toHaveBeenCalledTimes(1);
    const [content, fileName, mime] = downloadDetailText.mock.calls[0];
    expect(fileName).toBe("vm-srv-production-01.json");
    expect(mime).toContain("application/json");
    expect(JSON.parse(content as string).title).toBe("srv-production-01");
  });

  it("kopiert Markdown in die Zwischenablage", async () => {
    openDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Markdown" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("# VM srv-production-01");
  });

  it("pseudonymisiert auf Wunsch und kennzeichnet den Dateinamen", async () => {
    openDialog();
    fireEvent.click(await screen.findByLabelText("Pseudonymisierte Fassung"));

    fireEvent.click(screen.getByRole("button", { name: /JSON \(\.json\)/ }));

    const [content, fileName] = downloadDetailText.mock.calls[0];
    expect(fileName).toBe("vm-system-001-pseudonymisiert.json");
    const parsed = JSON.parse(content as string);
    expect(parsed.pseudonymized).toBe(true);
    expect(parsed.sections[0].fields[0].value).toBe("Person-001");
  });

  it("schließt die vollständige Zeitreihe nur nach ausdrücklicher Auswahl ein", async () => {
    openDialog();

    fireEvent.click(await screen.findByRole("button", { name: /JSON \(\.json\)/ }));
    expect(JSON.parse(downloadDetailText.mock.calls[0][0] as string).trend.hourly).toBeUndefined();

    downloadDetailText.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Kopieren / Export" }));
    fireEvent.click(await screen.findByLabelText("Vollständige vROps-Zeitreihe einschließen"));
    fireEvent.click(screen.getByRole("button", { name: /JSON \(\.json\)/ }));

    expect(JSON.parse(downloadDetailText.mock.calls[0][0] as string).trend.hourly).toHaveLength(2);
  });

  it("bietet die Zeitreihen-Option nicht an, wenn keine Reihe vorliegt", async () => {
    openDialog(false);

    expect(await screen.findByRole("button", { name: /JSON \(\.json\)/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vollständige vROps-Zeitreihe einschließen")).not.toBeInTheDocument();
  });
});
