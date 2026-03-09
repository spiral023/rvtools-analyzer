import { useCallback, useReducer, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSnapshots, deleteSnapshot, deleteAllData } from "@/data/db";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import type { ImportProgress } from "@/domain/services/importService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { ImportResult } from "@/domain/models/types";

export default function UploadSnapshots() {
  type UploadState = {
    importing: boolean;
    dragOver: boolean;
    lastResult: ImportResult | null;
    deleteAllOpen: boolean;
    progress: ImportProgress | null;
  };
  type UploadAction =
    | { type: "set-importing"; value: boolean }
    | { type: "set-drag-over"; value: boolean }
    | { type: "set-last-result"; value: ImportResult | null }
    | { type: "set-delete-all-open"; value: boolean }
    | { type: "set-progress"; value: ImportProgress | null };

  const uploadReducer = (state: UploadState, action: UploadAction): UploadState => {
    switch (action.type) {
      case "set-importing":
        return { ...state, importing: action.value };
      case "set-drag-over":
        return { ...state, dragOver: action.value };
      case "set-last-result":
        return { ...state, lastResult: action.value };
      case "set-delete-all-open":
        return { ...state, deleteAllOpen: action.value };
      case "set-progress":
        return { ...state, progress: action.value };
      default:
        return state;
    }
  };

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = "snapshot-upload-input";
  const [uploadState, dispatch] = useReducer(uploadReducer, {
    importing: false,
    dragOver: false,
    lastResult: null,
    deleteAllOpen: false,
    progress: null,
  });
  const { importing, dragOver, lastResult, deleteAllOpen, progress } = uploadState;

  const { data: snapshots = [], refetch } = useQuery({
    queryKey: ["snapshots"],
    queryFn: () => getSnapshots().then((s) => s.sort((a, b) => b.importedAt.localeCompare(a.importedAt))),
  });

  const invalidateAll = useCallback(() => { queryClient.invalidateQueries(); refetch(); }, [queryClient, refetch]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const xlsxFiles = Array.from(files).filter((f) =>
      f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    if (xlsxFiles.length === 0) { toast.error("Keine gültige XLSX-Datei ausgewählt."); return; }
    dispatch({ type: "set-importing", value: true });
    for (const file of xlsxFiles) {
      try {
        dispatch({ type: "set-progress", value: { step: "Vorbereitung", percent: 0, detail: file.name } });
        const result = await importRvtoolsXlsx(file, (nextProgress) => dispatch({ type: "set-progress", value: nextProgress }));
        dispatch({ type: "set-last-result", value: result });
        const kindLabel = result.fileKind === "tech-info" ? "Tech-Info" : "RVTools";
        if (result.success) toast.success(`"${file.name}" (${kindLabel}) erfolgreich importiert.`);
        else toast.error(`Fehler bei "${file.name}" (${kindLabel}): ${result.errors.join(", ")}`);
      } catch (err) {
        toast.error(`Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    dispatch({ type: "set-importing", value: false });
    dispatch({ type: "set-progress", value: null });
    invalidateAll();
  }, [invalidateAll]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dispatch({ type: "set-drag-over", value: false });
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    await deleteSnapshot(snapshotId);
    toast.success("Snapshot gelöscht.");
    invalidateAll();
  }, [invalidateAll]);

  const handleDeleteAll = useCallback(async () => {
    await deleteAllData();
    dispatch({ type: "set-delete-all-open", value: false });
    toast.success("Alle lokalen Daten wurden gelöscht.");
    invalidateAll();
  }, [invalidateAll]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Uploads & Snapshots</h1>
        <Dialog open={deleteAllOpen} onOpenChange={(open) => dispatch({ type: "set-delete-all-open", value: open })}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />Alle Daten löschen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alle lokalen Daten löschen?</DialogTitle>
              <DialogDescription>Dies löscht alle importierten Snapshots, Analysedaten und gespeicherten Einstellungen unwiderruflich aus Ihrem Browser.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => dispatch({ type: "set-delete-all-open", value: false })}>Abbrechen</Button>
              <Button variant="destructive" onClick={handleDeleteAll}>Endgültig löschen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <label
        htmlFor={fileInputId}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border/60 bg-card/30 hover:border-primary/40"}`}
        onDragOver={(e) => { e.preventDefault(); dispatch({ type: "set-drag-over", value: true }); }}
        onDragLeave={() => dispatch({ type: "set-drag-over", value: false })}
        onDrop={handleDrop}
      >
        <input id={fileInputId} ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple disabled={importing} className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        {importing ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
        <p className="mt-3 text-sm font-medium">{importing ? "Import läuft..." : "RVTools oder Tech-Info XLSX-Datei hierher ziehen oder klicken"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Mehrere Dateien und wiederholte Uploads pro vCenter möglich</p>
      </label>

      {/* Progress bar during import */}
      {importing && progress && (
        <Card className="animate-fade-in border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">{progress.step}</span>
              <span className="text-muted-foreground tabular-nums">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className="h-2" />
            {progress.detail && (
              <p className="text-xs text-muted-foreground">{progress.detail}</p>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && !importing && (
        <Card className="animate-fade-in">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {lastResult.success ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
              <span className="font-semibold text-sm">{lastResult.success ? "Import erfolgreich" : "Import fehlgeschlagen"}</span>
              {lastResult.fileKind && <span className="text-xs text-muted-foreground">({lastResult.fileKind === "tech-info" ? "Tech-Info" : "RVTools"})</span>}
            </div>
            {lastResult.sheetStats && (
              <p className="text-xs text-muted-foreground mb-2">
                {Object.keys(lastResult.sheetStats).length} Sheets erkannt, {Object.values(lastResult.sheetStats).reduce((s, v) => s + v.rowCount, 0).toLocaleString("de-DE")} Zeilen
              </p>
            )}
            {lastResult.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {lastResult.warnings.slice(0, 10).map((warning) => (
                  <div key={warning} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /><span>{warning}</span></div>
                ))}
                {lastResult.warnings.length > 10 && <p className="text-xs text-muted-foreground">...und {lastResult.warnings.length - 10} weitere Warnungen</p>}
              </div>
            )}
            {lastResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {lastResult.errors.map((error) => (
                  <div key={error} className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /><span>{error}</span></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gespeicherte Snapshots ({snapshots.length})</h2>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Snapshots importiert.</p>
        ) : (
          <div className="space-y-2">
            {snapshots.map((s) => (
              <Card key={s.snapshotId} className="group">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{s.fileName}</p>
                      <p className="text-xs text-muted-foreground">vCenter: {s.vcenterDisplayName} · Export: {new Date(s.exportTs).toLocaleString("de-DE")} · Import: {new Date(s.importedAt).toLocaleString("de-DE")}</p>
                      <p className="text-xs text-muted-foreground">{Object.keys(s.sheetStats).length} Sheets, {Object.values(s.sheetStats).reduce((sum, v) => sum + v.rowCount, 0).toLocaleString("de-DE")} Zeilen</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all" onClick={() => handleDeleteSnapshot(s.snapshotId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
