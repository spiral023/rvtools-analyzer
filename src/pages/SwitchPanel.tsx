import { useMemo, useState } from "react";
import { Activity, Cable, CheckCircle2, CircleDot, EthernetPort, Router, XCircle } from "lucide-react";
import { useActiveSnapshotIds, useAllSwitchLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { cn } from "@/lib/utils";
import type { SwitchLatest } from "@/domain/models/types";
import type { ColumnDef } from "@tanstack/react-table";

function textCell(value: string | null) {
  return value ?? "—";
}

function isConnected(status: string | null) {
  return status?.trim().toLowerCase() === "connected";
}

function statusBadge(status: string | null) {
  if (!status) return "—";
  if (isConnected(status)) {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function formatPortCount(count: number) {
  return `${formatNum(count)} ${count === 1 ? "Port" : "Ports"} erfasst`;
}

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

const columns: ColumnDef<SwitchLatest, unknown>[] = [
  { accessorKey: "hostname", header: "Hostname", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Description", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => statusBadge(getValue() as string | null) },
  { accessorKey: "mode", header: "Mode", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "duplex", header: "Duplex", cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "speed", header: "Speed", cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "transceiver", header: "Transceiver", cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

interface SwitchSummary {
  hostname: string;
  hostnameNorm: string;
  ports: SwitchLatest[];
  connected: number;
}

function buildSwitchSummaries(rows: SwitchLatest[]): SwitchSummary[] {
  const grouped = new Map<string, SwitchLatest[]>();
  for (const row of rows) {
    const entries = grouped.get(row.hostnameNorm) ?? [];
    entries.push(row);
    grouped.set(row.hostnameNorm, entries);
  }

  return [...grouped.entries()]
    .map(([hostnameNorm, ports]) => {
      const sortedPorts = [...ports].sort((a, b) => collator.compare(a.interface, b.interface));
      return {
        hostnameNorm,
        hostname: sortedPorts[0]?.hostname ?? hostnameNorm,
        ports: sortedPorts,
        connected: sortedPorts.filter((port) => isConnected(port.status)).length,
      };
    })
    .sort((a, b) => collator.compare(a.hostname, b.hostname));
}

function PortFrontPanel({ ports, selectedPortKey, onSelect }: {
  ports: SwitchLatest[];
  selectedPortKey: string;
  onSelect: (port: SwitchLatest) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3 shadow-inner shadow-black/10">
      <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-1.5"><EthernetPort className="h-3.5 w-3.5 text-primary" /> Interface panel</span>
        <span className="font-mono-data text-[10px]">Cisco-style port map</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.4rem,1fr))] gap-2">
        {ports.map((port) => {
          const connected = isConnected(port.status);
          const selected = port.switchInterfaceKey === selectedPortKey;
          return (
            <button
              key={port.switchInterfaceKey}
              type="button"
              onClick={() => onSelect(port)}
              aria-pressed={selected}
              aria-label={`${port.interface} · ${port.status ?? "unbekannt"}${port.description ? ` · ${port.description}` : ""}`}
              title={`${port.interface} — ${port.status ?? "unbekannt"}${port.description ? ` — ${port.description}` : ""}`}
              className={cn(
                "group relative min-h-[4.2rem] rounded-md border px-1.5 py-2 text-left font-mono-data transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                connected
                  ? "border-success/50 bg-success/10 hover:border-success hover:bg-success/15"
                  : "border-border bg-muted/45 hover:border-warning/70 hover:bg-warning/10",
                selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <span className={cn("mb-2 block h-1 w-full rounded-full", connected ? "bg-success shadow-[0_0_10px_hsl(var(--success))]" : "bg-muted-foreground/35")} />
              <span className="block truncate text-[11px] font-semibold tracking-tight text-foreground">{port.interface}</span>
              <span className={cn("mt-1 block truncate text-[9px] uppercase tracking-wide", connected ? "text-success" : "text-muted-foreground")}>{connected ? "Link up" : port.status ?? "unknown"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SwitchPanel() {
  const { data: rows = [], isLoading } = useAllSwitchLatest();
  const { filters } = useActiveSnapshotIds();
  const [selectedHostnameNorm, setSelectedHostnameNorm] = useState<string | null>(null);
  const [selectedPortKey, setSelectedPortKey] = useState<string | null>(null);

  const connectedCount = useMemo(() => rows.filter((r) => isConnected(r.status)).length, [rows]);
  const notConnectedCount = useMemo(() => rows.filter((r) => !isConnected(r.status)).length, [rows]);
  const switches = useMemo(() => buildSwitchSummaries(rows), [rows]);
  const selectedSwitch = switches.find((switchItem) => switchItem.hostnameNorm === selectedHostnameNorm) ?? switches[0];
  const selectedPort = selectedSwitch?.ports.find((port) => port.switchInterfaceKey === selectedPortKey) ?? selectedSwitch?.ports[0];

  if (isLoading) return <PanelLoadingState />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Router className="h-6 w-6" />}
        title="Keine Switch-Daten"
        description="Laden Sie eine Cisco-Switch-TXT auf der Upload-Seite hoch, um den Interface-Status auszuwerten."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Switches" value={formatNum(switches.length)} icon={<Router className="h-4 w-4" />} />
        <KpiCard title="Interfaces gesamt" value={formatNum(rows.length)} icon={<Cable className="h-4 w-4" />} />
        <KpiCard title="Connected" value={formatNum(connectedCount)} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard title="Not Connected" value={formatNum(notConnectedCount)} severity={notConnectedCount > 0 ? "warn" : "ok"} icon={<XCircle className="h-4 w-4" />} />
      </KpiGrid>

      {selectedSwitch && selectedPort && (
        <section aria-labelledby="switch-detail-heading" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/25 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  <Activity className="h-3.5 w-3.5" /> Live interface inventory
                </div>
                <h3 id="switch-detail-heading" className="font-mono-data text-lg font-semibold tracking-tight">Switch-Detail · {selectedSwitch.hostname}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{formatPortCount(selectedSwitch.ports.length)}</span>
                <span className="flex items-center gap-1.5 text-success"><CircleDot className="h-3.5 w-3.5" /> {formatNum(selectedSwitch.connected)} Link up</span>
                <span>{formatNum(selectedSwitch.ports.length - selectedSwitch.connected)} ohne Link</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5" aria-label="Switch auswählen">
              {switches.map((switchItem) => {
                const selected = switchItem.hostnameNorm === selectedSwitch.hostnameNorm;
                return (
                  <Button
                    key={switchItem.hostnameNorm}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedHostnameNorm(switchItem.hostnameNorm);
                      setSelectedPortKey(null);
                    }}
                    className="shrink-0 font-mono-data"
                    aria-pressed={selected}
                  >
                    {switchItem.hostname}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:p-5">
            <PortFrontPanel ports={selectedSwitch.ports} selectedPortKey={selectedPort.switchInterfaceKey} onSelect={(port) => setSelectedPortKey(port.switchInterfaceKey)} />
            <aside className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Port-Details">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Ausgewählter Port</p>
                  <p className="mt-1 font-mono-data text-xl font-semibold">{selectedPort.interface}</p>
                </div>
                {statusBadge(selectedPort.status)}
              </div>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Beschreibung</dt><dd className="mt-0.5 break-words font-medium">{textCell(selectedPort.description)}</dd></div>
                <div className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Mode</dt><dd className="mt-0.5 font-mono-data">{textCell(selectedPort.mode)}</dd></div><div><dt className="text-xs text-muted-foreground">Speed</dt><dd className="mt-0.5 font-mono-data">{textCell(selectedPort.speed)}</dd></div></div>
                <div className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Duplex</dt><dd className="mt-0.5 font-mono-data">{textCell(selectedPort.duplex)}</dd></div><div><dt className="text-xs text-muted-foreground">Transceiver</dt><dd className="mt-0.5 break-all font-mono-data text-xs">{textCell(selectedPort.transceiver)}</dd></div></div>
              </dl>
            </aside>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground lg:px-5">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-success shadow-[0_0_7px_hsl(var(--success))]" /> connected</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-muted-foreground/45" /> not connected / unknown</span>
            <span>Port auswählen, um die Interface-Daten zu prüfen.</span>
          </div>
        </section>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Alle Interfaces ({rows.length})</h3>
        <VirtualTable
          data={rows}
          columns={columns}
          globalFilter={filters.search}
          height={500}
          exportFileName="cisco-switch-ports"
          onRowClick={(row) => {
            setSelectedHostnameNorm(row.hostnameNorm);
            setSelectedPortKey(row.switchInterfaceKey);
          }}
        />
      </div>
    </div>
  );
}
