import { useCallback, useEffect, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type OnChangeFn,
  functionalUpdate,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import {
  buildExportData,
  buildCsvTable,
  buildJsonTable,
  buildMarkdownTable,
  copyTableText,
  copyConfluenceWikiTable,
  exportCsvTable,
  exportExcelTable,
  exportJsonTable,
  exportMarkdownTable,
  formatExportValue,
} from "@/lib/export/tableExport";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, ArrowUpToLine, CheckSquare, ClipboardCopy, Columns3, Download, FileCode2, FileSpreadsheet, FileText, GripVertical, RotateCcw, Search, Square, TableProperties } from "lucide-react";
import { toast } from "sonner";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface TableDisplayPreferences {
  columnVisibility: VisibilityState;
  columnOrder: string[];
  sorting: SortingState;
}

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
  /**
   * Blendet im Footer eine Spaltenauswahl ein. Überschriften der Auswahl kommen aus
   * `meta.group`; Spalten ohne Gruppe erscheinen unter „Weitere Spalten“.
   */
  columnPicker?: boolean;
  /**
   * Startsichtbarkeit je Spalten-Id – nicht genannte Spalten bleiben sichtbar. Dient
   * gleichzeitig als Ziel des „Standard“-Knopfs in der Spaltenauswahl.
   */
  initialColumnVisibility?: VisibilityState;
  /** Persistierbare Ansicht für eine Tabelle mit vielen optionalen Spalten. */
  tablePreferences?: TableDisplayPreferences;
  onTablePreferencesChange?: (preferences: TableDisplayPreferences) => void;
  /** Ersetzt das kompakte Spaltenmenü durch ein Detailfenster mit Erklärungen und Reihenfolge. */
  columnConfigurationDialog?: boolean;
  /** Ersetzt das kompakte Exportmenü durch ein Detailfenster für Dateien und Zwischenablage. */
  exportDialog?: boolean;
}

function columnPickerLabel<T>(column: Column<T, unknown>): string {
  const header = column.columnDef.header;
  if (typeof header === "string" && header.trim()) return header;
  return column.columnDef.meta?.info?.term ?? column.id;
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
  columnPicker = false,
  initialColumnVisibility,
  tablePreferences,
  onTablePreferencesChange,
  columnConfigurationDialog = false,
  exportDialog = false,
}: VirtualTableProps<T, TColumn>) {
  const [sorting, setSorting] = useState<SortingState>(tablePreferences?.sorting ?? initialSorting ?? []);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(tablePreferences?.columnVisibility ?? initialColumnVisibility ?? {});
  const [columnOrder, setColumnOrder] = useState<string[]>(tablePreferences?.columnOrder ?? []);
  const [columnConfigurationOpen, setColumnConfigurationOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [previewColumnId, setPreviewColumnId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tablePreferences) return;
    setSorting(tablePreferences.sorting);
    setColumnVisibility(tablePreferences.columnVisibility);
    setColumnOrder(tablePreferences.columnOrder);
  }, [tablePreferences]);

  const updatePreferences = useCallback((next: Partial<TableDisplayPreferences>) => {
    onTablePreferencesChange?.({
      sorting: next.sorting ?? sorting,
      columnVisibility: next.columnVisibility ?? columnVisibility,
      columnOrder: next.columnOrder ?? columnOrder,
    });
  }, [columnOrder, columnVisibility, onTablePreferencesChange, sorting]);

  const handleSortingChange: OnChangeFn<SortingState> = useCallback((updater) => {
    const next = functionalUpdate(updater, sorting);
    setSorting(next);
    updatePreferences({ sorting: next });
  }, [sorting, updatePreferences]);

  const handleColumnVisibilityChange: OnChangeFn<VisibilityState> = useCallback((updater) => {
    const next = functionalUpdate(updater, columnVisibility);
    setColumnVisibility(next);
    updatePreferences({ columnVisibility: next });
  }, [columnVisibility, updatePreferences]);

  const handleColumnOrderChange: OnChangeFn<string[]> = useCallback((updater) => {
    const next = functionalUpdate(updater, columnOrder);
    setColumnOrder(next);
    updatePreferences({ columnOrder: next });
  }, [columnOrder, updatePreferences]);

  const table = useReactTable({
    data,
    columns: columns as unknown as ColumnDef<T, unknown>[],
    state: { sorting, globalFilter, columnVisibility, columnOrder },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnOrderChange: handleColumnOrderChange,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getColumnCanGlobalFilter: (column) => Boolean(column.accessorFn),
  });

  const { rows } = table.getRowModel();
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  const configurableColumns = table.getAllLeafColumns().filter((column) => column.id !== "__selection");
  const normalizedColumnSearch = columnSearch.trim().toLocaleLowerCase("de-DE");
  const filteredConfigurableColumns = normalizedColumnSearch
    ? configurableColumns.filter((column) => {
        const info = column.columnDef.meta?.info;
        return [columnPickerLabel(column), column.columnDef.meta?.group, info?.term, info?.description, info?.source]
          .some((value) => value?.toLocaleLowerCase("de-DE").includes(normalizedColumnSearch));
      })
    : configurableColumns;
  const previewColumn = configurableColumns.find((column) => column.id === previewColumnId)
    ?? configurableColumns[0];
  const previewExample = previewColumn
    ? rows.map((row) => formatExportValue(row.getValue(previewColumn.id))).find((value) => value.trim().length > 0) ?? "—"
    : "—";

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

  const getExportData = () => buildExportData(
      table.getVisibleLeafColumns().map((column) => ({
        id: column.id,
        header: column.columnDef.header,
      })),
      rows.map((row) => ({
        getValue: (columnId) => row.getValue(columnId),
      })),
    );

  const handleExport = async (format: "excel" | "csv" | "markdown" | "json" | "confluence" | "copy-csv" | "copy-markdown" | "copy-json") => {
    const exportData = getExportData();
    const filename = exportFileName ?? getDefaultExportFileName();

    try {
      if (format === "excel") {
        await exportExcelTable(exportData, filename);
        toast.success("Tabelle als Excel-Datei exportiert.");
        return;
      }

      if (format === "csv") {
        exportCsvTable(exportData, filename);
        toast.success("Tabelle als CSV-Datei exportiert.");
        return;
      }

      if (format === "json") {
        exportJsonTable(exportData, filename);
        toast.success("Tabelle als JSON-Datei exportiert.");
        return;
      }

      if (format === "confluence") {
        await copyConfluenceWikiTable(exportData);
        toast.success("Confluence-Wiki-Markup in die Zwischenablage kopiert.");
        return;
      }

      if (format === "copy-csv") {
        await copyTableText(buildCsvTable(exportData));
        toast.success("CSV in die Zwischenablage kopiert.");
        return;
      }

      if (format === "copy-json") {
        await copyTableText(buildJsonTable(exportData));
        toast.success("JSON in die Zwischenablage kopiert.");
        return;
      }

      if (format === "copy-markdown") {
        await copyTableText(buildMarkdownTable(exportData));
        toast.success("Markdown in die Zwischenablage kopiert.");
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

  const applyTablePreferences = (next: TableDisplayPreferences) => {
    setSorting(next.sorting);
    setColumnVisibility(next.columnVisibility);
    setColumnOrder(next.columnOrder);
    onTablePreferencesChange?.(next);
  };

  const reorderColumn = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const next = configurableColumns.map((column) => column.id);
    const sourceIndex = next.indexOf(sourceId);
    const targetIndex = next.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceId);
    handleColumnOrderChange(next);
  };

  const resetTablePreferences = () => applyTablePreferences({
    sorting: initialSorting ?? [],
    columnVisibility: initialColumnVisibility ?? {},
    columnOrder: [],
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
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{rows.length.toLocaleString("de-DE")} {rows.length === 1 ? "Eintrag" : "Einträge"}</span>
          <div className="flex items-center gap-1">
            {columnPicker && (
              <Tooltip delayDuration={250}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground transition-[scale,color,background-color] duration-150 hover:text-foreground active:scale-[0.96]"
                    aria-label="Spalten konfigurieren"
                    onClick={() => setColumnConfigurationOpen(true)}
                  >
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {columnConfigurationDialog ? "Spaltenansicht bearbeiten" : `Spalten konfigurieren (${visibleColumnCount} von ${configurableColumns.length} sichtbar)`}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground transition-[scale,color,background-color] duration-150 hover:text-foreground active:scale-[0.96]"
                  disabled={rows.length === 0}
                  aria-label="Aktuell sichtbare Tabelle exportieren"
                  onClick={() => setExportOpen(true)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{exportDialog ? "Tabelle exportieren oder kopieren" : "Aktuell sichtbare Tabelle exportieren"}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      <Dialog open={columnConfigurationOpen} onOpenChange={setColumnConfigurationOpen}>
        <DialogContent className="max-h-[min(48rem,calc(100vh-2rem))] max-w-4xl gap-0 overflow-hidden border-border/70 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5 pr-14">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <TableProperties className="h-4 w-4" aria-hidden="true" /> Tabellenansicht
            </div>
            <DialogTitle className="text-balance">Spalten, Reihenfolge und Sortierung</DialogTitle>
            <DialogDescription className="max-w-2xl leading-relaxed">
              Wähle die relevanten Informationen, ziehe Spalten an ihre Position und lege die Standardsortierung fest. Die Erklärungen entsprechen den Hinweisen in der Tabelle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-h-0 border-b border-border/60 lg:border-b-0 lg:border-r">
              <div className="border-b border-border/60 bg-muted/10 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} className="pl-9" placeholder="Spalten, Kategorien oder Erklärungen suchen …" aria-label="Spalten suchen" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground"><span className="tabular-nums">{filteredConfigurableColumns.length}</span> von {configurableColumns.length} Spalten</p>
              </div>
              <ScrollArea className="h-[min(28rem,calc(100vh-23rem))]">
                <div className="space-y-2 p-4">
                {filteredConfigurableColumns.map((column) => {
                  const index = configurableColumns.findIndex((entry) => entry.id === column.id);
                  const info = column.columnDef.meta?.info;
                  const visible = column.getIsVisible();
                  return (
                    <div
                      key={column.id}
                      draggable
                      onDragStart={() => setDraggedColumnId(column.id)}
                      onDragEnd={() => setDraggedColumnId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedColumnId) reorderColumn(draggedColumnId, column.id);
                        setDraggedColumnId(null);
                      }}
                      className={cn(
                        "group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-border/60 bg-card/70 p-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-[transform,box-shadow,border-color,opacity] duration-150",
                        draggedColumnId === column.id && "scale-[0.99] border-primary/50 opacity-60 shadow-none",
                      )}
                    >
                      <div className="flex pt-1">
                        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/55 active:cursor-grabbing" aria-label="Spalte verschieben" />
                      </div>
                      <label className="min-w-0 cursor-pointer" htmlFor={`column-visible-${column.id}`}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`column-visible-${column.id}`}
                            checked={visible}
                            disabled={visible && visibleColumnCount <= 1}
                            onCheckedChange={() => column.toggleVisibility()}
                          />
                          <span className="text-sm font-semibold text-foreground">{columnPickerLabel(column)}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{column.columnDef.meta?.group ?? "Weitere"}</span>
                        </div>
                        <p className="mt-1.5 pl-6 text-xs leading-relaxed text-muted-foreground">
                          {info?.description ?? "Für diese Spalte ist keine zusätzliche Erläuterung hinterlegt."}
                        </p>
                        {info?.source && <p className="mt-1 pl-6 font-mono-data text-[10px] text-muted-foreground/75">Quelle: {info.source}</p>}
                      </label>
                      <div className="flex items-center gap-0.5">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 transition-transform active:scale-[0.96]" disabled={index === 0} onClick={() => reorderColumn(column.id, configurableColumns[index - 1]?.id ?? column.id)} aria-label={`${columnPickerLabel(column)} nach oben verschieben`}>
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 transition-transform active:scale-[0.96]" disabled={index === configurableColumns.length - 1} onClick={() => reorderColumn(column.id, configurableColumns[index + 1]?.id ?? column.id)} aria-label={`${columnPickerLabel(column)} nach unten verschieben`}>
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {filteredConfigurableColumns.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                    Keine passende Spalte gefunden. Suche nach Bezeichnung, Kategorie oder Erklärung.
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>

            <aside className="space-y-4 bg-muted/20 p-4">
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Sichtbare Spalten</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{visibleColumnCount}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {configurableColumns.length}</span></p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Sortierung</p>
                <Select value={sorting[0]?.id ?? "none"} onValueChange={(id) => handleSortingChange(id === "none" ? [] : [{ id, desc: sorting[0]?.desc ?? false }])}>
                  <SelectTrigger aria-label="Sortierspalte auswählen"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Standardsortierung</SelectItem>
                    {configurableColumns.map((column) => <SelectItem key={column.id} value={column.id}>{columnPickerLabel(column)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sorting[0]?.desc ? "desc" : "asc"} disabled={sorting.length === 0} onValueChange={(direction) => sorting[0] && handleSortingChange([{ id: sorting[0].id, desc: direction === "desc" }])}>
                  <SelectTrigger aria-label="Sortierrichtung auswählen"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Aufsteigend</SelectItem>
                    <SelectItem value="desc">Absteigend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 border-t border-border/60 pt-4">
                <p className="text-sm font-semibold">Beispielwert</p>
                <Select value={previewColumn?.id ?? "none"} onValueChange={(id) => setPreviewColumnId(id === "none" ? null : id)}>
                  <SelectTrigger aria-label="Beispielspalte auswählen"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {configurableColumns.map((column) => <SelectItem key={column.id} value={column.id}>{columnPickerLabel(column)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="min-h-16 rounded-lg border border-border/70 bg-background/80 px-3 py-2.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{previewColumn ? columnPickerLabel(previewColumn) : "Keine Spalte"}</p>
                  <p className="mt-1 break-words font-mono-data text-xs leading-relaxed text-foreground">{previewExample}</p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">Erster verfügbarer Wert aus der aktuell gefilterten Tabelle.</p>
              </div>
              <div className="rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Spalten lassen sich per Drag & Drop oder über die Pfeile in ihre Reihenfolge bringen.
              </div>
            </aside>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4 sm:justify-between">
            <Button type="button" variant="ghost" className="gap-2" onClick={resetTablePreferences}><RotateCcw className="h-4 w-4" /> Standard wiederherstellen</Button>
            <Button type="button" onClick={() => setColumnConfigurationOpen(false)}>Fertig</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden border-border/70 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5 pr-14">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Download className="h-4 w-4" aria-hidden="true" /> Tabellenexport</div>
            <DialogTitle className="text-balance">Sichtbare Tabelle weitergeben</DialogTitle>
            <DialogDescription>Exportiert werden {rows.length.toLocaleString("de-DE")} gefilterte Zeilen und {visibleColumnCount} sichtbare Spalten – genau wie aktuell in der Tabelle.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
              <div className="mb-3 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /><h3 className="font-semibold">Als Datei</h3></div>
              <div className="grid gap-2">
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("excel")}><FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("csv")}><FileText className="h-4 w-4" /> CSV (.csv)</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("markdown")}><FileText className="h-4 w-4" /> Markdown (.md)</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("json")}><FileCode2 className="h-4 w-4" /> JSON (.json)</Button>
              </div>
            </section>
            <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
              <div className="mb-3 flex items-center gap-2"><ClipboardCopy className="h-4 w-4 text-primary" /><h3 className="font-semibold">In die Zwischenablage</h3></div>
              <div className="grid gap-2">
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("copy-csv")}><ClipboardCopy className="h-4 w-4" /> CSV</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("copy-markdown")}><ClipboardCopy className="h-4 w-4" /> Markdown</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("confluence")}><ClipboardCopy className="h-4 w-4" /> Confluence Wiki-Markup</Button>
                <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void handleExport("copy-json")}><ClipboardCopy className="h-4 w-4" /> JSON</Button>
              </div>
            </section>
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4"><Button type="button" onClick={() => setExportOpen(false)}>Schließen</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
