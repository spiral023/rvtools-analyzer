import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/dashboard/EmptyState";

function renderWithRouter(node: ReactNode) {
  return render(
    <MemoryRouter
      initialEntries={["/network"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/network" element={node} />
        <Route path="/upload" element={<div>Upload-Ziel</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EmptyState", () => {
  it("rendert die Zielaktion als echten Link und navigiert normal", () => {
    const view = renderWithRouter(
      <EmptyState
        title="Keine Daten"
        description="Importieren Sie zuerst Daten."
        actionLabel="Daten importieren"
        actionTo="/upload"
      />,
    );

    const action = screen.getByRole("link", { name: "Daten importieren" });
    expect(action).toHaveAttribute("href", "/upload");
    expect(view.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(action);
    expect(screen.getByText("Upload-Ziel")).toBeInTheDocument();
  });

  it("rendert Children ohne Zielaktion unverändert", () => {
    renderWithRouter(
      <EmptyState title="Keine Daten" description="Noch keine Einträge.">
        <button type="button">Sekundäre Aktion</button>
      </EmptyState>,
    );

    expect(screen.getByRole("button", { name: "Sekundäre Aktion" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
