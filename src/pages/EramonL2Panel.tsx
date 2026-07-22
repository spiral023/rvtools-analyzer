import { useMemo } from "react";
import { Fingerprint, Network, Router, Tags } from "lucide-react";
import { useActiveSnapshotIds, useAllEramonL2Latest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { NET_ERAMON_L2_COLUMNS, NET_ERAMON_L2_KPI } from "@/lib/glossaries/networking";
import type { EramonL2Latest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

const columns: ColumnDef<EramonL2Latest, unknown>[] = [
  { accessorKey: "ip", header: "IP", meta: { info: NET_ERAMON_L2_COLUMNS.ip }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_ERAMON_L2_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_ERAMON_L2_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "switchName", header: "Switch", meta: { info: NET_ERAMON_L2_COLUMNS.switchName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", meta: { info: NET_ERAMON_L2_COLUMNS.interface }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_ERAMON_L2_COLUMNS.vlan }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

export function EramonL2Panel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rows = [], isLoading } = useAllEramonL2Latest();

  const macCount = useMemo(() => new Set(rows.map((r) => r.mac).filter(Boolean)).size, [rows]);
  const ipCount = useMemo(() => new Set(rows.map((r) => r.ip).filter((v): v is string => Boolean(v))).size, [rows]);
  const vlanCount = useMemo(() => new Set(rows.map((r) => r.vlan).filter(Boolean)).size, [rows]);

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-6 w-6" />}
        title="Keine Eramon-MAC-Tabellen-Daten"
        description="Laden Sie eine Eramon-L2-CSV (name/interface/mac/vlan) auf der Upload-Seite hoch."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Einträge gesamt" value={formatNum(rows.length)} icon={<Network className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.entries} />
        <KpiCard title="Eindeutige MACs" value={formatNum(macCount)} icon={<Fingerprint className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.macs} />
        <KpiCard title="Eindeutige IPs" value={formatNum(ipCount)} icon={<Router className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.ips} />
        <KpiCard title="VLANs" value={formatNum(vlanCount)} icon={<Tags className="h-4 w-4" />} info={NET_ERAMON_L2_KPI.vlans} />
      </KpiGrid>
      <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="eramon-mac-tabelle" />
    </div>
  );
}
