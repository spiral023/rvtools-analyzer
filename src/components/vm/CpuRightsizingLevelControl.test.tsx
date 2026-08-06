import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const mockRightsizingState = vi.hoisted(() => ({
  level: "very-conservative" as const,
  setLevel: vi.fn(),
}));

vi.mock("@/hooks/useCpuRightsizingLevel", () => ({
  useCpuRightsizingLevel: () => mockRightsizingState,
}));

const { CpuRightsizingLevelControl } = await import("./CpuRightsizingLevelControl");

function renderControl() {
  return render(
    <TooltipProvider>
      <CpuRightsizingLevelControl />
    </TooltipProvider>,
  );
}

describe("CpuRightsizingLevelControl", () => {
  it("zeigt Zielauslastungen ohne Gleitkommaartefakte", () => {
    renderControl();

    expect(screen.getByText("Max · P95 55% · Spitze 80%")).toBeInTheDocument();
    expect(screen.queryByText(/55\.000/)).not.toBeInTheDocument();
  });

  it("behält die Hervorhebung der aktiven Stufe trotz Tooltip-Wrapper", () => {
    // Ein TooltipTrigger mit asChild direkt am ToggleGroupItem überschreibt dessen
    // data-state; der Wrapper verhindert genau das.
    renderControl();

    const active = screen.getByRole("radio", { name: /Sehr vorsichtig/ });
    expect(active).toHaveAttribute("data-state", "on");
  });

  it("warnt bei knapper Reserve abgestuft in Gelb und Rot", () => {
    renderControl();

    expect(screen.getByText(/nur 10 % Reserve in der Spitze/)).toBeInTheDocument();
    expect(screen.getByText(/geringste Sicherheitsreserve/)).toBeInTheDocument();
  });
});
