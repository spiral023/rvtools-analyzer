import { useCallback, useReducer, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSnapshots, deleteSnapshot, deleteAllData, getTechInfoImports, deleteTechInfoImport,
  getTechInfoClientImports, deleteTechInfoClientImport,
  estimateSnapshotSizesBytes, estimateTechInfoImportSizesBytes, estimateTechInfoClientImportSizesBytes,
} from "@/data/db";
import type { DeleteProgress, DeleteProgressCallback } from "@/data/db";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import type { ImportProgress } from "@/domain/services/importService";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, AlertTriangle, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ImportFileKind, ImportResult, SnapshotMeta, TechInfoImportMeta, TechInfoClientImportMeta } from "@/domain/models/types";

type StoredUpload =
  | { kind: "rvtools"; id: string; importedAt: string; snapshot: SnapshotMeta }
  | { kind: "tech-info"; id: string; importedAt: string; techInfo: TechInfoImportMeta }
  | { kind: "tech-info-client"; id: string; importedAt: string; techInfoClient: TechInfoClientImportMeta };

function fileKindLabel(kind: ImportFileKind | undefined): string {
  if (kind === "tech-info") return "Tech-Info Server";
  if (kind === "tech-info-client") return "Tech-Info Client";
  return "RVTools";
}

type UploadState = {
  importing: boolean;
  dragOver: boolean;
  lastResult: ImportResult | null;
  deleteAllOpen: boolean;
  progress: ImportProgress | null;
  deleting: boolean;
  deleteProgress: DeleteProgress | null;
};

type UploadAction =
  | { type: "set-importing"; value: boolean }
  | { type: "set-drag-over"; value: boolean }
  | { type: "set-last-result"; value: ImportResult | null }
  | { type: "set-delete-all-open"; value: boolean }
  | { type: "set-progress"; value: ImportProgress | null }
  | { type: "set-deleting"; value: boolean }
  | { type: "set-delete-progress"; value: DeleteProgress | null };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
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
    case "set-deleting":
      return { ...state, deleting: action.value };
    case "set-delete-progress":
      return { ...state, deleteProgress: action.value };
    default:
      return state;
  }
}

function buildStoredUploads(
  snapshots: SnapshotMeta[],
  techInfoImports: TechInfoImportMeta[],
  techInfoClientImports: TechInfoClientImportMeta[],
): StoredUpload[] {
  const uploads: StoredUpload[] = [];
  for (const snapshot of snapshots) {
    uploads.push({ kind: "rvtools", id: snapshot.snapshotId, importedAt: snapshot.importedAt, snapshot });
  }
  for (const techInfo of techInfoImports) {
    uploads.push({ kind: "tech-info", id: techInfo.techInfoImportId, importedAt: techInfo.importedAt, techInfo });
  }
  for (const techInfoClient of techInfoClientImports) {
    uploads.push({ kind: "tech-info-client", id: techInfoClient.techInfoClientImportId, importedAt: techInfoClient.importedAt, techInfoClient });
  }
  return uploads.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

function useUploadSnapshotsView() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = "snapshot-upload-input";
  const [uploadState, dispatch] = useReducer(uploadReducer, {
    importing: false,
    dragOver: false,
    lastResult: null,
    deleteAllOpen: false,
    progress: null,
    deleting: false,
    deleteProgress: null,
  });
  const { importing, dragOver, lastResult, deleteAllOpen, progress, deleting, deleteProgress } = uploadState;

  const { data: uploads = [], refetch } = useQuery({
    queryKey: ["storedUploads"],
    queryFn: async () => {
      const [snapshots, techInfoImports, techInfoClientImports] = await Promise.all([
        getSnapshots(),
        getTechInfoImports(),
        getTechInfoClientImports(),
      ]);
      return buildStoredUploads(snapshots, techInfoImports, techInfoClientImports);
    },
  });

  const uploadIdsKey = uploads.map((u) => `${u.kind}:${u.id}`).join("|");
  const { data: uploadSizes } = useQuery({
    queryKey: ["uploadSizes", uploadIdsKey],
    enabled: uploads.length > 0,
    queryFn: async () => {
      const uploadIdsByKind = uploads.reduce<Record<StoredUpload["kind"], string[]>>(
        (acc, upload) => {
          acc[upload.kind].push(upload.id);
          return acc;
        },
        { rvtools: [], "tech-info": [], "tech-info-client": [] },
      );
      const [rvtools, techInfo, techInfoClient] = await Promise.all([
        estimateSnapshotSizesBytes(uploadIdsByKind.rvtools),
        estimateTechInfoImportSizesBytes(uploadIdsByKind["tech-info"]),
        estimateTechInfoClientImportSizesBytes(uploadIdsByKind["tech-info-client"]),
      ]);
      return { rvtools, "tech-info": techInfo, "tech-info-client": techInfoClient } satisfies Record<StoredUpload["kind"], Record<string, number>>;
    },
  });
  const totalSizeBytes = uploadSizes
    ? Object.values(uploadSizes).reduce((sum, byId) => sum + Object.values(byId).reduce((s, b) => s + b, 0), 0)
    : null;

  const invalidateAll = useCallback(() => { queryClient.invalidateQueries(); refetch(); }, [queryClient, refetch]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const xlsxFiles = Array.from(files).filter((f) =>
      f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    if (xlsxFiles.length === 0) { toast.error("Keine gültige XLSX-Datei ausgewählt."); return; }
    dispatch({ type: "set-importing", value: true });
    const importFileAt = async (index: number): Promise<void> => {
      const file = xlsxFiles[index];
      if (!file) return;
      try {
        dispatch({ type: "set-progress", value: { step: "Vorbereitung", percent: 0, detail: file.name } });
        const result = await importRvtoolsXlsx(file, (nextProgress) => dispatch({ type: "set-progress", value: nextProgress }));
        dispatch({ type: "set-last-result", value: result });
        const kindLabel = fileKindLabel(result.fileKind);
        if (result.success) toast.success(`"${file.name}" (${kindLabel}) erfolgreich importiert.`);
        else toast.error(`Fehler bei "${file.name}" (${kindLabel}): ${result.errors.join(", ")}`);
      } catch (err) {
        toast.error(`Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
      await importFileAt(index + 1);
    };
    await importFileAt(0);
    dispatch({ type: "set-importing", value: false });
    dispatch({ type: "set-progress", value: null });
    invalidateAll();
  }, [invalidateAll]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dispatch({ type: "set-drag-over", value: false });
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const runDelete = useCallback(async (
    performDelete: (onProgress: DeleteProgressCallback) => Promise<void>,
    successMessage: string,
  ) => {
    dispatch({ type: "set-deleting", value: true });
    try {
      await performDelete((nextProgress) => dispatch({ type: "set-delete-progress", value: nextProgress }));
      toast.success(successMessage);
    } catch (err) {
      toast.error(`Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dispatch({ type: "set-deleting", value: false });
      dispatch({ type: "set-delete-progress", value: null });
      invalidateAll();
    }
  }, [invalidateAll]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    await runDelete((onProgress) => deleteSnapshot(snapshotId, onProgress), "Snapshot gelöscht.");
  }, [runDelete]);

  const handleDeleteTechInfoImport = useCallback(async (techInfoImportId: string) => {
    await runDelete(() => deleteTechInfoImport(techInfoImportId), "Tech-Info gelöscht.");
  }, [runDelete]);

  const handleDeleteTechInfoClientImport = useCallback(async (techInfoClientImportId: string) => {
    await runDelete(() => deleteTechInfoClientImport(techInfoClientImportId), "Tech-Info Client gelöscht.");
  }, [runDelete]);

  const handleDeleteAll = useCallback(async () => {
    dispatch({ type: "set-delete-all-open", value: false });
    await runDelete((onProgress) => deleteAllData(onProgress), "Alle lokalen Daten wurden gelöscht.");
  }, [runDelete]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Uploads & Snapshots</h1>
        <div className="flex items-center gap-2">
          <Link to="/upload/diagnostics">
            <Button variant="ghost" size="sm">
              <Activity className="mr-1 h-4 w-4" />Diagnose
            </Button>
          </Link>
          <Dialog open={deleteAllOpen} onOpenChange={(open) => dispatch({ type: "set-delete-all-open", value: open })}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={deleting || importing}>
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
        <p className="mt-3 text-sm font-medium">{importing ? "Import läuft..." : "RVTools, Tech-Info Server oder Tech-Info Client XLSX-Datei hierher ziehen oder klicken"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Mehrere Dateien und wiederholte Uploads pro vCenter möglich</p>
      </label>

      {/* Progress bar during deletion */}
      {deleting && deleteProgress && (
        <Card className="animate-fade-in border-destructive/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-destructive">{deleteProgress.step}</span>
              <span className="text-muted-foreground tabular-nums">{deleteProgress.percent}%</span>
            </div>
            <Progress value={deleteProgress.percent} className="h-2" />
            {deleteProgress.detail && (
              <p className="text-xs text-muted-foreground">{deleteProgress.detail}</p>
            )}
          </CardContent>
        </Card>
      )}

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
              {lastResult.fileKind && <span className="text-xs text-muted-foreground">({fileKindLabel(lastResult.fileKind)})</span>}
            </div>
            {lastResult.sheetStats && (
              <p className="text-xs text-muted-foreground mb-2">
                {Object.keys(lastResult.sheetStats).length} {Object.keys(lastResult.sheetStats).length === 1 ? "Sheet" : "Sheets"} erkannt, {Object.values(lastResult.sheetStats).reduce((s, v) => s + v.rowCount, 0).toLocaleString("de-DE")} {Object.values(lastResult.sheetStats).reduce((s, v) => s + v.rowCount, 0) === 1 ? "Zeile" : "Zeilen"}
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
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gespeicherte Uploads ({uploads.length})</h2>
          {totalSizeBytes !== null && uploads.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">≈ {formatBytes(totalSizeBytes)} Daten in IndexedDB (geschätzt)</span>
          )}
        </div>
        {uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine RVTools- oder Tech-Info-Dateien importiert.</p>
        ) : (
          <div className="space-y-2">
            {uploads.map((upload) => {
              const isRvtools = upload.kind === "rvtools";
              const title = upload.kind === "rvtools"
                ? upload.snapshot.fileName
                : upload.kind === "tech-info"
                  ? upload.techInfo.fileName
                  : upload.techInfoClient.fileName;
              const rowCount = upload.kind === "rvtools"
                ? Object.values(upload.snapshot.sheetStats).reduce((sum, v) => sum + v.rowCount, 0)
                : upload.kind === "tech-info"
                  ? upload.techInfo.rowCount
                  : upload.techInfoClient.rowCount;
              const sheetCount = isRvtools ? Object.keys(upload.snapshot.sheetStats).length : 1;
              const sizeBytes = uploadSizes?.[upload.kind]?.[upload.id];

              return (
                <Card key={`${upload.kind}-${upload.id}`} className="group">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className={`h-5 w-5 ${isRvtools ? "text-primary" : "text-info"}`} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{title}</p>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {fileKindLabel(upload.kind)}
                          </span>
                        </div>
                        {upload.kind === "rvtools" ? (
                          <p className="text-xs text-muted-foreground">
                            vCenter: {upload.snapshot.vcenterDisplayName} · Export: {new Date(upload.snapshot.exportTs).toLocaleString("de-DE")} · Import: {new Date(upload.snapshot.importedAt).toLocaleString("de-DE")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Sheet: {upload.kind === "tech-info" ? upload.techInfo.sheetName : upload.techInfoClient.sheetName} · Import: {new Date(upload.importedAt).toLocaleString("de-DE")}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {sheetCount.toLocaleString("de-DE")} {sheetCount === 1 ? "Sheet" : "Sheets"}, {rowCount.toLocaleString("de-DE")} Zeilen
                          {sizeBytes !== undefined && <> · ≈ {formatBytes(sizeBytes)} in IndexedDB</>}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground/60 hover:text-destructive focus-visible:text-destructive transition-colors"
                      disabled={deleting || importing}
                      onClick={() => {
                        if (upload.kind === "tech-info") void handleDeleteTechInfoImport(upload.id);
                        else if (upload.kind === "tech-info-client") void handleDeleteTechInfoClientImport(upload.id);
                        else void handleDeleteSnapshot(upload.id);
                      }}
                      aria-label={isRvtools ? "Snapshot löschen" : `${fileKindLabel(upload.kind)} löschen`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadSnapshots() {
  return useUploadSnapshotsView();
}
