import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CoverageSlot } from "@/lib/maintenanceWindowCoverage";
import { MaintenanceCoverageHeatmap } from "./MaintenanceCoverageHeatmap";

function makeSlots(days: number, countAt: Record<string, number> = {}): CoverageSlot[] {
  const slots: CoverageSlot[] = [];
  for (let day = 0; day < days; day += 1) {
    const date = new Date(2026, 6, 1 + day);
    for (let slot = 0; slot < 48; slot += 1) {
      slots.push({ date, slot, count: countAt[`${day}-${slot}`] ?? 0 });
    }
  }
  return slots;
}

describe("MaintenanceCoverageHeatmap", () => {
  it("rendert eine Zelle je Tag und Halbstunden-Slot", () => {
    const slots = makeSlots(3);
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={null} />);

    expect(container.querySelectorAll(".maintenance-heatmap__cell")).toHaveLength(3 * 48);
    expect(container.querySelectorAll(".maintenance-heatmap__row")).toHaveLength(3);
  });

  it("hebt die Zelle am currentIndex mit der Klasse 'is-current' hervor", () => {
    const slots = makeSlots(2);
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={48} />);

    const cells = container.querySelectorAll(".maintenance-heatmap__cell");
    expect(cells[48]).toHaveClass("is-current");
    expect(cells[0]).not.toHaveClass("is-current");
  });

  it("markiert Zellen über ein Datenattribut mit ihrer Systemanzahl", () => {
    const slots = makeSlots(1, { "0-5": 4 });
    const { container } = render(<MaintenanceCoverageHeatmap slots={slots} currentIndex={null} />);

    const cells = container.querySelectorAll(".maintenance-heatmap__cell");
    expect(cells[5]).toHaveAttribute("data-count", "4");
    expect(cells[0]).toHaveAttribute("data-count", "0");
  });
});
