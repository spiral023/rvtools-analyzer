import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  type ColumnDef,
} from "@tanstack/react-table";

/**
 * Counts rows with the same TanStack global-filter pipeline used by VirtualTable.
 * Keeping this core-only makes the result usable during render without child Effects.
 */
export function countTableSearchRows<T, TColumn = T>(
  data: T[],
  columns: ColumnDef<TColumn, unknown>[],
  globalFilter: string,
): number {
  const table = createTable<T>({
    data,
    columns: columns as unknown as ColumnDef<T, unknown>[],
    state: { globalFilter },
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getColumnCanGlobalFilter: (column) => Boolean(column.accessorFn),
  });

  return table.getFilteredRowModel().rows.length;
}
