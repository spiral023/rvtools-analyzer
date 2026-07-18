import { useMemo } from "react";
import { Cable, CheckCircle2, Router, XCircle } from "lucide-react";
import { useAllSwitchLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { SwitchLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

function statusBadge(status: string | null) {
  if (!status) return "—";
  if (status === "connected") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

const columns: ColumnDef<SwitchLatest, unknown>[] = [
  { accessorKey: "hostname", header: "Hostname", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Description", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => statusBadge(getValue() as string | null) },
  { accessorKey: "mode", header: "Mode", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "duplex", header: "Duplex", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "speed", header: "Speed", cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "transceiver", header: "Transceiver", cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

export function SwitchPanel() {
  const { data: rows = [], isLoading } = useAllSwitchLatest();

  const connectedCount = useMemo(() => rows.filter((r) => r.status === "connected").length, [rows]);
  const notConnectedCount = useMemo(() => rows.filter((r) => r.status !== "connected").length, [rows]);
  const switchCount = useMemo(() => new Set(rows.map((r) => r.hostname)).size, [rows]);

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Router className="h-6 w-6" />}
        title="Keine Switch-Daten"
        description="Laden Sie eine Cisco-Switch-TXT auf der Upload-Seite hoch, um den Interface-Status auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Switches" value={formatNum(switchCount)} icon={<Router className="h-4 w-4" />} />
        <KpiCard title="Interfaces gesamt" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} />
        <KpiCard title="Connected" value={formatNum(connectedCount)} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard title="Not Connected" value={formatNum(notConnectedCount)} severity={notConnectedCount > 0 ? "warn" : "ok"} icon={<XCircle className="h-4 w-4" />} />
      </KpiGrid>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Interfaces ({rows.length})</h3>
        <VirtualTable data={rows} columns={columns} height={500} exportFileName="cisco-switch-ports" />
      </div>
    </div>
  );
}
