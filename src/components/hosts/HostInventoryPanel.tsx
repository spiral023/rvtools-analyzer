import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import type { NormalizedHost, SheetRow } from "@/domain/models/types";
import { HOST_COLUMNS, COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { shortenVendor } from "@/lib/hardwareVariants";
import { buildHostServiceTagMap, findHostServiceTag } from "@/lib/hostServiceTag";
import { shortHostName } from "@/lib/utils";

/**
 * Der Service Tag liegt bewusst auf der Zeile statt in einer Accessor-Closure:
 * TanStack cacht Zellwerte pro Zeilenobjekt. Käme der Wert aus einer Closure über die
 * erst später geladenen Rohdaten, blieb der beim ersten Rendern gecachte Leerwert stehen.
 */
interface HostInventoryRow extends NormalizedHost {
  serviceTag: string;
}

const hostColumns: ColumnDef<HostInventoryRow, unknown>[] = [
  { accessorKey: "vcenterId", header: "vCenter" },
  { accessorKey: "host", header: "Host", meta: { info: HOST_COLUMNS.host }, cell: ({ getValue }) => shortHostName(getValue() as string) },
  { accessorKey: "cluster", header: "Cluster", meta: { info: HOST_COLUMNS.cluster } },
  { accessorKey: "version", header: "ESXi Version", meta: { info: HOST_COLUMNS.version } },
  { accessorKey: "build", header: "Build", meta: { info: HOST_COLUMNS.build } },
  { accessorKey: "cpuModel", header: "CPU Model", meta: { info: HOST_COLUMNS.cpuModel } },
  { accessorKey: "vendor", header: "Vendor", meta: { info: HOST_COLUMNS.vendor }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? shortenVendor(value) : "—"; } },
  { accessorKey: "model", header: "Model", meta: { info: HOST_COLUMNS.model } },
  {
    accessorKey: "serviceTag",
    header: "Service Tag",
    meta: { info: HOST_COLUMNS.serviceTag },
    cell: ({ getValue }) => {
      const value = getValue() as string;
      return value ? <span className="font-mono-data">{value}</span> : "—";
    },
  },
  { accessorKey: "maintenanceMode", header: "Maintenance", meta: { info: HOST_COLUMNS.maintenanceMode }, cell: ({ getValue }) => getValue() === "True" ? <span className="text-warning">Ja</span> : "Nein" },
];

export function HostInventoryPanel({
  hosts,
  globalFilter,
  rawVHostRows = [],
}: {
  hosts: NormalizedHost[];
  globalFilter: string;
  /** vHost-Rohzeilen; liefern den Service Tag, den die normalisierten Hosts nicht tragen. */
  rawVHostRows?: readonly SheetRow[];
}) {
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const serviceTagByHost = useMemo(() => buildHostServiceTagMap(rawVHostRows), [rawVHostRows]);
  const sortedHosts = useMemo<HostInventoryRow[]>(
    () => hosts
      .map((host) => ({ ...host, serviceTag: findHostServiceTag(serviceTagByHost, host) ?? "" }))
      .sort((left, right) => left.vcenterId.localeCompare(right.vcenterId, "de-DE") || (left.cluster ?? "").localeCompare(right.cluster ?? "", "de-DE") || left.host.localeCompare(right.host, "de-DE")),
    [hosts, serviceTagByHost],
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
