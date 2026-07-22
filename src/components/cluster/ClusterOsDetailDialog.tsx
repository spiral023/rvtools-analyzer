import { useMemo } from "react";
import { Copy, MonitorCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildClusterOsDetailMarkdown } from "@/lib/detailMarkdown";
import { buildClusterOsDetailRows, type ClusterOsDistributionRow, type VmOsSource } from "@/lib/vmOsDistribution";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { NormalizedVm } from "@/domain/models/types";

interface ClusterOsDetailDialogProps {
  cluster: ClusterOsDistributionRow | null;
  vcenterDisplayName?: string;
  source: VmOsSource;
  vms: NormalizedVm[];
  open: boolean;
  onClose: () => void;
}

function sourceLabel(source: VmOsSource): string {
  return source === "tools" ? "According to VMware Tools" : "Configuration file";
}

export function ClusterOsDetailDialog({ cluster, vcenterDisplayName, source, vms, open, onClose }: ClusterOsDetailDialogProps) {
  const rows = useMemo(
    () => cluster ? buildClusterOsDetailRows(vms, source, cluster.clusterKey) : [],
    [cluster, source, vms],
  );
  const resolvedVcenterDisplayName = vcenterDisplayName?.trim() || cluster?.vcenterId || "vCenter unbekannt";

  const copyMarkdown = async () => {
    if (!cluster) return;
    try {
      await navigator.clipboard.writeText(buildClusterOsDetailMarkdown({
        cluster: cluster.cluster,
        vcenterDisplayName: resolvedVcenterDisplayName,
        datacenter: cluster.datacenter,
        sourceLabel: sourceLabel(source),
        rows,
      }));
      toast.success("OS-Details als Markdown kopiert.");
    } catch {
      toast.error("OS-Details konnten nicht kopiert werden.");
    }
  };

  if (!cluster) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyMarkdown()}
          className="absolute right-10 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="OS-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MonitorCog className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold">Betriebssysteme · {cluster.cluster}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {resolvedVcenterDisplayName} · {cluster.datacenter || "Datacenter unbekannt"} · {sourceLabel(source)}
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{formatNum(rows.reduce((sum, row) => sum + row.vmCount, 0))}</strong> VMs</span>
            <span><strong className="text-foreground">{formatNum(rows.length)}</strong> Betriebssysteme</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Keine VMs für diesen Cluster gefunden.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5 font-semibold">Betriebssystem</th>
                    <th className="px-3 py-2.5 font-semibold">VMs</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Anzahl</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.operatingSystem} className="border-b border-border/30 last:border-0 align-top">
                      <td className="px-3 py-2.5 font-medium">{row.operatingSystem}</td>
                      <td className="px-3 py-2.5 font-mono-data text-xs leading-relaxed">{row.vmNames.join(", ")}</td>
                      <td className="px-3 py-2.5 text-right font-mono-data">{formatNum(row.vmCount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono-data">{formatPct(row.clusterSharePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
