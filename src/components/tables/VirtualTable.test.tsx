import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";

interface TableRow {
  ipAddress: string;
  name: string | null;
  comment: string | null;
}

const columns: ColumnDef<TableRow, unknown>[] = [
  { accessorKey: "ipAddress", header: "IP" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "comment", header: "Comment" },
];

describe("VirtualTable", () => {
  it("findet Werte in einer optionalen Spalte, wenn die erste Zeile leer ist", () => {
    render(
      <VirtualTable
        data={[
          { ipAddress: "10.0.0.1", name: null, comment: null },
          { ipAddress: "10.0.0.2", name: "app-01", comment: "Produktivsystem" },
        ]}
        columns={columns}
        globalFilter="produktiv"
      />,
    );

    expect(screen.getByText("1 Eintrag")).toBeInTheDocument();
  });
});
