import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import { MaintenanceWindowImportDialog } from "./MaintenanceWindowImportDialog";

const BLOCKED_MASK = "1".repeat(48);

function importBlock(abbreviation: string, description: string, masks = Array(7).fill(BLOCKED_MASK)) {
  return [abbreviation, description, ...masks].join("\n");
}

function definition(overrides: Partial<MaintenanceWindowDefinition> = {}): MaintenanceWindowDefinition {
  return {
    id: "existing-1",
    abbreviation: "GLEICH",
    normalizedAbbreviation: "gleich",
    description: "Unverändert",
    handling: "regular",
    weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof MaintenanceWindowImportDialog>> = {}) {
  const defaultOnOpenChange = vi.fn();
  const defaultOnImport = vi.fn();
  const onOpenChange = overrides.onOpenChange ?? defaultOnOpenChange;
  const onImport = (overrides.onImport ?? defaultOnImport) as typeof defaultOnImport;
  const view = render(
    <MaintenanceWindowImportDialog
      open
      onOpenChange={defaultOnOpenChange}
      existing={[]}
      onImport={defaultOnImport}
      {...overrides}
    />,
  );
  return { ...view, onOpenChange, onImport };
}

function checkText(text: string) {
  fireEvent.change(screen.getByLabelText("Wartungsfenster-Text"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Text prüfen" }));
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

describe("MaintenanceWindowImportDialog", () => {
  it("zeigt parse errors an und lässt fehlerhafte Einträge nicht importieren", () => {
    renderDialog();
    checkText(importBlock("FEHLER", "Ungültige Maske", [`${"0".repeat(47)}x`, ...Array(6).fill(BLOCKED_MASK)]));

    expect(screen.getByText("Fehler")).toBeInTheDocument();
    expect(screen.getByText(/Montag: Die Maske darf nur 0 und 1 enthalten/i)).toBeInTheDocument();
    expect(screen.getByLabelText("FEHLER auswählen")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
  });

  it("importiert nur einzeln ausgewählte neue oder aktualisierte Einträge", async () => {
    const existing = definition({ abbreviation: "UPDATE", normalizedAbbreviation: "update", description: "Vorher" });
    const { onImport } = renderDialog({ existing: [existing] });
    checkText([
      importBlock("NEU", "Neue Regel"),
      importBlock("UPDATE", "Nachher"),
    ].join("\n"));

    expect(screen.getByText("Neu: 1")).toBeInTheDocument();
    expect(screen.getByText("Aktualisierung: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("UPDATE auswählen"));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl importieren" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0]).toHaveLength(1);
    expect(onImport.mock.calls[0][0][0]).toMatchObject({ abbreviation: "NEU" });
  });

  it("schließt unveränderte Einträge von der Standardauswahl und vom Import aus", async () => {
    const unchanged = definition();
    const { onImport } = renderDialog({ existing: [unchanged] });
    checkText(importBlock("GLEICH", "Unverändert"));

    expect(screen.getByText("Unverändert: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("GLEICH auswählen")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("lässt Warnungen auswählen und zeigt inferierte Behandlung sowie Monatsregeln", () => {
    renderDialog();
    checkText(importBlock("WARNUNG", "1. Sonntag im Monat; Änderungen nur nach Rücksprache; Montag 08:00 - 10:00"));

    expect(screen.getByText("Warnungen: 1")).toBeInTheDocument();
    expect(screen.getByText("Freigabe erforderlich")).toBeInTheDocument();
    expect(screen.getByText("Sonntag: erster")).toBeInTheDocument();
    const selectable = screen.getByLabelText("WARNUNG auswählen");
    expect(selectable).not.toBeDisabled();
    fireEvent.click(selectable);
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
    fireEvent.click(selectable);
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).not.toBeDisabled();
  });

  it("verwirft eine veraltete Vorschau nach einer Textänderung", () => {
    renderDialog();
    checkText(importBlock("NEU", "Neue Regel"));
    expect(screen.getByText("NEU")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Wartungsfenster-Text"), { target: { value: importBlock("ANDERS", "Andere Regel") } });
    expect(screen.queryByText("NEU")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
  });

  it("behält Text, Vorschau und Auswahl bei harmlosen Parent-Rerenders geöffnet", () => {
    const { rerender, onOpenChange, onImport } = renderDialog();
    const importedText = importBlock("NEU", "Neue Regel");
    checkText(importedText);

    rerender(
      <MaintenanceWindowImportDialog
        open
        onOpenChange={onOpenChange}
        existing={[]}
        onImport={onImport}
      />,
    );

    expect(screen.getByLabelText("Wartungsfenster-Text")).toHaveValue(importedText);
    expect(screen.getByText("Neu: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("NEU auswählen")).toBeChecked();
  });

  it("setzt Text, Vorschau und Auswahl nach erfolgreichem Import zurück, bevor der Parent schließt", async () => {
    const { onImport, onOpenChange } = renderDialog();
    checkText(importBlock("NEU", "Neue Regel"));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl importieren" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Wartungsfenster-Text")).toHaveValue("");
    expect(screen.queryByText("Neu: 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("NEU auswählen")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();
  });

  it("zeigt den überprüften Zeitplan kompakt mit erlaubtem Slot ohne interaktive Rasterzellen", () => {
    renderDialog();
    const mondayWithFirstSlotAllowed = `0${"1".repeat(47)}`;
    checkText(importBlock("ZEITPLAN", "Mit Freigabe", [mondayWithFirstSlotAllowed, ...Array(6).fill(BLOCKED_MASK)]));

    const compactSchedule = screen.getByRole("img", { name: /Wochenübersicht: Montag: 00:00–00:30/i });
    expect(compactSchedule.querySelector('[data-day="0"][data-slot="0"]')).toHaveAttribute("data-allowed", "true");
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
  });

  it("sperrt Bedienelemente während eines Imports und schließt nach erfolgreichem Abschluss", async () => {
    const pending = deferred<void>();
    const { onImport, onOpenChange } = renderDialog({ onImport: vi.fn(() => pending.promise) });
    checkText(importBlock("NEU", "Neue Regel"));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl importieren" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Wartungsfenster-Text")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Text prüfen" })).toBeDisabled();
    expect(screen.getByLabelText("NEU auswählen")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).toBeDisabled();

    pending.resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("zeigt einen asynchronen Importfehler an und behält die Vorschau", async () => {
    const { onImport } = renderDialog({ onImport: vi.fn(() => Promise.reject(new Error("Speicher nicht verfügbar"))) });
    checkText(importBlock("NEU", "Neue Regel"));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl importieren" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Speicher nicht verfügbar");
    expect(screen.getByText("NEU")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auswahl importieren" })).not.toBeDisabled();
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("setzt lokalen Text und Vorschau beim erneuten Öffnen zurück", () => {
    const { rerender, onOpenChange, onImport } = renderDialog();
    checkText(importBlock("NEU", "Neue Regel"));
    rerender(<MaintenanceWindowImportDialog open={false} onOpenChange={onOpenChange} existing={[]} onImport={onImport} />);
    rerender(<MaintenanceWindowImportDialog open onOpenChange={onOpenChange} existing={[]} onImport={onImport} />);

    expect(screen.getByLabelText("Wartungsfenster-Text")).toHaveValue("");
    expect(screen.queryByText("NEU")).not.toBeInTheDocument();
  });

  it("stellt Titel, Beschreibung und beschriftete Eingabe zugänglich bereit", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Wartungsfenster importieren" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass("overscroll-contain");
    expect(screen.getByText(/Text aus der RVTools-Wartungsfensterübersicht einfügen/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Wartungsfenster-Text")).toBeInTheDocument();
  });
});
