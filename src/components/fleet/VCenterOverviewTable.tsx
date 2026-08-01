import type { ColumnDef } from "@tanstack/react-table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { FLEET_COLUMNS, FLEET_SECTIONS } from "@/lib/glossaries/fleetCompare";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { VCenterSummary } from "@/lib/vcenterWorkspace";

function HealthTooltipContent({ healthIssues, healthBreakdown }: Pick<VCenterSummary, "healthIssues" | "healthBreakdown">) {
  const label = healthIssues === 1 ? "Health- und Konfigurationswarnung" : "Health- und Konfigurationswarnungen";
  return (
    <div className="max-w-[20rem] whitespace-normal text-xs">
      <p>{formatNum(healthIssues)} von vCenter gemeldete {label}.</p>
      {healthBreakdown.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {healthBreakdown.map((entry) => (
            <li key={entry.type} className="flex items-baseline justify-between gap-3">
              <span>{entry.type}</span>
              <span className="shrink-0 font-mono-data text-muted-foreground">{formatNum(entry.count)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-muted-foreground">Details zu den einzelnen Meldungen finden Sie in der vCenter-Detailansicht.</p>
    </div>
  );
}

function VCenterRiskTooltipContent({ summary }: { summary: VCenterSummary }) {
  const factors = [
    { label: `Health-Warnungen (${summary.healthIssues} × 2)`, points: summary.healthIssues * 2 },
    { label: `Kritische Datastores (${summary.criticalDatastores} × 10)`, points: summary.criticalDatastores * 10 },
    { label: `Offene VM-Snapshots (${summary.snapshotCount} × 3)`, points: summary.snapshotCount * 3 },
    { label: `Security Drift (${summary.securityDrift} × 5)`, points: summary.securityDrift * 5 },
    ...(summary.cpuOvercommit > 5
      ? [{ label: `CPU Overcommit (${summary.cpuOvercommit.toFixed(1)}:1 > 5:1)`, points: 15 }]
      : summary.cpuOvercommit > 3
        ? [{ label: `CPU Overcommit (${summary.cpuOvercommit.toFixed(1)}:1 > 3:1)`, points: 5 }]
        : []),
  ].filter((factor) => factor.points > 0);
  const unboundedScore = factors.reduce((score, factor) => score + factor.points, 0);

  return (
    <div className="max-w-[22rem] whitespace-normal text-xs">
      <p className="font-semibold text-popover-foreground">Score {summary.riskScore} von maximal 100</p>
      {factors.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {factors.map((factor) => (
            <li key={factor.label} className="flex items-baseline justify-between gap-3">
              <span>{factor.label}</span>
              <span className="shrink-0 font-mono-data text-muted-foreground">+{factor.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">Keine Risikofaktoren ausgelöst.</p>
      )}
      {unboundedScore > 100 && <p className="mt-1 text-muted-foreground">Der Rohwert von {unboundedScore} wird auf 100 begrenzt.</p>}
      <p className="mt-1.5 border-t border-border/60 pt-1.5 text-muted-foreground">Ampel: rot &gt; 50 · gelb &gt; 25 · sonst grün.</p>
    </div>
  );
}

const columns: ColumnDef<VCenterSummary, unknown>[] = [
  { accessorKey: "displayName", header: "vCenter", meta: { info: FLEET_COLUMNS.displayName } },
  { accessorKey: "version", header: "Version", meta: { info: FLEET_COLUMNS.version }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string || "—"}</span> },
  { accessorKey: "vmCount", header: "VMs", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.vmCount } },
  { accessorKey: "poweredOn", header: "Powered On", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.poweredOn } },
  { accessorKey: "hostCount", header: "Hosts", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.hostCount } },
  { accessorKey: "clusterCount", header: "Cluster", cell: ({ getValue }) => formatNum(getValue() as number), meta: { info: FLEET_COLUMNS.clusterCount } },
  { accessorKey: "totalRamGiB", header: "RAM", cell: ({ getValue }) => `${(getValue() as number).toFixed(0)} GiB`, meta: { info: FLEET_COLUMNS.totalRamGiB } },
  { accessorKey: "avgDsFree", header: "Ø DS Frei", meta: { info: FLEET_COLUMNS.avgDsFree }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value < 15 ? "text-destructive" : value < 25 ? "text-warning" : "text-success"}>{formatPct(value)}</span>; } },
  { accessorKey: "cpuOvercommit", header: "CPU OC", meta: { info: FLEET_COLUMNS.cpuOvercommit }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value > 5 ? "text-destructive" : value > 3 ? "text-warning" : ""}>{value.toFixed(1)}:1</span>; } },
  { accessorKey: "snapshotCount", header: "Snapshots", meta: { info: FLEET_COLUMNS.snapshotCount } },
  { accessorKey: "securityDrift", header: "Sec. Drift", meta: { info: FLEET_COLUMNS.securityDrift } },
  { accessorKey: "healthIssues", header: "Health", meta: { info: FLEET_COLUMNS.healthIssues }, cell: ({ row }) => { const { healthIssues, healthBreakdown } = row.original; return <UiTooltip delayDuration={250}><UiTooltipTrigger asChild><span className={`${healthIssues > 0 ? "text-warning" : "text-success"} cursor-help underline decoration-dotted underline-offset-4`}>{formatNum(healthIssues)}</span></UiTooltipTrigger><UiTooltipContent side="top"><HealthTooltipContent healthIssues={healthIssues} healthBreakdown={healthBreakdown} /></UiTooltipContent></UiTooltip>; } },
  { accessorKey: "riskScore", header: "Risiko Score", meta: { info: FLEET_COLUMNS.riskScore }, cell: ({ row }) => { const { riskScore } = row.original; return <UiTooltip delayDuration={250}><UiTooltipTrigger asChild><span className={`${riskScore > 50 ? "text-destructive font-semibold" : riskScore > 25 ? "text-warning" : "text-success"} cursor-help underline decoration-dotted underline-offset-4`}>{riskScore}</span></UiTooltipTrigger><UiTooltipContent side="top"><VCenterRiskTooltipContent summary={row.original} /></UiTooltipContent></UiTooltip>; } },
];

export function VCenterOverviewTable({ summaries, onRowClick }: { summaries: VCenterSummary[]; onRowClick?: (row: VCenterSummary) => void }) {
  return (
    <div>
      <InfoTooltip entry={FLEET_SECTIONS.fleetTable} side="bottom">
        <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vCenter Übersicht</h3>
      </InfoTooltip>
      <VirtualTable tableId="overview/vcenter-summaries" columnPicker data={summaries} columns={columns} onRowClick={onRowClick} />
    </div>
  );
}
