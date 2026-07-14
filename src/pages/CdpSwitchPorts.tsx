import { useMemo } from "react";
import { Cable, HelpCircle, Router, Server } from "lucide-react";
import { useActiveSnapshotIds, useAllCdpLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { filterCdpRows } from "@/lib/cdp";
import { NET_CDP_KPI, NET_CDP_COLUMNS, NET_CDP_SECTIONS } from "@/lib/glossaries/networking";
import type { CdpLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const columns: ColumnDef<CdpLatest, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_CDP_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_CDP_COLUMNS.cluster }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "adapter", header: "Adapter", meta: { info: NET_CDP_COLUMNS.adapter }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  {
    accessorKey: "linkStatus",
    header: "Link",
    meta: { info: NET_CDP_COLUMNS.linkStatus },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return "—";
      return <span className={v.toLowerCase() === "up" ? "" : "text-warning font-semibold"}>{v}</span>;
    },
  },
  {
    accessorKey: "cdpDeviceId",
    header: "Switch",
    meta: { info: NET_CDP_COLUMNS.cdpDeviceId },
    cell: ({ row, getValue }) => {
      const v = getValue() as string | null;
      if (!v) return "—";
      return <div className="max-w-[280px] truncate" title={row.original.cdpSoftware ?? v}>{v}</div>;
    },
  },
  { accessorKey: "cdpPortId", header: "Port", meta: { info: NET_CDP_COLUMNS.cdpPortId }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "nativeVlan", header: "Native VLAN", meta: { info: NET_CDP_COLUMNS.nativeVlan }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "mtu", header: "MTU", meta: { info: NET_CDP_COLUMNS.mtu }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "cdpPlatform", header: "Plattform", meta: { info: NET_CDP_COLUMNS.cdpPlatform }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "cdpMgmtIp", header: "Mgmt-IP", meta: { info: NET_CDP_COLUMNS.cdpMgmtIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_CDP_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

export function CdpPanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: allRows = [] } = useAllCdpLatest();

  const rows = useMemo(() => filterCdpRows(allRows, filters), [allRows, filters]);

  const hostsWithCdp = useMemo(
    () => new Set(rows.filter((r) => r.cdpAvailable === true).map((r) => r.hostNorm)).size,
    [rows],
  );
  const adaptersWithoutCdp = useMemo(() => rows.filter((r) => r.cdpAvailable !== true).length, [rows]);
  const switchCount = useMemo(
    () => new Set(rows.map((r) => r.cdpDeviceId).filter((v): v is string => Boolean(v))).size,
    [rows],
  );

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<Cable className="h-6 w-6" />}
        title="Keine CDP-Daten"
        description="Laden Sie eine CDP-CSV auf der Upload-Seite hoch, um die physische Switch-Anbindung auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Hosts mit CDP-Daten" value={formatNum(hostsWithCdp)} icon={<Server className="h-4 w-4" />} info={NET_CDP_KPI.hostsWithCdp} />
        <KpiCard title="Physische Adapter" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} info={NET_CDP_KPI.adapters} />
        <KpiCard title="Adapter ohne CDP-Daten" value={formatNum(adaptersWithoutCdp)} severity={adaptersWithoutCdp > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={NET_CDP_KPI.adaptersWithoutCdp} />
        <KpiCard title="Eindeutige Switches" value={formatNum(switchCount)} icon={<Router className="h-4 w-4" />} info={NET_CDP_KPI.switches} />
      </KpiGrid>

      <div>
        <InfoTooltip entry={NET_CDP_SECTIONS.table} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Switch-Ports pro Adapter ({rows.length})</h3>
        </InfoTooltip>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="cdp-switch-ports" />
      </div>
    </div>
  );
}
