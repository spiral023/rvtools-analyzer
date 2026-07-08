import { useMemo, useState } from "react";
import { useRawSheet, useActiveSnapshotIds, useVms } from "@/hooks/useActiveSnapshots";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "@/components/charts/recharts";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, SEVERITY_COLORS } from "@/lib/chartStyles";
import {
  Server, Cpu, HardDrive, Network as NetworkIcon,
  ChevronRight, Layers, MonitorCog, CircuitBoard, Info, Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { SheetRow, NormalizedVm } from "@/domain/models/types";
import { buildHostDetails, bool, str, type HostDetail } from "@/lib/conversion";
import { buildHostDetailMarkdown } from "@/lib/detailMarkdown";
import {
  buildHardwareModelGroups,
  DEFAULT_RAM_VARIANT_TOLERANCE_PERCENT,
  type HardwareModelGroup,
} from "@/lib/hardwareVariants";

export type { HostDetail } from "@/lib/conversion";

interface HbaEntry {
  device: string;
  type: string;
  status: string;
  driver: string;
  model: string;
  wwn: string;
  pci: string;
}

interface NicEntry {
  device: string;
  driver: string;
  speed: string;
  duplex: boolean;
  mac: string;
  switchName: string;
  uplinkPort: string;
  pci: string;
  wakeOn: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildHbaEntries(rows: SheetRow[], hostName: string): HbaEntry[] {
  const entries: HbaEntry[] = [];
  for (const r of rows) {
    if (str(r.data["Host"]) !== hostName) continue;
    entries.push({
      device: str(r.data["Device"]),
      type: str(r.data["Type"]),
      status: str(r.data["Status"]),
      driver: str(r.data["Driver"]),
      model: str(r.data["Model"]),
      wwn: str(r.data["WWN"]),
      pci: str(r.data["Pci"]),
    });
  }
  return entries.sort((a, b) =>
    a.device.localeCompare(b.device, "de-DE", { numeric: true, sensitivity: "base" }),
  );
}

function buildNicEntries(rows: SheetRow[], hostName: string): NicEntry[] {
  const entries: NicEntry[] = [];
  for (const r of rows) {
    if (str(r.data["Host"]) !== hostName) continue;
    entries.push({
      device: str(r.data["Network Device"]),
      driver: str(r.data["Driver"]),
      speed: str(r.data["Speed"]),
      duplex: bool(r.data["Duplex"]),
      mac: str(r.data["MAC"]),
      switchName: str(r.data["Switch"]),
      uplinkPort: str(r.data["Uplink port"]),
      pci: str(r.data["PCI"]),
      wakeOn: bool(r.data["WakeOn"]),
    });
  }
  return entries.sort((a, b) =>
    a.device.localeCompare(b.device, "de-DE", { numeric: true, sensitivity: "base" }),
  );
}

function formatMemory(mib: number): string {
  if (mib >= 1048576) return `${(mib / 1048576).toFixed(1)} TiB`;
  if (mib >= 1024) return `${(mib / 1024).toFixed(0)} GiB`;
  return `${mib} MiB`;
}

function formatMemorySummary(memoryValuesMiB: number[], fallbackMiB: number): string {
  const values = memoryValuesMiB.length > 0 ? memoryValuesMiB : fallbackMiB ? [fallbackMiB] : [];
  const labels = new Set<string>();
  for (const value of values) {
    labels.add(formatMemory(value));
  }
  const labelList = [...labels];
  if (labelList.length === 0) return "RAM n/a";
  if (labelList.length <= 3) return labelList.join(" / ");
  return `${labelList[0]}-${labelList[labelList.length - 1]}`;
}

function formatCpuClock(mhz: number): string {
  if (!mhz) return "—";
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${mhz} MHz`;
}

function statusColor(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "online" || normalized === "active") return "text-emerald-400";
  if (normalized === "unknown") return "text-yellow-400";
  return "text-red-400";
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function ModelCard({
  group,
  onSelect,
}: {
  group: HardwareModelGroup;
  onSelect: (h: HostDetail) => void;
}) {
  const {
    modelLabel,
    count,
    vendor,
    hosts,
    cpuModel,
    cpuSockets,
    coresPerCpu,
    totalCores,
    speedMHz,
    memoryMiB,
    memoryValuesMiB,
  } = group;
  const ramLabel = formatMemorySummary(memoryValuesMiB, memoryMiB);
  const coreLabel = totalCores ? `${totalCores} Cores` : "Cores n/a";
  const socketLabel = cpuSockets ? `${cpuSockets} Sockel` : "Sockel n/a";
  const clusters = [...new Set(hosts.flatMap((h) => h.cluster ? [h.cluster] : []))];
  const totalVms = hosts.reduce((s, h) => s + h.vmCount, 0);

  return (
    <Card className="group hover:border-primary/40 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{modelLabel || "Unknown Model"}</CardTitle>
              <p className="text-xs text-muted-foreground">{vendor}</p>
              <p className="text-[11px] text-muted-foreground">
                {cpuModel || "Unknown CPU"} · {socketLabel} · {coreLabel} · {formatCpuClock(speedMHz)} · {ramLabel}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm font-mono-data">
            {count}×
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold font-mono-data">{count}</p>
            <p className="text-[10px] uppercase text-muted-foreground">Hosts</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold font-mono-data">{totalVms}</p>
            <p className="text-[10px] uppercase text-muted-foreground">VMs</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold font-mono-data">{coresPerCpu || 0}</p>
            <p className="text-[10px] uppercase text-muted-foreground">Cores/CPU</p>
          </div>
        </div>
        {clusters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clusters.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px] font-normal">
                {c}
              </Badge>
            ))}
          </div>
        )}
        <Separator />
        <div className="space-y-1">
          {hosts.map((h) => (
            <button
              type="button"
              key={h.host}
              onClick={() => onSelect(h)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/60 transition-colors group/row"
            >
              <span className="font-mono-data text-xs truncate">{h.host}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Host Detail Dialog                                                 */
/* ------------------------------------------------------------------ */

export function HostDetailDialog({
  host,
  hbaRows,
  nicRows,
  vmRows,
  open,
  onClose,
}: {
  host: HostDetail | null;
  hbaRows: SheetRow[];
  nicRows: SheetRow[];
  vmRows: NormalizedVm[];
  open: boolean;
  onClose: () => void;
}) {
  if (!host) return null;

  const hbas = buildHbaEntries(hbaRows, host.host);
  const nics = buildNicEntries(nicRows, host.host);
  const hostKey = host.host.trim().toLowerCase();
  const runningVms = vmRows
    .filter((vm) => {
      const vmHost = (vm.host || "").trim().toLowerCase();
      if (!vmHost || vmHost !== hostKey) return false;
      const power = (vm.powerState || "").replace(/\s+/g, "").toLowerCase();
      return power === "poweredon" || power === "on";
    })
    .sort((a, b) => a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" }));

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(
        buildHostDetailMarkdown(host, {
          hbas,
          nics,
          runningVms,
        }),
      );
      toast.success("Host-Details als Markdown kopiert.");
    } catch {
      toast.error("Host-Details konnten nicht kopiert werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[85vh] overflow-hidden p-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyMarkdown()}
          className="absolute right-10 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Host-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold font-mono-data">
                {host.host}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {host.model} · {host.vendor}
                {host.maintenanceMode && (
                  <Badge variant="destructive" className="ml-2 text-[10px]">Maintenance</Badge>
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="p-6 space-y-6">

            {/* Identity */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <MonitorCog className="h-3.5 w-3.5" /> Identität & Standort
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Datacenter", host.datacenter],
                  ["Cluster", host.cluster],
                  ["Serial", host.serial],
                  ["Service Tag", host.serviceTag],
                  ["ESXi", host.esxVersion],
                  ["BIOS", `${host.biosVendor} ${host.biosVersion}`],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="text-sm font-mono-data truncate" title={val as string}>
                      {val || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* CPU & Memory */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5" /> CPU & Arbeitsspeicher
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["CPU Modell", host.cpuModel],
                  ["Sockel", String(host.cpuSockets)],
                  ["Kerne/Sockel", String(host.coresPerCpu)],
                  ["Kerne gesamt", String(host.totalCores)],
                  ["Takt", `${host.speedMHz} MHz`],
                  ["HT aktiv", host.htActive ? "Ja" : "Nein"],
                  ["RAM", formatMemory(host.memoryMiB)],
                  ["VMs", String(host.vmCount)],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="text-sm font-bold font-mono-data">{val}</p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* HBAs */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <CircuitBoard className="h-3.5 w-3.5" /> Host Bus Adapter ({hbas.length})
              </h4>
              {hbas.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine HBAs gefunden</p>
              ) : (
                <div className="space-y-2">
                  {hbas.map((hba) => (
                    <div
                      key={hba.device}
                      className="rounded-lg border border-border/60 bg-card px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6"
                    >
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <span className="font-mono-data text-sm font-semibold">{hba.device}</span>
                        <span className={`text-[10px] font-medium ${statusColor(hba.status)}`}>
                          ● {hba.status}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] w-fit">{hba.type}</Badge>
                      <span className="text-xs text-muted-foreground truncate flex-1">{hba.model}</span>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>Driver: <span className="font-mono-data">{hba.driver}</span></span>
                        <span>PCI: <span className="font-mono-data">{hba.pci}</span></span>
                      </div>
                      {hba.wwn && (
                        <div className="text-[10px] text-muted-foreground">
                          WWN: <span className="font-mono-data">{hba.wwn}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* NICs */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <NetworkIcon className="h-3.5 w-3.5" /> Netzwerkadapter ({nics.length})
              </h4>
              {nics.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine NICs gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Device</th>
                        <th className="py-2 pr-3">Speed</th>
                        <th className="py-2 pr-3">MAC</th>
                        <th className="py-2 pr-3">Switch</th>
                        <th className="py-2 pr-3">Uplink</th>
                        <th className="py-2 pr-3">Driver</th>
                        <th className="py-2 pr-3">PCI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nics.map((nic) => (
                        <tr key={nic.device} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{nic.device}</td>
                          <td className="py-2 pr-3 font-mono-data">{nic.speed ? `${Number(String(nic.speed).replace(/,/g, "")) / 1000} Gbps` : "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{nic.mac}</td>
                          <td className="py-2 pr-3">{nic.switchName || "—"}</td>
                          <td className="py-2 pr-3">{nic.uplinkPort || "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{nic.driver}</td>
                          <td className="py-2 pr-3 font-mono-data">{nic.pci}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <Separator />

            {/* Running VMs */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Virtuelle Maschinen ({runningVms.length})
              </h4>
              {runningVms.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine laufenden VMs auf diesem Host gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">VM</th>
                        <th className="py-2 pr-3">Power</th>
                        <th className="py-2 pr-3">vCPU</th>
                        <th className="py-2 pr-3">RAM</th>
                        <th className="py-2 pr-3">Cluster</th>
                        <th className="py-2 pr-3">Resource Pool</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runningVms.map((vm) => (
                        <tr key={`${vm.vmKey}::${vm.snapshotId}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{vm.vmName}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="secondary" className="text-[10px]">PoweredOn</Badge>
                          </td>
                          <td className="py-2 pr-3 font-mono-data">{vm.cpuCount ?? "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{vm.memoryMiB ? formatMemory(vm.memoryMiB) : "—"}</td>
                          <td className="py-2 pr-3">{vm.cluster || "—"}</td>
                          <td className="py-2 pr-3">{vm.resourcePool || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function Hardware() {
  const { activeSnapshotIds, filters } = useActiveSnapshotIds();
  const { data: hostRows = [] } = useRawSheet("vHost");
  const { data: hbaRows = [] } = useRawSheet("vHBA");
  const { data: nicRows = [] } = useRawSheet("vNIC");
  const { allVms = [] } = useVms();

  const [selectedHost, setSelectedHost] = useState<HostDetail | null>(null);
  const [countRamAsVariant, setCountRamAsVariant] = useState(false);

  const hosts = useMemo(() => buildHostDetails(hostRows), [hostRows]);
  const filteredHosts = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const clusterSet = new Set(filters.clusters);
    const hostSet = new Set(filters.hosts);
    return hosts.filter((h) => {
      if (clusterSet.size > 0 && (!h.cluster || !clusterSet.has(h.cluster))) return false;
      if (hostSet.size > 0 && !hostSet.has(h.host)) return false;
      if (!q) return true;
      return [
        h.host,
        h.model,
        h.vendor,
        h.cluster,
        h.datacenter,
        h.cpuModel,
        h.esxVersion,
        h.serial,
        h.serviceTag,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [hosts, filters.clusters, filters.hosts, filters.search]);

  const modelGroups = useMemo(
    () => buildHardwareModelGroups(filteredHosts, { countRamAsVariant }),
    [filteredHosts, countRamAsVariant],
  );

  // Vendor distribution for pie chart
  const vendorData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of filteredHosts) {
      const v = h.vendor || "Unknown";
      map.set(v, (map.get(v) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [filteredHosts]);

  // Model bar chart
  const modelBarData = useMemo(
    () =>
      modelGroups.map((g) => ({
        name: `${g.modelLabel || "Unknown"} · ${g.totalCores || 0}C · ${formatMemorySummary(g.memoryValuesMiB, g.memoryMiB)}`,
        count: g.count,
      })),
    [modelGroups]
  );

  const uniqueModels = modelGroups.length;
  const totalHosts = filteredHosts.length;
  const totalVms = filteredHosts.reduce((s, h) => s + h.vmCount, 0);
  const uniqueVendors = new Set(filteredHosts.map((h) => h.vendor)).size;

  if (activeSnapshotIds.length === 0) {
    return (
      <EmptyState
        icon={<Server className="h-6 w-6" />}
        title="Keine Daten"
        description="Importiere einen RVTools-Export, um die Hardware-Analyse zu sehen."
        actionLabel="Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hardware</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ESXi-Host-Hardware-Modelle, Komponenten und Konfiguration
        </p>
      </div>
      <FilterBar />

      <div className="flex flex-col gap-3 rounded-lg bg-muted/35 px-4 py-3 text-sm md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Eine Hardware-Variante wird aus Hersteller, Modell, CPU-Modell, Core-Anzahl und CPU-Takt gebildet.
            RAM-Größen werden standardmäßig zusammengefasst, weil Speicher bei Bedarf getauscht werden kann.
            Die RAM-Werte bleiben in der Anzeige gerundet sichtbar.
          </p>
        </div>
        <label htmlFor="count-ram-as-variant" className="flex min-w-fit cursor-pointer items-center gap-3 rounded-md bg-background/70 px-3 py-2 text-xs font-medium">
          <span>RAM als Variante zählen</span>
          <Switch
            id="count-ram-as-variant"
            checked={countRamAsVariant}
            onCheckedChange={setCountRamAsVariant}
            aria-label="RAM-Größe als Hardware-Variante zählen"
          />
        </label>
      </div>
      {countRamAsVariant && (
        <p className="text-xs text-muted-foreground">
          RAM-Modus aktiv: Hosts werden nur dann in derselben RAM-Variante zusammengefasst, wenn die RAM-Abweichung höchstens {DEFAULT_RAM_VARIANT_TOLERANCE_PERCENT}% beträgt.
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="ESXi Hosts" value={totalHosts} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Hardware-Varianten" value={uniqueModels} icon={<Layers className="h-4 w-4" />} />
        <KpiCard title="Hersteller" value={uniqueVendors} icon={<MonitorCog className="h-4 w-4" />} />
        <KpiCard title="VMs gesamt" value={totalVms} icon={<HardDrive className="h-4 w-4" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Model distribution bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Host-Modellvarianten Verteilung</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, modelBarData.length * 38)}>
              <BarChart data={modelBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={CHART_AXIS_STYLE} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={280}
                  tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }}
                />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {modelBarData.map((entry, index) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Vendor pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Hersteller</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={vendorData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {vendorData.map((entry, index) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Model cards grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Modelle und Varianten im Detail</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {modelGroups.map((g) => (
            <ModelCard
              key={g.signature}
              group={g}
              onSelect={setSelectedHost}
            />
          ))}
        </div>
      </div>

      {/* Detail dialog */}
      <HostDetailDialog
        host={selectedHost}
        hbaRows={hbaRows}
        nicRows={nicRows}
        vmRows={allVms}
        open={!!selectedHost}
        onClose={() => setSelectedHost(null)}
      />
    </div>
  );
}
