import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { VirtualTable } from "@/components/tables/VirtualTable";
import type { CapacityStatus } from "@/domain/models/types";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";

const STATUS_LABEL: Record<CapacityStatus, string> = { green: "erfüllt", yellow: "knapp", red: "verletzt", unknown: "offen" };

export function FillUpClusterTable({ rows, onSelect }: { rows: readonly FillUpPlanningClusterResult[]; onSelect: (row: FillUpPlanningClusterResult) => void }) {
  const columns = useMemo<ColumnDef<FillUpPlanningClusterResult>[]>(() => [
    { id: "cluster", header: "Cluster", accessorFn: (row) => `${row.cluster.name} ${row.cluster.vcenterId}`, cell: ({ row }) => <div><p className="font-medium">{row.original.cluster.name}</p><p className="text-xs text-muted-foreground">{row.original.cluster.vcenterId}</p></div> },
    { id: "scope", header: "Hosts / Sites", accessorFn: (row) => row.hostCount, cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.hostCount} / {row.original.siteCount}</span> },
    { id: "policy", header: "Policy", accessorFn: (row) => row.policy.name, cell: ({ row }) => <span className="text-xs">{row.original.policy.name}<br />v{row.original.policy.version}</span> },
    { id: "mix", header: "Mix +VM", accessorFn: (row) => row.recommendation.workloadMixRecommendation?.maxAdditionalVms ?? -1, cell: ({ row }) => <span className="font-mono font-semibold tabular-nums">{formatValue(row.original.recommendation.workloadMixRecommendation?.maxAdditionalVms)}</span> },
    { id: "headroom", header: "Unabhängig", accessorFn: (row) => row.recommendation.independentHeadroom.vcpu.value ?? -1, cell: ({ row }) => <div className="font-mono text-xs tabular-nums"><p>+{formatValue(row.original.recommendation.independentHeadroom.vcpu.value)} vCPU</p><p>+{formatValue(row.original.recommendation.independentHeadroom.memory.value)} MiB</p></div> },
    { id: "n1", header: "N-1", accessorFn: (row) => row.capacity.n1?.status ?? "unknown", cell: ({ row }) => <StatusBadge status={row.original.capacity.n1?.status ?? "unknown"} /> },
    { id: "n2", header: "N-2", accessorFn: (row) => row.capacity.n2?.status ?? "unknown", cell: ({ row }) => row.original.capacity.n2 ? <StatusBadge status={row.original.capacity.n2.status} informational={!row.original.capacity.n2.definition.hardLimit} /> : <span className="text-xs text-muted-foreground">deaktiviert</span> },
    { id: "site", header: "HIGH Site", accessorFn: (row) => row.capacity.siteFailover.map((entry) => entry.status).join(), cell: ({ row }) => <StatusBadge status={worstStatus(row.original.capacity.siteFailover.map((entry) => entry.status))} /> },
    { id: "limiter", header: "Limiter", accessorFn: (row) => row.recommendation.workloadMixRecommendation?.limitingGuardrail?.label ?? "", cell: ({ row }) => <span className="text-xs">{row.original.recommendation.workloadMixRecommendation?.limitingGuardrail?.label ?? "—"}<br /><span className="text-muted-foreground">{row.original.recommendation.workloadMixRecommendation?.limitingGuardrail?.scenarioId ?? ""}</span></span> },
  ], []);
  return <VirtualTable data={[...rows]} columns={columns} height={440} onRowClick={onSelect} getRowId={(row) => row.cluster.clusterKey} exportFileName="fill-up-cluster" emptyTitle="Keine berechenbaren Cluster" emptyDescription="Der gewählte Import benötigt eindeutige Clusterbeziehungen und einen passenden RVTools-Snapshot." />;
}

function StatusBadge({ status, informational = false }: { status: CapacityStatus; informational?: boolean }) {
  return <Badge variant={status === "red" ? "destructive" : status === "green" ? "default" : "secondary"}>{STATUS_LABEL[status]}{informational ? " · Info" : ""}</Badge>;
}

function worstStatus(statuses: readonly CapacityStatus[]): CapacityStatus {
  return statuses.includes("red") ? "red" : statuses.includes("unknown") ? "unknown" : statuses.includes("yellow") ? "yellow" : "green";
}

function formatValue(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}
