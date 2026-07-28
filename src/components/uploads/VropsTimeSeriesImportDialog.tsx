import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileClock, Loader2, Upload } from "lucide-react";
import type { SnapshotMeta } from "@/domain/models/types";
import { importVropsTimeSeriesFileSet, type VropsTimeSeriesImportProgress, type VropsTimeSeriesImportResult } from "@/domain/services/vropsTimeSeriesImportService";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

interface VropsTimeSeriesImportDialogProps {
  snapshots: SnapshotMeta[];
  onImported: () => void;
}

type FileSlot = "vm" | "cluster" | "host";

const FILE_LABELS: Record<FileSlot, string> = {
  vm: "VM-Zeitreihe",
  cluster: "Cluster-Zeitreihe",
  host: "Host-Zeitreihe",
};

export function VropsTimeSeriesImportDialog({ snapshots, onImported }: VropsTimeSeriesImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [snapshotId, setSnapshotId] = useState("");
  const [files, setFiles] = useState<Partial<Record<FileSlot, File>>>({});
  const [progress, setProgress] = useState<VropsTimeSeriesImportProgress | null>(null);
  const [result, setResult] = useState<VropsTimeSeriesImportResult | null>(null);
  const [running, setRunning] = useState(false);
  const fileRefs = useRef<Partial<Record<FileSlot, HTMLInputElement | null>>>({});
  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((left, right) => right.exportTs.localeCompare(left.exportTs)),
    [snapshots],
  );
  const selectedSnapshot = sortedSnapshots.find((snapshot) => snapshot.snapshotId === snapshotId);
  const ready = Boolean(snapshotId && files.vm && files.cluster && files.host && !running);

  const reset = () => {
    setSnapshotId("");
    setFiles({});
    setProgress(null);
    setResult(null);
    for (const input of Object.values(fileRefs.current)) {
      if (input) input.value = "";
    }
  };

  const onOpenChange = (nextOpen: boolean) => {
    if (!running && !nextOpen) reset();
    setOpen(nextOpen);
  };

  const runImport = async () => {
    if (!files.vm || !files.cluster || !files.host || !snapshotId) return;
    setRunning(true);
    setResult(null);
    try {
      const nextResult = await importVropsTimeSeriesFileSet(files as Record<FileSlot, File>, [snapshotId], setProgress);
      setResult(nextResult);
      if (nextResult.success) onImported();
    } catch (error) {
      setResult({ success: false, warnings: [], errors: [error instanceof Error ? error.message : String(error)] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={snapshots.length === 0}>
          <FileClock className="mr-2 h-4 w-4" />
          vROps-Zeitreihen importieren
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>vROps-Zeitreihen importieren</DialogTitle>
          <DialogDescription>
            Ein Dateisatz besteht aus genau einer VM-, Cluster- und Host-CSV. Die Werte bleiben ausschließlich lokal in IndexedDB.
          </DialogDescription>
        </DialogHeader>

        {snapshots.length === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">Zuerst einen RVTools-Snapshot importieren, damit der vCenter-Scope eingefroren werden kann.</p>
        ) : (
          <div className="space-y-5 py-1">
            <div className="space-y-2">
              <Label htmlFor="vrops-timeseries-snapshot">RVTools-Snapshot / vCenter-Scope</Label>
              <select
                id="vrops-timeseries-snapshot"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={snapshotId}
                disabled={running}
                onChange={(event) => setSnapshotId(event.target.value)}
              >
                <option value="">Snapshot auswählen …</option>
                {sortedSnapshots.map((snapshot) => (
                  <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                    {snapshot.vcenterDisplayName} · {new Date(snapshot.exportTs).toLocaleString("de-DE")}
                  </option>
                ))}
              </select>
              {selectedSnapshot && <p className="text-xs text-muted-foreground">{selectedSnapshot.vcenterId} · Export {new Date(selectedSnapshot.exportTs).toLocaleString("de-DE")}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["vm", "cluster", "host"] as const).map((slot) => (
                <div key={slot} className={`rounded-lg border p-3 transition-colors ${files[slot] ? "border-primary/40 bg-primary/5" : "border-border/70 bg-muted/20"}`}>
                  <p className="text-sm font-medium">{FILE_LABELS[slot]}</p>
                  <p className="mt-1 min-h-8 break-all text-xs text-muted-foreground">{files[slot]?.name ?? "Noch keine CSV gewählt"}</p>
                  <input
                    ref={(node) => { fileRefs.current[slot] = node; }}
                    className="sr-only"
                    id={`vrops-timeseries-${slot}`}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={running}
                    onChange={(event) => setFiles((current) => ({ ...current, [slot]: event.target.files?.[0] }))}
                  />
                  <Label className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-accent" htmlFor={`vrops-timeseries-${slot}`}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> CSV wählen
                  </Label>
                </div>
              ))}
            </div>

            {progress && (
              <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                <div className="flex justify-between gap-4 text-sm"><span className="font-medium text-primary">{progress.step}</span><span className="tabular-nums text-muted-foreground">{progress.percent}%</span></div>
                <Progress value={progress.percent} className="h-2" />
                {progress.detail && <p className="text-xs text-muted-foreground">{progress.detail}</p>}
              </div>
            )}

            {result && (
              <div className={`rounded-lg border p-3 ${result.success ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-center gap-2 text-sm font-medium">{result.success ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}{result.success ? "Dateisatz lokal gespeichert" : "Import nicht gespeichert"}</div>
                {result.qualitySummary && <p className="mt-2 text-xs text-muted-foreground">{result.qualitySummary.expectedSlots} Stunden · {result.qualitySummary.objectCountByType.vm} VMs · {result.qualitySummary.objectCountByType.cluster} Cluster · {result.qualitySummary.objectCountByType.host} Hosts</p>}
                {[...result.errors, ...result.warnings].slice(0, 8).map((message) => <p key={message} className="mt-1 text-xs text-muted-foreground">{message}</p>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Abbrechen</Button>
          <Button onClick={runImport} disabled={!ready}>{running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Dateisatz prüfen und speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
