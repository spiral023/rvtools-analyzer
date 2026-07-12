import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Impressum from "@/pages/Impressum";

describe("Impressum", () => {
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
});
