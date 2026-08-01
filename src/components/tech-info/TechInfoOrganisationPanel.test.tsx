import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { TechInfoOrganisationPanel } from "@/components/tech-info/TechInfoOrganisationPanel";
import type { TechInfoOrgVmSource } from "@/domain/services/techInfoOrganisationService";
import type { ExportStudioDataset } from "@/lib/export/exportStudio";
import type { TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";

vi.mock("@/components/tech-info/TechInfoOrgHierarchyTree", () => ({
  TechInfoOrgHierarchyTree: ({ tree, onSelectNode }: { tree: TechInfoOrgTreeNode[]; onSelectNode: (node: TechInfoOrgTreeNode) => void }) => (
    <button type="button" onClick={() => onSelectNode(tree[0])}>Hierarchie</button>
  ),
}));
vi.mock("@/components/tech-info/TechInfoOrgBereichChart", () => ({
  TechInfoOrgBereichChart: () => <div>Bereichsdiagramm</div>,
}));
vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ columns }: { columns: ColumnDef<unknown, unknown>[] }) => <div data-column-info={columns.map((column) => Boolean(column.meta?.info)).join(",")}>VM-Tabelle</div>,
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

const emptyVmDataset: ExportStudioDataset = { source: "vms", title: "Test", columns: [], rows: [], dataStatus: "Test", scope: "Test", kpis: [] };

describe("TechInfoOrganisationPanel", () => {
  it("baut den Exportwertsatz erst für eine Auswahl und zeigt Tooltips für die Standardspalten", () => {
    const buildDrilldownVmDataset = vi.fn(() => emptyVmDataset);
    render(
      <TechInfoOrganisationPanel
        sources={[source]}
        search=""
        vmByName={new Map()}
        buildDrilldownVmDataset={buildDrilldownVmDataset}
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
    expect(screen.queryByLabelText("Namen pseudonymisieren")).not.toBeInTheDocument();
    expect(buildDrilldownVmDataset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Hierarchie" }));

    expect(buildDrilldownVmDataset).toHaveBeenCalledWith(["app-01"]);
    const columnInfo = screen.getByText("VM-Tabelle").getAttribute("data-column-info")?.split(",") ?? [];
    expect(columnInfo).not.toContain("false");
  });
});
