import { useMemo } from "react";
import { Monitor, Copy } from "lucide-react";
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
import { matchRowsForVm } from "@/lib/vmDetail";
import { compactValue, statusTextClass } from "@/lib/vmDetailFormat";
import { VmTechnicalSections } from "@/components/vm/VmTechnicalSections";

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
          snapshotRows,
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
