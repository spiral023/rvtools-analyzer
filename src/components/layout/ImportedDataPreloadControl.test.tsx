import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ImportedDataPreloadControl } from "@/components/layout/ImportedDataPreloadControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ImportedDataPreloadRunner } from "@/hooks/useImportedDataPreload";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

    expect(await screen.findByRole("dialog", { name: "Importierte Daten werden vorgeladen" })).toBeInTheDocument();
    expect(document.querySelector(".backdrop-blur-md")).toBeInTheDocument();
    expect(screen.getByText(/1–3 Minuten/)).toBeInTheDocument();
    expect(screen.getByText(/eine Stunde/)).toBeInTheDocument();
    expect(screen.getAllByText(/IndexedDB/)).toHaveLength(2);
    expect(screen.getByText("RVTools-Rohdaten: vCPU")).toBeInTheDocument();
    expect(screen.getByText(/1\.234 Datensätze verarbeitet/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(button).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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

  it("deaktiviert die Aktion ohne importierte Daten", async () => {
    renderControl(vi.fn<ImportedDataPreloadRunner>(), async () => false);
    expect(await screen.findByRole("button", { name: "Alle importierten Daten vorladen" })).toBeDisabled();
  });
});
