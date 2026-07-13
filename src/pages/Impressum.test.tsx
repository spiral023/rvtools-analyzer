import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Impressum from "@/pages/Impressum";

const { openOnboarding } = vi.hoisted(() => ({ openOnboarding: vi.fn() }));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => ({ openOnboarding }),
}));

describe("Impressum", () => {
  beforeEach(() => openOnboarding.mockClear());

  it("zeigt Marke, lokale Datenverarbeitung und Kontaktdaten", () => {
    render(<Impressum />);

    expect(screen.getByRole("img", { name: "RVTools Analyzer Logo" })).toHaveAttribute(
      "src",
      "/favicon-master.png",
    );
    expect(screen.getByRole("heading", { name: "RVTools Analyzer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ihre Daten bleiben lokal" })).toBeInTheDocument();
    expect(screen.getByText("Philipp Asanger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "philipp.asanger@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:philipp.asanger@gmail.com",
    );
  });

  it("startet das Onboarding erneut", () => {
    render(<Impressum />);

    fireEvent.click(screen.getByRole("button", { name: "Onboarding erneut starten" }));

    expect(openOnboarding).toHaveBeenCalledOnce();
  });
});
