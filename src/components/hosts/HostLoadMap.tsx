import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Activity, AlertTriangle, CircleOff, Server } from "lucide-react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "@/components/charts/recharts";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { NormalizedHost, SheetRow, SnapshotMeta } from "@/domain/models/types";
import {
  buildHostLoadMapData,
  type HostLoadMapFilters,
  type HostLoadPoint,
  type HostLoadSeverity,
  type HostOperationalState,
} from "@/lib/hostLoadMap";
import { CHART_AXIS_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS, CHART_GRID_STYLE } from "@/lib/chartStyles";
import { COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { shortHostName } from "@/lib/utils";

interface HostLoadMapProps {
  hosts: readonly NormalizedHost[];
  rawVHostRows: readonly SheetRow[];
  snapshots: readonly SnapshotMeta[];
  filters: HostLoadMapFilters;
  isLoading: boolean;
  onHostClick: (host: HostLoadPoint) => void;
}

interface HostBubbleShape {
  cx?: number;
  cy?: number;
  size?: number;
  payload?: HostLoadPoint;
}

const SEVERITY_FILL: Record<HostLoadSeverity, string> = {
  normal: CHART_COLORS.primary,
  warning: CHART_COLORS.warning,
  critical: CHART_COLORS.danger,
};

const SEVERITY_LABEL: Record<HostLoadSeverity, string> = {
  normal: "Normal",
  warning: "Warnung",
  critical: "Kritisch",
};

const OPERATIONAL_LABEL: Record<HostOperationalState, string> = {
  connected: "Verbunden",
  maintenance: "Wartungsmodus",
  disconnected: "Getrennt",
  poweredOff: "Ausgeschaltet",
  unknown: "Status unbekannt",
};

function statusStroke(state: HostOperationalState): string {
  if (state === "maintenance") return CHART_COLORS.warning;
  if (state === "disconnected" || state === "poweredOff") return CHART_COLORS.danger;
  return "hsl(var(--card-foreground))";
}

function HostBubble({
  shapeProps,
  onOpen,
}: {
  shapeProps: unknown;
  onOpen: (host: HostLoadPoint) => void;
}) {
  const { cx, cy, size, payload } = shapeProps as HostBubbleShape;
  const [focused, setFocused] = useState(false);
  if (cx === undefined || cy === undefined || !payload) return <g />;

  const radius = Math.max(6, Math.sqrt((size ?? 120) / Math.PI));
  const isUnavailable = payload.operationalState === "disconnected" || payload.operationalState === "poweredOff";
  const showLabel = payload.severity !== "normal" || focused;
  const placeLabelLeft = payload.cpuUsagePct > 78;
  const open = () => onOpen(payload);
  const handleClick = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    open();
  };
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${payload.host}: CPU ${formatPct(payload.cpuUsagePct)}, RAM ${formatPct(payload.memoryUsagePct)}, ${formatNum(payload.vmCount)} VMs, ${OPERATIONAL_LABEL[payload.operationalState]}`}
      className="cursor-pointer outline-none"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius + (focused ? 6 : 4)}
        fill="none"
        stroke={focused ? "hsl(var(--ring))" : statusStroke(payload.operationalState)}
        strokeWidth={focused ? 2.5 : 1.5}
        strokeDasharray={payload.operationalState === "maintenance" ? "4 3" : undefined}
        opacity={focused ? 1 : payload.operationalState === "connected" ? 0.42 : 0.9}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={SEVERITY_FILL[payload.severity]}
        fillOpacity={isUnavailable ? 0.28 : 0.84}
        stroke={SEVERITY_FILL[payload.severity]}
        strokeWidth={1}
      />
      {isUnavailable ? (
        <>
          <line x1={cx - radius * 0.55} y1={cy - radius * 0.55} x2={cx + radius * 0.55} y2={cy + radius * 0.55} stroke={CHART_COLORS.danger} strokeWidth={1.8} />
          <line x1={cx + radius * 0.55} y1={cy - radius * 0.55} x2={cx - radius * 0.55} y2={cy + radius * 0.55} stroke={CHART_COLORS.danger} strokeWidth={1.8} />
        </>
      ) : null}
      {showLabel ? (
        <text
          x={placeLabelLeft ? cx - radius - 7 : cx + radius + 7}
          y={cy + 4}
          textAnchor={placeLabelLeft ? "end" : "start"}
          fill="hsl(var(--foreground))"
          fontSize={10}
          fontWeight={payload.severity === "critical" ? 700 : 600}
          paintOrder="stroke"
          stroke="hsl(var(--card))"
          strokeWidth={3}
          strokeLinejoin="round"
        >
          {shortHostName(payload.host)}
        </text>
      ) : null}
    </g>
  );
}

function HostLoadTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: HostLoadPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="min-w-64 rounded-lg border border-border bg-popover/95 p-3 text-xs shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-data font-bold text-popover-foreground">{point.host}</p>
          <p className="mt-0.5 text-muted-foreground">{point.vcenterDisplayName} · {point.cluster || "Kein Cluster"}</p>
        </div>
        <span className="rounded-sm border border-current/20 px-1.5 py-0.5 font-mono-data text-[9px] font-bold uppercase tracking-wider" style={{ color: SEVERITY_FILL[point.severity] }}>
          {SEVERITY_LABEL[point.severity]}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border/70 pt-3">
        <span className="text-muted-foreground">CPU</span>
        <strong className="text-right font-mono-data text-popover-foreground">{formatPct(point.cpuUsagePct)}</strong>
        <span className="text-muted-foreground">RAM</span>
        <strong className="text-right font-mono-data text-popover-foreground">{formatPct(point.memoryUsagePct)}</strong>
        <span className="text-muted-foreground">VMs</span>
        <strong className="text-right font-mono-data text-popover-foreground">{formatNum(point.vmCount)}</strong>
        <span className="text-muted-foreground">vCPU/Core</span>
        <strong className="text-right font-mono-data text-popover-foreground">{point.vcpuPerCore === null ? "—" : `${point.vcpuPerCore.toFixed(2)}:1`}</strong>
        <span className="text-muted-foreground">Betriebsstatus</span>
        <strong className="text-right text-popover-foreground">{OPERATIONAL_LABEL[point.operationalState]}</strong>
      </div>
      <p className="mt-3 border-t border-border/70 pt-2 text-[10px] text-muted-foreground">Klicken für Host-Details</p>
    </div>
  );
}

function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full border-2 bg-transparent"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}

function upperDomain(points: readonly HostLoadPoint[]): number {
  let maximum = 100;
  for (const point of points) maximum = Math.max(maximum, point.cpuUsagePct, point.memoryUsagePct);
  return Math.ceil(maximum / 10) * 10;
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

  if (isLoading) return <PanelLoadingState />;

  const notableCount = data.points.filter((point) => point.severity !== "normal").length;
  const maintenanceCount = data.points.filter((point) => point.operationalState === "maintenance").length
    + data.missingHosts.filter((host) => host.operationalState === "maintenance").length;
  const unavailableCount = data.points.filter((point) => point.operationalState === "disconnected" || point.operationalState === "poweredOff").length
    + data.missingHosts.filter((host) => host.operationalState === "disconnected" || host.operationalState === "poweredOff").length;
  const domainMax = upperDomain(data.points);

  return (
    <section className="host-load-map overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-[0_24px_70px_-48px_hsl(var(--primary)/0.65)]">
      <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/15 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <InfoTooltip entry={COMPLIANCE_SECTIONS.hostLoadMap} side="bottom">
            <h2 className="flex w-fit cursor-help items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Host Load Map
            </h2>
          </InfoTooltip>
          <p className="mt-1 text-xs text-muted-foreground">Aktuelle RVTools-Momentaufnahme · CPU gegen RAM · Blasengröße entspricht der VM-Anzahl</p>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/80 bg-border/80 sm:grid-cols-4">
          <div className="bg-card px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Im Scope</p>
            <p className="mt-0.5 font-mono-data text-base font-bold text-foreground">{formatNum(data.visibleHostCount)}</p>
          </div>
          <div className="bg-card px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Auffällig</p>
            <p className={`mt-0.5 font-mono-data text-base font-bold ${notableCount > 0 ? "text-warning" : "text-success"}`}>{formatNum(notableCount)}</p>
          </div>
          <div className="bg-card px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Wartung</p>
            <p className={`mt-0.5 font-mono-data text-base font-bold ${maintenanceCount > 0 ? "text-warning" : "text-foreground"}`}>{formatNum(maintenanceCount)}</p>
          </div>
          <div className="bg-card px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Nicht verfügbar</p>
            <p className={`mt-0.5 font-mono-data text-base font-bold ${unavailableCount > 0 ? "text-destructive" : "text-foreground"}`}>{formatNum(unavailableCount)}</p>
          </div>
        </div>
      </div>

      {data.points.length > 0 ? (
        <>
          <div className="host-load-map__canvas relative px-2 pb-1 pt-3 sm:px-4">
            <ResponsiveContainer width="100%" height={390}>
              <ScatterChart margin={{ top: 18, right: 54, bottom: 28, left: 2 }}>
                <ReferenceArea x1={75} x2={domainMax} y1={0} y2={domainMax} fill={CHART_COLORS.warning} fillOpacity={0.035} />
                <ReferenceArea x1={85} x2={domainMax} y1={0} y2={domainMax} fill={CHART_COLORS.danger} fillOpacity={0.035} />
                <ReferenceArea x1={0} x2={domainMax} y1={80} y2={domainMax} fill={CHART_COLORS.warning} fillOpacity={0.035} />
                <ReferenceArea x1={0} x2={domainMax} y1={90} y2={domainMax} fill={CHART_COLORS.danger} fillOpacity={0.035} />
                <CartesianGrid {...CHART_GRID_STYLE} />
                <XAxis
                  type="number"
                  dataKey="cpuUsagePct"
                  name="CPU"
                  unit="%"
                  domain={[0, domainMax]}
                  tick={CHART_AXIS_STYLE}
                  tickCount={6}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "CPU-Auslastung", position: "insideBottom", offset: -17, style: CHART_AXIS_LABEL_STYLE }}
                />
                <YAxis
                  type="number"
                  dataKey="memoryUsagePct"
                  name="RAM"
                  unit="%"
                  domain={[0, domainMax]}
                  tick={CHART_AXIS_STYLE}
                  tickCount={6}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                  label={{ value: "RAM-Auslastung", angle: -90, position: "insideLeft", offset: 8, style: CHART_AXIS_LABEL_STYLE }}
                />
                <ZAxis type="number" dataKey="bubbleValue" range={[120, 980]} name="VMs" />
                <ReferenceLine x={75} stroke={CHART_COLORS.warning} strokeOpacity={0.5} strokeDasharray="4 5" />
                <ReferenceLine x={85} stroke={CHART_COLORS.danger} strokeOpacity={0.55} strokeDasharray="4 5" />
                <ReferenceLine y={80} stroke={CHART_COLORS.warning} strokeOpacity={0.5} strokeDasharray="4 5" />
                <ReferenceLine y={90} stroke={CHART_COLORS.danger} strokeOpacity={0.55} strokeDasharray="4 5" />
                <Tooltip cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 4", strokeOpacity: 0.5 }} content={(props) => <HostLoadTooltip active={props.active} payload={props.payload as Array<{ payload?: HostLoadPoint }> | undefined} />} />
                <Scatter
                  data={data.points}
                  name="Hosts"
                  shape={(shapeProps: unknown) => <HostBubble shapeProps={shapeProps} onOpen={onHostClick} />}
                  isAnimationActive={data.points.length <= 100}
                  animationDuration={460}
                  animationEasing="ease-out"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-4 py-2.5 text-[10px] font-medium text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <LegendItem color={CHART_COLORS.primary} label="Normal" />
              <LegendItem color={CHART_COLORS.warning} label="Warnung" />
              <LegendItem color={CHART_COLORS.danger} label="Kritisch" />
              <LegendItem color={CHART_COLORS.warning} label="Wartungsmodus" dashed />
            </div>
            <span className="font-mono-data">CPU 75/85 % · RAM 80/90 %</span>
          </div>
        </>
      ) : (
        <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
          <div>
            <Server className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">Keine Host-Auslastung im aktuellen Scope</p>
            <p className="mt-1 text-xs text-muted-foreground">Filter prüfen oder RVTools-Daten mit CPU- und RAM-Auslastung importieren.</p>
          </div>
        </div>
      )}

      {data.missingHosts.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Keine Messwerte ({data.missingHosts.length})
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {data.missingHosts.slice(0, 8).map((host) => (
              <span key={host.hostKey} className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 font-mono-data text-[10px] text-muted-foreground" title={`${host.vcenterDisplayName} · ${host.cluster || "Kein Cluster"} · fehlt: ${host.missingMetrics.join(", ")}`}>
                <CircleOff className="h-3 w-3" />
                {shortHostName(host.host)}
              </span>
            ))}
            {data.missingHosts.length > 8 ? <span className="px-1 py-1 text-[10px] text-muted-foreground">+{data.missingHosts.length - 8} weitere</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
