import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Server, TriangleAlert } from "lucide-react";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MaintenanceWindowDefinition, TechInfoLatest } from "@/domain/models/types";
import type { MaintenanceWindowAssignmentResult } from "@/lib/maintenanceWindows";
import { summarizeWeeklySlots } from "@/lib/maintenanceWindows";
import { normalizedOptionalColumnMeta } from "@/lib/normalizedColumnMeta";

interface AssignmentRow {
  id: string;
  abbreviation: string;
  description: string;
  handling: string;
  status: "known" | "unknown";
  systemCount: number;
  schedule: string;
  systems: TechInfoLatest[];
  searchText: string;
}

const HANDLING_LABEL: Record<MaintenanceWindowDefinition["handling"], string> = {
  regular: "Regulär",
  always: "Immer verfügbar",
  "approval-required": "Freigabe erforderlich",
  external: "Extern verwaltet",
};

const systemColumns: ColumnDef<TechInfoLatest, unknown>[] = [
  { accessorKey: "vmName", header: "System" },
  { accessorKey: "sysv", header: "Systemverantwortlicher", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "sysvDepartment", header: "Abteilung", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "operatingSystem", header: "Betriebssystem", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "serverType", header: "Servertyp", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "maintenanceWindow", header: "Wartungsfenster", meta: normalizedOptionalColumnMeta("Wartungsfenster", "Im Tech-Info-Datensatz hinterlegtes Wartungsfenster.", "Tech-Info · Wartungsfenster"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "sysvDeputy", header: "SysVStv", meta: normalizedOptionalColumnMeta("SysVStv", "Stellvertretung der Systemverantwortung.", "Tech-Info · SysVStv"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "sysvDeputyDepartment", header: "SysVStv-Abteilung", meta: normalizedOptionalColumnMeta("SysVStv-Abteilung", "Abteilung der Stellvertretung.", "Tech-Info · SysVStv Abteilung"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "clusterFromTechInfo", header: "Cluster (Tech-Info)", meta: normalizedOptionalColumnMeta("Cluster (Tech-Info)", "Cluster-Zuordnung laut Tech-Info.", "Tech-Info · Cluster"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "cvBackup", header: "CV-Backup", meta: normalizedOptionalColumnMeta("CV-Backup", "Kennzeichen für CommVault-Backup laut Tech-Info.", "Tech-Info · CV-Backup"), cell: ({ getValue }) => getValue() === true ? "Ja" : getValue() === false ? "Nein" : "—" },
  { accessorKey: "bz", header: "BZ", meta: normalizedOptionalColumnMeta("BZ", "Betriebszeit-/Kennzeichen aus Tech-Info.", "Tech-Info · BZ"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "az", header: "AZ", meta: normalizedOptionalColumnMeta("AZ", "Zusätzliches Kennzeichen aus Tech-Info.", "Tech-Info · AZ"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "comment", header: "Kommentar", meta: normalizedOptionalColumnMeta("Kommentar", "Freitext-Kommentar aus Tech-Info.", "Tech-Info · Kommentar"), cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
];

function buildRows(assignments: MaintenanceWindowAssignmentResult): AssignmentRow[] {
  const rows: AssignmentRow[] = [];
  for (const group of assignments.known) {
    const handling = HANDLING_LABEL[group.definition.handling];
    rows.push({
      id: group.definition.id,
      abbreviation: group.definition.abbreviation || "Ohne Abkürzung",
      description: group.definition.description || "Keine Beschreibung",
      handling,
      status: "known",
      systemCount: group.systems.length,
      schedule: summarizeWeeklySlots(group.definition.weeklySlots),
      systems: group.systems,
      searchText: `${group.definition.abbreviation} ${group.definition.description} ${handling} ${group.systems.map((system) => system.vmName).join(" ")}`.toLocaleLowerCase("de-DE"),
    });
  }
  for (const group of assignments.unknown) {
    rows.push({
      id: `unknown:${group.normalizedAbbreviation}`,
      abbreviation: group.abbreviation,
      description: "Nicht im Katalog definiert",
      handling: "Unbekannt",
      status: "unknown",
      systemCount: group.systems.length,
      schedule: "Keine Definition",
      systems: group.systems,
      searchText: `${group.abbreviation} ${group.systems.map((system) => system.vmName).join(" ")}`.toLocaleLowerCase("de-DE"),
    });
  }
  return rows.sort((left, right) => {
    if (left.status !== right.status) return left.status === "unknown" ? -1 : 1;
    return right.systemCount - left.systemCount || left.abbreviation.localeCompare(right.abbreviation, "de-DE", { numeric: true });
  });
}

export function MaintenanceAssignmentsPanel({
  assignments,
  search,
}: {
  assignments: MaintenanceWindowAssignmentResult;
  search: string;
}) {
  const [selected, setSelected] = useState<AssignmentRow | null>(null);
  const allRows = useMemo(() => buildRows(assignments), [assignments]);
  const normalizedSearch = search.trim().toLocaleLowerCase("de-DE");
  const rows = useMemo(
    () => normalizedSearch ? allRows.filter((row) => row.searchText.includes(normalizedSearch)) : allRows,
    [allRows, normalizedSearch],
  );
  const columns = useMemo<ColumnDef<AssignmentRow, unknown>[]>(() => [
    {
      accessorKey: "abbreviation",
      header: "Wartungsfenster",
      cell: ({ row }) => (
        <button
          type="button"
          aria-label={`Systeme für ${row.original.abbreviation} anzeigen`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row.original);
          }}
          className="font-mono-data font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.abbreviation}
        </button>
      ),
    },
    { accessorKey: "description", header: "Beschreibung" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => row.original.status === "known"
        ? <Badge variant="secondary">Definiert</Badge>
        : <Badge variant="outline" className="border-warning/50 text-warning">Unbekannt</Badge>,
    },
    { accessorKey: "handling", header: "Behandlung" },
    {
      accessorKey: "systemCount",
      header: "Systeme",
      cell: ({ getValue }) => <span className="font-mono-data tabular-nums">{(getValue() as number).toLocaleString("de-DE")}</span>,
    },
    {
      accessorKey: "schedule",
      header: "Zeitplan",
      cell: ({ getValue }) => {
        const value = getValue() as string;
        return <div className="max-w-[24rem] truncate text-xs text-muted-foreground" title={value}>{value}</div>;
      },
    },
  ], []);

  return (
    <section className="space-y-3 border-t border-border/70 pt-5" aria-labelledby="maintenance-assignments-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="maintenance-assignments-title" className="text-base font-semibold">Systemzuordnungen</h2>
          <p className="text-sm text-muted-foreground">Virtualisierte Übersicht aller Fenster; ein Klick öffnet die zugehörigen Systeme.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Server className="h-3.5 w-3.5" />{assignments.known.length} definiert</span>
          <span className="flex items-center gap-1 text-warning"><TriangleAlert className="h-3.5 w-3.5" />{assignments.unknown.length} unbekannt</span>
        </div>
      </div>
      <VirtualTable
        tableId="maintenance/system-assignments"
        columnPicker
        data={rows}
        columns={columns}
        height={420}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        exportFileName="wartungsfenster-zuordnungen"
        emptyTitle="Keine Zuordnungen"
        emptyDescription={normalizedSearch ? "Kein Wartungsfenster oder System passt zur Suche." : "Noch keine Wartungsfenster oder Systemzuordnungen vorhanden."}
      />

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border bg-muted/10 px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              {selected?.status === "unknown" ? <TriangleAlert className="h-5 w-5 text-warning" /> : <Server className="h-5 w-5 text-primary" />}
              Systeme in {selected?.abbreviation ?? "Wartungsfenster"}
            </DialogTitle>
            <DialogDescription>
              {selected ? `${selected.systemCount.toLocaleString("de-DE")} Systeme · ${selected.description}` : "Systeme der gewählten Zuordnung"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-4">
            <VirtualTable
              tableId="maintenance/window-systems"
              columnPicker
              data={selected?.systems ?? []}
              columns={systemColumns}
              height={480}
              getRowId={(row) => row.vmNameNorm}
              exportFileName={`wartungsfenster-${selected?.abbreviation ?? "systeme"}`}
              emptyTitle="Keine Systeme"
              emptyDescription="Diesem Wartungsfenster sind aktuell keine Systeme zugeordnet."
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
