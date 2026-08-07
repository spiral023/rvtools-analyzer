import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockRightsizingState = vi.hoisted(() => ({
  level: "very-conservative" as const,
  setLevel: vi.fn(),
}));

vi.mock("@/hooks/useRamRightsizingLevel", () => ({
  useRamRightsizingLevel: () => mockRightsizingState,
}));

const { RamRightsizingLevelControl } = await import("./RamRightsizingLevelControl");

describe("RamRightsizingLevelControl", () => {
  it("warnt bei ausgewogener und offensiver Stufe wie das CPU-Rightsizing", () => {
    const { container } = render(<RamRightsizingLevelControl />);

    expect(screen.getByText(/nur 10 % Reserve/)).toBeInTheDocument();
    expect(screen.getByText(/geringste Sicherheitsreserve/)).toBeInTheDocument();
    expect(container.querySelector("svg.text-warning")).toBeInTheDocument();
    expect(container.querySelector("svg.text-destructive")).toBeInTheDocument();
  });
});
