import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VmWorkloadHourlyPoint } from "@/domain/models/types";
import { vmWorkloadProfileFixture } from "@/test/fixtures/vmWorkload";
import { VmWeekProfileSparkline } from "./VmWeekProfileSparkline";

const HOUR_MS = 60 * 60 * 1_000;

function profile() {
  return vmWorkloadProfileFixture({
    objectKey: "vm-profile",
    hourly: Array.from({ length: 14 * 24 }, (_, index): VmWorkloadHourlyPoint => ({
      timestampUtc: Date.UTC(2024, 0, 8) + index * HOUR_MS,
      cpuDemandMHz: index === 200 ? null : 100 + (index % 24) * 10,
      cpuDemandMaxMHz: null,
      cpuReadyPct: null,
    })),
  });
}

describe("VmWeekProfileSparkline", () => {
  it("kennzeichnet letzte und durchschnittliche Woche zugänglich", () => {
    const workload = profile();
    const { rerender } = render(<VmWeekProfileSparkline profile={workload} />);
    expect(screen.getByRole("img", { name: "CPU Demand der letzten sieben Tage" })).toBeInTheDocument();

    rerender(<VmWeekProfileSparkline profile={workload} mode="average" />);
    expect(screen.getByRole("img", { name: "Durchschnittliche CPU-Demand-Woche" })).toBeInTheDocument();
  });

  it("mittelt Messlücken aus anderen Wochen und zeichnet Tagesgrenzen", () => {
    const { container } = render(<VmWeekProfileSparkline profile={profile()} mode="average" />);
    expect(container.querySelectorAll("line")).toHaveLength(6);
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });
});
