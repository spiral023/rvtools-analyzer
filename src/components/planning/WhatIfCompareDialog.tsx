import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { WhatIfClusterResult } from "@/domain/services/planningHelpers";

const columns: ColumnDef<WhatIfClusterResult, unknown>[] = [
  { accessorKey: "clusterName", header: "Cluster" },
  { accessorKey: "before.cpuUsagePct", header: "CPU % (Vorher)", cell: ({ row }) => `${row.original.before.cpuUsagePct}%` },
  { accessorKey: "after.cpuUsagePct", header: "CPU % (Nachher)", cell: ({ row }) => `${row.original.after.cpuUsagePct}%` },
  { accessorKey: "before.memoryUsagePct", header: "RAM % (Vorher)", cell: ({ row }) => `${row.original.before.memoryUsagePct}%` },
  { accessorKey: "after.memoryUsagePct", header: "RAM % (Nachher)", cell: ({ row }) => `${row.original.after.memoryUsagePct}%` },
  { accessorKey: "before.vcpuPerCore", header: "vCPU/Core (Vorher)", cell: ({ row }) => row.original.before.vcpuPerCore.toFixed(2) },
  { accessorKey: "after.vcpuPerCore", header: "vCPU/Core (Nachher)", cell: ({ row }) => row.original.after.vcpuPerCore.toFixed(2) },
  { accessorKey: "before.riskScore", header: "Risk (Vorher)", cell: ({ row }) => row.original.before.riskScore },
  { accessorKey: "after.riskScore", header: "Risk (Nachher)", cell: ({ row }) => row.original.after.riskScore },
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
