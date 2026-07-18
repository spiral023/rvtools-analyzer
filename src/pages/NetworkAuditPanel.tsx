import { useMemo, useState } from "react";
import { ListChecks, CheckCircle2, Archive, HelpCircle, AlertTriangle, Tag } from "lucide-react";
import { useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { PortAuditRow, PortMatchStatus } from "@/lib/networkAudit";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const MATCH_STATUS_LABELS: Record<PortMatchStatus, string> = {
  "confirmed-cdp": "CDP bestätigt",
  "text-match": "Beschreibung",
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

const columns: ColumnDef<PortAuditRow, unknown>[] = [
  { accessorKey: "switchHostname", header: "Switch", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Beschreibung", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "matchStatus", header: "Match-Status", cell: ({ getValue }) => matchStatusBadge(getValue() as PortMatchStatus) },
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

export function NetworkAuditPanel() {
  const { rows: allRows, isLoading } = useNetworkAudit();
  const [onlyNotable, setOnlyNotable] = useState(true);

  const rows = useMemo(() => (onlyNotable ? allRows.filter(isNotable) : allRows), [allRows, onlyNotable]);

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
        <VirtualTable data={rows} columns={columns} height={500} exportFileName="network-audit" />
      </div>
    </div>
  );
}
