import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportResult } from "@/domain/models/types";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import { ImportProvider } from "@/hooks/useImportController";
import {
  ONBOARDING_STORAGE_KEY,
  OnboardingProvider,
} from "@/hooks/useOnboarding";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";

vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockedImport = vi.mocked(importRvtoolsXlsx);

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ImportProvider>
          <OnboardingProvider>
            <OnboardingDialog />
          </OnboardingProvider>
        </ImportProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    mockedImport.mockReset();
  });

  it("zeigt vier Seiten und schließt mit gespeichertem Status ab", () => {
    renderDialog();

    expect(screen.getByRole("img", { name: "RVTools Analyzer Logo" })).toHaveAttribute(
      "src",
      "/favicon-master.png",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));
    expect(screen.getByRole("heading", { name: "Datenbasis hinzufügen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Der globale Systemfilter" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(screen.getByRole("heading", { name: "Datenbasis hinzufügen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Die wichtigsten Werkzeuge" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyse öffnen" }));

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("kennzeichnet die adaptive Onboarding-Fläche und den Fortschritt", () => {
    renderDialog();

    const page = screen.getByRole("heading", { name: /Infrastruktur/ }).closest("main");
    expect(page).toHaveAttribute("data-direction", "forward");
    expect(page).toHaveClass("onboarding-page");
    expect(screen.getByRole("dialog")).toHaveClass("onboarding-surface", "bg-background");
    expect(screen.getByLabelText("Onboarding-Fortschritt")).toHaveClass(
      "onboarding-progress-track",
    );
  });

  it("fokussiert beim ersten Öffnen den Dialog statt eines Bedienelements", async () => {
    renderDialog();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(screen.getByRole("heading", { name: /Infrastruktur/ })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Überspringen" })).not.toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("setzt die Tour während eines laufenden Imports fort", async () => {
    let finishImport!: (value: ImportResult) => void;
    mockedImport.mockImplementation((_file, onProgress) => {
      onProgress?.({ step: "Rohdaten speichern", percent: 61, detail: "infra.xlsx" });
      return new Promise((resolve) => {
        finishImport = resolve;
      });
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));

    fireEvent.change(screen.getByLabelText(/Excel-Dateien auswählen/i), {
      target: { files: [new File(["x"], "infra.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("heading", { name: "Der globale Systemfilter" })).toBeInTheDocument();
    expect(await screen.findByText("61 %")).toBeInTheDocument();
    await act(async () => {
      finishImport({ success: true, fileKind: "rvtools", warnings: [], errors: [] });
    });
    expect(await screen.findByText("Import abgeschlossen")).toBeInTheDocument();
  });

  it("bietet nach einem Importfehler eine neue Auswahl und die Upload-Seite an", async () => {
    mockedImport.mockResolvedValue({
      success: false,
      fileKind: "rvtools",
      warnings: [],
      errors: ["Datei beschädigt"],
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));

    fireEvent.change(screen.getByLabelText(/Excel-Dateien auswählen/i), {
      target: { files: [new File(["x"], "broken.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("broken.xlsx: Datei beschädigt");
    expect(screen.getByRole("link", { name: "Zu Uploads & Snapshots" })).toHaveAttribute(
      "href",
      "/upload",
    );
    expect(screen.getByLabelText("Andere Excel-Dateien auswählen")).toHaveAttribute("multiple");
  });

  it("markiert Escape als gesehen und schließt den Dialog", () => {
    renderDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
  });

  it("fokussiert nach dem Seitenwechsel die neue Überschrift", async () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Datenbasis hinzufügen" })).toHaveFocus();
    });
  });

  it("beschriftet Fortschritt und Mehrfachauswahl ohne reine Farbcodierung", () => {
    renderDialog();
    expect(screen.getByLabelText("Onboarding-Fortschritt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));

    expect(screen.getByLabelText(/Excel-Dateien auswählen/i)).toHaveAttribute("multiple");
  });
});
