import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NotFound from "@/pages/NotFound";

describe("NotFound", () => {
  it("zeigt den nicht gefundenen Pfad und passende Navigationsziele", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={["/missing/report"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Diese Seite gibt es nicht." })).toBeInTheDocument();
    expect(screen.getAllByText("/missing/report")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Zur Übersicht/ })).toHaveAttribute("href", "/overview");
    expect(screen.getByRole("link", { name: /Zum Upload/ })).toHaveAttribute("href", "/upload");

    consoleError.mockRestore();
  });
});
