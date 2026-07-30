import { useCallback, useEffect, useRef, useState } from "react";
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
  copyConfluenceWikiTable,
  exportExcelTable,
  exportMarkdownTable,
} from "@/lib/export/tableExport";
import { ArrowUpDown, ArrowUp, ArrowDown, ClipboardCopy, Download, FileSpreadsheet, FileText, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface VirtualTableProps<T, TColumn = T> {
  data: T[];
  columns: ColumnDef<TColumn, unknown>[];
  globalFilter?: string;
  height?: number;
  className?: string;
  onRowClick?: (row: T) => void;
  initialSorting?: SortingState;
  exportFileName?: string;
  selectionEnabled?: boolean;
  getRowId?: (row: T) => string;
  selectedKeys?: Set<string>;
  onToggleRow?: (vmKey: string, shiftKey: boolean, sortedKeys: string[], index: number) => void;
  onToggleAll?: (selectAll: boolean) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Meldet die Anzahl der nach Filterung sichtbaren Zeilen, z.B. für einen Zähler im Panel-Titel. */
  onFilteredCountChange?: (count: number) => void;
}

const ESTIMATED_ROW_HEIGHT = 33;
const HEADER_HEIGHT = 38;
const FOOTER_HEIGHT = 36;

function getDefaultExportFileName(): string {
  if (typeof window === "undefined") return "rvtools-table-export";
  const routeSegment = window.location.pathname.split("/").filter(Boolean).pop() ?? "table";
  const date = new Date().toISOString().slice(0, 10);
  return `rvtools-${routeSegment}-${date}`;
}

export function VirtualTable<T, TColumn = T>({
  data,
  columns,
  globalFilter = "",
  height = 500,
  className,
  onRowClick,
  initialSorting,
  exportFileName,
  selectionEnabled = false,
  getRowId,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  emptyTitle = "Keine Einträge",
  emptyDescription,
  onFilteredCountChange,
}: VirtualTableProps<T, TColumn>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns: columns as unknown as ColumnDef<T, unknown>[],
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getColumnCanGlobalFilter: (column) => Boolean(column.accessorFn),
  });

  const { rows } = table.getRowModel();
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  useEffect(() => {
    onFilteredCountChange?.(rows.length);
  }, [rows.length, onFilteredCountChange]);

  const hasFooter = table
    .getVisibleLeafColumns()
    .some((column) => column.columnDef.footer !== undefined);

  const sortedRowIds = selectionEnabled && getRowId
    ? rows.map((r) => getRowId(r.original))
    : [];

  const allSelected = selectionEnabled && getRowId && sortedRowIds.length > 0
    ? sortedRowIds.every((id) => selectedKeys?.has(id))
    : false;
  const someSelected = selectionEnabled && getRowId && sortedRowIds.length > 0
    ? sortedRowIds.some((id) => selectedKeys?.has(id)) && !allSelected
    : false;

  const handleExport = async (format: "excel" | "markdown" | "confluence") => {
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

      if (format === "confluence") {
        await copyConfluenceWikiTable(exportData);
        toast.success("Confluence-Wiki-Markup in die Zwischenablage kopiert.");
        return;
      }

      exportMarkdownTable(exportData, filename);
      toast.success("Tabelle als Markdown exportiert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  };

  const getVirtualRowKey = useCallback(
    (index: number) => rows[index]?.id ?? index,
    [rows],
  );

  const measureRow = useCallback((element: Element) => {
    // offsetHeight measures the layout box without transform/subpixel feedback.
    // The fallback keeps jsdom and elements detached during teardown harmless.
    const measuredHeight = element instanceof HTMLElement ? element.offsetHeight : 0;
    return measuredHeight > 0 ? measuredHeight : ESTIMATED_ROW_HEIGHT;
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 0, height },
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: getVirtualRowKey,
    measureElement: measureRow,
    overscan: 30,
  });

  // Container nur so hoch wie nötig: kurze Tabellen erzeugen sonst große Leerflächen.
  // Nach der ersten Messung enthält getTotalSize() auch mehrzeilige Zeilen.
  const contentHeight = HEADER_HEIGHT + virtualizer.getTotalSize() + (hasFooter ? FOOTER_HEIGHT : 0) + (rows.length === 0 ? 112 : 0);
  const effectiveHeight = Math.min(height, contentHeight);
  const needsVerticalScroll = contentHeight > height;

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
        className={cn(
          "[overflow-anchor:none] [scrollbar-gutter:stable]",
          needsVerticalScroll ? "overflow-auto" : "overflow-x-auto overflow-y-hidden",
        )}
        style={{ height: `${effectiveHeight}px` }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isSelectionCol = selectionEnabled && header.id === "__selection";
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      tabIndex={isSelectionCol ? undefined : 0}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none",
                        !isSelectionCol && "cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      )}
                      onClick={isSelectionCol ? undefined : header.column.getToggleSortingHandler()}
                      onKeyDown={isSelectionCol ? undefined : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          header.column.getToggleSortingHandler()?.(e);
                        }
                      }}
                    >
                      {isSelectionCol ? (
                        <button
                          type="button"
                          aria-label={allSelected ? "Auswahl aller Zeilen aufheben" : "Alle Zeilen auswählen"}
                          className="flex items-center justify-center cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleAll?.(!allSelected);
                          }}
                        >
                          {allSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : someSelected ? (
                            <Square className="h-4 w-4 text-primary fill-primary/30" />
                          ) : (
                            <Square className="h-4 w-4 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <InfoTooltip entry={header.column.columnDef.meta?.info} side="bottom">
                          <div className="flex w-fit items-center gap-1">
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
                        </InfoTooltip>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold">{emptyTitle}</p>
                  {emptyDescription && (
                    <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
                  )}
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr>
                <td
                  aria-label="Abstand vor sichtbaren Tabellenzeilen"
                  style={{ height: `${paddingTop}px` }}
                  colSpan={visibleColumnCount}
                />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "border-b border-border/30 transition-colors hover:bg-muted/30",
                    onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onRowClick(row.original);
                    }
                  } : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isSelectionCell = selectionEnabled && cell.column.id === "__selection";
                    if (isSelectionCell && getRowId) {
                      const vmKey = getRowId(row.original);
                      const checked = selectedKeys?.has(vmKey) ?? false;
                      return (
                        <td
                          key={cell.id}
                          className="whitespace-nowrap px-3 py-1.5 text-sm text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleRow?.(vmKey, e.shiftKey, sortedRowIds, virtualRow.index);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            aria-label={`Zeile ${vmKey} auswählen`}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={cell.id}
                        className="whitespace-nowrap px-3 py-1.5 text-sm"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td
                  aria-label="Abstand nach sichtbaren Tabellenzeilen"
                  style={{ height: `${paddingBottom}px` }}
                  colSpan={visibleColumnCount}
                />
              </tr>
            )}
          </tbody>
          {hasFooter && (
            <tfoot className="sticky bottom-0 z-10 bg-card border-t border-border">
              {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                  {footerGroup.headers.map((header) => (
                    <td
                      key={header.id}
                      className="whitespace-nowrap px-3 py-2 text-sm font-semibold"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.footer, header.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{rows.length.toLocaleString("de-DE")} {rows.length === 1 ? "Eintrag" : "Einträge"}</span>
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
            <DropdownMenuItem onClick={() => void handleExport("confluence")}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Confluence Wiki-Markup kopieren
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
