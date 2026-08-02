import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockRightsizingState = vi.hoisted(() => ({
  level: "very-conservative" as const,
  setLevel: vi.fn(),
}));

vi.mock("@/hooks/useCpuRightsizingLevel", () => ({
  useCpuRightsizingLevel: () => mockRightsizingState,
}));

const { CpuRightsizingLevelControl } = await import("./CpuRightsizingLevelControl");

describe("CpuRightsizingLevelControl", () => {
  it("zeigt Zielauslastungen ohne Gleitkommaartefakte", () => {
    render(<CpuRightsizingLevelControl />);

    expect(screen.getByText("Max · P95 55% · Spitze 80%")).toBeInTheDocument();
    expect(screen.queryByText(/55\.000/)).not.toBeInTheDocument();
  });
});
