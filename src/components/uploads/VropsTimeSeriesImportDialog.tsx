import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileClock, ListChecks, Loader2, Upload } from "lucide-react";
import type { SnapshotMeta } from "@/domain/models/types";
import {
  importVropsTimeSeriesFileSet,
  type VropsTimeSeriesGridDiagnostic,
  type VropsTimeSeriesImportProgress,
  type VropsTimeSeriesImportResult,
} from "@/domain/services/vropsTimeSeriesImportService";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

interface VropsTimeSeriesImportDialogProps {
  snapshots: SnapshotMeta[];
  onImported: () => void;
  prefilledFiles?: Partial<Record<FileSlot, File>>;
  prefillRequest?: number;
}

type FileSlot = "vm" | "cluster" | "host";
type ImportLogSeverity = "info" | "success" | "warning" | "error";

interface ImportLogEntry {
  id: number;
  severity: ImportLogSeverity;
  message: string;
  detail?: string;
}

const FILE_LABELS: Record<FileSlot, string> = {
  vm: "VM-Zeitreihe",
  cluster: "Cluster-Zeitreihe",
  host: "Host-Zeitreihe",
};

const GRID_LABELS: Record<FileSlot, string> = {
  vm: "VM",
  cluster: "Cluster",
  host: "Host",
};

const GRID_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Vienna",
  dateStyle: "short",
  timeStyle: "short",
});

function formatGridTimestamp(timestamp?: number) {
  return timestamp === undefined ? "–" : GRID_DATE_FORMATTER.format(new Date(timestamp));
}

function formatGridComparison(diagnostic: VropsTimeSeriesGridDiagnostic) {
  if (diagnostic.objectType === "vm") return "Referenz";
  if (diagnostic.missingFromVmCount === 0 && diagnostic.additionalToVmCount === 0) return "passt";
  const samples = [
    diagnostic.missingFromVmSamples.length > 0 ? `fehlt: ${diagnostic.missingFromVmSamples.map(formatGridTimestamp).join(", ")}` : "",
    diagnostic.additionalToVmSamples.length > 0 ? `zusätzlich: ${diagnostic.additionalToVmSamples.map(formatGridTimestamp).join(", ")}` : "",
  ].filter(Boolean);
  return `${diagnostic.missingFromVmCount} fehlend · ${diagnostic.additionalToVmCount} zusätzlich${samples.length > 0 ? ` (${samples.join("; ")})` : ""}`;
}

export function VropsTimeSeriesImportDialog({ snapshots, onImported, prefilledFiles, prefillRequest = 0 }: VropsTimeSeriesImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [files, setFiles] = useState<Partial<Record<FileSlot, File>>>({});
  const [progress, setProgress] = useState<VropsTimeSeriesImportProgress | null>(null);
  const [result, setResult] = useState<VropsTimeSeriesImportResult | null>(null);
  const [logEntries, setLogEntries] = useState<ImportLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const fileRefs = useRef<Partial<Record<FileSlot, HTMLInputElement | null>>>({});
  const handledPrefillRequest = useRef(0);
  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((left, right) => right.exportTs.localeCompare(left.exportTs)),
    [snapshots],
  );
  const selectedSnapshots = sortedSnapshots.filter((snapshot) => snapshotIds.includes(snapshot.snapshotId));
  const ready = Boolean(snapshotIds.length > 0 && files.vm && files.cluster && files.host && !running);

  const appendLog = (severity: ImportLogSeverity, message: string, detail?: string) => {
    setLogEntries((current) => [...current, { id: current.length + 1, severity, message, detail }]);
  };

  useEffect(() => {
    if (prefillRequest === 0 || prefillRequest === handledPrefillRequest.current || !prefilledFiles) return;
    handledPrefillRequest.current = prefillRequest;
    setFiles((current) => ({ ...current, ...prefilledFiles }));
    setProgress(null);
    setResult(null);
    setLogEntries([]);
    setOpen(true);
  }, [prefilledFiles, prefillRequest]);

  const reset = () => {
    setSnapshotIds([]);
    setFiles({});
    setProgress(null);
    setResult(null);
    setLogEntries([]);
    for (const input of Object.values(fileRefs.current)) {
      if (input) input.value = "";
    }
  };

  const onOpenChange = (nextOpen: boolean) => {
    if (!running && !nextOpen) reset();
    setOpen(nextOpen);
  };

  const runImport = async () => {
    if (!files.vm || !files.cluster || !files.host || snapshotIds.length === 0) return;
    setRunning(true);
    setResult(null);
    setLogEntries([{ id: 1, severity: "info", message: "Dateisatz zur Prüfung übergeben", detail: `${files.vm.name} · ${files.cluster.name} · ${files.host.name}` }]);
    try {
      const nextResult = await importVropsTimeSeriesFileSet(files as Record<FileSlot, File>, snapshotIds, (nextProgress) => {
        setProgress(nextProgress);
        appendLog("info", nextProgress.step, nextProgress.detail);
      });
      setResult(nextResult);
      nextResult.warnings.forEach((message) => appendLog("warning", message));
      nextResult.errors.forEach((message) => appendLog("error", message));
      if (nextResult.success) {
        appendLog("success", "Dateisatz vollständig lokal gespeichert", nextResult.importId ? `Import-ID: ${nextResult.importId}` : undefined);
        onImported();
      } else {
        appendLog("error", "Import nicht gespeichert");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ success: false, warnings: [], errors: [message] });
      appendLog("error", "Import unerwartet abgebrochen", message);
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain">
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
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">RVTools-Snapshots / vCenter-Scopes</legend>
              <p className="text-xs text-muted-foreground">Bei gemeinsam exportierten Zeitreihen alle zugehörigen vCenter-Snapshots auswählen.</p>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border bg-muted/15 p-3">
                {sortedSnapshots.map((snapshot) => {
                  const inputId = `vrops-timeseries-snapshot-${snapshot.snapshotId}`;
                  const selected = snapshotIds.includes(snapshot.snapshotId);
                  return <label key={snapshot.snapshotId} htmlFor={inputId} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      aria-label={`${snapshot.vcenterDisplayName} auswählen`}
                      checked={selected}
                      disabled={running}
                      onChange={(event) => setSnapshotIds((current) => event.target.checked ? [...current, snapshot.snapshotId] : current.filter((id) => id !== snapshot.snapshotId))}
                    />
                    <span><span className="font-medium">{snapshot.vcenterDisplayName}</span><span className="text-muted-foreground"> · {new Date(snapshot.exportTs).toLocaleString("de-DE")}</span></span>
                  </label>;
                })}
              </div>
              {selectedSnapshots.length > 0 && <p className="text-xs text-muted-foreground">{selectedSnapshots.length.toLocaleString("de-DE")} vCenter-Scope{selectedSnapshots.length === 1 ? "" : "s"} gewählt: {selectedSnapshots.map((snapshot) => snapshot.vcenterId).join(" · ")}</p>}
            </fieldset>

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
                    onChange={(event) => {
                      setFiles((current) => ({ ...current, [slot]: event.target.files?.[0] }));
                      setResult(null);
                      setLogEntries([]);
                    }}
                  />
                  <Label className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-accent" htmlFor={`vrops-timeseries-${slot}`}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> CSV wählen
                  </Label>
                </div>
              ))}
            </div>

            <p className={`rounded-md border px-3 py-2 text-xs ${ready ? "border-success/30 bg-success/5 text-success" : "border-border/70 bg-muted/20 text-muted-foreground"}`} role="status">
              {running ? "Dateisatz wird im Worker geprüft. Der Fortschritt zeigt die aktuell verarbeiteten CSV-Zeilen." : ready ? "Dateisatz vollständig. Mit „Dateisatz prüfen und speichern“ wird er lokal gespeichert und danach in Planung › Fill up auswählbar." : "Für den Speichervorgang werden mindestens ein RVTools-Snapshot sowie je eine VM-, Cluster- und Host-CSV benötigt."}
            </p>

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
                {!result.success && result.errors.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-destructive" aria-label="Importfehler">
                    {result.errors.map((error) => <li key={error}>• {error}</li>)}
                  </ul>
                )}
                {result.qualitySummary && <p className="mt-2 text-xs text-muted-foreground">{result.qualitySummary.expectedSlots} Stunden · {result.qualitySummary.objectCountByType.vm} VMs · {result.qualitySummary.objectCountByType.cluster} Cluster · {result.qualitySummary.objectCountByType.host} Hosts</p>}
                {result.success && <p className="mt-2 text-xs text-muted-foreground">Der Import ist jetzt im Auswahlfeld „Zeitreihenimport“ unter Planung › Fill up verfügbar.</p>}
                {result.gridDiagnostics && (
                  <div className="mt-3 rounded-md border border-border/70 bg-background/50 p-2.5 text-xs" aria-label="Stundenraster-Details">
                    <p className="font-medium">Stundenraster-Details</p>
                    <div className="mt-2 space-y-2">
                      {result.gridDiagnostics.map((diagnostic) => (
                        <div key={diagnostic.objectType} className="grid gap-0.5 border-l-2 border-muted-foreground/30 pl-2">
                          <p className="font-medium">{GRID_LABELS[diagnostic.objectType]} · {diagnostic.slotCount.toLocaleString("de-DE")} Zeitpunkte</p>
                          <p className="text-muted-foreground">{formatGridTimestamp(diagnostic.rangeStartUtc)} – {formatGridTimestamp(diagnostic.rangeEndUtc)}</p>
                          <p className={diagnostic.missingHourlySlots > 0 || diagnostic.missingFromVmCount > 0 || diagnostic.additionalToVmCount > 0 ? "text-destructive" : "text-muted-foreground"}>
                            {diagnostic.missingHourlySlots > 0 ? `${diagnostic.missingHourlySlots.toLocaleString("de-DE")} Rasterlücke(n) · ` : ""}Abgleich mit VM: {formatGridComparison(diagnostic)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {logEntries.length > 0 && (
              <details className="rounded-lg border bg-muted/15 p-3" open={!result?.success} aria-label="vROps-Importprotokoll">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4 text-primary" />Importprotokoll · {logEntries.length} Einträge</summary>
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto border-l pl-3 text-xs">
                  {logEntries.map((entry) => <li key={entry.id} className={entry.severity === "error" ? "text-destructive" : entry.severity === "warning" ? "text-warning" : entry.severity === "success" ? "text-success" : "text-muted-foreground"}><p className="font-medium">{entry.message}</p>{entry.detail && <p className="mt-0.5 break-words text-muted-foreground">{entry.detail}</p>}</li>)}
                </ol>
              </details>
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
