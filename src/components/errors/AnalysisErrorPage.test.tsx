import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AnalysisErrorPage } from "@/components/errors/AnalysisErrorPage";

describe("AnalysisErrorPage", () => {
  it("zeigt eine verwertbare Ursache und kopiert den vollständigen Fehlerbericht", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.history.replaceState({}, "", "/clusters?tab=overview");

    render(
      <MemoryRouter>
        <AnalysisErrorPage error={new Error("Could not find yAxis by id secondary")} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Diagramm konnte nicht aufgebaut werden");
    expect(screen.getByText("Cluster-Analyse")).toBeInTheDocument();
    expect(screen.getByText("Could not find yAxis by id secondary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Analysedetails kopieren" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("# RVTools Analyzer – Fehlerbericht");
    expect(writeText.mock.calls[0][0]).toContain("Analysebereich: Cluster-Analyse");
    expect(screen.getByRole("button", { name: "Analysedetails kopiert" })).toBeInTheDocument();
  });
});
