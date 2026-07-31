import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("versteckt den vertikalen Overflow bei einer kurzen Tabelle", () => {
    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={columns}
      />,
    );

    const scrollContainer = screen.getByRole("table").parentElement;
    expect(scrollContainer).toHaveClass("overflow-x-auto", "overflow-y-hidden");
    expect(scrollContainer).not.toHaveClass("overflow-auto");
    expect(scrollContainer).toHaveClass("[overflow-anchor:none]", "[scrollbar-gutter:stable]");
  });

  it("markiert mehrzeilige Zeilen für die dynamische Höhenmessung", () => {
    const offsetHeightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function () {
      return this.tagName === "TR" ? 53 : 500;
    });
    const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    const multiLineColumns: ColumnDef<TableRow, unknown>[] = [
      { accessorKey: "ipAddress", header: "IP" },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <div>{row.original.name}</div>
            <div>{row.original.comment}</div>
          </div>
        ),
      },
    ];

    try {
      render(
        <VirtualTable
          data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
          columns={multiLineColumns}
          getRowId={(row) => row.ipAddress}
        />,
      );

      expect(screen.getByText("app-01").closest("tr")).toHaveAttribute("data-index", "0");
      expect(screen.getByRole("table").parentElement).toHaveStyle({ height: "91px" });
    } finally {
      offsetHeightSpy.mockRestore();
      offsetWidthSpy.mockRestore();
    }
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

  it("blendet Spalten laut initialColumnVisibility aus und zeigt keine Spaltenkonfiguration ohne Opt-in", () => {
    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={columns}
        initialColumnVisibility={{ comment: false }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "IP" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spalten konfigurieren" })).not.toBeInTheDocument();
  });

  it("schaltet über die Spaltenkonfiguration eine ausgeblendete Spalte zu", () => {
    const groupedColumns: ColumnDef<TableRow, unknown>[] = [
      { accessorKey: "ipAddress", header: "IP", meta: { group: "Basisfelder" } },
      { accessorKey: "name", header: "Name", meta: { group: "Basisfelder" } },
      { accessorKey: "comment", header: "Comment", meta: { group: "Weitere Felder" } },
    ];

    render(
      <VirtualTable
        data={[{ ipAddress: "10.0.0.1", name: "app-01", comment: "Produktivsystem" }]}
        columns={groupedColumns}
        columnPicker
        initialColumnVisibility={{ comment: false }}
      />,
    );

    // Tastaturpfad: jsdom kennt keine PointerEvents, Radix öffnet das Menü aber auch per Enter.
    fireEvent.keyDown(screen.getByRole("button", { name: "Spalten konfigurieren" }), { key: "Enter" });

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Basisfelder")).toBeInTheDocument();
    expect(within(menu).getByText("Weitere Felder")).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Comment" }));

    // `hidden: true`, weil das geöffnete Radix-Menü die Tabelle per aria-hidden ausblendet.
    expect(screen.getByRole("columnheader", { name: "Comment", hidden: true })).toBeInTheDocument();
    // Das Menü bleibt offen, damit mehrere Spalten in einem Zug zugeschaltet werden können.
    expect(screen.getByRole("menu")).toBeInTheDocument();
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
