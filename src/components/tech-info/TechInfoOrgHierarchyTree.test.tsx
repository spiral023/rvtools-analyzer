import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TechInfoOrgHierarchyTree } from "@/components/tech-info/TechInfoOrgHierarchyTree";
import type { TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";

vi.mock("@/components/ui/info-tooltip", () => ({
  InfoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function treeNode(overrides: Partial<TechInfoOrgTreeNode["aggregate"]> = {}): TechInfoOrgTreeNode {
  return {
    id: "org-1",
    label: "Organisation A",
    depth: 0,
    children: [],
    vmRefs: [],
    aggregate: {
      vmCount: 2,
      poweredOnCount: 2,
      poweredOffCount: 0,
      vCpuSum: 12,
      memoryMiBSum: 16_384,
      cpuDemandAverageMHzSum: 800,
      cpuDemandCapacityMHzSum: 8_000,
      cpuDemandVmCount: 1,
      reclaimableVcpuSum: 2,
      rightsizingVmCount: 1,
      ...overrides,
    },
  };
}

describe("TechInfoOrgHierarchyTree", () => {
  it("zeigt CPU Demand, CPU-Intensität und Rightsizing-Potenzial", () => {
    render(<TechInfoOrgHierarchyTree tree={[treeNode()]} selectedNodeId={null} onSelectNode={vi.fn()} />);

    expect(screen.getByText("CPU Demand Ø")).toBeInTheDocument();
    expect(screen.getByText("CPU-Intensität")).toBeInTheDocument();
    expect(screen.getByText("0,8 GHz")).toBeInTheDocument();
    expect(screen.getByText("10 %")).toBeInTheDocument();
    expect(screen.getByText("16,7 %")).toBeInTheDocument();
    expect(screen.queryByText("Ein / Aus")).not.toBeInTheDocument();
  });

  it("zeigt bei fehlenden optionalen Messwerten keinen Fehler, sondern Platzhalter", () => {
    render(
      <TechInfoOrgHierarchyTree
        tree={[treeNode({
          cpuDemandAverageMHzSum: 0,
          cpuDemandCapacityMHzSum: 0,
          cpuDemandVmCount: 0,
          reclaimableVcpuSum: 0,
          rightsizingVmCount: 0,
        })]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
