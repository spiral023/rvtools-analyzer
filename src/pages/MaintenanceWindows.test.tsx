import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("@/hooks/useMaintenanceWindows", () => ({
  useMaintenanceWindows: mocks.useMaintenanceWindows,
}));

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useAllTechInfoLatest: mocks.useAllTechInfoLatest,
}));

vi.mock("@/components/maintenance-windows/MaintenanceWindowEditor", () => ({
  MaintenanceWindowEditor: ({ value, onSave, onDirtyChange }: {
    value: MaintenanceWindowDefinition;
    onSave: (value: MaintenanceWindowDefinition) => Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <section aria-label="Fensterdefinition bearbeiten">
      <p>Editor: {value.abbreviation || "neu"}</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>Änderung markieren</button>
      <button type="button" onClick={() => { void onSave({ ...value, abbreviation: value.abbreviation || "Neu" }).catch(() => {}); }}>Editor speichern</button>
    </section>
  ),
}));

vi.mock("@/components/maintenance-windows/MaintenanceWindowImportDialog", () => ({
  MaintenanceWindowImportDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Wartungsfenster importieren</div> : null,
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
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("zeigt ohne Seed-Daten einen leeren Katalog mit manuellen und Import-Aktionen", () => {
    render(<MaintenanceWindows />);

    expect(screen.getByText(/keine Wartungsfenster definiert/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /neues Wartungsfenster/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /aus Text importieren/i })).not.toHaveLength(0);
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
});
