import type { ClusterCapacityRow } from "@/lib/clusterCapacityWorkspace";

export function calculateCapacityRiskKpis(capacityRows: ClusterCapacityRow[]) {
  const totalCores = capacityRows.reduce((sum, row) => sum + row.totalCores, 0);
  const totalVcpus = capacityRows.reduce((sum, row) => sum + row.vcpuPerCore * row.totalCores, 0);

  return {
    criticalCapacity: capacityRows.filter((row) => row.risk === "hoch").length,
    mediumCapacity: capacityRows.filter((row) => row.risk === "mittel").length,
    hotHosts: capacityRows.reduce((sum, row) => sum + row.hotHosts, 0),
    maxSwapBalloon: capacityRows.length > 0 ? Math.max(...capacityRows.map((row) => row.swapBalloonPct)) : null,
    avgVcpuPerCore: totalCores > 0 ? totalVcpus / totalCores : null,
  };
}
