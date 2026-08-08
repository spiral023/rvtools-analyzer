import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/recharts", () => {
  const Responsive = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Chart = ({ children }: { children?: ReactNode }) => <svg>{children}</svg>;
  const Empty = (): null => null;
  const Reference = ({ y1, y2, yAxisId }: { y1?: number; y2?: number; yAxisId?: string }) => (
    <g data-testid={`reference-area-${yAxisId ?? "default"}-${y1 ?? "x"}`} data-y2={y2} />
  );
  return {
    Area: Empty,
    CartesianGrid: Empty,
    ComposedChart: Chart,
    Line: Empty,
    ReferenceArea: Reference,
    ReferenceDot: ({ yAxisId, label }: { yAxisId?: string; label?: { value?: string } }) => <g data-testid={`reference-dot-${yAxisId}`} data-label={label?.value} />,
    ReferenceLine: Empty,
    ResponsiveContainer: Responsive,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: ({ yAxisId, domain, tickFormatter }: { yAxisId?: string; domain?: unknown; tickFormatter?: (value: number) => string }) => (
      <g data-testid={`axis-${yAxisId}`} data-domain={JSON.stringify(domain)} data-tick-label={tickFormatter?.(0.437056)} />
    ),
  };
});

const { VropsTrendChart } = await import("@/components/vrops/VropsTrendChart");

const hourly = [{
  timestampUtc: new Date(2026, 7, 1, 10).getTime(),
  primaryValue: 2_000,
  primaryPeakValue: 3_000,
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

    expect(screen.getByTestId("axis-primary")).toBeInTheDocument();
    expect(screen.getByTestId("axis-primary")).toHaveAttribute("data-tick-label", "0,44 %");
    expect(screen.queryByTestId("axis-secondary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reference-dot-secondary")).not.toBeInTheDocument();
    expect(screen.getByTestId("reference-dot-primary")).toHaveAttribute("data-label", "Peak · 30,00 %");
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
    expect(screen.getByTestId("reference-dot-secondary")).toHaveAttribute("data-label", "Peak · 50,00 %");
  });

  it("zeichnet die Vermeidungszone im Prozentmodus vollständig von 80 bis 100 Prozent", () => {
    render(
      <VropsTrendChart
        hourly={[{ ...hourly[0], primaryValue: 7_500, primaryPeakValue: 9_000 }]}
        cpuCapacityMHz={10_000}
        secondaryCapacity={null}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("reference-area-primary-80")).toHaveAttribute("data-y2", "100");
    expect(screen.getByTestId("reference-area-primary-0")).toHaveAttribute("data-y2", "10");
    expect(screen.getByTestId("axis-primary")).toHaveAttribute("data-domain", JSON.stringify(["dataMin", 100]));
  });

  it("zeichnet im RAM-Verlauf keine Vermeidungszone, wenn beide Grenzen deaktiviert sind", () => {
    render(
      <VropsTrendChart
        hourly={[{ timestampUtc: hourly[0].timestampUtc, primaryValue: 62, primaryPeakValue: 94, secondaryValue: null }]}
        primaryMetric="memory-workload"
        cpuCapacityMHz={null}
        memoryCapacityMiB={16_384}
        secondaryCapacity={null}
        avoidanceThresholdPct={null}
        lowAvoidanceThresholdPct={null}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.queryByTestId("reference-area-primary-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reference-area-primary-80")).not.toBeInTheDocument();
  });

  it("skaliert die CPU-Absolutachse in GHz, sobald der Peak über 1.000 MHz liegt", () => {
    render(
      <VropsTrendChart
        hourly={[{ ...hourly[0], primaryValue: 2_000, primaryPeakValue: 3_000 }]}
        cpuCapacityMHz={null}
        secondaryCapacity={null}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("reference-dot-primary")).toHaveAttribute("data-label", "Peak · 3,00 GHz");
    // Ohne Formatter stünde hier der rohe Rechenwert „0,437056“ ohne Einheit.
    expect(screen.getByTestId("axis-primary")).toHaveAttribute("data-tick-label", "0,44 GHz");
  });

  it("bleibt bei kleinen VMs in MHz, damit aus 318 MHz kein „0,32“ wird", () => {
    render(
      <VropsTrendChart
        hourly={[{ ...hourly[0], primaryValue: 220, primaryPeakValue: 318 }]}
        cpuCapacityMHz={null}
        secondaryCapacity={null}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("reference-dot-primary")).toHaveAttribute("data-label", "Peak · 318,00 MHz");
    expect(screen.getByTestId("axis-primary")).toHaveAttribute("data-tick-label", "0,44 MHz");
  });

  it("beschriftet die Sekundärachse in GiB statt mit rohen Nachkommastellen", () => {
    render(
      <VropsTrendChart
        hourly={hourly}
        cpuCapacityMHz={null}
        secondaryCapacity={null}
        secondaryLabel="RAM-Auslastung"
        secondaryUnit="MiB"
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("axis-secondary")).toHaveAttribute("data-tick-label", "0,44 GiB");
  });

  it("liest die RAM-Reihe als Prozentwerte des konfigurierten RAM und markiert die Policy-Schwelle", () => {
    render(
      <VropsTrendChart
        hourly={[{ timestampUtc: hourly[0].timestampUtc, primaryValue: 62, primaryPeakValue: 94, secondaryValue: null }]}
        primaryMetric="memory-workload"
        cpuCapacityMHz={null}
        memoryCapacityMiB={16_384}
        secondaryCapacity={null}
        avoidanceThresholdPct={90}
        hasImport
        isMatched
        isLoading={false}
      />,
    );

    // Prozentachse ohne CPU-Kapazität: die Rohreihe ist bereits relativ zum RAM.
    expect(screen.getByTestId("axis-primary")).toHaveAttribute("data-tick-label", "0,44 %");
    expect(screen.getByTestId("reference-dot-primary")).toHaveAttribute("data-label", "Peak · 94,00 %");
    expect(screen.getByTestId("reference-area-primary-90")).toHaveAttribute("data-y2", "100");
  });
});
