import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "@/app/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import MaintenanceWindows from "./MaintenanceWindows";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
  useMaintenanceWindows: vi.fn(),
  useAllTechInfoLatest: vi.fn(),
  useBlocker: vi.fn(),
  importedDefinitions: [] as MaintenanceWindowDefinition[],
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useBlocker: mocks.useBlocker,
}));

vi.mock("@/hooks/useMaintenanceWindows", () => ({
  useMaintenanceWindows: mocks.useMaintenanceWindows,
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useAllTechInfoLatest: mocks.useAllTechInfoLatest,
}));

vi.mock("@/components/maintenance-windows/MaintenanceWindowEditor", () => ({
  MaintenanceWindowEditor: ({ value, onSave, onDuplicate, onDirtyChange }: {
    value: MaintenanceWindowDefinition;
    onSave: (value: MaintenanceWindowDefinition) => Promise<void>;
    onDuplicate: (value: MaintenanceWindowDefinition) => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <section aria-label="Fensterdefinition bearbeiten">
      <p>Editor: {value.abbreviation || "neu"}</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>Änderung markieren</button>
      <button type="button" onClick={() => { void onSave({ ...value, abbreviation: value.abbreviation || "Neu" }).catch(() => {}); }}>Editor speichern</button>
      <button type="button" onClick={() => onDuplicate(value)}>Duplizieren</button>
    </section>
  ),
}));

vi.mock("@/components/maintenance-windows/MaintenanceWindowImportDialog", () => ({
  MaintenanceWindowImportDialog: ({ open, onImport }: { open: boolean; onImport: (definitions: MaintenanceWindowDefinition[]) => Promise<void> }) => open ? (
    <div role="dialog">Wartungsfenster importieren<button type="button" onClick={() => { void onImport(mocks.importedDefinitions).catch(() => {}); }}>Testimport ausführen</button></div>
  ) : null,
}));

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children, entry }: { children: React.ReactNode; entry: { term: string } }) => (
    entry
      ? <div data-testid={`tooltip-${entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`} data-tooltip-term={entry.term}>{children}</div>
      : <>{children}</>
  ),
}));

const now = "2026-07-17T10:00:00.000Z";
const definition = (overrides: Partial<MaintenanceWindowDefinition> = {}): MaintenanceWindowDefinition => ({
  id: "mw-standard",
  abbreviation: "STD",
  normalizedAbbreviation: "std",
  description: "Standardfenster",
  handling: "regular",
  weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
  calendarRules: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const system = (vmName: string, maintenanceWindow: string | null): TechInfoLatest => ({
  vmNameNorm: vmName.toLowerCase(),
  vmName,
  importedAt: now,
  techInfoImportId: "import-1",
  rowIndex: 1,
  serverType: null,
  maintenanceWindow,
  operatingSystem: null,
  comment: null,
  sysv: null,
  sysvDepartment: null,
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  bz: null,
  clusterFromTechInfo: null,
  cvBackup: null,
  az: null,
});

describe("MaintenanceWindows", () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.upsert.mockReset().mockResolvedValue(undefined);
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    mocks.useAllTechInfoLatest.mockReturnValue({ data: [], isLoading: false });
    mocks.useBlocker.mockReturnValue({ state: "unblocked", proceed: undefined, reset: undefined });
    mocks.importedDefinitions = [definition({ id: "imported", abbreviation: "IMP", normalizedAbbreviation: "imp" })];
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("zeigt ohne Seed-Daten einen leeren Katalog mit manuellen und Import-Aktionen", () => {
    render(<MaintenanceWindows />);

    expect(screen.getByText(/keine Wartungsfenster definiert/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /neues Wartungsfenster/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /aus Text importieren/i })).not.toHaveLength(0);
  });

  it("erklärt alle Kennzahlen des Wartungsfenster-Katalogs per Tooltip", () => {
    render(<MaintenanceWindows />);

    expect(screen.getByTestId("tooltip-definierte-wartungsfenster")).toHaveAttribute("data-tooltip-term", "Definierte Wartungsfenster");
    expect(screen.getByTestId("tooltip-zugeordnete-systeme")).toHaveAttribute("data-tooltip-term", "Zugeordnete Systeme");
    expect(screen.getByTestId("tooltip-unbekannte-fensterwerte")).toHaveAttribute("data-tooltip-term", "Unbekannte Fensterwerte");
    expect(screen.getByTestId("tooltip-systeme-ohne-fensterzuordnung")).toHaveAttribute("data-tooltip-term", "Systeme ohne Fensterzuordnung");
  });

  it("gruppiert Tech-Info unabhängig von RVTools nach bekannten und unbekannten Fenstern", () => {
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    mocks.useAllTechInfoLatest.mockReturnValue({
      data: [system("APP-01", "std"), system("APP-02", "Fremd")], isLoading: false,
    });

    render(<MaintenanceWindows />);

    expect(screen.getAllByText("1 System")).not.toHaveLength(0);
    expect(screen.getByText("1 unbekannter Wert")).toBeInTheDocument();
    expect(screen.getAllByText("STD").length).toBeGreaterThan(0);
    expect(screen.getByText("Fremd")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /systeme für Fremd/i })).toBeInTheDocument();
  });

  it("zeigt die Anzahl bekannter Systeme direkt an der Definition", () => {
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    mocks.useAllTechInfoLatest.mockReturnValue({ data: [system("APP-01", "STD")], isLoading: false });

    render(<MaintenanceWindows />);

    expect(screen.getAllByText("1 System")).not.toHaveLength(0);
  });

  it("öffnet Editor und Importdialog über die Werkzeugleiste", () => {
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /neues Wartungsfenster/i }));
    expect(screen.getAllByRole("region", { name: "Fensterdefinition bearbeiten" })).not.toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: /aus Text importieren/i })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Wartungsfenster importieren");
  });

  it("behandelt eine abgelehnte Speicherung ohne unbehandelte Promise", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Speicherfehler"));
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /neues Wartungsfenster/i }));
    fireEvent.click(screen.getByRole("button", { name: "Editor speichern" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Speicherfehler"));
  });

  it("behält einen schmutzigen Editor beim erfolgreichen Textimport", async () => {
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Änderung markieren" }));
    fireEvent.click(screen.getAllByRole("button", { name: /aus Text importieren/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Testimport ausführen" }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(mocks.importedDefinitions));
    expect(screen.getByText("Editor: STD")).toBeInTheDocument();
  });

  it("zeigt einen Tech-Info-Ladefehler statt leere Zuordnungen als verlässlich darzustellen", () => {
    mocks.useAllTechInfoLatest.mockReturnValue({ data: [], isLoading: false, error: new Error("Tech-Info nicht verfügbar") });
    render(<MaintenanceWindows />);

    expect(screen.getByRole("alert")).toHaveTextContent("Tech-Info nicht verfügbar");
    expect(screen.getByRole("alert")).toHaveTextContent(/Zuordnungen.*nicht geladen/i);
  });

  it("zeigt beim blockierten Routenwechsel einen Dialog und verwirft nach Bestätigung", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    mocks.useBlocker.mockImplementation((shouldBlock: boolean) => shouldBlock
      ? { state: "blocked", proceed, reset }
      : { state: "unblocked", proceed: undefined, reset: undefined });
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Änderung markieren" }));

    expect(screen.getByRole("dialog", { name: /ungespeicherte Änderungen/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /verwerfen.*navigieren/i }));
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("warnt beim beforeunload nur mit ungespeicherten Änderungen", () => {
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    render(<MaintenanceWindows />);
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(cleanEvent)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Änderung markieren" }));
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(dirtyEvent)).toBe(false);
  });

  it("fragt vor dem Wechsel einer schmutzigen Auswahl nach", () => {
    const second = definition({ id: "mw-night", abbreviation: "Nacht", normalizedAbbreviation: "nacht" });
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition(), second], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Änderung markieren" }));
    fireEvent.click(screen.getByRole("button", { name: /Nacht auswählen/i }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText("Editor: STD")).toBeInTheDocument();
  });

  it("speichert eine Duplikat-Definition sofort und wählt sie nach dem Persistieren aus", async () => {
    const definitions = [definition()];
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions, isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    const { rerender } = render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Duplizieren" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const duplicate = mocks.save.mock.calls[0][0] as MaintenanceWindowDefinition;
    expect(duplicate).toMatchObject({ abbreviation: "STD-Kopie", normalizedAbbreviation: "std-kopie" });
    expect(duplicate.id).not.toBe(definitions[0].id);
    expect(duplicate.weeklySlots).not.toBe(definitions[0].weeklySlots);

    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [...definitions, duplicate], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    rerender(<MaintenanceWindows />);

    expect(screen.getAllByText("STD-Kopie")).not.toHaveLength(0);
    expect(screen.getByText("Editor: STD-Kopie")).toBeInTheDocument();
  });

  it("wählt bei einem fehlgeschlagenen Duplikat keine Phantomdefinition aus", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Kopie fehlgeschlagen"));
    mocks.useMaintenanceWindows.mockReturnValue({
      definitions: [definition()], isLoading: false, error: null, isMutating: false,
      save: mocks.save, remove: mocks.remove, upsert: mocks.upsert,
    });
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /STD auswählen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Duplizieren" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Kopie fehlgeschlagen"));
    expect(screen.getByText("Editor: STD")).toBeInTheDocument();
  });

  it("macht unbekannte Systemnamen aufklappbar sichtbar", () => {
    mocks.useAllTechInfoLatest.mockReturnValue({ data: [system("APP-UNKNOWN", "extern")], isLoading: false });
    render(<MaintenanceWindows />);

    fireEvent.click(screen.getByRole("button", { name: /systeme für extern/i }));
    expect(screen.getByText("APP-UNKNOWN")).toBeInTheDocument();
  });

  it("verlinkt die Werkzeuge-Navigation auf Wartungsfenster", () => {
    render(<MemoryRouter><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Wartungsfenster" })).toHaveAttribute("href", "/wartungsfenster");
  });

  it("ordnet vCenter im Analysebereich ein", () => {
    render(<MemoryRouter><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const analysisGroup = screen.getByText("Analyse").closest('[data-sidebar="group"]');
    expect(analysisGroup).not.toBeNull();
    expect(within(analysisGroup!).getByRole("link", { name: "vCenter" })).toHaveAttribute("href", "/fleet-compare");
    expect(screen.queryByText("Vergleich")).not.toBeInTheDocument();
  });

  it("zeigt Wartungsankündigung und Planung nicht in der Tools-Navigation", () => {
    render(<MemoryRouter><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.queryByRole("link", { name: "Wartungsankündigung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Planung" })).not.toBeInTheDocument();
  });
});
