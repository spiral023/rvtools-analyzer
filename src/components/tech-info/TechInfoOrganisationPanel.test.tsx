import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TechInfoOrganisationPanel } from "@/components/tech-info/TechInfoOrganisationPanel";
import { buildVmExportDataset } from "@/lib/export/exportStudio";
import type { TechInfoOrgVmSource } from "@/domain/services/techInfoOrganisationService";

vi.mock("@/components/tech-info/TechInfoOrgHierarchyTree", () => ({
  TechInfoOrgHierarchyTree: () => <div>Hierarchie</div>,
}));
vi.mock("@/components/tech-info/TechInfoOrgBereichChart", () => ({
  TechInfoOrgBereichChart: () => <div>Bereichsdiagramm</div>,
}));
vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: () => <div>VM-Tabelle</div>,
}));
vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const source: TechInfoOrgVmSource = {
  vmName: "app-01",
  sysv: "Max Muster",
  sysvDepartment: "RAITEC/IT-OPS",
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  cpuCount: 4,
  memoryMiB: 8192,
  poweredOn: true,
};

const emptyVmDataset = buildVmExportDataset([], [], "Test");

describe("TechInfoOrganisationPanel", () => {
  it("zeigt sechs KPIs und keinen separaten Datenqualitätsbereich", () => {
    render(
      <TechInfoOrganisationPanel
        sources={[source]}
        search=""
        vmByName={new Map()}
        vmDataset={emptyVmDataset}
        onOpenVm={vi.fn()}
      />,
    );

    for (const title of [
      "Zugeordnete Server-VMs",
      "Organisationen",
      "Bereiche",
      "Abteilungen",
      "Systemverantwortliche",
      "Fehlende / ungültige Zuordnung",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Datenqualität" })).not.toBeInTheDocument();
  });
});
