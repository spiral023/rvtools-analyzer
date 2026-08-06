import { readFileSync } from "node:fs";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import { countTableSearchRows, macSearchNeedle } from "@/lib/tableSearch";

interface SearchRow {
  name: string | null | undefined;
  count: number;
  active: boolean;
  tags: string[];
  ignored: string;
  nested: { label: string } | null;
}

const groupedColumns: ColumnDef<SearchRow, unknown>[] = [
  {
    header: "Basis",
    columns: [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "count", header: "Anzahl" },
      { accessorKey: "nested.label", header: "Verschachtelt" },
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
  {
    name: undefined,
    count: 7,
    active: false,
    tags: [],
    ignored: "unsichtbarer Treffer",
    nested: null,
  },
  {
    name: "Core-01",
    count: 42,
    active: true,
    tags: ["Prod", "Edge"],
    ignored: "anderer Wert",
    nested: { label: "Dotted-Leaf" },
  },
];

interface MacRow {
  host: string;
  device: string;
  mac: string;
  mtu: number;
}

const macColumns: ColumnDef<MacRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "device", header: "Device" },
  { accessorKey: "mac", header: "MAC" },
  { accessorKey: "mtu", header: "MTU" },
];

const macRows: MacRow[] = [
  { host: "esx01", device: "vmk0", mac: "00:50:56:6a:1b:2c", mtu: 1500 },
  { host: "esx01", device: "vmk2", mac: "00:50:56:71:9f:04", mtu: 9000 },
];

describe("macSearchNeedle", () => {
  it("erkennt die drei gebräuchlichen Schreibweisen als dieselbe Adresse", () => {
    expect(macSearchNeedle("00:50:56:6A:1B:2C")).toBe("0050566a1b2c");
    expect(macSearchNeedle("0050.566a.1b2c")).toBe("0050566a1b2c");
    expect(macSearchNeedle("00-50-56-6a-1b-2c")).toBe("0050566a1b2c");
    expect(macSearchNeedle("0050566a1b2c")).toBe("0050566a1b2c");
  });

  it("akzeptiert Teiladressen ab drei Oktetten", () => {
    expect(macSearchNeedle("56:6a:1b")).toBe("566a1b");
    expect(macSearchNeedle("56:6a")).toBeNull();
  });

  it("behandelt Zahlen und Text nicht als Adresse", () => {
    // Ohne diese Grenze fände die Suche nach einer MTU jede MAC, die „9000“ enthält.
    expect(macSearchNeedle("9000")).toBeNull();
    expect(macSearchNeedle("150000")).toBeNull();
    expect(macSearchNeedle("esx01")).toBeNull();
  });
});

describe("countTableSearchRows · MAC-Schreibweisen", () => {
  it("findet die RVTools-Schreibweise über eine aus dem Switch kopierte Adresse", () => {
    expect(countTableSearchRows(macRows, macColumns, "0050.5671.9f04")).toBe(1);
    expect(countTableSearchRows(macRows, macColumns, "00-50-56-71-9f-04")).toBe(1);
    expect(countTableSearchRows(macRows, macColumns, "005056719f04")).toBe(1);
  });

  it("lässt die gewohnte Substring-Suche unberührt", () => {
    expect(countTableSearchRows(macRows, macColumns, "vmk2")).toBe(1);
    expect(countTableSearchRows(macRows, macColumns, "esx01")).toBe(2);
    expect(countTableSearchRows(macRows, macColumns, "9000")).toBe(1);
  });
});

describe("countTableSearchRows", () => {
  it("spiegelt die case-insensitive TanStack-Substring-Suche über accessorKey-Leaf-Spalten", () => {
    expect(countTableSearchRows(rows, groupedColumns, "CORE")).toBe(1);
    expect(countTableSearchRows(rows, groupedColumns, "42")).toBe(1);
    expect(countTableSearchRows(rows, groupedColumns, "dotted-leaf")).toBe(1);
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

  it("ruft accessorFn direkt mit Zeile und Index auf", () => {
    const accessorFn = vi.fn((row: SearchRow, index: number) => `${row.count}-${index}`);
    const columns: ColumnDef<SearchRow, unknown>[] = [
      { id: "indexed", accessorFn, header: "Indexwert" },
    ];

    expect(countTableSearchRows(rows, columns, "42-1")).toBe(1);
    expect(accessorFn).toHaveBeenCalledWith(rows[0], 0);
    expect(accessorFn).toHaveBeenCalledWith(rows[1], 1);
  });

  it("verwendet für eine leere Suche den O(1)-Fast-Path ohne Accessor-Aufrufe", () => {
    const accessorFn = vi.fn((row: SearchRow) => row.name);
    const columns: ColumnDef<SearchRow, unknown>[] = [
      { id: "name", accessorFn, header: "Name" },
    ];

    expect(countTableSearchRows(rows, columns, "")).toBe(rows.length);
    expect(accessorFn).not.toHaveBeenCalled();
  });

  it("erstellt kein zweites TanStack-Tabellenmodell", () => {
    const implementation = readFileSync("src/lib/tableSearch.ts", "utf8");

    expect(implementation).not.toContain("createTable");
    expect(implementation).not.toContain("getFilteredRowModel");
  });
});
