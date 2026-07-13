import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ImportProvider } from "@/hooks/useImportController";
import {
  ONBOARDING_STORAGE_KEY,
  OnboardingProvider,
} from "@/hooks/useOnboarding";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";

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
  beforeEach(() => localStorage.clear());

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
});
