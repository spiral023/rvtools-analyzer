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

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve!, reject: reject! };
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

  // Rendert/rerendert das 336-Zellen-Grid mehrfach; unter Last reißt das 5000ms-Standard-Timeout.
  it("bewahrt einen schmutzigen lokalen Entwurf bei einem importierten Update desselben Fensters", () => {
    const { value, onDirtyChange, rerender, unmount } = renderEditor();
    const description = screen.getByLabelText("Beschreibung");
    fireEvent.change(description, { target: { value: "Lokal geändert" } });
    fireEvent.click(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" }));

    expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(value.description).toBe("Standardwartung");

    rerender(
      <MaintenanceWindowEditor
        value={{
          ...value,
          updatedAt: "2026-01-03T00:00:00.000Z",
          description: "Importierter Persistenzstand",
          weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(true)) as MaintenanceWindowDefinition["weeklySlots"],
        }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Lokal geändert");
    expect(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, erlaubt" })).toBeInTheDocument();
    expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();

    rerender(
      <MaintenanceWindowEditor
        value={{ ...value, id: "window-2", updatedAt: "2026-01-04T00:00:00.000Z", description: "Neu ausgewählt" }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Neu ausgewählt");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  }, 15000);

  it("übernimmt einen neueren Persistenzstand desselben Fensters bei sauberem Entwurf", () => {
    const { value, rerender } = renderEditor();

    rerender(
      <MaintenanceWindowEditor
        value={{ ...value, updatedAt: "2026-01-03T00:00:00.000Z", description: "Gespeicherter Stand" }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Gespeicherter Stand");
  });

  it("zieht ein während Dirty ignoriertes Update nach, sobald der Entwurf wieder sauber ist", () => {
    const { value, rerender } = renderEditor();
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Lokal geändert" } });
    const imported = { ...value, updatedAt: "2026-01-03T00:00:00.000Z", description: "Nachgezogener Persistenzstand" };

    rerender(
      <MaintenanceWindowEditor value={imported} onSave={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Lokal geändert");

    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: value.description } });
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Nachgezogener Persistenzstand");
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

  it("normalisiert eingehende Always-Fenster für Anzeige und Speichern", async () => {
    const inconsistent = definition({
      handling: "always",
      calendarRules: [{ weekday: 0, occurrences: [1, "last"] }],
    });
    const onSave = vi.fn();
    const { container } = renderEditor({ value: inconsistent, onSave });

    expect(container.querySelectorAll('[data-allowed="true"]')).toHaveLength(336);
    expect(screen.queryByText("Montag: erster, letzter")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Bereinigt" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ handling: "always", calendarRules: [] });
    expect((onSave.mock.calls[0][0] as MaintenanceWindowDefinition).weeklySlots.flat()).toEqual(Array<boolean>(336).fill(true));
  });

  it("löscht Monatsregeln beim Auswählen von Always und jederzeit", () => {
    const withRule = definition({ calendarRules: [{ weekday: 0, occurrences: [1] }] });
    const { rerender } = renderEditor({ value: withRule });

    selectOption("Behandlung", "Immer verfügbar");
    expect(screen.queryByText("Montag: erster")).not.toBeInTheDocument();

    rerender(
      <MaintenanceWindowEditor
        value={{ ...withRule, id: "window-2", updatedAt: "2026-01-04T00:00:00.000Z" }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "jederzeit" }));
    expect(screen.queryByText("Montag: erster")).not.toBeInTheDocument();
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

  it("führt Monatsregel-Vorkommen pro Wochentag kanonisch zusammen", async () => {
    const { onSave } = renderEditor();
    fireEvent.click(screen.getByLabelText("Erster"));
    fireEvent.click(screen.getByRole("button", { name: "Monatsregel hinzufügen" }));
    fireEvent.click(screen.getByLabelText("Letzter"));
    fireEvent.click(screen.getByRole("button", { name: "Monatsregel hinzufügen" }));

    expect(screen.getAllByText("Montag: erster, letzter")).toHaveLength(1);
    expect(screen.queryByText("Montag: erster", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0][0] as MaintenanceWindowDefinition).calendarRules).toEqual([
      { weekday: 0, occurrences: [1, "last"] },
    ]);
  });

  it.each(["Extern verwaltet", "Freigabe erforderlich"])("deaktiviert alle Zeitplan- und Kalenderwerkzeuge bei %s", (handling) => {
    renderEditor({ value: definition({ calendarRules: [{ weekday: 0, occurrences: [1] }] }) });
    selectOption("Behandlung", handling);

    ["jederzeit", "alles sperren", "Werktage auswählen", "Wochenende auswählen", "Zeitregel anwenden", "Erlaubt einzeichnen", "Sperren", "Monatsregel hinzufügen"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    });
    ["Montag", "Startzeit", "Endzeit", "Wochentag im Monat", "Erster"].forEach((name) => {
      expect(screen.getByLabelText(name)).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Monatsregel Montag: erster entfernen" })).toBeDisabled();
    expect(screen.getByRole("gridcell", { name: "Montag 00:00–00:30, gesperrt" })).toBeDisabled();
    expect(screen.getByText("Montag: erster")).toBeInTheDocument();
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

  it("sperrt Aktionen beim laufenden Speichern", () => {
    const { value, onDuplicate, onDelete } = renderEditor({ isSaving: true });
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplizieren" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Duplizieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onDuplicate).not.toHaveBeenCalledWith(value);
    expect(onDelete).not.toHaveBeenCalledWith(value);
  });

  it("sperrt alle Bearbeitungs- und Aktionsfelder während eines ausstehenden Speicherns", async () => {
    const saving = deferred<void>();
    const onSave = vi.fn(() => saving.promise);
    renderEditor({ onSave });
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Wird gespeichert" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    ["Speichern", "Duplizieren", "Löschen", "jederzeit", "Erlaubt einzeichnen"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    });
    expect(screen.getByLabelText("Abkürzung")).toBeDisabled();
    expect(screen.getByLabelText("Behandlung")).toBeDisabled();

    saving.resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Duplizieren" })).not.toBeDisabled());
  });

  it("bestätigt den eigenen erfolgreichen Speichervorgang als sauberen Entwurf", async () => {
    const saving = deferred<void>();
    const onSave = vi.fn<(value: MaintenanceWindowDefinition) => Promise<void>>(() => saving.promise);
    const onDirtyChange = vi.fn();
    const value = definition();
    const { rerender } = render(
      <MaintenanceWindowEditor value={value} onSave={onSave} onDelete={vi.fn()} onDuplicate={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Eigener gespeicherter Stand" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const saved = await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      return onSave.mock.calls[0][0] as MaintenanceWindowDefinition;
    });

    expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();
    saving.resolve();
    await waitFor(() => expect(screen.queryByText("Ungespeicherte Änderungen")).not.toBeInTheDocument());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    rerender(
      <MaintenanceWindowEditor value={saved} onSave={onSave} onDelete={vi.fn()} onDuplicate={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Eigener gespeicherter Stand");
    expect(screen.queryByText("Ungespeicherte Änderungen")).not.toBeInTheDocument();
  });

  it("fängt asynchrone Speicherfehler mit einer zugänglichen Meldung ab", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("Netzwerk nicht erreichbar")));
    renderEditor({ onSave });
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Speicherfehler" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Netzwerk nicht erreichbar");
    expect(screen.getByRole("button", { name: "Speichern" })).not.toBeDisabled();
  });

  it("meldet den aktuellen Dirty-Status direkt an einen ersetzten Callback", () => {
    const initialCallback = vi.fn();
    const replacementCallback = vi.fn();
    const value = definition();
    const { rerender, unmount } = render(
      <MaintenanceWindowEditor value={value} onSave={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onDirtyChange={initialCallback} />,
    );
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "Lokal" } });

    rerender(
      <MaintenanceWindowEditor value={value} onSave={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onDirtyChange={replacementCallback} />,
    );
    expect(replacementCallback).toHaveBeenCalledWith(true);
    unmount();
    expect(replacementCallback).toHaveBeenLastCalledWith(false);
  });

  it("verknüpft die zentralen Bedienelemente über zugängliche Namen", () => {
    renderEditor();
    expect(screen.getByLabelText("Beschreibung")).toBeInTheDocument();
    expect(screen.getByLabelText("Behandlung")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erlaubt einzeichnen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sperren" })).toBeInTheDocument();
  });
});
