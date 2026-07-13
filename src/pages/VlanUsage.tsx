import { useMemo } from "react";
import { Network, Layers, Server, HelpCircle } from "lucide-react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { buildVlanUsage, type VlanUsageRow } from "@/lib/vlanUsage";
import { NET_VLANUSAGE_KPI, NET_VLANUSAGE_COLUMNS, NET_VLANUSAGE_SECTIONS } from "@/lib/glossaries/networking";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<VlanUsageRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_VLANUSAGE_COLUMNS.cluster } },
  {
    accessorKey: "vlan",
    header: "VLAN",
    meta: { info: NET_VLANUSAGE_COLUMNS.vlan },
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return <span className={v === "?" ? "text-warning font-semibold" : "font-mono-data"}>{v}</span>;
    },
  },
  {
    accessorKey: "portgroups",
    header: "Portgruppe(n)",
    meta: { info: NET_VLANUSAGE_COLUMNS.portgroups },
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return <div className="max-w-[320px] truncate" title={v}>{v || "—"}</div>;
    },
  },
  { accessorKey: "vmCount", header: "# VMs", meta: { info: NET_VLANUSAGE_COLUMNS.vmCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "hostCount", header: "# Hosts", meta: { info: NET_VLANUSAGE_COLUMNS.hostCount }, cell: ({ getValue }) => formatNum(getValue() as number) },
];

export function VlanUsagePanel() {
  const { filters } = useActiveSnapshotIds();
  const { data: rawVNetwork = [] } = useRawSheet("vNetwork");
  const { data: rawVPort = [] } = useRawSheet("vPort");
  const { data: rawDvPort = [] } = useRawSheet("dvPort");
  const { data: rawVInfo = [] } = useRawSheet("vInfo");

  const rows = useMemo(
    () => buildVlanUsage(rawVNetwork, rawVPort, rawDvPort, rawVInfo),
    [rawVNetwork, rawVPort, rawDvPort, rawVInfo],
  );

  const activeVlans = useMemo(() => new Set(rows.filter((r) => r.vlan !== "?").map((r) => r.vlan)).size, [rows]);
  const clusterCount = useMemo(() => new Set(rows.map((r) => r.cluster)).size, [rows]);
  const unmatchedVms = useMemo(
    () => rows.filter((r) => r.vlan === "?").reduce((sum, r) => sum + r.vmCount, 0),
    [rows],
  );
  const connectedVms = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawVNetwork) {
      if (r.data["Connected"] === true || String(r.data["Connected"] ?? "").toLowerCase() === "true") {
        const vm = String(r.data["VM"] ?? "").trim();
        if (vm) set.add(vm);
      }
    }
    return set.size;
  }, [rawVNetwork]);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Aktive VLANs" value={formatNum(activeVlans)} icon={<Layers className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.activeVlans} />
        <KpiCard title="Cluster" value={formatNum(clusterCount)} icon={<Network className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.clusters} />
        <KpiCard title="Verbundene VMs" value={formatNum(connectedVms)} icon={<Server className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.connectedVms} />
        <KpiCard title="Ohne Portgruppen-Match" value={formatNum(unmatchedVms)} severity={unmatchedVms > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={NET_VLANUSAGE_KPI.unmatched} />
      </KpiGrid>

      <div>
        <InfoTooltip entry={NET_VLANUSAGE_SECTIONS.table} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VLAN-Nutzung pro Cluster ({rows.length})</h3>
        </InfoTooltip>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} />
      </div>
    </div>
  );
}
