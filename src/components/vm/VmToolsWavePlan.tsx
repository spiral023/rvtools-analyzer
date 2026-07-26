import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { COMPLIANCE_SECTIONS, TOOLS_WAVE_COLUMNS } from "@/lib/glossaries/compliance";

interface ToolsWaveRow {
  cluster: string;
  upgradeableCount: number;
  totalVms: number;
  pct: number;
}

const toolsWaveColumns: ColumnDef<ToolsWaveRow, unknown>[] = [
  { accessorKey: "cluster", header: "Cluster", meta: { info: TOOLS_WAVE_COLUMNS.cluster } },
  { accessorKey: "upgradeableCount", header: "Upgradeable", meta: { info: TOOLS_WAVE_COLUMNS.upgradeableCount } },
  { accessorKey: "totalVms", header: "VMs gesamt", meta: { info: TOOLS_WAVE_COLUMNS.totalVms } },
  { accessorKey: "pct", header: "% Upgradeable", meta: { info: TOOLS_WAVE_COLUMNS.pct }, cell: ({ getValue }) => `${(getValue() as number).toFixed(0)}%` },
];

export function VmToolsWavePlan() {
  const { filters } = useActiveSnapshotIds();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: rawVTools = [], isLoading } = useRawSheet("vTools");
  const filteredRawVTools = useMemo(() => filterVmRows(rawVTools), [filterVmRows, rawVTools]);

  const toolsWavePlan = useMemo<ToolsWaveRow[]>(() => {
    const clusterMap = new Map<string, { upgradeable: number; total: number }>();
    for (const row of filteredRawVTools) {
      const cluster = String(row.data["Cluster"] || "Unknown");
      const entry = clusterMap.get(cluster) ?? { upgradeable: 0, total: 0 };
      entry.total++;
      const upgradeable = String(row.data["Upgradeable"] || "").toLowerCase();
      if (upgradeable === "yes" || upgradeable === "true") entry.upgradeable++;
      clusterMap.set(cluster, entry);
    }

    return [...clusterMap.entries()]
      .filter(([, entry]) => entry.upgradeable > 0)
      .map(([cluster, entry]) => ({
        cluster,
        upgradeableCount: entry.upgradeable,
        totalVms: entry.total,
        pct: entry.total > 0 ? (entry.upgradeable / entry.total) * 100 : 0,
      }))
      .sort((a, b) => b.upgradeableCount - a.upgradeableCount);
  }, [filteredRawVTools]);

  if (isLoading || toolsWavePlan.length === 0) return null;

  return (
    <div>
      <InfoTooltip entry={COMPLIANCE_SECTIONS.toolsWavePlan} side="bottom">
        <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VMTools Upgrade Wellenplanung</h3>
      </InfoTooltip>
      <VirtualTable data={toolsWavePlan} columns={toolsWaveColumns} globalFilter={filters.search} height={250} />
    </div>
  );
}
