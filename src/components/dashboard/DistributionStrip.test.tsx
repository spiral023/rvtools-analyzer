import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DistributionStrip } from "@/components/dashboard/DistributionStrip";

describe("DistributionStrip", () => {
  it("beschriftet die sekundäre Einheit mit ihrem eindeutigen Bezug", () => {
    render(
      <DistributionStrip
        label="Ø CPU Demand je VM"
        stats={{ count: 5, min: 100, p25: 150, p50: 200, p75: 250, p95: 300, max: 400, average: 220 }}
        format={(value) => `${value} MHz`}
        secondaryFormat={(value) => `${value / 64} %`}
        secondaryLabel="Anteil an Ø konfigurierter CPU-Kapazität je VM"
      />,
    );

    expect(screen.getByText(/Anteil an Ø konfigurierter CPU-Kapazität je VM: Median 3.125 %/)).toBeInTheDocument();
    expect(screen.queryByText(/davon/i)).not.toBeInTheDocument();
  });
});
