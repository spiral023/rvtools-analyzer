import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHART_COLORS } from "@/lib/chartStyles";
import { VM_WORKLOAD_SHAPE_CHART_COLOR } from "@/lib/workloadShapeColors";
import { UtilizationPercentCell, WorkloadShapeBadge } from "./WorkloadBadges";

describe("Lastmuster-Farben", () => {
  it("ordnet jedem Lastmuster dauerhaft eine eigene Chart-Farbe zu", () => {
    expect(VM_WORKLOAD_SHAPE_CHART_COLOR).toEqual({
      constant: CHART_COLORS.primary,
      "business-hours": CHART_COLORS.info,
      "night-batch": CHART_COLORS.purple,
      weekend: CHART_COLORS.success,
      bursty: CHART_COLORS.danger,
      variable: CHART_COLORS.warning,
      irregular: CHART_COLORS.pink,
      unclassified: CHART_COLORS.secondary,
    });
  });

  it("zeigt das Lastmuster-Badge in seiner festen Farbe", () => {
    render(<WorkloadShapeBadge shape="night-batch" />);

    expect(screen.getByText("Nächtlicher Batch")).toHaveStyle({ color: CHART_COLORS.purple });
  });
});

describe("CPU-Demand-P95-Ampel", () => {
  it.each([
    [2.5, "text-destructive"],
    [2.6, "text-warning"],
    [5, "text-warning"],
    [5.1, ""],
    [95, "text-warning"],
    [101, "text-destructive"],
  ])("färbt %s %% mit %s", (value, expectedClass) => {
    const { container } = render(<UtilizationPercentCell value={value} />);
    const cell = container.querySelector("span");
    if (expectedClass) expect(cell).toHaveClass(expectedClass);
    else expect(cell).not.toHaveClass("text-warning", "text-destructive");
  });
});
