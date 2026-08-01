import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock } from "lucide-react";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { COMPLIANCE_SECTIONS, NTP_COLUMNS } from "@/lib/glossaries/compliance";
import { buildHostHygieneRows, type HostHygieneRow } from "@/lib/hostHygiene";

const columns: ColumnDef<HostHygieneRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NTP_COLUMNS.host } },
  { accessorKey: "ntpServers", header: "NTP Server", meta: { info: NTP_COLUMNS.ntpServers } },
  { accessorKey: "ntpdRunning", header: "NTPD", meta: { info: NTP_COLUMNS.ntpdRunning }, cell: ({ getValue }) => getValue() ? <span className="text-success">Ja</span> : <span className="text-destructive">Nein</span> },
  { accessorKey: "dnsServers", header: "DNS Server", meta: { info: NTP_COLUMNS.dnsServers } },
  { accessorKey: "dhcp", header: "DHCP", meta: { info: NTP_COLUMNS.dhcp }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "issues", header: "Probleme", meta: { info: NTP_COLUMNS.issues }, cell: ({ getValue }) => <span className="text-warning text-xs">{getValue() as string}</span> },
];

export function HostHygienePanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rawVHost = [], isLoading } = useRawSheet("vHost");
  const rows = useMemo<HostHygieneRow[]>(() => buildHostHygieneRows(rawVHost), [rawVHost]);
  if (isLoading) return <PanelLoadingState />;

  return <section className="space-y-4">
    {rows.length > 0 && <div><InfoTooltip entry={COMPLIANCE_SECTIONS.ntpDnsHygiene} side="bottom"><h3 className="mb-3 flex w-fit cursor-help items-center gap-2 text-sm font-semibold text-muted-foreground"><Clock className="h-4 w-4" /> NTP/DNS Hygiene ({rows.length})</h3></InfoTooltip><VirtualTable tableId="hosts/hygiene" columnPicker data={rows} columns={columns} globalFilter={filters.search} height={300} /></div>}
  </section>;
}
