import { useMemo, useState } from "react";
import { ListChecks, CheckCircle2, Archive, HelpCircle, AlertTriangle, Tag, Database, Server } from "lucide-react";
import { useActiveSnapshotIds, useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { PortAuditRow, PortMatchStatus } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const MATCH_STATUS_LABELS: Record<PortMatchStatus, string> = {
  "confirmed-cdp": "CDP bestätigt",
  "text-match": "RVTools-Treffer",
  "documented-only": "Nur dokumentiert",
  "unknown": "Unbekannt",
  "no-target": "Kein Ziel",
};

function matchStatusBadge(status: PortMatchStatus) {
  const label = MATCH_STATUS_LABELS[status];
  if (status === "confirmed-cdp") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{label}</Badge>;
  }
  if (status === "documented-only") {
    return <Badge className="border-transparent bg-warning text-warning-foreground hover:bg-warning/80">{label}</Badge>;
  }
  if (status === "unknown") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (status === "no-target") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function isNotable(row: PortAuditRow): boolean {
  if (row.matchStatus === "no-target") return false;
  if (row.matchStatus === "confirmed-cdp" && !row.labelConflict && !row.statusConflict) return false;
  return true;
}

function presenceBadge(present: boolean) {
  return present
    ? <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">vorhanden</Badge>
    : <Badge variant="destructive">fehlt</Badge>;
}

function listCell(values: string[]) {
  if (values.length === 0) return "—";
  return <span className="font-mono-data text-xs">{values.join(", ")}</span>;
}

const columns: ColumnDef<PortAuditRow, unknown>[] = [
  { accessorKey: "switchHostname", header: "Switch", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Beschreibung", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    id: "matchStatus",
    header: "Match-Status",
    accessorFn: (row) => `${MATCH_STATUS_LABELS[row.matchStatus]} ${row.matchStatus}`,
    cell: ({ row }) => matchStatusBadge(row.original.matchStatus),
  },
  { accessorKey: "matchedHost", header: "Vermuteter Host", cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    accessorKey: "finding",
    header: "Auffälligkeit",
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return textCell(v);
      return <span className="text-warning text-xs">{v}</span>;
    },
  },
];

const rvtoolsHostColumns: ColumnDef<RvtoolsHostQualityRow, unknown>[] = [
  { accessorKey: "host", header: "ESXi-Host (RVTools)", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "cluster", header: "Cluster", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "version", header: "ESXi-Version", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "techInfoPresent", header: "Tech-Info", accessorFn: (row) => row.techInfoPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.techInfoPresent) },
  { accessorKey: "techInfoServerType", header: "Servertyp", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "techInfoDepartment", header: "Abteilung", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "ipamPresent", header: "IPAM", accessorFn: (row) => row.ipamPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.ipamPresent) },
  { id: "ipamAddresses", header: "IP-Adressen", accessorFn: (row) => row.ipamAddresses.join(" "), cell: ({ row }) => listCell(row.original.ipamAddresses) },
  { id: "ipamNetworks", header: "IPAM-Netze", accessorFn: (row) => row.ipamNetworks.join(" "), cell: ({ row }) => listCell(row.original.ipamNetworks) },
  { accessorKey: "finding", header: "Datenlücke", cell: ({ getValue }) => <span className="text-warning text-xs">{textCell(getValue() as string | null)}</span> },
];

const techInfoHostColumns: ColumnDef<TechInfoHostQualityRow, unknown>[] = [
  { accessorKey: "techInfoName", header: "Objekt (Tech-Info)", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "serverType", header: "Servertyp", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "department", header: "Abteilung", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "maintenanceWindow", header: "Wartungsfenster", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "rvtoolsPresent", header: "RVTools", accessorFn: (row) => row.rvtoolsPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.rvtoolsPresent) },
  { accessorKey: "rvtoolsHost", header: "ESXi-Host (RVTools)", cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "rvtoolsCluster", header: "Cluster", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "ipamPresent", header: "IPAM", accessorFn: (row) => row.ipamPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.ipamPresent) },
  { id: "ipamAddresses", header: "IP-Adressen", accessorFn: (row) => row.ipamAddresses.join(" "), cell: ({ row }) => listCell(row.original.ipamAddresses) },
  { id: "ipamNetworks", header: "IPAM-Netze", accessorFn: (row) => row.ipamNetworks.join(" "), cell: ({ row }) => listCell(row.original.ipamNetworks) },
  { accessorKey: "finding", header: "Datenlücke", cell: ({ getValue }) => <span className="text-warning text-xs">{textCell(getValue() as string | null)}</span> },
];

export function NetworkAuditPanel() {
  const { rows: allRows, hostQuality = { rvtoolsRows: [], techInfoRows: [] }, isLoading } = useNetworkAudit();
  const { filters } = useActiveSnapshotIds();
  const [onlyNotable, setOnlyNotable] = useState(true);
  const [onlyHostGaps, setOnlyHostGaps] = useState(true);

  const rows = useMemo(() => (onlyNotable ? allRows.filter(isNotable) : allRows), [allRows, onlyNotable]);
  const rvtoolsHostRows = useMemo(
    () => onlyHostGaps ? hostQuality.rvtoolsRows.filter((row) => row.finding !== null) : hostQuality.rvtoolsRows,
    [hostQuality.rvtoolsRows, onlyHostGaps],
  );
  const techInfoHostRows = useMemo(
    () => onlyHostGaps ? hostQuality.techInfoRows.filter((row) => row.finding !== null) : hostQuality.techInfoRows,
    [hostQuality.techInfoRows, onlyHostGaps],
  );

  const confirmedCount = useMemo(() => allRows.filter((r) => r.matchStatus === "confirmed-cdp").length, [allRows]);
  const documentedOnlyCount = useMemo(() => allRows.filter((r) => r.matchStatus === "documented-only").length, [allRows]);
  const unknownCount = useMemo(() => allRows.filter((r) => r.matchStatus === "unknown").length, [allRows]);
  const statusConflictCount = useMemo(() => allRows.filter((r) => r.statusConflict).length, [allRows]);
  const labelConflictCount = useMemo(() => allRows.filter((r) => r.labelConflict).length, [allRows]);

  if (isLoading) return <PanelLoadingState />;

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="h-6 w-6" />}
        title="Keine Daten für die Kontrolle"
        description="Laden Sie eine Cisco-Switch-TXT auf der Upload-Seite hoch, um Switch-Ports gegen CDP-, RVTools-, TechInfo- und IPAM-Daten abzugleichen."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Ports gesamt" value={formatNum(allRows.length)} icon={<ListChecks className="h-4 w-4" />} />
        <KpiCard title="CDP-bestätigt" value={formatNum(confirmedCount)} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard title="Nur dokumentiert" value={formatNum(documentedOnlyCount)} severity={documentedOnlyCount > 0 ? "warn" : "ok"} icon={<Archive className="h-4 w-4" />} />
        <KpiCard title="Unbekannt" value={formatNum(unknownCount)} severity={unknownCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} />
        <KpiCard title="Status-Konflikte" value={formatNum(statusConflictCount)} severity={statusConflictCount > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Beschriftungs-Konflikte" value={formatNum(labelConflictCount)} severity={labelConflictCount > 0 ? "warn" : "ok"} icon={<Tag className="h-4 w-4" />} />
      </KpiGrid>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Switch-Ports ({rows.length} von {allRows.length})</h3>
          <label htmlFor="only-notable" className="flex cursor-pointer items-center gap-3 rounded-md bg-background/70 px-3 py-2 text-xs font-medium">
            <span>Nur Auffälligkeiten</span>
            <ToggleSwitch id="only-notable" checked={onlyNotable} onCheckedChange={setOnlyNotable} aria-label="Nur auffällige Ports anzeigen" />
          </label>
        </div>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="network-audit" />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/60" aria-labelledby="host-quality-heading">
        <div className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Database className="h-4 w-4" /></div>
              <div>
                <h3 id="host-quality-heading" className="text-sm font-semibold">Host-Datenabgleich</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Gleicht ESXi-Namen aus RVTools und Tech-Info mit IPAM ab. Die Netze werden aus den IPAM-Adressen als IPv4-/24 bzw. IPv6-/64 abgeleitet.</p>
              </div>
            </div>
            <label htmlFor="only-host-gaps" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
              <span>Nur Datenlücken</span>
              <ToggleSwitch id="only-host-gaps" checked={onlyHostGaps} onCheckedChange={setOnlyHostGaps} aria-label="Nur Host-Datenlücken anzeigen" />
            </label>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">ESXi aus RVTools ({rvtoolsHostRows.length} von {hostQuality.rvtoolsRows.length})</h4></div>
              <span className="text-xs text-muted-foreground">Startpunkt: vCenter-Inventar</span>
            </div>
            <VirtualTable data={rvtoolsHostRows} columns={rvtoolsHostColumns} globalFilter={filters.search} height={360} exportFileName="host-data-quality-rvtools" />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">Objekte aus Tech-Info ({techInfoHostRows.length} von {hostQuality.techInfoRows.length})</h4></div>
              <span className="text-xs text-muted-foreground">Startpunkt: technische Dokumentation</span>
            </div>
            <VirtualTable data={techInfoHostRows} columns={techInfoHostColumns} globalFilter={filters.search} height={360} exportFileName="host-data-quality-techinfo" />
          </div>
        </div>
      </section>
    </div>
  );
}
