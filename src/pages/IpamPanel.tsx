import { useMemo } from "react";
import { Fingerprint, MapPinned, Network, Radar, Server } from "lucide-react";
import { useActiveSnapshotIds, useAllIpamLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { NET_IPAM_COLUMNS, NET_IPAM_KPI } from "@/lib/glossaries/networking";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type { IpamLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

function statusBadge(status: string | null) {
  if (!status) return "—";
  if (status === "Used") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

const columns: ColumnDef<IpamLatest, unknown>[] = [
  { accessorKey: "ipAddress", header: "IP Address", meta: { info: NET_IPAM_COLUMNS.ipAddress }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "name", header: "Name", meta: { info: NET_IPAM_COLUMNS.name }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", meta: { info: NET_IPAM_COLUMNS.status }, cell: ({ getValue }) => statusBadge(getValue() as string | null) },
  { accessorKey: "type", header: "Type", meta: { info: NET_IPAM_COLUMNS.type }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "usage", header: "Usage", meta: { info: NET_IPAM_COLUMNS.usage }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "firstDiscovered", header: "First Discovered", meta: { info: NET_IPAM_COLUMNS.firstDiscovered }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "lastDiscovered", header: "Last Discovered", meta: { info: NET_IPAM_COLUMNS.lastDiscovered }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "comment", header: "Comment", meta: { info: NET_IPAM_COLUMNS.comment }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "site", header: "Site", meta: { info: NET_IPAM_COLUMNS.site }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "macAddress", header: "MAC Address", meta: { info: NET_IPAM_COLUMNS.macAddress }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "os", header: "OS", meta: { info: NET_IPAM_COLUMNS.os }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "netBiosName", header: "NetBIOS Name", meta: { info: NET_IPAM_COLUMNS.netBiosName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "deviceTypes", header: "Device Type(s)", meta: { info: NET_IPAM_COLUMNS.deviceTypes }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "openPorts", header: "Open Port(s)", meta: { info: NET_IPAM_COLUMNS.openPorts }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "fingerprint", header: "Fingerprint", meta: { info: NET_IPAM_COLUMNS.fingerprint }, cell: ({ getValue }) => textCell(getValue() as string | null) },
];

export function IpamPanel() {
  const { data: rows = [], isLoading } = useAllIpamLatest();
  const { filters } = useActiveSnapshotIds();

  const usedCount = useMemo(() => rows.filter((r) => r.status === "Used").length, [rows]);
  const unusedCount = useMemo(() => rows.filter((r) => r.status === "Unused").length, [rows]);
  const withNameCount = useMemo(() => rows.filter((r) => Boolean(r.name)).length, [rows]);
  const withDiscoveryCount = useMemo(
    () => rows.filter((r) => Boolean(r.firstDiscovered) || Boolean(r.lastDiscovered)).length,
    [rows],
  );

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-6 w-6" />}
        title="Keine IPAM-Daten"
        description="Laden Sie eine IPAM-CSV (Infoblox-Export) auf der Upload-Seite hoch, um die IP-Adressverwaltung auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Gesamt-IPs" value={formatNum(rows.length)} icon={<Network className="h-4 w-4" />} info={NET_IPAM_KPI.total} />
        <KpiCard title="Used" value={formatNum(usedCount)} icon={<Server className="h-4 w-4" />} info={NET_IPAM_KPI.used} />
        <KpiCard title="Unused" value={formatNum(unusedCount)} icon={<MapPinned className="h-4 w-4" />} info={NET_IPAM_KPI.unused} />
        <KpiCard title="Mit DNS-Namen" value={formatNum(withNameCount)} icon={<Fingerprint className="h-4 w-4" />} info={NET_IPAM_KPI.withDnsName} />
        <KpiCard title="Mit Discovery-Daten" value={formatNum(withDiscoveryCount)} icon={<Radar className="h-4 w-4" />} info={NET_IPAM_KPI.withDiscovery} />
      </KpiGrid>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">IP-Adressen ({rows.length})</h3>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="ipam" />
      </div>
    </div>
  );
}
