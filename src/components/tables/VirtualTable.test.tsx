import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("meldet die echte gefilterte Zeilenanzahl initial und nach einer Suchänderung", async () => {
    const onFilteredRowCountChange = vi.fn();
    const data: TableRow[] = [
      { ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" },
      { ipAddress: "10.0.0.2", name: "db-01", comment: "Datenbank" },
    ];
    const view = render(
      <VirtualTable
        data={data}
        columns={columns}
        globalFilter="app-01"
        onFilteredRowCountChange={onFilteredRowCountChange}
      />,
    );

    await waitFor(() => {
      expect(onFilteredRowCountChange).toHaveBeenLastCalledWith(1);
    });

    view.rerender(
      <VirtualTable
        data={data}
        columns={columns}
        globalFilter="nicht-vorhanden"
        onFilteredRowCountChange={onFilteredRowCountChange}
      />,
    );

    await waitFor(() => {
      expect(onFilteredRowCountChange).toHaveBeenLastCalledWith(0);
    });
  });

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
});
