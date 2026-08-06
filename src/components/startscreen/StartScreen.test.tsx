import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartScreen } from "@/components/startscreen/StartScreen";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import type { ImportQueueItem } from "@/hooks/useImportController";

const { importFiles, useImportControllerMock } = vi.hoisted(() => ({
  importFiles: vi.fn(),
  useImportControllerMock: vi.fn(),
}));

vi.mock("@/hooks/useImportController", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportController")>()),
  useImportController: useImportControllerMock,
}));

const FILE_DRAG = { types: ["Files"] };

function renderStartScreen() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <StartScreen />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function queueItem(patch: Partial<ImportQueueItem> = {}): ImportQueueItem {
  return {
    id: "item-1",
    fileName: "datensatz.zip",
    progress: null,
    result: null,
    status: "running",
    ...patch,
  };
}

describe("StartScreen", () => {
  beforeEach(() => {
    importFiles.mockClear();
    useImportControllerMock.mockReset();
    useImportControllerMock.mockReturnValue({
      importing: false,
      items: [],
      rejectedFileNames: [],
      importFiles,
    });
  });

  it("nennt beide Datensatzarten samt ihrer Folge für den Modus", () => {
    renderStartScreen();

    expect(screen.getByRole("heading", { name: "RVTools Analyzer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Der Datensatz bestimmt den Modus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vollständiger Datensatz" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bereichs-Datensatz" })).toBeInTheDocument();
  });

  it("nimmt eine Datei überall im Fenster an, nicht nur über der Ablagefläche", () => {
    const { container } = renderStartScreen();
    const shell = container.querySelector(".startscreen-shell");
    const file = new File(["zip"], "datensatz.zip");

    fireEvent.drop(shell!, { dataTransfer: { ...FILE_DRAG, files: [file] } });

    expect(importFiles).toHaveBeenCalledOnce();
  });

  it("zeigt den Fortschritt an der Stelle der Ablagefläche", () => {
    useImportControllerMock.mockReturnValue({
      importing: true,
      items: [queueItem({ progress: { step: "Cluster lesen", percent: 40, detail: "" } })],
      rejectedFileNames: [],
      importFiles,
    });

    renderStartScreen();

    expect(screen.getByText("Datensatz wird gelesen")).toBeInTheDocument();
    expect(screen.getByText("Cluster lesen")).toBeInTheDocument();
    expect(screen.getByText("40 %")).toBeInTheDocument();
    expect(screen.queryByText("ZIP-Datensatz hier ablegen")).not.toBeInTheDocument();
  });

  it("bleibt nach einem gescheiterten Import auf dem Fehler stehen", () => {
    useImportControllerMock.mockReturnValue({
      importing: false,
      items: [queueItem({ status: "error", result: { success: false, warnings: [], errors: ["Kein gültiges Paket"] } })],
      rejectedFileNames: [],
      importFiles,
    });

    renderStartScreen();

    expect(screen.getByText("Datensatz konnte nicht gelesen werden")).toBeInTheDocument();
    expect(screen.getByText("Kein gültiges Paket")).toBeInTheDocument();
  });

  it("schaltet zwischen dunklem und hellem Design um", () => {
    renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "Zu hellem Design wechseln" }));

    expect(document.documentElement).toHaveClass("light");
    expect(screen.getByRole("button", { name: "Zu dunklem Design wechseln" })).toBeInTheDocument();
  });
});
