import { useMemo } from "react";
import {
  Monitor,
  Cpu,
  HardDrive,
  Network as NetworkIcon,
  Wrench,
  Camera,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import { buildVmDetailMarkdown } from "@/lib/detailMarkdown";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import {
  formatRvtoolsDate,
  matchRowsForVm,
  summarizeSnapshots,
  summarizeStorage,
} from "@/lib/vmDetail";

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function boolLabel(value: unknown): string {
  const raw = str(value).toLowerCase();
  if (!raw) return "—";
  if (raw === "true" || raw === "1" || raw === "yes") return "Ja";
  if (raw === "false" || raw === "0" || raw === "no") return "Nein";
  return str(value);
}

function statusTextClass(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, "").toLowerCase();
  if (normalized === "poweredon" || normalized === "connected" || normalized === "green") return "text-success";
  if (normalized === "poweredoff") return "text-muted-foreground";
  if (normalized === "yellow" || normalized === "warning") return "text-warning";
  if (normalized === "red") return "text-destructive";
  return "text-muted-foreground";
}

function compactValue(value: string | null | undefined): string {
  const v = (value || "").trim();
  return v || "—";
}

function sheetRowKey(row: SheetRow, fallback: string): string {
  return `${row.snapshotId}:${row.sheetName}:${row.rowIndex}:${fallback}`;
}

type VmDetailVm = NormalizedVm & {
  sysv?: string | null;
};

interface VmDetailDialogProps {
  vm: VmDetailVm | null;
  open: boolean;
  onClose: () => void;
  rawCpuRows: SheetRow[];
  rawMemoryRows: SheetRow[];
  rawDiskRows: SheetRow[];
  rawPartitionRows: SheetRow[];
  rawNetworkRows: SheetRow[];
  rawSnapshotRows: SheetRow[];
  rawToolsRows: SheetRow[];
}

export function VmDetailDialog({
  vm,
  open,
  onClose,
  rawCpuRows,
  rawMemoryRows,
  rawDiskRows,
  rawPartitionRows,
  rawNetworkRows,
  rawSnapshotRows,
  rawToolsRows,
}: VmDetailDialogProps) {
  const cpuRows = useMemo(() => matchRowsForVm(rawCpuRows, vm), [rawCpuRows, vm]);
  const memoryRows = useMemo(() => matchRowsForVm(rawMemoryRows, vm), [rawMemoryRows, vm]);
  const diskRows = useMemo(() => matchRowsForVm(rawDiskRows, vm), [rawDiskRows, vm]);
  const partitionRows = useMemo(() => matchRowsForVm(rawPartitionRows, vm), [rawPartitionRows, vm]);
  const networkRows = useMemo(() => matchRowsForVm(rawNetworkRows, vm), [rawNetworkRows, vm]);
  const snapshotRows = useMemo(() => matchRowsForVm(rawSnapshotRows, vm), [rawSnapshotRows, vm]);
  const toolsRows = useMemo(() => matchRowsForVm(rawToolsRows, vm), [rawToolsRows, vm]);

  const cpu = cpuRows[0]?.data ?? {};
  const memory = memoryRows[0]?.data ?? {};
  const tools = toolsRows[0]?.data ?? {};

  const sortedSnapshots = useMemo(
    () =>
      snapshotRows.slice().sort((a, b) => {
        const av = toNumber(a.data["Date / time"]);
        const bv = toNumber(b.data["Date / time"]);
        if (av !== null && bv !== null) return bv - av;
        const ad = Date.parse(str(a.data["Date / time"]));
        const bd = Date.parse(str(b.data["Date / time"]));
        if (!Number.isNaN(ad) && !Number.isNaN(bd)) return bd - ad;
        return str(a.data["Name"]).localeCompare(str(b.data["Name"]), "de-DE", {
          numeric: true,
          sensitivity: "base",
        });
      }),
    [snapshotRows],
  );

  const storageSummary = useMemo(() => summarizeStorage(diskRows), [diskRows]);
  const snapshotSummary = useMemo(() => summarizeSnapshots(snapshotRows), [snapshotRows]);

  if (!vm) return null;

  const vmPower = compactValue(vm.powerState);
  const vmConfig = compactValue(vm.configStatus);
  const vmConnection = compactValue(vm.connectionState);
  const vmSysv = compactValue(vm.sysv);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(
        buildVmDetailMarkdown(vm, {
          diskRows,
          networkRows,
          snapshotRows: sortedSnapshots,
          toolsRows,
        }),
      );
      toast.success("VM-Details als Markdown kopiert.");
    } catch {
      toast.error("VM-Details konnten nicht kopiert werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyMarkdown()}
          className="absolute right-10 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="VM-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Monitor className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold font-mono-data truncate">
                {vm.vmName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                {[vm.cluster, vm.host, vm.datacenter].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={`text-[10px] ${statusTextClass(vm.powerState)}`}>
                  {vmPower}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${statusTextClass(vm.configStatus)}`}>
                  Config: {vmConfig}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${statusTextClass(vm.connectionState)}`}>
                  Connection: {vmConnection}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  SysV: {vmSysv}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" /> Basis & Identität
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Datacenter", compactValue(vm.datacenter)],
                  ["Cluster", compactValue(vm.cluster)],
                  ["Host", compactValue(vm.host)],
                  ["Folder", compactValue(vm.folder)],
                  ["Resource Pool", compactValue(vm.resourcePool)],
                  ["OS (Config)", compactValue(vm.osConfig)],
                  ["OS (Tools)", compactValue(vm.osTools)],
                  ["HW Version", compactValue(vm.hwVersion)],
                  ["Firmware", compactValue(vm.firmware)],
                  ["EFI Secure Boot", vm.efiSecureBoot == null ? "—" : vm.efiSecureBoot ? "Ja" : "Nein"],
                  ["CBT", vm.cbt == null ? "—" : vm.cbt ? "Ja" : "Nein"],
                  ["VM UUID", compactValue(vm.vmUuid)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="text-sm font-mono-data truncate" title={value}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5" /> CPU & Arbeitsspeicher
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["vCPU", String(vm.cpuCount ?? toNumber(cpu["CPUs"]) ?? "—")],
                  ["Sockets", String(toNumber(cpu["Sockets"]) ?? "—")],
                  ["Cores/Sockel", String(toNumber(cpu["Cores p/s"]) ?? "—")],
                  ["Memory Size", formatBytes(toNumber(memory["Size MiB"]) ?? vm.memoryMiB)],
                  ["Memory Active", formatBytes(toNumber(memory["Active"]))],
                  ["Memory Consumed", formatBytes(toNumber(memory["Consumed"]))],
                  ["Memory Ballooned", formatBytes(toNumber(memory["Ballooned"]))],
                  ["Memory Swapped", formatBytes(toNumber(memory["Swapped"]))],
                  ["CPU Reservation", String(toNumber(cpu["Reservation"]) ?? "—")],
                  ["CPU Limit", String(toNumber(cpu["Limit"]) ?? "—")],
                  ["Mem Reservation", String(toNumber(memory["Reservation"]) ?? "—")],
                  ["Mem Limit", String(toNumber(memory["Limit"]) ?? "—")],
                  ["CPU Hot Add", boolLabel(cpu["Hot Add"])],
                  ["CPU Hot Remove", boolLabel(cpu["Hot Remove"])],
                  ["Memory Hot Add", boolLabel(memory["Hot Add"])],
                  ["Consolidation Needed", vm.consolidationNeeded == null ? "—" : vm.consolidationNeeded ? "Ja" : "Nein"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="text-sm font-bold font-mono-data">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Storage
              </h4>
              <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Disks</p>
                  <p className="text-sm font-bold font-mono-data">{storageSummary.diskCount}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Disk Capacity</p>
                  <p className="text-sm font-bold font-mono-data">{formatBytes(storageSummary.totalCapacityMiB)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Provisioned</p>
                  <p className="text-sm font-bold font-mono-data">{formatBytes(vm.provisionedMiB)}</p>
                </div>
              </div>

              {diskRows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Disk-Daten gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Disk</th>
                        <th className="py-2 pr-3">Capacity</th>
                        <th className="py-2 pr-3">Mode</th>
                        <th className="py-2 pr-3">Thin</th>
                        <th className="py-2 pr-3">Controller</th>
                        <th className="py-2 pr-3">Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diskRows.map((row) => (
                        <tr key={sheetRowKey(row, str(row.data["Disk Key"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{str(row.data["Disk"]) || "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Capacity MiB"]))}</td>
                          <td className="py-2 pr-3">{str(row.data["Disk Mode"]) || "—"}</td>
                          <td className="py-2 pr-3">{boolLabel(row.data["Thin"])}</td>
                          <td className="py-2 pr-3">{str(row.data["Controller"]) || "—"}</td>
                          <td className="py-2 pr-3 max-w-[320px] truncate" title={str(row.data["Disk Path"])}>
                            {str(row.data["Disk Path"]) || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Partitionen ({partitionRows.length})
                </h5>
                {partitionRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Keine Partition-Daten gefunden</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-2 pr-3">Disk</th>
                          <th className="py-2 pr-3">Capacity</th>
                          <th className="py-2 pr-3">Consumed</th>
                          <th className="py-2 pr-3">Free</th>
                          <th className="py-2 pr-3">Free %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partitionRows.map((row) => (
                          <tr key={sheetRowKey(row, str(row.data["Disk Key"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-2 pr-3 max-w-[260px] truncate" title={str(row.data["Disk"])}>
                              {str(row.data["Disk"]) || "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Capacity MiB"]))}</td>
                            <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Consumed MiB"]))}</td>
                            <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Free MiB"]))}</td>
                            <td className="py-2 pr-3 font-mono-data">
                              {toNumber(row.data["Free %"]) == null ? "—" : `${toNumber(row.data["Free %"])?.toFixed(1)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <NetworkIcon className="h-3.5 w-3.5" /> Netzwerk, Tools & Snapshots
              </h4>

              <div className="mb-4">
                <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Netzwerkadapter ({networkRows.length})
                </h5>
                {networkRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Keine Netzwerkdaten gefunden</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-2 pr-3">NIC</th>
                          <th className="py-2 pr-3">Adapter</th>
                          <th className="py-2 pr-3">Network</th>
                          <th className="py-2 pr-3">Switch</th>
                          <th className="py-2 pr-3">Connected</th>
                          <th className="py-2 pr-3">MAC</th>
                          <th className="py-2 pr-3">IPv4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {networkRows.map((row) => (
                          <tr key={sheetRowKey(row, str(row.data["NIC label"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-2 pr-3 font-mono-data">{str(row.data["NIC label"]) || "—"}</td>
                            <td className="py-2 pr-3">{str(row.data["Adapter"]) || "—"}</td>
                            <td className="py-2 pr-3">{str(row.data["Network"]) || "—"}</td>
                            <td className="py-2 pr-3">{str(row.data["Switch"]) || "—"}</td>
                            <td className="py-2 pr-3">{boolLabel(row.data["Connected"])}</td>
                            <td className="py-2 pr-3 font-mono-data">{str(row.data["Mac Address"]) || "—"}</td>
                            <td className="py-2 pr-3 font-mono-data">{str(row.data["IPv4 Address"]) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" /> VMware Tools
                  </h5>
                  {toolsRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Keine Tools-Daten gefunden</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ["Status", str(tools["Tools"]) || "—"],
                        ["Version", str(tools["Tools Version"]) || "—"],
                        ["Required Version", str(tools["Required Version"]) || "—"],
                        ["Upgradeable", boolLabel(tools["Upgradeable"])],
                        ["Upgrade Policy", str(tools["Upgrade Policy"]) || "—"],
                        ["App status", str(tools["App status"]) || "—"],
                        ["Heartbeat", str(tools["Heartbeat status"]) || "—"],
                        ["Operation Ready", str(tools["Operation Ready"]) || "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded bg-muted/40 px-2 py-1.5">
                          <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                          <p className="font-mono-data">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Camera className="h-3.5 w-3.5" /> Snapshots ({snapshotSummary.snapshotCount})
                  </h5>
                  <div className="mb-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                    <span className="text-muted-foreground">Total Size: </span>
                    <span className="font-mono-data">{formatBytes(snapshotSummary.totalSizeMiB)}</span>
                  </div>
                  {sortedSnapshots.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Keine Snapshot-Daten gefunden</p>
                  ) : (
                    <div className="space-y-2">
                      {sortedSnapshots.map((row) => (
                        <div key={sheetRowKey(row, str(row.data["Name"]))} className="rounded bg-muted/40 px-2 py-1.5 text-xs">
                          <p className="font-medium truncate" title={str(row.data["Name"])}>
                            {str(row.data["Name"]) || "Unnamed Snapshot"}
                          </p>
                          <p className="text-muted-foreground">
                            {formatRvtoolsDate(row.data["Date / time"])} · {formatBytes(toNumber(row.data["Size MiB (total)"]))}
                          </p>
                          <p className="text-muted-foreground">
                            State: {str(row.data["State"]) || "—"} · Quiesced: {boolLabel(row.data["Quiesced"])}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
