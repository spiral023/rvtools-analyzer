import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { LICENSING_COLUMNS, LICENSING_SECTIONS } from "@/lib/glossaries/licensing";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { LicenseRow } from "@/lib/licenseDetails";

const licenseColumns: ColumnDef<LicenseRow, unknown>[] = [
  { accessorKey: "name", header: "Lizenz", meta: { info: LICENSING_COLUMNS.name } },
  { accessorKey: "key", header: "Key", meta: { info: LICENSING_COLUMNS.key } },
  { accessorKey: "costUnit", header: "Einheit", meta: { info: LICENSING_COLUMNS.costUnit } },
  { accessorKey: "total", header: "Total", meta: { info: LICENSING_COLUMNS.total }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "used", header: "Verwendet", meta: { info: LICENSING_COLUMNS.used }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "usedPct", header: "Auslastung", meta: { info: LICENSING_COLUMNS.usedPct }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 95 ? "text-destructive font-semibold" : value > 85 ? "text-warning" : "text-success"}>{formatPct(value)}</span>; } },
  { accessorKey: "expiration", header: "Ablauf", meta: { info: LICENSING_COLUMNS.expiration } },
  { accessorKey: "features", header: "Features", meta: { info: LICENSING_COLUMNS.features }, cell: ({ getValue }) => { const value = getValue() as string; return <span className="text-xs text-muted-foreground">{value.length > 80 ? `${value.slice(0, 77)}…` : value}</span>; } },
];

export function LicenseDetailsTable({ licenses, globalFilter }: { licenses: LicenseRow[]; globalFilter?: string }) {
  if (licenses.length === 0) return null;

  return (
    <div>
      <InfoTooltip entry={LICENSING_SECTIONS.licenseTable} side="bottom">
        <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Lizenz Details</h3>
      </InfoTooltip>
      <VirtualTable tableId="licensing/details" columnPicker data={licenses} columns={licenseColumns} globalFilter={globalFilter} />
    </div>
  );
}
