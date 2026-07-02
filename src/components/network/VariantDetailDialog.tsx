import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { GitCompare, ChevronDown, Network, Server } from "lucide-react";
import { CHART_COLORS } from "@/lib/chartStyles";

/* ------------------------------------------------------------------ */
/*  Typen                                                              */
/* ------------------------------------------------------------------ */

export interface VariantNic {
  device: string;
  switchName: string;
  switchType: string;
  uplink: string;
  speeds: number[];
}

export interface VariantHost {
  host: string;
  cluster: string;
}

export interface VariantDetail {
  label: string;
  nics: VariantNic[];
  hosts: VariantHost[];
  clusters: string[];
}

interface VariantDetailDialogProps {
  variant: VariantDetail | null;
  open: boolean;
  onClose: () => void;
  onHostClick?: (host: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helfer                                                             */
/* ------------------------------------------------------------------ */

const SWITCH_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.purple,
  CHART_COLORS.info,
  CHART_COLORS.pink,
  CHART_COLORS.warning,
  CHART_COLORS.success,
];
const UNASSIGNED_COLOR = "hsl(215, 12%, 55%)";
const UNASSIGNED_KEY = "(kein Switch)";

function speedLabel(speeds: number[]): string {
  const valid = [...new Set(speeds.filter((v) => v > 0))].sort((a, b) => a - b);
  if (valid.length === 0) return "";
  const fmt = (mbps: number) => (mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`);
  if (valid.length === 1) return fmt(valid[0]);
  return `${fmt(valid[0])}–${fmt(valid[valid.length - 1])}`;
}

interface SwitchGroup {
  name: string;
  type: string;
  color: string;
  unassigned: boolean;
  nics: VariantNic[];
}

function groupBySwitch(nics: VariantNic[]): SwitchGroup[] {
  const groups = new Map<string, VariantNic[]>();
  for (const nic of nics) {
    const key = nic.switchName || UNASSIGNED_KEY;
    const arr = groups.get(key) || [];
    arr.push(nic);
    groups.set(key, arr);
  }
  let colorIdx = 0;
  return [...groups.entries()].map(([name, groupNics]) => {
    const unassigned = name === UNASSIGNED_KEY;
    return {
      name,
      type: unassigned ? "—" : groupNics[0].switchType,
      color: unassigned ? UNASSIGNED_COLOR : SWITCH_PALETTE[colorIdx++ % SWITCH_PALETTE.length],
      unassigned,
      nics: groupNics,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  SVG-Netzwerkdiagramm                                               */
/* ------------------------------------------------------------------ */

function NetworkDiagram({ nics, switchGroups, hostCount }: { nics: VariantNic[]; switchGroups: SwitchGroup[]; hostCount: number }) {
  const W = 960;
  const M = 24; // Seitenrand
  const hostY = 6;
  const hostH = 58;
  const portW = Math.min(88, Math.floor((W - 2 * M) / Math.max(nics.length, 1)) - 10);
  const portH = 36;
  const portY = hostY + hostH - portH / 2;
  const edgeZone = 96;
  const switchY = portY + portH + edgeZone;
  const switchH = 56;
  const H = switchY + switchH + 10;

  const colorBySwitch = new Map(switchGroups.map((g) => [g.name, g.color]));
  const switchCount = switchGroups.length;
  const switchW = Math.min(220, Math.floor((W - 2 * M) / Math.max(switchCount, 1)) - 20);

  // Position eines NIC-Ports (Mittelpunkt X)
  const portX = (i: number) => M + ((W - 2 * M) * (i + 0.5)) / nics.length;
  // Position eines Switch (Mittelpunkt X)
  const switchX = (j: number) => M + ((W - 2 * M) * (j + 0.5)) / switchCount;

  // Verbindungspunkte auf der Switch-Oberkante auffächern, damit sich Kanten nicht stapeln
  const switchIndexByName = new Map(switchGroups.map((g, j) => [g.name, j]));
  const attachCounter = new Map<string, number>();

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Netzwerkdesign: ${nics.length} NICs verbunden mit ${switchCount} Switch${switchCount !== 1 ? "es" : ""}`}
    >
      {/* Host-Rahmen */}
      <rect x={M} y={hostY} width={W - 2 * M} height={hostH} rx={12} fill="hsl(var(--muted) / 0.35)" stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={M + 14} y={hostY + 22} fontSize={12} fontWeight={600} fill="hsl(var(--foreground))">
        Host
      </text>
      <text x={M + 14} y={hostY + 38} fontSize={10} fill="hsl(var(--muted-foreground))">
        identische Belegung auf {hostCount} Host{hostCount !== 1 ? "s" : ""}
      </text>

      {/* Kanten (unter den Ports, über nichts anderem) */}
      {nics.map((nic, i) => {
        const key = nic.switchName || UNASSIGNED_KEY;
        const j = switchIndexByName.get(key) ?? 0;
        const group = switchGroups[j];
        const k = attachCounter.get(key) || 0;
        attachCounter.set(key, k + 1);
        const sx = switchX(j) - switchW / 2 + (switchW * (k + 1)) / (group.nics.length + 1);
        const px = portX(i);
        const py = portY + portH;
        const sy = switchY;
        const color = colorBySwitch.get(key) ?? UNASSIGNED_COLOR;
        return (
          <g key={`edge-${nic.device}`}>
            <path
              d={`M ${px} ${py} C ${px} ${py + 44}, ${sx} ${sy - 44}, ${sx} ${sy}`}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.75}
              strokeDasharray={group.unassigned ? "4 4" : undefined}
            />
            <circle cx={sx} cy={sy} r={2.5} fill={color} />
          </g>
        );
      })}

      {/* NIC-Ports */}
      {nics.map((nic, i) => {
        const px = portX(i);
        const color = colorBySwitch.get(nic.switchName || UNASSIGNED_KEY) ?? UNASSIGNED_COLOR;
        const speed = speedLabel(nic.speeds);
        return (
          <g key={`port-${nic.device}`}>
            <title>
              {`${nic.device}${speed ? ` · ${speed}` : ""}\nSwitch: ${nic.switchName || "nicht zugewiesen"}${nic.uplink ? `\nUplink: ${nic.uplink}` : ""}`}
            </title>
            <rect x={px - portW / 2} y={portY} width={portW} height={portH} rx={8} fill="hsl(var(--card))" stroke={color} strokeWidth={1.5} />
            <text x={px} y={portY + 15} fontSize={11} fontWeight={600} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontVariantNumeric: "tabular-nums" }}>
              {nic.device}
            </text>
            <text x={px} y={portY + 28} fontSize={9} textAnchor="middle" fill="hsl(var(--muted-foreground))">
              {speed || "—"}
            </text>
          </g>
        );
      })}

      {/* Switches */}
      {switchGroups.map((group, j) => {
        const cx = switchX(j);
        return (
          <g key={`switch-${group.name}`}>
            <title>{`${group.name}\nTyp: ${group.type}\n${group.nics.length} Uplink${group.nics.length !== 1 ? "s" : ""}/Host`}</title>
            <rect
              x={cx - switchW / 2}
              y={switchY}
              width={switchW}
              height={switchH}
              rx={10}
              fill="hsl(var(--muted) / 0.35)"
              stroke={group.color}
              strokeWidth={1.5}
              strokeDasharray={group.unassigned ? "4 4" : undefined}
            />
            <text x={cx} y={switchY + 22} fontSize={11.5} fontWeight={600} textAnchor="middle" fill="hsl(var(--foreground))">
              {group.name.length > Math.floor(switchW / 7) ? `${group.name.slice(0, Math.floor(switchW / 7) - 1)}…` : group.name}
            </text>
            <text x={cx} y={switchY + 39} fontSize={9.5} textAnchor="middle" fill="hsl(var(--muted-foreground))">
              {group.unassigned
                ? "nicht zugewiesen"
                : `${group.type === "Distributed" ? "vDS" : group.type === "Standard" ? "vSwitch (Std.)" : group.type} · ${group.nics.length} Uplink${group.nics.length !== 1 ? "s" : ""}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog                                                             */
/* ------------------------------------------------------------------ */

export function VariantDetailDialog({ variant, open, onClose, onHostClick }: VariantDetailDialogProps) {
  const [hostsExpanded, setHostsExpanded] = useState(false);

  const switchGroups = useMemo(() => groupBySwitch(variant?.nics ?? []), [variant]);

  const hostsByCluster = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of variant?.hosts ?? []) {
      const key = h.cluster || "(ohne Cluster)";
      const arr = map.get(key) || [];
      arr.push(h.host);
      map.set(key, arr);
    }
    const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
    return [...map.entries()]
      .sort((a, b) => collator.compare(a[0], b[0]))
      .map(([cluster, hosts]) => ({ cluster, hosts: hosts.sort((a, b) => collator.compare(a, b)) }));
  }, [variant]);

  if (!variant) return null;

  const hostCount = variant.hosts.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setHostsExpanded(false);
        }
      }}
    >
      <DialogContent className="w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GitCompare className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold font-mono-data truncate">
                Konfigurations-Variante {variant.label}
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                vmnic-zu-Switch-Belegung · identisch auf allen Hosts dieser Variante
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {hostCount} Host{hostCount !== 1 && "s"}
                </Badge>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {variant.clusters.length} Cluster
                </Badge>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {variant.nics.length} NICs/Host
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Netzwerkdesign */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Network className="h-3.5 w-3.5" /> Netzwerkdesign
              </h4>
              <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                <NetworkDiagram nics={variant.nics} switchGroups={switchGroups} hostCount={hostCount} />
              </div>

              {/* Legende / Belegung je Switch */}
              <div className="mt-3 space-y-2">
                {switchGroups.map((group) => (
                  <div key={group.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 px-3 py-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                      <span className="text-sm font-mono-data font-semibold truncate" title={group.name}>{group.name}</span>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${group.type === "Distributed" ? "text-info" : ""}`}>
                        {group.unassigned ? "nicht zugewiesen" : group.type === "Distributed" ? "vDS" : "vSwitch (Std.)"}
                      </Badge>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {group.nics.map((nic) => (
                        <span key={nic.device} className="rounded-md border border-border/50 bg-card/50 px-1.5 py-0.5 text-[11px] font-mono-data text-muted-foreground">
                          <span className="text-foreground">{nic.device}</span>
                          {speedLabel(nic.speeds) && <span className="tabular-nums"> ({speedLabel(nic.speeds)})</span>}
                          {nic.uplink && <span> → {nic.uplink}</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* Kennzahlen */}
            <section>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Hosts</p>
                  <p className="text-sm font-mono-data tabular-nums">{hostCount}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2 min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground">Cluster</p>
                  <p className="text-sm font-mono-data truncate" title={variant.clusters.join(", ")}>
                    {variant.clusters.join(", ") || "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">NICs/Host</p>
                  <p className="text-sm font-mono-data tabular-nums">{variant.nics.length}</p>
                </div>
              </div>
            </section>

            {/* Host-Liste (eingeklappt) */}
            <section>
              <Collapsible open={hostsExpanded} onOpenChange={setHostsExpanded}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    Hosts dieser Variante
                    <Badge variant="secondary" className="text-[10px] tabular-nums">{hostCount}</Badge>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${hostsExpanded ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                  <div className="space-y-3 pt-3">
                    {hostsByCluster.map(({ cluster, hosts }) => (
                      <div key={cluster}>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {cluster} <span className="tabular-nums">({hosts.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {hosts.map((host) => (
                            <button
                              key={host}
                              type="button"
                              onClick={onHostClick ? () => onHostClick(host) : undefined}
                              className="rounded-md border border-border/50 bg-muted/40 px-2 py-1.5 text-xs font-mono-data transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.96]"
                              title={`Host-Details zu ${host} öffnen`}
                            >
                              {host}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
