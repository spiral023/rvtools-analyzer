import { useEffect, useMemo, useState } from "react";
import { Boxes, CheckSquare, Database, FileArchive, Server, X } from "lucide-react";
import type { DiscoveredSysvPackage } from "@/lib/export/sysvDataPackageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const SCOPE_LABELS: Record<DiscoveredSysvPackage["manifest"]["scope"]["kind"], string> = {
  person: "Person",
  department: "Abteilung",
  area: "Bereich",
};

export interface SysvPackageSelectionDialogProps {
  open: boolean;
  packages: DiscoveredSysvPackage[];
  onCancel: () => void;
  onConfirm: (packages: DiscoveredSysvPackage[]) => void;
}
export function SysvPackageSelectionDialog({ open, packages, onCancel, onConfirm }: SysvPackageSelectionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(packages.map((item) => item.manifest.packageId)));

  useEffect(() => {
    if (open) setSelectedIds(new Set(packages.map((item) => item.manifest.packageId)));
  }, [open, packages]);

  const selectedPackages = useMemo(
    () => packages.filter((item) => selectedIds.has(item.manifest.packageId)),
    [packages, selectedIds],
  );
  const upperBoundVmCount = selectedPackages.reduce((sum, item) => sum + item.manifest.counts.vms, 0);
  const upperBoundVcenterCount = selectedPackages.reduce((sum, item) => sum + item.manifest.counts.vcenters, 0);
  const upperBoundSnapshotCount = selectedPackages.reduce((sum, item) => sum + item.manifest.counts.snapshots, 0);

  const toggle = (packageId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(packageId)) next.delete(packageId);
      else next.add(packageId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>SysV-Pakete für den Import auswählen</DialogTitle>
          <DialogDescription>
            Die Auswahl wird als eine neue, atomare Vereinigung importiert. Pakete aus unterschiedlichen Exportständen werden vor dem Schreiben abgelehnt.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3" aria-label="Vorschau der Paketvereinigung">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Server className="size-3.5" />VM-Obergrenze</div>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">bis zu {upperBoundVmCount.toLocaleString("de-DE")}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="size-3.5" />vCenter</div>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">bis zu {upperBoundVcenterCount.toLocaleString("de-DE")}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="size-3.5" />Snapshots</div>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">bis zu {upperBoundSnapshotCount.toLocaleString("de-DE")}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2 text-xs text-muted-foreground">
          <span>Die Obergrenzen zählen Überschneidungen mehrfach; die exakte Union wird nach der Validierung berechnet.</span>
          <Badge variant="secondary" className="shrink-0 tabular-nums">{selectedPackages.length}/{packages.length}</Badge>
        </div>

        <ScrollArea className="max-h-[22rem] rounded-lg border">
          <div className="divide-y">
            {packages.map((item) => {
              const packageId = item.manifest.packageId;
              const selected = selectedIds.has(packageId);
              return (
                <label key={packageId} className="flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/30">
                  <Checkbox checked={selected} onCheckedChange={() => toggle(packageId)} className="mt-0.5" aria-label={`${item.manifest.scope.displayName} auswählen`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.manifest.scope.displayName}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{SCOPE_LABELS[item.manifest.scope.kind]}</Badge>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{item.manifest.counts.vms.toLocaleString("de-DE")} VMs</span>
                    </div>
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <FileArchive className="mt-0.5 size-3.5 shrink-0" />
                      <span className="break-all">{item.path}</span>
                    </div>
                  </div>
                  {selected && <CheckSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} className="gap-2"><X className="size-4" />Abbrechen</Button>
          <Button type="button" onClick={() => onConfirm(selectedPackages)} disabled={selectedPackages.length === 0} className="gap-2"><CheckSquare className="size-4" />{selectedPackages.length} Paket{selectedPackages.length === 1 ? "" : "e"} importieren</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
