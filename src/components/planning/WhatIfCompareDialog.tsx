import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { WhatIfClusterResult } from "@/domain/services/planningHelpers";
import type { ClusterMetrics } from "@/domain/services/clusterCapacityEngine";
import { coloredNum, coloredPct, hostFailureTooltipText, maxHostFailuresClassName, riskSeverity, severityBadge, siteFailoverBadge, vropsMissingBadge } from "@/lib/metricColor";

function MaxHostFailuresCell({ metrics }: { metrics: ClusterMetrics }) {
  const className = maxHostFailuresClassName(metrics.maxHostFailures);
  return (
    <UiTooltip delayDuration={250}>
      <UiTooltipTrigger asChild>
        <span className={`${className} cursor-help underline decoration-dotted underline-offset-4`}>{metrics.maxHostFailures} von {metrics.hosts}</span>
      </UiTooltipTrigger>
      <UiTooltipContent side="top" className="max-w-[20rem] whitespace-normal text-xs">
        {hostFailureTooltipText(metrics.hosts, metrics.maxHostFailures, metrics.hostFailureBreaches)}
      </UiTooltipContent>
    </UiTooltip>
  );
}

const columns: ColumnDef<WhatIfClusterResult, unknown>[] = [
  { accessorKey: "clusterName", header: "Cluster" },
  { accessorKey: "before.cpuUsagePct", header: "CPU % (Vorher)", cell: ({ row }) => coloredPct(row.original.before.cpuUsagePct, 40, 50) },
  { accessorKey: "after.cpuUsagePct", header: "CPU % (Nachher)", cell: ({ row }) => coloredPct(row.original.after.cpuUsagePct, 40, 50) },
  { accessorKey: "before.memoryUsagePct", header: "RAM % (Vorher)", cell: ({ row }) => coloredPct(row.original.before.memoryUsagePct, 50, 70) },
  { accessorKey: "after.memoryUsagePct", header: "RAM % (Nachher)", cell: ({ row }) => coloredPct(row.original.after.memoryUsagePct, 50, 70) },
  { accessorKey: "before.vcpuPerCore", header: "vCPU/Core (Vorher)", cell: ({ row }) => coloredNum(row.original.before.vcpuPerCore, 4, 5) },
  { accessorKey: "after.vcpuPerCore", header: "vCPU/Core (Nachher)", cell: ({ row }) => coloredNum(row.original.after.vcpuPerCore, 4, 5) },
  { accessorKey: "before.ramCommitPct", header: "RAM Commit % (Vorher)", cell: ({ row }) => coloredPct(row.original.before.ramCommitPct, 50, 70) },
  { accessorKey: "after.ramCommitPct", header: "RAM Commit % (Nachher)", cell: ({ row }) => coloredPct(row.original.after.ramCommitPct, 50, 70) },
  { accessorKey: "before.maxHostFailures", header: "Ausfallskapazität (Vorher)", cell: ({ row }) => <MaxHostFailuresCell metrics={row.original.before} /> },
  { accessorKey: "after.maxHostFailures", header: "Ausfallskapazität (Nachher)", cell: ({ row }) => <MaxHostFailuresCell metrics={row.original.after} /> },
  { accessorKey: "before.riskScore", header: "Risk (Vorher)", cell: ({ row }) => (
    <span className="inline-flex items-center gap-1.5">
      {severityBadge(String(row.original.before.riskScore), riskSeverity(row.original.before.risk))}
      {vropsMissingBadge(row.original.vropsMissing)}
    </span>
  ) },
  { accessorKey: "after.riskScore", header: "Risk (Nachher)", cell: ({ row }) => severityBadge(String(row.original.after.riskScore), riskSeverity(row.original.after.risk)) },
  { accessorKey: "vropsRamAssignedHighPctBefore", header: "HIGH-RP RAM % (Vorher)", cell: ({ row }) => coloredPct(row.original.vropsRamAssignedHighPctBefore, 45, 50, 0) },
  { accessorKey: "vropsRamAssignedHighPctAfter", header: "HIGH-RP RAM % (Nachher)", cell: ({ row }) => coloredPct(row.original.vropsRamAssignedHighPctAfter, 45, 50, 0) },
  { accessorKey: "siteFailoverRiskBefore", header: "Site-Failover (Vorher)", cell: ({ row }) => siteFailoverBadge(row.original.siteFailoverRiskBefore) },
  { accessorKey: "siteFailoverRiskAfter", header: "Site-Failover (Nachher)", cell: ({ row }) => siteFailoverBadge(row.original.siteFailoverRiskAfter) },
  { accessorKey: "incomingVmCount", header: "Eingehend" },
  { accessorKey: "outgoingVmCount", header: "Ausgehend" },
];

export function WhatIfCompareDialog({
  open,
  onClose,
  results,
}: {
  open: boolean;
  onClose: () => void;
  results: WhatIfClusterResult[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>What-If Vergleich — Vorher/Nachher</DialogTitle>
        </DialogHeader>
        <VirtualTable data={results} columns={columns} height={400} />
      </DialogContent>
    </Dialog>
  );
}
