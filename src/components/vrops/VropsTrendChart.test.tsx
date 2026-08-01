import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/recharts", () => {
  const Responsive = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Chart = ({ children }: { children?: ReactNode }) => <svg>{children}</svg>;
  const Empty = (): null => null;
  return {
    Area: Empty,
    CartesianGrid: Empty,
    ComposedChart: Chart,
    Line: Empty,
    ReferenceArea: Empty,
    ReferenceDot: ({ yAxisId }: { yAxisId?: string }) => <g data-testid={`reference-dot-${yAxisId}`} />,
    ReferenceLine: Empty,
    ResponsiveContainer: Responsive,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: ({ yAxisId }: { yAxisId?: string }) => <g data-testid={`axis-${yAxisId}`} />,
  };
});

const { VropsTrendChart } = await import("@/components/vrops/VropsTrendChart");

const hourly = [{
  timestampUtc: new Date(2026, 7, 1, 10).getTime(),
  cpuDemandMHz: 2_000,
  cpuDemandMaxMHz: 3_000,
  secondaryValue: 32_000,
}];

describe("VropsTrendChart", () => {
  it("rendert ohne sekundäre Beschriftung keinen Peak auf einer nicht vorhandenen Achse", () => {
    render(
      <VropsTrendChart
        hourly={hourly}
        cpuCapacityMHz={10_000}
        secondaryCapacity={64_000}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("axis-cpu")).toBeInTheDocument();
    expect(screen.queryByTestId("axis-secondary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reference-dot-secondary")).not.toBeInTheDocument();
  });

  it("zeigt den sekundären Peak nur zusammen mit der zugehörigen Achse", () => {
    render(
      <VropsTrendChart
        hourly={hourly}
        cpuCapacityMHz={10_000}
        secondaryCapacity={64_000}
        secondaryLabel="RAM-Auslastung"
        secondaryUnit="MiB"
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("axis-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("reference-dot-secondary")).toBeInTheDocument();
  });
});
