import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FillUpClusterTable } from "./FillUpClusterTable";

const mocks = vi.hoisted(() => ({
  virtualTable: vi.fn<(props: unknown) => ReactNode>(() => <div data-testid="fill-up-table" />),
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: mocks.virtualTable,
}));

describe("FillUpClusterTable", () => {
  it("provides an explanatory glossary entry for every result column", () => {
    render(<FillUpClusterTable rows={[]} onSelect={vi.fn()} />);

    const props = mocks.virtualTable.mock.calls[0]?.[0] as {
      columns: Array<{ id: string; meta?: { info?: { term: string; description: string } } }>;
    };
    expect(props.columns.map((column) => column.id)).toEqual([
      "cluster", "scope", "policy", "mix", "headroom", "n1", "n2", "site", "limiter",
    ]);
    for (const column of props.columns) {
      expect(column.meta?.info?.term).toBeTruthy();
      expect(column.meta?.info?.description).toBeTruthy();
    }
  });
});
