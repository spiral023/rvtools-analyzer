import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import { countTableSearchRows } from "@/lib/tableSearch";

interface SearchRow {
  name: string | null;
  count: number;
  active: boolean;
  tags: string[];
  ignored: string;
}

const groupedColumns: ColumnDef<SearchRow, unknown>[] = [
  {
    header: "Basis",
    columns: [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "count", header: "Anzahl" },
    ],
  },
  {
    header: "Zusammengesetzt",
    columns: [
      { id: "active", accessorFn: (row) => row.active, header: "Aktiv" },
      { id: "tags", accessorFn: (row) => row.tags, header: "Tags" },
    ],
  },
  {
    accessorKey: "ignored",
    header: "Ignoriert",
    enableGlobalFilter: false,
  },
];

const rows: SearchRow[] = [
  { name: null, count: 7, active: false, tags: [], ignored: "unsichtbarer Treffer" },
  { name: "Core-01", count: 42, active: true, tags: ["Prod", "Edge"], ignored: "anderer Wert" },
];

describe("countTableSearchRows", () => {
  it("spiegelt die case-insensitive TanStack-Substring-Suche über accessorKey-Leaf-Spalten", () => {
    expect(countTableSearchRows(rows, groupedColumns, "CORE")).toBe(1);
    expect(countTableSearchRows(rows, groupedColumns, "42")).toBe(1);
  });

  it("wertet accessorFn-Ergebnisse für Booleans und Arrays null-sicher wie TanStack aus", () => {
    expect(countTableSearchRows(rows, groupedColumns, "true")).toBe(1);
    expect(countTableSearchRows(rows, groupedColumns, "prod,edge")).toBe(1);
    expect(countTableSearchRows(rows, groupedColumns, "nicht-vorhanden")).toBe(0);
  });

  it("durchsucht nur global filterbare Leaf-Spalten und liefert ohne Filter alle Zeilen", () => {
    expect(countTableSearchRows(rows, groupedColumns, "unsichtbarer Treffer")).toBe(0);
    expect(countTableSearchRows(rows, groupedColumns, "")).toBe(rows.length);
  });
});
