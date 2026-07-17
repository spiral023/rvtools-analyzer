import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import { MaintenanceWindowEditor } from "./MaintenanceWindowEditor";

function definition(overrides: Partial<MaintenanceWindowDefinition> = {}): MaintenanceWindowDefinition {
  return {
    id: "window-1",
    abbreviation: "STD",
    normalizedAbbreviation: "std",
    description: "Standardwartung",
    handling: "regular",
    weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof MaintenanceWindowEditor>> = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onDuplicate = vi.fn();
  const onDirtyChange = vi.fn();
  const value = definition();
  const view = render(
    <MaintenanceWindowEditor
      value={value}
      onSave={onSave}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onDirtyChange={onDirtyChange}
      {...overrides}
    />,
  );
  return { ...view, value, onSave, onDelete, onDuplicate, onDirtyChange };
}

function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("MaintenanceWindowEditor", () => {
  it("validiert eine erforderliche und eindeutige Abkürzung", () => {
    renderEditor({ existingAbbreviations: ["OTHER"] });
    const abbreviation = screen.getByLabelText("Abkürzung");

    fireEvent.change(abbreviation, { target: { value: "  " } });
    expect(screen.getByText("Bitte geben Sie eine Abkürzung ein.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();

    fireEvent.change(abbreviation, { target: { value: " other " } });
    expect(screen.getByText("Diese Abkürzung ist bereits vergeben.")).toBeInTheDocument();
    expect(abbreviation).toHaveAttribute("aria-invalid", "true");
  });

  it("klont lokal, meldet Dirty-Übergänge und setzt nur bei neuer gespeicherter Version zurück", () => {
    const { value, onDirtyChange, rerender, unmount } = renderEditor();
    const description = screen.getByLabelText("Beschreibung");
    fireEvent.change(description, { target: { value: "Lokal geändert" } });

    expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(value.description).toBe("Standardwartung");

    rerender(
      <MaintenanceWindowEditor
        value={{ ...value, description: "Neue Parent-Referenz" }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Lokal geändert");

    rerender(
      <MaintenanceWindowEditor
        value={{ ...value, updatedAt: "2026-01-03T00:00:00.000Z", description: "Gespeicherter Stand" }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Gespeicherter Stand");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("wendet die Zeitregel für Werktage an", () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Werktage auswählen" }));
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "08:00" } });
    fireEvent.change(screen.getByLabelText("Endzeit"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Zeitregel anwenden" }));

    for (let day = 0; day < 5; day += 1) {
      expect(container.querySelector('[data-day="' + day + '"][data-slot="16"]')).toHaveAttribute("data-allowed", "true");
      expect(container.querySelector('[data-day="' + day + '"][data-slot="25"]')).toHaveAttribute("data-allowed", "true");
      expect(container.querySelector('[data-day="' + day + '"][data-slot="26"]')).toHaveAttribute("data-allowed", "false");
    }
    expect(container.querySelector('[data-day="5"][data-slot="16"]')).toHaveAttribute("data-allowed", "false");
  });

  it("übernimmt eine Zeitregel über Mitternacht und meldet unvollständige Regeln", () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByLabelText("Montag"));
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("Endzeit"), { target: { value: "02:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Zeitregel anwenden" }));
    expect(container.querySelector('[data-day="0"][data-slot="44"]')).toHaveAttribute("data-allowed", "true");
    expect(container.querySelector('[data-day="1"][data-slot="3"]')).toHaveAttribute("data-allowed", "true");

    fireEvent.click(screen.getByLabelText("Montag"));
    fireEvent.click(screen.getByRole("button", { name: "Zeitregel anwenden" }));
    expect(screen.getByText("Wählen Sie mindestens einen Wochentag aus.")).toBeInTheDocument();
  });

  it("macht immer verfügbar, ohne externe oder freigabepflichtige Import-Slots umzuschreiben", () => {
    const imported = definition({ weeklySlots: (() => {
      const slots = Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"];
      slots[0][0] = true;
      return slots;
    })() });
    const { container } = renderEditor({ value: imported });

    fireEvent.click(screen.getByRole("button", { name: "jederzeit" }));
    expect(container.querySelectorAll('[data-allowed="true"]')).toHaveLength(336);

    selectOption("Behandlung", "Extern verwaltet");
    expect(container.querySelectorAll('[data-allowed="true"]')).toHaveLength(336);
    expect(screen.getByRole("button", { name: "jederzeit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zeitregel anwenden" })).toBeDisabled();
    expect(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, erlaubt" })).toBeDisabled();

    selectOption("Behandlung", "Freigabe erforderlich");
    expect(container.querySelectorAll('[data-allowed="true"]')).toHaveLength(336);
  });

  it("macht beim Auswahlwert Immer verfügbar alle Slots erlaubt", () => {
    const { container } = renderEditor();

    selectOption("Behandlung", "Immer verfügbar");

    expect(container.querySelectorAll('[data-allowed="true"]')).toHaveLength(336);
  });

  it("setzt Immer verfügbar beim vollständigen Sperren auf regulär zurück", () => {
    renderEditor();
    selectOption("Behandlung", "Immer verfügbar");
    fireEvent.click(screen.getByRole("button", { name: "alles sperren" }));

    expect(screen.getByLabelText("Behandlung")).toHaveTextContent("Regulär");
  });

  it("setzt Immer verfügbar bei einer Raster-Sperre auf regulär zurück", () => {
    renderEditor();
    selectOption("Behandlung", "Immer verfügbar");
    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, erlaubt" }));

    expect(screen.getByLabelText("Behandlung")).toHaveTextContent("Regulär");
  });

  it("setzt Immer verfügbar bei einer sperrenden Zeitregel auf regulär zurück", () => {
    renderEditor();
    selectOption("Behandlung", "Immer verfügbar");
    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    fireEvent.click(screen.getByLabelText("Montag"));
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "08:00" } });
    fireEvent.change(screen.getByLabelText("Endzeit"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Zeitregel anwenden" }));

    expect(screen.getByRole("gridcell", { name: "Montag 08:00–08:30, gesperrt" })).toBeInTheDocument();
    expect(screen.getByLabelText("Behandlung")).toHaveTextContent("Regulär");
  });

  it("verwaltet Monatsregeln ohne äquivalente Duplikate", () => {
    renderEditor();
    selectOption("Wochentag im Monat", "Montag");
    fireEvent.click(screen.getByLabelText("Erster"));
    fireEvent.click(screen.getByLabelText("Letzter"));
    fireEvent.click(screen.getByRole("button", { name: "Monatsregel hinzufügen" }));
    expect(screen.getByText("Montag: erster, letzter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Monatsregel hinzufügen" }));
    expect(screen.getAllByText("Montag: erster, letzter")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Monatsregel Montag: erster, letzter entfernen" }));
    expect(screen.queryByText("Montag: erster, letzter")).not.toBeInTheDocument();
  });

  it("zeigt inverse externe Rohmasken für jeden Wochentag", () => {
    const slots = Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"];
    slots[0][0] = true;
    renderEditor({ value: definition({ weeklySlots: slots }) });
    fireEvent.click(screen.getByText("Rohmasken anzeigen"));
    const mondayMask = screen.getAllByText(/^Montag:/)[1].textContent?.split(": ")[1] ?? "";
    expect(mondayMask).toHaveLength(48);
    expect(mondayMask.startsWith("0")).toBe(true);
  });

  it("übernimmt Rasteränderungen und speichert eine normalisierte, geklonte Definition", async () => {
    const { value, onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText("Abkürzung"), { target: { value: "  Neu  " } });
    fireEvent.click(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as MaintenanceWindowDefinition;
    expect(saved).toMatchObject({ id: value.id, createdAt: value.createdAt, abbreviation: "Neu", normalizedAbbreviation: "neu" });
    expect(saved.updatedAt).not.toBe(value.updatedAt);
    expect(saved.weeklySlots[0][0]).toBe(true);
    expect(saved.weeklySlots).not.toBe(value.weeklySlots);
  });

  it("reicht Duplizieren und Löschen weiter und sperrt Speichern beim laufenden Vorgang", () => {
    const { value, onDuplicate, onDelete } = renderEditor({ isSaving: true });
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Duplizieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onDuplicate).toHaveBeenCalledWith(value);
    expect(onDelete).toHaveBeenCalledWith(value);
  });

  it("verknüpft die zentralen Bedienelemente über zugängliche Namen", () => {
    renderEditor();
    expect(screen.getByLabelText("Beschreibung")).toBeInTheDocument();
    expect(screen.getByLabelText("Behandlung")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erlaubt einzeichnen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sperren" })).toBeInTheDocument();
  });
});
