import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import { MaintenanceWeekGrid } from "./MaintenanceWeekGrid";

type WeeklySlots = MaintenanceWindowDefinition["weeklySlots"];

function emptySlots(): WeeklySlots {
  return Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as WeeklySlots;
}

function ControlledGrid({ initial = emptySlots(), paintMode = "allow" }: {
  initial?: WeeklySlots;
  paintMode?: "allow" | "block";
}) {
  const [value, setValue] = useState(initial);
  return <MaintenanceWeekGrid value={value} onChange={setValue} paintMode={paintMode} />;
}

describe("MaintenanceWeekGrid", () => {
  it("stellt jede Wochenhälfte mit einem eindeutigen deutschen Zellnamen bereit", () => {
    const value = emptySlots();
    value[2][15] = true;

    render(<MaintenanceWeekGrid value={value} onChange={vi.fn()} paintMode="allow" />);

    expect(screen.getByRole("grid", { name: "Wöchentlicher Zeitplan" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(336);
    expect(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" }))
      .toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("gridcell", { name: "Mittwoch 07:30–08:00, erlaubt" }))
      .toHaveAttribute("data-allowed", "true");
  });

  it("setzt per Klick eine erlaubte Zeit immutabel", () => {
    const value = emptySlots();
    const onChange = vi.fn();
    render(<MaintenanceWeekGrid value={value} onChange={onChange} paintMode="allow" />);

    fireEvent.click(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" }));

    const changed = onChange.mock.calls[0][0] as WeeklySlots;
    expect(changed[0][0]).toBe(true);
    expect(changed).not.toBe(value);
    expect(changed[0]).not.toBe(value[0]);
    expect(value[0][0]).toBe(false);
  });

  it("setzt mit Leertaste den aktuellen Malmodus", () => {
    render(<ControlledGrid />);
    const cell = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" });

    fireEvent.keyDown(cell, { key: " " });

    expect(cell).toHaveAttribute("data-allowed", "true");
  });

  it("setzt mit Enter den aktuellen Malmodus", () => {
    render(<ControlledGrid paintMode="block" initial={(() => {
      const value = emptySlots();
      value[0][0] = true;
      return value;
    })()} />);
    const cell = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, erlaubt" });

    fireEvent.keyDown(cell, { key: "Enter" });

    expect(cell).toHaveAttribute("data-allowed", "false");
  });

  it("ignoriert Eingaben im deaktivierten Zustand", () => {
    const onChange = vi.fn();
    render(<MaintenanceWeekGrid value={emptySlots()} onChange={onChange} paintMode="allow" disabled />);
    const cell = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" });

    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: " " });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("verschiebt den Fokus mit Pfeiltasten und umschließt die Wochengrenze", () => {
    render(<ControlledGrid />);
    const last = screen.getByRole("gridcell", { name: "Sonntag 23:30–00:00, gesperrt" });
    const first = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" });
    last.focus();

    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(last).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(screen.getByRole("gridcell", { name: "Sonntag 00:00–00:30, gesperrt" })).toHaveFocus();
  });

  it("zeigt die kompakte Übersicht ohne 336 interaktive Tabstopps", () => {
    const value = emptySlots();
    value[5][20] = true;
    const { container } = render(
      <MaintenanceWeekGrid value={value} onChange={vi.fn()} paintMode="allow" compact />,
    );

    expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector('[data-day="5"][data-slot="20"]')).toHaveAttribute("data-allowed", "true");
  });

  it("bemalt beim Ziehen mindestens zwei aufeinanderfolgende Zeitfenster", () => {
    const onChange = vi.fn();
    render(<MaintenanceWeekGrid value={emptySlots()} onChange={onChange} paintMode="allow" />);
    const first = screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" });
    const second = screen.getByRole("gridcell", { name: "Montag 00:30–01:00, gesperrt" });

    fireEvent.pointerDown(first, { button: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerEnter(second, { buttons: 1, pointerId: 1 });
    fireEvent.pointerUp(second, { button: 0, pointerId: 1 });

    const changed = onChange.mock.calls.at(-1)?.[0] as WeeklySlots;
    expect(changed[0][0]).toBe(true);
    expect(changed[0][1]).toBe(true);
  });
});
