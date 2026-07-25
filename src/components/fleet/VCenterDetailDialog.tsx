import { Activity, AlertTriangle, Copy, HardDrive, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { buildVCenterDetailMarkdown } from "@/lib/detailMarkdown";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { NormalizedCluster, NormalizedDatastore, NormalizedHealth, SnapshotMeta } from "@/domain/models/types";
import type { VCenterSummary } from "@/pages/FleetCompare";

interface VCenterDetailDialogProps {
  summary: VCenterSummary | null;
  snapshot: SnapshotMeta | null;
  open: boolean;
  onClose: () => void;
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  health: NormalizedHealth[];
}

function boolLabel(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Ja" : "Nein";
}

function metricSeverity(value: number, warn: number, crit: number, inverted = false): string {
  const hot = inverted ? value <= crit : value >= crit;
  const warm = inverted ? value <= warn : value >= warn;
  if (hot) return "text-destructive font-semibold";
  if (warm) return "text-warning";
  return "text-success";
}

export function VCenterDetailDialog({
  summary,
  snapshot,
  open,
  onClose,
  clusters,
  datastores,
  health,
}: VCenterDetailDialogProps) {
  if (!summary) return null;

  const scopedClusters = clusters.filter((cluster) => cluster.snapshotId === summary.snapshotId);
  const scopedDatastores = datastores
    .filter((ds) => ds.snapshotId === summary.snapshotId)
    .slice()
    .sort((a, b) => (a.freePct ?? Number.POSITIVE_INFINITY) - (b.freePct ?? Number.POSITIVE_INFINITY));
  const scopedHealth = health.filter((event) => event.snapshotId === summary.snapshotId);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(
        buildVCenterDetailMarkdown(summary, snapshot, {
          clusters: scopedClusters,
          datastores: scopedDatastores,
          health: scopedHealth,
        }),
      );
      toast.success("vCenter-Details als Markdown kopiert.");
    } catch {
      toast.error("vCenter-Details konnten nicht kopiert werden.");
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
          aria-label="vCenter-Details als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold font-mono-data truncate">
                {summary.displayName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                {snapshot
                  ? `Export: ${new Date(snapshot.exportTs).toLocaleString("de-DE")} · Import: ${new Date(snapshot.importedAt).toLocaleString("de-DE")}`
                  : "Kein aktueller Snapshot"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${metricSeverity(summary.riskScore, 25, 50)}`}>
                  Risiko: {summary.riskScore}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${summary.healthIssues > 0 ? "text-warning" : "text-success"}`}>
                  Health Issues: {formatNum(summary.healthIssues)}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${summary.securityDrift > 0 ? "text-warning" : "text-success"}`}>
                  Security Drift: {formatNum(summary.securityDrift)}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Kennzahlen
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">VMs</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.vmCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Powered On</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.poweredOn)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Hosts</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.hostCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Cluster</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.clusterCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Datastores</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.datastoreCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total RAM</p>
                  <p className="text-sm font-bold font-mono-data">{summary.totalRamGiB.toFixed(0)} GiB</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Ø DS Frei</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(summary.avgDsFree, 25, 15, true)}`}>{formatPct(summary.avgDsFree)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">CPU Overcommit</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(summary.cpuOvercommit, 3, 5)}`}>{summary.cpuOvercommit.toFixed(1)}:1</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">VM-Snapshots</p>
                  <p className="text-sm font-bold font-mono-data">{formatNum(summary.snapshotCount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Security Drift</p>
                  <p className={`text-sm font-bold font-mono-data ${summary.securityDrift > 0 ? "text-warning" : "text-success"}`}>{formatNum(summary.securityDrift)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Health Issues</p>
                  <p className={`text-sm font-bold font-mono-data ${summary.healthIssues > 0 ? "text-warning" : "text-success"}`}>{formatNum(summary.healthIssues)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Risiko Score</p>
                  <p className={`text-sm font-bold font-mono-data ${metricSeverity(summary.riskScore, 25, 50)}`}>{summary.riskScore}</p>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Server className="h-3.5 w-3.5" /> Cluster ({scopedClusters.length})
              </h4>
              {scopedClusters.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Cluster in diesem vCenter gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Cluster</th>
                        <th className="py-2 pr-3">Datacenter</th>
                        <th className="py-2 pr-3">Hosts</th>
                        <th className="py-2 pr-3">HA</th>
                        <th className="py-2 pr-3">DRS</th>
                        <th className="py-2 pr-3">CPU Cores</th>
                        <th className="py-2 pr-3">RAM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedClusters.map((cluster) => (
                        <tr key={cluster.clusterKey} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{cluster.name}</td>
                          <td className="py-2 pr-3">{cluster.datacenter || "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatNum(cluster.numHosts)}</td>
                          <td className="py-2 pr-3">{boolLabel(cluster.haEnabled)}</td>
                          <td className="py-2 pr-3">{boolLabel(cluster.drsEnabled)}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatNum(cluster.numCpuCores)}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatBytes(cluster.totalMemoryMiB)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Datastores ({scopedDatastores.length})
              </h4>
              {scopedDatastores.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Datastores in diesem vCenter gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Datastore</th>
                        <th className="py-2 pr-3">Cluster</th>
                        <th className="py-2 pr-3">Typ</th>
                        <th className="py-2 pr-3">Kapazität</th>
                        <th className="py-2 pr-3">Frei</th>
                        <th className="py-2 pr-3">Frei %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedDatastores.slice(0, 25).map((ds) => (
                        <tr key={ds.dsKey} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{ds.name}</td>
                          <td className="py-2 pr-3">{ds.clusterName || "—"}</td>
                          <td className="py-2 pr-3">{ds.type || "—"}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatBytes(ds.capacityMiB)}</td>
                          <td className="py-2 pr-3 font-mono-data">{formatBytes(ds.freeMiB)}</td>
                          <td className={`py-2 pr-3 font-mono-data ${ds.freePct !== null && ds.freePct < 10 ? "text-destructive font-semibold" : ds.freePct !== null && ds.freePct < 20 ? "text-warning" : "text-success"}`}>
                            {formatPct(ds.freePct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Health-Events ({scopedHealth.length})
              </h4>
              {scopedHealth.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Health-Events in diesem vCenter gefunden</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Entity</th>
                        <th className="py-2 pr-3">Typ</th>
                        <th className="py-2 pr-3">Meldung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedHealth.slice(0, 25).map((event, index) => (
                        <tr key={`${event.entity}-${index}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3 font-mono-data font-semibold">{event.entity || "—"}</td>
                          <td className="py-2 pr-3">{event.messageType || "—"}</td>
                          <td className="py-2 pr-3">{event.message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
