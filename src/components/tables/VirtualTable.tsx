import { useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildExportData,
  exportExcelTable,
  exportMarkdownTable,
} from "@/lib/export/tableExport";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  globalFilter?: string;
  height?: number;
  className?: string;
  onRowClick?: (row: T) => void;
  exportFileName?: string;
}

function getDefaultExportFileName(): string {
  if (typeof window === "undefined") return "rvtools-table-export";
  const routeSegment = window.location.pathname.split("/").filter(Boolean).pop() ?? "table";
  const date = new Date().toISOString().slice(0, 10);
  return `rvtools-${routeSegment}-${date}`;
}

export function VirtualTable<T>({
  data,
  columns,
  globalFilter = "",
  height = 500,
  className,
  onRowClick,
  exportFileName,
}: VirtualTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  const handleExport = async (format: "excel" | "markdown") => {
    const exportData = buildExportData(
      table.getVisibleLeafColumns().map((column) => ({
        id: column.id,
        header: column.columnDef.header,
      })),
      rows.map((row) => ({
        getValue: (columnId) => row.getValue(columnId),
      })),
    );

    const filename = exportFileName ?? getDefaultExportFileName();

    try {
      if (format === "excel") {
        await exportExcelTable(exportData, filename);
        toast.success("Tabelle als Excel-Datei exportiert.");
        return;
      }

      exportMarkdownTable(exportData, filename);
      toast.success("Tabelle als Markdown exportiert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  };

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 30,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  return (
    <div className={cn("rounded-md border border-border/50 bg-card/30", className)}>
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: `${height}px` }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {sorted === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-primary" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="h-3 w-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td
                  aria-label="Abstand vor sichtbaren Tabellenzeilen"
                  style={{ height: `${paddingTop}px` }}
                  colSpan={columns.length}
                />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/30 transition-colors hover:bg-muted/30",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="whitespace-nowrap px-3 py-1.5 text-sm"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td
                  aria-label="Abstand nach sichtbaren Tabellenzeilen"
                  style={{ height: `${paddingBottom}px` }}
                  colSpan={columns.length}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{rows.length.toLocaleString("de-DE")} Einträge</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              disabled={rows.length === 0}
              aria-label="Aktuell sichtbare Tabelle exportieren"
              title="Aktuell sichtbare Tabelle exportieren"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => void handleExport("excel")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport("markdown")}>
              <FileText className="mr-2 h-4 w-4" />
              Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
