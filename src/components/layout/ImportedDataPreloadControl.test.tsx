import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ImportedDataPreloadControl } from "@/components/layout/ImportedDataPreloadControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ImportProvider, useImportController } from "@/hooks/useImportController";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import type { ImportedDataPreloadRunner } from "@/hooks/useImportedDataPreload";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn() }));

const mockedImport = vi.mocked(importRvtoolsXlsx);

function renderControl(preload: ImportedDataPreloadRunner, hasData = async () => true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ImportedDataPreloadControl preload={preload} hasData={hasData} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("ImportedDataPreloadControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blockiert die App und erklärt Dauer, schnellen Speicher und Fortschritt", async () => {
    let finish!: () => void;
    const preload = vi.fn<ImportedDataPreloadRunner>(async (_queryClient, options) => {
      options?.onProgress?.({
        phase: "loading",
        currentLabel: "RVTools-Rohdaten: vCPU",
        completedSteps: 4,
        totalSteps: 10,
        processedRecords: 1234,
        percent: 40,
      });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { processedRecords: 1234, totalSteps: 10 };
    });
    renderControl(preload);
    const button = await screen.findByRole("button", { name: "Alle importierten Daten vorladen" });

    fireEvent.click(button);

    expect(await screen.findByRole("dialog", { name: "Daten vorladen und Auswertungen berechnen" })).toBeInTheDocument();
    expect(document.querySelector(".backdrop-blur-md")).toBeInTheDocument();
    expect(screen.getByText(/1–2 Minuten/)).toBeInTheDocument();
    expect(screen.getByText(/eine Stunde/)).toBeInTheDocument();
    expect(screen.getAllByText(/IndexedDB/)).toHaveLength(2);
    expect(screen.getByText("RVTools-Rohdaten: vCPU")).toBeInTheDocument();
    expect(screen.getByText(/1\.234 Datensätze verarbeitet/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(button).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("markiert die drei Abschnitte passend zur gemeldeten Phase", async () => {
    let report!: (phase: "preparing" | "loading" | "computing", label: string) => void;
    const preload = vi.fn<ImportedDataPreloadRunner>(async (_queryClient, options) => {
      report = (phase, currentLabel) => options?.onProgress?.({
        phase,
        currentLabel,
        completedSteps: 40,
        totalSteps: 41,
        processedRecords: 9000,
        percent: 98,
      });
      await new Promise<void>(() => {});
      return { processedRecords: 0, totalSteps: 0 };
    });
    renderControl(preload);
    fireEvent.click(await screen.findByRole("button", { name: "Alle importierten Daten vorladen" }));
    await screen.findByRole("dialog");

    const stageTexts = () => screen.getAllByRole("listitem").map((item) => item.textContent ?? "");

    // Phase 1: nur das Inventar läuft, die späteren Abschnitte sind noch nummeriert.
    expect(stageTexts()[0]).toContain("Inventar erfassen – läuft");
    expect(stageTexts()[2]).toContain("Fill-Up-Auswertung berechnen – steht aus");

    // Phase 3: Der Rechenschritt erklärt, warum die Leiste bei 98 % kaum noch steigt.
    act(() => report("computing", "Fill-Up-Planung: Standardauswertung"));
    expect(stageTexts()[0]).toContain("Inventar erfassen – abgeschlossen");
    expect(stageTexts()[1]).toContain("Daten in den Arbeitsspeicher laden – abgeschlossen");
    expect(stageTexts()[2]).toContain("Fill-Up-Auswertung berechnen – läuft");
    expect(screen.getByText("Fill-Up-Planung: Standardauswertung")).toBeInTheDocument();
  });

  it("bestätigt Erfolg und verhindert parallele Starts", async () => {
    let finish!: () => void;
    const preload = vi.fn<ImportedDataPreloadRunner>(() => new Promise((resolve) => {
      finish = () => resolve({ processedRecords: 22000, totalSteps: 20 });
    }));
    renderControl(preload);
    const button = await screen.findByRole("button", { name: "Alle importierten Daten vorladen" });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(preload).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/22\.000/)));
  });

  it("zeigt Fehler verständlich an und ermöglicht einen neuen Versuch", async () => {
    const preload = vi.fn<ImportedDataPreloadRunner>()
      .mockRejectedValueOnce(new Error("RVTools-Rohdaten: vDisk: Blob beschädigt"))
      .mockResolvedValueOnce({ processedRecords: 12, totalSteps: 2 });
    renderControl(preload);
    fireEvent.click(await screen.findByRole("button", { name: "Alle importierten Daten vorladen" }));

    expect(await screen.findByText(/Blob beschädigt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    await waitFor(() => expect(preload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("zeigt keinen Hinweis ohne importierte Daten", async () => {
    renderControl(vi.fn<ImportedDataPreloadRunner>(), async () => false);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Alle importierten Daten vorladen" })).not.toBeInTheDocument());
  });

  it("zeigt den roten Vorlade-Hinweis und blendet ihn nach Erfolg aus", async () => {
    let finish!: () => void;
    const preload = vi.fn<ImportedDataPreloadRunner>(() => new Promise((resolve) => {
      finish = () => resolve({ processedRecords: 5, totalSteps: 1 });
    }));
    renderControl(preload);
    const button = await screen.findByRole("button", { name: "Alle importierten Daten vorladen" });

    expect(button).toHaveTextContent("Daten vorladen");
    expect(button).toHaveClass("bg-destructive");

    fireEvent.click(button);
    await act(async () => finish());

    await waitFor(() => expect(screen.queryByRole("button", { name: "Alle importierten Daten vorladen" })).not.toBeInTheDocument());
  });

  it("startet das Vorladen automatisch nach einem erfolgreichen Datei-Upload", async () => {
    mockedImport.mockResolvedValue({ success: true, fileKind: "rvtools", warnings: [], errors: [] });
    const preload = vi.fn<ImportedDataPreloadRunner>().mockResolvedValue({ processedRecords: 5, totalSteps: 1 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Harness() {
      const { importFiles } = useImportController();
      return (
        <>
          <ImportedDataPreloadControl preload={preload} hasData={async () => true} />
          <button onClick={() => void importFiles([new File(["a"], "a.xlsx")])}>upload</button>
        </>
      );
    }

    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <ImportProvider>
            <Harness />
          </ImportProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(preload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "upload" }));

    await waitFor(() => expect(preload).toHaveBeenCalledTimes(1));
  });
});
