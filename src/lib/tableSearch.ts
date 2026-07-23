import type { ColumnDef } from "@tanstack/react-table";

type SearchAccessor<TData> = (row: TData, index: number) => unknown;

function collectSearchAccessors<TData>(
  columns: ColumnDef<TData, unknown>[],
  accessors: SearchAccessor<TData>[],
): void {
  for (const column of columns) {
    if ("columns" in column && column.columns?.length) {
      collectSearchAccessors(column.columns, accessors);
      continue;
    }
    if (column.enableGlobalFilter === false) continue;

    if ("accessorFn" in column && typeof column.accessorFn === "function") {
      accessors.push(column.accessorFn);
      continue;
    }
    if (!("accessorKey" in column) || typeof column.accessorKey !== "string") continue;

    const path = column.accessorKey.split(".");
    if (path.length === 1) {
      const key = path[0];
      accessors.push((row) => (row as Record<string, unknown>)[key]);
      continue;
    }

    accessors.push((row) => {
      let value: unknown = row;
      for (const key of path) {
        if (value == null) return undefined;
        value = (value as Record<string, unknown>)[key];
      }
      return value;
    });
  }
}

/**
 * Counts rows with TanStack's current includesString global-filter semantics.
 * The direct scan avoids constructing a second table model beside VirtualTable.
 */
export function countTableSearchRows<TData>(
  data: TData[],
  columns: ColumnDef<TData, unknown>[],
  globalFilter: string,
): number {
  if (!globalFilter) return data.length;

  const search = globalFilter.toString().toLowerCase();
  const accessors: SearchAccessor<TData>[] = [];
  collectSearchAccessors(columns, accessors);

  let count = 0;
  for (let index = 0; index < data.length; index += 1) {
    const row = data[index];
    for (const accessor of accessors) {
      const value = accessor(row, index);
      if (value?.toString()?.toLowerCase()?.includes(search)) {
        count += 1;
        break;
      }
    }
  }

  return count;
}
