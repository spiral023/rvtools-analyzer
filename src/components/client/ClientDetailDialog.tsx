import { useMemo } from "react";
import {
  MonitorSmartphone,
  Cpu,
  Network as NetworkIcon,
  History,
  Server,
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
import type { NormalizedVm, SheetRow, TechInfoClientLatest } from "@/domain/models/types";
import { buildClientDetailMarkdown } from "@/lib/detailMarkdown";
import { formatIsoDateTime } from "@/lib/clientDetail";
import { matchRowsForVm } from "@/lib/vmDetail";
import { compactValue } from "@/lib/vmDetailFormat";
import { VmTechnicalSections } from "@/components/vm/VmTechnicalSections";

interface ClientDetailDialogProps {
  client: TechInfoClientLatest | null;
  vm: NormalizedVm | null;
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

export function ClientDetailDialog({
  client,
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
}: ClientDetailDialogProps) {
  const cpuRows = useMemo(() => matchRowsForVm(rawCpuRows, vm), [rawCpuRows, vm]);
  const memoryRows = useMemo(() => matchRowsForVm(rawMemoryRows, vm), [rawMemoryRows, vm]);
  const diskRows = useMemo(() => matchRowsForVm(rawDiskRows, vm), [rawDiskRows, vm]);
  const partitionRows = useMemo(() => matchRowsForVm(rawPartitionRows, vm), [rawPartitionRows, vm]);
  const networkRows = useMemo(() => matchRowsForVm(rawNetworkRows, vm), [rawNetworkRows, vm]);
  const snapshotRows = useMemo(() => matchRowsForVm(rawSnapshotRows, vm), [rawSnapshotRows, vm]);
  const toolsRows = useMemo(() => matchRowsForVm(rawToolsRows, vm), [rawToolsRows, vm]);

  if (!client) return null;

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildClientDetailMarkdown(client));
      toast.success("Client-Details als Markdown kopiert.");
    } catch {
      toast.error("Client-Details konnten nicht kopiert werden.");
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
          aria-label="Client-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MonitorSmartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold font-mono-data truncate">
                {client.clientName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                {[client.standort, client.cluster, client.vcenter].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Pool: {compactValue(client.poolName)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  OS: {compactValue(client.os)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  User: {compactValue(client.user)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Monitoring: {compactValue(client.monitoring)}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <MonitorSmartphone className="h-3.5 w-3.5" /> Basis & Identität
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["BLZ", compactValue(client.blz)],
                  ["Standort", compactValue(client.standort)],
                  ["Site", compactValue(client.site)],
                  ["Cluster", compactValue(client.cluster)],
                  ["vCenter", compactValue(client.vcenter)],
                  ["Domäne", compactValue(client.domain)],
                  ["Poolname", compactValue(client.poolName)],
                  ["User", compactValue(client.user)],
                  ["Insider", compactValue(client.insider)],
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
                <Cpu className="h-3.5 w-3.5" /> Hardware & System
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Hardware", compactValue(client.hardware)],
                  ["OS", compactValue(client.os)],
                  ["HW Änderungen", compactValue(client.hwChanges)],
                  ["Monitoring", compactValue(client.monitoring)],
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
                <NetworkIcon className="h-3.5 w-3.5" /> Netzwerk
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["IP", compactValue(client.ip)],
                  ["MAC Adresse", compactValue(client.macAddress)],
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
                <History className="h-3.5 w-3.5" /> Verwaltung
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Erstellt von", compactValue(client.createdBy)],
                  ["Erstellungsdatum", formatIsoDateTime(client.createdAt)],
                  ["Geändert von", compactValue(client.modifiedBy)],
                  ["Änderungsdatum", formatIsoDateTime(client.modifiedAt)],
                  ["Datenstand (Import)", formatIsoDateTime(client.importedAt)],
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
                <Server className="h-3.5 w-3.5" /> RVTools-Daten
              </h4>
              {vm ? (
                <div className="space-y-6">
                  <p className="text-xs text-muted-foreground">
                    Verknüpft mit VM <span className="font-mono-data text-foreground">{vm.vmName}</span>
                    {[vm.cluster, vm.host].filter(Boolean).length > 0
                      ? ` · ${[vm.cluster, vm.host].filter(Boolean).join(" · ")}`
                      : ""}
                  </p>
                  <VmTechnicalSections
                    vm={vm}
                    cpuRows={cpuRows}
                    memoryRows={memoryRows}
                    diskRows={diskRows}
                    partitionRows={partitionRows}
                    networkRows={networkRows}
                    snapshotRows={snapshotRows}
                    toolsRows={toolsRows}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Kein passendes System in den aktiven RVTools-Snapshots gefunden (kein VM-Name entspricht „{client.clientName}").
                </p>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
