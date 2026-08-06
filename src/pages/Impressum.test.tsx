import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Impressum from "@/pages/Impressum";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderImpressum() {
  return render(
    <TooltipProvider>
      <Impressum />
    </TooltipProvider>,
  );
}

describe("Impressum", () => {
  it("zeigt Marke, lokale Datenverarbeitung und Kontaktdaten", () => {
    renderImpressum();

    expect(screen.getByRole("img", { name: "RVTools Analyzer Logo" })).toHaveAttribute(
      "src",
      "/favicon-master.png",
    );
    expect(screen.getByRole("heading", { name: "RVTools Analyzer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deine Daten bleiben lokal" })).toBeInTheDocument();
    expect(screen.getByText("Philipp Asanger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "philipp.asanger@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:philipp.asanger@gmail.com",
    );
  });

  it("verlinkt die weiteren Tools als externe Links mit Icon", () => {
    renderImpressum();

    expect(screen.getByRole("heading", { name: "Weitere Anwendungen von Philipp Asanger" })).toBeInTheDocument();

    const fenstertageLink = screen.getByRole("link", { name: "Fenstertage" });
    expect(fenstertageLink).toHaveAttribute("href", "https://fenstertage.com");
    expect(fenstertageLink).toHaveAttribute("target", "_blank");
    expect(fenstertageLink).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByRole("link", { name: "Mermaid Editor" })).toHaveAttribute(
      "href",
      "https://mermaid.sp23.online/",
    );
  });
});
