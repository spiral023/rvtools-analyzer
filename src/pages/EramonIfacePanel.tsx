import { useMemo } from "react";
import { AlertCircle, Cable, CheckCircle2, Network, Router } from "lucide-react";
import { useActiveSnapshotIds, useAllEramonIfaceLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { formatBandwidth } from "@/lib/eramon";
import { NET_ERAMON_IFACE_COLUMNS, NET_ERAMON_IFACE_KPI } from "@/lib/glossaries/networking";
import type { EramonIfaceLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

function statusBadge(row: EramonIfaceLatest) {
  if (row.statusLabel === "aktiv") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">aktiv</Badge>;
  }
  if (row.statusLabel === "down") {
    return <Badge variant="secondary">down</Badge>;
  }
  return textCell(row.statusLabel);
}

const columns: ColumnDef<EramonIfaceLatest, unknown>[] = [
  { accessorKey: "deviceName", header: "Switch", meta: { info: NET_ERAMON_IFACE_COLUMNS.deviceName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "portName", header: "Port", meta: { info: NET_ERAMON_IFACE_COLUMNS.portName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "portDesc", header: "Beschreibung", meta: { info: NET_ERAMON_IFACE_COLUMNS.portDesc }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    accessorKey: "bandbreiteBps",
    header: "Bandbreite",
    meta: { info: NET_ERAMON_IFACE_COLUMNS.bandbreite },
    cell: ({ getValue }) => {
      const bps = getValue() as number | null;
      return <span className="font-mono-data" title={bps !== null ? `${bps} bit/s` : undefined}>{formatBandwidth(bps)}</span>;
    },
  },
  { accessorKey: "statusLabel", header: "Status", meta: { info: NET_ERAMON_IFACE_COLUMNS.status }, cell: ({ row }) => statusBadge(row.original) },
];

export function EramonIfacePanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rows = [], isLoading } = useAllEramonIfaceLatest();

  const switchCount = useMemo(() => new Set(rows.map((r) => r.switchNorm)).size, [rows]);
  const activeCount = useMemo(() => rows.filter((r) => r.statusLabel === "aktiv").length, [rows]);
  const downCount = useMemo(() => rows.filter((r) => r.statusLabel === "down").length, [rows]);

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-6 w-6" />}
        title="Keine Eramon-Switch-Port-Daten"
        description="Laden Sie eine Eramon-Switch-Port-CSV (device_name/port_name/port_status) auf der Upload-Seite hoch."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Switches" value={formatNum(switchCount)} icon={<Router className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.switches} />
        <KpiCard title="Ports gesamt" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.ports} />
        <KpiCard title="Aktive Ports" value={formatNum(activeCount)} icon={<CheckCircle2 className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.active} />
        <KpiCard title="Down-Ports" value={formatNum(downCount)} severity={downCount > 0 ? "warn" : "ok"} icon={<AlertCircle className="h-4 w-4" />} info={NET_ERAMON_IFACE_KPI.down} />
      </KpiGrid>
      <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="eramon-switch-ports" />
    </div>
  );
}
