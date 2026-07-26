import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import type { NormalizedHost } from "@/domain/models/types";
import { HOST_COLUMNS, COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";

const hostColumns: ColumnDef<NormalizedHost, unknown>[] = [
  { accessorKey: "vcenterId", header: "vCenter" },
  { accessorKey: "host", header: "Host", meta: { info: HOST_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: HOST_COLUMNS.cluster } },
  { accessorKey: "version", header: "ESXi Version", meta: { info: HOST_COLUMNS.version } },
  { accessorKey: "build", header: "Build", meta: { info: HOST_COLUMNS.build } },
  { accessorKey: "cpuModel", header: "CPU Model", meta: { info: HOST_COLUMNS.cpuModel } },
  { accessorKey: "vendor", header: "Vendor", meta: { info: HOST_COLUMNS.vendor } },
  { accessorKey: "model", header: "Model", meta: { info: HOST_COLUMNS.model } },
  { accessorKey: "maintenanceMode", header: "Maintenance", meta: { info: HOST_COLUMNS.maintenanceMode }, cell: ({ getValue }) => getValue() === "True" ? <span className="text-warning">Ja</span> : "Nein" },
];

export function HostInventoryPanel({ hosts, globalFilter }: { hosts: NormalizedHost[]; globalFilter: string }) {
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const sortedHosts = useMemo(
    () => [...hosts].sort((left, right) => left.vcenterId.localeCompare(right.vcenterId, "de-DE") || (left.cluster ?? "").localeCompare(right.cluster ?? "", "de-DE") || left.host.localeCompare(right.host, "de-DE")),
    [hosts],
  );

  return (
    <section>
      <InfoTooltip entry={COMPLIANCE_SECTIONS.hostInventory} side="bottom">
        <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Host Inventar ({sortedHosts.length})</h3>
      </InfoTooltip>
      <VirtualTable data={sortedHosts} columns={hostColumns} globalFilter={globalFilter} height={350} onRowClick={openHostDetail} />
      {hostDetailDialog}
    </section>
  );
}
