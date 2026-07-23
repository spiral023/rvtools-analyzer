import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { countTableSearchRows } from "@/lib/tableSearch";

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
  it("zeigt benutzerdefinierte Empty-State-Texte nach einer Filterung ohne Treffer", () => {
    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={columns}
        globalFilter="kein Treffer"
        emptyTitle="Keine Netzwerkadapter gefunden"
        emptyDescription="Passe den Filter an oder prüfe den Snapshot."
      />,
    );

    expect(screen.getByText("Keine Netzwerkadapter gefunden")).toBeInTheDocument();
    expect(screen.getByText("Passe den Filter an oder prüfe den Snapshot.")).toBeInTheDocument();
  });

  it("zeigt den Standardtitel ohne optionale Beschreibung", () => {
    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={columns}
        globalFilter="kein Treffer"
      />,
    );

    expect(screen.getByText("Keine Einträge")).toBeInTheDocument();
  });

  it("spannt den Empty State über alle sichtbaren Leaf-Spalten", () => {
    const groupedColumns: ColumnDef<TableRow, unknown>[] = [
      {
        header: "Netzwerk",
        columns: [
          { accessorKey: "ipAddress", header: "IP" },
          { accessorKey: "name", header: "Name" },
        ],
      },
      { accessorKey: "comment", header: "Comment" },
    ];

    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={groupedColumns}
        globalFilter="kein Treffer"
      />,
    );

    expect(screen.getByRole("cell", { name: "Keine Einträge" })).toHaveAttribute("colspan", "3");
  });

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

  it.each([
    { search: "core", expected: 1 },
    { search: "true", expected: 1 },
    { search: "prod,edge", expected: 1 },
    { search: "dotted-leaf", expected: 1 },
    { search: "ignored-value", expected: 0 },
    { search: "nicht-vorhanden", expected: 0 },
  ])("stimmt für '$search' mit der puren Suchzählung überein", ({ search, expected }) => {
    interface RichRow {
      name: string | null;
      active: boolean;
      tags: string[];
      nested: { label: string | null };
      ignored: string;
    }
    const richRows: RichRow[] = [
      {
        name: null,
        active: false,
        tags: [],
        nested: { label: null },
        ignored: "ignored-value",
      },
      {
        name: "Core-01",
        active: true,
        tags: ["Prod", "Edge"],
        nested: { label: "Dotted-Leaf" },
        ignored: "anderer Wert",
      },
    ];
    const richColumns: ColumnDef<RichRow, unknown>[] = [
      {
        header: "Details",
        columns: [
          { accessorKey: "name", header: "Name" },
          { accessorKey: "nested.label", header: "Verschachtelt" },
          { id: "active", accessorFn: (row) => row.active, header: "Aktiv" },
          { id: "tags", accessorFn: (row) => row.tags, header: "Tags" },
          {
            accessorKey: "ignored",
            header: "Ignoriert",
            enableGlobalFilter: false,
          },
        ],
      },
    ];

    const utilityCount = countTableSearchRows(richRows, richColumns, search);
    render(<VirtualTable data={richRows} columns={richColumns} globalFilter={search} />);

    expect(utilityCount).toBe(expected);
    expect(screen.getByText(expected === 1 ? "1 Eintrag" : "0 Einträge")).toBeInTheDocument();
  });
});
