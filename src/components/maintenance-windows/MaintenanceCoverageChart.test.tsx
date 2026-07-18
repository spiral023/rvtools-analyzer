import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import type { KnownMaintenanceWindowAssignment } from "@/lib/maintenanceWindows";
import { createEmptyWeeklySlots } from "@/lib/maintenanceWindows";
import { MaintenanceCoverageChart } from "./MaintenanceCoverageChart";

const makeDefinition = (
  abbreviation: string,
  overrides: Partial<MaintenanceWindowDefinition> = {},
): MaintenanceWindowDefinition => ({
  id: abbreviation.toLocaleLowerCase("de-DE"),
  abbreviation,
  normalizedAbbreviation: abbreviation.toLocaleLowerCase("de-DE"),
  description: `${abbreviation} Beschreibung`,
  handling: "regular",
  weeklySlots: createEmptyWeeklySlots(),
  calendarRules: [],
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  ...overrides,
});

const makeSystem = (vmName: string): TechInfoLatest => ({
  vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
  vmName,
  importedAt: "2026-07-17T08:00:00.000Z",
  techInfoImportId: "import-1",
  rowIndex: 1,
  serverType: null,
  maintenanceWindow: null,
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

function makeGroup(definition: MaintenanceWindowDefinition, systemCount: number): KnownMaintenanceWindowAssignment {
  return {
    definition,
    systems: Array.from({ length: systemCount }, (_, i) => makeSystem(`vm-${definition.abbreviation}-${i}`)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 22, 10, 0)); // Mittwoch, 22. Juli 2026, 10:00
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MaintenanceCoverageChart", () => {
  it("zeigt einen Leerzustand, wenn keine automatisch planbaren Systeme zugeordnet sind", () => {
    render(<MaintenanceCoverageChart known={[]} />);

    expect(screen.getByText(/Noch keine Systeme mit automatisch planbarem Wartungsfenster zugeordnet/)).toBeInTheDocument();
  });

  it("rendert die Umschalter Tag/Woche/Monat und wechselt zur Heatmap in der Monatsansicht", () => {
    const always = makeGroup(makeDefinition("ALWAYS", { handling: "always" }), 3);
    render(<MaintenanceCoverageChart known={[always]} />);

    expect(screen.getByRole("radio", { name: "Tagesansicht" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Wochenansicht" })).toBeInTheDocument();
    const monthToggle = screen.getByRole("radio", { name: "Monatsansicht" });

    fireEvent.click(monthToggle);

    expect(screen.getByRole("img", { name: /Wartungsfenster-Auslastung im Monatsverlauf/ })).toBeInTheDocument();
  });

  it("zeigt den Ausschluss-Hinweis nur, wenn Systeme mit 'approval-required'/'external' vorhanden sind", () => {
    const always = makeGroup(makeDefinition("ALWAYS", { handling: "always" }), 3);
    const approval = makeGroup(makeDefinition("APPROVAL", { handling: "approval-required" }), 2);

    const { rerender } = render(<MaintenanceCoverageChart known={[always]} />);
    expect(screen.queryByText(/nicht enthalten/)).not.toBeInTheDocument();

    rerender(<MaintenanceCoverageChart known={[always, approval]} />);
    expect(screen.getByText(/2 Systeme sind mit/)).toBeInTheDocument();
  });
});
