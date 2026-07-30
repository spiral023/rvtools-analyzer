import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TechInfoOrgBereichChart } from "@/components/tech-info/TechInfoOrgBereichChart";
import type { TechInfoOrgTreeNode } from "@/components/tech-info/techInfoOrgTree";

vi.mock("@/components/charts/recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: Array<{ name: string }>; children: ReactNode }) => (
    <div data-testid="bereich-chart" data-names={data.map((entry) => entry.name).join(",")}>{children}</div>
  ),
  XAxis: (): null => null,
  YAxis: (): null => null,
  Tooltip: (): null => null,
  Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: (): null => null,
}));

function node(index: number): TechInfoOrgTreeNode {
  return {
    id: `bereich-${index}`,
    label: `Bereich ${index}`,
    depth: 1,
    aggregate: {
      vmCount: 20 - index,
      poweredOnCount: 20 - index,
      poweredOffCount: 0,
      vCpuSum: (20 - index) * 2,
      memoryMiBSum: (20 - index) * 1024,
    },
    children: [],
    vmRefs: [],
  };
}

describe("TechInfoOrgBereichChart", () => {
  it("fasst Bereiche außerhalb der sichtbaren Top 10 als Weitere zusammen", () => {
    render(
      <TechInfoOrgBereichChart
        bereichNodes={Array.from({ length: 12 }, (_, index) => node(index))}
        selectedBereichId={null}
        onSelectBereich={vi.fn()}
      />,
    );

    const names = screen.getByTestId("bereich-chart").getAttribute("data-names")?.split(",");
    expect(names).toHaveLength(11);
    expect(names?.at(-1)).toBe("Weitere");
    expect(names).not.toContain("Bereich 10");
    expect(names).not.toContain("Bereich 11");
  });
});
