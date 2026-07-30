import { useMemo } from "react";
import { Activity, AlertTriangle, CircleOff, Server } from "lucide-react";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NormalizedHost, SheetRow, SnapshotMeta } from "@/domain/models/types";
import {
  buildHostLoadMapData,
  type HostLoadMapFilters,
  type HostLoadPoint,
  type HostLoadSeverity,
  type HostOperationalState,
} from "@/lib/hostLoadMap";
import { CHART_COLORS } from "@/lib/chartStyles";
import { COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { cn, shortHostName } from "@/lib/utils";

interface HostLoadMapProps {
  hosts: readonly NormalizedHost[];
  rawVHostRows: readonly SheetRow[];
  snapshots: readonly SnapshotMeta[];
  filters: HostLoadMapFilters;
  isLoading: boolean;
  onHostClick: (host: HostLoadPoint) => void;
}

const SEVERITY_LABEL: Record<HostLoadSeverity, string> = {
  normal: "Normal",
  warning: "Warnung",
  critical: "Kritisch",
};

const SEVERITY_RANK: Record<HostLoadSeverity, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

const OPERATIONAL_LABEL: Record<HostOperationalState, string> = {
  connected: "Verbunden",
  maintenance: "Wartungsmodus",
  disconnected: "Getrennt",
  poweredOff: "Ausgeschaltet",
  unknown: "Status unbekannt",
};

function operationalDotClass(state: HostOperationalState): string {
  if (state === "maintenance") return "bg-warning";
  if (state === "disconnected" || state === "poweredOff") return "bg-destructive";
  if (state === "connected") return "bg-success";
  return "bg-muted-foreground";
}

function severityBorderClass(severity: HostLoadSeverity): string {
  if (severity === "critical") return "border-l-destructive";
  if (severity === "warning") return "border-l-warning";
  return "border-l-primary/45";
}

function metricColor(value: number, warning: number, critical: number): string {
  if (value >= critical) return CHART_COLORS.danger;
  if (value >= warning) return CHART_COLORS.warning;
  return CHART_COLORS.primary;
}

function LoadBar({
  label,
  value,
  warning,
  critical,
}: {
  label: string;
  value: number;
  warning: number;
  critical: number;
}) {
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_2.7rem] items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: metricColor(value, warning, critical) }}
        />
      </span>
      <span className="text-right font-mono-data text-[10px] tabular-nums text-foreground">{formatPct(value)}</span>
    </div>
  );
}

function HostLoadTile({ point, onOpen }: { point: HostLoadPoint; onOpen: (host: HostLoadPoint) => void }) {
  return (
    <button
      type="button"
      data-testid="host-load-tile"
      data-severity={point.severity}
      onClick={() => onOpen(point)}
      title={`${point.host}\n${point.vcenterDisplayName} · ${point.cluster || "Kein Cluster"}\nCPU ${formatPct(point.cpuUsagePct)} · RAM ${formatPct(point.memoryUsagePct)} · ${formatNum(point.vmCount)} VMs`}
      aria-label={`${point.host}: CPU ${formatPct(point.cpuUsagePct)}, RAM ${formatPct(point.memoryUsagePct)}, ${formatNum(point.vmCount)} VMs, ${OPERATIONAL_LABEL[point.operationalState]}`}
      className={cn(
        "group min-w-0 rounded-md border border-l-[3px] border-border/70 bg-card px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [contain-intrinsic-size:0_78px] [content-visibility:auto]",
        severityBorderClass(point.severity),
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", operationalDotClass(point.operationalState))} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono-data text-[11px] font-semibold text-foreground" title={point.host}>
          {shortHostName(point.host)}
        </span>
        <span className="shrink-0 font-mono-data text-[9px] text-muted-foreground">{formatNum(point.vmCount)} VM</span>
      </span>
      <span className="mt-0.5 block truncate text-[9px] text-muted-foreground" title={`${point.vcenterDisplayName} · ${point.cluster || "Kein Cluster"}`}>
        {point.cluster || "Kein Cluster"}
      </span>
      <span className="mt-2 block space-y-1.5">
        <LoadBar label="CPU" value={point.cpuUsagePct} warning={75} critical={85} />
        <LoadBar label="RAM" value={point.memoryUsagePct} warning={80} critical={90} />
      </span>
    </button>
  );
}

function SummaryFact({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "critical";
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 font-mono-data text-base font-semibold tabular-nums",
        tone === "warning" && value > 0 && "text-warning",
        tone === "critical" && value > 0 && "text-destructive",
      )}>
        {formatNum(value)}
      </p>
    </div>
  );
}

export function HostLoadMap({
  hosts,
  rawVHostRows,
  snapshots,
  filters,
  isLoading,
  onHostClick,
}: HostLoadMapProps) {
  const { clusters, hosts: hostFilters, search } = filters;
  const data = useMemo(
    () => buildHostLoadMapData(hosts, rawVHostRows, snapshots, { clusters, hosts: hostFilters, search }),
    [clusters, hostFilters, hosts, rawVHostRows, search, snapshots],
  );

  const orderedPoints = useMemo(
    () => [...data.points].sort((left, right) =>
      SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]
      || Math.max(right.cpuUsagePct, right.memoryUsagePct) - Math.max(left.cpuUsagePct, left.memoryUsagePct)
      || left.host.localeCompare(right.host, "de-DE", { numeric: true }),
    ),
    [data.points],
  );

  const summary = useMemo(() => {
    let notable = 0;
    let maintenance = 0;
    let unavailable = 0;
    for (const point of data.points) {
      if (point.severity !== "normal") notable += 1;
      if (point.operationalState === "maintenance") maintenance += 1;
      if (point.operationalState === "disconnected" || point.operationalState === "poweredOff") unavailable += 1;
    }
    for (const host of data.missingHosts) {
      if (host.operationalState === "maintenance") maintenance += 1;
      if (host.operationalState === "disconnected" || host.operationalState === "poweredOff") unavailable += 1;
    }
    return { notable, maintenance, unavailable };
  }, [data.missingHosts, data.points]);

  if (isLoading) return <PanelLoadingState />;

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/10 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <InfoTooltip entry={COMPLIANCE_SECTIONS.hostLoadMap} side="bottom">
              <CardTitle className="flex w-fit cursor-help items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                Host Load Map
              </CardTitle>
            </InfoTooltip>
            <CardDescription className="mt-1">
              Kompakte Rasteransicht · Auffällige Hosts zuerst · Klicken für Details
            </CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryFact label="Im Scope" value={data.visibleHostCount} />
            <SummaryFact label="Auffällig" value={summary.notable} tone="warning" />
            <SummaryFact label="Wartung" value={summary.maintenance} tone="warning" />
            <SummaryFact label="Nicht verfügbar" value={summary.unavailable} tone="critical" />
          </div>
        </div>
      </CardHeader>

      {orderedPoints.length > 0 ? (
        <>
          <CardContent className="p-0">
            <div className="max-h-[34rem] overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
                {orderedPoints.map((point) => <HostLoadTile key={point.hostKey} point={point} onOpen={onHostClick} />)}
              </div>
            </div>
          </CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-4 py-2.5 text-[10px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              {(["normal", "warning", "critical"] as const).map((severity) => (
                <span key={severity} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-sm border-l-2", severityBorderClass(severity))} />
                  {SEVERITY_LABEL[severity]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-warning" />
                Wartungsmodus
              </span>
            </div>
            <span className="font-mono-data">CPU 75/85 % · RAM 80/90 %</span>
          </div>
        </>
      ) : (
        <CardContent className="grid min-h-72 place-items-center px-6 py-12 text-center">
          <div>
            <Server className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">Keine Host-Auslastung im aktuellen Scope</p>
            <p className="mt-1 text-xs text-muted-foreground">Filter prüfen oder RVTools-Daten mit CPU- und RAM-Auslastung importieren.</p>
          </div>
        </CardContent>
      )}

      {data.missingHosts.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Keine Messwerte ({data.missingHosts.length})
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {data.missingHosts.slice(0, 8).map((host) => (
              <span key={host.hostKey} className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 font-mono-data text-[10px] text-muted-foreground" title={`${host.vcenterDisplayName} · ${host.cluster || "Kein Cluster"} · fehlt: ${host.missingMetrics.join(", ")}`}>
                <CircleOff className="h-3 w-3" aria-hidden="true" />
                {shortHostName(host.host)}
              </span>
            ))}
            {data.missingHosts.length > 8 ? <span className="px-1 py-1 text-[10px] text-muted-foreground">+{data.missingHosts.length - 8} weitere</span> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
