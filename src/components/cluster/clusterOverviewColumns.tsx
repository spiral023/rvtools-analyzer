import type { ColumnDef } from "@tanstack/react-table";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import type { ClusterOverviewRow } from "@/lib/clusterWorkspace";
import { vcpuPerCoreSeverityClass } from "@/lib/clusterOverview";
import { CLUSTER_OVERVIEW_COLUMNS } from "@/lib/glossaries/clusters";
import { coloredNum, coloredPct, hostFailureTooltipText, maxHostFailuresClassName, RiskTooltipContent, riskSeverity, severityBadge, vropsMissingBadge } from "@/lib/metricColor";
import { shortHostName } from "@/lib/utils";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { normalizedOptionalColumnMeta } from "@/lib/normalizedColumnMeta";

export const clusterOverviewColumns: ColumnDef<ClusterOverviewRow, unknown>[] = [
  { accessorKey: "vcenterDisplayName", header: "vCenter", meta: { info: CLUSTER_OVERVIEW_COLUMNS.vcenterDisplayName } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: CLUSTER_OVERVIEW_COLUMNS.cluster } },
  { accessorKey: "datacenter", header: "Datacenter", meta: normalizedOptionalColumnMeta("Datacenter", "Datacenter-Zuordnung des Clusters.", "RVTools · vCluster/vHost/vInfo · „Datacenter“") },
  { accessorKey: "hosts", header: "Hosts", meta: { info: CLUSTER_OVERVIEW_COLUMNS.hosts }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "vms", header: "VMs", meta: { info: CLUSTER_OVERVIEW_COLUMNS.vms }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "avgVmsPerHost", header: "Ø VMs/Host", meta: { info: CLUSTER_OVERVIEW_COLUMNS.avgVmsPerHost }, cell: ({ getValue }) => {
    const value = getValue() as number | null;
    return value === null ? "—" : value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } },
  {
    accessorKey: "maxVmsPerHost",
    header: "Max. VMs/Host",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.maxVmsPerHost },
    cell: ({ row, getValue }) => {
      const host = row.original.maxVmsHost;
      const count = formatNum(getValue() as number | null);
      return host ? `${count} (${shortHostName(host)})` : count;
    },
  },
  {
    accessorKey: "maxHostFailures",
    header: "Ausfallskapazität",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.maxHostFailures },
    cell: ({ row }) => {
      const { maxHostFailures, hosts, hostFailureBreaches } = row.original;
      return (
        <UiTooltip delayDuration={250}>
          <UiTooltipTrigger asChild>
            <span className={`${maxHostFailuresClassName(maxHostFailures)} cursor-help underline decoration-dotted underline-offset-4`}>{maxHostFailures} von {hosts}</span>
          </UiTooltipTrigger>
          <UiTooltipContent side="top" className="max-w-[20rem] whitespace-normal text-xs">
            {hostFailureTooltipText(hosts, maxHostFailures, hostFailureBreaches)}
          </UiTooltipContent>
        </UiTooltip>
      );
    },
  },
  {
    accessorKey: "vcpuPerCore",
    header: "vCPU/Core",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.vcpuPerCore },
    cell: ({ getValue }) => {
      const value = getValue() as number;
      return <span className={vcpuPerCoreSeverityClass(value)}>{value.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</span>;
    },
  },
  { accessorKey: "ramCommitPct", header: "RAM Commit", meta: { info: CLUSTER_OVERVIEW_COLUMNS.ramCommitPct }, cell: ({ getValue }) => coloredPct(getValue() as number, 50, 70) },
  {
    accessorKey: "risk",
    header: "Risiko",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.risk },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <UiTooltip delayDuration={250}>
          <UiTooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted underline-offset-4">
              {severityBadge(`${row.original.risk} (${row.original.riskScore})`, riskSeverity(row.original.risk))}
            </span>
          </UiTooltipTrigger>
          <UiTooltipContent side="top">
            <RiskTooltipContent riskScore={row.original.riskScore} risk={row.original.risk} riskFactors={row.original.riskFactors} siteFailoverOverride={row.original.siteFailoverOverride} />
          </UiTooltipContent>
        </UiTooltip>
        {vropsMissingBadge(row.original.vropsMissing)}
      </span>
    ),
  },
  { accessorKey: "riskScore", header: "Score", meta: { info: CLUSTER_OVERVIEW_COLUMNS.riskScore }, cell: ({ getValue }) => coloredNum(getValue() as number, 30, 60, 0) },
  {
    id: "haDrs",
    header: "HA / DRS",
    meta: { info: CLUSTER_OVERVIEW_COLUMNS.haDrs },
    accessorFn: (row) => `${row.haEnabled === true ? "Aktiv" : "Aus/—"} / ${row.drsEnabled === true ? "Aktiv" : "Aus/—"}`,
  },
  { accessorKey: "haEnabled", header: "HA", meta: normalizedOptionalColumnMeta("HA", "Zeigt, ob vSphere HA für den Cluster aktiviert ist.", "RVTools · vCluster · „HA enabled“"), cell: ({ getValue }) => getValue() === true ? "Aktiv" : getValue() === false ? "Aus" : "—" },
  { accessorKey: "drsEnabled", header: "DRS", meta: normalizedOptionalColumnMeta("DRS", "Zeigt, ob Distributed Resource Scheduler für den Cluster aktiviert ist.", "RVTools · vCluster · „DRS enabled“"), cell: ({ getValue }) => getValue() === true ? "Aktiv" : getValue() === false ? "Aus" : "—" },
];
